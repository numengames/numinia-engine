// N5 · headless proof on the REAL terrain of a world (reads its naturaleza.json): bots walk (and run, and hop) over the hills of the
// real server instance for a few minutes of game time; every tick every avatar is checked against the mesh — no falling through,
// no floating — and the cost of `Instance.tick` is measured with the terrain on and with it off (same bots, same seeds).
// Run: nice node tools/naturaleza-colision.ts [carpeta-del-mundo/entorno] [segundos-de-juego]
import { readFileSync } from "node:fs";
import { Instance, Bot } from "../packages/instance/src/index.ts";
import { rayBvh } from "../packages/sim/src/index.ts";
import { leerNaturaleza } from "../features/naturaleza/esquema.ts";
import { crearNaturaleza } from "../features/naturaleza/server.ts";

const dir = process.argv[2] ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/naturaleza/mundo-demo/entorno";
const segundos = Number(process.argv[3] ?? 120);
const r = leerNaturaleza(JSON.parse(readFileSync(`${dir}/naturaleza.json`, "utf8")));
if (!r.ok) throw new Error(JSON.stringify(r.issues));
const U = 65536;

function correr(conTerreno: boolean, n: number) {
  const inst = new Instance({ seed: 42, capacity: n + 8, k: 50, snapshotEvery: 2, features: conTerreno ? [crearNaturaleza(r.value)] : [] });
  const bots = Array.from({ length: n }, (_, i) => new Bot(inst.join(i), 1000 + i));
  // a first tick builds the terrain (counted apart: it is the one-time cost), then the walk
  const t0 = performance.now(); inst.tick(); const primero = performance.now() - t0;
  // spread the bots over the world: 1 in 2 starts on a random hill spot (so the walk is over relief, not only the plaza)
  const mesh = inst.sim.mesh;
  if (conTerreno && mesh) for (let i = 0; i < n; i++) {
    const e = bots[i].entity, a = (i * 2.399963) % (Math.PI * 2), d = 15 + ((i * 37) % 70);
    inst.sim.tf.cols.x[e] = Math.round(Math.cos(a) * d * U); inst.sim.tf.cols.z[e] = Math.round(Math.sin(a) * d * U);
    const h = rayBvh(mesh, inst.sim.tf.cols.x[e], 40 * U, inst.sim.tf.cols.z[e], 0, -U, 0, 120 * U);
    inst.sim.tf.cols.y[e] = h ? h.y + U : 0;
  }
  const ms: number[] = [];
  let flota = 0, hundido = 0, cae = 0, muestras = 0, ymin = Infinity, ymax = -Infinity, maxSep = 0;
  for (let t = 0; t < segundos * 20; t++) {
    for (const b of bots) {
      // keep the walk inside the world: bots drift to the centre past 80 m (their own rule is 20 m)
      b.think();
      if (conTerreno) { b.x = inst.sim.tf.cols.x[b.entity]; b.z = inst.sim.tf.cols.z[b.entity]; }
    }
    const s0 = performance.now(); inst.tick(); ms.push(performance.now() - s0);
    if (!conTerreno || !mesh) continue;
    for (const b of bots) {
      const e = b.entity, x = inst.sim.tf.cols.x[e], z = inst.sim.tf.cols.z[e], y = inst.sim.tf.cols.y[e], vy = inst.sim.mo.cols.vy[e];
      const h = rayBvh(mesh, x, 40 * U, z, 0, -U, 0, 120 * U);
      muestras++; ymin = Math.min(ymin, y / U); ymax = Math.max(ymax, y / U);
      if (!h) { cae++; continue; }
      const sep = (y - h.y) / U; maxSep = Math.max(maxSep, Math.abs(sep));
      if (vy === 0 && sep > 0.02) flota++;           // standing but above the surface
      if (sep < -0.05) hundido++;                    // under the surface (steep triangles can leave the centre a bit in: counted)
    }
  }
  ms.sort((a, b) => a - b);
  return { n, conTerreno, primero, p50: ms[ms.length >> 1], p99: ms[Math.floor(ms.length * 0.99)], media: ms.reduce((a, b) => a + b, 0) / ms.length, flota, hundido, cae, muestras, ymin, ymax, maxSep };
}

for (const n of [1, 50, 200]) {
  for (const conTerreno of [false, true]) {
    const o = correr(conTerreno, n);
    console.log(`${String(n).padStart(4)} avatars · ${conTerreno ? "con terreno" : "sin terreno"} · primer tick ${o.primero.toFixed(1)} ms · tick p50 ${o.p50.toFixed(3)} ms · p99 ${o.p99.toFixed(3)} ms · media ${o.media.toFixed(3)} ms` +
      (conTerreno ? ` · muestras ${o.muestras} · flotando ${o.flota} · hundidos ${o.hundido} · sin suelo ${o.cae} · y ${o.ymin.toFixed(2)}…${o.ymax.toFixed(2)} · separación máx ${o.maxSep.toFixed(3)} m` : ""));
  }
}
