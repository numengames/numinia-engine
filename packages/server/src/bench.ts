// bench: how fast is THIS machine's core at the engine's real job, with no network and no bots process?
// A plaza of N people inside one Instance, ticked in a tight loop; prints one JSON line on stdout (and a short
// human summary on stderr).
//   node packages/server/src/bench.ts [--bots 1000] [--ticks 460] [--warmup 60] [--rounds 5]
// Run it on every candidate machine BEFORE the load test: two machines with the same index will carry the
// same number of people (the swarm then adds the network, Caddy and the neighbours on top).
// Compare two runs (base vs new) with `node tools/banco-comparar.mjs base.json nuevo.json`.
//
// bench@2 (B1): the engine's ticks are of two kinds — with a snapshot send (every `snapshotEvery`-th, ~7 ms for
// 1.000) and without (~0,2 ms). bench@1 took one p50 of both mixed, so the "index" landed right on the border and
// flipped from 7 ms to 0,5 ms when the tick count changed parity. Now each kind is its own population, plus the
// whole CYCLE (the ticks of one snapshot period, 100 ms of game time). p99s are taken over all rounds pooled
// (≥ 1.000 samples by default, so 10 lie above it: a real p99, not "the worst of 80"). Every metric also gets
// the median, min, max and spread of its per-round values, which is what `tools/banco-comparar.mjs` judges.
// The bench@1 fields stay (same names): tickP50Ms/tickP99Ms/rondasP50/margenSobreElTick are now the tick WITH
// send (the one that must fit in the 50 ms tick), which is what bench@1 meant when the parity was right.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { hex } from "../../core/src/index.ts";
import { Bot, Instance } from "../../instance/src/index.ts";
import { entorno } from "./runtime.ts";
import { median } from "./hist.ts";

export const SNAPSHOT_EVERY = 2, TICK_MS = 50;

/** Nearest-rank quantile of an already sorted list (q in 0..1): the smallest value with at least q of the list at or
 * below it. p50 of [1,2,3,4] = 2; p99 of 1.000 values = the 990th, so 10 values lie above it. */
export function cuantil(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
}

/** Split one round's timed ticks into the two populations and the cycles. `conEnvio[i]` = tick i sent snapshots.
 * A cycle is the ticks from just after one send up to and including the next send; only complete cycles
 * (exactly `every` ticks) count, so a leading or trailing half cycle never enters. */
export function separar(ms: number[], conEnvio: boolean[], every = SNAPSHOT_EVERY, antesEnvio = false): { envio: number[]; sinEnvio: number[]; ciclos: number[] } {
  const envio: number[] = [], sinEnvio: number[] = [], ciclos: number[] = [];
  let acc = 0, n = 0, empezado = antesEnvio; // antesEnvio: the last untimed tick sent, so the first cycle starts at tick 0
  for (let i = 0; i < ms.length; i++) {
    (conEnvio[i] ? envio : sinEnvio).push(ms[i]);
    if (empezado) { acc += ms[i]; n++; }
    if (conEnvio[i]) {
      if (empezado && n === every) ciclos.push(acc);
      empezado = true; acc = 0; n = 0;
    }
  }
  return { envio, sinEnvio, ciclos };
}

export type Poblacion = { n: number; p50: number; p99: number; peor: number; p99Fiable: boolean };
/** p50/p99/worst of a population. The p99 is "fiable" only with ≥ 10 samples above it (n ≥ 1.000). */
export function poblacion(xs: number[]): Poblacion {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: r3(cuantil(s, 0.5)), p99: r3(cuantil(s, 0.99)), peor: r3(s.at(-1) ?? 0), p99Fiable: s.length >= 1000 };
}

