// H1 (espacio base): the pure relief every character is born on — flat plateau, then mountain / plain / cleft by sector.
import { test } from "node:test";
import assert from "node:assert/strict";
import { alturaBase, spawnBase, semillaEntera, RADIO_MESETA } from "../packages/relieve/src/espacio-base.ts";

const SEMILLAS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1);

test("same seed, same heights (integer and string seeds); different seeds differ", () => {
  let dif = 0;
  for (let x = -300; x <= 300; x += 37) for (let z = -300; z <= 300; z += 41) {
    assert.equal(alturaBase(42, x, z), alturaBase(42, x, z));
    assert.equal(alturaBase("plaza", x, z), alturaBase("plaza", x, z));
    assert.ok(Number.isFinite(alturaBase("plaza", x, z)));
    if (Math.abs(alturaBase(42, x, z) - alturaBase(43, x, z)) > 0.05) dif++;
  }
  assert.ok(dif > 20, `seeds 42 and 43 should differ (got ${dif})`);
  assert.notEqual(alturaBase("a", 150, 90), alturaBase("b", 150, 90));
});

test("string seeds hash with our own stable function (fixed values, not the engine's)", () => {
  assert.equal(semillaEntera(""), semillaEntera(""));
  assert.equal(semillaEntera(7), 7);
  assert.equal(semillaEntera("numinia"), semillaEntera("numinia"));
  assert.notEqual(semillaEntera("numinia"), semillaEntera("numinib"));
  assert.equal(semillaEntera("numinia"), 1829345518, "FNV-1a + avalanche must never change: it would move every world");
});

test("the spawn is always on dead-flat ground: exactly 0 within the plateau, for any seed", () => {
  const p = spawnBase();
  assert.equal(alturaBase(1, p.x, p.z), p.y);
  assert.equal(p.y, 0);
  for (const s of SEMILLAS) for (let r = 0; r <= RADIO_MESETA - 0.1; r += 2) for (let k = 0; k < 12; k++) {
    const t = (k * Math.PI) / 6 + r, h = alturaBase(s, r * Math.cos(t), r * Math.sin(t));
    assert.ok(Object.is(h, 0), `seed ${s} r=${r}: ${h}`); // Object.is: not even −0
  }
  for (const [x, z] of [[26, 0], [0, 26], [-26, 0], [0, -26]]) for (const s of SEMILLAS) assert.ok(Object.is(alturaBase(s, x, z), 0), `seed ${s} at the edge`);
  assert.ok(Math.abs(alturaBase(5, 200, 0)) + Math.abs(alturaBase(5, 0, 200)) > 0, "outside, the ground does rise or sink");
});

test("1000 seeds: always a mountain (>20 m) and a plain or a cleft in the 100–300 m ring; never a slope above 1.5", () => {
  let sinMonte = 0, sinVariedad = 0, maxPend = 0, maxAlt = -Infinity, minAlt = Infinity;
  const dirs = [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
  for (const s of SEMILLAS) {
    let monte = false, llano = false, hendidura = false;
    for (let r = 100; r <= 300; r += 20) for (let k = 0; k < 72; k++) {
      const t = (k * Math.PI) / 36 + r * 0.01, x = r * Math.cos(t), z = r * Math.sin(t), h = alturaBase(s, x, z);
      if (h > 20) monte = true;
      if (Math.abs(h) < 2) llano = true;
      if (h < -3) hendidura = true;
      if (h > maxAlt) maxAlt = h;
      if (h < minAlt) minAlt = h;
      for (const [dx, dz] of dirs) { const p = Math.abs(alturaBase(s, x + dx, z + dz) - h); if (p > maxPend) maxPend = p; }
    }
    if (!monte) sinMonte++;
    if (!llano && !hendidura) sinVariedad++;
  }
  assert.equal(sinMonte, 0, "every seed needs a mountain in 100–300 m");
  assert.equal(sinVariedad, 0, "every seed needs a plain and/or a cleft in 100–300 m");
  assert.ok(maxPend <= 1.5, `slope at 1 m must stay ≤ 1.5 (45°), got ${maxPend}`);
  assert.ok(maxAlt < 90 && minAlt > -15, `heights stay in a sane band (${minAlt}…${maxAlt})`);
});

test("the plateau rises smoothly: no step at its edge", () => {
  for (const s of [1, 2, 3, 99, 12345]) for (let k = 0; k < 36; k++) {
    const t = (k * Math.PI) / 18, a = alturaBase(s, 25.9 * Math.cos(t), 25.9 * Math.sin(t)), b = alturaBase(s, 27 * Math.cos(t), 27 * Math.sin(t));
    assert.equal(a, 0);
    assert.ok(Math.abs(b) < 0.1, `seed ${s}: ${b} one metre past the edge`);
  }
});

test("speed: 100 000 calls in under 200 ms", () => {
  let acc = 0;
  for (let i = 0; i < 5000; i++) acc += alturaBase(1 + (i % 5), i, i * 0.5); // warm-up
  let mejor = Infinity;
  for (let ronda = 0; ronda < 3; ronda++) { // best of three: one noisy neighbour must not fail the gate
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) acc += alturaBase(1 + (i % 5), (i % 631) - 300, ((i * 7) % 613) - 300);
    mejor = Math.min(mejor, performance.now() - t0);
  }
  assert.ok(Number.isFinite(acc));
  assert.ok(mejor < 200, `100k calls took ${mejor.toFixed(0)} ms`);
});
