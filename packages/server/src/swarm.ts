// swarm: bots against a server that is ALREADY running (remote, or this same machine), bounded in time,
// and a REPORT of what was measured. Ships with the installer, so it also runs on the server itself.
//   From home:   node packages/server/src/swarm.ts --url wss://motor.ejemplo.com/ws --metrics http://localhost:18790/metrics --pasos 100,300,600,1000
//   On the box:  node packages/server/src/swarm.ts --en-servidor --pasos 100,300,600
// Profiles:  --n 200 --secs 30            one constant level (default)
//            --pasos 100,300,600,1000     stair / breakpoint: one level after another, stops at the first that fails (--sigue to go on)
//            --remojo <minutos> --n 500   soak: constant load for up to 60 min, sampled every 30 s (--cada <s> to change; memory slope, p99 drift)
//            --tormenta <ciclos> --n 500 --retener 10   join storm: everybody connects at once, holds, drops, again
// Options:   --secs <per level, default 45, max 120> · --calentamiento <s, default 10; grows with n> · --pausa <s, default 10>
//            --procs <bot processes, default 2 per 600 bots> · --etiqueta <name for the report> · --salida <folder, default ./informes>
// Judged by PUERTAS below (house thresholds, written down in docs/MEDIDAS.md). Numbers come from /metrics on the server
// (tick, lateness, event loop, CPU, steal, main-thread CPU wait, memory) and from the bots (connect, RTT, snapshot gap, jitter, failures).
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hist, median } from "./hist.ts";
import type { HistJSON } from "./hist.ts";
import { maquinaNoFiable, PUERTAS } from "./puertas.ts";
import { entorno } from "./runtime.ts";

const argv = process.argv;
const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const port = process.env.PORT ?? "8790";
const onServer = argv.includes("--en-servidor");
const url = arg("url", onServer ? `ws://127.0.0.1:${port}` : "");
const metricsUrl = arg("metrics", onServer ? `http://127.0.0.1:${port}/metrics` : "");
const remojoMin = Math.min(Number(arg("remojo", "0")), 60), storm = Number(arg("tormenta", "0"));
const levels = arg("pasos", "") ? arg("pasos", "").split(",").map(Number).filter((x) => x > 0) : [Number(arg("n", "100"))];
const secs = Math.min(Number(arg("secs", "45")), 120), pausa = Number(arg("pausa", "10")), label = arg("etiqueta", "");
if (!url) {
  console.error("[enjambre] falta --url (ws://… o wss://…/ws) o --en-servidor. Ejemplo: --url wss://motor.ejemplo.com/ws --pasos 100,300,600 --metrics http://localhost:18790/metrics");
  process.exit(2);
}
if (!remojoMin && !storm && levels.length * (secs + pausa + 15) > 1800) { console.error("[enjambre] demasiado largo para una sola orden (tope 30 min): reparte los pasos."); process.exit(2); }

// A level PASSES when no gate in PUERTAS (puertas.ts) is broken, nobody failed to connect or dropped, and the measurement is reliable.

