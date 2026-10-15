// bench: how fast is THIS machine's core at the engine's real job, with no network and no bots process?
// A plaza of N people inside one Instance, ticked in a tight loop; prints one JSON line (and one for people).
//   node packages/server/src/bench.ts [--bots 1000] [--ticks 400] [--warmup 60] [--rounds 3]
// Run it on every candidate machine BEFORE the load test: two machines with the same index will carry the
// same number of people (the swarm then adds the network, Caddy and the neighbours on top).
import { performance } from "node:perf_hooks";
import { hex } from "../../core/src/index.ts";
import { Bot, Instance } from "../../instance/src/index.ts";
import { entorno } from "./runtime.ts";
import { median } from "./hist.ts";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const nBots = arg("bots", 1000), ticks = arg("ticks", 400), warmup = arg("warmup", 60), rounds = arg("rounds", 3);

function once(): { p50: number; p99: number; worst: number; hash: string } {
  const inst = new Instance({ seed: 7, capacity: nBots + 8, k: 50, snapshotEvery: 2 });
  const bots: Bot[] = [];
  for (let i = 0; i < nBots; i++) bots.push(new Bot(inst.join(i), (7 ^ (i * 0x9e3779b1)) >>> 0));
  const ms: number[] = [];
  for (let t = 0; t < ticks; t++) {
    for (const b of bots) b.think();
    const a = performance.now();
    inst.tick();
    if (t >= warmup) ms.push(performance.now() - a);
  }
  ms.sort((x, y) => x - y);
  const at = (q: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * q))];
  return { p50: at(0.5), p99: at(0.99), worst: ms[ms.length - 1], hash: hex(inst.hash()) };
}

const runs = Array.from({ length: rounds }, once);
const r2 = (x: number) => Math.round(x * 100) / 100;
const indice = r2(median(runs.map((r) => r.p50)));
console.log(JSON.stringify({
  schema: "numinia-engine/bench@1", personas: nBots, ticks, rondas: rounds, entorno: entorno(),
  tickP50Ms: indice, tickP99Ms: r2(median(runs.map((r) => r.p99))), peorMs: r2(Math.max(...runs.map((r) => r.worst))),
  rondasP50: runs.map((r) => r2(r.p50)), huella: runs[0].hash,
  // headroom: how many times the 50 ms tick fits the median tick
  margenSobreElTick: r2(50 / Math.max(0.01, indice)),
}));
