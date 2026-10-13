# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The top versioned
entry must match `version` in `package.json`; `npm run conventions` checks it.

## [Unreleased]

## [0.1.0] - 2026-10-13

Initial release.

### Added

- Astro 7 integration that injects a Basicrum Boomerang loader as an inline
  classic head script and self-hosts the vendored Boomerang 1.815.60 bundle
  under `/_basicrum/` with a content hash, respecting Astro's `base`.
- Required `brumSiteId`, `beaconEndpoint` and `loader` options. Loader modes
  are `"non-consent"` (immediate collection without a consent decision) and
  `"consent"` (waits for the site's consent manager).
- `setConsent()` helper exported from `@basicrum/astro/client`, plus the global
  `OPT_IN_BASICRUM_LOADER_WRAPPER` and `OPT_OUT_BASICRUM_LOADER_WRAPPER` callbacks.
- Page type from `<meta name="basicrum:page-type">`, query string stripping,
  optional first-beacon delay, and ResourceTiming and Continuity toggles.
- Framework-neutral core in `src/core/` kept apart from the Astro adapter.
- Unit tests, Playwright integration tests and end-to-end loader workflow tests
  that run the real vendored Boomerang build against built Astro fixtures.
- GitHub Actions CI, CodeQL, Dependabot, a packed-package consumer check and a
  tag-driven release workflow.
- Strict package linting with `publint`, included in `npm test`. The
  packed-consumer check and release workflow also lint their actual tarballs;
  warnings and errors block verification or release.

### Fixed

- A beacon that Boomerang had queued just before consent was withdrawn is no
  longer transmitted: consent is enforced at the final send boundary as well.
- With `waitAfterOnloadMs`, leaving the page during the delay now sends the
  pending first beacon before the unload beacon instead of losing the visit,
  and the plugin flushes explicitly whenever that beacon is still pending at
  exit. A withdrawal during the delay cancels the pending beacon and its timer.

### Changed

- Author the integration in TypeScript and publish generated JavaScript and
  declarations from `dist/`. Builds now check implementation types; tests and
  examples exercise generated code, and the packed-consumer check validates
  installed declarations and both loader modes. Public entry points and
  loader behavior are unchanged by this migration.

- Rename the required options `siteId` to `brumSiteId` and `beaconUrl` to
  `beaconEndpoint`, and the immediate loader mode `"standard"` to
  `"non-consent"`. This is a breaking configuration change: the previous
  names are rejected. The non-consent loader still starts immediately without
  a consent decision; the `"consent"` mode still waits for one.
- Registering the integration more than once now fails configuration with an
  actionable error instead of silently keeping the first registration.

[Unreleased]: https://github.com/basicrum/basicrum-astro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/basicrum/basicrum-astro/releases/tag/v0.1.0
