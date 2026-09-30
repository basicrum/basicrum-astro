import { build, dev } from "astro";
import node from "@astrojs/node";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import basicrum from "../src/index.js";

const servers = [];
const root = new URL("./fixtures/site/", import.meta.url);
const collector = { siteId: "astro-test-site", beaconUrl: "https://collector.basicrum.test/beacon" };
const variants = [
  { name: "standard", port: 43211, loader: "standard" },
  { name: "consent", port: 43212, loader: "consent" },
  { name: "disabled", port: 43213, loader: "standard", enabled: false },
  { name: "delayed", port: 43214, loader: "consent", waitAfterOnloadMs: 150 },
];

for (const { name, port, ...options } of variants) {
  const outDir = new URL(`../.test-output/${name}/`, import.meta.url);
  await build({
    root,
    configFile: false,
    outDir: fileURLToPath(outDir),
    base: "/metrics/",
    logLevel: "silent",
    integrations: [basicrum({
      ...collector,
      ...options,
    })],
  });
  const directory = fileURLToPath(outDir);
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/metrics/")) { res.writeHead(404).end(); return; }
    const path = resolve(directory, pathname.slice("/metrics/".length) || ".");
    if (path !== resolve(directory) && !path.startsWith(directory.replace(/\/$/, "") + sep)) { res.writeHead(404).end(); return; }
    const filename = pathname.endsWith("/") ? resolve(path, "index.html") : path;
    try {
      const body = await readFile(filename);
      res.setHeader("Content-Type", filename.endsWith(".js") ? "application/javascript" : "text/html");
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  servers.push(server);
  console.log(`Basicrum ${name} fixture: http://127.0.0.1:${port}/metrics/`);
}

const ssrDir = new URL("../.test-output/ssr/", import.meta.url);
await build({
  root, configFile: false, outDir: fileURLToPath(ssrDir), base: "/metrics/",
  output: "server", adapter: node({ mode: "standalone" }), logLevel: "silent",
  integrations: [basicrum({ ...collector, loader: "standard" })],
});
const ssr = spawn(process.execPath, [fileURLToPath(new URL("server/entry.mjs", ssrDir))], {
  stdio: "inherit",
  env: { ...process.env, HOST: "127.0.0.1", PORT: "43215", ASTRO_NODE_LOGGING: "disabled" },
});
const devServer = await dev({
  root, configFile: false, base: "/metrics/", logLevel: "silent",
  server: { host: "127.0.0.1", port: 43216 },
  integrations: [basicrum({ ...collector, loader: "standard", enabled: true })],
});
// Readiness is reported only when both additional servers answer.
for (const port of [43215, 43216]) {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/metrics/`)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Fixture on ${port} did not start.`);
}
const readiness = createServer((_req, res) => res.end("ready"));
readiness.listen(43217, "127.0.0.1");
servers.push(readiness);

async function close() {
  ssr.kill();
  await devServer.stop();
  for (const server of servers) server.close();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
