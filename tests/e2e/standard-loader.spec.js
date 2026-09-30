import { expect, test } from "@playwright/test";
import { SITE_ID, createSiteHarness } from "./fixtures/browser.js";

test.describe("standard loader", () => {
  test("loads Boomerang immediately and sends the page-load beacon", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "standard");

    await site.visit();
    await site.waitForBeacon();

    expect(site.bundleRequestCount()).toBe(1);
    expect(await site.state()).toMatchObject({
      boomerangVersion: "1.815.60",
      configured: true,
      consentCallbacks: [],
    });
    expect(site.beacons[0]).toMatchObject({
      brum_site_id: SITE_ID,
      p_gen: "astro",
      p_type: "home",
    });
    expect(site.pageErrors()).toEqual([]);
    expect(site.unexpectedRequests()).toEqual([]);
  });

  test("measures every full page load with that page's type", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "standard");

    await site.visit();
    await site.waitForBeacon(1);
    await page.getByRole("link", { name: "Next page" }).click();
    await site.waitForBeacon(2);

    expect(site.beacons.map((beacon) => beacon.p_type)).toEqual(["home", "article"]);
    expect(site.pageErrors()).toEqual([]);
  });

  test("does not report query strings to the collector", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "standard");

    await site.visit("?campaign=spring&email=visitor%40example.test");
    await site.waitForBeacon();

    expect(site.beacons[0].u).not.toContain("campaign");
    expect(site.beacons[0].u).not.toContain("email");
    expect(site.unexpectedRequests()).toEqual([]);
  });
});
