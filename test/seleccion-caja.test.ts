// Lote4: the rubber band and the two-finger gesture — pure screen geometry (apps/plaza/seleccion-caja.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rectDesde, dentroDe, esCaja, idsEnRect, unirSeleccion, gestoDosDedos, aplicarGesto, DEDOS_MIN_PX } from "../apps/plaza/seleccion-caja.ts";

test("rectDesde: the same rectangle whichever corner you start from", () => {
  const r = { x0: 10, y0: 20, x1: 110, y1: 80 };
  assert.deepEqual(rectDesde({ x: 10, y: 20 }, { x: 110, y: 80 }), r);
  assert.deepEqual(rectDesde({ x: 110, y: 80 }, { x: 10, y: 20 }), r);
  assert.deepEqual(rectDesde({ x: 110, y: 20 }, { x: 10, y: 80 }), r);
});

test("dentroDe: borders count, outside does not; esCaja: a small wobble is a click", () => {
  const r = rectDesde({ x: 0, y: 0 }, { x: 100, y: 50 });
  assert.equal(dentroDe({ x: 0, y: 0 }, r), true);
  assert.equal(dentroDe({ x: 100, y: 50 }, r), true);
  assert.equal(dentroDe({ x: 101, y: 25 }, r), false);
  assert.equal(dentroDe({ x: 50, y: -1 }, r), false);
  assert.equal(esCaja({ x: 5, y: 5 }, { x: 8, y: 9 }), false);
  assert.equal(esCaja({ x: 5, y: 5 }, { x: 40, y: 9 }), true);
});

test("idsEnRect: picks the projected centres inside, in order; what is behind the camera (null) never", () => {
  const centros: [string, { x: number; y: number } | null][] = [["a", { x: 20, y: 20 }], ["b", { x: 500, y: 20 }], ["c", { x: 60, y: 40 }], ["d", null], ["e", { x: 99, y: 49 }]];
  assert.deepEqual(idsEnRect(centros, rectDesde({ x: 0, y: 0 }, { x: 100, y: 50 })), ["a", "c", "e"]);
  assert.deepEqual(idsEnRect(centros, rectDesde({ x: 300, y: 300 }, { x: 400, y: 400 })), [], "an empty band selects nothing");
});

test("unirSeleccion: Shift adds the band to what was selected; the band's ids go last (the primary is the last)", () => {
  assert.deepEqual(unirSeleccion([], ["a", "b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(unirSeleccion(["x"], ["a", "b"]), ["x", "a", "b"]);
  assert.deepEqual(unirSeleccion(["a", "x"], ["a", "b"]), ["x", "a", "b"], "no repeats; the band's ids end the list");
});

test("gestoDosDedos: turning the fingers 90° clockwise and spreading 2x reads as giro 90, factor 2", () => {
  const ini = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
  const g = gestoDosDedos(ini, { a: { x: 100, y: 100 }, b: { x: 100, y: 300 } })!;   // b swung from east to south, twice as far
  assert.ok(Math.abs(g.giro - 90) < 1e-9 && Math.abs(g.factor - 2) < 1e-9, JSON.stringify(g));
  const anti = gestoDosDedos(ini, { a: { x: 100, y: 100 }, b: { x: 100, y: 0 } })!;
  assert.ok(Math.abs(anti.giro + 90) < 1e-9 && Math.abs(anti.factor - 1) < 1e-9);
  assert.equal(gestoDosDedos({ a: { x: 0, y: 0 }, b: { x: DEDOS_MIN_PX - 1, y: 0 } }, ini), null, "fingers that start too close have no reliable angle");
  const cruza = gestoDosDedos({ a: { x: 0, y: 0 }, b: { x: -100, y: 1 } }, { a: { x: 0, y: 0 }, b: { x: -100, y: -1 } })!;
  assert.ok(Math.abs(cruza.giro) < 2, `crossing ±180° wraps to a small turn (${cruza.giro})`);
});

test("aplicarGesto: clockwise fingers lower the yaw; the factor multiplies each scale within [0.05, 50]; wire steps", () => {
  const antes = { ry: 20, sx: 1, sy: 2, sz: 0.5 };
  assert.deepEqual(aplicarGesto(antes, { giro: 30, factor: 1.5 }), { ry: -10, sx: 1.5, sy: 3, sz: 0.75 });
  assert.equal(aplicarGesto({ ry: -170, sx: 1, sy: 1, sz: 1 }, { giro: 40, factor: 1 }).ry, 150, "wraps into [-180, 180]");
  assert.equal(aplicarGesto(antes, { giro: 0, factor: 1000 }).sx, 50);
  assert.equal(aplicarGesto(antes, { giro: 0, factor: 0.001 }).sz, 0.05);
});
