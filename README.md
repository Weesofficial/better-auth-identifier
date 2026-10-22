# better-auth-identifier

[![npm version](https://img.shields.io/npm/v/better-auth-identifier)](https://www.npmjs.com/package/better-auth-identifier)
[![npm downloads](https://img.shields.io/npm/dm/better-auth-identifier)](https://www.npmjs.com/package/better-auth-identifier)
[![CI](https://github.com/Weesofficial/better-auth-identifier/actions/workflows/ci.yml/badge.svg)](https://github.com/Weesofficial/better-auth-identifier/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Sign in with an email **or** a username in one field, for [Better Auth](https://better-auth.com).

Better Auth's `username` plugin gives you `/sign-in/username` and core gives you `/sign-in/email`, so a single "email or username" login box needs you to guess which endpoint to call. This plugin adds `/sign-in/identifier`, which works out which one the user typed.

## Install

```bash
npm install better-auth-identifier
```

Requires Better Auth `>=1.6.0` and Node `>=20.19`. It pairs with the built-in `username` plugin, which must be installed too.

## Quick start

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { identifier } from "better-auth-identifier";

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  plugins: [username(), identifier()],
});

// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { identifierClient } from "better-auth-identifier/client";

export const authClient = createAuthClient({ plugins: [usernameClient(), identifierClient()] });

await authClient.signIn.identifier({ identifier: "ada@example.com", password });
await authClient.signIn.identifier({ identifier: "ada_l", password });
```

Run your usual database migration after adding `username()`; this plugin adds no tables or columns of its own.

## How lookup works

1. The identifier is trimmed. Empty is rejected (`400 IDENTIFIER_REQUIRED`), longer than 320 characters is rejected (`400 IDENTIFIER_TOO_LONG`).
2. If it contains `@`, the user is looked up by email, lowercased, as `/sign-in/email` does.
3. Otherwise it is looked up by `username`, normalized the same way the `username` plugin normalizes it (lowercase by default, or the plugin's `usernameNormalization`).
4. From here it behaves like `/sign-in/email`: the credential account's password is verified, `requireEmailVerification` is respected (`403 EMAIL_NOT_VERIFIED`, and the verification email is sent when `emailVerification.sendOnSignIn` is set), a session is created and the cookie set. The response is `{ redirect, token, url, user }`.

A username cannot contain `@` under the `username` plugin's default validator, so the two cases do not overlap. If you loosen that validator to allow `@`, those users can only sign in with their email here.

The `username` plugin's `usernameValidator` is not applied at sign-in; a value that is not a valid username simply finds no user.

## Security notes

- A wrong password, an unknown email, an unknown username and a user without a credential account all return the same `401 INVALID_EMAIL_OR_PASSWORD` with the same body. The endpoint never says which part was wrong.
- When there is no user (or no password to check), a dummy password hash runs, as Better Auth does, so that path costs about the same as a real verification. This removes the obvious timing gap; it does not promise constant time, and the tests only check that the two paths are within the same order of magnitude.
- The endpoint is rate limited (default 3 requests per 10 seconds) using Better Auth's rate limiter, so Better Auth's own `rateLimit` settings apply: it is off in development unless you enable it, and you should configure `advanced.ipAddress` correctly behind a proxy.
- `/sign-in/identifier` is not covered by the `twoFactor` plugin's hook, which only watches `/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number`. To avoid a second-factor bypass the plugin refuses to start when `twoFactor` is installed.
- If you offer `/sign-in/email` or `/sign-in/username` as well, those endpoints keep their own behaviour (for example `/sign-in/email` answers `400` for a malformed email); only `/sign-in/identifier` hides it.

Misconfiguration (no `username` plugin, or `twoFactor` present) throws when Better Auth initialises, which is on its first request or `await auth.$context`, not when `betterAuth()` returns.

## Options

```ts
identifier({ usernameNormalization, rateLimit })
```

| Option | Type | Default | |
| --- | --- | --- | --- |
| `usernameNormalization` | `((username: string) => string) \| false` | the `username` plugin's setting, else lowercase | Applied to a non-email identifier before the lookup. Set it only if you need it to differ from the `username` plugin. |
| `rateLimit` | `{ window: number; max: number }` | `{ window: 10, max: 3 }` | Seconds and request count for `/sign-in/identifier`. |

Error codes are exported as `ERROR_CODES` and typed on the client: `INVALID_EMAIL_OR_PASSWORD`, `IDENTIFIER_REQUIRED`, `IDENTIFIER_TOO_LONG`, `PASSWORD_TOO_LONG`, `EMAIL_NOT_VERIFIED`, `EMAIL_PASSWORD_DISABLED`, `FAILED_TO_CREATE_SESSION`.

## Compatibility

The test suite runs on Node 20, 22 and 24 against the Better Auth version in the lockfile, the latest release, and the `release-1.6` line. It depends on `zod` ^4, which Better Auth also uses.

## License

MIT
