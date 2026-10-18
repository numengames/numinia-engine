// pesca in VR: the rod's gestures (features/pesca/gestos.ts) read a cast and a strike from the rod tip's samples,
// whatever the frame rate, fire once per swing, and do not mistake walking or a lift for a cast. The reel's hysteresis
// keeps a half-pressed trigger from flickering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearGestos, conHisteresis, GESTOS } from "../features/pesca/gestos.ts";

/** Move the tip from `a` to `b` in `ms`, sampled every `paso` ms; returns every gesture seen. */
function barrer(g: ReturnType<typeof crearGestos>, a: number[], b: number[], ms: number, paso: number, t0 = 0, mirada = { x: 0, z: -1 }) {
  const vistos: string[] = [];
  for (let t = 0; t <= ms; t += paso) {
    const k = t / ms;
    const r = g.muestra({ t: t0 + t, x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k }, mirada);
    if (r.lanzar) vistos.push("lanzar");
    if (r.tiron) vistos.push("tiron");
  }
  return vistos;
}

test("a forward flick of the rod tip is one cast, at 72 Hz and at 15 Hz", () => {
  for (const paso of [14, 66]) {
    const g = crearGestos();
    // the tip from above-behind the head to in front and lower: 1.4 m forward in 0.25 s (5.6 m/s)
    assert.deepEqual(barrer(g, [0, 2.4, 0.3], [0, 1.6, -1.1], 250, paso), ["lanzar"], `paso ${paso} ms`);
  }
});

test("the cast follows where you look, not the world's -z", () => {
  const g = crearGestos();
  assert.deepEqual(barrer(g, [0, 2, 0], [1.4, 1.6, 0], 250, 14, 0, { x: 1, z: 0 }), ["lanzar"]);
  const h = crearGestos(); // the same swing while looking the other way is not a cast
  assert.deepEqual(barrer(h, [0, 2, 0], [1.4, 1.6, 0], 250, 14, 0, { x: -1, z: 0 }).filter((x) => x === "lanzar"), []);
});

test("walking with the rod, or moving it slowly, is nothing", () => {
  const g = crearGestos();
  assert.deepEqual(barrer(g, [0, 1.5, 0], [0, 1.5, -1.5], 1000, 14), []); // 1.5 m/s
  assert.deepEqual(barrer(g, [0, 1.5, 0], [0.3, 1.8, -0.4], 600, 14), []);
});

test("lifting the rod fast is a strike (tirón), not a cast; one per swing", () => {
  const g = crearGestos();
  assert.deepEqual(barrer(g, [0, 1.2, -1], [0, 2.2, -0.8], 250, 14), ["tiron"]);
  // pulling it back toward you with a little lift also strikes
  const h = crearGestos();
  assert.deepEqual(barrer(h, [0, 1.4, -1.2], [0, 1.6, 0], 300, 14), ["tiron"]);
  // two swings far enough apart: two strikes
  const k = crearGestos();
  const a = barrer(k, [0, 1.2, -1], [0, 2.2, -0.8], 250, 14, 0);
  const b = barrer(k, [0, 1.2, -1], [0, 2.2, -0.8], 250, 14, 250 + GESTOS.enfriarMs + 50);
  assert.deepEqual([...a, ...b], ["tiron", "tiron"]);
});

test("a gap in the samples (a dropped frame or the hand lost) does not invent speed", () => {
  const g = crearGestos();
  g.muestra({ t: 0, x: 0, y: 1.5, z: 0 }, { x: 0, z: -1 });
  const r = g.muestra({ t: 900, x: 0, y: 1.5, z: -3 }, { x: 0, z: -1 }); // 3 m but in 0.9 s, and stale
  assert.equal(r.lanzar, false);
  g.reiniciar();
  assert.equal(g.muestra({ t: 1000, x: 0, y: 1.5, z: -9 }, { x: 0, z: -1 }).lanzar, false); // one sample is no speed
});

test("a few centimetres in one frame (a pinch closing, a hand's joints jumping) is fast but no swing", () => {
  const g = crearGestos();
  g.muestra({ t: 0, x: 0, y: 1.5, z: 0 }, { x: 0, z: -1 });
  g.muestra({ t: 33, x: 0, y: 1.5, z: 0 }, { x: 0, z: -1 });
  const r = g.muestra({ t: 50, x: 0, y: 1.56, z: -0.12 }, { x: 0, z: -1 }); // 0.12 m forward in 50 ms = 2.4… and 0.06 up
  const s = g.muestra({ t: 66, x: 0, y: 1.6, z: -0.2 }, { x: 0, z: -1 });  // 0.2 m in 66 ms = 3 m/s, but only 0.2 m
  assert.equal(r.lanzar || s.lanzar || r.tiron || s.tiron, false);
});

test("the reel's hysteresis: on at 0.55, off only below 0.35", () => {
  const h = conHisteresis();
  assert.deepEqual([0.2, 0.5, 0.6, 0.45, 0.36, 0.3, 0.5, 0.56].map(h), [false, false, true, true, true, false, false, true]);
});
