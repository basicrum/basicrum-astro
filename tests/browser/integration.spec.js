import { expect, test } from "@playwright/test";

const urls = {
  standard: "http://127.0.0.1:43211/metrics/",
  consent: "http://127.0.0.1:43212/metrics/",
  disabled: "http://127.0.0.1:43213/metrics/",
  delayed: "http://127.0.0.1:43214/metrics/",
  ssr: "http://127.0.0.1:43215/metrics/",
  dev: "http://127.0.0.1:43216/metrics/",
};

async function observe(page) {
  const beacons = [], errors = [], unexpected = [];
  let bundleRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/_basicrum/boomerang-")) bundleRequests++;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "collector.basicrum.test") {
      beacons.push(Object.fromEntries(new URLSearchParams(request.postData() || url.search)));
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
    } else if (url.hostname === "127.0.0.1") await route.continue();
    else { unexpected.push(url.href); await route.abort(); }
  });
  return { beacons, errors, unexpected, bundleRequests: () => bundleRequests };
}

test("standard loads the self-hosted bundle and sends configured metadata", async ({ page }) => {
  const state = await observe(page);
  await page.goto(`${urls.standard}?campaign=spring`);
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  expect(state.beacons[0]).toMatchObject({ brum_site_id: "astro-test-site", p_gen: "astro", p_type: "home", sv: "15" });
  expect(state.beacons[0].u).not.toContain("campaign=spring");
  expect(state.bundleRequests()).toBe(1);
  expect(new URL(await page.evaluate(() => window.BOOMR.url)).pathname).toMatch(/^\/metrics\/_basicrum\//);
  expect(await page.evaluate(() => typeof window.OPT_IN_BASICRUM_LOADER_WRAPPER)).toBe("undefined");
  expect(state.errors).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test("normal page navigation creates a fresh measurement with the next page type", async ({ page }) => {
  const state = await observe(page);
  await page.goto(urls.standard);
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect.poll(() => state.beacons.some((beacon) => beacon.p_type === "article")).toBe(true);
  expect(state.errors).toEqual([]);
});

test("consent is inert before grant and denial still permits a later grant", async ({ page, context }) => {
  const state = await observe(page);
  await page.goto(urls.consent);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await page.waitForTimeout(200);
  expect(state.bundleRequests()).toBe(0);
  expect(state.beacons).toEqual([]);
  expect((await context.cookies()).filter((cookie) => ["RT", "BA"].includes(cookie.name))).toEqual([]);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  expect(state.beacons[0]).toMatchObject({ p_gen: "astro", brum_site_id: "astro-test-site" });
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  expect(state.bundleRequests()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("withdrawal during download keeps the real bundle uninitialized", async ({ page, context }) => {
  const state = await observe(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/_basicrum/boomerang-*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(urls.consent);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(state.bundleRequests).toBe(1);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  release();
  await expect.poll(() => page.evaluate(() => window.BOOMR?.version)).toBe("1.815.60");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.basicRumInitConfig)).toBeNull();
  expect(state.beacons).toEqual([]);
  expect((await context.cookies()).filter((cookie) => ["RT", "BA"].includes(cookie.name))).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("withdrawal after initialization stops further beacons and clears cookies", async ({ page, context }) => {
  const state = await observe(page);
  await page.goto(urls.consent);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  const before = state.beacons.length;
  await page.evaluate(() => window.BOOMR.sendBeacon());
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await page.waitForTimeout(500);
  expect(state.beacons.length).toBe(before);
  expect(state.bundleRequests()).toBe(1);
  expect(await page.evaluate(() => window.basicRumBoomerangConfig)).toBeNull();
  expect((await context.cookies()).filter((cookie) => ["RT", "BA"].includes(cookie.name))).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("Astro swaps do not reload Boomerang or restore withdrawn configuration", async ({ page }) => {
  const state = await observe(page);
  await page.goto(`${urls.consent}router/`);
  await page.evaluate(() => { window.__testSameDocument = true; window.OPT_IN_BASICRUM_LOADER_WRAPPER(); });
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  await page.evaluate(() => window.OPT_OUT_BASICRUM_LOADER_WRAPPER());
  await page.getByRole("link", { name: "Next route" }).click();
  await expect(page.getByRole("heading", { name: "Next route" })).toBeVisible();
  expect(await page.evaluate(() => window.__testSameDocument)).toBe(true);
  expect(await page.evaluate(() => window.basicRumBoomerangConfig)).toBeNull();
  expect(state.bundleRequests()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("a delayed first beacon works when consent arrives after window load", async ({ page }) => {
  const state = await observe(page);
  await page.goto(urls.delayed);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.BOOMR.plugins.WaitAfterOnload.complete)).toBe(true);
  expect(state.errors).toEqual([]);
});

test("disabled builds emit neither loader nor Boomerang route", async ({ page, request }) => {
  const state = await observe(page);
  const response = await page.goto(urls.disabled);
  expect(await response.text()).not.toContain("__basicrumInitialized");
  expect(state.bundleRequests()).toBe(0);
  expect(state.beacons).toEqual([]);
  const standardHtml = await (await request.get(urls.standard)).text();
  const bundle = standardHtml.match(/\/metrics\/_basicrum\/boomerang-[\w.]+\.js/)[0];
  expect((await request.get(new URL(bundle, urls.disabled).href)).status()).toBe(404);
  expect(state.errors).toEqual([]);
});

for (const mode of ["ssr", "dev"]) {
  test(`${mode} serves the bundle and sends a real beacon with a non-root base`, async ({ page }) => {
    const state = await observe(page);
    await page.goto(urls[mode]);
    await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
    expect(state.beacons[0]).toMatchObject({ brum_site_id: "astro-test-site", p_gen: "astro", p_type: "home" });
    expect(state.bundleRequests()).toBe(1);
    expect(state.errors).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test("the original iframe fallback still initializes the real bundle", async ({ page }) => {
  const state = await observe(page);
  await page.addInitScript(() => {
    const supports = DOMTokenList.prototype.supports;
    DOMTokenList.prototype.supports = function (token) {
      return token === "preload" ? false : supports.call(this, token);
    };
  });
  await page.goto(urls.standard);
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  expect(state.beacons[0]).toMatchObject({ p_gen: "astro", sm: "i" });
  expect(state.bundleRequests()).toBe(1);
  expect(state.errors).toEqual([]);
});
