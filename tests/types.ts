import basicrum, { type BasicrumOptions } from "@basicrum/basicrum-astro";
import { setConsent } from "@basicrum/basicrum-astro/client";
import type { AstroIntegration } from "astro";

const options: BasicrumOptions = {
  brumSiteId: "test", beaconEndpoint: "https://example.test/beacon", loader: "consent",
};
const integration: AstroIntegration = basicrum(options);
basicrum({ ...options, loader: "non-consent" });
const applied: boolean = setConsent(true);
void integration;
void applied;
window.OPT_OUT_BASICRUM_LOADER_WRAPPER?.();
// @ts-expect-error The loader choice is required.
basicrum({ brumSiteId: "test", beaconEndpoint: "https://example.test/beacon" });
// @ts-expect-error Unsupported modes cannot silently enable collection.
basicrum({ ...options, loader: "automatic" });
// @ts-expect-error The previous immediate-loader name has been replaced.
basicrum({ ...options, loader: "standard" });
// @ts-expect-error The old siteId option has been replaced by brumSiteId.
basicrum({ siteId: "test", beaconEndpoint: options.beaconEndpoint, loader: "non-consent" });
// @ts-expect-error The old beaconUrl option has been replaced by beaconEndpoint.
basicrum({ brumSiteId: "test", beaconUrl: options.beaconEndpoint, loader: "consent" });
// @ts-expect-error A string is not a resolved consent decision.
setConsent("false");
