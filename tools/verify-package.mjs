// Pack this package, install the tarball into a throwaway Astro consumer,
// build with a non-root base, and check the emitted bootstrap and bundle.
// This is the release gate for "does the published package actually work".
// It needs network access to install Astro into the consumer.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boomerangAssetFilename, readBoomerangBundle } from "../src/core/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const astroVersion = pkg.devDependencies.astro;
const work = mkdtempSync(join(tmpdir(), "basicrum-astro-consumer-"));
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", npm_config_fund: "false", npm_config_update_notifier: "false" };
const failures = [];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  const tarball = join(work, run("npm", ["pack", "--pack-destination", work, "--silent"], root).trim().split("\n").pop());
  console.log(`verify-package: packed ${basename(tarball)}`);

  const consumer = join(work, "consumer");
  mkdirSync(join(consumer, "src", "pages"), { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "basicrum-astro-consumer", private: true, type: "module" }, null, 2));
  writeFileSync(join(consumer, "astro.config.mjs"), [
    'import { defineConfig } from "astro/config";',
    'import basicrum from "@basicrum/astro";',
    "",
    "export default defineConfig({",
    '  base: "/metrics/",',
    "  integrations: [basicrum({",
    '    siteId: "packed-site",',
    '    beaconUrl: "https://collector.basicrum.test/beacon",',
    '    loader: "consent",',
    "  })],",
    "});",
    "",
  ].join("\n"));
  writeFileSync(join(consumer, "src", "pages", "index.astro"), [
    "---",
    "---",
    "<!doctype html>",
    '<html lang="en">',
    '  <head><meta charset="utf-8" /><meta name="basicrum:page-type" content="home" /><title>Packed consumer</title></head>',
    "  <body>",
    "    <h1>Packed consumer</h1>",
    '    <script>import { setConsent } from "@basicrum/astro/client"; setConsent(false);</script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n"));

  console.log(`verify-package: installing astro@${astroVersion} and the tarball into a temporary consumer`);
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", `astro@${astroVersion}`, tarball], consumer);
  console.log("verify-package: building the consumer with base /metrics/");
  const astroPackage = JSON.parse(readFileSync(join(consumer, "node_modules", "astro", "package.json"), "utf8"));
  const astroBin = typeof astroPackage.bin === "string" ? astroPackage.bin : astroPackage.bin.astro;
  run(process.execPath, [join(consumer, "node_modules", "astro", astroBin), "build"], consumer);

  const html = readFileSync(join(consumer, "dist", "index.html"), "utf8");
  const expectedAsset = boomerangAssetFilename();
  check(html.includes(`/metrics/_basicrum/${expectedAsset}`), `built HTML does not reference /metrics/_basicrum/${expectedAsset}`);
  for (const needle of ["basicRumBoomerangConfig", "OPT_IN_BASICRUM_LOADER_WRAPPER", '"packed-site"', "https://collector.basicrum.test/beacon"]) {
    check(html.includes(needle), `built HTML lacks ${needle}`);
  }
  check(!html.includes("node_modules"), "built HTML leaks a node_modules path");

  const assetDir = join(consumer, "dist", "_basicrum");
  const assets = existsSync(assetDir) ? readdirSync(assetDir) : [];
  check(assets.length === 1 && assets[0] === expectedAsset, `expected exactly one emitted bundle named ${expectedAsset}, found: ${assets.join(", ") || "none"}`);
  if (assets.includes(expectedAsset)) {
    check(readFileSync(join(assetDir, expectedAsset)).equals(readBoomerangBundle()), "emitted bundle differs from the vendored Boomerang build");
  }
} catch (error) {
  failures.push(error.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`verify-package: FAIL ${failure}`);
  process.exit(1);
}
console.log(`verify-package: OK (astro ${astroVersion}, ${boomerangAssetFilename()})`);
