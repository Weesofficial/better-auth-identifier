import type { BetterAuthClientPlugin } from "better-auth/client";
import { ERROR_CODES } from "./error-codes.js";
import type { identifier } from "./index.js";

type IdentifierServerPlugin = ReturnType<typeof identifier>;

export type { IdentifierErrorCode } from "./error-codes.js";

/**
 * Client counterpart to {@link identifier}. Adds
 * `authClient.signIn.identifier({ identifier, password })` and refreshes the
 * session atom after a successful sign-in.
 *
 * @example
 * ```ts
 * import { createAuthClient } from "better-auth/client";
 * import { identifierClient } from "better-auth-identifier/client";
 *
 * export const authClient = createAuthClient({ plugins: [identifierClient()] });
 * ```
 */
export const identifierClient = () => {
  return {
    id: "identifier",
    $InferServerPlugin: {} as IdentifierServerPlugin,
    atomListeners: [{ matcher: (path) => path === "/sign-in/identifier", signal: "$sessionSignal" }],
    $ERROR_CODES: ERROR_CODES,
  } satisfies BetterAuthClientPlugin;
};

export type IdentifierClientPlugin = ReturnType<typeof identifierClient>;
