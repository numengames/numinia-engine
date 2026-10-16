// sim: the deterministic simulation. Same module runs in the browser and in Node.
// Contract: step(state, inputs) -> next state, identical bits on every machine.
// Interface is typed buffers in, typed buffers out (the shape a WASM module would have).
import { fx, fxMul, fxSqrt, fxDiv, fxClamp, fnv1a, rngNext, FX_ONE } from "../../core/src/index.ts";
import { defineSchema } from "../../schema/src/index.ts";
import { World } from "../../ecs/src/index.ts";
import type { Store } from "../../ecs/src/index.ts";

export const TICK_HZ = 20;
export const SPEED = fx(4);                  // walking, metres per second
export const STEP = fxDiv(SPEED, fx(TICK_HZ)); // metres per tick at full stick
export const RUN_SPEED = fx(8);              // J2: running (Shift; touch/VR stick at its edge), like Hyperfy2
export const RUN_STEP = fxDiv(RUN_SPEED, fx(TICK_HZ)); // exactly 2 x STEP
export const BOUND = fx(500);                // plaza half-size in metres
export const STICK_MAX = 127;                // input axes are int8

// ---- J2: height. The feel is Hyperfy2's (PlayerLocal: gravity 20 m/s², jump height 1.5 m, one more jump in the
// air), written here in fixed point. Vertical speed is kept in metres PER TICK so a tick is two integer additions.
export const GRAVITY = fx(20 / (TICK_HZ * TICK_HZ));          // 20 m/s² = 0.05 m per tick per tick
export const JUMP_HEIGHT = fx(1.5);
export const JUMP_V = fxSqrt(fxMul(2 * GRAVITY, JUMP_HEIGHT)); // v = √(2·g·h) ≈ 0.387 m/tick (7.75 m/s)
export const FALL_MAX = fx(50 / TICK_HZ);                    // terminal fall speed 50 m/s (matters once M6 has heights)
export const JUMP_BUFFER = 3;  // a press that cannot jump yet (air jump spent) waits up to 3 ticks (150 ms) for the ground
/** Input buttons (one byte on the wire). JUMP = pressed since the previous input (the page latches taps); RUN = held. */
export const BTN_JUMP = 1, BTN_RUN = 2;
const BTN_KNOWN = BTN_JUMP | BTN_RUN;
/** Inputs are quadruples [entity, mx, mz, buttons]. */
export const INPUT_STRIDE = 4;

/** Height of the ground under (x, z), Q16.16. A flat plaza, plus (U10) the tops of solid things you stand above
 * when `s` is given: the highest top not more than STEP_UP over your feet `y`. M6 (physics) replaces this. */
export function groundHeight(x: number, z: number, s?: SimState, y = 0): number {
  let g = 0;
  const b = s?.solids;
  if (!b) return g;
  for (let o = 0; o + 5 < b.length; o += 6) {
    if (x < b[o] || x > b[o + 3] || z < b[o + 2] || z > b[o + 5]) continue;
    const top = b[o + 4];
    if (top > g && top <= y + STEP_UP) g = top;
  }
  return g;
}

// ---- U10: solid things (a boolean on a placed thing). World geometry, like the ground: NOT part of the state's
// fingerprint (both sides build it from the same shared state). Boxes are axis-aligned, Q16.16:
// [x0, y0, z0, x1, y1, z1] per box. An avatar is a column RADIUS wide and HEIGHT tall; it climbs ledges up to STEP_UP.
export const BODY_RADIUS = fx(0.35);
export const BODY_HEIGHT = fx(1.7);
export const STEP_UP = fx(0.4);
export const SOLIDS_MAX = 512; // boxes the simulation looks at (the nearest are not chosen: the first 512)
/** Does a body standing at (x, y, z) overlap a box it cannot step onto? */
function blocked(s: SimState, x: number, y: number, z: number): boolean {
  const b = s.solids;
  for (let o = 0; o + 5 < b.length; o += 6) {
    if (x + BODY_RADIUS <= b[o] || x - BODY_RADIUS >= b[o + 3] || z + BODY_RADIUS <= b[o + 2] || z - BODY_RADIUS >= b[o + 5]) continue;
    if (y + BODY_HEIGHT <= b[o + 1]) continue;      // the box is above your head
    if (b[o + 4] <= y + STEP_UP) continue;           // low enough to step onto (or you are on it)
    return true;
  }
  return false;
}
/** Replace the solid boxes (both the server and the page call it when the shared state of things changes). */
export function setSolids(s: SimState, boxes: Int32Array): void { s.solids = boxes; }
/** The boxes of every value with `solido: true` and its world box (bx0…bz1, metres), at most SOLIDS_MAX, in key order. */
export function solidsFrom(values: Iterable<[string, Record<string, unknown>]>): Int32Array {
  const list = [...values].filter(([, v]) => v.solido === true && Number(v.bx1) > Number(v.bx0) && Number(v.bz1) > Number(v.bz0))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, SOLIDS_MAX);
  const out = new Int32Array(list.length * 6);
  list.forEach(([, v], i) => { ["bx0", "by0", "bz0", "bx1", "by1", "bz1"].forEach((k, j) => { out[i * 6 + j] = fx(Number(v[k])); }); });
  return out;
}

