// MIS-229 (t_2bb3461e): the beacon's special beam — the rules (packages/render/src/rayo-politica.ts), pure.
import test from "node:test";
import assert from "node:assert/strict";
import { ANILLO_M, CERCA_DESDE_M, DESTELLO_S, LLEGADA_M, MOTAS, REARMA_M, cerca, destello, paso, rayoEspecial, relojRayo } from "../packages/render/src/rayo-politica.ts";

test("tier D keeps the plain column: no motes, no special look; the others get fewer motes the weaker the device", () => {
  assert.equal(rayoEspecial("D"), false);
  for (const n of ["A", "B", "C"] as const) assert.equal(rayoEspecial(n), true);
  assert.equal(MOTAS.D, 0);
  assert.ok(MOTAS.A > MOTAS.B && MOTAS.B > MOTAS.C && MOTAS.C > 0);
  assert.ok(MOTAS.A <= 32, "one sprite, a small instance count");
});

test("closeness runs 0 far → 1 at the foot, never outside that, and a bad number is 0", () => {
  assert.equal(cerca(CERCA_DESDE_M + 5), 0);
  assert.equal(cerca(LLEGADA_M), 1);
  assert.equal(cerca(0), 1);
  let antes = 0;
  for (let d = CERCA_DESDE_M; d >= LLEGADA_M; d -= 0.5) { const c = cerca(d); assert.ok(c >= antes - 1e-9 && c >= 0 && c <= 1); antes = c; }
  assert.equal(cerca(NaN), 0);
  assert.equal(cerca(Infinity), 0);
});

test("the swell is a gentle bloom: 0 → 1 → 0, smooth, and over after DESTELLO_S", () => {
  assert.equal(destello(-1), 0);
  assert.equal(destello(0), 0);
  assert.equal(destello(DESTELLO_S), 0);
  assert.equal(destello(DESTELLO_S + 3), 0);
  assert.equal(destello(NaN), 0);
  const pico = destello(DESTELLO_S * 0.25);
  assert.ok(pico > 0.99 && pico <= 1);
  let max = 0, previo = 0;
  for (let t = 0; t <= DESTELLO_S; t += 0.02) { const v = destello(t); max = Math.max(max, v); assert.ok(Math.abs(v - previo) < 0.12, `no jump at ${t.toFixed(2)} s`); previo = v; }
  assert.ok(max <= 1);
  assert.ok(DESTELLO_S >= 1, "a swell no faster than one second: nothing that flashes");
});

test("it greets once on arrival, not every frame, and again only after you walked away", () => {
  const s = { saludado: false };
  assert.equal(paso(s, 30), false);
  assert.equal(paso(s, LLEGADA_M + 0.1), false);
  assert.equal(paso(s, LLEGADA_M - 0.1), true, "arrives");
  assert.equal(paso(s, 1), false, "standing there does not repeat it");
  assert.equal(paso(s, LLEGADA_M + 1), false);
  assert.equal(paso(s, REARMA_M - 0.1), false, "hovering at the edge does not re-arm");
  assert.equal(paso(s, REARMA_M + 1), false, "re-arms");
  assert.equal(paso(s, 2), true, "greets again");
});

test("«menos movimiento» freezes the clock at 0; otherwise it runs and wraps so a long session keeps its precision", () => {
  assert.equal(relojRayo(123456, true), 0);
  assert.equal(relojRayo(5000, false), 5);
  assert.equal(relojRayo(3600 * 1000 * 7 + 2500, false), 2.5);
  assert.ok(ANILLO_M > 0.6, "the ring is wider than the column");
});
