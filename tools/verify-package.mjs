// Pack this package, install the tarball into a throwaway Astro consumer,
// lint the tarball, type-check both public exports and build both loaders with
// a non-root base.
// This is the release gate for "does the published package actually work".
// It needs network access to install Astro into the consumer.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const astroVersion = pkg.devDependencies.astro;
const work = mkdtempSync(join(tmpdir(), "basicrum-astro-consumer-"));
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", npm_config_fund: "false", npm_config_update_notifier: "false" };
const failures = [];
let expectedAsset;

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  const tarball = join(work, run("npm", ["pack", "--pack-destination", work, "--silent"], root).trim().split("\n").pop());
  console.log(`verify-package: packed ${basename(tarball)}`);
  console.log("verify-package: linting the tarball (warnings are errors)");
  console.log(run("npm", ["exec", "--no", "--", "publint", tarball, "--strict"], root).trim());

  // Packing builds dist/; importing afterwards also supports a clean checkout.
  const { boomerangAssetFilename, readBoomerangBundle } = await import("../dist/core/index.js");
  expectedAsset = boomerangAssetFilename();

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
    '    brumSiteId: "packed-site",',
    '    beaconEndpoint: "https://collector.basicrum.test/beacon",',
    '    loader: process.env.BASICRUM_TEST_LOADER,',
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
  const installed = join(consumer, "node_modules", "@basicrum", "astro");
  const installedPackage = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  check(installedPackage.license === "MIT", "published package does not declare the MIT license");
  for (const notice of ["LICENSE", "THIRD-PARTY-NOTICES.md", "vendor/boomerang/LICENSE.txt"]) {
    const installedNotice = join(installed, notice);
    check(existsSync(installedNotice), `published package is missing ${notice}`);
    if (existsSync(installedNotice)) {
      check(readFileSync(installedNotice).equals(readFileSync(join(root, notice))), `published ${notice} differs from the repository`);
    }
  }
  check(!existsSync(join(installed, "src")), "published package contains src/");
  check(!existsSync(join(installed, "tests")), "published package contains tests/");
  for (const entry of [".", "./client"]) {
    const exported = installedPackage.exports[entry];
    for (const [condition, extension] of [["types", ".d.ts"], ["default", ".js"]]) {
      const target = exported[condition];
      check(target.startsWith("./dist/") && target.endsWith(extension), `${entry} ${condition} does not point to generated output`);
      check(existsSync(join(installed, target)), `${entry} ${condition} export is missing`);
    }
  }

  // Check the installed declarations without source aliases to this repository.
  writeFileSync(join(consumer, "types.ts"), readFileSync(join(root, "tests", "types.ts")));
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
      strict: true, noEmit: true, skipLibCheck: true, types: [],
    },
    include: ["types.ts"],
  }, null, 2));
  console.log("verify-package: checking the installed public declarations");
  run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json"], consumer);

  const astroPackage = JSON.parse(readFileSync(join(consumer, "node_modules", "astro", "package.json"), "utf8"));
  const astroBin = typeof astroPackage.bin === "string" ? astroPackage.bin : astroPackage.bin.astro;
  for (const loader of ["non-consent", "consent"]) {
    console.log(`verify-package: building the ${loader} consumer with base /metrics/`);
    env.BASICRUM_TEST_LOADER = loader;
    run(process.execPath, [join(consumer, "node_modules", "astro", astroBin), "build"], consumer);

    const html = readFileSync(join(consumer, "dist", "index.html"), "utf8");
    const bootstraps = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter((source) => source.includes("__basicrumInitialized"));
    check(bootstraps.length === 1, `${loader}: expected exactly one inline bootstrap`);
    const bootstrap = bootstraps[0] ?? "";
    check(html.includes(`/metrics/_basicrum/${expectedAsset}`), `built HTML does not reference /metrics/_basicrum/${expectedAsset}`);
    for (const needle of ["basicRumBoomerangConfig", '"packed-site"', "https://collector.basicrum.test/beacon"]) {
      check(bootstrap.includes(needle), `${loader}: bootstrap lacks ${needle}`);
    }
    check(bootstrap.includes("OPT_IN_BASICRUM_LOADER_WRAPPER") === (loader === "consent"), `${loader}: wrong loader in built HTML`);
    check(!html.includes("node_modules"), "built HTML leaks a node_modules path");

    const assetDir = join(consumer, "dist", "_basicrum");
    const assets = existsSync(assetDir) ? readdirSync(assetDir) : [];
    check(assets.length === 1 && assets[0] === expectedAsset, `expected exactly one emitted bundle named ${expectedAsset}, found: ${assets.join(", ") || "none"}`);
    if (assets.includes(expectedAsset)) {
      check(readFileSync(join(assetDir, expectedAsset)).equals(readBoomerangBundle()), "emitted bundle differs from the vendored Boomerang build");
    }
  }
} catch (error) {
  failures.push(error.message);
  if (error.stdout) failures.push(error.stdout.toString());
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`verify-package: FAIL ${failure}`);
  process.exit(1);
}
console.log(`verify-package: OK (astro ${astroVersion}, ${expectedAsset}, both loaders and installed types)`);
