// sim: the deterministic simulation. Same module runs in the browser and in Node.
// Contract: step(state, inputs) -> next state, identical bits on every machine.
// Interface is typed buffers in, typed buffers out (the shape a WASM module would have).
import { fx, fxMul, fxSqrt, fxDiv, fxClamp, fnv1a, rngNext, FX_ONE } from "../../core/src/index.ts";
import { defineSchema } from "../../schema/src/index.ts";
import { World } from "../../ecs/src/index.ts";
import type { Store } from "../../ecs/src/index.ts";

export const TICK_HZ = 20;
export const SPEED = fx(4);                  // metres per second
export const STEP = fxDiv(SPEED, fx(TICK_HZ)); // metres per tick at full stick
export const BOUND = fx(500);                // plaza half-size in metres
export const STICK_MAX = 127;                // input axes are int8

export const Transform = defineSchema("Transform", 1, {
  x: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
  z: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
});
export const Avatar = defineSchema("Avatar", 1, {
  owner: { kind: "int", min: 0, max: 65535 },
});

export type SimState = { world: World; tf: Store; av: Store; tick: number; rng: Uint32Array };

export function createSim(capacity: number, seed: number): SimState {
  const world = new World(capacity);
  const tf = world.register(Transform);
  const av = world.register(Avatar);
  return { world, tf, av, tick: 0, rng: new Uint32Array([seed >>> 0]) };
}

/** Spawn an avatar at a seeded random spot; the position comes from the sim's own RNG. */
export function spawnAvatar(s: SimState, owner: number): number {
  const id = s.world.spawn();
  s.world.add(s.av, id, { owner });
  const span = 2 * 40 * FX_ONE; // spawn inside a 80 m square
  s.tf.has[id] = 1;
  s.tf.cols.x[id] = ((rngNext(s.rng) % span) - span / 2) | 0;
  s.tf.cols.z[id] = ((rngNext(s.rng) % span) - span / 2) | 0;
  return id;
}

/**
 * Inputs: Int32Array of triples [entity, mx, mz], mx/mz in [-127, 127].
 * The caller orders them by entity; the sim re-sorts defensively so order never matters.
 */
export function step(s: SimState, inputs: Int32Array): void {
  const n = inputs.length / 3;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => inputs[a * 3] - inputs[b * 3]);
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  for (const i of order) {
    const e = inputs[i * 3];
    if (!s.world.alive[e] || !s.tf.has[e]) continue;
    let mx = fxDiv(fxClamp(inputs[i * 3 + 1], -STICK_MAX, STICK_MAX) * FX_ONE, STICK_MAX * FX_ONE);
    let mz = fxDiv(fxClamp(inputs[i * 3 + 2], -STICK_MAX, STICK_MAX) * FX_ONE, STICK_MAX * FX_ONE);
    const len = fxSqrt(fxMul(mx, mx) + fxMul(mz, mz));
    if (len > FX_ONE) { mx = fxDiv(mx, len); mz = fxDiv(mz, len); } // no faster diagonals
    X[e] = fxClamp(X[e] + fxMul(mx, STEP), -BOUND, BOUND);
    Z[e] = fxClamp(Z[e] + fxMul(mz, STEP), -BOUND, BOUND);
  }
  s.tick++;
}

/** Canonical bytes of the whole state: tick, rng, then every column of every live entity. */
export function snapshot(s: SimState): Uint8Array {
  const ids = s.world.query();
  const buf = new Int32Array(2 + ids.length * 5);
  buf[0] = s.tick; buf[1] = s.rng[0] | 0;
  let o = 2;
  for (const id of ids) {
    buf[o++] = id;
    buf[o++] = s.world.generation[id];
    buf[o++] = s.av.has[id] ? s.av.cols.owner[id] : -1;
    buf[o++] = s.tf.cols.x[id];
    buf[o++] = s.tf.cols.z[id];
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
    const inp = new Int32Array(n * 3);
    for (let e = 0; e < n; e++) { inp[e * 3] = e; inp[e * 3 + 1] = (rngNext(r) % 255) - 127; inp[e * 3 + 2] = (rngNext(r) % 255) - 127; }
    rec.ticks.push(inp);
  }
  return rec;
}

export const replayFingerprint = (r: Recording): number => fnv1a(new Uint8Array(new Uint32Array(replay(r)).buffer));
