/** Apply the consent manager's decision. False means the consent loader is unavailable. */
export function setConsent(granted: boolean): boolean;

declare global {
  interface Window {
    OPT_IN_BASICRUM_LOADER_WRAPPER?: () => void;
    OPT_OUT_BASICRUM_LOADER_WRAPPER?: () => void;
  }
}
