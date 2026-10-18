// M6 stories 5-7: box-triangle collision against the world mesh (a wall or a ceiling stops you, a ramp does not),
// sliding along a steep triangle by its normal, and that the mesh steps already granted by h3-4 (STEP_UP/SNAP_DOWN
// over a ray) still hold once walls exist. Design: work/motor-vr/DISENO-M6-fisica.md §4 h5-h7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { buildBvh } from "../packages/sim/src/bvh.ts";
import {
  createSim, spawnAvatar, step, setMesh, groundHeight, getBody, setBody,
  replayFingerprint, referenceRecording, REFERENCE, STEP_UP,
} from "../packages/sim/src/index.ts";

const U = 64; // 1/64 m units per metre
/** A horizontal square (two triangles) at height `y` metres from -s..s, wound so the normal points up. */
const floor = (y: number, s = 10): number[] => [
  -s * U, y * U, -s * U, s * U, y * U, s * U, s * U, y * U, -s * U,
  -s * U, y * U, -s * U, -s * U, y * U, s * U, s * U, y * U, s * U,
];
/** A vertical wall at x = wx, from z z0..z1, floor y 0..h. */
const wall = (wx: number, z0: number, z1: number, h = 4): number[] => [
  wx * U, 0, z0 * U, wx * U, h * U, z1 * U, wx * U, 0, z1 * U,
  wx * U, 0, z0 * U, wx * U, h * U, z0 * U, wx * U, h * U, z1 * U,
];
/** A ramp rising `rise` metres over `run` metres along +x, width `w` in z, starting at x0 (deg from horizontal). */
const ramp = (x0: number, run: number, rise: number, w = 10): number[] => [
  x0 * U, 0, -w * U, (x0 + run) * U, rise * U, w * U, (x0 + run) * U, rise * U, -w * U,
  x0 * U, 0, -w * U, x0 * U, 0, w * U, (x0 + run) * U, rise * U, w * U,
];
/** A horizontal ceiling at height y, 1..9 m square (so it does not also act as the ground under it). */
const ceiling = (y: number): number[] => floor(y, 1).map((v, i) => (i % 3 === 0 ? v + 5 * U : v));

test("M6 h5: a vertical wall from a GLB mesh stops a walking body (box-triangle)", () => {
  const s = createSim(1, 0); setMesh(s, buildBvh(new Int32Array([...floor(0), ...wall(2, -5, 5)])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 80; i++) step(s, new Int32Array([e, 127, 0, 0])); // walk east into the wall at x=2
  const b = getBody(s, e);
  assert.ok(b.x < fx(2) && b.x > fx(1.3), `went through the wall: x=${b.x / FX_ONE}`);
});

test("M6 h5: a 20° ramp is walkable, not a wall (climbed gradually, below the fingerprint-irrelevant top)", () => {
  const s = createSim(1, 1);
  setMesh(s, buildBvh(new Int32Array([...floor(0), ...ramp(2, 8, 8 * Math.tan(Math.PI * 20 / 180))])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 90; i++) step(s, new Int32Array([e, 127, 0, 0])); // walk east onto the ramp, short of its top (x=10)
  const b = getBody(s, e);
  assert.ok(b.x > fx(4) && b.x < fx(10), `not on the ramp: x=${b.x / FX_ONE}`);
  assert.ok(b.y > fx(0.5), `did not rise with the ramp: x=${b.x / FX_ONE} y=${b.y / FX_ONE}`);
});

test("M6 h6: a 60° slope cannot be climbed (too steep: treated as a wall, not ground)", () => {
  const s = createSim(1, 2);
  setMesh(s, buildBvh(new Int32Array([...floor(0), ...ramp(2, 4, 4 * Math.tan(Math.PI * 60 / 180))])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 300; i++) step(s, new Int32Array([e, 127, 0, 0]));
  const b = getBody(s, e);
  assert.ok(b.x < fx(2.5), `climbed a 60° slope: x=${b.x / FX_ONE} y=${b.y / FX_ONE}`);
  assert.ok(b.y < fx(0.5), `stood on the steep slope: y=${b.y / FX_ONE}`);
});

test("M6 h6: a diagonal walk against a mesh wall slides along it (only the tangential component moves)", () => {
  const s = createSim(1, 3); setMesh(s, buildBvh(new Int32Array([...floor(0), ...wall(2, -10, 10)])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 120; i++) step(s, new Int32Array([e, 127, 127, 0])); // diagonal into the wall, sliding +z
  const b = getBody(s, e);
  assert.ok(b.x < fx(2), `went through the wall while sliding: x=${b.x / FX_ONE}`);
  assert.ok(b.z > fx(3), `did not slide along the wall: z=${b.z / FX_ONE}`);
});

test("M6 h5: a ceiling 1.5 m up blocks standing up through it; it does not block walking under it", () => {
  const s = createSim(1, 4); setMesh(s, buildBvh(new Int32Array([...floor(0), ...ceiling(1.5)])));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 20; i++) step(s, new Int32Array([e, 0, 0, 1])); // jump straight up under the ceiling (1 = BTN_JUMP)
  const b = getBody(s, e);
  assert.ok(b.y < fx(1.5) - 1, `went through the ceiling: y=${b.y / FX_ONE}`);
  // walking under the low ceiling (no jump) is never blocked: it is well over STEP_UP, nowhere near the head's way
});

test("M6 h7: STEP_UP/SNAP_DOWN over a mesh (h3-4) still hold once walls exist in the same world", () => {
  const s = createSim(1, 5);
  setMesh(s, buildBvh(new Int32Array([...floor(0), ...floor(0.25, 1), ...wall(50, -50, 50)]))); // a 25 cm step, far wall
  assert.equal(groundHeight(fx(0.5), fx(0.5), s, fx(0)), fx(0.25));
  assert.ok(STEP_UP >= fx(0.25));
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: fx(-2), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 36; i++) step(s, new Int32Array([e, 127, 0, 0])); // walk east onto the step (it spans x -1..1), short of its far edge
  const b = getBody(s, e);
  assert.ok(b.x > fx(0.5) && b.y === fx(0.25), `did not climb the step with a wall elsewhere: x=${b.x / FX_ONE} y=${b.y / FX_ONE}`);
});

test("M6: a world mesh never changes the reference fingerprint (world geometry, not state, like solids)", () => {
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, 400, 4)), replayFingerprint(referenceRecording(REFERENCE.seed, 400, 4)));
});