export const Transform = defineSchema("Transform", 2, { // v2 (J2): gains y
  x: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
  y: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
  z: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
});
export const Avatar = defineSchema("Avatar", 1, {
  owner: { kind: "int", min: 0, max: 65535 },
});
/** J2: what decides the next vertical step besides the position. */
export const Motion = defineSchema("Motion", 1, {
  vy: { kind: "fixed", min: -50, max: 50, step: 1 / 65536 }, // metres per tick (up is +)
  air: { kind: "int", min: 0, max: 1 },                      // 1 = the jump in the air is spent (back to 0 on landing)
  buf: { kind: "int", min: 0, max: JUMP_BUFFER },            // ticks a jump press may still wait for the ground
});

export type SimState = { world: World; tf: Store; av: Store; mo: Store; tick: number; rng: Uint32Array; solids: Int32Array };

export function createSim(capacity: number, seed: number): SimState {
  const world = new World(capacity);
  const tf = world.register(Transform);
  const av = world.register(Avatar);
  const mo = world.register(Motion);
  return { world, tf, av, mo, tick: 0, rng: new Uint32Array([seed >>> 0]), solids: new Int32Array(0) };
}

/** Spawn an avatar at a seeded random spot, standing on the ground; the position comes from the sim's own RNG. */
export function spawnAvatar(s: SimState, owner: number): number {
  const id = s.world.spawn();
  s.world.add(s.av, id, { owner });
  const span = 2 * 40 * FX_ONE; // spawn inside a 80 m square
  s.tf.has[id] = 1;
  s.tf.cols.x[id] = ((rngNext(s.rng) % span) - span / 2) | 0;
  s.tf.cols.z[id] = ((rngNext(s.rng) % span) - span / 2) | 0;
  s.tf.cols.y[id] = groundHeight(s.tf.cols.x[id], s.tf.cols.z[id]);
  s.world.add(s.mo, id);
  return id;
}

/** J2: everything that decides where an avatar goes next. The server sends it whole to the avatar's owner,
 * so the client's prediction restarts from exactly the server's state. */
export type Body = { x: number; y: number; z: number; vy: number; air: number; buf: number };
export function getBody(s: SimState, e: number): Body {
  return { x: s.tf.cols.x[e], y: s.tf.cols.y[e], z: s.tf.cols.z[e], vy: s.mo.cols.vy[e], air: s.mo.cols.air[e], buf: s.mo.cols.buf[e] };
}
export function setBody(s: SimState, e: number, b: Body): void {
  s.tf.cols.x[e] = b.x; s.tf.cols.y[e] = b.y; s.tf.cols.z[e] = b.z;
  s.mo.cols.vy[e] = b.vy; s.mo.cols.air[e] = b.air; s.mo.cols.buf[e] = b.buf;
}
export const sameBody = (a: Body, b: Body): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z && a.vy === b.vy && a.air === b.air && a.buf === b.buf;

/**
 * Inputs: Int32Array of quadruples [entity, mx, mz, buttons], mx/mz in [-127, 127], buttons BTN_*.
 * The caller orders them by entity; the sim re-sorts defensively so order never matters.
 * An avatar advances ONLY when one of its inputs is applied (gravity included): one input = one step of its owner's
 * clock, so the owner's prediction stays exact even on ticks where the server got no input from it (J2).
 */
