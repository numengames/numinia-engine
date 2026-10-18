// M6 h12: api.rayo — a ray from a player's eyes against the world's collision mesh, rate-limited (4/s, burst 8,
// shared across every feature a player uses). h9 (the page's own BVH) is a separate module: see bvh.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerRuntime, serverPart, defineFeature, RAYO_RATE } from "../packages/feature/src/index.ts";
import type { ServerApi, RayHit } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { setMesh, buildBvh, quantizeTriangles } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";

const sonda = defineFeature({ id: "sonda-rayo", version: 1, describe: "only for this test: captures api.rayo" });

test("rayo: declared cleanly", () => assert.deepEqual(sonda.issues, []));

test("api.rayo: a token bucket of RAYO_RATE (4/s, burst 8), shared across whoever calls it for this player", () => {
  let api!: ServerApi;
  const part = serverPart(sonda, (a) => { api = a; });
  let tick = 0, asked = 0;
  const fixed: RayHit = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, distancia: 1 };
  const rt = new ServerRuntime([part], {
    players: () => [0], position: () => ({ x: 0, y: 0, z: 0 }), send: () => {}, tick: () => tick, log: () => {},
    rayo: () => { asked++; return fixed; },
  });
  rt.join(0);
  assert.equal(RAYO_RATE.burst, 8, "the rest of this test assumes the design's 8");
  for (let i = 0; i < RAYO_RATE.burst; i++) assert.deepEqual(api.rayo(0, { x: 0, y: -1, z: 0 }), fixed, `shot ${i + 1} of the burst`);
  assert.equal(asked, RAYO_RATE.burst);
  assert.equal(api.rayo(0, { x: 0, y: -1, z: 0 }), null, "one more in the same tick: over budget");
  assert.equal(asked, RAYO_RATE.burst, "over budget never even reaches the host");
  tick += TICK_HZ_TEST / RAYO_RATE.perSecond; // one quarter of a second later: exactly one token back
  assert.ok(api.rayo(0, { x: 0, y: -1, z: 0 }));
  assert.equal(asked, RAYO_RATE.burst + 1);
  // a second player has its own budget
  rt.join(1);
  for (let i = 0; i < RAYO_RATE.burst; i++) assert.ok(api.rayo(1, { x: 0, y: -1, z: 0 }));
  assert.equal(api.rayo(1, { x: 0, y: -1, z: 0 }), null);
});
const TICK_HZ_TEST = 20; // sim.TICK_HZ, repeated so this file does not depend on the sim package

test("instance.rayo: a ray down hits the mesh floor (normal up); no mesh yet, or a gone player, is null", () => {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: () => {} });
  inst.join(0);
  const e = inst.conns[0].entity;
  assert.equal(inst.rayo(e, { x: 0, y: -1, z: 0 }, 10), null, "M6: no world mesh set yet");
  // a flat 10x10 floor at y=0, two triangles, already in world space (no object to place: this tests the ray alone)
  const floor = quantizeTriangles(new Float32Array([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, -5, 5, 0, 5, -5, 0, 5]));
  setMesh(inst.sim, buildBvh(floor));
  inst.sim.tf.cols.x[e] = fx(0); inst.sim.tf.cols.z[e] = fx(0); // over the middle of the floor, whatever the spawn gave
  inst.sim.tf.cols.y[e] = fx(2); // stand 2 m over the floor; the ray starts EYE_HEIGHT over that
  const hit = inst.rayo(e, { x: 0, y: -1, z: 0 }, 10);
  assert.ok(hit, "the mesh is under the eyes, within 10 m");
  assert.ok(Math.abs(hit!.y) < 0.02, `hit.y = ${hit!.y}, expected ~0 (the floor)`);
  assert.ok(hit!.ny > 0.9, "the normal faces the ray: up");
  assert.equal(inst.rayo(e, { x: 0, y: 1, z: 0 }, 10), null, "looking up: nothing there");
  inst.disconnect(e);
  assert.equal(inst.rayo(e, { x: 0, y: -1, z: 0 }, 10), null, "gone");
});
