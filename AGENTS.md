# Basicrum Astro Integration

`@basicrum/astro` is an Astro 7 integration for Basicrum real user monitoring.
It injects one of the two Basicrum Boomerang loaders as an inline classic head
script and serves the vendored Boomerang bundle from `/_basicrum/`.

## Structure

- `src/index.js` is the Astro adapter: it reads Astro's `base` and `command`,
  injects the prerendered asset route (`src/boomerang-endpoint.js`) and the head
  script. `src/client.js` is the browser entry re-exporting `setConsent()`.
- `src/core/` is framework-neutral: `options.js` validates options,
  `bootstrap.js` generates the head script, `assets.js` is the only module that
  knows the Boomerang version and vendored file names, `consent.js` applies a
  consent decision. Adapters import only `src/core/index.js` and
  `src/core/consent.js`. Unit tests enforce the boundary in both directions;
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
- Upgrade the vendored Boomerang build and loaders together with
  `vendor/provenance.json`, `THIRD-PARTY-NOTICES.md` and `BOOMERANG_VERSION`
  in `src/core/assets.js`. The unit, browser and end-to-end tests assert the
  literal version as well. Run the consent withdrawal tests before releasing.
- Tests never send beacons to a real collector. Fixtures use the intercepted
  host `collector.basicrum.test`; the example uses `collector.example.invalid`.
- `loader` stays required with no implicit consent default. There is no
  `scriptUrl` override: the loaders and the `basicRumBoomerangConfig` contract
  ship together.
- `enabled` defaults to true for builds and false for `astro dev`.
- A second `basicrum()` registration fails `astro:config:setup`; there is no
  order-dependent winner.
- The bootstrap is serialized from `configure()` in `src/core/bootstrap.js`
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
npm run test:unit
npm run test:browser
npm run verify:package
```

`npm test` runs the first five checks and the browser tests. `npm run
verify:package` packs the package, installs the tarball into a temporary Astro
consumer and builds it with a non-root base; it needs network access. CI runs
all of them on every push to `main` and on every pull request.

## Releases

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new
   `## [X.Y.Z] - YYYY-MM-DD` heading and update the comparison links.
2. Run `npm version X.Y.Z --no-git-tag-version` to update `package.json` and
   `package-lock.json`, then `npm run conventions`.
3. Commit, tag with `git tag -a vX.Y.Z -m "Basicrum Astro vX.Y.Z"`, and push
   `main` and the tag.
4. The Release workflow refuses a tag whose commit is not on `main`, verifies
   the tag against the version, runs every check,
   attaches the npm tarball and its SHA-256 to a GitHub Release, and publishes
   to npm only when the `NPM_TOKEN` repository secret exists. Verification and
   packaging run in a job without secrets; only the separate publish job, bound
   to the `release` environment, receives the npm credential, and only in its
   publish step. Add required reviewers or deployment branch rules to that
   environment in the repository settings to gate publication. Do not create
   the GitHub Release or publish manually.
