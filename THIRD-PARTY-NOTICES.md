# Third-party notices and shared assets

Basicrum integration code and the Basicrum loader wrappers are distributed under
GPL-2.0-or-later. See `LICENSE`.

## Basicrum loaders

The standard and consent loaders in `vendor/loaders/` are copied without changes
from `basicrum-wordpress/plugins/basicrum/assets/js/loaders/`, at WordPress commit
`0940a1fb27f3e199d35696f0add9561c8c73c880`. Both readable and minified variants are
included. SHA-256 digests are recorded in `vendor/provenance.json`.

## Boomerang 1.815.60

- File: `vendor/boomerang/boomerang-1.815.60.cutting-edge.min.js`.
- Upstream project: [Akamai Boomerang](https://github.com/akamai/boomerang).
- Basicrum fork: [basicrum/boomerang](https://github.com/basicrum/boomerang).
- Source commit: `ead2783a33a2ce91205fe34f8fc992433faba9a2`.
- License: BSD; the full notice is in `vendor/boomerang/LICENSE.txt`.
- SHA-256: `90e8a1c85949b10d43e441efc3f0545f95e4384e26ee3042344a8b2b4110589c`.

The bundle is identical to the WordPress plugin's shipped file. Its banner stamps
the parent commit `564759ed70de7801bb64de5e2025fb6ac049ff5f`; the WordPress provenance
notes identify the final source as `ead2783a`. The documented reproducible build
uses Node 12, the committed dependency lockfile, and
`grunt clean build --build-flavor=cutting-edge --build-number=815`.

The fork includes Basicrum's configuration bootstrap and changes to the metric
plugins. Its BSD license remains applicable; it is not relicensed under the
integration's GPL license.
