import { expect, test } from "@playwright/test";

const urls = {
  standard: "http://127.0.0.1:43211/metrics/",
  consent: "http://127.0.0.1:43212/metrics/",
  disabled: "http://127.0.0.1:43213/metrics/",
  delayed: "http://127.0.0.1:43214/metrics/",
  ssr: "http://127.0.0.1:43215/metrics/",
  dev: "http://127.0.0.1:43216/metrics/",
  localStandard: "http://127.0.0.1:43219/metrics/",
  localConsent: "http://127.0.0.1:43220/metrics/",
  localDelayed: "http://127.0.0.1:43221/metrics/",
};
const localCollector = "http://127.0.0.1:43218";

async function measurementCookies(context) {
  return (await context.cookies()).filter((cookie) => ["RT", "BA"].includes(cookie.name)).map((cookie) => cookie.name).sort();
}

/** Boomerang cannot set its own cookies on 127.0.0.1, so seed them as a positive control. */
async function seedMeasurementCookies(page, context) {
  await page.evaluate(() => {
    document.cookie = "RT=seeded; path=/; SameSite=Strict";
    document.cookie = "BA=seeded; path=/; SameSite=Strict";
  });
  expect(await measurementCookies(context)).toEqual(["BA", "RT"]);
}

/** Re-execute the emitted head bootstrap, as a framework re-evaluating head scripts would. */
async function replayBootstrap(page) {
  const content = await page.evaluate(() => [...document.scripts]
    .find((script) => !script.src && script.textContent.includes("basicRumBoomerangConfig"))?.textContent);
  expect(content).toBeTruthy();
  await page.addScriptTag({ content });
}

/** Beacons the local collector received for a site id since a timestamp. */
async function collected(request, siteId, since) {
  const response = await request.get(`${localCollector}/beacons?since=${since}`);
  return (await response.json()).map((beacon) => beacon.params).filter((params) => params.brum_site_id === siteId);
}

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
  await seedMeasurementCookies(page, context);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await page.waitForTimeout(200);
  expect(state.bundleRequests()).toBe(0);
  expect(state.beacons).toEqual([]);
  expect(await measurementCookies(context)).toEqual([]);
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
  // Granting again while the withdrawn download is still in flight changes nothing.
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  release();
  await expect.poll(() => page.evaluate(() => window.BOOMR?.version)).toBe("1.815.60");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.basicRumInitConfig)).toBeNull();
  expect(state.beacons).toEqual([]);
  expect(await measurementCookies(context)).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("withdrawal after initialization stops further beacons and clears cookies", async ({ page, context }) => {
  const state = await observe(page);
  await page.goto(urls.consent);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  await seedMeasurementCookies(page, context);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  expect(await measurementCookies(context)).toEqual([]);
  const before = state.beacons.length;
  await page.evaluate(() => window.BOOMR.sendBeacon());
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await replayBootstrap(page);
  await page.waitForTimeout(500);
  expect(state.beacons.length).toBe(before);
  expect(state.bundleRequests()).toBe(1);
  expect(await page.evaluate(() => window.basicRumBoomerangConfig)).toBeNull();
  expect(await measurementCookies(context)).toEqual([]);
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
  // Astro deduplicates identical inline scripts on a swap, so force the
  // bootstrap to run again: the guard must keep the withdrawn state.
  await replayBootstrap(page);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.basicRumBoomerangConfig)).toBeNull();
  expect(await page.evaluate(() => typeof window.OPT_IN_BASICRUM_LOADER_WRAPPER)).toBe("function");
  expect(state.bundleRequests()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("a decision made before the loader runs is not queued", async ({ page }) => {
  const state = await observe(page);
  await page.addInitScript(() => {
    window.__earlyCallback = typeof window.OPT_IN_BASICRUM_LOADER_WRAPPER;
    try { window.OPT_IN_BASICRUM_LOADER_WRAPPER(); } catch (error) { window.__earlyError = error.name; }
  });
  await page.goto(urls.consent);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [window.__earlyCallback, window.__earlyError])).toEqual(["undefined", "TypeError"]);
  expect(await page.evaluate(() => typeof window.OPT_IN_BASICRUM_LOADER_WRAPPER)).toBe("function");
  expect(state.bundleRequests()).toBe(0);
  expect(state.beacons).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("setConsent reports in the browser whether a consent loader is present", async ({ page }) => {
  const state = await observe(page);
  for (const site of ["standard", "disabled"]) {
    await page.goto(urls[site]);
    expect(await page.evaluate(() => [window.basicrumSetConsent(true), window.basicrumSetConsent(false)])).toEqual([false, false]);
  }
  // The standard site keeps collecting: there is no consent state to withdraw.
  expect(await page.evaluate(() => typeof window.basicRumBoomerangConfig)).toBe("undefined");
  await page.goto(urls.standard);
  await page.evaluate(() => window.basicrumSetConsent(false));
  expect(await page.evaluate(() => Boolean(window.basicRumBoomerangConfig))).toBe(true);
  await page.goto(urls.consent);
  expect(await page.evaluate(() => window.basicrumSetConsent(true))).toBe(true);
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.basicrumSetConsent(false))).toBe(true);
  expect(await page.evaluate(() => window.basicRumBoomerangConfig)).toBeNull();
  expect(state.errors).toEqual([]);
});

