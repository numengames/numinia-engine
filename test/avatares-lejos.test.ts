import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANIMAR_HASTA_M, ANIMAR_MITAD_DESDE_M, VRM_HASTA_M, VRM_HISTERESIS_M, cadenciaAnimacion, distanciaVRM, elegirCercanos,
} from "../packages/render/src/avatares-politica.ts";

// J14 (lote13, MIS-253): what VRM avatars do far away — back to the capsule past a distance (by device class), and a
// half-rate animation in the middle band. Pure; the page applies it in avatares.ts.

test("J14 far VRM: the distance is by device class, a phone and a headset sooner than a PC, and always inside the fog's start", () => {
  assert.equal(distanciaVRM({ mobile: true, xr: false }), 30);
  assert.equal(distanciaVRM({ mobile: false, xr: true }), 30);
  assert.equal(distanciaVRM({ mobile: false, xr: false }), 45);
  assert.deepEqual(VRM_HASTA_M, { escritorio: 45, visor: 30, movil: 30 });
  assert.ok(VRM_HASTA_M.escritorio + VRM_HISTERESIS_M >= ANIMAR_HASTA_M, "a PC still animates what it draws as a VRM");
});

test("J14 far VRM: nobody beyond the distance wears a VRM, even with places free; the capsule is what is left", () => {
  const yo = { x: 0, z: 0 };
  const otros = [{ id: 1, x: 6, z: 0 }, { id: 2, x: 29, z: 0 }, { id: 3, x: 36, z: 0 }, { id: 4, x: 0, z: 60 }];
  assert.deepEqual([...elegirCercanos(yo, otros, 12, new Set(), 3, 30)].sort(), [1, 2], "30 m: the 36 m and 60 m ones are capsules");
  assert.deepEqual([...elegirCercanos(yo, otros, 12, new Set(), 3, 45)].sort(), [1, 2, 3], "a PC (45 m) keeps the 36 m one");
  assert.deepEqual([...elegirCercanos(yo, otros, 12, new Set())].sort(), [1, 2, 3, 4], "no distance given: as before (the cap alone)");
  assert.equal(elegirCercanos(null, otros, 12, new Set(), 3, 30).size, 4, "no self yet: nobody is far from nobody");
});

test("J14 far VRM: the edge has hysteresis, a worn VRM stays VRM_HISTERESIS_M past the line and a new one waits at the line", () => {
  const yo = { x: 0, z: 0 };
  const en = (d: number) => [{ id: 7, x: d, z: 0 }];
  assert.deepEqual([...elegirCercanos(yo, en(31), 12, new Set(), 3, 30)], [], "31 m, no VRM yet: waits");
  assert.deepEqual([...elegirCercanos(yo, en(31), 12, new Set([7]), 3, 30)], [7], "31 m, already worn: stays");
  assert.deepEqual([...elegirCercanos(yo, en(30 + VRM_HISTERESIS_M), 12, new Set([7]), 3, 30)], [7], "exactly at the band's end: stays");
  assert.deepEqual([...elegirCercanos(yo, en(30 + VRM_HISTERESIS_M + 0.1), 12, new Set([7]), 3, 30)], [], "past the band: capsule");
  // someone pacing around 30 m does not flip every half second: inside the band it stays; out (past 34 m) it is back only at the line
  let ya = new Set<number>([7]);
  const camino = [29, 31, 33, 33.9, 32, 31, 30.5, 33, 31];
  assert.deepEqual(camino.map((d) => (ya = elegirCercanos(yo, en(d), 12, ya, 3, 30)).has(7)), camino.map(() => true), "never left the band: no flicker");
  const sale = [29, 35, 33, 31, 30.5, 29.9, 31, 33];
  ya = new Set<number>([7]);
  assert.deepEqual(sale.map((d) => (ya = elegirCercanos(yo, en(d), 12, ya, 3, 30)).has(7)), [true, false, false, false, false, true, true, true], "left past 34 m, back only under 30 m");
  ya = new Set<number>(); const fuera = [36, 31, 29, 33, 33.9, 36].map((d) => (ya = elegirCercanos(yo, en(d), 12, ya, 3, 30)).has(7));
  assert.deepEqual(fuera, [false, false, true, true, true, false], "enters at 29, stays to 33.9, leaves past 34");
});

test("J14 far VRM: with the cap full, the distance still never lets a far one in; nearer ones win the places as before", () => {
  const yo = { x: 0, z: 0 };
  const otros = Array.from({ length: 20 }, (_, i) => ({ id: i, x: 5 + i * 2, z: 0 })); // 5 .. 43 m
  const s = elegirCercanos(yo, otros, 8, new Set(), 3, 30); // 7 places for others
  assert.equal(s.size, 7);
  assert.ok([...s].every((id) => otros[id].x <= 30));
});

test("J14 animation rate: every frame near, every other frame in the middle band, still beyond ANIMAR_HASTA_M", () => {
  assert.equal(ANIMAR_MITAD_DESDE_M, 15);
  assert.equal(cadenciaAnimacion(0), 1);
  assert.equal(cadenciaAnimacion(ANIMAR_MITAD_DESDE_M), 1);
  assert.equal(cadenciaAnimacion(ANIMAR_MITAD_DESDE_M + 0.1), 2);
  assert.equal(cadenciaAnimacion(ANIMAR_HASTA_M), 2);
  assert.equal(cadenciaAnimacion(ANIMAR_HASTA_M + 0.1), 0);
  assert.equal(cadenciaAnimacion(1000), 0);
});
