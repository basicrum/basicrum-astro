// Tests for the Astro adapter. Core behavior is covered in core.test.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { test } from "node:test";
import basicrum from "../../src/index.js";
import { BOOMERANG_BUNDLE_PATH, readLoaderSource } from "../../src/core/index.js";
import { listSourceFiles, moduleSpecifiers, resolveSpecifier } from "./helpers/module-graph.js";

const root = new URL("../../", import.meta.url);
const options = { siteId: "test-site", beaconUrl: "https://collector.basicrum.test/beacon", loader: "consent" };

function setup(overrides = {}, command = "build", base = "/") {
  const scripts = [], routes = [];
  basicrum({ ...options, ...overrides }).hooks["astro:config:setup"]({
    config: { base }, command,
    injectScript: (...args) => scripts.push(args),
    injectRoute: (route) => routes.push(route),
  });
  return { scripts, routes };
}

test("invalid options fail when the integration is constructed", () => {
  assert.throws(() => basicrum(), TypeError);
  assert.throws(() => basicrum({ ...options, loader: "automatic" }), TypeError);
  assert.throws(() => basicrum({ ...options, consentRequired: true }), TypeError);
});

test("development is inert by default and enabled is an explicit override", () => {
  assert.deepEqual(setup({}, "dev"), { scripts: [], routes: [] });
  assert.deepEqual(setup({ enabled: false }), { scripts: [], routes: [] });
  assert.equal(setup({ enabled: true }, "dev").scripts.length, 1);
});

for (const loader of ["standard", "consent"]) {
  for (const debug of [false, true]) {
    test(`${loader} (${debug ? "source" : "minified"}) is a classic head script with the matching loader`, () => {
      const { scripts, routes } = setup({ loader, debug }, "build", "/metrics/");
      assert.equal(scripts.length, 1);
      const [[stage, source]] = scripts;
      assert.equal(stage, "head-inline");
      assert.doesNotThrow(() => new Script(source));
      assert.ok(source.includes(readLoaderSource(loader, debug)));
      assert.ok(source.includes('"astro"'));
      assert.equal(source.includes("OPT_IN_BASICRUM_LOADER_WRAPPER"), loader === "consent");
      assert.match(source, /\/metrics\/_basicrum\/boomerang-1\.815\.60\.[a-f0-9]{12}\.js/);
      assert.equal(routes.length, 1);
      assert.ok(routes[0].pattern.startsWith("/_basicrum/"));
      assert.equal(routes[0].prerender, true);
      assert.ok(routes[0].entrypoint.href.endsWith("/src/boomerang-endpoint.js"));
    });
  }
}

test("the endpoint serves the same bundle file the core catalogue names", () => {
  const source = readFileSync(new URL("src/boomerang-endpoint.js", root), "utf8");
  assert.ok(source.includes(`"../${BOOMERANG_BUNDLE_PATH}?raw"`), "endpoint import is out of sync with core assets");
});

test("adapter files reach the core only through its public entry points", () => {
  const srcDir = fileURLToPath(new URL("src/", root));
  const entryPoints = new Set([resolve(srcDir, "core/index.js"), resolve(srcDir, "core/consent.js")]);
  const files = listSourceFiles(srcDir, { recursive: false });
  assert.ok(files.length >= 5, "expected the adapter source and declaration files");
  for (const file of files) {
    const name = relative(srcDir, file);
    for (const { specifier, kind } of moduleSpecifiers(file)) {
      assert.notEqual(kind, "dynamic-unresolvable", `${name} has a dynamic import that cannot be checked`);
      if (specifier === "astro" || specifier.startsWith("node:")) continue;
      if (specifier === `../${BOOMERANG_BUNDLE_PATH}?raw`) {
        assert.equal(name, "boomerang-endpoint.js", `${name} imports the vendored bundle directly`);
        continue;
      }
      assert.ok(specifier.startsWith("./") || specifier.startsWith("../"), `${name} imports the package "${specifier}"`);
      assert.ok(entryPoints.has(resolveSpecifier(file, specifier)), `${name} imports "${specifier}", which is not a core entry point`);
    }
  }
});