export type Rondas = { mediana: number; min: number; max: number; dispersion: number; rondas: number[] };
/** Per-round values of one metric: median, min, max and spread = sample standard deviation / median (0..1). */
export function rondas(xs: number[]): Rondas {
  const m = median(xs), k = xs.length;
  const media = xs.reduce((a, b) => a + b, 0) / Math.max(1, k);
  const sd = k > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - media) ** 2, 0) / (k - 1)) : 0;
  return { mediana: r3(m), min: r3(Math.min(...xs)), max: r3(Math.max(...xs)), dispersion: m > 0 ? r4(sd / m) : 0, rondas: xs.map(r3) };
}

type Ronda = { envio: number[]; sinEnvio: number[]; ciclos: number[]; peor: number; hash: string };

/** One round: a fresh instance, `ticks` ticks, the first `warmup` not timed. Which tick sent is read from the
 * instance itself (`sim.tick % snapshotEvery` after the tick), so neither --ticks nor --warmup can shift it. */
export function ronda(o: { bots: number; ticks: number; warmup: number }): Ronda {
  const inst = new Instance({ seed: 7, capacity: o.bots + 8, k: 50, snapshotEvery: SNAPSHOT_EVERY });
  const bots: Bot[] = [];
  for (let i = 0; i < o.bots; i++) bots.push(new Bot(inst.join(i), (7 ^ (i * 0x9e3779b1)) >>> 0));
  const ms: number[] = [], conEnvio: boolean[] = [];
  let antesEnvio = false;
  for (let t = 0; t < o.ticks; t++) {
    for (const b of bots) b.think();
    const a = performance.now();
    inst.tick();
    const d = performance.now() - a;
    const envio = inst.sim.tick % SNAPSHOT_EVERY === 0;
    if (t >= o.warmup) { ms.push(d); conEnvio.push(envio); } else antesEnvio = envio;
  }
  return { ...separar(ms, conEnvio, SNAPSHOT_EVERY, antesEnvio), peor: Math.max(0, ...ms), hash: hex(inst.hash()) };
}

