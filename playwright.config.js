import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  use: { browserName: "chromium", trace: "retain-on-failure" },
  projects: [
    // Detailed integration coverage: SSR, dev server, ClientRouter, races.
    { name: "browser", testDir: "./tests/browser" },
    // Readable end-to-end workflows for each loader, like the WordPress plugin.
    { name: "e2e", testDir: "./tests/e2e" },
  ],
  webServer: {
    command: "node tests/serve-fixtures.js",
    url: "http://127.0.0.1:43217/",
    timeout: 120000,
    reuseExistingServer: false,
    env: { ASTRO_TELEMETRY_DISABLED: "1" },
  },
});
