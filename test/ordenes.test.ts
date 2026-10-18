// H2 historia 1 (sim: orden tipada). An order is now a sextuple [entity, tipo, a, b, c, d]; ORDER_PONER (1) is
// D-045's quadruple with a type byte in front, same behaviour (put there, still: vy 0, jump spent cleared). Without
// orders a run steps exactly as before (the reference fingerprint, `REFERENCE`, is pinned in test/engine.test.ts and
// repeated here); with orders the run is reproducible (same orders twice -> same hashes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, replay, referenceRecording, replayFingerprint, REFERENCE,
  ORDER_STRIDE, ORDER_PONER,
} from "../packages/sim/src/index.ts";

test("ORDER_PONER puts the avatar there, still, and clears the jump state", () => {
  const s = createSim(4, 1); const e = spawnAvatar(s, 0);
  s.mo.cols.vy[e] = fx(3); s.mo.cols.air[e] = 1; s.mo.cols.buf[e] = 2; // mid-jump, before the order
  step(s, new Int32Array(0), new Int32Array([e, ORDER_PONER, fx(10), fx(5), fx(-4), 0]));
  assert.deepEqual([s.tf.cols.x[e], s.tf.cols.y[e], s.tf.cols.z[e]], [fx(10), fx(5), fx(-4)]);
  assert.deepEqual([s.mo.cols.vy[e], s.mo.cols.air[e], s.mo.cols.buf[e]], [0, 0, 0]);
});

test("an unknown entity, or an unknown order type, moves nothing (no throw)", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  const before = { x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e] };
  step(s, new Int32Array(0), new Int32Array([99, ORDER_PONER, fx(1), fx(1), fx(1), 0])); // despawned/out-of-range entity
  assert.deepEqual({ x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e] }, before);
  step(s, new Int32Array(0), new Int32Array([e, 0, fx(1), fx(1), fx(1), 0])); // tipo 0: not ORDER_PONER, ignored
  assert.deepEqual({ x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e] }, before);
});

test("without orders the reference fingerprint (sim 3) is unchanged; a replay with ORDER_PONER repeated twice gives the same fingerprint", () => {
  assert.equal(ORDER_STRIDE, 6);
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965);
  const rec = referenceRecording(42, 500, 5);
  const orders = rec.ticks.map((_, t) => (t % 23 === 0 ? new Int32Array([t % 5, ORDER_PONER, fx(t % 50), fx(1), fx(-(t % 50)), 0]) : undefined));
  const withOrders = { ...rec, orders };
  const a = replayFingerprint(withOrders), b = replayFingerprint(withOrders);
  assert.equal(a, b, "same orders, same fingerprint");
  assert.notEqual(a, replayFingerprint(rec), "the orders changed the run");
});
