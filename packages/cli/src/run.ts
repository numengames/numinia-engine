// cli: `node packages/cli/src/run.ts --ticks 10000 --seed 42 --bots 50 --k 50`
// Prints the final state fingerprint plus the numbers the gates judge. Timing is measured, never simulated.
import { hex } from "../../core/src/index.ts";
import { Instance, Bot } from "../../instance/src/index.ts";
import { TICK_HZ } from "../../sim/src/index.ts";

export type RunResult = { hash: string; ticks: number; bots: number; k: number; tickP50ms: number; tickP99ms: number; bytesPerClientPerSec: number; avgVisible: number };

export function runHeadless(o: { ticks: number; seed: number; bots: number; k: number; warmup?: number }): RunResult {
  const inst = new Instance({ seed: o.seed, capacity: o.bots + 8, k: o.k, snapshotEvery: 2 });
  const bots: Bot[] = [];
  for (let i = 0; i < o.bots; i++) bots.push(new Bot(inst.join(i), (o.seed ^ (i * 0x9e3779b1)) >>> 0));
  const warmup = Math.min(o.warmup ?? 20, Math.floor(o.ticks / 2)); // the JIT is still compiling during the first ticks
  const times: number[] = [];
  let visibleSum = 0;
  for (let t = 0; t < o.ticks; t++) {
    for (const b of bots) b.think();
    const t0 = performance.now();
    inst.tick();
    if (t >= warmup) times.push(performance.now() - t0);
    if (t === o.ticks - 1) for (const b of bots) { b.t.flush?.(); visibleSum += b.seen; }
  }
  times.sort((a, b) => a - b);
  const pct = (p: number) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * p))] * 1000) / 1000;
  const seconds = o.ticks / TICK_HZ;
  return {
    hash: hex(inst.hash()), ticks: o.ticks, bots: o.bots, k: o.k,
    tickP50ms: pct(0.5), tickP99ms: pct(0.99),
    bytesPerClientPerSec: Math.round(inst.sentBytes() / Math.max(1, o.bots) / seconds),
    avgVisible: Math.round((visibleSum / Math.max(1, o.bots)) * 10) / 10,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = (name: string, d: number) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const r = runHeadless({ ticks: arg("ticks", 2000), seed: arg("seed", 42), bots: arg("bots", 50), k: arg("k", 50) });
  console.log(JSON.stringify(r));
}
