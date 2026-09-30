import { expect, test } from "@playwright/test";
import { SITE_ID, createSiteHarness } from "./fixtures/browser.js";

test.describe("consent loader", () => {
  test("exposes only the opt-in and opt-out callbacks and stays inert until a decision", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.settle();

    expect(await site.state()).toMatchObject({
      boomerangVersion: undefined,
      configured: true,
      consentCallbacks: ["OPT_IN_BASICRUM_LOADER_WRAPPER", "OPT_OUT_BASICRUM_LOADER_WRAPPER"],
    });
    expect(site.bundleRequestCount()).toBe(0);
    expect(site.beacons).toEqual([]);
    expect(await site.measurementCookies()).toEqual([]);
    expect(site.unexpectedRequests()).toEqual([]);
  });

  test("denial keeps the page silent", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.deny();
    await site.settle();

    expect(site.bundleRequestCount()).toBe(0);
    expect(site.beacons).toEqual([]);
    expect(await site.measurementCookies()).toEqual([]);
    expect(site.pageErrors()).toEqual([]);
  });

  test("grant loads Boomerang exactly once and sends the page-load beacon", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.grant();
    await site.waitForBeacon();
    await site.grant();
    await site.settle();

    expect(site.bundleRequestCount()).toBe(1);
    expect(await site.state()).toMatchObject({ boomerangVersion: "1.815.60", configured: true });
    expect(site.beacons).toHaveLength(1);
    expect(site.beacons[0]).toMatchObject({ brum_site_id: SITE_ID, p_gen: "astro", p_type: "home" });
    expect(site.pageErrors()).toEqual([]);
    expect(site.unexpectedRequests()).toEqual([]);
  });

  test("denial before the first grant still permits a later grant on the same page", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.deny();
    await site.settle();
    expect(site.bundleRequestCount()).toBe(0);

    await site.grant();
    await site.waitForBeacon();

    expect(site.bundleRequestCount()).toBe(1);
    expect(site.beacons[0]).toMatchObject({ p_type: "home" });
    expect(site.pageErrors()).toEqual([]);
  });

  test("withdrawal after loading stops measurement, clears cookies, and needs a reload to re-grant", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.grant();
    await site.waitForBeacon();

    await site.deny();
    await site.grant();
    await site.settle();

    expect(await site.state()).toMatchObject({ boomerangVersion: "1.815.60", configured: false });
    expect(site.beacons).toHaveLength(1);
    expect(site.bundleRequestCount()).toBe(1);
    expect(await site.measurementCookies()).toEqual([]);

    // The consent manager stored the new choice; on the next full load it replays it.
    await site.reload();
    await site.grant();
    await site.waitForBeacon(2);

    expect(site.bundleRequestCount()).toBe(2);
    expect(await site.state()).toMatchObject({ configured: true });
    expect(site.pageErrors()).toEqual([]);
  });

  test("the stored decision is replayed on every page through the global callbacks", async ({ page, context }) => {
    const site = await createSiteHarness(page, context, "consent");

    await site.visit();
    await site.grant();
    await site.waitForBeacon(1);

    // Full navigation to a page without consent buttons: nothing happens until
    // the consent manager applies its saved decision again.
    await page.getByRole("link", { name: "Next page" }).click();
    await site.settle();
    expect(site.beacons).toHaveLength(1);
    expect(await site.state()).toMatchObject({ boomerangVersion: undefined, configured: true });

    await site.grantByCallback();
    await site.waitForBeacon(2);

    expect(site.beacons[1]).toMatchObject({ p_type: "article", p_gen: "astro" });
    expect(site.bundleRequestCount()).toBe(2);

    await site.denyByCallback();
    expect(await site.state()).toMatchObject({ configured: false });
    expect(await site.measurementCookies()).toEqual([]);
    expect(site.pageErrors()).toEqual([]);
  });
});
