import { expect } from "@playwright/test";

/** Built Astro fixtures served by tests/serve-fixtures.js (base path /metrics/). */
export const SITES = {
  standard: "http://127.0.0.1:43211/metrics/",
  consent: "http://127.0.0.1:43212/metrics/",
};

export const SITE_ID = "astro-test-site";
export const COLLECTOR_HOST = "collector.basicrum.test";
const MEASUREMENT_COOKIES = ["RT", "BA"];

/**
 * Drive one built site with the real packaged Boomerang. Collector traffic is
 * intercepted and recorded; every other third-party request is blocked.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').BrowserContext} context
 * @param {"standard" | "consent"} loader
 */
export async function createSiteHarness(page, context, loader) {
  const site = SITES[loader];
  const beacons = [], pageErrors = [], unexpectedRequests = [];
  let bundleRequests = 0;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/_basicrum/boomerang-")) bundleRequests += 1;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === COLLECTOR_HOST) {
      beacons.push(Object.fromEntries(new URLSearchParams(request.postData() || url.search)));
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
    } else if (url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      unexpectedRequests.push(url.href);
      await route.abort("blockedbyclient");
    }
  });

  return {
    beacons,
    /** Full page load of a path below the site base, e.g. "" or "next/". */
    async visit(path = "") {
      const response = await page.goto(new URL(path, site).href);
      expect(response.ok()).toBe(true);
    },
    async reload() {
      await page.reload();
    },
    /** The consent manager's decision, as a site would apply it through setConsent(). */
    async grant() { await page.getByRole("button", { name: "Grant", exact: true }).click(); },
    async deny() { await page.getByRole("button", { name: "Deny", exact: true }).click(); },
    /** The same decision through the global callbacks, for pages without buttons. */
    async grantByCallback() { await page.evaluate(() => window.OPT_IN_BASICRUM_LOADER_WRAPPER()); },
    async denyByCallback() { await page.evaluate(() => window.OPT_OUT_BASICRUM_LOADER_WRAPPER()); },
    async waitForBeacon(count = 1) {
      await expect.poll(() => beacons.length).toBeGreaterThanOrEqual(count);
    },
    async settle(ms = 300) {
      await page.waitForTimeout(ms);
    },
    async state() {
      return page.evaluate(() => ({
        boomerangVersion: window.BOOMR && window.BOOMR.version,
        configured: Boolean(window.basicRumBoomerangConfig),
        consentCallbacks: Object.keys(window)
          .filter((name) => name.endsWith("_BASICRUM_LOADER_WRAPPER") && typeof window[name] === "function")
          .sort(),
      }));
    },
    async measurementCookies() {
      return (await context.cookies()).filter((cookie) => MEASUREMENT_COOKIES.includes(cookie.name)).map((cookie) => cookie.name).sort();
    },
    /** Boomerang cannot set its own cookies on 127.0.0.1, so seed them as a positive control. */
    async seedMeasurementCookies() {
      await page.evaluate(() => {
        document.cookie = "RT=seeded; path=/; SameSite=Strict";
        document.cookie = "BA=seeded; path=/; SameSite=Strict";
      });
    },
    /** Run the emitted head bootstrap again, as a framework re-evaluating head scripts would. */
    async replayBootstrap() {
      const content = await page.evaluate(() => [...document.scripts]
        .find((script) => !script.src && script.textContent.includes("basicRumBoomerangConfig"))?.textContent);
      expect(content).toBeTruthy();
      await page.addScriptTag({ content });
    },
    bundleRequestCount: () => bundleRequests,
    pageErrors: () => [...pageErrors],
    unexpectedRequests: () => [...unexpectedRequests],
  };
}
