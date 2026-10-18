import { test } from "node:test";
import assert from "node:assert/strict";
import { createPower, checkCost } from "../packages/render/src/power.ts";

const phone = { coarsePointer: true, saveData: false, deviceMemoryGB: 4, dpr: 3 };
const desk = { coarsePointer: false, saveData: false, deviceMemoryGB: 16, dpr: 2 };

// count draws over `ms` of a 120 Hz display loop
function drawsIn(p: ReturnType<typeof createPower>, ms: number, f: { hidden: boolean; active: boolean }) {
  let n = 0;
  for (let t = 0; t < ms; t += 1000 / 120) if (p.shouldDraw(t, f)) n++;
  return n;
}

test("mobile class: 30 fps cap, pixel ratio 1.25; desktop 60 fps, ratio 2", () => {
  const p = createPower(phone), d = createPower(desk);
  assert.equal(p.mobile, true);
  assert.equal(p.pixelRatio(), 1.25);
  assert.equal(d.pixelRatio(), 2);
  const n = drawsIn(p, 1000, { hidden: false, active: true });
  assert.ok(n >= 28 && n <= 31, `phone drew ${n} in 1 s`);
  const m = drawsIn(d, 1000, { hidden: false, active: true });
  assert.ok(m >= 58 && m <= 61, `desktop drew ${m} in 1 s`);
});

test("idle draws 10-15 fps on mobile, hidden draws nothing, battery mode is cooler", () => {
  const p = createPower(phone);
  const idle = drawsIn(p, 1000, { hidden: false, active: false });
  assert.ok(idle >= 10 && idle <= 15, `idle drew ${idle}`);
  assert.equal(drawsIn(createPower(phone), 1000, { hidden: true, active: true }), 0);
  const b = createPower(phone, { battery: true });
  assert.equal(b.pixelRatio(), 1);
  assert.ok(drawsIn(b, 1000, { hidden: false, active: true }) <= 25);
});

test("dynamic resolution: sustained slowness lowers it, sustained headroom restores it, never below 0.5", () => {
  const p = createPower(phone);
  let changed = 0;
  // B4: the load is GPU-like (scales with the pixels: 100 ms at full resolution), so each drop really helps
  for (let t = 0; t < 5000; t += 33) if (p.reportCost(100 * p.scale ** 2, 33)) changed++; // 2 windows of 2 s
  assert.ok(changed >= 1 && p.scale < 1, `scale ${p.scale}`);
  for (let t = 0; t < 60000; t += 33) p.reportCost(100 * p.scale ** 2, 33);
  assert.equal(p.scale, 0.5);
  for (let t = 0; t < 60000; t += 33) p.reportCost(2, 33);
  assert.equal(p.scale, 1);
  const q = createPower(phone);
  for (let t = 0; t < 30000; t += 33) q.reportCost(15, 33); // in between: stays put
  assert.equal(q.scale, 1);
});

test("cost gate says how to fix a breach", () => {
  assert.deepEqual(checkCost({ calls: 10, triangles: 1000, cpuMs: 1 }, { calls: 80, triangles: 150000 }), []);
  const bad = checkCost({ calls: 200, triangles: 1e6, cpuMs: 1 }, { calls: 80, triangles: 150000 });
  assert.equal(bad.length, 2);
  assert.match(bad[0], /instance/);
});

// ---- B4: a synthetic series of frames (60 Hz desktop, budget 16.7 ms) ----
// A frame's cost: a number (CPU, does not change with resolution) or a function of the scale (GPU-like: ∝ pixels).
type Cuadro = { cost: number | ((escala: number) => number); dt: number; compila?: boolean; cargando?: boolean };
const gpu = (msAPlena: number) => (s: number) => msAPlena * s * s;
/** Feed a series; returns the scale after each frame, the changes (frame time at which each happened) and the end. */
function correr(p: ReturnType<typeof createPower>, serie: Cuadro[]) {
  let t = 0; const cambios: number[] = [];
  for (const c of serie) {
    p.setCargando(!!c.cargando);
    if (c.compila) p.paron();                       // what the view does when three made a program this frame
    t += c.dt;
    if (p.reportCost(typeof c.cost === "number" ? c.cost : c.cost(p.scale), c.dt)) { cambios.push(t); p.paron(2); } // what applyPixelRatio does
  }
  return { cambios, escala: p.scale };
}
const quieto = (ms: number, cost: Cuadro["cost"] = 2.5, dt = 16.7): Cuadro[] => Array.from({ length: Math.round(ms / dt) }, () => ({ cost, dt }));
/** Steady light frames with a compile stall (300-1700 ms of cost, frame interval clamped at 250 ms like main.ts) every `cada` ms. */
function conPicos(ms: number, cada: number, marcados: boolean, dt = 16.7): Cuadro[] {
  const out: Cuadro[] = []; let t = 0, sig = 1000, k = 0;
  const tam = [300, 900, 1700, 450, 1200];
  while (t < ms) {
    if (t >= sig) { out.push({ cost: tam[k++ % tam.length], dt: 250, compila: marcados }); t += 250; sig += cada; continue; }
    out.push({ cost: 2.5, dt }); t += dt;
  }
  return out;
}

