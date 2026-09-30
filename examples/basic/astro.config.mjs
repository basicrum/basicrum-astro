import { defineConfig } from "astro/config";
import basicrum from "../../src/index.js";

export default defineConfig({
  integrations: [basicrum({
    siteId: process.env.BASICRUM_SITE_ID || "example-site",
    beaconUrl: process.env.BASICRUM_BEACON_URL || "https://collector.example.invalid/beacon",
    loader: "consent", // Change to "standard" to load immediately.
    // Keep this runnable example inert until you configure a real collector.
    enabled: Boolean(process.env.BASICRUM_SITE_ID && process.env.BASICRUM_BEACON_URL),
  })],
});