test("no separate consent flag is stored by the integration", async ({ page, context }) => {
  const state = await observe(page);
  await page.goto(urls.consent);
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect.poll(() => state.beacons.length).toBeGreaterThan(0);
  const storage = () => page.evaluate(() => [localStorage.length, sessionStorage.length]);
  expect(await storage()).toEqual([0, 0]);
  const names = (await context.cookies()).map((cookie) => cookie.name);
  expect(names.filter((name) => !["RT", "BA"].includes(name))).toEqual([]);
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  expect(await storage()).toEqual([0, 0]);
  expect((await context.cookies()).map((cookie) => cookie.name)).toEqual([]);
  await page.reload();
  expect(await page.evaluate(() => typeof window.BOOMR.version)).toBe("undefined");
  expect(state.bundleRequests()).toBe(1);
  expect(state.errors).toEqual([]);
});

test.describe("unload traffic captured by a local collector", () => {
  test.describe.configure({ mode: "serial" });

  test("a normal exit sends the unload beacon (positive control)", async ({ page, request }) => {
    const state = await observe(page);
    const since = Date.now();
    await page.goto(urls.localStandard);
    await expect.poll(() => collected(request, "local-standard-site", since)).toHaveLength(1);
    await page.getByRole("link", { name: "Next page" }).click();
    await expect.poll(async () => (await collected(request, "local-standard-site", since)).some((beacon) => "rt.quit" in beacon)).toBe(true);
    const beacons = await collected(request, "local-standard-site", since);
    expect(beacons[0]).toMatchObject({ p_type: "home", p_gen: "astro" });
    expect(beacons.filter((beacon) => "rt.quit" in beacon)).toHaveLength(1);
    expect(state.errors).toEqual([]);
  });

  test("withdrawal followed by leaving the page sends nothing", async ({ page, request }) => {
    const state = await observe(page);
    const since = Date.now();
    await page.goto(urls.localConsent);
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    await expect.poll(() => collected(request, "local-consent-site", since)).toHaveLength(1);
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page.getByRole("heading", { name: "Next page" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await collected(request, "local-consent-site", since)).toHaveLength(1);
    expect(state.bundleRequests()).toBe(1);
    expect(state.errors).toEqual([]);
  });

  test("the first beacon waits for the configured delay", async ({ page, request }) => {
    const state = await observe(page);
    const since = Date.now();
    await page.goto(urls.localDelayed);
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    const granted = Date.now();
    await page.waitForTimeout(700);
    expect(await collected(request, "local-delayed-site", since)).toEqual([]);
    await expect.poll(() => collected(request, "local-delayed-site", since), { timeout: 5000 }).toHaveLength(1);
    expect(Date.now() - granted).toBeGreaterThanOrEqual(1400);
    const [beacon] = await collected(request, "local-delayed-site", since);
    expect(beacon).toMatchObject({ p_type: "home" });
    expect("rt.quit" in beacon).toBe(false);
    expect(await page.evaluate(() => [window.BOOMR.plugins.WaitAfterOnload.complete, window.BOOMR.plugins.WaitAfterOnload.timer])).toEqual([true, null]);
    expect(state.errors).toEqual([]);
  });

  test("leaving during the delay still sends the first beacon, then the unload beacon", async ({ page, request }) => {
    const state = await observe(page);
    const since = Date.now();
    await page.goto(urls.localDelayed);
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.BOOMR.plugins.WaitAfterOnload.started)).toBe(true);
    expect(await collected(request, "local-delayed-site", since)).toEqual([]);
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page.getByRole("heading", { name: "Next page" })).toBeVisible();
    await expect.poll(() => collected(request, "local-delayed-site", since)).toHaveLength(2);
    const beacons = await collected(request, "local-delayed-site", since);
    expect(beacons.filter((beacon) => !("rt.quit" in beacon))).toHaveLength(1);
    expect(beacons.filter((beacon) => "rt.quit" in beacon)).toHaveLength(1);
    expect(beacons[0]).toMatchObject({ p_type: "home", p_gen: "astro" });
    await page.waitForTimeout(500);
    expect(await collected(request, "local-delayed-site", since)).toHaveLength(2);
    expect(state.errors).toEqual([]);
  });

  test("withdrawal during the delay cancels the pending beacon, also on exit", async ({ page, request }) => {
    const state = await observe(page);
    const since = Date.now();
    await page.goto(urls.localDelayed);
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.BOOMR.plugins.WaitAfterOnload.started)).toBe(true);
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await page.waitForTimeout(1800);
    expect(await collected(request, "local-delayed-site", since)).toEqual([]);
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(page.getByRole("heading", { name: "Next page" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await collected(request, "local-delayed-site", since)).toEqual([]);
    expect(state.bundleRequests()).toBe(1);
    expect(state.errors).toEqual([]);
  });
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
