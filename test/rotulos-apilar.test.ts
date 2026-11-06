// mundo-hermes · M4: the flat plates over mirrored things keep clear of each other (packages/render/src/rotulos-apilar.ts, pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apilar, levantarSobre, escalaPlacaPx, opacidadPlaca, HUECO_NDC, NIVELES_MAX, PLACA_MIN_PX, PLACA_MAX_PX } from "../packages/render/src/rotulos-apilar.ts";
import type { Placa } from "../packages/render/src/rotulos-apilar.ts";

const rect = (p: Placa, n: number) => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy + n * (p.h + HUECO_NDC), y1: p.cy + n * (p.h + HUECO_NDC) + p.h });
const solapan = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test("one plate, or plates side by side, stay where they are", () => {
  assert.deepEqual([...apilar([{ clave: "a", cx: 0, cy: 0.2, w: 0.3, h: 0.1, d: 3 }])], [["a", 0]]);
  const n = apilar([{ clave: "a", cx: -0.5, cy: 0.2, w: 0.3, h: 0.1, d: 3 }, { clave: "b", cx: 0.5, cy: 0.2, w: 0.3, h: 0.1, d: 4 }]);
  assert.deepEqual([n.get("a"), n.get("b")], [0, 0]);
});

test("the nearest stays, the farther one goes up one plate height; two on the same spot are never drawn over each other", () => {
  const n = apilar([{ clave: "lejos", cx: 0, cy: 0.2, w: 0.3, h: 0.1, d: 9 }, { clave: "cerca", cx: 0.05, cy: 0.2, w: 0.3, h: 0.1, d: 2 }]);
  assert.equal(n.get("cerca"), 0); assert.equal(n.get("lejos"), 1);
});

test("14 profiles in a row of a 4 m grid seen from 3 m: whatever is shown overlaps nothing; the rest is hidden, the nearest are never hidden", () => {
  const placas: Placa[] = Array.from({ length: 14 }, (_, i) => { const x = (i % 5) - 2, z = Math.floor(i / 5); return { clave: `p${i}`, cx: x * 0.12, cy: 0.1 + z * 0.01, w: 0.3, h: 0.08, d: 3 + Math.hypot(x, z) * 4 }; });
  const n = apilar(placas);
  const mostradas = placas.filter((p) => (n.get(p.clave) ?? -1) >= 0);
  for (let i = 0; i < mostradas.length; i++) for (let j = i + 1; j < mostradas.length; j++) assert.equal(solapan(rect(mostradas[i], n.get(mostradas[i].clave)!), rect(mostradas[j], n.get(mostradas[j].clave)!)), false, `${mostradas[i].clave} / ${mostradas[j].clave}`);
  for (const p of mostradas) assert.ok((n.get(p.clave) as number) <= NIVELES_MAX);
  const nearest = [...placas].sort((a, b) => a.d - b.d)[0];
  assert.equal(n.get(nearest.clave), 0, "the nearest keeps its place");
  assert.ok(mostradas.length >= 5 && mostradas.length < 14, `some are stacked and some give way (${mostradas.length} shown)`);
});

test("same input, same answer, input untouched", () => {
  const placas: Placa[] = [{ clave: "b", cx: 0, cy: 0, w: 1, h: 0.2, d: 5 }, { clave: "a", cx: 0, cy: 0, w: 1, h: 0.2, d: 5 }];
  const copia = JSON.stringify(placas);
  assert.deepEqual([...apilar(placas)], [...apilar([...placas].reverse())]);
  assert.equal(JSON.stringify(placas), copia);
});

test("a plate whose bottom is under its figure's top rises by whole steps until it clears it; one that clears already does not move", () => {
  assert.equal(levantarSobre(0.30, 0.20, 0.02, 0.1), 0);
  assert.equal(levantarSobre(0.10, 0.20, 0.02, 0.1), 2); // needs 0.12 → 2 steps
  assert.equal(levantarSobre(0.10, 0.20, 0.02, 0), 0, "a zero step never loops");
  assert.equal(levantarSobre(-5, 0.2, 0.02, 0.01, 7), 7, "capped");
});

test("a flat plate is clamped to 90..220 px wide on the screen, whatever the distance; the scale factor keeps the plate in proportion", () => {
  const anchoM = 2.9, focal = 640 * 1.3; // 1280 px wide, ~16:9 projection
  const px = (d: number) => anchoM * escalaPlacaPx(anchoM, d, focal) * focal / d;
  for (const d of [0.5, 1, 2, 3, 5, 10, 20, 30, 39]) { const w = px(d); assert.ok(w >= PLACA_MIN_PX - 1e-6 && w <= PLACA_MAX_PX + 1e-6, `${d} m → ${w.toFixed(1)} px`); }
  assert.ok(Math.abs(px(2) - PLACA_MAX_PX) < 1e-6, "near: capped, no longer a wall over the figures");
  assert.ok(Math.abs(px(39) - PLACA_MIN_PX) < 1e-6, "far: raised to the minimum");
  assert.equal(escalaPlacaPx(anchoM, 10, focal, 0, 1e9), 1, "inside the limits the plate keeps its natural size");
});

test("escalaPlacaPx: bad input leaves the natural size; swapped limits are put in order; a narrow phone screen gives smaller plates, still inside the limits", () => {
  assert.equal(escalaPlacaPx(2.9, 0, 800), 1); assert.equal(escalaPlacaPx(2.9, -3, 800), 1); assert.equal(escalaPlacaPx(2.9, 5, 0), 1);
  assert.equal(escalaPlacaPx(0, 5, 800), 1); assert.equal(escalaPlacaPx(Number.NaN, 5, 800), 1);
  const swapped = 2.9 * escalaPlacaPx(2.9, 2, 800, 220, 90) * 800 / 2; assert.ok(swapped <= 220 + 1e-6 && swapped >= 90 - 1e-6);
  const phone = 2.9 * escalaPlacaPx(2.9, 5, 360 * 1.3 * 0.5) * (360 * 1.3 * 0.5) / 5; assert.ok(phone >= 90 - 1e-6 && phone <= 220 + 1e-6);
});

test("opacidadPlaca: fully drawn up to 32 m, fading to nothing at 40 m, hidden beyond (and for NaN)", () => {
  assert.equal(opacidadPlaca(0), 1); assert.equal(opacidadPlaca(32), 1);
  assert.ok(Math.abs(opacidadPlaca(36) - 0.5) < 1e-9);
  assert.equal(opacidadPlaca(40), 0); assert.equal(opacidadPlaca(80), 0); assert.equal(opacidadPlaca(Number.NaN), 0);
  let antes = 1; for (let d = 32; d <= 40; d += 0.5) { const o = opacidadPlaca(d); assert.ok(o <= antes + 1e-12); antes = o; }
});
