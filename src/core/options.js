const allowedOptions = new Set([
  "siteId", "beaconUrl", "loader", "enabled", "debug", "pageType",
  "stripQueryString", "waitAfterOnloadMs", "resourceTiming", "continuity",
]);

/** Validate on the server so a typo cannot silently change collection behavior. */
export function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("[basicrum] Options are required.");
  }
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      throw new TypeError(`[basicrum] Unknown option: ${key}.`);
    }
  }
  for (const key of ["siteId", "beaconUrl"]) {
    if (typeof options[key] !== "string" || !options[key].trim()) {
      throw new TypeError(`[basicrum] ${key} must be a non-empty string.`);
    }
  }
  if (options.loader !== "standard" && options.loader !== "consent") {
    throw new TypeError('[basicrum] Choose loader: "standard" or "consent" explicitly.');
  }
  let beaconUrl;
  try {
    beaconUrl = new URL(options.beaconUrl);
  } catch {
    throw new TypeError("[basicrum] beaconUrl must be an absolute HTTP(S) URL.");
  }
  if (!['https:', 'http:'].includes(beaconUrl.protocol) ||
      beaconUrl.username || beaconUrl.password || beaconUrl.hash) {
    throw new TypeError("[basicrum] beaconUrl must use HTTP(S), without credentials or a fragment.");
  }
  for (const key of ["enabled", "debug", "stripQueryString", "resourceTiming", "continuity"]) {
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
    siteId: options.siteId.trim(),
    beaconUrl: beaconUrl.href,
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
