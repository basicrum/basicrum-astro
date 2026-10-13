# Basicrum for Astro

[![CI](https://github.com/basicrum/basicrum-astro/actions/workflows/ci.yml/badge.svg)](https://github.com/basicrum/basicrum-astro/actions/workflows/ci.yml)
[![CodeQL](https://github.com/basicrum/basicrum-astro/actions/workflows/codeql.yml/badge.svg)](https://github.com/basicrum/basicrum-astro/actions/workflows/codeql.yml)

An Astro integration that installs the existing Basicrum Boomerang loaders and
self-hosts the matching Boomerang bundle. Choose either immediate collection or
collection controlled by your site's consent manager.

This package targets Astro 7 and Node.js 22.12 or later.

## Install

From your Astro site's directory:

```sh
npm install @basicrum/basicrum-astro
```

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import basicrum from "@basicrum/basicrum-astro";

export default defineConfig({
  integrations: [
    basicrum({
      brumSiteId: "YOUR_BASICRUM_SITE_ID",
      beaconEndpoint: "https://YOUR_COLLECTOR/beacon/catcher",
      loader: "non-consent",
    }),
  ],
});
```

Use your actual collector URL and public site identifier. Both become visible in
the rendered page. Remove the previous Basicrum/Boomerang bootstrap when adopting
this integration. Include this integration only once: a second registration,
for example from a shared preset, fails configuration with an error instead
of letting registration order pick the loader. No layout component is required.

### Migrating from the former package name

Starting with version 0.1.2, the package is named `@basicrum/basicrum-astro`.
If your site uses `@basicrum/astro`, replace the dependency:

```sh
npm uninstall @basicrum/astro
npm install @basicrum/basicrum-astro
```

Update imports in your Astro configuration and consent code to
`@basicrum/basicrum-astro` and `@basicrum/basicrum-astro/client` respectively.
Keep the same options and one `basicrum()` registration. Registering both
package names fails configuration, including when a shared preset uses the old
name. The loader behavior and MIT license are unchanged.

## Two loader modes

The `loader` option is required. There is no implicit consent choice.

| Value | Packaged loader | Behavior |
| --- | --- | --- |
| `"non-consent"` | `boomerang-loader-v15.min.js` | Starts loading Boomerang immediately; no consent decision is required. |
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
import { setConsent } from "@basicrum/basicrum-astro/client";

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
integration is disabled, or when the non-consent loader is selected. It does not
queue an early decision. The global callback types are included when importing
`@basicrum/basicrum-astro/client`.

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
| `brumSiteId` | Required | Public identifier sent as `brum_site_id`. |
| `beaconEndpoint` | Required | Absolute HTTP(S) collector URL, without credentials or a fragment. |
| `loader` | Required | `"non-consent"` or `"consent"`. |
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

## Releases

Versions follow Semantic Versioning and are recorded in [CHANGELOG.md](./CHANGELOG.md).

## Contributing and security

For local setup, examples, testing and release instructions, see
[CONTRIBUTING.md](./CONTRIBUTING.md). Report suspected vulnerabilities privately
according to [SECURITY.md](./SECURITY.md), not through a public issue.

Basicrum-owned code is available under the
[MIT License](./LICENSE). The vendored Boomerang build and original loader
snippet retain their BSD license; see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## References

- [Astro integration script injection](https://docs.astro.build/en/reference/integrations-reference/#injectscript-option)
- [Astro injected routes](https://docs.astro.build/en/reference/integrations-reference/#injectroute-option)
- [Astro navigation lifecycle](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events)
- [Licenses and vendored source](./THIRD-PARTY-NOTICES.md)
