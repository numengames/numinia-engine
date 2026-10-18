// H2 historias 2-4 (sim): four more order types on top of #53/historia 1's ORDER_PONER, each a branch in `step`
// that never moves PONER. Without any order the reference fingerprint stands (sim 3); with orders the run is
// still reproducible (checked once at the end, like test/ordenes.test.ts does for PONER).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, replayFingerprint, referenceRecording, REFERENCE,
  ORDER_PONER, ORDER_QUIETO, ORDER_EMPUJAR, ORDER_SENTAR, ORDER_VOLAR,
  getMotionExtra, MODO_PIE, MODO_QUIETO, MODO_SENTADO, MODO_VOLANDO, QUIETO_MAX,
  BTN_JUMP, BTN_RUN, BTN_BAJAR, setSolids,
} from "../packages/sim/src/index.ts";

test("QUIETO: frozen 10 ticks ignores the stick, falls if it was in the air, unfreezes on the 11th input", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  s.tf.cols.y[e] = fx(5); s.mo.cols.vy[e] = 0; // in the air, 5 m up, no geometry so ground is 0
  step(s, new Int32Array(0), new Int32Array([e, ORDER_QUIETO, 10, 0, 0, 0]));
  assert.equal(getMotionExtra(s, e).modo, MODO_QUIETO);
  assert.equal(getMotionExtra(s, e).cnt, 10);
  const x0 = s.tf.cols.x[e];
  for (let i = 0; i < 9; i++) {
    step(s, new Int32Array([e, 127, 127, 0])); // full stick, every tick
    assert.equal(s.tf.cols.x[e], x0, "the stick never moves a frozen avatar");
  }
  assert.ok(s.tf.cols.y[e] < fx(5), "gravity still pulls a frozen avatar down");
  assert.equal(getMotionExtra(s, e).cnt, 1, "9 inputs spent, 1 left");
  step(s, new Int32Array([e, 127, 127, 0])); // the 10th input: cnt reaches 0, unfreezes
  assert.equal(getMotionExtra(s, e).modo, MODO_PIE);
  const xAfter = s.tf.cols.x[e];
  step(s, new Int32Array([e, 127, 127, 0])); // the 11th: moves again, free
  assert.ok(s.tf.cols.x[e] !== xAfter, "free again, the stick moves it");
});

test("QUIETO: a = 0 unfreezes immediately; freezing is capped at QUIETO_MAX", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  step(s, new Int32Array(0), new Int32Array([e, ORDER_QUIETO, QUIETO_MAX + 500, 0, 0, 0]));
  assert.equal(getMotionExtra(s, e).cnt, QUIETO_MAX);
  step(s, new Int32Array(0), new Int32Array([e, ORDER_QUIETO, 0, 0, 0, 0]));
  assert.equal(getMotionExtra(s, e).modo, MODO_PIE);
});

test("EMPUJAR: a 20 m/s push travels under 8 m and settles; against a wall it slides; it stands up a seated avatar", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  const x0 = s.tf.cols.x[e];
  step(s, new Int32Array(0), new Int32Array([e, ORDER_EMPUJAR, fx(20), 0, 0, 0]));
  let traveled = 0;
  for (let i = 0; i < 60; i++) { const before = s.tf.cols.x[e]; step(s, new Int32Array([e, 0, 0, 0])); traveled += Math.abs(s.tf.cols.x[e] - before); }
  assert.ok(traveled / 65536 < 8, `travelled ${traveled / 65536} m, expected < 8`);
  assert.ok(Math.abs(getMotionExtra(s, e).ix) < fx(0.01), "the impulse has decayed to almost nothing");

  const s2 = createSim(2, 1); const e2 = spawnAvatar(s2, 0);
  s2.tf.cols.x[e2] = 0; s2.tf.cols.y[e2] = 0; s2.tf.cols.z[e2] = 0;
  setSolids(s2, new Int32Array([fx(1), fx(-5), fx(-5), fx(1.5), fx(5), fx(5)])); // a wall just to the +x
  step(s2, new Int32Array(0), new Int32Array([e2, ORDER_EMPUJAR, fx(20), 0, 0, 0]));
  for (let i = 0; i < 60; i++) step(s2, new Int32Array([e2, 0, 0, 0]));
  assert.ok(s2.tf.cols.x[e2] < fx(0.65), `wall at x=1 (radius 0.35) stopped it; got ${s2.tf.cols.x[e2] / 65536} m`);

  const s3 = createSim(2, 1); const e3 = spawnAvatar(s3, 0);
  step(s3, new Int32Array(0), new Int32Array([e3, ORDER_SENTAR, 0, 0, 0, 0]));
  assert.equal(getMotionExtra(s3, e3).modo, MODO_SENTADO);
  step(s3, new Int32Array(0), new Int32Array([e3, ORDER_EMPUJAR, fx(5), 0, 0, 0]));
  assert.equal(getMotionExtra(s3, e3).modo, MODO_PIE, "a push stands a seated avatar up");
  void x0;
});

