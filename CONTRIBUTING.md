# Contributing to Basicrum for Astro

Thank you for improving Basicrum. Contributions should preserve the explicit
loader choice, the consent behavior proven by the browser tests, and the
provenance of the vendored Boomerang build.

## Before starting

- Search existing issues and pull requests before opening a duplicate.
- Use a public issue for ordinary defects and proposals.
- Follow [SECURITY.md](SECURITY.md) for suspected vulnerabilities.
- Keep changes focused and explain any change in what the integration emits
  into a site's pages.

## Local setup

Node.js 22.12 or later is required.

```bash
npm ci
npx playwright install chromium
```

## Source and conventions

The Astro adapter is `src/index.js`, `src/client.js` and
`src/boomerang-endpoint.js`. Everything under `src/core/` and `vendor/` is
framework-neutral; the adapter imports the core only through
`src/core/index.js` and `src/core/consent.js`, and unit tests fail when either
side crosses that boundary. Read [`src/core/README.md`](src/core/README.md)
before moving code across it.

Follow the permanent conventions in [AGENTS.md](AGENTS.md): ASCII-only text,
exactly pinned development dependencies and GitHub Actions, synchronized
version metadata, vendored assets updated together with their provenance, and
tests that never contact a real collector.

When changing options, keep validation in `src/core/options.js`, the types in
`src/core/index.d.ts`, the README configuration table, the tests and the
changelog synchronized.

## Verification

Run the checks proportionate to the change. At minimum:

```bash
npm run conventions
npm run typecheck
npm run lint
npm run test:unit
```

Run `npm run test:browser` for any change to the bootstrap, loaders, consent
behavior or the asset route. Changes that affect packaged files or dependencies
must also pass:

```bash
npm run verify:package
```

`npm test` runs everything except the packed-package check.

## Pull requests

- Describe the problem, the chosen behavior, and the verification performed.
- Add or update tests for behavior changes and regressions.
- Add a line under `Unreleased` in `CHANGELOG.md` for user-visible changes.
- Do not include generated output, local configuration, dependencies, or
  ignored files.
- Do not advance the package version outside a release.
