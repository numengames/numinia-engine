#!/usr/bin/env node
// banco-solidos: how much does `solids` cost per tick, with N1's grid (32 m cells) consulted by cell instead of
// the whole list scanned on every avatar move? Same shape as N1's hand measurement in limits.json (solidos_max):
// 1.000 avatars walking north, `solids` set directly with setSolids (bypassing solidsFrom's SOLIDS_MAX=512 slice,
// exactly like N1 did, to see the real cost of the count asked for), boxes scattered over the whole ±2000 m world
// so the grid sees a realistic, not pathologically-clustered, spread.
//   node tools/banco-solidos.mjs [--bots 1000] [--ticks 300] [--warmup 60]
import { performance } from "node:perf_hooks";
import { createSim, spawnAvatar, step, setSolids, INPUT_STRIDE } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";

function boxesScattered(n) {
  const b = new Int32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const cx = fx(((i * 977) % 3900) - 1950), cz = fx(((i * 1301) % 3900) - 1950);
    const o = i * 6;
    b[o] = cx - fx(1); b[o + 1] = 0; b[o + 2] = cz - fx(1);
    b[o + 3] = cx + fx(1); b[o + 4] = fx(1); b[o + 5] = cz + fx(1);
  }
  return b;
}

function cuantil(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))]; }
const r3 = (x) => Math.round(x * 1000) / 1000;

export function medir({ bots, solidos, ticks, warmup }) {
  const s = createSim(bots + 8, 7);
  const es = [];
  for (let i = 0; i < bots; i++) es.push(spawnAvatar(s, i));
  if (solidos > 0) setSolids(s, boxesScattered(solidos));
  const inputs = new Int32Array(bots * INPUT_STRIDE);
  for (let i = 0; i < bots; i++) { inputs[i * INPUT_STRIDE] = es[i]; inputs[i * INPUT_STRIDE + 1] = 127; }
  const ms = [];
  for (let t = 0; t < ticks; t++) {
    const a = performance.now();
    step(s, inputs);
    const d = performance.now() - a;
    if (t >= warmup) ms.push(d);
  }
  ms.sort((x, y) => x - y);
  return { bots, solidos, p50: r3(cuantil(ms, 0.5)), p99: r3(cuantil(ms, 0.99)) };
}

const esOrden = () => { try { return process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]; } catch { return false; } };
if (esOrden() || process.argv[1]?.endsWith("banco-solidos.mjs")) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const o = { bots: arg("bots", 1000), ticks: arg("ticks", 300), warmup: arg("warmup", 60) };
  for (const solidos of [0, 512, 2000]) {
    const r = medir({ ...o, solidos });
    console.log(JSON.stringify(r));
  }
}
