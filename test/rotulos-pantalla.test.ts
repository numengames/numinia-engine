// mundo-hermes · M10: the flat plates stay on the screen, never cover their own figure, and do not flicker (packages/render/src/rotulos-apilar.ts, pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apilar, acotarX, HUECO_NDC, MARGEN_PANTALLA } from "../packages/render/src/rotulos-apilar.ts";
import type { Placa } from "../packages/render/src/rotulos-apilar.ts";

const rect = (p: Placa, n: number) => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy + n * (p.h + HUECO_NDC), y1: p.cy + n * (p.h + HUECO_NDC) + p.h });

test("two plates on the same screen spot are separated (or one dropped), never drawn over each other", () => {
  const a: Placa = { clave: "a", cx: 0.1, cy: 0, w: 0.3, h: 0.1, d: 4 }, b: Placa = { clave: "b", cx: 0.1, cy: 0, w: 0.3, h: 0.1, d: 5 };
  const n = apilar([a, b]);
  const sitio = [a, b].filter((p) => (n.get(p.clave) ?? -1) >= 0).map((p) => rect(p, n.get(p.clave)!));
  assert.ok(sitio.length >= 1);
  if (sitio.length === 2) assert.ok(!(sitio[0].x0 < sitio[1].x1 && sitio[1].x0 < sitio[0].x1 && sitio[0].y0 < sitio[1].y1 && sitio[1].y0 < sitio[0].y1));
});

test("a plate never covers its own figure: its bottom ends above the figure's top while they overlap sideways", () => {
  for (const cy of [-0.4, 0, 0.1, 0.25]) {
    const p: Placa = { clave: "p", cx: 0, cy, w: 0.3, h: 0.1, d: 3, figura: { x0: -0.1, x1: 0.1, y1: 0.2 } };
    const n = apilar([p]).get("p")!;
    if (n >= 0) assert.ok(rect(p, n).y0 >= 0.2, `cy ${cy} → level ${n}`);
  }
  const lejos: Placa = { clave: "q", cx: 0.8, cy: 0, w: 0.2, h: 0.1, d: 3, figura: { x0: -0.1, x1: 0.1, y1: 0.2 } };
  assert.equal(apilar([lejos]).get("q"), 0, "a figure beside the plate does not lift it");
});

test("acotarX keeps a plate inside the screen with the margin; one that fits is untouched; one wider than the screen is centred", () => {
  assert.equal(acotarX(0.2, 0.3), 0.2);
  const r = acotarX(1.2, 0.4), l = acotarX(-1.7, 0.4);
  assert.ok(r + 0.2 <= 1 - MARGEN_PANTALLA + 1e-9 && l - 0.2 >= -1 + MARGEN_PANTALLA - 1e-9);
  assert.ok(Math.abs(r) === Math.abs(l) && r > 0 && l < 0);
  assert.equal(acotarX(0.5, 2.5), 0);
});

test("a plate that would rise above the top of the screen is hidden, not cut off", () => {
  const p: Placa = { clave: "a", cx: 0, cy: 0.85, w: 0.3, h: 0.1, d: 3 }, q: Placa = { clave: "b", cx: 0, cy: 0.85, w: 0.3, h: 0.1, d: 6 };
  const n = apilar([p, q], 4, { tope: 0.98 });
  assert.equal(n.get("a"), 0); assert.equal(n.get("b"), -1);
  assert.equal(apilar([q], 4).get("b"), 0, "without the limit it is placed as before");
});

test("no flicker: with the last frame's levels, two plates at almost the same distance keep their places however their distances wobble", () => {
  const base = (da: number, db: number): Placa[] => [{ clave: "a", cx: 0, cy: 0, w: 0.3, h: 0.1, d: da }, { clave: "b", cx: 0, cy: 0, w: 0.3, h: 0.1, d: db }];
  let previos = apilar(base(10, 10.5), 0); // niveles 0: one fits, the other is hidden
  assert.deepEqual([previos.get("a"), previos.get("b")], [0, -1]);
  for (const [da, db] of [[10.6, 10.5], [10.8, 10.4], [10.4, 10.2], [10.5, 10.0]]) {
    const n = apilar(base(da, db), 0, { previos });
    assert.deepEqual([n.get("a"), n.get("b")], [0, -1], `${da} / ${db}`);
    previos = n;
  }
  assert.deepEqual([...apilar(base(10.5, 10.0), 0)], [["b", 0], ["a", -1]], "without memory the order does flip");
});
