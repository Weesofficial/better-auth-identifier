# Changelog

## 0.1.0

First release.

- `identifier()` server plugin: `POST /sign-in/identifier` takes `{ identifier, password, rememberMe?, callbackURL? }`.
  An identifier containing `@` is looked up as an email, anything else as a username.
- Same behaviour as `/sign-in/email`: password check against the credential account,
  `requireEmailVerification` (403 plus the verification email when `sendOnSignIn` is set),
  session and cookie creation, same response shape.
- Unknown user, missing credential account and wrong password return the identical
  `401 INVALID_EMAIL_OR_PASSWORD`; a dummy password hash runs when there is no user.
- Rate limit of 3 requests per 10 seconds, configurable with the `rateLimit` option.
- Empty identifiers and identifiers over 320 characters are rejected before any lookup.
- `usernameNormalization` option; defaults to the `username` plugin's setting, then to lowercase.
- Fails at startup without the `username` plugin, and with the `twoFactor` plugin (its hook
  does not cover this endpoint).
- `identifierClient()` from `better-auth-identifier/client` adds `authClient.signIn.identifier()`.
