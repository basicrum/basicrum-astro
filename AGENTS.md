# Basicrum Astro Integration

`@basicrum/basicrum-astro` is an Astro 7 integration for Basicrum real user monitoring.
It injects one of the two Basicrum Boomerang loaders as an inline classic head
script and serves the vendored Boomerang bundle from `/_basicrum/`.

## Structure

- Implementation source is TypeScript in `src/`. `npm run build` uses `tsc`
  to generate JavaScript and declarations in `dist/`, preserving module paths
  and function names. `dist/` is ignored by Git and is the published code.
  `npm ci` and `npm pack` build it through the `prepare` lifecycle. Tests and
  examples consume the generated code. `src/env.d.ts` only declares Vite's
  `?raw` imports; public API declarations are generated, never hand-edited.
- `src/index.ts` is the Astro adapter: it reads Astro's `base` and `command`,
  injects the prerendered asset route (`src/boomerang-endpoint.ts`) and the head
  script. `src/client.ts` is the browser entry re-exporting `setConsent()`.
- `src/core/` is framework-neutral: `options.ts` validates options,
  `bootstrap.ts` generates the head script, `assets.ts` is the only core module
  that knows the Boomerang version and vendored file names (the Astro endpoint
  repeats the bundle name in its static `?raw` import, which a unit test keeps
  in sync), `consent.ts` applies a consent decision. Adapters import only
  `src/core/index.ts` and `src/core/consent.ts`. Unit tests enforce the boundary in both directions;
  `src/core/README.md` holds the checklist for extracting the core into its own
  package.
- `vendor/` holds the loaders and the Boomerang build, copied unchanged from
  the WordPress plugin. `vendor/provenance.json` records the source commit and
  SHA-256 digests.
- Tests: `tests/unit/` (Node test runner), `tests/browser/` (Playwright
  integration: SSR, dev server, `ClientRouter`, races), `tests/e2e/` (readable
  per-loader workflows). `tests/serve-fixtures.js` builds the fixture site into
  `.test-output/` and serves it on ports 43211 to 43221, with a local
  collector on 43218 for tests that need unload traffic.
- `docs/reviews/` holds dated review records. Each starts with a status list;
  update it when a finding is fixed.

## Conventions

- Tracked text files are plain ASCII: hyphens instead of dashes, straight
  quotes, words instead of arrows. `tools/verify-ascii.sh` enforces it.
- Pin development dependencies to exact versions. Pin GitHub Actions to full
  40-character commit SHAs with the reviewed tag in the adjacent comment, and
  update pins through reviewed Dependabot pull requests.
- Keep `version` in `package.json` and `package-lock.json` and the top
  `CHANGELOG.md` entry identical. Release tags use the `v<version>` form.
- Never modify the vendored Boomerang build or the loaders. Behaviour that
  the integration needs lives in the bootstrap's own plugins or in the
  adapter; `vendor/` changes only by copying a newer WordPress release.
- Upgrade the vendored Boomerang build and loaders together with
  `vendor/provenance.json`, `THIRD-PARTY-NOTICES.md` and `BOOMERANG_VERSION`
  in `src/core/assets.ts`. The unit, browser and end-to-end tests assert the
  literal version as well. Run the consent withdrawal tests before releasing.
- Tests never send beacons to a real collector. Fixtures use the intercepted
  host `collector.basicrum.test`; the example uses `collector.example.invalid`.
- Required public options are `brumSiteId`, `beaconEndpoint` and `loader`.
  Loader modes are `"non-consent"` (immediate collection without a consent
  decision) and `"consent"` (waits for the site's consent manager).
- `loader` stays required with no implicit consent default. There is no
  `scriptUrl` override: the loaders and the `basicRumBoomerangConfig` contract
  ship together.
- `enabled` defaults to true for builds and false for `astro dev`.
- A second `basicrum()` registration fails `astro:config:setup`; there is no
  order-dependent winner. The former `@basicrum/astro` integration name also
  counts, so mixing old and new packages fails configuration.
- The bootstrap is serialized from `configure()` in `src/core/bootstrap.ts`
  and runs as a classic script: keep it free of module syntax, keep the
  generator name (`p_gen`) a parameter, and never restore configuration that a
  consent withdrawal cleared.
- Documentation states behavior the tests prove. When a claim in the README
  changes, change or add the test that proves it.

## Checks

```bash
npm ci
npx playwright install chromium
npm run conventions
npm run typecheck
npm run lint
npm run lint:package
npm run test:unit
npm run test:browser
npm run verify:package
```

`npm test` builds the package, checks conventions, types, source lint and strict
package lint, and runs the unit and browser tests. `npm run lint:package`
builds before checking npm's published file selection with `publint`; warnings
are errors. `npm run verify:package` packs and strictly lints the exact tarball,
installs the tarball into a temporary Astro
consumer, checks the installed declarations and builds both loader modes with
a non-root base; it needs network access. CI runs all of them on every push to
`main` and on every pull request.

## Releases

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new
   `## [X.Y.Z] - YYYY-MM-DD` heading and update the comparison links.
2. Run `npm version X.Y.Z --no-git-tag-version` to update `package.json` and
   `package-lock.json`, then `npm run conventions`.
3. Commit, tag with `git tag -a vX.Y.Z -m "Basicrum Astro vX.Y.Z"`, and push
   `main` and the tag.
4. The Release workflow refuses a tag whose commit is not on `main`, verifies
   the tag against the version, runs every check,
   strictly lints the final release tarball before calculating its SHA-256,
   attaches both to a GitHub Release, and publishes
   to npm only when the `NPM_TOKEN` repository secret exists. Verification and
   packaging run in a job without secrets; only the separate publish job, bound
   to the `release` environment, receives the npm credential, and only in its
   publish step. Add required reviewers or deployment branch rules to that
   environment in the repository settings to gate publication. Do not create
   the GitHub Release or publish manually.
   The 0.1.2 publish step also deprecates the former `@basicrum/astro` versions
   through 0.1.1 after the renamed package is published.
