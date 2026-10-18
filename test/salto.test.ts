// J2: height, gravity, jump, the jump in the air, running — in the sim, on the wire and in the client's prediction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat, FX_ONE } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, getBody, groundHeight, BTN_JUMP, BTN_RUN, JUMP_V, GRAVITY, JUMP_BUFFER, STEP, RUN_STEP, TICK_HZ,
} from "../packages/sim/src/index.ts";
import type { SimState } from "../packages/sim/src/index.ts";
import { encodeSnapshot, decodeSnapshot, encodeInput, decodeInput, encodeWelcome, decodeWelcome, loopbackPair, MSG, WIRE_FORMAT } from "../packages/net/src/index.ts";
import { Instance, Bot } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const one = (): SimState => { const s = createSim(2, 1); spawnAvatar(s, 0); return s; };
/** Step avatar 0 with these buttons for `n` ticks (stick at rest unless given); returns the heights after each tick. */
const run = (s: SimState, n: number, buttons: (t: number) => number, mx = 0, mz = 0): number[] => {
  const ys: number[] = [];
  for (let t = 0; t < n; t++) { step(s, new Int32Array([0, mx, mz, buttons(t)])); ys.push(s.tf.cols.y[0]); }
  return ys;
};

test("J2 sim: a jump climbs to Hyperfy2's 1.5 m, lands in 0.8 s exactly on the ground, and standing stays at 0", () => {
  assert.equal(groundHeight(fx(3), fx(-7)), 0);
  assert.equal(JUMP_V, 25382); // √(2 · 0.05 m/tick² · 1.5 m) in Q16.16: 0.387 m/tick = 7.75 m/s
  const s = one();
  assert.equal(s.tf.cols.y[0], 0);
  assert.deepEqual(run(s, 10, () => 0), new Array(10).fill(0)); // standing: never sinks, never drifts
  const ys = run(s, 30, (t) => (t === 0 ? BTN_JUMP : 0));
  const top = Math.max(...ys);
  assert.ok(fxToFloat(top) > 1.45 && fxToFloat(top) <= 1.5, `apex ${fxToFloat(top)} m`);
  const landed = ys.findIndex((y, i) => i > 0 && y === 0);
  assert.equal(landed, 15, "16 ticks in the air: 0.8 s, like √(8h/g)");
  assert.ok(ys.slice(landed).every((y) => y === 0));
  const b = getBody(s, 0);
  assert.deepEqual([b.vy, b.air, b.buf], [0, 0, 0]);
});

test("J2 sim: one more jump in the air goes higher; a third press in the air does nothing; landing re-arms it", () => {
  const single = Math.max(...run(one(), 30, (t) => (t === 0 ? BTN_JUMP : 0)));
  const s = one();
  const ys = run(s, 50, (t) => (t === 0 || t === 6 || t === 14 ? BTN_JUMP : 0)); // ground jump, air jump near the top, a third press
  const double = Math.max(...ys);
  assert.ok(fxToFloat(double) > fxToFloat(single) + 1.2, `double ${fxToFloat(double)} m vs single ${fxToFloat(single)} m`);
  assert.ok(fxToFloat(double) < 3.01, "never more than two jumps' worth");
  assert.equal(ys[49], 0);
  // the third press must not have lifted it: from the air jump on, the height only goes up then down once
  const after = ys.slice(6);
  const peak = after.indexOf(Math.max(...after));
  for (let i = 1; i < after.length; i++) {
    if (i <= peak) assert.ok(after[i] >= after[i - 1]); else assert.ok(after[i] <= after[i - 1]);
  }
  // back on the ground: a jump and an air jump again
  const again = Math.max(...run(s, 40, (t) => (t === 0 || t === 6 ? BTN_JUMP : 0)));
  assert.equal(again, double);
});

test("J2 sim: a press just before landing (air jump spent) still jumps on landing; a press too early does not", () => {
  // ground jump at 0, air jump at 6: tick L ends on the ground. A third press during tick L-k jumps right after
  // landing only if it waited no more than JUMP_BUFFER ticks for the ground (k + 1 <= JUMP_BUFFER).
  const base = run(one(), 60, (t) => (t === 0 || t === 6 ? BTN_JUMP : 0));
  const L = base.findIndex((y, i) => i > 6 && y === 0);
  assert.ok(L > 6);
  for (let k = 0; k <= 4; k++) {
    const ys = run(one(), 60, (t) => (t === 0 || t === 6 || t === L - k ? BTN_JUMP : 0));
    const jumpedAgain = ys.slice(L + 1, L + 4).some((y) => y > 0);
    assert.equal(jumpedAgain, k + 1 <= JUMP_BUFFER, `press ${k} tick(s) before landing`);
  }
});

