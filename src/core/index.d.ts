export type LoaderMode = "standard" | "consent";

export interface BasicrumOptions {
  /** Public Basicrum site identifier. Included in beacons as brum_site_id. */
  siteId: string;
  /** Absolute HTTP(S) collector URL. Never put a secret in this URL. */
  beaconUrl: string;
  /** Required: standard loads immediately; consent waits for the external consent tool. */
  loader: LoaderMode;
  /** Adapter-specific default (Astro: true for builds, false for astro dev). */
  enabled?: boolean;
  /** Use the unminified loader. Default: false. */
  debug?: boolean;
  /** Fallback p_type, overridden by <meta name="basicrum:page-type" content="...">. */
  pageType?: string;
  /** Strip query strings from URLs handled by the bundled Boomerang implementation. Default: true. */
  stripQueryString?: boolean;
  /** Delay collection's first beacon after load (or after late consent). Default: 0. */
  waitAfterOnloadMs?: number;
  /** Enable Boomerang ResourceTiming. Default: true. */
  resourceTiming?: boolean;
  /** Enable Boomerang Continuity. Default: true. */
  continuity?: boolean;
}

/** Validated, defaulted, frozen options. `enabled` stays undefined when not set. */
export interface NormalizedOptions {
  readonly siteId: string;
  readonly beaconUrl: string;
  readonly loader: LoaderMode;
  readonly enabled: boolean | undefined;
  readonly debug: boolean;
  readonly pageType: string;
  readonly stripQueryString: boolean;
  readonly waitAfterOnloadMs: number;
  readonly resourceTiming: boolean;
  readonly continuity: boolean;
}

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

export const BOOMERANG_VERSION: string;
export const BOOMERANG_BUNDLE_PATH: string;
export const ASSET_ROUTE_PREFIX: string;
export const LOADERS: Readonly<Record<LoaderMode, string>>;
export const boomerangBundleUrl: URL;

export function normalizeOptions(options: BasicrumOptions): NormalizedOptions;
export function createInstallation(settings: NormalizedOptions, context: InstallationContext): Installation;
export function createBootstrap(input: {
  settings: NormalizedOptions;
  boomerangUrl: string;
  loaderSource: string;
  generator: string;
}): string;
export function serialize(value: unknown): string;
export function readBoomerangBundle(): Buffer;
export function boomerangBundleHash(): string;
export function boomerangAssetFilename(): string;
export function boomerangAssetPath(): string;
export function loaderPath(loader: LoaderMode, debug?: boolean): string;
export function readLoaderSource(loader: LoaderMode, debug?: boolean): string;

export { setConsent } from "./consent.js";
