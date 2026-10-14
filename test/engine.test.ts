import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxMul, fxDiv, fxSqrt, FX_ONE, rngNext, fnv1a, hex } from "../packages/core/src/index.ts";
import { defineSchema, validate, fieldBits } from "../packages/schema/src/index.ts";
import { createSim, spawnAvatar, step, stateHash, replay } from "../packages/sim/src/index.ts";
import type { Recording } from "../packages/sim/src/index.ts";
import { BitWriter, BitReader, encodeSnapshot, decodeSnapshot, buildGrid, selectVisible, encodeInput, decodeInput } from "../packages/net/src/index.ts";
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

function scripted(seed: number, ticks: number, n: number): Recording {
  const r = new Uint32Array([seed ^ 0xabcdef]);
  const rec: Recording = { seed, capacity: n + 1, spawns: Array.from({ length: n }, (_, i) => i), ticks: [] };
  for (let t = 0; t < ticks; t++) {
    const inp = new Int32Array(n * 3);
    for (let e = 0; e < n; e++) { inp[e * 3] = e; inp[e * 3 + 1] = (rngNext(r) % 255) - 127; inp[e * 3 + 2] = (rngNext(r) % 255) - 127; }
    rec.ticks.push(inp);
  }
  return rec;
}

test("determinism: 10,000 ticks replay to identical fingerprints", () => {
  const rec = scripted(1234, 10000, 20);
  const a = replay(rec), b = replay(rec);
  assert.equal(a.length, 10000);
  assert.deepEqual(a, b);
  assert.notDeepEqual(replay(scripted(1235, 50, 20)), replay(scripted(1234, 50, 20)));
});

test("determinism: input order does not matter", () => {
  const mk = () => { const s = createSim(4, 9); for (let i = 0; i < 3; i++) spawnAvatar(s, i); return s; };
  const s1 = mk(), s2 = mk();
  step(s1, new Int32Array([0, 127, 0, 1, 0, -127, 2, 50, 50]));
  step(s2, new Int32Array([2, 50, 50, 0, 127, 0, 1, 0, -127]));
  assert.equal(stateHash(s1), stateHash(s2));
});

test("net: bits round-trip and snapshot error <= 1/64 m", () => {
  const w = new BitWriter(1); w.write(5, 3); w.write(65535, 16); w.write(1, 1);
  const r = new BitReader(w.finish()); assert.deepEqual([r.read(3), r.read(16), r.read(1)], [5, 65535, 1]);
  assert.deepEqual(decodeInput(encodeInput(3, -127, 64)), { seq: 3, mx: -127, mz: 64 });
  const s = createSim(10, 5); for (let i = 0; i < 10; i++) spawnAvatar(s, i);
  const d = decodeSnapshot(encodeSnapshot(s, 0, [1, 2, 3]));
  assert.equal(d.others.length, 3);
  for (const o of d.others) assert.ok(Math.abs(o.x - s.tf.cols.x[o.id]) < FX_ONE / 64);
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

test("headless run: same seed same fingerprint, through the real protocol", () => {
  const a = runHeadless({ ticks: 400, seed: 42, bots: 30, k: 20 });
  const b = runHeadless({ ticks: 400, seed: 42, bots: 30, k: 20 });
  assert.equal(a.hash, b.hash);
  assert.ok(a.avgVisible > 0 && a.avgVisible <= 20);
});
