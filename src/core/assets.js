import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Vendored asset catalogue. This module is the only place that knows the
 * Boomerang version, the loader filenames and where they live on disk.
 * Adapters must never reach into vendor/ directly.
 */
export const BOOMERANG_VERSION = "1.815.60";

/** Vendor-relative paths, matching the keys in vendor/provenance.json. */
export const BOOMERANG_BUNDLE_PATH = `vendor/boomerang/boomerang-${BOOMERANG_VERSION}.cutting-edge.min.js`;

export const LOADERS = Object.freeze({
  standard: "boomerang-loader-v15",
  consent: "consent-boomerang-loader-v1-15",
});

/** Public URL prefix under which adapters serve the Boomerang bundle. */
export const ASSET_ROUTE_PREFIX = "/_basicrum";

const vendorRoot = new URL("../../vendor/", import.meta.url);

/** Absolute file URL of the vendored Boomerang bundle. */
export const boomerangBundleUrl = new URL(BOOMERANG_BUNDLE_PATH.replace(/^vendor\//, ""), vendorRoot);

/** @returns {Buffer} The raw Boomerang bundle bytes. */
export function readBoomerangBundle() {
  return readFileSync(boomerangBundleUrl);
}

let cachedHash;

/** First 12 hex characters of the bundle's SHA-256, for content-addressed URLs. */
export function boomerangBundleHash() {
  cachedHash ??= createHash("sha256").update(readBoomerangBundle()).digest("hex").slice(0, 12);
  return cachedHash;
}

/** Content-hashed public filename, e.g. boomerang-1.815.60.0123abcd4567.js */
export function boomerangAssetFilename() {
  return `boomerang-${BOOMERANG_VERSION}.${boomerangBundleHash()}.js`;
}

/** Public path (before any base prefix) at which the bundle must be served. */
export function boomerangAssetPath() {
  return `${ASSET_ROUTE_PREFIX}/${boomerangAssetFilename()}`;
}

/** Vendor-relative path of the selected loader file. */
export function loaderPath(loader, debug = false) {
  if (!(loader in LOADERS)) throw new TypeError(`[basicrum] Unknown loader: ${loader}.`);
  return `vendor/loaders/${LOADERS[loader]}${debug ? "" : ".min"}.js`;
}

/** @returns {string} Classic-script source of the selected loader. */
export function readLoaderSource(loader, debug = false) {
  return readFileSync(new URL(loaderPath(loader, debug).replace(/^vendor\//, ""), vendorRoot), "utf8");
}
