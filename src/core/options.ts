export type LoaderMode = "non-consent" | "consent";

export interface BasicrumOptions {
  /** Public Basicrum site identifier. Included in beacons as brum_site_id. */
  brumSiteId: string;
  /** Absolute HTTP(S) collector URL. Never put a secret in this URL. */
  beaconEndpoint: string;
  /** Required: non-consent loads without a consent decision; consent waits for the external consent tool. */
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
  readonly brumSiteId: string;
  readonly beaconEndpoint: string;
  readonly loader: LoaderMode;
  readonly enabled: boolean | undefined;
  readonly debug: boolean;
  readonly pageType: string;
  readonly stripQueryString: boolean;
  readonly waitAfterOnloadMs: number;
  readonly resourceTiming: boolean;
  readonly continuity: boolean;
}

const allowedOptions = new Set([
  "brumSiteId", "beaconEndpoint", "loader", "enabled", "debug", "pageType",
  "stripQueryString", "waitAfterOnloadMs", "resourceTiming", "continuity",
]);

/** Validate on the server so a typo cannot silently change collection behavior. */
export function normalizeOptions(options: BasicrumOptions): NormalizedOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("[basicrum] Options are required.");
  }
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      throw new TypeError(`[basicrum] Unknown option: ${key}.`);
    }
  }
  for (const key of ["brumSiteId", "beaconEndpoint"] as const) {
    if (typeof options[key] !== "string" || !options[key].trim()) {
      throw new TypeError(`[basicrum] ${key} must be a non-empty string.`);
    }
  }
  if (options.loader !== "non-consent" && options.loader !== "consent") {
    throw new TypeError('[basicrum] Choose loader: "non-consent" or "consent" explicitly.');
  }
  let beaconEndpoint;
  try {
    beaconEndpoint = new URL(options.beaconEndpoint);
  } catch {
    throw new TypeError("[basicrum] beaconEndpoint must be an absolute HTTP(S) URL.");
  }
  if (!['https:', 'http:'].includes(beaconEndpoint.protocol) ||
      beaconEndpoint.username || beaconEndpoint.password || beaconEndpoint.hash) {
    throw new TypeError("[basicrum] beaconEndpoint must use HTTP(S), without credentials or a fragment.");
  }
  for (const key of ["enabled", "debug", "stripQueryString", "resourceTiming", "continuity"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") {
      throw new TypeError(`[basicrum] ${key} must be a boolean.`);
    }
  }
  if (options.pageType !== undefined &&
      (typeof options.pageType !== "string" || !options.pageType.trim())) {
    throw new TypeError("[basicrum] pageType must be a non-empty string.");
  }
  const waitAfterOnloadMs = options.waitAfterOnloadMs ?? 0;
  if (!Number.isInteger(waitAfterOnloadMs) || waitAfterOnloadMs < 0 || waitAfterOnloadMs > 2147483647) {
    throw new TypeError("[basicrum] waitAfterOnloadMs must be an integer from 0 to 2147483647.");
  }
  return Object.freeze({
    brumSiteId: options.brumSiteId.trim(),
    beaconEndpoint: beaconEndpoint.href,
    loader: options.loader,
    enabled: options.enabled,
    debug: options.debug ?? false,
    pageType: options.pageType ?? "page",
    stripQueryString: options.stripQueryString ?? true,
    waitAfterOnloadMs,
    resourceTiming: options.resourceTiming ?? true,
    continuity: options.continuity ?? true,
  });
}
