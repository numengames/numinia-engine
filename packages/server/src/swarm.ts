// swarm: bots against a server that is ALREADY running (remote, or this same machine), bounded in time.
// Ships with the installer, so it also runs on the server itself.
//   Against a remote URL (from home):  node packages/server/src/swarm.ts --url wss://motor.ejemplo.com/ws --n 200 --secs 30
//   On the server itself:              node packages/server/src/swarm.ts --en-servidor --n 500 --secs 30
//     (= --url ws://127.0.0.1:$PORT --metrics http://127.0.0.1:$PORT/metrics; PORT defaults to 8790)
// Options: --procs <bot processes, default 2> · --metrics <URL of /metrics, read every 5 s and at the end>
// The local self-contained version (own server on a spare port) is tools/swarm.sh.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv;
const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const port = process.env.PORT ?? "8790";
const onServer = argv.includes("--en-servidor");
const url = arg("url", onServer ? `ws://127.0.0.1:${port}` : "");
const metricsUrl = arg("metrics", onServer ? `http://127.0.0.1:${port}/metrics` : "");
const n = Number(arg("n", "100")), secs = Math.min(Number(arg("secs", "30")), 120), procs = Math.max(1, Number(arg("procs", "2")));

if (!url) {
  console.error("[enjambre] falta --url (ws://… o wss://…/ws) o --en-servidor. Ejemplo: --url wss://motor.ejemplo.com/ws --n 200 --secs 30");
  process.exit(2);
}

type Sample = { conectados: number; tickMs: { p50: number; p99: number; peor: number }; kbitPorPersona: number; memoriaMB: { rss: number }; retrasoMs: number };
const samples: Sample[] = [];
const readMetrics = async () => {
  if (!metricsUrl) return;
  try { samples.push(await (await fetch(metricsUrl, { signal: AbortSignal.timeout(3000) })).json() as Sample); }
  catch (e) { console.log(`[enjambre] no pude leer ${metricsUrl}: ${(e as Error).message}`); }
};

const bots = join(fileURLToPath(import.meta.url), "../bots.ts");
const kids: ChildProcess[] = [];
const per = Math.ceil(n / procs);
console.log(`[enjambre] ${n} bots en ${procs} procesos contra ${url} durante ${secs} s${metricsUrl ? ` · métricas ${metricsUrl}` : ""}`);
for (let p = 0, left = n; p < procs && left > 0; p++, left -= per) {
  const k = spawn(process.execPath, [bots, "--n", String(Math.min(per, left)), "--url", url, "--seed", String(p * per), "--stats", "10000"], { stdio: ["ignore", "pipe", "pipe"] });
  const out = (d: Buffer) => { for (const l of String(d).split("\n")) if (l.trim()) console.log(`  p${p} ${l}`); };
  k.stdout?.on("data", out); k.stderr?.on("data", out);
  kids.push(k);
}
const poll = setInterval(readMetrics, 5000);
await new Promise((r) => setTimeout(r, secs * 1000));
await readMetrics();
clearInterval(poll);
for (const k of kids) k.kill();

if (samples.length) {
  const last = samples[samples.length - 1];
  const worstP99 = Math.max(...samples.map((s) => s.tickMs.p99));
  const maxPeople = Math.max(...samples.map((s) => s.conectados));
  console.log(`[enjambre] servidor: conectados ${last.conectados} (máx ${maxPeople}) · tick p50 ${last.tickMs.p50} ms · p99 ${last.tickMs.p99} ms (peor p99 visto ${worstP99}) · ${last.kbitPorPersona} kbit/s por persona · RSS ${last.memoriaMB.rss} MB · retraso ${last.retrasoMs} ms`);
} else if (metricsUrl) {
  console.log("[enjambre] sin métricas del servidor (¿/metrics no es accesible desde aquí? En remoto: ssh -L 18790:127.0.0.1:8790 y --metrics http://localhost:18790/metrics)");
}
process.exit(0);
