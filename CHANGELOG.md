# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The top versioned
entry must match `version` in `package.json`; `npm run conventions` checks it.

## [Unreleased]

### Changed

- Registering the integration more than once now fails configuration with an
  actionable error instead of silently keeping the first registration.

## [0.1.0] - 2026-09-30

Initial version. Not yet published to npm.

### Added

- Astro 7 integration that injects a Basicrum Boomerang loader as an inline
  classic head script and self-hosts the vendored Boomerang 1.815.60 bundle
  under `/_basicrum/` with a content hash, respecting Astro's `base`.
- Required `loader` option with `"standard"` (immediate collection) and
  `"consent"` (waits for the site's consent manager) modes.
- `setConsent()` helper exported from `@basicrum/astro/client`, plus the global
  `OPT_IN_BASICRUM_LOADER_WRAPPER` and `OPT_OUT_BASICRUM_LOADER_WRAPPER` callbacks.
- Page type from `<meta name="basicrum:page-type">`, query string stripping,
  optional first-beacon delay, and ResourceTiming and Continuity toggles.
- Framework-neutral core in `src/core/` kept apart from the Astro adapter.
- Unit tests, Playwright integration tests and end-to-end loader workflow tests
  that run the real vendored Boomerang build against built Astro fixtures.
- GitHub Actions CI, CodeQL, Dependabot, a packed-package consumer check and a
  tag-driven release workflow.

[Unreleased]: https://github.com/basicrum/basicrum-astro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/basicrum/basicrum-astro/releases/tag/v0.1.0
