import type { NormalizedOptions } from "./options.js";
export type { BasicrumOptions, LoaderMode, NormalizedOptions } from "./options.js";

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

export interface InstallationContext {
  /** Reported as p_gen; identifies the adapter, e.g. "astro". */
  generator: string;
  /** Site base path prefixed to public URLs. Default "/". */
  base?: string;
}

export interface Installation {
  /** Public path (without base) at which the adapter must serve the bundle. */
  assetPath: string;
  /** Full public URL the bootstrap points Boomerang at. */
  boomerangUrl: string;
  /** Inline classic head script: configuration plus the selected loader. */
  bootstrap: string;
}

/** Resolve everything an adapter must emit for one installation. */
export function createInstallation(settings: NormalizedOptions, { generator, base = "/" }: InstallationContext): Installation {
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
