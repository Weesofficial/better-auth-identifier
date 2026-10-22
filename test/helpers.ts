import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { username } from "better-auth/plugins";
import { identifier, type IdentifierOptions } from "../src/index.js";

export const PASSWORD = "correct-horse-battery";

/** A real Better Auth instance with `username()` and `identifier()` over the memory adapter. */
export function setup({
  options = {},
  auth: authOverrides = {},
  plugins,
}: {
  options?: IdentifierOptions;
  auth?: Partial<BetterAuthOptions>;
  plugins?: BetterAuthPlugin[];
} = {}) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    secret: "test-secret-0123456789-abcdefghijklmnop",
    baseURL: "http://localhost:3000",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    plugins: plugins ?? [username(), identifier(options)],
    ...authOverrides,
  });
  return { auth, db };
}

type Auth = ReturnType<typeof setup>["auth"];

export async function signUp(auth: Auth, email = "ada@example.com", name = "ada_l") {
  return auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Ada", username: name } as never });
}

export function post(auth: Auth, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/identifier", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    }),
  );
}
