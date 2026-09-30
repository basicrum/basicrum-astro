import basicrum, { type BasicrumOptions } from "@basicrum/astro";
import { setConsent } from "@basicrum/astro/client";
import type { AstroIntegration } from "astro";

const options: BasicrumOptions = {
  siteId: "test", beaconUrl: "https://example.test/beacon", loader: "consent",
};
const integration: AstroIntegration = basicrum(options);
const applied: boolean = setConsent(true);
void integration;
void applied;
window.OPT_OUT_BASICRUM_LOADER_WRAPPER?.();
// @ts-expect-error The loader choice is required.
basicrum({ siteId: "test", beaconUrl: "https://example.test/beacon" });
// @ts-expect-error Unsupported modes cannot silently enable collection.
basicrum({ ...options, loader: "automatic" });
// @ts-expect-error A string is not a resolved consent decision.
setConsent("false");