test("B4: isolated compile stalls do not move the resolution (flagged or not)", () => {
  // dt 150 ms = the slow frames R6 saw (SwiftShader; a weak phone): there the old EMA policy changed 5 times, down to 0.5
  for (const marcados of [true, false]) for (const dt of [16.7, 150]) {
    const p = createPower(desk);
    const r = correr(p, conPicos(30000, 2500, marcados, dt)); // 12 stalls of 0.3-1.7 s in 30 s
    assert.equal(r.cambios.length, 0, `marcados=${marcados} dt=${dt}: changed at ${r.cambios}`);
    assert.equal(r.escala, 1);
  }
  // even a burst of 4 stalls in 1.2 s (a room of new materials) is one window: the median ignores it
  const p = createPower(desk);
  const rafaga: Cuadro[] = [...quieto(3000), ...Array.from({ length: 4 }, () => ({ cost: 800, dt: 250 })), ...quieto(1000), ...Array.from({ length: 3 }, () => ({ cost: 600, dt: 250 })), ...quieto(20000)];
  assert.equal(correr(p, rafaga).cambios.length, 0);
});

test("B4: nothing is measured while loading, nor in the 3 s after", () => {
  const p = createPower(desk);
  const carga: Cuadro[] = Array.from({ length: 300 }, () => ({ cost: 40, dt: 50, cargando: true })); // 15 s of heavy loading
  const r = correr(p, [...carga, ...quieto(20000)]);
  assert.equal(r.cambios.length, 0);
  assert.equal(p.scale, 1);
  assert.ok(p.stats.ignorados >= 300);
});

test("B4: sustained load lowers it (with stalls mixed in), changes at least 5 s apart; recovery raises it back", () => {
  const p = createPower(desk);
  const carga = conPicos(20000, 3000, false).map((c) => (c.cost === 2.5 ? { ...c, cost: gpu(22) } : c)); // 22 ms at full res > 70 % of 16.7
  const baja = correr(p, carga);
  assert.ok(baja.cambios.length >= 2, `only ${baja.cambios.length} changes`);
  assert.ok(p.scale < 1);
  for (let i = 1; i < baja.cambios.length; i++) assert.ok(baja.cambios[i] - baja.cambios[i - 1] >= 5000, `changes ${baja.cambios}`);
  assert.ok(baja.cambios[0] >= 4000, "never before 4 s of slowness");
  const sube = correr(p, conPicos(60000, 4000, true)); // back to light frames (with stalls): it climbs back
  assert.equal(p.scale, 1, `stuck at ${p.scale}`);
  assert.ok(sube.cambios.length >= 2);
});

test("B4: a middle load (between 35 % and 70 % of the budget) stays put — the hysteresis band", () => {
  const p = createPower(desk);
  assert.equal(correr(p, quieto(30000, 9)).cambios.length, 0);
  const q = createPower(desk);
  correr(q, quieto(12000, gpu(16))); // drop once or twice
  const bajo = q.scale; assert.ok(bajo < 1);
  assert.equal(correr(q, quieto(30000, gpu(16))).cambios.length, 0, "in the band it neither drops nor climbs");
  assert.equal(q.scale, bajo);
});

test("B4: a load that comes and goes does not make it swing (failed climbs wait longer, a failing level is dropped)", () => {
  const p = createPower(desk);
  let total = 0;
  for (let i = 0; i < 6; i++) { // heavy 10 s / light 20 s, six times (3 min)
    total += correr(p, quieto(10000, gpu(20))).cambios.length;
    total += correr(p, quieto(20000, 2.5)).cambios.length;
  }
  assert.ok(p.stats.techo < 1, `ceiling ${p.stats.techo}`);
  assert.ok(total <= 6, `${total} changes in 3 min (before B4: 7 in 30 s)`);
});

test("B4: when the cost does not fall with the resolution (CPU-bound), it stops lowering after one useless step", () => {
  const p = createPower(desk);
  const r = correr(p, quieto(60000, 14)); // 14 ms of JS whatever the pixels
  assert.equal(r.cambios.length, 1, `changes ${r.cambios}`);
  assert.equal(p.scale, 0.85);
});

test("B4: quality or battery change restarts the measure; ceiling resets with quality", () => {
  const p = createPower(desk);
  correr(p, quieto(3000, 14)); // half-way to a drop
  p.setBattery(false);
  assert.equal(correr(p, quieto(3000, 14)).cambios.length, 0, "the window restarted");
  p.setCalidad("alta");
  assert.equal(p.stats.techo, 1);
});
