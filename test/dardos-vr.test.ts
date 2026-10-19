// dardos in VR: the maths of one hand throw (features/dardos/lanzamiento.ts). The board stands at the origin facing +z
// (normal toward the thrower), centre 2 m up, 0.408 m per board radius (the plaza board). Directions AND distances are asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lanzamiento, velocidadDe, fuerzaDeVelocidad, duracionVuelo, V_LLENO, V_MIN, TOPE_RADIOS } from "../features/dardos/lanzamiento.ts";
import type { Cara, V3, Muestra } from "../features/dardos/lanzamiento.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";

const CARA: Cara = { c: [0, 2, 0], n: [0, 0, 1], r: [1, 0, 0], m: 0.408 };
const mano: V3 = [0, 2, 2.6]; // at the throwing line, level with the bull's eye
const hacia = (v: number): V3 => [0, 0, -v];

test("a straight throw at the bull's eye aims at the middle with the strength of its speed", () => {
  const t = lanzamiento(CARA, mano, hacia(4.55));
  assert.equal(t.tipo, "tiro");
  if (t.tipo !== "tiro") return;
  assert.equal(t.x, 0); assert.equal(t.y, 0);
  assert.ok(Math.abs(t.fuerza - FUERZA_IDEAL) < 0.01, `fuerza ${t.fuerza}`);
  assert.equal(t.distancia, 2.6); assert.equal(t.recortado, false);
});

test("direction: a hand moving up and to the right aims up and to the right, by the distance it would cover", () => {
  // 2.6 m to the board: velocity (0.5, 0.3, -5) crosses in 0.52 s → +0.26 m right, +0.156 m up → 0.637 and 0.382 radii
  const t = lanzamiento(CARA, mano, [0.5, 0.3, -5]);
  assert.equal(t.tipo, "tiro"); if (t.tipo !== "tiro") return;
  assert.ok(Math.abs(t.x - 0.637) < 0.002, `x ${t.x}`);
  assert.ok(Math.abs(t.y - 0.382) < 0.002, `y ${t.y}`);
  const izq = lanzamiento(CARA, mano, [-0.5, -0.3, -5]);
  assert.equal(izq.tipo, "tiro"); if (izq.tipo !== "tiro") return;
  assert.ok(izq.x < 0 && izq.y < 0, "left and down");
});

test("distance: the same flick aims twice as far off the bull's eye from twice as far away", () => {
  const cerca = lanzamiento(CARA, [0, 2, 1.5], [0.3, 0, -5]), lejos = lanzamiento(CARA, [0, 2, 3], [0.3, 0, -5]);
  assert.ok(cerca.tipo === "tiro" && lejos.tipo === "tiro");
  if (cerca.tipo !== "tiro" || lejos.tipo !== "tiro") return;
  assert.ok(Math.abs(lejos.x / cerca.x - 2) < 0.02, `${lejos.x} / ${cerca.x}`);
  assert.equal(cerca.distancia, 1.5); assert.equal(lejos.distancia, 3);
});

test("the board turned (a thrower standing to its side): the aim follows the face's own axes", () => {
  // a board facing +x (rumbo 90°): normal (1,0,0), right (0,0,-1). Hand 2.6 m in front, moving toward it and a bit toward +z
  const lado: Cara = { c: [10, 2, 0], n: [1, 0, 0], r: [0, 0, -1], m: 0.408 };
  const t = lanzamiento(lado, [12.6, 2, 0], [-5, 0, 0.5]);
  assert.equal(t.tipo, "tiro"); if (t.tipo !== "tiro") return;
  assert.ok(t.x < 0, "toward +z is the face's LEFT"); assert.ok(Math.abs(t.x + 0.637) < 0.002, `x ${t.x}`); assert.equal(t.y, 0);
});

