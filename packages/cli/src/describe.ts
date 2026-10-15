// cli: `npm run describe -- --bots 6 --ticks 100 --seed 42` prints the state of a headless instance as
// readable JSON: entities, positions in metres, and who sees whom. For humans and LLMs; no screen needed.
// `npm run describe -- --catalogo` prints instead what the game features offer: verbs (intents), events, state.
// Composition root (tools/layers.json, "_composition"): it may import features/.
import { fxToFloat, hex } from "../../core/src/index.ts";
import { Instance, Bot } from "../../instance/src/index.ts";
import { TICK_HZ } from "../../sim/src/index.ts";
import { buildGrid, selectVisible } from "../../net/src/index.ts";
import { buildCatalog } from "../../feature/src/index.ts";
import funciones from "../../../features/servidor.ts";

export type Description = {
  schema: "numinia-engine/describe@1"; seed: number; tick: number; seconds: number; hash: string;
  entities: { id: number; x: number; z: number; sees: number[] }[];
};

export function describeInstance(o: { seed: number; bots: number; ticks: number; k: number }): Description {
  const inst = new Instance({ seed: o.seed, capacity: o.bots + 8, k: o.k, snapshotEvery: 2 });
  const bots: Bot[] = [];
  for (let i = 0; i < o.bots; i++) bots.push(new Bot(inst.join(i), (o.seed ^ (i * 0x9e3779b1)) >>> 0));
  for (let t = 0; t < o.ticks; t++) { for (const b of bots) b.think(); inst.tick(); }
  const grid = buildGrid(inst.sim);
  const r2 = (n: number) => Math.round(fxToFloat(n) * 100) / 100;
  const entities = inst.conns.map((c) => ({
    id: c.entity,
    x: r2(inst.sim.tf.cols.x[c.entity]),
    z: r2(inst.sim.tf.cols.z[c.entity]),
    sees: selectVisible(inst.sim, grid, c.viewer, o.k).slice().sort((a, b) => a - b),
  }));
  return { schema: "numinia-engine/describe@1", seed: o.seed, tick: inst.sim.tick, seconds: inst.sim.tick / TICK_HZ, hash: hex(inst.hash()), entities };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = (name: string, d: number) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  if (process.argv.includes("--catalogo")) console.log(JSON.stringify(buildCatalog(funciones.map((f) => f.feature)).catalog, null, 2));
  else console.log(JSON.stringify(describeInstance({ seed: arg("seed", 42), bots: arg("bots", 6), ticks: arg("ticks", 100), k: arg("k", 50) }), null, 2));
}
