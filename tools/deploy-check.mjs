// deploy-check: the local stand-in for "install it on a clean server" when no container is available.
// Usage: node tools/deploy-check.mjs [path/to/node]   (default: the node running this script)
// Unpacks deploy/instalar-motor.sh with --solo-extraer into $TMPDIR, checks the page files, starts the
// unpacked server on a spare port (8793) with the given node, connects one client and waits for snapshots.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webSocketClient } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const root = join(fileURLToPath(import.meta.url), "../..");
const node = process.argv[2] ?? process.execPath;
const PORT = 8793;
const dir = join(process.env.TMPDIR ?? "/tmp", "numinia-deploy-check");
let srv = null;
const fail = (msg) => { srv?.kill(); console.error(`[deploy-check] FALLA: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const installer = join(root, "deploy/instalar-motor.sh");
if (!existsSync(installer)) fail("no existe deploy/instalar-motor.sh: genera antes con `npm run deploy`");
rmSync(dir, { recursive: true, force: true });
const x = spawnSync("bash", [installer, "--solo-extraer", dir], { encoding: "utf8" });
if (x.status !== 0) fail(`--solo-extraer: ${x.stderr}`);

// the page: index.html and every file it references must be there
const html = readFileSync(join(dir, "www/index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="\/?([^"#?]+)"/g)].map((m) => m[1]).filter((r) => !r.includes("://"));
for (const r of refs) if (!existsSync(join(dir, "www", r))) fail(`la página pide ${r} y no está en www/`);
if (!existsSync(join(dir, "www/assets/robot/RobotExpressive.glb"))) fail("falta el robot (www/assets/robot/RobotExpressive.glb)");

// the server, from the unpacked copy only (cwd = app/, like the systemd unit)
const version = spawnSync(node, ["--version"], { encoding: "utf8" }).stdout.trim();
srv = spawn(node, ["packages/server/src/main.ts"], { cwd: join(dir, "app"), env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", STATS_MS: "60000" } });
let log = "";
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
const stop = () => srv.kill();
try {
  for (let i = 0; i < 40 && !log.includes("[instancia]"); i++) await sleep(100);
  if (!log.includes("[instancia]")) fail(`el servidor desempaquetado no arrancó con node ${version}:\n${log}`);
  const t = webSocketClient(`ws://127.0.0.1:${PORT}`);
  const s = new ClientSession(t);
  await t.opened;
  const t0 = performance.now();
  while (s.stats.snapshots < 10 && performance.now() - t0 < 5000) { s.tick(10, 0); await sleep(50); }
  t.close();
  if (!s.welcome) fail("no llegó el saludo (welcome) del servidor");
  if (s.stats.snapshots < 10) fail(`solo ${s.stats.snapshots} snapshots en 5 s`);
  const get = (p) => fetch(`http://127.0.0.1:${PORT}${p}`).then((r) => r.json()).catch(() => null);
  const health = await get("/health");
  if (!health?.ok) fail(`/health no responde ok: ${JSON.stringify(health)}`);
  const m = await get("/metrics");
  if (!(m?.conectados >= 0 && m?.tickMs)) fail(`/metrics no responde: ${JSON.stringify(m)}`);
  const fp = log.match(/huella de referencia ([0-9a-f]+)/)?.[1];
  console.log(`[deploy-check] OK · node ${version} · página ${refs.length} ficheros enlazados · ${s.stats.snapshots} snapshots en ${Math.round(performance.now() - t0)} ms · huella ${fp} · /health y /metrics OK (RSS ${m.memoriaMB.rss} MB)`);
} finally { stop(); }
