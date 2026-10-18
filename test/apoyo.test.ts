// apoyo (rest on turn) — la geometría pura (sin three.js), packages/render/src/apoyo.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { minYTrasGirar, yParaApoyar } from "../packages/render/src/apoyo.ts";
import type { Caja3 } from "../packages/render/src/apoyo.ts";

// a non-cubic box: 1 m wide (x), 2 m tall (y, base at 0 — a thing standing on the floor), 0.4 m deep (z)
const TABLON: Caja3 = [-0.5, 0, -0.2, 0.5, 2, 0.2];

test("minYTrasGirar: sin giro, la base de una caja no cúbica sigue en su propio y0", () => {
  assert.equal(minYTrasGirar(TABLON, [1, 1, 1], [0, 0, 0]), 0);
});

test("minYTrasGirar: un giro plano (solo Y) no cambia la altura de la base", () => {
  assert.ok(Math.abs(minYTrasGirar(TABLON, [1, 1, 1], [0, 90, 0]) - 0) < 1e-9, "girar sobre Y no tumba la caja");
});

test("minYTrasGirar: tumbar la caja 90° en X hace que su base baje de 0 (el hundimiento del parte)", () => {
  // de pie, el punto más alto está a 2 m sobre la base; al tumbarla esos 2 m pasan a Z, y el único eje que
  // puede hundir la base es Z -> Y por la rotación en X: el fondo (z0 = -0.2) queda por debajo del pivote.
  const minY = minYTrasGirar(TABLON, [1, 1, 1], [90, 0, 0]);
  assert.ok(minY < -0.01, `tumbada en X, la caja debería hundirse bajo el pivote (y = ${minY})`);
});

test("yParaApoyar: para cualquier giro, la caja queda con su base exactamente en sueloY (no cúbica)", () => {
  const sueloY = 0.73; // un suelo que no está en 0, para no acertar por casualidad
  for (const giro of [[0, 0, 0], [90, 0, 0], [0, 45, 0], [30, 60, -20], [180, 0, 90]] as const) {
    const y = yParaApoyar(TABLON, [1, 1, 1], [giro[0], giro[1], giro[2]], sueloY);
    const minMundo = y + minYTrasGirar(TABLON, [1, 1, 1], [giro[0], giro[1], giro[2]]);
    assert.ok(Math.abs(minMundo - sueloY) < 1e-9, `giro ${giro.join(",")}: la base quedó en ${minMundo}, no en ${sueloY}`);
  }
});

test("yParaApoyar: respeta la escala (una caja escalada también se apoya bien)", () => {
  const sueloY = 0;
  const y = yParaApoyar(TABLON, [1, 2, 1], [90, 0, 0], sueloY);
  const minMundo = y + minYTrasGirar(TABLON, [1, 2, 1], [90, 0, 0]);
  assert.ok(Math.abs(minMundo - sueloY) < 1e-9);
});
