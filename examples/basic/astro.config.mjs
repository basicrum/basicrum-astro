import { defineConfig } from "astro/config";
import basicrum from "@basicrum/basicrum-astro";

export default defineConfig({
  integrations: [basicrum({
    brumSiteId: process.env.BASICRUM_SITE_ID || "example-site",
    beaconEndpoint: process.env.BASICRUM_BEACON_URL || "https://collector.example.invalid/beacon",
    loader: "consent", // Change to "non-consent" to load immediately.
    // Keep this runnable example inert until you configure a real collector.
    enabled: Boolean(process.env.BASICRUM_SITE_ID && process.env.BASICRUM_BEACON_URL),
  })],
});