test("J2 sim: holding jump on every input never gives more than two jumps per landing, nor more height", () => {
  const ys = run(one(), 200, () => BTN_JUMP); // a client that sends the jump bit every tick
  const top = Math.max(...ys);
  assert.ok(fxToFloat(top) < 3.01, `${fxToFloat(top)} m`);
  // count take-offs from the ground: one per landing
  let takeoffs = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i - 1] === 0 && ys[i] > 0) takeoffs++;
  const landings = ys.filter((y, i) => i > 0 && y === 0 && ys[i - 1] > 0).length;
  assert.ok(takeoffs >= landings && takeoffs <= landings + 1);
});

test("J2 sim: running is RUN_SPEED/SPEED times walking (4 m/s against 1.5, human pace J3), in the air too", () => {
  assert.ok(Math.abs(RUN_STEP / STEP - 4 / 1.5) < 0.01);
  const walk = one(), sprint = one();
  run(walk, TICK_HZ, () => 0, 0, -127);
  run(sprint, TICK_HZ, () => BTN_RUN, 0, -127);
  const z0 = one().tf.cols.z[0];
  assert.equal(walk.tf.cols.z[0] - z0, -TICK_HZ * STEP);   // 1.5 m in 1 s (human walking pace, J3)
  assert.equal(sprint.tf.cols.z[0] - z0, -TICK_HZ * RUN_STEP); // 4 m in 1 s
  const hop = one();
  run(hop, TICK_HZ, (t) => BTN_RUN | (t === 0 ? BTN_JUMP : 0), 0, -127);
  assert.equal(hop.tf.cols.z[0], sprint.tf.cols.z[0]); // jumping does not change horizontal speed
  // unknown bits are ignored, like an out-of-range stick
  const odd = one();
  run(odd, 5, () => 0xfc, 0, -127);
  assert.equal(odd.tf.cols.z[0] - z0, -5 * STEP);
  assert.equal(odd.tf.cols.y[0], 0);
});

test("J2 sim: an avatar without an input this tick does not advance (gravity included)", () => {
  const s = createSim(3, 2); spawnAvatar(s, 0); spawnAvatar(s, 1);
  step(s, new Int32Array([0, 0, 0, BTN_JUMP, 1, 0, 0, BTN_JUMP]));
  const y0 = s.tf.cols.y[0];
  step(s, new Int32Array([1, 0, 0, 0])); // only avatar 1 sent something
  assert.equal(s.tf.cols.y[0], y0);
  assert.ok(s.tf.cols.y[1] > y0);
  assert.equal(GRAVITY, 3277);
});

test("J2 net: buttons travel in a sixth byte; a 5-byte input from before J2 still means no buttons", () => {
  const b = encodeInput(9, 10, -20, BTN_JUMP | BTN_RUN);
  assert.equal(b.length, 6);
  assert.deepEqual(decodeInput(b), { seq: 9, mx: 10, mz: -20, buttons: 3 });
  assert.deepEqual(decodeInput(b.slice(0, 5)), { seq: 9, mx: 10, mz: -20, buttons: 0 });
  const wel = { entity: 1, tick: 2, x: 3, z: 4, ref: { seed: 5, ticks: 6, n: 7, hash: 8 } };
  assert.equal(decodeWelcome(encodeWelcome(wel)).format, WIRE_FORMAT);
  assert.equal(decodeWelcome(encodeWelcome(wel).slice(0, 29)).format, 0); // a server from before J2 says nothing: 0
});

