# Basicrum for Astro

[![CI](https://github.com/basicrum/basicrum-astro/actions/workflows/ci.yml/badge.svg)](https://github.com/basicrum/basicrum-astro/actions/workflows/ci.yml)
[![CodeQL](https://github.com/basicrum/basicrum-astro/actions/workflows/codeql.yml/badge.svg)](https://github.com/basicrum/basicrum-astro/actions/workflows/codeql.yml)

An Astro integration that installs the existing Basicrum Boomerang loaders and
self-hosts the matching Boomerang bundle. Choose either immediate collection or
collection controlled by your site's consent manager.

This package currently targets Astro 7 and Node.js 22.12 or later. The source
lives on GitHub; it has not been published to npm yet.

## Install locally

From your Astro site's directory:

```sh
npm install /absolute/path/to/basicrum-astro
```

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import basicrum from "@basicrum/astro";

export default defineConfig({
  integrations: [
    basicrum({
      siteId: "YOUR_BASICRUM_SITE_ID",
      beaconUrl: "https://YOUR_COLLECTOR/beacon/catcher",
      loader: "standard",
    }),
  ],
});
```

Use your actual collector URL and public site identifier. Both become visible in
the rendered page. Remove the previous Basicrum/Boomerang bootstrap when adopting
this integration. Include this integration only once: a second registration,
for example from a shared preset, fails configuration with an error instead
of letting registration order pick the loader. No layout component is required.

## Two loader modes

The `loader` option is required. There is no implicit consent choice.

| Value | Packaged loader | Behavior |
| --- | --- | --- |
| `"standard"` | `boomerang-loader-v15.min.js` | Starts loading Boomerang immediately. |
| `"consent"` | `consent-boomerang-loader-v1-15.min.js` | Defines consent callbacks and waits for permission. |

Only the selected loader is inserted. Its classic JavaScript runs in the page
head, after configuration and before Astro islands. Boomerang itself remains a
separate same-origin asset under `/_basicrum/`, with a content hash in its filename.
Astro's `base` setting is respected. The package does not copy files into your
site's `public` directory or require the WordPress repository at runtime.

## Consent manager integration

Select `loader: "consent"`, then connect your consent manager's resolved analytics
decision to the helper:

```js
import { setConsent } from "@basicrum/astro/client";

// In your consent manager's initial-state and change callbacks:
setConsent(true);  // Permission granted.
setConsent(false); // Denied, expired, or withdrawn.
```

These are alternative calls for the corresponding decision, not a sequence to
execute together. The same callbacks are available to a consent manager that
cannot import JavaScript modules:

```js
window.OPT_IN_BASICRUM_LOADER_WRAPPER();
window.OPT_OUT_BASICRUM_LOADER_WRAPPER();
```

Run callbacks after the head loader has executed. A normal Astro module script
runs after that loader. `setConsent()` returns `false` on the server, when the
integration is disabled, or when the standard loader is selected. It does not
queue an early decision. The global callback types are included when importing
`@basicrum/astro/client`.

The external consent manager owns persistence and must apply the saved decision
on every full page load. This integration does not provide a consent banner or
store a separate consent flag.

- Before permission, the consent loader does not request Boomerang or send beacons.
- Denial before the first grant still permits a later grant on the same page.
- Withdrawal disables the initialized instance, drops any beacon Boomerang had
  already queued but not yet sent, and removes the loader's `RT` and `BA` cookies. A download already in progress can finish, but the bundle will not
  initialize from the cleared configuration.
- After loading has started and permission is withdrawn, granting again requires
  a **full page reload**. An Astro client-side swap is not a reload. Store the new
  choice in the consent manager before reloading, then replay it on the next page.
- Requests already sent before withdrawal cannot be recalled.

The wrapper and Boomerang initialization contract are shipped together. There is
deliberately no arbitrary `scriptUrl` override: another build that reads
`RUM_CONFIG` rather than `basicRumBoomerangConfig` does not have the same consent
withdrawal behavior.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `siteId` | Required | Public identifier sent as `brum_site_id`. |
| `beaconUrl` | Required | Absolute HTTP(S) collector URL, without credentials or a fragment. |
| `loader` | Required | `"standard"` or `"consent"`. |
| `enabled` | Builds: `true`; dev: `false` | Enable or disable injection and the asset route. |
| `debug` | `false` | Include the unminified loader. |
| `pageType` | `"page"` | Fallback value of `p_type`. |
| `stripQueryString` | `true` | Enable the bundled Boomerang URL query stripping. |
| `waitAfterOnloadMs` | `0` | Delay the first beacon after load, or after initialization when consent arrives late. Leaving during the delay sends it at once. |
| `resourceTiming` | `true` | Enable the ResourceTiming plugin. |
| `continuity` | `true` | Enable the Continuity plugin. |

Unknown options and invalid types fail during configuration. Set `enabled: true`
explicitly to test collection with `astro dev`; configure a test collector first.
A production build also contains monitoring when served in a local preview unless
you build with `enabled: false`.

With a positive `waitAfterOnloadMs`, Boomerang holds every beacon back until the
first one is sent. When the visitor leaves while the first beacon is still
pending, during the delay or right after it, that beacon is sent on `pagehide`
before the regular unload beacon, so short visits are still measured. A withdrawal during the delay cancels the pending beacon.

Known limitations of the bundled build, with or without a delay:

- A visitor who leaves before the `load` event produces no beacon. The bundled
  Continuity plugin completes only at page ready, so Boomerang withholds the
  abandoned-page beacon.
- A page that is hidden and then discarded without a `pagehide` event loses a
  pending delayed beacon.
- Restoration from the back-forward cache is not covered by the tests.

The generated configuration sets `p_gen: "astro"`, disables XHR instrumentation,
and retains the WordPress defaults for secure, SameSite=Strict cookies. These are
not cookieless modes. Query stripping is the existing Boomerang implementation,
not a guarantee that arbitrary custom data or URL paths contain no personal data.

For a page-specific type, put metadata in the page or shared layout:

```astro
<meta name="basicrum:page-type" content="home" />
```

The value is read before a beacon, so the integration can appear earlier than the
metadata in the document head.

## Navigation and deployment support

The shipped WordPress Boomerang build measures **full document loads**. It does
not include the `SPA`, `History`, or `AutoXHR` plugins. This version does not claim
to measure Astro `ClientRouter` navigations. The singleton guard prevents duplicate
loading and preserves withdrawn consent during a swap, but it does not create
route timings or reset document-scoped measurements.

Use normal full-page navigation for monitored pages. On a site using
`ClientRouter`, `data-astro-reload` can opt individual links out of client routing.
For comprehensive soft-navigation monitoring, a compatible SPA-enabled Basicrum
build and Astro lifecycle adapter are still needed. In particular, do not replace
Sam James's current SPA-enabled `RUM_CONFIG` bundle with this one and expect to
retain its existing route tracking, goals, or custom dimensions.

Both static output and server-rendered pages use a prerendered Boomerang endpoint.
Static hosts control their own cache headers; configure long-lived caching for
the content-hashed `/_basicrum/` assets where supported.

The bootstrap is an inline classic script. A restrictive Content Security Policy
must permit its hash and the same-origin dynamically loaded Boomerang script, plus
the collector in `connect-src`/`img-src` as applicable. The upstream loader also
has an iframe fallback. Astro's `injectScript()` does not expose custom script
attributes, so disable Cloudflare Rocket Loader for these pages if it rewrites
script ordering. Do not move the loader into Partytown or defer it until island
hydration.

## Development

```sh
npm ci
npx playwright install chromium
npm test
npm run verify:package
npm run example:build
npm run example:dev
```

`npm test` runs the repository conventions (`npm run conventions`: ASCII-only
text, version metadata, Boomerang provenance), the TypeScript declaration check,
ESLint, the unit tests and the browser tests. Browser tests build local Astro
fixtures with the real packaged Boomerang build and intercept all collector
traffic; they never submit measurements to a production collector.
`npm run verify:package` packs the package, installs the tarball into a
temporary Astro consumer and builds it with a non-root base; it needs network
access. Repository invariants and the release procedure are in
[AGENTS.md](./AGENTS.md).

Browser tests are two Playwright projects:

- `npm run test:e2e` runs `tests/e2e/`: one readable workflow spec per loader,
  in the style of the WordPress plugin's loader specs. `standard-loader.spec.js`
  shows immediate collection and per-page types; `consent-loader.spec.js` walks
  through inert start, denial, grant, withdrawal, reload and replaying the
  stored decision on the next page. Start here to understand what the
  integration does.
- `npm run test:integration` runs `tests/browser/`: SSR, dev server,
  `ClientRouter` swaps, the delayed beacon, download races, forced bootstrap
  replay, and unload beacons captured by a local collector.

The example is disabled until both `BASICRUM_SITE_ID` and `BASICRUM_BEACON_URL` are
set in the process environment. Its consent buttons are demonstration controls,
not a production consent manager.

### Package layout

The source is split along the line where a future package boundary would go:

| Path | Depends on | Purpose |
| --- | --- | --- |
| `src/core/` + `vendor/` | Node only | Options, bootstrap script, asset catalogue, consent helper, Boomerang and loaders. No Astro imports. |
| `src/index.js` | `src/core/index.js`, Astro | The integration: reads Astro's base and command, injects the route and head script. |
| `src/client.js` | `src/core/consent.js` | Browser entry re-exporting `setConsent()`. |
| `src/boomerang-endpoint.js` | Vite `?raw` | Astro route serving the bundle. |

Adapter files import the core only through `src/core/index.js` and
`src/core/consent.js`. Unit tests parse every import, re-export and dynamic
import in JavaScript files, scan declaration files for their import forms,
and fail if either side crosses the boundary.
`tests/unit/core.test.js` covers the core and `tests/unit/integration.test.js`
covers the Astro adapter. Read [`src/core/README.md`](./src/core/README.md)
for the checklist to extract the core into `@basicrum/boomerang-core`.

The `vendor/` files are copied unchanged from the WordPress plugin. Their origin
and SHA-256 digests are recorded in `vendor/provenance.json`. Update those files,
the manifest, notices, and versioned asset references together when upgrading;
run the consent withdrawal tests before releasing.

## Releases

Versions follow Semantic Versioning and are recorded in [CHANGELOG.md](./CHANGELOG.md).
A release is a `vX.Y.Z` tag on `main` whose version matches `package.json`.
Pushing the tag runs the Release workflow: it verifies the version, runs every
check including the packed-consumer build, attaches the npm tarball and its
SHA-256 to a GitHub Release, and publishes to npm only when the `NPM_TOKEN`
repository secret is configured.

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report
suspected vulnerabilities privately according to [SECURITY.md](./SECURITY.md),
not through a public issue.

Basicrum-owned code is available under the
[GNU General Public License version 2 or later](./LICENSE). The vendored
Boomerang build retains its BSD license; see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## References

- [Astro integration script injection](https://docs.astro.build/en/reference/integrations-reference/#injectscript-option)
- [Astro injected routes](https://docs.astro.build/en/reference/integrations-reference/#injectroute-option)
- [Astro navigation lifecycle](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events)
- [Licenses and vendored source](./THIRD-PARTY-NOTICES.md)
