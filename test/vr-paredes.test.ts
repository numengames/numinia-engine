// VR: se atraviesan las paredes — room-scale walking (the headset's own tracking) moves the head inside
// the rig without the sim ever seeing it, so until now a real step walked the eye through a column or
// wall; only the stick's movement (through sim's `step()`/`blocked()`) was checked. `empujaFuera`
// (packages/render/src/vr.ts) is the pure push-back used by vr.ts's `update()` for the real head position.
import { test } from "node:test";
import assert from "node:assert/strict";
import { empujaFuera, CUERPO_RADIO_VR } from "../packages/render/src/vr-paredes.ts";

// a 2x2x2 m column centred at (10, 0, 0): x 9..11, y 0..2, z -1..1
const COLUMNA = new Float32Array([9, 0, -1, 11, 2, 1]);

test("empujaFuera: no boxes or far from every box pushes nothing", () => {
  assert.deepEqual(empujaFuera(0, 0, 0, null), [0, 0]);
  assert.deepEqual(empujaFuera(0, 0, 0, COLUMNA), [0, 0]);
  assert.deepEqual(empujaFuera(9 - CUERPO_RADIO_VR - 0.5, 0, 0, COLUMNA), [0, 0]);
});

test("empujaFuera: a step real inside the column's face gets pushed straight back out", () => {
  // head at x=9.1 (0.1 m inside the box face at x=9), z centred: push must be in -x, enough to clear by radio
  const [dx, dz] = empujaFuera(9.1, 0, 0, COLUMNA);
  assert.ok(dx < 0, `dx should push back out (-x), got ${dx}`);
  assert.equal(dz, 0);
  const salida = 9.1 + dx; // the point after the push
  assert.ok(9 - salida >= CUERPO_RADIO_VR - 1e-9, `still inside the exclusion radius: ${salida}`);
});

test("empujaFuera: walking dead-centre through a column still pushes to the nearest face", () => {
  const [dx, dz] = empujaFuera(10, 0, 0, COLUMNA); // centre of the box: distance-based push has no direction
  assert.ok(dx !== 0 || dz !== 0, "must not leave the head stuck at the centre");
  const salida = { x: 10 + dx, z: 0 + dz };
  assert.ok(salida.x <= 9 - CUERPO_RADIO_VR || salida.x >= 11 + CUERPO_RADIO_VR, JSON.stringify(salida));
});

test("empujaFuera: a kerb low enough to step onto (below PASO_SUBIDA) never pushes the head", () => {
  const bordillo = new Float32Array([9, 0, -1, 11, 0.3, 1]); // 0.3 m tall < STEP_UP (0.4)
  assert.deepEqual(empujaFuera(10, 0, 0.5, bordillo), [0, 0], "feet well above it: steps onto it, no push");
});

test("empujaFuera: a box well over head height (a roof/beam) never pushes the head", () => {
  const viga = new Float32Array([9, 3, -1, 11, 4, 1]); // 3-4 m up, feet at 0: head (≤1.7 m) is well under it
  assert.deepEqual(empujaFuera(10, 0, 0, viga), [0, 0]);
});

test("empujaFuera: two overlapping boxes both contribute (a corner) and the push adds up, not cancels", () => {
  // box1 z -1..1, box2 z 0.5..3 (they overlap 0.5..1); point sits well inside both, off-centre in x
  const esquina = new Float32Array([9, 0, -1, 11, 2, 1, 9, 0, 0.5, 11, 2, 3]);
  const [dx, dz] = empujaFuera(9.2, 0.7, 0, esquina);
  assert.ok(dx !== 0 || dz !== 0, "must not leave the head stuck inside the overlap");
  assert.ok(Math.abs(dx - -1.0) < 1e-9, `both boxes push the same way here (nearest face is the shared x0 side for each): ${dx}`);
});
