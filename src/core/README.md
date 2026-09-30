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
| `assets.js` | Knows the Boomerang version, loader files and content hash. |

An adapter does three things:

1. `normalizeOptions(userOptions)` at configuration time so typos fail early.
2. `createInstallation(settings, { generator, base })` to get the head script
   and the public path where the bundle must be served.
3. Serve the bundle bytes at that path with immutable caching.

## Splitting into its own package

1. Move `src/core/` and `vendor/` (including `provenance.json` and the
   Boomerang licence) into the new package. Its `exports` map should expose
   `"."` (`index.js`), `"./consent"` (`consent.js`) and `"./vendor/*"`.
2. Move `tests/unit/core.test.js` with it.
3. In this package, change the three import sites:
   - `src/index.js`: `./core/index.js` becomes `@basicrum/boomerang-core`
   - `src/client.js` and `src/client.d.ts`: `./core/consent.js` becomes `@basicrum/boomerang-core/consent`
   - `src/boomerang-endpoint.js`: the `?raw` import path becomes `@basicrum/boomerang-core/vendor/boomerang/...`
   - `src/index.d.ts`: the type re-export becomes `@basicrum/boomerang-core`
4. Delete `vendor` from this package's `files` list and drop the vendor
   provenance test from `tests/unit/integration.test.js` if it moved.