/** Where and on what this was measured, beyond `entorno()`: engine version and commit, load, CPU pinning, governor. */
export function entornoBanco(): Record<string, unknown> {
  const raiz = fileURLToPath(new URL("../../../", import.meta.url));
  const leer = (f: string): string | null => { try { return readFileSync(f, "utf8").trim(); } catch { return null; } };
  let commit: string | null = null;
  try { commit = execFileSync("git", ["-C", raiz, "rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a git checkout */ }
  let version: string | null = null;
  try { version = JSON.parse(leer(`${raiz}package.json`) ?? "{}").version ?? null; } catch { /* no package.json */ }
  const afinidad = /Cpus_allowed_list:\s*(\S+)/.exec(leer("/proc/self/status") ?? "")?.[1] ?? null;
  return {
    ...entorno(), motor: version, commit, carga1m: r2(os.loadavg()[0]),
    nucleosPermitidos: afinidad, gobernador: leer("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"),
  };
}

export function banco(o: { bots: number; ticks: number; warmup: number; rounds: number }) {
  const ent = entornoBanco();
  const rs = Array.from({ length: o.rounds }, () => ronda(o));
  const todas = (k: "envio" | "sinEnvio" | "ciclos") => rs.flatMap((r) => r[k]);
  const porRonda = (k: "envio" | "sinEnvio" | "ciclos", q: number) => rondas(rs.map((r) => cuantil([...r[k]].sort((a, b) => a - b), q)));
  const pob = { conEnvio: poblacion(todas("envio")), sinEnvio: poblacion(todas("sinEnvio")), ciclo: poblacion(todas("ciclos")) };
  const metricas = {
    cicloP50Ms: porRonda("ciclos", 0.5), cicloP99Ms: porRonda("ciclos", 0.99),
    tickConEnvioP50Ms: porRonda("envio", 0.5), tickConEnvioP99Ms: porRonda("envio", 0.99),
    tickSinEnvioP50Ms: porRonda("sinEnvio", 0.5), tickSinEnvioP99Ms: porRonda("sinEnvio", 0.99),
  };
  const avisos: string[] = [];
  const nucleos = Number(ent.nucleos) || 1, carga = Number(ent.carga1m) || 0;
  if (carga > nucleos / 2) avisos.push(`NO FIABLE: carga media ${carga} con ${nucleos} núcleos (más de la mitad ocupada por otros)`);
  if (new Set(rs.map((r) => r.hash)).size > 1) avisos.push("NO FIABLE: las rondas acabaron con huellas distintas (la escena no es determinista)");
  if (!pob.conEnvio.p99Fiable) avisos.push(`p99 con pocas muestras (${pob.conEnvio.n} ticks con envío; hacen falta 1.000): súbele --ticks o --rounds`);
  if (o.rounds < 3) avisos.push("menos de 3 rondas: sin dispersión útil, banco-comparar no podrá juzgar");
  const indice = metricas.tickConEnvioP50Ms.mediana;
  return {
    schema: "numinia-engine/bench@2", personas: o.bots, ticks: o.ticks, calentamiento: o.warmup, rondas: o.rounds,
    entorno: ent, fiable: !avisos.some((a) => a.startsWith("NO FIABLE")), avisos,
    // bench@1 names, now about the tick WITH send (median over rounds; p99 over all rounds pooled)
    tickP50Ms: r2(indice), tickP99Ms: r2(pob.conEnvio.p99), peorMs: r2(Math.max(...rs.map((r) => r.peor))),
    rondasP50: metricas.tickConEnvioP50Ms.rondas.map(r2), huella: rs[0].hash,
    // headroom: how many times the tick with send fits in the 50 ms tick (the tick that must not overrun)
    margenSobreElTick: r2(TICK_MS / Math.max(0.01, indice)),
    // headroom of the whole cycle: its game time (snapshotEvery × 50 ms) over its typical cost
    margenSobreElCiclo: r2((SNAPSHOT_EVERY * TICK_MS) / Math.max(0.01, metricas.cicloP50Ms.mediana)),
    poblaciones: pob, metricas,
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000, r4 = (x: number) => Math.round(x * 10000) / 10000;
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

/** Run as a command (not imported): argv[1] is this file, also through a symlinked folder (/home → /var/home). */
const esOrden = (): boolean => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (esOrden()) {
  const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const o = { bots: arg("bots", 1000), ticks: arg("ticks", 460), warmup: arg("warmup", 60), rounds: arg("rounds", 5) };
  if (!(o.ticks - o.warmup >= 2 * SNAPSHOT_EVERY) || !(o.rounds >= 1) || !(o.bots >= 1)) {
    console.error("bench: hacen falta --ticks ≥ --warmup + 4, --rounds ≥ 1 y --bots ≥ 1"); process.exit(2);
  }
  const r = banco(o);
  console.log(JSON.stringify(r));
  const m = r.metricas, l = (n: string, x: Rondas) => `  ${n.padEnd(22)} ${x.mediana.toFixed(2).padStart(7)} ms   (${x.min.toFixed(2)}–${x.max.toFixed(2)}, dispersión ${pct(x.dispersion)})`;
  console.error([
    `bench@2 · ${o.bots} personas · ${o.rounds} rondas × ${o.ticks - o.warmup} ticks medidos · motor ${r.entorno.motor ?? "?"} (${r.entorno.commit ?? "?"}) · carga ${r.entorno.carga1m}`,
    l("ciclo (100 ms) p50", m.cicloP50Ms), l("tick con envío p50", m.tickConEnvioP50Ms), l("tick sin envío p50", m.tickSinEnvioP50Ms),
    `  p99 de verdad (rondas juntas): con envío ${r.poblaciones.conEnvio.p99} ms (n=${r.poblaciones.conEnvio.n}) · ciclo ${r.poblaciones.ciclo.p99} ms (n=${r.poblaciones.ciclo.n})`,
    `  margen: el tick con envío cabe ${r.margenSobreElTick} veces en 50 ms; el ciclo, ${r.margenSobreElCiclo} veces en 100 ms · huella ${r.huella}`,
    ...r.avisos.map((a) => `  ⚠ ${a}`),
  ].join("\n"));
}