type M = {
  version?: string; conectados: number; entorno?: unknown; bytesEnviados?: number;
  tickMs: { p50: number; p99: number; peor: number }; kbitPorPersona: number; memoriaMB: { rss: number; heap: number };
  respuestaTickMs?: { p99: number }; retrasoVentanaMs?: { p99: number };
  proceso?: { cpuPct: number; utilizacionBucle: number; bucleMs: { p99: number }; bucleRealMs?: { p99: number }; bucleResolucionMs?: number; gc: { pausas: number; totalMs: number; peorMs: number }; anfitrion: { cpuPct: number; stealPct: number } | null; esperaCpu?: { pct: number } | null };
  conexiones?: { aceptadas: number; cerradas: number; rechazadasLlenas: number };
};
type B = {
  conectados: number; fallaron: number; primerError: string; caidos: number; snapshots: number; saltados: number; tardios: number;
  h: Record<"connect" | "first" | "rtt" | "gap" | "jitter", HistJSON>; gen: { bucleP99Ms: number; bucleRealP99Ms?: number; bucleMaxMs: number; cpuPct: number };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (x: number) => Math.round(x * 100) / 100;
// E4: monitorEventLoopDelay({ resolution: 10 }) adds its own 10 ms timer to every sample, so `bucleMs.p99` reads ≈10 ms
// even with an idle loop. Use the real delay when the server sends it (`bucleRealMs`, #93); an older server: subtract
// the resolution (`bucleResolucionMs`, else 10). Same for the bots' own loop.
const RESOLUCION_BUCLE_MS = 10;
const bucleReal = (p: M["proceso"]): number | undefined => (p ? (p.bucleRealMs?.p99 ?? Math.max(0, p.bucleMs.p99 - (p.bucleResolucionMs ?? RESOLUCION_BUCLE_MS))) : undefined);
const bots = join(fileURLToPath(import.meta.url), "../bots.ts");

async function getMetrics(): Promise<M | null> {
  if (!metricsUrl) return null;
  try { return await (await fetch(metricsUrl, { signal: AbortSignal.timeout(3000) })).json() as M; }
  catch (e) { console.log(`[enjambre] no pude leer ${metricsUrl}: ${(e as Error).message}`); return null; }
}

async function runLevel(n: number, kind: "nivel" | "remojo" | "tormenta"): Promise<Record<string, unknown>> {
  const warm = kind === "tormenta" ? 0 : Math.max(Number(arg("calentamiento", "10")), Math.ceil(n / 100));
  const duration = kind === "remojo" ? remojoMin * 60 : secs;
  const procs = Number(arg("procs", "0")) || Math.max(2, Math.ceil(n / 600)), per = Math.ceil(n / procs);
  const start = performance.now(), lastB: (B | undefined)[] = [], kids: ChildProcess[] = [], exited: Promise<void>[] = [];
  console.log(`[enjambre] ${kind} · ${n} bots en ${procs} procesos contra ${url}${metricsUrl ? ` · métricas ${metricsUrl}` : ""} · ${kind === "tormenta" ? `${storm} ciclos` : `${duration} s (+${warm} s de calentamiento)`}`);
  for (let p = 0, left = n; p < procs && left > 0; p++, left -= per) {
    const a = ["--n", String(Math.min(per, left)), "--url", url, "--seed", String(p * per), "--calentamiento", String(warm), "--stats", "10000"];
    if (kind === "tormenta") a.push("--tormenta", String(storm), "--retener", arg("retener", "10"), "--lote", String(Math.min(per, 5000)));
    const k = spawn(process.execPath, [bots, ...a], { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    k.stdout?.on("data", (d: Buffer) => {
      buf += String(d);
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (l.startsWith("[json] ")) { try { lastB[p] = JSON.parse(l.slice(7)) as B; } catch { /* partial line */ } }
        else if (l && (l.includes("conectados a") || l.includes("fallaron") || l.includes("tormenta"))) console.log(`  p${p} ${l}`);
      }
    });
    k.stderr?.on("data", (d: Buffer) => console.log(`  p${p} ERROR ${String(d).trim().slice(0, 200)}`));
    exited.push(new Promise((r) => k.once("close", () => r())));
    kids.push(k);
  }
  const samples: { t: number; m: M }[] = [];
  const poll = async () => { const m = await getMetrics(); if (m) samples.push({ t: (performance.now() - start) / 1000, m }); };
  const every = Number(arg("cada", kind === "remojo" ? "30" : "2")) * 1000;
  if (kind === "tormenta") { await poll(); const timer = setInterval(poll, every); await Promise.race([Promise.all(exited), sleep((storm * (Number(arg("retener", "10")) + 8) + 40) * 1000)]); clearInterval(timer); }
  else { const timer = setInterval(poll, every); await sleep((warm + duration) * 1000); await poll(); clearInterval(timer); }
  for (const k of kids) k.kill("SIGTERM");
  await Promise.race([Promise.all(exited), sleep(5000)]);
  for (const k of kids) k.kill("SIGKILL");

  // --- server side: only windows after the warm-up (the whole run for a storm) ---
  const steady = samples.filter((s) => kind === "tormenta" || s.t >= warm).map((s) => s.m);
  const nums = (f: (m: M) => number | undefined) => steady.map(f).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const srv = steady.length ? {
    ventanas: steady.length, conectadosMax: max(nums((m) => m.conectados)),
    tickP50Ms: r2(median(nums((m) => m.tickMs.p50))), tickP99Ms: r2(median(nums((m) => m.tickMs.p99))), tickP99PeorMs: r2(max(nums((m) => m.tickMs.p99))), tickPeorMs: r2(max(nums((m) => m.tickMs.peor))),
    respuestaP99Ms: r2(median(nums((m) => m.respuestaTickMs?.p99))), respuestaP99PeorMs: r2(max(nums((m) => m.respuestaTickMs?.p99))),
    retrasoP99Ms: r2(median(nums((m) => m.retrasoVentanaMs?.p99))), bucleP99Ms: r2(max(nums((m) => bucleReal(m.proceso)))), bucleP99MuestreadoMs: r2(max(nums((m) => m.proceso?.bucleMs.p99))),
    utilizacionBucle: r2(median(nums((m) => m.proceso?.utilizacionBucle))), cpuProcesoPct: r2(median(nums((m) => m.proceso?.cpuPct))),
    cpuAnfitrionPct: r2(median(nums((m) => m.proceso?.anfitrion?.cpuPct))), stealMedianoPct: r2(median(nums((m) => m.proceso?.anfitrion?.stealPct))), stealMaxPct: r2(max(nums((m) => m.proceso?.anfitrion?.stealPct))),
    rssMaxMB: r2(max(nums((m) => m.memoriaMB.rss))), heapMaxMB: r2(max(nums((m) => m.memoriaMB.heap))), kbitPorPersona: r2(median(nums((m) => m.kbitPorPersona))),
    gcPeorMs: r2(max(nums((m) => m.proceso?.gc.peorMs))), rechazadasLlenas: (steady.at(-1)?.conexiones?.rechazadasLlenas ?? 0) - (samples[0]?.m.conexiones?.rechazadasLlenas ?? 0),
    hayAnfitrion: nums((m) => m.proceso?.anfitrion?.stealPct).length > 0,
    // E7: main-thread CPU wait (D3). null = the server does not report it (not Linux, engine before D3).
    esperaCpuMedianaPct: nums((m) => m.proceso?.esperaCpu?.pct).length ? r2(median(nums((m) => m.proceso?.esperaCpu?.pct))) : null,
    esperaCpuMaxPct: nums((m) => m.proceso?.esperaCpu?.pct).length ? r2(max(nums((m) => m.proceso?.esperaCpu?.pct))) : null,
  } : null;

  // --- clients: merge the histograms of every bot process ---
  const got = lastB.filter((b): b is B => !!b);
  const merged = (k: keyof B["h"]) => { const h = new Hist(); for (const b of got) h.merge(Hist.from(b.h[k])); return h.summary(); };
  const sum = (f: (b: B) => number) => got.reduce((s, b) => s + f(b), 0);
  const cli = got.length ? {
    conectados: sum((b) => b.conectados), fallaron: sum((b) => b.fallaron), primerError: got.find((b) => b.primerError)?.primerError ?? "", caidos: sum((b) => b.caidos),
    connect: merged("connect"), primerSnapshot: merged("first"), rtt: merged("rtt"), huecoSnapshots: merged("gap"), jitter: merged("jitter"),
    snapshots: sum((b) => b.snapshots), saltados: sum((b) => b.saltados), tardios: sum((b) => b.tardios),
    generadorBucleP99Ms: r2(Math.max(...got.map((b) => b.gen.bucleRealP99Ms ?? Math.max(0, b.gen.bucleP99Ms - RESOLUCION_BUCLE_MS)))), generadorCpuMaxPct: r2(Math.max(...got.map((b) => b.gen.cpuPct))),
  } : null;

  // --- verdict ---
  const motivos: string[] = [], avisos: string[] = [];
  let fiable = true;
  if (!srv) avisos.push("sin métricas del servidor (¿túnel ssh? ver docs/MEDIDAS.md): no se puede juzgar el tick");
  else {
    if (srv.tickP99Ms > PUERTAS.tickP99Ms) motivos.push(`tick p99 ${srv.tickP99Ms} ms > ${PUERTAS.tickP99Ms}`);
    if (srv.respuestaP99Ms > PUERTAS.respuestaP99Ms) motivos.push(`respuesta del tick p99 ${srv.respuestaP99Ms} ms > ${PUERTAS.respuestaP99Ms} (el tick llega tarde)`);
    const maquina = maquinaNoFiable(srv);
    if (maquina.length) { fiable = false; avisos.push(...maquina.map((x) => `NO FIABLE: ${x}`)); }
    if (!srv.hayAnfitrion) avisos.push("el servidor no dio steal (¿no es Linux?)");
    if (srv.esperaCpuMaxPct === null) avisos.push("el servidor no dio la espera de CPU (¿no es Linux o es un motor anterior a D3?): no se sabe si otros procesos le quitaron el núcleo");
    if (srv.rechazadasLlenas > 0) motivos.push(`${srv.rechazadasLlenas} conexiones rechazadas por instancia llena`);
  }
  if (cli) {
    if (cli.fallaron > 0) motivos.push(`${cli.fallaron} conexiones fallaron (${cli.primerError})`);
    if (cli.caidos > 0) motivos.push(`${cli.caidos} conexiones caídas durante la prueba`);
    if (cli.conectados < n * 0.99 && kind !== "tormenta") motivos.push(`solo ${cli.conectados} de ${n} conectaron`);
    if (cli.generadorBucleP99Ms > PUERTAS.generadorBucleP99Ms || cli.generadorCpuMaxPct > PUERTAS.generadorCpuPct) { fiable = false; avisos.push(`NO FIABLE: los robots no dan abasto (bucle p99 ${cli.generadorBucleP99Ms} ms, CPU ${cli.generadorCpuMaxPct} %): usa más procesos o otra máquina`); }
    if (cli.saltados > 0) avisos.push(`${cli.saltados} snapshots saltados`);
  } else motivos.push("ningún proceso de robots informó");
  const out: Record<string, unknown> = { tipo: kind, pedidos: n, procesos: procs, segundos: duration, calentamientoS: warm, servidor: srv, clientes: cli, veredicto: { pasa: motivos.length === 0 && fiable && !!srv, fiable, motivos, avisos } };

  if (kind === "remojo" && samples.length > 3) {
    const t0 = samples.find((s) => s.t >= 120)?.t ?? samples[0].t, pts = samples.filter((s) => s.t >= t0);
    const xs = pts.map((s) => s.t / 3600), ys = pts.map((s) => s.m.memoriaMB.rss), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    const q = Math.max(1, pts.length >> 2), p99 = (a: typeof pts) => r2(median(a.map((s) => s.m.tickMs.p99)));
    out.remojo = { rssPendienteMBporHora: r2(slope), tickP99PrimerCuartoMs: p99(pts.slice(0, q)), tickP99UltimoCuartoMs: p99(pts.slice(-q)), serie: samples.map((s) => ({ minuto: r2(s.t / 60), rssMB: s.m.memoriaMB.rss, heapMB: s.m.memoriaMB.heap, tickP99Ms: s.m.tickMs.p99, utilizacionBucle: s.m.proceso?.utilizacionBucle ?? null })) };
    const span = pts.length > 1 ? pts.at(-1)!.t - pts[0].t : 0;
    if (span < 600) (out.veredicto as { avisos: string[] }).avisos.push(`remojo de ${Math.round(span / 60)} min de datos: con menos de 10 no se juzga la memoria`);
    else if (slope > PUERTAS.remojoMBporHora) (out.veredicto as { motivos: string[] }).motivos.push(`memoria sube ${r2(slope)} MB/h > ${PUERTAS.remojoMBporHora}: posible fuga`);
    (out.veredicto as { pasa: boolean }).pasa = (out.veredicto as { motivos: string[] }).motivos.length === 0 && fiable && !!srv;
  }
  return out;
}

// ---------- run the profile ----------
const started = new Date();
const results: Record<string, unknown>[] = [];
const first = await getMetrics();
if (metricsUrl && !first) console.log("[enjambre] AVISO: sin métricas del servidor; solo habrá medidas de los robots.");
if (remojoMin) results.push(await runLevel(levels[0], "remojo"));
else if (storm) results.push(await runLevel(levels[0], "tormenta"));
else for (let i = 0; i < levels.length; i++) {
  if (i) await sleep(pausa * 1000);
  const r = await runLevel(levels[i], "nivel");
  results.push(r);
  const v = r.veredicto as { pasa: boolean; fiable: boolean };
  if (!v.pasa && !argv.includes("--sigue")) { console.log(`[enjambre] ${levels[i]} personas no pasa: paro aquí (--sigue para seguir con los niveles mayores)`); break; }
}

// ---------- report ----------
const f = (x: unknown, d = "–") => (x === undefined || x === null ? d : String(x));
const rows = results.map((r) => {
  const s = r.servidor as Record<string, number> | null, c = r.clientes as Record<string, any> | null, v = r.veredicto as { pasa: boolean; fiable: boolean; motivos: string[]; avisos: string[] };
  return `| ${f(r.pedidos)} | ${f(s?.conectadosMax)} | ${f(s?.tickP50Ms)} / **${f(s?.tickP99Ms)}** | ${f(s?.respuestaP99Ms)} | ${f(s?.utilizacionBucle)} | ${f(s?.cpuProcesoPct)} | ${f(s?.cpuAnfitrionPct)} / ${f(s?.stealMaxPct)} / ${f(s?.esperaCpuMaxPct)} | ${f(s?.rssMaxMB)} | ${f(s?.kbitPorPersona)} | ${f(c?.rtt.p50)} / ${f(c?.rtt.p99)} | ${f(c?.huecoSnapshots.p99)} | ${f(c?.jitter.p50)} | ${f(c?.fallaron)} / ${f(c?.caidos)} | ${v.pasa ? "PASA" : v.fiable ? "NO PASA" : "NO FIABLE"} |`;
});
const header = "| Pedidos | Conectados | Tick p50 / p99 ms | Respuesta p99 ms | Bucle ocupado | CPU proceso % | CPU máquina / steal / espera CPU % | RSS MB | kbit/s por persona | RTT p50 / p99 ms | Hueco snapshots p99 ms | Jitter p50 ms | Fallos / caídas | Veredicto |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
const passing = results.filter((r) => (r.veredicto as { pasa: boolean }).pasa).map((r) => r.pedidos as number);
const failed = results.find((r) => !(r.veredicto as { pasa: boolean }).pasa);
const limite = passing.length ? Math.max(...passing.filter((p) => !failed || p < (failed.pedidos as number))) : 0;
const text = `${header}\n${rows.join("\n")}`;
console.log(`\n${text}\n`);
const notas = results.flatMap((r) => [...(r.veredicto as { motivos: string[] }).motivos.map((x) => `✗ ${x}`), ...(r.veredicto as { avisos: string[] }).avisos.map((x) => `! ${x}`)].map((m) => `${f(r.pedidos)}: ${m}`));
for (const m of notas) console.log(`  ${m}`);
// E7: one unreliable level makes the whole report unreliable, with the reasons on top (a stair read across levels mixes them).
const noFiables = results.filter((r) => !(r.veredicto as { fiable: boolean }).fiable)
  .map((r) => `${f(r.pedidos)} personas: ${(r.veredicto as { avisos: string[] }).avisos.filter((a) => a.startsWith("NO FIABLE")).map((a) => a.slice(11)).join("; ")}`);
const fiableTodo = noFiables.length === 0;
if (!fiableTodo) console.log(`[enjambre] INFORME NO FIABLE: ${noFiables.join(" · ")}`);
console.log(`[enjambre] límite medido (mayor nivel que pasa antes del primer fallo): ${limite || "ninguno"}`);

const report = {
  schema: "numinia-engine/informe@1", fecha: started.toISOString(), etiqueta: label, url, metricas: metricsUrl, argumentos: argv.slice(2),
  servidor: { version: first?.version ?? null, entorno: first?.entorno ?? null }, generador: entorno(), puertas: PUERTAS,
  fiable: fiableTodo, noFiable: noFiables, limiteMedido: limite, resultados: results,
};
let dir = arg("salida", "informes");
try { mkdirSync(dir, { recursive: true }); } catch { dir = os.tmpdir(); }
const base = join(dir, `${started.toISOString().slice(0, 16).replace(/[:T]/g, "-")}${label ? `-${label.replace(/[^a-z0-9_-]/gi, "")}` : ""}`);
try {
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(`${base}.md`, `# Informe de capacidad ${started.toISOString()}${label ? ` · ${label}` : ""}${fiableTodo ? "" : " · NO FIABLE"}\n\n${fiableTodo ? "" : `**NO FIABLE** (la medida es de la máquina, no del motor; repítela con el servidor en un núcleo libre):\n\n${noFiables.map((x) => `- ${x}`).join("\n")}\n\n`}Servidor: ${JSON.stringify(first?.entorno ?? "sin datos")}\n\nGenerador: ${JSON.stringify(entorno())}\n\n${text}\n\nLímite medido: **${limite || "ninguno"}**${fiableTodo ? "" : " (NO FIABLE)"}\n${notas.length ? `\n${notas.map((x) => `- ${x}`).join("\n")}\n` : ""}`);
  console.log(`[enjambre] informe: ${base}.json y ${base}.md`);
} catch (e) { console.log(`[enjambre] no pude escribir el informe: ${(e as Error).message}`); }
process.exit(0);
