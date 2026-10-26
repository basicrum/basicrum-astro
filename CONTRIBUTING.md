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

The repository's pinned Astro version requires Node.js 22.23.4 or later.
Use the latest Node.js 22 patch (`nvm install` and `nvm use` read `.nvmrc`),
or Node.js 24. CI and release jobs check for the latest patch instead of relying
on the runner's cached Node.js version. Clone the repository and install
dependencies:

```bash
git clone https://github.com/basicrum/basicrum-astro.git
cd basicrum-astro
npm ci
npx playwright install chromium
```

Run the commands below from the repository root unless stated otherwise.

### Example site

Start the example with `npm run example:dev`, or build it with
`npm run example:build`.

The example is disabled until both `BASICRUM_SITE_ID` and `BASICRUM_BEACON_URL`
are set in the process environment. Use a test collector. Its consent buttons
are demonstration controls, not a production consent manager.

### Trying a local checkout in another Astro site

After installing this repository's dependencies, run the following from the
Astro site's directory:

```bash
npm install /absolute/path/to/basicrum-astro
```

Rebuild with `npm run build` in this repository after editing source files.
Configure the integration as described in the [README](README.md). Collection
with `astro dev` requires an explicit `enabled: true` and a test collector.

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
The published package contains `dist/` and `vendor/`, plus the package metadata,
README and license notices. `src/env.d.ts` only declares Vite's `?raw` imports;
public API declarations are generated from the implementation.

The bootstrap's serialized function must remain self-contained and ES5 syntax
compatible after compilation. Do not introduce runtime imports or compiler
helpers into it, or bundle/minify it without updating the regression checks.

TypeScript stays on 6.0.3 while the installed typescript-eslint supports versions
below 6.1.0. Upgrade them together to a supported combination, including the
build scripts and tests that use the compiler API. Keep `@types/node` on the
Node.js 22 line to match the oldest supported runtime in `.nvmrc`.
Dependabot skips major updates for these two packages; revisit those rules when
the compiler tooling or minimum Node.js version changes.

Follow the permanent conventions in [AGENTS.md](AGENTS.md): ASCII-only text,
exactly pinned development dependencies and GitHub Actions, synchronized
version metadata, vendored assets updated together with their provenance, and
tests that never contact a real collector.

The `vendor/` files are copied unchanged from the WordPress plugin. Their origin
and SHA-256 digests are recorded in `vendor/provenance.json`. Update the files,
manifest, notices and versioned asset references together when upgrading, then
run the consent withdrawal tests before releasing.

When changing options, keep validation and types in `src/core/options.ts`, the
README configuration table, the tests and the changelog synchronized.

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
the exact tarball, installs it into a temporary Astro consumer, checks the
installed declarations and builds both loader modes with a non-root base.
It needs network access.

`npm test` includes package linting and all the checks above except the
installed-consumer check (`npm run verify:package`).

Browser tests build local Astro fixtures with the real packaged Boomerang
bundle. Collector traffic is intercepted or captured by a local test server;
tests never submit measurements to a production collector.

The two Playwright projects can also run separately:

- `npm run test:e2e` runs `tests/e2e/`: readable workflows for immediate
  collection, per-page types, consent grant, denial, withdrawal and replaying
  a saved decision after a full page load.
- `npm run test:integration` runs `tests/browser/`: SSR, the dev server,
  `ClientRouter` swaps, delayed beacons, download races, bootstrap replay and
  unload traffic.

Unit tests in `tests/unit/core.test.js` and `tests/unit/integration.test.js`
cover the core and Astro adapter, including the boundary between them.

## Pull requests

- Describe the problem, the chosen behavior, and the verification performed.
- Add or update tests for behavior changes and regressions.
- Add a line under `Unreleased` in `CHANGELOG.md` for user-visible changes.
- Do not include generated output, local configuration, dependencies, or
  ignored files.
- Do not advance the package version outside a release.

## Releases

Follow the release procedure in [AGENTS.md](AGENTS.md#releases). A release is a
`vX.Y.Z` tag on `main` whose version matches `package.json` and the changelog.
Pushing the tag runs the Release workflow, which verifies the version, runs
every check, attaches the npm tarball and its SHA-256 to a GitHub Release, and
publishes to npm when the `NPM_TOKEN` repository secret is configured.

Do not create the GitHub Release or publish manually.
