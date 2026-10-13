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

The Astro adapter is `src/index.ts`, `src/client.ts` and
`src/boomerang-endpoint.ts`. Everything under `src/core/` and `vendor/` is
framework-neutral; the adapter imports the core only through
`src/core/index.ts` and `src/core/consent.ts`, and unit tests fail when either
side crosses that boundary. Read [`src/core/README.md`](src/core/README.md)
before moving code across it.

Write implementation and public types in TypeScript. `npm run build` cleans
`dist/` and emits JavaScript and declarations with `tsc`; do not edit generated
files. Imports within source use `.js` extensions to match the emitted ESM.
The `prepare` lifecycle builds on `npm ci` and `npm pack`. Unit tests, browser
fixtures and examples use that output; their commands rebuild it when needed.
The bootstrap's serialized function must remain self-contained and ES5 syntax
compatible after compilation. Do not introduce runtime imports or compiler
helpers into it, or bundle/minify it without updating the regression checks.

TypeScript is pinned to 6.0.3 while typescript-eslint 8.71.0 supports versions
below 6.1.0. Upgrade them together to a supported combination.

Follow the permanent conventions in [AGENTS.md](AGENTS.md): ASCII-only text,
exactly pinned development dependencies and GitHub Actions, synchronized
version metadata, vendored assets updated together with their provenance, and
tests that never contact a real collector.

When changing options, keep validation and types in `src/core/options.ts`, the README configuration table, the tests and the
changelog synchronized.

## Verification

Run the checks proportionate to the change. At minimum:

```bash
npm run conventions
npm run typecheck
npm run lint
npm run lint:package
npm run test:unit
```

Run `npm run test:browser` for any change to the bootstrap, loaders, consent
behavior or the asset route. Changes that affect packaged files or dependencies
must also pass:

```bash
npm run verify:package
```

`npm run lint:package` builds and checks npm's published file selection with
strict `publint`; warnings fail the check. `npm run verify:package` also lints
the exact tarball that it installs and builds in the temporary consumer.

`npm test` includes package linting and all the checks above except the
installed-consumer check (`npm run verify:package`).

## Pull requests

- Describe the problem, the chosen behavior, and the verification performed.
- Add or update tests for behavior changes and regressions.
- Add a line under `Unreleased` in `CHANGELOG.md` for user-visible changes.
- Do not include generated output, local configuration, dependencies, or
  ignored files.
- Do not advance the package version outside a release.
