/**
 * Call after the consent manager has resolved the visitor's analytics choice.
 * Returns false outside the browser or when the consent loader is unavailable.
 * This helper does not store consent or reload the page.
 * @param {boolean} granted
 * @returns {boolean}
 */
export function setConsent(granted) {
  if (typeof granted !== "boolean") {
    throw new TypeError("[basicrum] Consent must be a boolean.");
  }
  if (typeof window === "undefined") return false;
  const callback = granted
    ? window.OPT_IN_BASICRUM_LOADER_WRAPPER
    : window.OPT_OUT_BASICRUM_LOADER_WRAPPER;
  if (typeof callback !== "function") return false;
  callback();
  return true;
}
