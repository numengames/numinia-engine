// sim: the deterministic simulation. Same module runs in the browser and in Node.
// Contract: step(state, inputs) -> next state, identical bits on every machine.
// Interface is typed buffers in, typed buffers out (the shape a WASM module would have).
import { fx, fxMul, fxSqrt, fxDiv, fxClamp, fnv1a, rngNext, FX_ONE } from "../../core/src/index.ts";
import { defineSchema } from "../../schema/src/index.ts";
import { World } from "../../ecs/src/index.ts";
import type { Store } from "../../ecs/src/index.ts";
import { rayBvh, boxBvh, triNormal, triAabb } from "./bvh.ts";
import type { Bvh } from "./bvh.ts";
export { buildBvh, rayBvh, bvhFingerprint, quantizeTriangles, BVH_UNIT, BVH_LEAF, TRI_STRIDE, NODE_STRIDE } from "./bvh.ts";
export type { Bvh, Hit } from "./bvh.ts";

export const TICK_HZ = 20;
export const SPEED = fx(1.5);                // walking, metres per second (human pace; was 4 — too fast to ever just walk)
export const STEP = fxDiv(SPEED, fx(TICK_HZ)); // metres per tick at full stick
export const RUN_SPEED = fx(4);              // J2: running (Shift; touch/VR stick at its edge), like Hyperfy2 (was 8)
export const RUN_STEP = fxDiv(RUN_SPEED, fx(TICK_HZ)); // exactly RUN_SPEED/SPEED x STEP
export const BOUND = fx(2000);               // N1: half-size of the walkable world in metres (was 500; objects and quests already reached ±2000)
export const Y_BOUND = fx(500);              // D-045: heights an order may name (Transform's y range)
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
/** H2: orders are sextuples [entity, tipo, a, b, c, d] (Int32; positions are Q16.16): the server makes an avatar do
 * something on purpose (D-045's "put somewhere" was the first one). They are applied inside `step`, before the
 * inputs, and a replay carries them tick by tick, so the fingerprint of a run with orders is reproducible; a run
 * with none steps exactly as before. `tipo` ORDER_PONER (1, D-045's quadruple: a,b,c = x,y,z, d unused) puts the
 * avatar there, still (vy 0, jump spent cleared); more types (QUIETO, EMPUJAR, SENTAR, VOLAR) land in later H2
 * stories, each adding a branch here without moving PONER. */
export const ORDER_STRIDE = 6;
export const ORDER_PONER = 1;
const NO_ORDERS = new Int32Array(0);
/** True when the avatar stands on its floor (vertical speed 0, feet at the ground under it). */
export function onFloor(s: SimState, e: number): boolean {
  const y = s.tf.cols.y[e];
  return s.mo.cols.vy[e] === 0 && y === (s.solids.length ? groundHeight(s.tf.cols.x[e], s.tf.cols.z[e], s, y) : 0);
}

/** Height of the ground under (x, z), Q16.16. A flat plaza, plus (U10) the tops of solid things you stand above
 * when `s` is given: the highest top not more than STEP_UP over your feet `y`; plus (M6) the world mesh when `s` has
 * one: a ray straight down from STEP_UP over the feet (so a step up to STEP_UP counts as ground) to the bottom of
 * the world — only when the hit triangle is walkable (h6: a wall or a ceiling under your feet is not floor, even if
 * the ray reaches it first). Without solids and without a mesh nothing is looked at (the reference fingerprint never
 * sees them). */
export function groundHeight(x: number, z: number, s?: SimState, y = 0): number {
  let g = 0;
  if (!s) return g;
  const b = s.solids;
  for (let o = 0; o + 5 < b.length; o += 6) {
    if (x < b[o] || x > b[o + 3] || z < b[o + 2] || z > b[o + 5]) continue;
    const top = b[o + 4];
    if (top > g && top <= y + STEP_UP) g = top;
  }
  const m = s.mesh;
  if (m) {
    const top = y + STEP_UP;
    const h = rayBvh(m, x, top, z, 0, -FX_ONE, 0, top + MESH_FLOOR);
    if (h && h.y > g && triNormal(m, h.tri).ny >= MAX_SLOPE_COS) g = h.y;
  }
  return g;
}
/** How far under the feet a world mesh is still ground (the `Transform` floor, 500 m). */
const MESH_FLOOR = fx(500);
/** M6 h6: a triangle whose up-facing normal is below this (Rapier's default character-controller slope limit, 50°)
 * is a wall or a ceiling, never a floor or a ramp to walk up. cos(50°) in Q16.16. */