test("SENTAR: puts the avatar at the seat, seated; the stick or a jump stands it up; otherwise it stays put", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  step(s, new Int32Array(0), new Int32Array([e, ORDER_SENTAR, fx(3), fx(1), fx(-2), 64 * 90]));
  assert.deepEqual([s.tf.cols.x[e], s.tf.cols.y[e], s.tf.cols.z[e]], [fx(3), fx(1), fx(-2)]);
  assert.equal(getMotionExtra(s, e).modo, MODO_SENTADO);
  step(s, new Int32Array([e, 0, 0, 0])); // no stick, no jump: still seated, still there
  assert.equal(getMotionExtra(s, e).modo, MODO_SENTADO);
  assert.deepEqual([s.tf.cols.x[e], s.tf.cols.y[e], s.tf.cols.z[e]], [fx(3), fx(1), fx(-2)]);
  step(s, new Int32Array([e, 127, 0, 0])); // the stick stands it up
  assert.equal(getMotionExtra(s, e).modo, MODO_PIE);
});

test("VOLAR: no gravity while on; SALTAR climbs, BAJAR descends; turning it off lets gravity take over again", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  step(s, new Int32Array(0), new Int32Array([e, ORDER_VOLAR, 1, 0, 0, 0]));
  assert.equal(getMotionExtra(s, e).modo, MODO_VOLANDO);
  step(s, new Int32Array([e, 0, 0, 0])); // no gravity: y stays
  assert.equal(s.tf.cols.y[e], 0);
  step(s, new Int32Array([e, 0, 0, BTN_JUMP]));
  assert.ok(s.tf.cols.y[e] > 0, "SALTAR climbs while flying");
  const up = s.tf.cols.y[e];
  step(s, new Int32Array(0), new Int32Array([e, ORDER_VOLAR, 0, 0, 0, 0]));
  assert.equal(getMotionExtra(s, e).modo, MODO_PIE);
  let y1 = s.tf.cols.y[e];
  step(s, new Int32Array([e, 0, 0, 0]));
  assert.ok(s.tf.cols.y[e] < y1, "gravity pulls it down again once VOLAR is off");
  assert.ok(up > 0);
});

test("VOLAR: BAJAR descends while flying, starting a few metres up", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  s.tf.cols.y[e] = fx(5);
  step(s, new Int32Array(0), new Int32Array([e, ORDER_VOLAR, 1, 0, 0, 0]));
  const before = s.tf.cols.y[e];
  step(s, new Int32Array([e, 0, 0, BTN_BAJAR]));
  assert.ok(s.tf.cols.y[e] < before, "BAJAR descends while flying");
});

test("an unknown entity moves nothing for any of the four new types (no throw)", () => {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  const before = { x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e] };
  for (const o of [[99, ORDER_QUIETO, 5, 0, 0, 0], [99, ORDER_EMPUJAR, fx(5), 0, 0, 0], [99, ORDER_SENTAR, fx(1), 0, 0, 0], [99, ORDER_VOLAR, 1, 0, 0, 0]]) {
    step(s, new Int32Array(0), new Int32Array(o));
  }
  assert.deepEqual({ x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e] }, before);
});

test("without orders the reference fingerprint (sim 3) is unchanged by historias 2-4; a run using all five order types replays to the same fingerprint twice", () => {
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965);
  const rec = referenceRecording(43, 400, 4);
  const kinds = [ORDER_PONER, ORDER_QUIETO, ORDER_EMPUJAR, ORDER_SENTAR, ORDER_VOLAR];
  const orders = rec.ticks.map((_, t) => {
    if (t % 17 !== 0) return undefined;
    const tipo = kinds[(t / 17) % kinds.length], e = t % 4;
    return new Int32Array([e, tipo, fx((t % 10) - 5), fx(1), fx(-(t % 10)), 0]);
  });
  const withOrders = { ...rec, orders };
  const a = replayFingerprint(withOrders), b = replayFingerprint(withOrders);
  assert.equal(a, b, "same orders, same fingerprint");
  assert.notEqual(a, replayFingerprint(rec), "the orders changed the run");
});
