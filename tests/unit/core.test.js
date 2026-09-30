// Tests for the framework-neutral core (src/core/ + vendor/). These move with
// the core when it becomes its own package; nothing here touches Astro.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Script } from "node:vm";
import { test } from "node:test";
import {
  ASSET_ROUTE_PREFIX, BOOMERANG_BUNDLE_PATH, BOOMERANG_VERSION, LOADERS,
  boomerangAssetPath, boomerangBundleHash, boomerangBundleUrl,
  createBootstrap, createInstallation, loaderPath, normalizeOptions,
  readBoomerangBundle, readLoaderSource, serialize, setConsent,
} from "../../src/core/index.js";

const root = new URL("../../", import.meta.url);
const options = { siteId: "test-site", beaconUrl: "https://collector.basicrum.test/beacon", loader: "consent" };

test("options require an explicit valid loader and collector configuration", () => {
  for (const overrides of [
    { loader: undefined }, { loader: "automatic" }, { siteId: " " },
    { beaconUrl: "/beacon" }, { beaconUrl: "file:///beacon" },
    { beaconUrl: "https://user:password@example.test/beacon" },
    { beaconUrl: "https://example.test/beacon#fragment" },
    { enabled: "false" }, { debug: "true" }, { stripQueryString: "false" },
    { resourceTiming: null }, { continuity: 1 }, { pageType: "" },
    { waitAfterOnloadMs: -1 }, { waitAfterOnloadMs: 0.5 },
    { waitAfterOnloadMs: Infinity }, { waitAfterOnloadMs: 2147483648 },
    { consentRequired: true },
  ]) assert.throws(() => normalizeOptions({ ...options, ...overrides }), TypeError);
  assert.throws(() => normalizeOptions(), TypeError);
  assert.throws(() => normalizeOptions([]), TypeError);
});

test("options are trimmed, defaulted and frozen", () => {
  const settings = normalizeOptions({ ...options, siteId: "  padded  " });
  assert.ok(Object.isFrozen(settings));
  assert.deepEqual(settings, {
    siteId: "padded", beaconUrl: "https://collector.basicrum.test/beacon", loader: "consent",
    enabled: undefined, debug: false, pageType: "page", stripQueryString: true,
    waitAfterOnloadMs: 0, resourceTiming: true, continuity: true,
  });
});

test("asset catalogue points at the vendored files and hashes their content", () => {
  assert.ok(BOOMERANG_BUNDLE_PATH.includes(BOOMERANG_VERSION));
  assert.equal(readBoomerangBundle().equals(readFileSync(new URL(BOOMERANG_BUNDLE_PATH, root))), true);
  assert.equal(boomerangBundleUrl.href, new URL(BOOMERANG_BUNDLE_PATH, root).href);
  const digest = createHash("sha256").update(readBoomerangBundle()).digest("hex");
  assert.equal(boomerangBundleHash(), digest.slice(0, 12));
  assert.equal(boomerangAssetPath(), `${ASSET_ROUTE_PREFIX}/boomerang-${BOOMERANG_VERSION}.${digest.slice(0, 12)}.js`);
  for (const loader of Object.keys(LOADERS)) {
    for (const debug of [false, true]) {
      assert.equal(readLoaderSource(loader, debug), readFileSync(new URL(loaderPath(loader, debug), root), "utf8"));
    }
  }
  assert.throws(() => loaderPath("automatic"), TypeError);
});

test("installation combines base path, bundle URL, generator and the selected loader", () => {
  for (const loader of ["standard", "consent"]) {
    for (const debug of [false, true]) {
      const settings = normalizeOptions({ ...options, loader, debug });
      const { assetPath, boomerangUrl, bootstrap } = createInstallation(settings, { generator: "astro", base: "/metrics/" });
      assert.equal(assetPath, boomerangAssetPath());
      assert.equal(boomerangUrl, `/metrics${assetPath}`);
      assert.doesNotThrow(() => new Script(bootstrap));
      assert.ok(bootstrap.includes(readLoaderSource(loader, debug)));
      assert.ok(bootstrap.includes(serialize(boomerangUrl)));
      assert.ok(bootstrap.includes('"astro"'));
      assert.equal(bootstrap.includes("OPT_IN_BASICRUM_LOADER_WRAPPER"), loader === "consent");
    }
  }
  const { boomerangUrl } = createInstallation(normalizeOptions(options), { generator: "next" });
  assert.equal(boomerangUrl, boomerangAssetPath());
  assert.throws(() => createBootstrap({ settings: normalizeOptions(options), boomerangUrl, loaderSource: "" }), TypeError);
});

test("embedded strings retain data while escaping HTML delimiters and Unicode separators", () => {
  const value = { pageType: "cakes < seasonal > & chocolate\u2028\u2029" };
  const encoded = serialize(value);
  assert.equal(encoded.includes("<"), false);
  assert.equal(encoded.includes("\u2028"), false);
  assert.equal(encoded.includes("\u2029"), false);
  assert.deepEqual(JSON.parse(encoded), value);
});

test("vendored assets match their pinned provenance", () => {
  const manifest = JSON.parse(readFileSync(new URL("vendor/provenance.json", root), "utf8"));
  assert.ok(BOOMERANG_BUNDLE_PATH in manifest.files);
  for (const [path, digest] of Object.entries(manifest.files)) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex"), digest, path);
  }
});

test("consent helper is safe during server rendering and rejects ambiguous values", () => {
  assert.equal(setConsent(true), false);
  assert.equal(setConsent(false), false);
  assert.throws(() => setConsent("false"), TypeError);
});

test("core never imports a framework or anything outside src/core and vendor", () => {
  const coreDir = new URL("src/core/", root);
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of readdirSync(coreDir).filter((name) => name.endsWith(".js"))) {
    const source = strip(readFileSync(new URL(file, coreDir), "utf8"));
    for (const [, specifier] of source.matchAll(/^(?:import|export)\s[^\n]*?\bfrom\s*["']([^"']+)["']/gm)) {
      assert.ok(specifier.startsWith("node:") || specifier.startsWith("./"), `${file} imports ${specifier}`);
    }
    if (file !== "assets.js") assert.equal(source.includes("vendor/"), false, `${file} reaches into vendor/ directly`);
    assert.equal(/astro/i.test(source), false, `${file} mentions Astro`);
  }
});