export const MAX_SLOPE_COS = 42126;
/** Does the state have any geometry (solid boxes or a mesh) that the step must look at? */
const hasGeometry = (s: SimState): boolean => s.solids.length > 0 || s.mesh !== null;

// ---- U10: solid things (a boolean on a placed thing). World geometry, like the ground: NOT part of the state's
// fingerprint (both sides build it from the same shared state). Boxes are axis-aligned, Q16.16:
// [x0, y0, z0, x1, y1, z1] per box. An avatar is a column RADIUS wide and HEIGHT tall; it climbs ledges up to STEP_UP.
export const BODY_RADIUS = fx(0.35);
export const BODY_HEIGHT = fx(1.7);
export const STEP_UP = fx(0.4);
export const SOLIDS_MAX = 512;
/** N1b: walking off a ledge this low (a stair step going down) keeps you on the ground instead of falling (Rapier's
 * «snap-to-ground»): no «in the air» flicker on every step. A jump is never snapped. */
export const SNAP_DOWN = fx(0.45); // boxes the simulation looks at (the nearest are not chosen: the first 512)
/** Does a body standing at (x, y, z) overlap a box it cannot step onto? */
function blockedBoxes(s: SimState, x: number, y: number, z: number): boolean {
  const b = s.solids;
  for (let o = 0; o + 5 < b.length; o += 6) {
    if (x + BODY_RADIUS <= b[o] || x - BODY_RADIUS >= b[o + 3] || z + BODY_RADIUS <= b[o + 2] || z - BODY_RADIUS >= b[o + 5]) continue;
    if (y + BODY_HEIGHT <= b[o + 1]) continue;      // the box is above your head
    if (b[o + 4] <= y + STEP_UP) continue;           // low enough to step onto (or you are on it)
    return true;
  }
  return false;
}
/** M6 h5-h6: does a body standing at (x, y, z) overlap a mesh triangle too steep to stand on (a wall or a ceiling)?
 * Walkable triangles (slope within MAX_SLOPE_COS) never block: groundHeight's ray already stands you on them. */
function blockedMesh(s: SimState, x: number, y: number, z: number): boolean {
  const m = s.mesh;
  if (!m) return false;
  const x0 = x - BODY_RADIUS, x1 = x + BODY_RADIUS, z0 = z - BODY_RADIUS, z1 = z + BODY_RADIUS;
  for (const tri of boxBvh(m, x0, y, z0, x1, y + BODY_HEIGHT, z1)) {
    if (triNormal(m, tri).ny >= MAX_SLOPE_COS) continue; // a floor or a walkable ramp, not a wall
    const t = triAabb(m, tri);
    if (y + BODY_HEIGHT <= t.y0) continue; // triangle above the head
    if (t.y1 <= y + STEP_UP) continue;      // low enough to step onto
    return true;
  }
  return false;
}
/** Does a body standing at (x, y, z) overlap anything (box or mesh triangle) it cannot stand on or step onto? */
function blocked(s: SimState, x: number, y: number, z: number): boolean {
  return blockedBoxes(s, x, y, z) || blockedMesh(s, x, y, z);
}
/** N16 (teletransporte): a free spot to put a body near (x, z), Q16.16, or null. `radios` (metres) are the rings tried
 * in order (0 = the point itself), eight headings each (45° apart) starting at heading `rumbo` (0-7, 0 = +z, 2 = +x) so
 * you land on the side you came from. A spot counts when it is inside the world (1 m from the edge), its floor (the
 * highest top up to STEP_UP over `y`) is at most `caida` metres under `y`, and a body standing there overlaps no solid.
 * Integers only, like the rest of the sim; never called inside `step`: the instance asks it when it moves someone on
 * purpose (the reference fingerprint never sees it). */
