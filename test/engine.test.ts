import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxMul, fxDiv, fxSqrt, FX_ONE, rngNext, fnv1a, hex } from "../packages/core/src/index.ts";
import { defineSchema, validate, fieldBits } from "../packages/schema/src/index.ts";
import { createSim, spawnAvatar, step, stateHash, replay, referenceRecording, replayFingerprint, REFERENCE, BTN_JUMP } from "../packages/sim/src/index.ts";
import {
  BitWriter, BitReader, encodeSnapshot, decodeSnapshot, buildGrid, selectVisible, encodeInput, decodeInput,
  encodeWelcome, decodeWelcome, seqNewer, loopbackPair, quantPos, MSG,
} from "../packages/net/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { runHeadless } from "../packages/cli/src/run.ts";

test("fxMul is exact floor(a*b/2^16) against BigInt", () => {
  const r = new Uint32Array([7]);
  for (let i = 0; i < 20000; i++) {
    const a = rngNext(r) | 0, b = (rngNext(r) | 0) >> (rngNext(r) % 16);
    const exact = BigInt.asIntN(32, (BigInt(a) * BigInt(b)) >> 16n);
    assert.equal(fxMul(a, b), Number(exact), `a=${a} b=${b}`);
  }
});

test("fxDiv and fxSqrt are exact on known values", () => {
  assert.equal(fxDiv(fx(1), fx(4)), FX_ONE / 4);
  assert.equal(fxSqrt(fx(9)), fx(3));
  assert.equal(fxSqrt(fx(2)), 92681); // floor(sqrt(2) * 65536)
});

test("rng and hash are stable known vectors", () => {
  const r = new Uint32Array([42]);
  const seq = [rngNext(r), rngNext(r), rngNext(r)];
  const r2 = new Uint32Array([42]);
  assert.deepEqual([rngNext(r2), rngNext(r2), rngNext(r2)], seq);
  assert.equal(hex(fnv1a(new TextEncoder().encode("a"))), "e40c292c"); // FNV-1a 32 reference
});

test("schema: errors carry a path, unknown fields survive, bits are documented", () => {
  const S = defineSchema("Door", 1, { open: { kind: "bool" }, code: { kind: "int", min: 0, max: 9999 } });
  const bad = validate(S, { open: "yes", code: 12345 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.issues.map((i) => i.path), ["Door.open", "Door.code"]);
  const good = validate(S, { code: 7, futureField: "kept" });
  assert.ok(good.ok && good.value.futureField === "kept");
  assert.equal(fieldBits(S.fields.code), 14);
});

test("determinism: 10,000 ticks replay to identical fingerprints", () => {
  const rec = referenceRecording(1234, 10000, 20);
  const a = replay(rec), b = replay(rec);
  assert.equal(a.length, 10000);
  assert.deepEqual(a, b);
  assert.notDeepEqual(replay(referenceRecording(1235, 50, 20)), replay(referenceRecording(1234, 50, 20)));
});

test("determinism: the reference fingerprint is pinned (a change here is a sim format change: ADR)", () => {
  // 7e630965 since J3 (human VR pace: walk 1.5 m/s, run 4 m/s, sim/wire format 3). Before J3: 93b192c8 (format 2, J2).
  const h = replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n));
  assert.equal(hex(h), "7e630965");
});

test("determinism: input order does not matter", () => {
  const mk = () => { const s = createSim(4, 9); for (let i = 0; i < 3; i++) spawnAvatar(s, i); return s; };
  const s1 = mk(), s2 = mk();
  step(s1, new Int32Array([0, 127, 0, 1, 1, 0, -127, 0, 2, 50, 50, 3]));
  step(s2, new Int32Array([2, 50, 50, 3, 0, 127, 0, 1, 1, 0, -127, 0]));
  assert.equal(stateHash(s1), stateHash(s2));
});

test("net: bits, messages and quantization round-trip", () => {
  const w = new BitWriter(1); w.write(5, 3); w.write(65535, 16); w.write(1, 1);
  const r = new BitReader(w.finish()); assert.deepEqual([r.read(3), r.read(16), r.read(1)], [5, 65535, 1]);
  assert.deepEqual(decodeInput(encodeInput(3, -127, 64)), { seq: 3, mx: -127, mz: 64, buttons: 0 });
  const wel = { entity: 7, tick: 99, x: -123456, z: 654321, ref: { seed: 1, ticks: 2, n: 3, hash: 0xdeadbeef }, format: 2 };
  assert.deepEqual(decodeWelcome(encodeWelcome(wel)), wel);
  const s = createSim(10, 5); for (let i = 0; i < 10; i++) spawnAvatar(s, i);
  const bytes = encodeSnapshot(s, 0, 4242, [1, 2, 3]);
  assert.equal(bytes[0], MSG.SNAPSHOT);
  const d = decodeSnapshot(bytes);
  assert.equal(d.ack, 4242);
  assert.deepEqual([d.self.x, d.self.z], [s.tf.cols.x[0], s.tf.cols.z[0]]); // own position is exact
  assert.equal(d.others.length, 3);
  for (const o of d.others) assert.ok(Math.abs(o.x - s.tf.cols.x[o.id]) < FX_ONE / 64);
  assert.ok(seqNewer(1, 65535) && !seqNewer(65535, 1) && !seqNewer(5, 5));
});

