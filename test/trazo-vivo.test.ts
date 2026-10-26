// MIS-222 t_1b395abe · J18b story 4 (second slice): the tube grown live under the hand (trazo-tubo.ts `crearTuboVivo`, pure numbers) must be the
// tube the world draws once the hand lets go (`tuboDe`), ring by ring; each new point must rewrite O(1) of the buffers (not the whole stroke);
// and the worst stroke must stay inside the published triangle cap and a 16-bit index.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearTuboVivo, tuboDe, trianguloDe, TRIANGULOS_TRAZO_MAX, INDICES_PUNTA, ladosDe } from "../packages/render/src/trazo-tubo.ts";

const espiral = (n: number, grosor = 0.015) => ({ color: 1, grosor, puntos: Array.from({ length: n }, (_, i) => [Math.cos(i / 6) * 0.3, i * 0.004, Math.sin(i / 6) * 0.3, 0.2 + ((i * 37) % 80) / 100]) });
const cerca = (a: ArrayLike<number>, b: ArrayLike<number>, n: number, eps = 1e-5, que = "") => { for (let i = 0; i < n; i++) assert.ok(Math.abs(a[i]! - b[i]!) < eps, `${que} [${i}]: ${a[i]} vs ${b[i]}`); };

test("growing point by point gives the same rings, frames and caps as the whole tube (tuboDe)", () => {
  for (const g of [0.005, 0.03]) {
    const t = espiral(140, g), ref = tuboDe(t), vivo = crearTuboVivo(g);
    for (const q of t.puntos) vivo.anadir(q);
    assert.equal(vivo.lados, ref.lados); assert.equal(vivo.anillos, 140); assert.equal(vivo.triangulos, ref.triangulos);
    cerca(vivo.posiciones, ref.posiciones, 140 * ref.lados * 3, 1e-5, "ring positions"); cerca(vivo.normales, ref.normales, 140 * ref.lados * 3, 1e-5, "ring normals");
    // the caps: ref has them after the rings (A then B), live has them at fixed places after `capacidad` rings
    const L = ref.lados, refA = 140 * L, vivoA = vivo.capacidad * L;
    cerca(vivo.posiciones.subarray(vivoA * 3), ref.posiciones.subarray(refA * 3), 2 * (L + 1) * 3, 1e-5, "caps");
    cerca(vivo.normales.subarray(vivoA * 3), ref.normales.subarray(refA * 3), 2 * (L + 1) * 3, 1e-5, "cap normals");
  }
});

test("the tail follows the hand between control points and equals the tube with that point added", () => {
  const t = espiral(30), vivo = crearTuboVivo(0.015), mas = crearTuboVivo(0.015);
  for (const q of t.puntos.slice(0, 29)) { vivo.anadir(q); mas.anadir(q); }
  vivo.seguir(t.puntos[29]!); mas.anadir(t.puntos[29]!);
  assert.equal(vivo.puntos, 29, "the tail is not a kept point"); assert.equal(vivo.anillos, 30); assert.equal(vivo.triangulos, mas.triangulos);
  cerca(vivo.posiciones, mas.posiciones, 30 * vivo.lados * 3, 1e-6, "tail ring");
  vivo.seguir(null); assert.equal(vivo.anillos, 29);
});

test("each new point rewrites O(1): at most the last two rings, one cap and one segment ring — never the whole stroke", () => {
  const t = espiral(600, 0.03), vivo = crearTuboVivo(0.03), L = vivo.lados;
  const dentro = (xs: [number, number][]) => xs.reduce((s, [a, b]) => s + (b - a), 0);
  let peor = 0, peorIdx = 0;
  t.puntos.forEach((q, i) => {
    vivo.anadir(q); vivo.marcar(q, 0.01);
    const c = vivo.cambios();
    if (i > 3) { peor = Math.max(peor, dentro(c.vertices)); peorIdx = Math.max(peorIdx, c.indices ? c.indices[1] - c.indices[0] : 0); }
  });
  assert.ok(peor <= 2 * L + (L + 1) + 6, `vertices rewritten per point: ${peor} (last two rings ${2 * L} + a cap ${L + 1} + the tip 6)`);
  assert.ok(peorIdx <= 6 * L * 2, `indices rewritten per point: ${peorIdx}`);
  assert.equal(vivo.lleno, true); assert.equal(vivo.anadir([9, 9, 9, 1]), false, "the 601st point is refused");
});

test("the worst stroke fits the published caps: 9 600 triangles, 16-bit indices, every index points at a vertex", () => {
  const vivo = crearTuboVivo(0.06);
  for (const q of espiral(600, 0.06).puntos) vivo.anadir(q);
  vivo.marcar([0, 0, 0]);
  assert.equal(vivo.triangulos, TRIANGULOS_TRAZO_MAX); assert.equal(vivo.triangulos, trianguloDe(600, 8));
  assert.ok(vivo.vertices < 65536);
  const d = vivo.dibujo(true);
  for (let i = d.inicio; i < d.inicio + d.cuenta; i++) assert.ok(vivo.indices[i]! < vivo.vertices, `index ${i}`);
  assert.equal(d.cuenta, INDICES_PUNTA + TRIANGULOS_TRAZO_MAX * 3);
});

test("the tip marker rides in the same buffer: with it the range starts at 0, without it after the 24 tip indices; empty before two rings", () => {
  const vivo = crearTuboVivo(0.015);
  assert.deepEqual(vivo.dibujo(true), { inicio: INDICES_PUNTA, cuenta: 0 }, "no tip yet, nothing to draw");
  vivo.marcar([1, 1, 1]); assert.deepEqual(vivo.dibujo(true), { inicio: 0, cuenta: INDICES_PUNTA });
  assert.equal(vivo.dibujo(false).cuenta, 0);
  vivo.anadir([1, 1, 1, 1]); assert.equal(vivo.dibujo(true).cuenta, INDICES_PUNTA, "one point is no tube");
  vivo.anadir([1.05, 1, 1, 1]);
  const L = ladosDe(0.015);
  assert.equal(vivo.dibujo(false).cuenta, trianguloDe(2, L) * 3); assert.equal(vivo.dibujo(true).cuenta, INDICES_PUNTA + trianguloDe(2, L) * 3);
  vivo.reiniciar(); assert.equal(vivo.anillos, 0); assert.equal(vivo.puntos, 0); assert.equal(vivo.dibujo(false).cuenta, 0);
});

test("a still hand repeats a point and the tube does not break: coincident points are skipped, everything stays finite", () => {
  const vivo = crearTuboVivo(0.015);
  for (const q of [[0, 0, 0, 1], [0, 0, 0, 1], [0.02, 0, 0, 1], [0.02, 0, 0, 1], [0.04, 0.01, 0, 1]]) vivo.anadir(q);
  vivo.seguir([0.04, 0.01, 0, 1]);
  assert.equal(vivo.puntos, 3); assert.equal(vivo.anillos, 3);
  for (let i = 0; i < 3 * vivo.lados * 3; i++) assert.ok(Number.isFinite(vivo.posiciones[i]!) && Number.isFinite(vivo.normales[i]!));
});
