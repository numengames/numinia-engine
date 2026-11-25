import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearReguladorXR, pedirEscala, XR_ESCALA_SUELO } from "../packages/render/src/regulador-xr.ts";

const HZ = 72, P = 1000 / HZ;
type R = ReturnType<typeof crearReguladorXR>;
// run `ms` of frames; `tardeCada` = one late frame (2 periods) every N frames (0 = none); returns the times of the changes
function correr(r: R, ms: number, cpuMs: number, tardeCada: number, visible = true): number[] {
  const cambios: number[] = []; let antes = r.escala, i = 0;
  for (let t = 0; t < ms; i++) {
    const dt = tardeCada && i % tardeCada === 0 ? 2 * P : P;
    t += dt;
    const e = r.cuadro(dt, cpuMs, HZ, visible);
    if (e !== antes) { cambios.push(Math.round(t)); antes = e; }
  }
  return cambios;
}

test("E2: a session that keeps its rate stays at full size", () => {
  const r = crearReguladorXR();
  assert.deepEqual(correr(r, 60000, 4, 0), []);
  assert.equal(r.escala, 1);
});

test("E2: late frames with a short draw (the GPU is the limit) lower the scale, steps at least 4 s apart, never under the floor", () => {
  const r = crearReguladorXR();
  // GPU-bound and it never gets better enough to stop... but each step does help here: the late share halves per step
  let cada = 3; const todos: number[] = []; let base = 0;
  for (let k = 0; k < 6; k++) { const c = correr(r, 12000, 4, cada); for (const t of c) todos.push(base + t); base += 12000; if (c.length) cada = Math.min(9, cada + 1); }
  assert.ok(todos.length >= 2, `changes ${todos}`);
  assert.ok(todos[0]! >= 5000 + 4000, `first change at ${todos[0]} ms: before the settle time and two slow windows`);
  for (let i = 1; i < todos.length; i++) assert.ok(todos[i]! - todos[i - 1]! >= 4000, `changes ${todos}`);
  assert.ok(r.escala < 1 && r.escala >= XR_ESCALA_SUELO, `scale ${r.escala}`);
});

test("E2: the floor holds however slow it stays", () => {
  const r = crearReguladorXR();
  let cada = 2;
  for (let k = 0; k < 40; k++) { const antes = r.escala; correr(r, 8000, 4, cada); if (r.escala < antes) cada += 2; else cada = Math.max(2, cada - 1); assert.ok(r.escala >= XR_ESCALA_SUELO); }
});

test("E2: late frames with a long draw (the CPU is the limit) do not touch the scale — measured stall of 2026-11-25: 18 ms draws at 72 Hz", () => {
  const r = crearReguladorXR();
  assert.deepEqual(correr(r, 30000, 18, 2), []);
  assert.equal(r.escala, 1);
  assert.ok(r.stats.limitaCPU >= 10, `counted ${r.stats.limitaCPU} CPU-bound windows`);
});

test("E2: a step down that buys nothing is undone and not tried again for a minute", () => {
  const r = crearReguladorXR();
  const c = correr(r, 40000, 4, 3); // GPU-looking slowness that the scale does not fix
  assert.equal(c.length, 2, `changes ${c}`);
  assert.equal(r.escala, 1, "back at full size");
  assert.equal(r.stats.inutiles, 1);
  assert.deepEqual(correr(r, 15000, 4, 3), [], "vetoed");
});

test("E2: headroom raises it back to 1, after 10 s", () => {
  const r = crearReguladorXR();
  correr(r, 10000, 4, 3); // lowered once, at about 9 s
  assert.ok(r.escala < 1);
  const c = correr(r, 30000, 4, 0); // and the step helped: clean frames from here
  assert.equal(r.escala, 1);
  assert.ok(c[0]! >= 10000, `raised after ${c[0]} ms`);
});

test("E2: frames under a system overlay are not judged, and coming back settles first", () => {
  const r = crearReguladorXR();
  assert.deepEqual(correr(r, 30000, 4, 2, false), []);
  const c = correr(r, 8000, 4, 3);
  assert.deepEqual(c, [], "nothing in the first 5 s + 4 s after coming back");
});

test("E2: entering again starts at full size", () => {
  const r = crearReguladorXR();
  correr(r, 14000, 4, 3);
  r.reiniciar();
  assert.equal(r.escala, 1);
});

test("E2: pedirEscala asks every view, and says false where the browser cannot", () => {
  const pedidas: number[] = [];
  const vista = { requestViewportScale: (s: number | null) => { pedidas.push(s as number); } };
  assert.equal(pedirEscala({ getViewerPose: () => ({ views: [vista, vista] }) }, {}, 0.85), true);
  assert.deepEqual(pedidas, [0.85, 0.85]);
  assert.equal(pedirEscala({ getViewerPose: () => ({ views: [{}, {}] }) }, {}, 0.85), false);
  assert.equal(pedirEscala({ getViewerPose: () => null }, {}, 0.85), false);
  assert.equal(pedirEscala(null, {}, 0.85), false);
  assert.equal(pedirEscala({ getViewerPose: () => { throw new Error("x"); } }, {}, 0.85), false);
});

test("E2: the floor published in limits.json is the one the code enforces", () => {
  const lim = (JSON.parse(readFileSync("limits.json", "utf8")).limits as { key: string; value: unknown }[]).find((e) => e.key === "xr_viewport_scale_min");
  assert.equal(lim?.value, XR_ESCALA_SUELO);
});