test("J2 net: own vertical state is exact; others carry height only when above the ground (6 or 8 bytes)", () => {
  const s = createSim(6, 4); for (let i = 0; i < 6; i++) spawnAvatar(s, i);
  step(s, new Int32Array([0, 0, 0, BTN_JUMP, 2, 0, 0, BTN_JUMP, 4, 0, 0, BTN_JUMP]));
  step(s, new Int32Array([0, 0, 0, BTN_JUMP])); // avatar 0 spends its air jump too
  const bytes = encodeSnapshot(s, 0, 77, [1, 2, 3, 4, 5]);
  assert.equal(bytes[0], MSG.SNAPSHOT);
  assert.equal(bytes.length, 30 + 3 * 6 + 2 * 8);
  const d = decodeSnapshot(bytes)!;
  assert.deepEqual(d.self, { id: 0, ...getBody(s, 0) });
  assert.equal(d.self.air, 1);
  const byId = new Map(d.others.map((o) => [o.id, o]));
  for (const id of [1, 3, 5]) assert.equal(byId.get(id)!.y, 0);
  for (const id of [2, 4]) assert.ok(Math.abs(byId.get(id)!.y - s.tf.cols.y[id]) < FX_ONE / 64 && byId.get(id)!.y > 0);
  for (const o of d.others) assert.ok(Math.abs(o.x - s.tf.cols.x[o.id]) < FX_ONE / 64 && Math.abs(o.z - s.tf.cols.z[o.id]) < FX_ONE / 64);
  // lying counts are clipped, never thrown
  const liar = bytes.slice(); liar[26] = 0xff; liar[28] = 0xff;
  assert.doesNotThrow(() => decodeSnapshot(liar));
  assert.ok(decodeSnapshot(liar)!.others.length <= 5);
  assert.equal(decodeSnapshot(bytes.slice(0, 29)), null);
});

test("J2 prediction: jumping, double jumping and running over loopback, inputs late or bunched: 0 corrections, exact landing", () => {
  const inst = new Instance({ seed: 5, capacity: 8, k: 8, snapshotEvery: 2 });
  const [server, client] = loopbackPair();
  inst.connect(server);
  const others = [new Bot(inst.join(1), 11), new Bot(inst.join(2), 12)]; // hopping, running bots around
  const session = new ClientSession(client);
  client.flush();
  let maxY = 0, airborne = 0;
  for (let t = 0; t < 400; t++) {
    const buttons = (t % 37 === 0 || t % 37 === 6 ? BTN_JUMP : 0) | (t % 100 < 50 ? BTN_RUN : 0);
    const mx = t < 200 ? 127 : -90, mz = t % 60 < 30 ? -127 : 70;
    // the network is not a metronome: some server ticks get no input from us, others get two
    const sends = t % 23 === 5 ? 0 : t % 23 === 6 ? 2 : 1;
    for (let k = 0; k < sends; k++) session.tick(mx, mz, k === 0 ? buttons : buttons & BTN_RUN);
    for (const b of others) b.think();
    inst.tick();
    client.flush();
    const me = session.selfPosition(1);
    maxY = Math.max(maxY, me.y);
    if (!me.grounded) airborne++;
  }
  for (let t = 0; t < 40; t++) { session.tick(0, 0); inst.tick(); client.flush(); } // catch up and land
  assert.equal(session.stats.corrections, 0);
  assert.ok(maxY > 2, `highest ${maxY} m: the double jumps happened`);
  assert.ok(airborne > 50);
  const me = session.selfPosition(1), e = session.entity;
  assert.equal(Math.round(me.x * FX_ONE), inst.sim.tf.cols.x[e]);
  assert.equal(Math.round(me.y * FX_ONE), inst.sim.tf.cols.y[e]);
  assert.equal(Math.round(me.z * FX_ONE), inst.sim.tf.cols.z[e]);
  assert.equal(me.y, 0);
  assert.ok(me.grounded);
});

test("J2 client: others' height is interpolated and their speed reads walking or running", () => {
  const inst = new Instance({ seed: 6, capacity: 4, k: 4, snapshotEvery: 2 });
  const [sa, ca] = loopbackPair(), [sb, cb] = loopbackPair();
  inst.connect(sa); inst.connect(sb);
  const a = new ClientSession(ca), b = new ClientSession(cb);
  ca.flush(); cb.flush();
  inst.sim.tf.cols.x[b.entity] = inst.sim.tf.cols.x[a.entity] + fx(5); // B stands next to A
  inst.sim.tf.cols.z[b.entity] = inst.sim.tf.cols.z[a.entity];
  const seen: { y: number; speed: number }[] = [];
  for (let t = 0; t < 30; t++) {
    a.tick(0, -127, (t === 2 ? BTN_JUMP : 0) | BTN_RUN);
    b.tick(0, 0);
    inst.tick(); ca.flush(); cb.flush();
    const r = b.remotePositions().find((p) => p.id === a.entity);
    if (r) seen.push({ y: r.y, speed: r.speed });
  }
  assert.ok(Math.max(...seen.map((s) => s.y)) > 1, "B saw A in the air");
  assert.ok(seen.some((s) => Math.abs(s.speed - 4) < 0.2), `B saw A running: ${seen.map((s) => s.speed.toFixed(1)).join(" ")}`);
  assert.ok(Math.abs(a.selfPosition(1).speed - 4) < 0.01);
});