test("net: a lying count or a truncated message never throws", () => {
  const bytes = encodeSnapshot(createSim(1, 1), 0, 0, []);
  bytes[bytes.length - 1] = 0xff; // claims many entities
  assert.doesNotThrow(() => decodeSnapshot(bytes));
  assert.equal(decodeSnapshot(bytes)!.others.length, 0);
  assert.equal(decodeSnapshot(bytes.slice(0, 12)), null);
});

test("net: the fast snapshot writer is byte-for-byte the documented bit layout", () => {
  const s = createSim(40, 11); for (let i = 0; i < 40; i++) spawnAvatar(s, i);
  step(s, new Int32Array([5, 0, 0, BTN_JUMP, 21, 0, 0, BTN_JUMP])); // two of them in the air (J2)
  s.tick = 0xfedcba98;
  const vis = [3, 7, 21, 39];
  const w = new BitWriter(8);
  w.write(MSG.SNAPSHOT, 8); w.write(s.tick, 32); w.write(513, 16); w.write(5, 16);
  w.write(s.tf.cols.x[5], 32); w.write(s.tf.cols.z[5], 32); w.write(s.tf.cols.y[5], 32); w.write(s.mo.cols.vy[5], 32);
  w.write(s.mo.cols.air[5] | (s.mo.cols.buf[5] << 1), 8); w.write(3, 16); w.write(1, 16); // 3 at ground level, 1 above
  for (const id of [3, 7, 39]) { w.write(id, 16); w.write(quantPos(s.tf.cols.x[id]), 16); w.write(quantPos(s.tf.cols.z[id]), 16); }
  w.write(21, 16); w.write(quantPos(s.tf.cols.x[21]), 16); w.write(quantPos(s.tf.cols.z[21]), 16); w.write(quantPos(s.tf.cols.y[21]), 16);
  assert.deepEqual(encodeSnapshot(s, 5, 513, vis), w.finish());
});

test("area of interest: never more than k, never far away", () => {
  const s = createSim(300, 3); for (let i = 0; i < 300; i++) spawnAvatar(s, i);
  s.tf.cols.x[299] = fx(450); s.tf.cols.z[299] = fx(450); // one avatar far away
  const grid = buildGrid(s);
  const v = { entity: 0, priority: new Float64Array(300) };
  for (let i = 0; i < 5; i++) {
    const vis = selectVisible(s, grid, v, 50);
    assert.ok(vis.length <= 50);
    assert.ok(!vis.includes(299));
  }
});

test("prediction: the client predicts its own moves exactly (0 corrections) and lands where the server says", () => {
  const inst = new Instance({ seed: 3, capacity: 8, k: 8, snapshotEvery: 2 });
  const [server, client] = loopbackPair();
  inst.connect(server);
  const session = new ClientSession(client);
  client.flush(); // WELCOME
  assert.ok(session.entity >= 0);
  for (let t = 0; t < 200; t++) {
    const mx = t < 100 ? 127 : -60, mz = t % 40 < 20 ? -127 : 90;
    session.tick(mx, mz); // client tick: send + predict
    inst.tick();          // server applies exactly one input
    client.flush();       // snapshots arrive
  }
  assert.equal(session.stats.corrections, 0);
  const me = session.selfPosition(1);
  assert.equal(Math.round(me.x * FX_ONE), inst.sim.tf.cols.x[session.entity]);
  assert.equal(Math.round(me.z * FX_ONE), inst.sim.tf.cols.z[session.entity]);
});

test("headless run: same seed same fingerprint, through the real protocol", () => {
  const a = runHeadless({ ticks: 400, seed: 42, bots: 30, k: 20 });
  const b = runHeadless({ ticks: 400, seed: 42, bots: 30, k: 20 });
  assert.equal(a.hash, b.hash);
  assert.ok(a.avgVisible > 0 && a.avgVisible <= 20);
});