test("strength follows speed and is capped at 1; FUERZA_IDEAL is 65% of V_LLENO", () => {
  assert.equal(fuerzaDeVelocidad(0), 0); assert.equal(fuerzaDeVelocidad(V_LLENO * 3), 1);
  assert.ok(Math.abs(fuerzaDeVelocidad(V_LLENO * FUERZA_IDEAL) - FUERZA_IDEAL) < 1e-9);
  const dura = lanzamiento(CARA, mano, hacia(30)); assert.equal(dura.tipo === "tiro" && dura.fuerza, 1);
});

test("a wild throw is capped to the rim: it never leaves the board's neighbourhood", () => {
  const t = lanzamiento(CARA, mano, [4, 3, -3]); // 53° sideways and 45° up: far off any board
  assert.equal(t.tipo, "tiro"); if (t.tipo !== "tiro") return;
  assert.equal(t.recortado, true);
  assert.ok(Math.hypot(t.x, t.y) <= TOPE_RADIOS + 0.002, `${Math.hypot(t.x, t.y)}`);
  assert.ok(t.x > 0 && t.y > 0, "the direction is kept");
});

test("not a throw: too slow, backwards, sideways, or a hand past the board — the dart falls", () => {
  assert.deepEqual(lanzamiento(CARA, mano, hacia(V_MIN * 0.8)), { tipo: "suelta", motivo: "lento" });
  assert.deepEqual(lanzamiento(CARA, mano, [0, 0, 5]), { tipo: "suelta", motivo: "atras" });
  assert.deepEqual(lanzamiento(CARA, mano, [5, 0, -0.5]), { tipo: "suelta", motivo: "atras" });
  assert.deepEqual(lanzamiento(CARA, [0, 2, -0.3], hacia(5)), { tipo: "suelta", motivo: "detras" });
  assert.deepEqual(lanzamiento(CARA, mano, null), { tipo: "suelta", motivo: "sin-velocidad" });
  assert.equal(lanzamiento(CARA, mano, [Number.NaN, 0, -5]).tipo, "suelta", "NaN never becomes a throw");
});

test("velocidadDe: the last ~100 ms of samples, null with too few or too close", () => {
  const m: Muestra[] = []; for (let i = 0; i <= 10; i++) m.push({ t: 1000 + i * 11, x: 0, y: 0, z: -i * 0.05 }); // 0.05 m per 11 ms = 4.545 m/s
  const v = velocidadDe(m, 1110)!;
  assert.ok(Math.abs(v[2] + 4.545) < 0.01, `vz ${v[2]}`); assert.equal(v[0], 0);
  assert.equal(velocidadDe(m, 900), null, "no samples before the release");
  // a slow frame rate (one sample in the window): the last two samples speak for it
  const lento: Muestra[] = [{ t: 0, x: 0, y: 0, z: 0 }, { t: 200, x: 0, y: 0, z: -1 }, { t: 400, x: 0, y: 0, z: -2 }];
  assert.ok(Math.abs(velocidadDe(lento, 400)![2] + 5) < 1e-9);
  assert.equal(velocidadDe([{ t: 0, x: 0, y: 0, z: 0 }, { t: 900, x: 0, y: 0, z: -1 }], 900), null, "0.9 s apart is not a throw");
  assert.equal(velocidadDe([{ t: 0, x: 0, y: 0, z: 0 }, { t: 10, x: 1, y: 0, z: 0 }], 10), null, "10 ms apart is noise");
  assert.equal(velocidadDe([], 0), null);
});

test("velocidadDe: a tracker slower than the renderer repeats poses; the line fit still reads the speed", () => {
  const m: Muestra[] = []; for (let i = 0; i <= 10; i++) m.push({ t: i * 11, x: 0, y: 0, z: -Math.floor(i / 2) * 0.1 }); // each pose twice, 0.1 m per 22 ms = 4.545 m/s
  const v = velocidadDe(m, 110)!;
  assert.ok(Math.abs(v[2] + 4.545) < 0.5, `vz ${v[2]}`);
});

test("the flight is drawn between 220 and 900 ms", () => {
  assert.equal(duracionVuelo(0.3, 9), 220); assert.equal(duracionVuelo(50, 3), 900);
  const d = duracionVuelo(2.6, 5); assert.ok(d > 400 && d < 600, `${d}`);
});