export function step(s: SimState, inputs: Int32Array): void {
  const n = (inputs.length / INPUT_STRIDE) | 0;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => inputs[a * INPUT_STRIDE] - inputs[b * INPUT_STRIDE]);
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z, VY = s.mo.cols.vy, AIR = s.mo.cols.air, BUF = s.mo.cols.buf;
  for (const i of order) {
    const o = i * INPUT_STRIDE, e = inputs[o];
    if (!s.world.alive[e] || !s.tf.has[e]) continue;
    const buttons = inputs[o + 3] & BTN_KNOWN;
    // horizontal: the stick, walking or running
    let mx = fxDiv(fxClamp(inputs[o + 1], -STICK_MAX, STICK_MAX) * FX_ONE, STICK_MAX * FX_ONE);
    let mz = fxDiv(fxClamp(inputs[o + 2], -STICK_MAX, STICK_MAX) * FX_ONE, STICK_MAX * FX_ONE);
    const len = fxSqrt(fxMul(mx, mx) + fxMul(mz, mz));
    if (len > FX_ONE) { mx = fxDiv(mx, len); mz = fxDiv(mz, len); } // no faster diagonals
    const st = buttons & BTN_RUN ? RUN_STEP : STEP;
    const nx = fxClamp(X[e] + fxMul(mx, st), -BOUND, BOUND), nz = fxClamp(Z[e] + fxMul(mz, st), -BOUND, BOUND);
    if (s.solids.length === 0 || !blocked(s, nx, Y[e], nz)) { X[e] = nx; Z[e] = nz; }
    else if (!blocked(s, nx, Y[e], Z[e])) X[e] = nx;   // U10: slide along a wall
    else if (!blocked(s, X[e], Y[e], nz)) Z[e] = nz;
    // vertical (J2): jump from the ground, or the one jump in the air; then gravity, then the ground stops the fall
    const ground = s.solids.length ? groundHeight(X[e], Z[e], s, Y[e]) : 0;
    let y = Y[e], vy = VY[e], air = AIR[e], buf = buttons & BTN_JUMP ? JUMP_BUFFER + 1 : BUF[e];
    if (buf > 0) {
      buf--;
      if (y <= ground) { vy = JUMP_V; buf = 0; }
      else if (air === 0) { vy = JUMP_V; air = 1; buf = 0; }
    }
    const vy1 = vy - GRAVITY < -FALL_MAX ? -FALL_MAX : vy - GRAVITY;
    y += (vy + vy1) >> 1; // the exact parabola for constant gravity: mean of the speeds before and after
    vy = vy1;
    if (y <= ground) { y = ground; vy = 0; air = 0; }
    Y[e] = y; VY[e] = vy; AIR[e] = air; BUF[e] = buf;
  }
  s.tick++;
}

/** Canonical bytes of the whole state: tick, rng, then every column of every live entity. */
export function snapshot(s: SimState): Uint8Array {
  const ids = s.world.query();
  const PER = 9;
  const buf = new Int32Array(2 + ids.length * PER);
  buf[0] = s.tick; buf[1] = s.rng[0] | 0;
  let o = 2;
  for (const id of ids) {
    buf[o++] = id;
    buf[o++] = s.world.generation[id];
    buf[o++] = s.av.has[id] ? s.av.cols.owner[id] : -1;
    buf[o++] = s.tf.cols.x[id];
    buf[o++] = s.tf.cols.z[id];
    buf[o++] = s.tf.cols.y[id];   // J2
    buf[o++] = s.mo.cols.vy[id];  // J2
    buf[o++] = s.mo.cols.air[id]; // J2
    buf[o++] = s.mo.cols.buf[id]; // J2
  }
  return new Uint8Array(buf.buffer);
}

/** The state fingerprint for this tick. A desync names the tick where it started. */
export const stateHash = (s: SimState): number => fnv1a(snapshot(s));

// ---- Replay: initial seed + per-tick inputs reproduces the run exactly ----
export type Recording = { seed: number; capacity: number; spawns: number[]; ticks: Int32Array[] };

export function replay(r: Recording): number[] {
  const s = createSim(r.capacity, r.seed);
  for (const owner of r.spawns) spawnAvatar(s, owner);
  const hashes: number[] = [];
  for (const inputs of r.ticks) { step(s, inputs); hashes.push(stateHash(s)); }
  return hashes;
}

// ---- Reference run: the same recording replayed in the browser and in Node must give the same
// fingerprint (the hash of all 10,000 per-tick hashes). Little-endian byte order is assumed; every
// target platform (x86-64, ARM64 phones and headsets) is little-endian.
export const REFERENCE = { seed: 1234, ticks: 10000, n: 20 };

export function referenceRecording(seed: number, ticks: number, n: number): Recording {
  const r = new Uint32Array([(seed ^ 0xabcdef) >>> 0]);
  const rec: Recording = { seed, capacity: n + 1, spawns: Array.from({ length: n }, (_, i) => i), ticks: [] };
  for (let t = 0; t < ticks; t++) {
    const inp = new Int32Array(n * INPUT_STRIDE);
    for (let e = 0; e < n; e++) {
      const o = e * INPUT_STRIDE;
      inp[o] = e; inp[o + 1] = (rngNext(r) % 255) - 127; inp[o + 2] = (rngNext(r) % 255) - 127;
      const b = rngNext(r); // J2: a jump press 1 tick in 16 (so double jumps and buffered presses happen), running half the time
      inp[o + 3] = ((b & 15) === 0 ? BTN_JUMP : 0) | ((b >>> 4) & 1 ? BTN_RUN : 0);
    }
    rec.ticks.push(inp);
  }
  return rec;
}

export const replayFingerprint = (r: Recording): number => fnv1a(new Uint8Array(new Uint32Array(replay(r)).buffer));
