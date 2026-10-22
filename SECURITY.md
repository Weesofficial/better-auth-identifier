# Security policy

This plugin is a sign-in endpoint. A bug here can let someone in without a valid
password, or reveal which emails and usernames exist, so security reports get
priority over everything else.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please do **not** open a public issue.

Report it privately through GitHub:
[Report a vulnerability](https://github.com/Weesofficial/better-auth-identifier/security/advisories/new).

Useful details:

- the plugin version, Better Auth version and Node version
- your `identifier()` and `username()` options (with secrets removed)
- the request sequence that shows the problem, ideally as a failing test in the
  style of `test/identifier.test.ts`

We aim to acknowledge reports within 5 business days. Once a fix is ready we
publish a patched release and a GitHub security advisory, and credit you unless
you ask us not to.

## Scope

In scope: the `/sign-in/identifier` endpoint, including account enumeration
through error messages or timing, and any way to get a session without a valid
password.

Out of scope: vulnerabilities in Better Auth itself (report those to the Better
Auth project), and timing differences that depend on your database or password
hasher configuration.
