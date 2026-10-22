# Contributing

Thanks for helping. Bug reports, docs fixes and pull requests are all welcome.

## Setup

Node 20.19 or later.

```bash
npm install
npm run typecheck
npm test
npm run build
```

CI runs the same steps on Node 20, 22 and 24, plus the latest Better Auth and
the `release-1.6` line. A pull request has to pass all of them.

## Pull requests

- Keep each pull request to one change.
- Add or update a test for every behaviour change. Tests live in `test/`:
  - `identifier.test.ts`: end-to-end tests against a real Better Auth instance.
  - `client.test.ts`: the client plugin and its type inference.
- Add a line to the top of `CHANGELOG.md` under an `Unreleased` heading.
- Anything that lets a request through that used to be refused is breaking,
  even if it looks like a fix.

## Security-sensitive code

The endpoint in `src/index.ts` decides who gets a session. Changes there need a
test that shows both the allowed and the refused case, and the refused cases
must stay indistinguishable from each other.

If you find a way in without a valid password, report it privately as described
in [SECURITY.md](./SECURITY.md) instead of opening an issue or pull request.

## Releases

Maintainers publish by creating a GitHub release whose tag matches the
`package.json` version (for example `v0.1.0`). The release workflow re-runs the
checks and publishes to npm with provenance.
