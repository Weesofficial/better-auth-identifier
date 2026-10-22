import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import {
  APIError,
  createAuthEndpoint,
  createEmailVerificationToken,
  formCsrfMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { parseUserOutput } from "better-auth/db";
import { ERROR_CODES } from "./error-codes.js";

export { ERROR_CODES } from "./error-codes.js";
export type { IdentifierErrorCode } from "./error-codes.js";

/** Longest valid email address (RFC 5321). Anything longer is rejected before a lookup. */
export const MAX_IDENTIFIER_LENGTH = 320;

export interface IdentifierOptions {
  /**
   * Normalizes a username before the lookup. Mirrors the `username` plugin's
   * option of the same name; `false` leaves it untouched.
   *
   * When omitted, the `username` plugin's own `usernameNormalization` is used,
   * so the two never disagree. If that is not set either, usernames are
   * lowercased.
   */
  usernameNormalization?: ((username: string) => string) | false;
  /** Rate limit for `/sign-in/identifier`. Defaults to 3 requests per 10 seconds, like `/sign-in/email`. */
  rateLimit?: { window: number; max: number };
}

const PATH = "/sign-in/identifier";

const invalid = () => APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);

type UserWithUsername = Parameters<typeof parseUserOutput>[1] & { id: string; email: string; emailVerified: boolean };

/**
 * Sign in with an email address or a username in one field.
 *
 * Needs Better Auth's `username` plugin (it provides the `username` column) and
 * `emailAndPassword.enabled`.
 */
export const identifier = (options: IdentifierOptions = {}) => {
  const rateLimit = options.rateLimit ?? { window: 10, max: 3 };

  return {
    id: "identifier",
    init(ctx) {
      const plugins = (ctx.options.plugins ?? []) as { id: string; options?: Record<string, unknown> }[];
      const usernamePlugin = plugins.find((p) => p.id === "username");
      if (!usernamePlugin) {
        throw new Error(
          "better-auth-identifier: the `username` plugin is required (it adds the `username` column). Add `username()` from \"better-auth/plugins\" to `plugins`.",
        );
      }
      // `/sign-in/identifier` is not one of the paths Better Auth's two-factor
      // hook watches, so a 2FA user would get a full session without a second
      // factor. Refuse to start rather than open that bypass.
      if (plugins.some((p) => p.id === "two-factor")) {
        throw new Error(
          "better-auth-identifier: not compatible with the `twoFactor` plugin. Its hook only intercepts /sign-in/email, /sign-in/username and /sign-in/phone-number, so this endpoint would skip the second factor.",
        );
      }
    },
    endpoints: {
      signInIdentifier: createAuthEndpoint(
        PATH,
        {
          method: "POST",
          use: [formCsrfMiddleware],
          body: z.object({
            identifier: z.string().meta({ description: "Email address or username" }),
            password: z.string().meta({ description: "Password of the user" }),
            callbackURL: z
              .string()
              .meta({ description: "Callback URL used as the redirect for email verification and for possible redirects" })
              .optional(),
            rememberMe: z
              .boolean()
              .meta({ description: "If this is false, the session will not be remembered. Default is `true`." })
              .optional(),
          }),
          metadata: {
            allowedMediaTypes: ["application/x-www-form-urlencoded", "application/json"],
            openapi: {
              operationId: "signInIdentifier",
              description: "Sign in with an email address or a username and a password",
            },
          },
        },
        async (ctx) => {
          if (!ctx.context.options?.emailAndPassword?.enabled) {
            ctx.context.logger.error("better-auth-identifier needs `emailAndPassword.enabled: true`.");
            throw APIError.from("BAD_REQUEST", ERROR_CODES.EMAIL_PASSWORD_DISABLED);
          }

          const raw = ctx.body.identifier.trim();
          if (!raw) throw APIError.from("BAD_REQUEST", ERROR_CODES.IDENTIFIER_REQUIRED);
          if (raw.length > MAX_IDENTIFIER_LENGTH) throw APIError.from("BAD_REQUEST", ERROR_CODES.IDENTIFIER_TOO_LONG);
          const { password } = ctx.body;
          if (password.length > ctx.context.password.config.maxPasswordLength) {
            throw APIError.from("BAD_REQUEST", ERROR_CODES.PASSWORD_TOO_LONG);
          }

          let user: UserWithUsername | null;
          if (raw.includes("@")) {
            user = (await ctx.context.internalAdapter.findUserByEmail(raw.toLowerCase()))?.user ?? null;
          } else {
            const usernamePlugin = (ctx.context.options.plugins as { id: string; options?: Record<string, unknown> }[]).find(
              (p) => p.id === "username",
            );
            const normalization =
              options.usernameNormalization ??
              (usernamePlugin?.options?.usernameNormalization as IdentifierOptions["usernameNormalization"]);
            const username =
              normalization === false ? raw : normalization ? normalization(raw) : raw.toLowerCase();
            user = await ctx.context.adapter.findOne<UserWithUsername>({
              model: "user",
              where: [{ field: "username", value: username }],
            });
          }

          const account = user ? await ctx.context.internalAdapter.findCredentialAccount(user.id) : null;
          const hash = account?.password;
          if (!user || !hash) {
            // Same cost as a real verification, so a missing user is not faster.
            await ctx.context.password.hash(password);
            ctx.context.logger.warn("User or credential account not found");
            throw invalid();
          }
          if (!(await ctx.context.password.verify({ hash, password }))) {
            ctx.context.logger.warn("Invalid password");
            throw invalid();
          }

          if (ctx.context.options.emailAndPassword.requireEmailVerification && !user.emailVerified) {
            const { emailVerification } = ctx.context.options;
            if (!emailVerification?.sendVerificationEmail) {
              throw APIError.from("FORBIDDEN", ERROR_CODES.EMAIL_NOT_VERIFIED);
            }
            if (emailVerification.sendOnSignIn) {
              const token = await createEmailVerificationToken(
                ctx.context.secret,
                user.email,
                undefined,
                emailVerification.expiresIn,
              );
              const callbackURL = encodeURIComponent(ctx.body.callbackURL || "/");
              const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
              await ctx.context.runInBackgroundOrAwait(
                emailVerification.sendVerificationEmail({ user, url, token }, ctx.request),
              );
            }
            throw APIError.from("FORBIDDEN", ERROR_CODES.EMAIL_NOT_VERIFIED);
          }

          const dontRememberMe = ctx.body.rememberMe === false;
          const session = await ctx.context.internalAdapter.createSession(user.id, dontRememberMe);
          if (!session) {
            ctx.context.logger.error("Failed to create session");
            throw APIError.from("UNAUTHORIZED", ERROR_CODES.FAILED_TO_CREATE_SESSION);
          }
          await setSessionCookie(ctx, { session, user }, dontRememberMe);
          if (ctx.body.callbackURL) ctx.setHeader("Location", ctx.body.callbackURL);
          return ctx.json({
            redirect: !!ctx.body.callbackURL,
            token: session.token,
            url: ctx.body.callbackURL,
            user: parseUserOutput(ctx.context.options, user),
          });
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path === PATH, ...rateLimit }],
    $ERROR_CODES: ERROR_CODES,
  } satisfies BetterAuthPlugin;
};
