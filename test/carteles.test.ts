// U22: who shows a name, and how big a plate may get (packages/render/src/carteles.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { escalaAcotada, grados, tamanoMaxM, elegirMirado, nombreVisible, anguloAlSegmento, NOMBRE_GRADOS_MAX, DIALOGO_GRADOS_MAX, MIRADA_GRADOS } from "../packages/render/src/carteles.ts";

const ojo = { x: 0, y: 1.6, z: 0 }, norte = { x: 0, y: 0, z: -1 }; // looking along -z
const persona = (clave: string, x: number, z: number) => ({ clave, x, z, pies: 0, cabeza: 1.8 });

test("a name plate (0.26 m) never takes more than 8° of the view, at any distance", () => {
  for (const d of [0.1, 0.5, 1, 1.1, 2, 5, 10, 24]) {
    const e = escalaAcotada(1, 0.26, d, NOMBRE_GRADOS_MAX);
    assert.ok(grados(0.26, e, d) <= NOMBRE_GRADOS_MAX + 1e-9, `${d} m → ${grados(0.26, e, d)}°`);
  }
});
test("far away it keeps the natural scale (it only ever shrinks): the far growth ×3 of J3 stays under 8°", () => {
  assert.equal(escalaAcotada(3, 0.26, 24, NOMBRE_GRADOS_MAX), 3);   // 0.78 m at 24 m is 1.9°
  assert.equal(escalaAcotada(1, 0.26, 10, NOMBRE_GRADOS_MAX), 1);
  assert.ok(escalaAcotada(1, 0.26, 1, NOMBRE_GRADOS_MAX) < 0.6);    // a metre away: well under the natural size
});
test("a bubble (2.6 m wide) takes at most 30° of the view: next to the person it is ~0.6 m wide, not the whole screen", () => {
  const d = 1.1, e = escalaAcotada(1, 2.6, d, DIALOGO_GRADOS_MAX);
  assert.ok(grados(2.6, e, d) <= DIALOGO_GRADOS_MAX + 1e-9);
  assert.ok(grados(2.6, 1, d) > 90, "before: over 90° at 1.1 m");
  assert.ok(Math.abs(2.6 * e - tamanoMaxM(d, 30)) < 1e-9);
});
test("the plate is never asked for a zero distance (inside the head: it uses 0.3 m)", () => {
  assert.ok(Number.isFinite(escalaAcotada(1, 0.26, 0, 8)) && escalaAcotada(1, 0.26, 0, 8) > 0);
});

test("the one in the middle of the view is looked at; the one off to the side is not", () => {
  const cand = [persona("a", 0, -5), persona("b", 4, -5)];
  assert.equal(elegirMirado(ojo, norte, cand, null, 24), "a");
  assert.equal(elegirMirado(ojo, norte, [persona("b", 4, -5)], null, 24), null); // 38° off
});
test("looking at the head, the feet or the middle of the person counts; behind you or too far does not", () => {
  assert.ok(anguloAlSegmento(ojo, norte, persona("a", 0, -3)) < 3); // eyes at 1.6 m, the body spans 0–1.8 m
  assert.equal(elegirMirado(ojo, norte, [persona("a", 0, 5)], null, 24), null);    // behind
  assert.equal(elegirMirado(ojo, norte, [persona("a", 0, -30)], null, 24), null);  // beyond 24 m
});
test("with two in line, the nearest to the centre wins", () => {
  const cand = [persona("izq", -0.5, -5), persona("centro", 0.1, -5)];
  assert.equal(elegirMirado(ojo, norte, cand, null, 24), "centro");
});
test("hysteresis: the one already looked at stays while you drift a little, and goes after the wider cone", () => {
  const ang = (g: number, d = 5) => persona("a", Math.sin((g * Math.PI) / 180) * d, -Math.cos((g * Math.PI) / 180) * d);
  const a9 = { ...ang(9), pies: 1.6, cabeza: 1.6 }; // a point at eye height, 9° off (> 7°, < 11°)
  assert.equal(elegirMirado(ojo, norte, [a9], null, 24), null);
  assert.equal(elegirMirado(ojo, norte, [a9], "a", 24), "a");
  assert.equal(elegirMirado(ojo, norte, [{ ...ang(14), pies: 1.6, cabeza: 1.6 }], "a", 24), null);
  assert.ok(MIRADA_GRADOS < 11);
});
test("a new one clearly in the centre takes the look from the previous one", () => {
  const prev = { ...persona("a", Math.sin(0.17) * 5, -5), pies: 1.6, cabeza: 1.6 }; // ~10° off
  assert.equal(elegirMirado(ojo, norte, [prev, persona("b", 0, -5)], "a", 24), "b");
});

test("who shows a name: looked at, speaking, or everybody (Alt); otherwise nobody", () => {
  const base = { todos: false, mirado: false, habla: false };
  assert.equal(nombreVisible(base), false);
  assert.equal(nombreVisible({ ...base, mirado: true }), true);
  assert.equal(nombreVisible({ ...base, habla: true }), true);
  assert.equal(nombreVisible({ ...base, marca: true }), true); // a quest mark keeps the plate on (Pablo, 2026-10-18)
  assert.equal(nombreVisible({ ...base, todos: true }), true);
});