const D45 = 46341; // sin 45° in Q16.16
const RUMBOS: readonly (readonly [number, number])[] = [[0, FX_ONE], [D45, D45], [FX_ONE, 0], [D45, -D45], [0, -FX_ONE], [-D45, -D45], [-FX_ONE, 0], [-D45, D45]];
export function sitioLibre(s: SimState, x: number, y: number, z: number, radios: readonly number[], rumbo = 0, caida = 1): { x: number; y: number; z: number } | null {
  const lim = BOUND - FX_ONE, bajo = fx(caida);
  for (const r of radios) {
    const R = fx(r);
    for (let k = 0; k < (R > 0 ? 8 : 1); k++) {
      const [dx, dz] = RUMBOS[(((rumbo + k) % 8) + 8) % 8];
      const px = x + fxMul(R, dx), pz = z + fxMul(R, dz);
      if (px < -lim || px > lim || pz < -lim || pz > lim) continue;
      const g = groundHeight(px, pz, s, y);
      if (y - g > bajo || (hasGeometry(s) && blocked(s, px, g, pz))) continue;
      return { x: px, y: g, z: pz };
    }
  }
  return null;
}
/** Replace the solid boxes (both the server and the page call it when the shared state of things changes). */
export function setSolids(s: SimState, boxes: Int32Array): void { s.solids = boxes; }
/** M6: set (or clear) the world's collision mesh, a tree built with `buildBvh` from the same quantized triangles on
 * both sides. Not part of the state fingerprint. */
export function setMesh(s: SimState, mesh: Bvh | null): void { s.mesh = mesh; }
/** The boxes of every value with `solido: true` and its world box (bx0…bz1, metres), at most SOLIDS_MAX, in key order. */
export function solidsFrom(values: Iterable<[string, Record<string, unknown>]>): Int32Array {
  const list = [...values].filter(([, v]) => v.solido === true && Number(v.bx1) > Number(v.bx0) && Number(v.bz1) > Number(v.bz0))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, SOLIDS_MAX);
  const out = new Int32Array(list.length * 6);
  list.forEach(([, v], i) => { ["bx0", "by0", "bz0", "bx1", "by1", "bz1"].forEach((k, j) => { out[i * 6 + j] = fx(Number(v[k])); }); });
  return out;
}

