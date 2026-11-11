// QA Simposio 2026-11-11: a long slanted wall triangle blocks only where it really is, not in the air of its AABB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBvh, quantizeTriangles, triCrossesBox } from "../packages/sim/src/bvh.ts";
import { FX_ONE } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, step, setMesh, getBody, setBody } from "../packages/sim/src/index.ts";

const fx = (m: number) => Math.round(m * FX_ONE);
// a tent's cloth edge: from the floor at (0, 0, 0) up to (0.5, 24, 8), plus a point to make it a thin sliver
const b = buildBvh(quantizeTriangles([0, 0, 0, 0.5, 24, 8, 0.1, 3, 0.9]));
const caja = (x: number, z: number, y = 0.4) => triCrossesBox(b, 0, fx(x - 0.35), fx(y), fx(z - 0.35), fx(x + 0.35), fx(y + 1.3), fx(z + 0.35));

test("the body standing where the triangle is near the floor is blocked", () => {
  assert.equal(caja(0.05, 0.3), true);
});
test("the body standing in the air of the triangle's AABB (4 m along, the cloth is 12 m up there) is not", () => {
  assert.equal(caja(0.25, 4), false);
});
test("a plain vertical wall across the path still blocks", () => {
  const w = buildBvh(quantizeTriangles([-5, 0, 2, 5, 0, 2, 0, 5, 2]));
  assert.equal(triCrossesBox(w, 0, fx(-0.35), fx(0.4), fx(1.8), fx(0.35), fx(1.7), fx(2.5)), true);
  assert.equal(triCrossesBox(w, 0, fx(-0.35), fx(0.4), fx(0.8), fx(0.35), fx(1.7), fx(1.5)), false);
});

// the same through the simulation: a body walks under the air of a tall slanted triangle's AABB instead of stopping at it
test("sim: a body walks along the air under a tall slanted triangle; it is not stopped by the triangle's AABB", () => {
  const U = 64;
  const piso = [-20, 0, -20, 20, 0, 20, 20, 0, -20, -20, 0, -20, -20, 0, 20, 20, 0, 20].map((v, i) => (i % 3 === 1 ? v : v * U));
  const tienda = [0, 0, 0, 0.5, 24, 8, 0.1, 3, 0.9].map((v) => Math.round(v * U));
  const s = createSim(1, 7); setMesh(s, buildBvh(new Int32Array([...piso, ...tienda])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: fx(0.25), y: 0, z: fx(2.5), vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 120; i++) step(s, new Int32Array([e, 0, 127, 0])); // walk +z for 6 s (9 m at walking pace)
  assert.ok(getBody(s, e).z > fx(8), `stopped by the AABB at z=${getBody(s, e).z / FX_ONE}`);
});
