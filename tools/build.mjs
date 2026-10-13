// Preserve module paths and function names: configure() is serialized into a
// classic script. No bundling, minification or injected runtime helpers.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
rmSync(new URL("dist/", root), { recursive: true, force: true });
execFileSync(process.execPath, [
  fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)),
  "--project", "tsconfig.build.json",
], { cwd: fileURLToPath(root), stdio: "inherit" });
