// V13 trozo 1: the pure part of the voice subtitles (apps/plaza/subtitulos-logica.ts): the 8 sectors, the 8° hysteresis, «in sight»,
// near/far with hysteresis, who leaves when there is no room, how long a box stays, and the line for the screen reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTORES, anguloRelativo, aLaVista, esLejos, frase, ordenar, permanenciaMs, quienSale, recortarNombre, sectorDe } from "../apps/plaza/subtitulos-logica.ts";

const G = Math.PI / 180;

test("the camera frame: looking along -z (yaw 0), +x is to the right, +z is behind", () => {
  const yo = { x: 0, z: 0 };
  assert.ok(Math.abs(anguloRelativo(0, yo, { x: 0, z: -5 })) < 1e-9, "ahead");
  assert.ok(Math.abs(anguloRelativo(0, yo, { x: 5, z: 0 }) - 90 * G) < 1e-9, "right");
  assert.ok(Math.abs(anguloRelativo(0, yo, { x: -5, z: 0 }) + 90 * G) < 1e-9, "left");
  assert.ok(Math.abs(Math.abs(anguloRelativo(0, yo, { x: 0, z: 5 })) - 180 * G) < 1e-9, "behind");
  // turn the camera to face +x (yaw −90°: forward = (−sin yaw, −cos yaw) = (1, 0)): the person at +x is now ahead
  assert.ok(Math.abs(anguloRelativo(-90 * G, yo, { x: 5, z: 0 })) < 1e-9);
});

test("the 8 sectors, clockwise from ahead, with words and reader phrases", () => {
  const esperado = ["delante", "delante dcha.", "derecha", "detrás dcha.", "detrás", "detrás izq.", "izquierda", "delante izq."];
  assert.deepEqual(SECTORES.map((s) => s.palabra), esperado);
  for (let i = 0; i < 8; i++) assert.equal(sectorDe(i * 45 * G), i, `centre of ${esperado[i]}`);
  assert.equal(sectorDe(-90 * G), 6);
  assert.equal(sectorDe(179 * G), 4);
  assert.equal(sectorDe(-179 * G), 4);
  assert.equal(SECTORES[6].lector, "a tu izquierda");
  assert.equal(SECTORES[5].lector, "detrás de ti a la izquierda");
});

test("the sector holds for 8° past the border and then changes (it does not tremble)", () => {
  // border between ahead (0) and ahead-right (1) is 22.5°
  assert.equal(sectorDe(25 * G, 0), 0, "2.5° past: still ahead");
  assert.equal(sectorDe(30 * G, 0), 0, "7.5° past: still ahead");
  assert.equal(sectorDe(31 * G, 0), 1, "8.5° past: ahead-right");
  assert.equal(sectorDe(20 * G, 1), 1, "back 2.5° the other way: still ahead-right");
  assert.equal(sectorDe(14 * G, 1), 0, "8.5° back: ahead again");
  // around the back (the ±180° seam) it works the same
  assert.equal(sectorDe(-170 * G, 4), 4);
});

test("in sight: half the field of view minus 5° on each side", () => {
  assert.equal(aLaVista(0, 90), true);
  assert.equal(aLaVista(39 * G, 90), true);
  assert.equal(aLaVista(41 * G, 90), false, "45° − 5° = 40°");
  assert.equal(aLaVista(-41 * G, 90), false);
  assert.equal(aLaVista(Math.PI, 90), false);
});

test("near / far: 15 m, with 1 m of hysteresis", () => {
  assert.equal(esLejos(14, false), false);
  assert.equal(esLejos(15.5, false), true);
  assert.equal(esLejos(14.5, true), true, "still far at 14.5");
  assert.equal(esLejos(13.9, true), false, "near again at 14 m or less");
});

test("a box stays clamp(chars / 15, 3, 8) seconds", () => {
  assert.equal(permanenciaMs(10), 3000);
  assert.equal(permanenciaMs(60), 4000);
  assert.equal(permanenciaMs(900), 8000);
});

test("who leaves when there are more boxes than room", () => {
  const c = (entidad: number, llegada: number, ultima: number, escenario = false) => ({ entidad, escenario, llegada, ultima });
  assert.equal(quienSale([c(1, 0, 5000), c(2, 1000, 3000), c(3, 2000, 6000)], 10_000), 2, "the oldest last word");
  assert.equal(quienSale([c(1, 9000, 9500), c(2, 9200, 9600)], 10_000), null, "all younger than 1.5 s: the new one waits");
  assert.equal(quienSale([c(1, 0, 100, true), c(2, 9000, 9500)], 10_000), null, "never the stage");
  assert.equal(quienSale([c(1, 0, 100, true), c(2, 1000, 2000)], 10_000), 2);
});

test("order: the stage on top, then by arrival (newest at the bottom)", () => {
  const o = ordenar([{ entidad: 1, escenario: false, llegada: 5, ultima: 5 }, { entidad: 2, escenario: true, llegada: 9, ultima: 9 }, { entidad: 3, escenario: false, llegada: 2, ultima: 2 }]);
  assert.deepEqual(o.map((x) => x.entidad), [2, 3, 1]);
});

test("the screen reader line carries name, direction only when out of sight, far and stage", () => {
  assert.equal(frase({ nombre: "Ana", escenario: false, texto: "habla." }), "Ana: habla.");
  assert.equal(frase({ nombre: "Leo", escenario: false, escrito: true, sector: 6, texto: "hola." }), "Leo, escrito, a tu izquierda: hola.");
  assert.equal(frase({ nombre: "Marta", escenario: false, sector: 5, lejos: true, texto: "habla." }), "Marta, detrás de ti a la izquierda, lejos: habla.");
  assert.equal(frase({ nombre: "Christian", escenario: true, texto: "hola." }), "Christian, en el escenario: hola.");
  assert.equal(recortarNombre("a".repeat(30)), `${"a".repeat(23)}…`);
  assert.equal(recortarNombre("Ana"), "Ana");
});
