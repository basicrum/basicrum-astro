// Tests for the framework-neutral core (src/core/ + vendor/). These move with
// the core when it becomes its own package; nothing here touches Astro.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { test } from "node:test";
import {
  ASSET_ROUTE_PREFIX, BOOMERANG_BUNDLE_PATH, BOOMERANG_VERSION, LOADERS,
  boomerangAssetPath, boomerangBundleHash, boomerangBundleUrl,
  createBootstrap, createInstallation, loaderPath, normalizeOptions,
  readBoomerangBundle, readLoaderSource, serialize, setConsent,
} from "../../src/core/index.js";
import { codeWithoutComments, isInside, listSourceFiles, moduleSpecifiers, resolveSpecifier } from "./helpers/module-graph.js";

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
  // The delay plugin and its unload flush travel inside the serialized configure().
  const delayed = createInstallation(normalizeOptions({ ...options, waitAfterOnloadMs: 5 }), { generator: "astro" }).bootstrap;
  for (const needle of ["WaitAfterOnload", '"page_unload"', "real_sendBeacon", "clearTimeout"]) assert.ok(delayed.includes(needle), needle);
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

test("an early decision is not queued by the consent helper", () => {
  globalThis.window = {};
  try {
    assert.equal(setConsent(true), false);
    let calls = 0;
    globalThis.window.OPT_IN_BASICRUM_LOADER_WRAPPER = () => { calls += 1; };
    assert.equal(calls, 0, "defining the callback must not replay an earlier decision");
    assert.equal(setConsent(true), true);
    assert.equal(calls, 1);
  } finally {
    delete globalThis.window;
  }
});

test("consent helper is safe during server rendering and rejects ambiguous values", () => {
  assert.equal(setConsent(true), false);
  assert.equal(setConsent(false), false);
  assert.throws(() => setConsent("false"), TypeError);
});

test("core never imports a framework or anything outside src/core", () => {
  const coreDir = fileURLToPath(new URL("src/core/", root));
  const files = listSourceFiles(coreDir);
  assert.ok(files.length >= 7, "expected the core source and declaration files");
  for (const file of files) {
    const name = relative(coreDir, file);
    for (const { specifier, kind } of moduleSpecifiers(file)) {
      assert.notEqual(kind, "dynamic-unresolvable", `${name} has a dynamic import that cannot be checked`);
      if (specifier.startsWith("node:")) continue;
      assert.ok(specifier.startsWith("./") || specifier.startsWith("../"), `${name} imports the package "${specifier}"`);
      const target = resolveSpecifier(file, specifier);
      assert.ok(isInside(coreDir, target), `${name} imports "${specifier}", which resolves outside src/core`);
    }
    const code = codeWithoutComments(file);
    if (name !== "assets.js") assert.equal(code.includes("vendor/"), false, `${name} reaches into vendor/ directly`);
    assert.equal(/astro/i.test(code), false, `${name} mentions Astro`);
  }
  // The browser entry must stay importable from a page: no Node built-ins, no other modules.
  assert.deepEqual(moduleSpecifiers(join(coreDir, "consent.js")), []);
});

test("the boundary scanner sees every import form", () => {
  const dir = mkdtempSync(join(tmpdir(), "basicrum-module-graph-"));
  try {
    const file = join(dir, "sample.js");
    writeFileSync(file, [
      "import {",
      "  readLoaderSource",
      "} from \"./core/assets.js\";",
      "import \"vite/client\";",
      "export { normalizeOptions } from \"./core/options.js\";",
      "export * from \"../vendor/anything.js\";",
      "const adapter = import(\"../index.js\");",
      "const dynamic = import(`./${adapter}.js`);",
      "// import \"./commented-out.js\";",
      "const text = 'from \"./inside-a-string.js\"';",
      "export default adapter;",
      "",
    ].join("\n"));
    assert.deepEqual(moduleSpecifiers(file), [
      { specifier: "./core/assets.js", kind: "static" },
      { specifier: "vite/client", kind: "side-effect" },
      { specifier: "./core/options.js", kind: "re-export" },
      { specifier: "../vendor/anything.js", kind: "re-export" },
      { specifier: "../index.js", kind: "dynamic" },
      { specifier: "<non-literal>", kind: "dynamic-unresolvable" },
    ]);
    const declaration = join(dir, "sample.d.ts");
    writeFileSync(declaration, [
      "/// <reference types=\"node\" />",
      "/** from \"./in-a-comment.js\" */",
      "import type { AstroIntegration } from \"astro\";",
      "export type { Options } from",
      "  \"./core/index.js\";",
      "import \"./side-effect.js\";",
      "export type Review = typeof import(\"../client.js\", {",
      "  with: { \"resolution-mode\": \"import\" }",
      "}).setConsent;",
      "import legacy = require(\"./legacy.js\");",
      "declare const text: 'from \"./inside-a-string.js\"';",
      "declare const opener: \"/* not a comment\";",
      "import { Late } from \"./after-a-fake-comment-start.js\";",
      "declare const closer: \"*/\";",
      "",
    ].join("\n"));
    const bySpecifier = (list) => [...list].sort((a, b) => a.specifier.localeCompare(b.specifier));
    assert.deepEqual(bySpecifier(moduleSpecifiers(declaration)), bySpecifier([
      { specifier: "node", kind: "reference" },
      { specifier: "astro", kind: "static" },
      { specifier: "./core/index.js", kind: "static" },
      { specifier: "./side-effect.js", kind: "side-effect" },
      { specifier: "../client.js", kind: "dynamic" },
      { specifier: "./legacy.js", kind: "static" },
      { specifier: "./after-a-fake-comment-start.js", kind: "static" },
    ]));
    // Nested directories are listed, and a subtree can be excluded by path.
    mkdirSync(join(dir, "src", "core", "deep"), { recursive: true });
    mkdirSync(join(dir, "src", "nested"), { recursive: true });
    for (const file of ["src/a.js", "src/core/b.js", "src/core/deep/c.d.ts", "src/nested/d.d.ts", "src/README.md"]) writeFileSync(join(dir, file), "");
    const listed = listSourceFiles(join(dir, "src")).map((file) => relative(dir, file));
    assert.deepEqual(listed, ["src/a.js", "src/core/b.js", "src/core/deep/c.d.ts", "src/nested/d.d.ts"]);
    assert.deepEqual(listed.filter((file) => !isInside(join(dir, "src", "core"), join(dir, file))), ["src/a.js", "src/nested/d.d.ts"]);
    assert.equal(resolveSpecifier(join(dir, "src", "core", "a.js"), "./../index.js?raw"), join(dir, "src", "index.js"));
    assert.equal(isInside(join(dir, "src", "core"), join(dir, "src", "core-extra", "x.js")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
