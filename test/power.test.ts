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
  for (let t = 0; t < 4000; t += 33) if (p.reportCost(30, 33)) changed++; // 30 ms of work in a 33 ms budget
  assert.ok(changed >= 1 && p.scale < 1, `scale ${p.scale}`);
  for (let t = 0; t < 60000; t += 33) p.reportCost(30, 33);
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
