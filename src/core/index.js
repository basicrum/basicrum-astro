/**
 * Framework-neutral core of the Basicrum Boomerang installation.
 *
 * Everything an adapter needs is exported from here. Adapters (Astro today)
 * import only this module and ./consent.js, so this directory plus vendor/
 * can move to its own package without touching adapter logic.
 * See ./README.md for the split checklist.
 */
import { boomerangAssetPath, readLoaderSource } from "./assets.js";
import { createBootstrap } from "./bootstrap.js";

export {
  ASSET_ROUTE_PREFIX,
  BOOMERANG_BUNDLE_PATH,
  BOOMERANG_VERSION,
  LOADERS,
  boomerangAssetFilename,
  boomerangAssetPath,
  boomerangBundleHash,
  boomerangBundleUrl,
  loaderPath,
  readBoomerangBundle,
  readLoaderSource,
} from "./assets.js";
export { createBootstrap, serialize } from "./bootstrap.js";
export { setConsent } from "./consent.js";
export { normalizeOptions } from "./options.js";

/**
 * Resolve everything an adapter must emit for one installation.
 * @param {object} settings Output of normalizeOptions().
 * @param {object} context
 * @param {string} context.generator Reported as p_gen, e.g. "astro".
 * @param {string} [context.base] Site base path prefixed to public URLs. Default "/".
 * @returns {{ assetPath: string, boomerangUrl: string, bootstrap: string }}
 */
export function createInstallation(settings, { generator, base = "/" }) {
  const assetPath = boomerangAssetPath();
  const boomerangUrl = `${String(base).replace(/\/$/, "")}${assetPath}`;
  const bootstrap = createBootstrap({
    settings,
    boomerangUrl,
    loaderSource: readLoaderSource(settings.loader, settings.debug),
    generator,
  });
  return { assetPath, boomerangUrl, bootstrap };
}