export const Transform = defineSchema("Transform", 3, { // v2 (J2): gains y · v3 (N1): x and z ±2000 (BOUND)
  x: { kind: "fixed", min: -2000, max: 2000, step: 1 / 64 },
  y: { kind: "fixed", min: -500, max: 500, step: 1 / 64 },
  z: { kind: "fixed", min: -2000, max: 2000, step: 1 / 64 },
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

export type SimState = { world: World; tf: Store; av: Store; mo: Store; tick: number; rng: Uint32Array; solids: Int32Array; mesh: Bvh | null };

export function createSim(capacity: number, seed: number): SimState {
  const world = new World(capacity);
  const tf = world.register(Transform);
  const av = world.register(Avatar);
  const mo = world.register(Motion);
  return { world, tf, av, mo, tick: 0, rng: new Uint32Array([seed >>> 0]), solids: new Int32Array(0), mesh: null };
}

/** Where new avatars appear (metres): the square of half-side `radio` centred at (x, z). A vertical world (a tower)
 * declares it in its environment file (`aparicion` in entorno@1); none = the house square below. */
export type SpawnArea = { x: number; z: number; radio: number };
/** The house spawn area: a square of half-side 40 m around the origin (the same draws as before, so the reference
 * fingerprint stands). */
export const SPAWN_RADIO_M = 40;

/** Spawn an avatar at a seeded random spot of the spawn area, standing on the ground; the position comes from the
 * sim's own RNG (two draws, whatever the area, so a world with an area replays exactly like one without). */
export function spawnAvatar(s: SimState, owner: number, area?: SpawnArea | null): number {
  const id = s.world.spawn();
  s.world.add(s.av, id, { owner });
  const span = fx(2 * (area?.radio ?? SPAWN_RADIO_M)); // spawn inside a square 2 × radio wide (80 m by default)
  const cx = area ? fx(area.x) : 0, cz = area ? fx(area.z) : 0;
  s.tf.has[id] = 1;
  s.tf.cols.x[id] = fxClamp((((rngNext(s.rng) % span) - span / 2) | 0) + cx, -BOUND, BOUND);
  s.tf.cols.z[id] = fxClamp((((rngNext(s.rng) % span) - span / 2) | 0) + cz, -BOUND, BOUND);
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
export function step(s: SimState, inputs: Int32Array, orders: Int32Array = NO_ORDERS): void {
  const n = (inputs.length / INPUT_STRIDE) | 0;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => inputs[a * INPUT_STRIDE] - inputs[b * INPUT_STRIDE]);
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z, VY = s.mo.cols.vy, AIR = s.mo.cols.air, BUF = s.mo.cols.buf;
  // D-045: orders first (ascending entity, like inputs): the avatar is put there, still, on whatever floor the order says
  const no = (orders.length / ORDER_STRIDE) | 0;
  const oo = Array.from({ length: no }, (_, i) => i).sort((a, b) => orders[a * ORDER_STRIDE] - orders[b * ORDER_STRIDE]);
  for (const i of oo) {
    const o = i * ORDER_STRIDE, e = orders[o], tipo = orders[o + 1];
    if (!s.world.alive[e] || !s.tf.has[e]) continue;
    if (tipo === ORDER_PONER) {
      X[e] = fxClamp(orders[o + 2], -BOUND, BOUND); Y[e] = fxClamp(orders[o + 3], -Y_BOUND, Y_BOUND); Z[e] = fxClamp(orders[o + 4], -BOUND, BOUND);
      VY[e] = 0; AIR[e] = 0; BUF[e] = 0;
    }
  }
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
    // N1b: standing on something before this step (only with geometry — solids or a mesh: the flat plaza never needs
    // it, so the reference fingerprint stands)
    const geo = hasGeometry(s);
    const onGround = geo && VY[e] === 0 && Y[e] === groundHeight(X[e], Z[e], s, Y[e]);
    const nx = fxClamp(X[e] + fxMul(mx, st), -BOUND, BOUND), nz = fxClamp(Z[e] + fxMul(mz, st), -BOUND, BOUND);
    if (!geo || !blocked(s, nx, Y[e], nz)) { X[e] = nx; Z[e] = nz; }
    else if (!blocked(s, nx, Y[e], Z[e])) X[e] = nx;   // U10/M6 h6: slide along a wall or a too-steep triangle
    else if (!blocked(s, X[e], Y[e], nz)) Z[e] = nz;
    // vertical (J2): jump from the ground, or the one jump in the air; then gravity, then the ground stops the fall
    const ground = geo ? groundHeight(X[e], Z[e], s, Y[e]) : 0;
    let y = Y[e], vy = VY[e], air = AIR[e], buf = buttons & BTN_JUMP ? JUMP_BUFFER + 1 : BUF[e];
    if (onGround && ground < y && y - ground <= SNAP_DOWN) y = ground; // N1b: down a step, still on the ground
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
export type Recording = { seed: number; capacity: number; spawns: number[]; ticks: Int32Array[];
  /** D-045: the orders of each tick (same index as `ticks`; none or empty = no order that tick). */
  orders?: (Int32Array | undefined)[] };

export function replay(r: Recording): number[] {
  const s = createSim(r.capacity, r.seed);
  for (const owner of r.spawns) spawnAvatar(s, owner);
  const hashes: number[] = [];
  r.ticks.forEach((inputs, t) => { step(s, inputs, r.orders?.[t] ?? NO_ORDERS); hashes.push(stateHash(s)); });
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
