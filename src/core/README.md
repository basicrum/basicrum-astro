# Core (framework-neutral)

Everything in this directory, plus the top-level `vendor/` directory, is
independent of Astro. Together they are the future `@basicrum/boomerang-core`
package. Nothing here may import `astro`, Vite-specific syntax, or files
outside `src/core/` and `vendor/`. A unit test enforces both directions of
that boundary.

| File | Role |
| --- | --- |
| `index.js` | Public entry for build-time code. Adapters import only this. |
| `consent.js` | Browser-safe entry: `setConsent()`. No Node imports. |
| `options.js` | Validation and defaults for user options. |
| `bootstrap.js` | Generates the inline classic head script. |
| `assets.js` | Knows the Boomerang version, loader files and content hash (see the endpoint exception below). |

An adapter does three things:

1. `normalizeOptions(userOptions)` at configuration time so typos fail early.
2. `createInstallation(settings, { generator, base })` to get the head script
   and the public path where the bundle must be served.
3. Serve the bundle bytes at that path with immutable caching.

## The endpoint exception

`src/boomerang-endpoint.js` names the bundle file literally in its `?raw`
import, because Vite needs a static specifier. That is the one place outside
`assets.js` that repeats the vendored file name; the unit test "the endpoint
serves the same bundle file the core catalogue names" keeps the two in sync.
Keep that test whenever the import moves.

## Splitting into its own package

The package name below is a placeholder; decide it first.

1. Create the core package and move `src/core/` and `vendor/` (including
   `provenance.json` and the Boomerang licence) into it, together with the
   Boomerang and loader sections of `THIRD-PARTY-NOTICES.md`. Give it an
   `exports` map with `"."` (`index.js` and `index.d.ts`), `"./consent"`
   (`consent.js` and `consent.d.ts`) and `"./vendor/*"`, and a `files` list
   with the source, `vendor/` and the notices.
2. Move `tests/unit/core.test.js` and `tools/verify-boomerang-provenance.sh`
   with it; both reference `vendor/` and `src/core/assets.js`. Copy
   `tests/unit/helpers/module-graph.js` and `tools/verify-ascii.sh`, which
   both packages need.
3. In this package, add the core package as an exact-pinned regular
   dependency (not a peer dependency: sites must not have to install it) and
   change the import sites:
   - `src/index.js`: `./core/index.js` becomes the package name.
   - `src/client.js` and `src/client.d.ts`: `./core/consent.js` becomes the
     package's `/consent` export.
   - `src/index.d.ts`: the type re-export becomes the package name.
   - `src/boomerang-endpoint.js`: the `?raw` import becomes the package's
     `/vendor/boomerang/<file>?raw` export.
4. Update the adapter tests in `tests/unit/integration.test.js`: import
   `BOOMERANG_BUNDLE_PATH` and `readLoaderSource` from the package, make the
   boundary test accept the package specifiers instead of resolved local
   paths, and keep the endpoint synchronization check against the package's
   `BOOMERANG_BUNDLE_PATH`.
5. Update `tools/verify-package.mjs` (it imports the core for the expected
   asset name), drop `vendor` from this package's `files`, remove the
   provenance script from the `conventions` script, and revise the package
   layout table in `README.md` and the structure section in `AGENTS.md`.
6. Run `npm run verify:package` against the published core package before
   tagging: the packed consumer must still emit the bundle byte for byte.
