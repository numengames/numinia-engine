// net: wire format (bit-packed, quantized by schema), area of interest, transports.
// Every message starts with one type byte. The format is additive: new types, never changed ones.
import { fxToFloat, FX_ONE } from "../../core/src/index.ts";
import { MODO_VOLANDO } from "../../sim/src/index.ts";
import type { Body, SimState } from "../../sim/src/index.ts";
import { fieldBits, textLenBits } from "../../schema/src/index.ts";
import type { Field } from "../../schema/src/index.ts";

// 6-8 (J7, additive): only a server that runs game features sends them; with no features the wire is unchanged.
// 9 (T1, additive): REPORT, page -> server: how this player entered and how it is going (JSON, see server/sesiones.ts).
// 10 (I1, additive): IDENTITY. page -> server: the guest token it kept (or nothing); server -> page: {token, id, nombre}.
// 11 (U10, additive): VOICE, a frame of a person's microphone; the server relays it only to who is near (voz.ts).
// 12 (H3b, additive): PASE, numinia.com's world pass (a compact JWS), page -> server, before IDENTITY. Own cap PASE_MAX (2048).
// 13-14 (condiciones/c2, additive): CONDICIONES (server -> page: the world's conditions of entry and where you stand; page -> server,
// one byte: "send them again") and ACEPTAR (page -> server: what you accept). See the end of this file.
// 15 (condiciones/c5, additive): LEYENDO, server -> page: who is still reading the norms (the others draw them inside a bubble). Only a world with the gate on sends it.
export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4, WELCOME: 5, CATALOG: 6, FEATURE: 7, STATE: 8, REPORT: 9, IDENTITY: 10, VOICE: 11, PASE: 12, CONDICIONES: 13, ACEPTAR: 14, LEYENDO: 15, LATIDO: 16 } as const;
export * from "./voz.ts";
export * from "./enlace.ts"; // dardos enlazados (E1): the «visita de enlace»

/** Wire format version, sent at the end of WELCOME. 1 = everything before J2 (it was never written on the wire);
 * 2 = J2: SNAPSHOT carries height (own vertical state exact, others with height in their own list), INPUT has a
 * buttons byte. A page whose number differs from its server's must reload. */
export const WIRE_FORMAT = 2;

// ---------- bit packing ----------
export class BitWriter {
  private bytes: Uint8Array;
  private bit = 0;
  constructor(capacity = 64) { this.bytes = new Uint8Array(capacity); }
  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      const byte = this.bit >> 3;
      if (byte >= this.bytes.length) { const b = new Uint8Array(this.bytes.length * 2); b.set(this.bytes); this.bytes = b; }
      if ((value >>> i) & 1) this.bytes[byte] |= 0x80 >> (this.bit & 7);
      this.bit++;
    }
  }
  finish(): Uint8Array { return this.bytes.slice(0, (this.bit + 7) >> 3); }
}
export class BitReader {
  private bit = 0;
  private readonly bytesIn: Uint8Array;
  constructor(bytesIn: Uint8Array) { this.bytesIn = bytesIn; } // no parameter properties: Node strips types only
  read(bits: number): number {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const b = ((this.bytesIn[this.bit >> 3] ?? 0) >> (7 - (this.bit & 7))) & 1; // reading past the end gives 0, never throws
      v = (v << 1) | b; this.bit++;
    }
    return v >>> 0;
  }
  readSigned32(): number { return this.read(32) | 0; }
  /** True once more bits were read than the message has: the message was truncated or lied. */
  get overrun(): boolean { return this.bit > this.bytesIn.length * 8; }
}

// ---------- schema codec (J7): declared fields -> bits -> fields. Declaration order is wire order. ----------
// Used by feature messages and feature state; D4 will move the hand-written core messages here too.
export type Fields = Record<string, Field>;
const utf8enc = new TextEncoder(), utf8dec = new TextDecoder();

/** Cut UTF-8 bytes to at most max without splitting a character. */
export function clipUtf8(b: Uint8Array, max: number): Uint8Array {
  if (b.length <= max) return b;
  let n = max;
  while (n > 0 && (b[n] & 0xc0) === 0x80) n--; // b[n] continues a character that would be cut: back off
  return b.subarray(0, n);
}

/** Write a value (already validated) field by field. Out-of-range numbers are clamped, never thrown. */
export function writeFields(w: BitWriter, fields: Fields, value: Record<string, unknown>): void {
  for (const [k, f] of Object.entries(fields)) {
    const v = value[k];
    if (f.kind === "bool") w.write(v ? 1 : 0, 1);
    else if (f.kind === "int") w.write(Math.min(f.max, Math.max(f.min, Math.trunc(Number(v) || 0))) - f.min, fieldBits(f));
    else if (f.kind === "fixed") {
      const top = Math.floor((f.max - f.min) / f.step), q = Math.round(((Number(v) || 0) - f.min) / f.step);
      w.write(Math.min(top, Math.max(0, q)), fieldBits(f));
    } else if (f.kind === "enum") w.write(Math.max(0, f.values.indexOf(String(v))), fieldBits(f));
    else {
      const b = clipUtf8(utf8enc.encode(typeof v === "string" ? v : ""), f.maxBytes);
      w.write(b.length, textLenBits(f.maxBytes));
      for (const x of b) w.write(x, 8);
    }
  }
}

/** Read fields back. Returns null if the bits cannot be a valid value (out of range, truncated). Never throws. */
export function readFields(r: BitReader, fields: Fields): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(fields)) {
    if (f.kind === "bool") out[k] = r.read(1) === 1;
    else if (f.kind === "int") { const v = f.min + r.read(fieldBits(f)); if (v > f.max) return null; out[k] = v; }
    else if (f.kind === "fixed") { const q = r.read(fieldBits(f)); if (q > Math.floor((f.max - f.min) / f.step)) return null; out[k] = f.min + q * f.step; }
    else if (f.kind === "enum") { const i = r.read(fieldBits(f)); if (i >= f.values.length) return null; out[k] = f.values[i]; }
    else {
      const n = r.read(textLenBits(f.maxBytes));
      if (n > f.maxBytes) return null;
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = r.read(8);
      out[k] = utf8dec.decode(b); // invalid UTF-8 becomes U+FFFD, never an exception
    }
  }
  return r.overrun ? null : out;
}

// ---------- quantization for OTHER entities: 1/64 m, 16 bits per axis ----------
// The 16 bits wrap every 1,024 m. Inside [-512, 512) `dequantPos` reads them as they are; anywhere in the world (N1:
// ±2000 m) `unwrapPos` reads them next to a reference the page knows exactly — its own position, sent at full
// precision — which gives the same bits as long as the other is less than 512 m away (the area of interest sends
// nobody farther than ~72 m). Same bytes on the wire as before: a world inside ±512 m decodes exactly as it did.
export const POS_BITS = 16;
const Q = FX_ONE / 64;
export const quantPos = (v: number): number => (Math.floor(v / Q) + 32768) & 0xffff;
export const dequantPos = (q: number): number => (q - 32768) * Q;
/** The position (Q16.16) whose 16 quantized bits are `q` and that lies within 512 m of `ref` (Q16.16). */
export const unwrapPos = (q: number, ref: number): number => {
  const r = Math.floor(ref / Q);
  return (r + ((((q - ((r + 32768) & 0xffff)) & 0xffff) << 16) >> 16)) * Q;
};
export const ID_BITS = 16;
export const ENTITY_BITS = ID_BITS + 2 * POS_BITS; // 48 bits = 6 bytes per visible entity at ground level
export const ENTITY_BITS_HIGH = ENTITY_BITS + POS_BITS; // J2: 64 bits = 8 bytes for one above the ground (y too)

// ---------- area of interest: flat grid of 8 m cells + rings + accumulated priority + top-k ----------
// Runs on the server only and decides WHAT is sent, never game state, so floats are allowed here.
// Each viewer looks at rings of cells around it until it has enough candidates (or reaches the view
// radius), so a dense crowd costs ~CAND_MIN candidates per viewer, not everyone.
export type Viewer = { entity: number; priority: Float32Array | Float64Array; umbral?: number }; // priority per entity id;
// umbral (E8): the k-th best priority the last time, a guess for the next selection's first pivot. It only decides the
// ORDER of the work, never who is chosen: a viewer without it (tests, a fresh connection) gets the same people.
export const CELL_M = 8;
export const CELL = CELL_M * FX_ONE;
export const GRID_SIDE = 128;  // 128 cells x 8 m = 1,024 m, wrapped (N1): x and x + 1,024 m share a cell, and the
                               // viewer skips the far copy (ALIAS), so the grid's size never limits the world's
export const CAND_MIN = 150;   // stop widening once this many candidates are in hand
export const RING_MAX = 8;     // view radius: 8 rings x 8 m = 64 m
const cellOf = (v: number): number => Math.floor(v / CELL) & (GRID_SIDE - 1); // GRID_SIDE is a power of two
/** Farther than this on one axis = a copy from another lap of the wrapped grid (real candidates are ≤ ~72 m away). */
const ALIAS = (GRID_SIDE * CELL) / 2;

export type Grid = { start: Int32Array; items: Int32Array };

/** Bucket every avatar into its cell (counting sort: O(entities + cells)); ascending id inside a cell. */
export function buildGrid(s: SimState): Grid {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const ids = s.world.query(s.tf);
  const ncell = GRID_SIDE * GRID_SIDE;
  const start = new Int32Array(ncell + 1);
  const cellIds = new Int32Array(ids.length);
  for (let i = 0; i < ids.length; i++) { const c = cellOf(X[ids[i]]) * GRID_SIDE + cellOf(Z[ids[i]]); cellIds[i] = c; start[c + 1]++; }
  for (let c = 0; c < ncell; c++) start[c + 1] += start[c];
  const cursor = start.slice(0, ncell);
  const items = new Int32Array(ids.length);
  for (let i = 0; i < ids.length; i++) items[cursor[cellIds[i]]++] = ids[i];
  return { start, items };
}

let cand = new Int32Array(1024);
let prio = new Float64Array(1024);

/** Pick at most k entities for this viewer: nearest rings only, highest accumulated priority.
 * E1: one pass per cell does the filter and the priority (no closure per call, locals instead of property loads);
 * same candidates, same additions in the same float widths, same top k: the chosen list is identical. */
export function selectVisible(s: SimState, grid: Grid, v: Viewer, k: number, ringMax = RING_MAX): number[] {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const self = v.entity, vx = X[self], vz = Z[self], pr = v.priority;
  const start = grid.start, items = grid.items;
  const cx = cellOf(vx), cz = cellOf(vz), M = GRID_SIDE - 1;
  let n = 0;
  for (let r = 0; r <= ringMax && n < CAND_MIN; r++) {
    // ring r: the two full columns gx = cx ± r, and the two cells gz = cz ± r of every column between (r = 0: one cell)
    for (let gx = cx - r; gx <= cx + r; gx++) {
      const edge = r === 0 || gx === cx - r || gx === cx + r, stepZ = edge ? 1 : 2 * r, row = (gx & M) * GRID_SIDE;
      for (let gz = cz - r; gz <= cz + r; gz += stepZ) {
        const c = row + (gz & M), from = start[c], end = start[c + 1];
        if (n + (end - from) > cand.length) { const m = Math.max(cand.length * 2, n + end - from); const a = new Int32Array(m); a.set(cand); cand = a; const p = new Float64Array(m); p.set(prio); prio = p; }
        for (let i = from; i < end; i++) {
          const id = items[i], xi = X[id], zi = Z[id];
          if (id === self || !(Math.abs(xi - vx) < ALIAS && Math.abs(zi - vz) < ALIAS)) continue;
          const dx = (xi - vx) / FX_ONE, dz = (zi - vz) / FX_ONE;
          const p = pr[id] + 1 / (1 + (dx * dx + dz * dz) * 0.01); // closer accumulates faster
          pr[id] = p; cand[n] = id; prio[n++] = p; // prio keeps the unrounded sum, as `prio[i] = (pr[id] += …)` did
        }
      }
    }
  }
  if (n > k) selectK(n, k, v);
  const m = Math.min(n, k);
  for (let i = 0; i < m; i++) pr[cand[i]] = 0; // sent: back of the queue
  return ordenaIds(m, pr.length);
}

/** The k best of cand/prio to the front (in no particular order), under the total order "higher priority, then lower
 * id": one fixed set, so how it is found never changes what is sent. E1 kept a heap of the k best; with k/n ≈ 1/5
 * (50 of ~235 in a dense plaza) most candidates beat the heap's top and sift it, which cost more than the scan itself.
 * E8: quickselect whose first pivot is the viewer's threshold of the previous send (`v.umbral`, 95 % of the k-th best):
 * the crowd changes little between sends, so one pass leaves about k candidates above the guess and the exact finish
 * works on a handful. A missing or stale guess only costs time (a full quickselect), never a different pick. */
function selectK(n: number, k: number, v: Viewer): void {
  const C = cand, P = prio, th = v.umbral ?? 0;
  let st = 0;
  for (let i = 0; i < n; i++) if (P[i] >= th) { const t = P[i]; P[i] = P[st]; P[st] = t; const u = C[i]; C[i] = C[st]; C[st] = u; st++; }
  if (st > k) quickselect(0, st - 1, k);     // too many above the guess: finish among them
  else if (st < k) quickselect(st, n - 1, k); // too few: the rest come from below the guess
  let worst = P[0];
  for (let i = 1; i < k; i++) if (P[i] < worst) worst = P[i];
  v.umbral = worst * 0.95; // a little under the k-th: next time the first pass should keep ≥ k (p10 ≈ k in the bench)
}

/** "a ranks before b": higher priority, or the same priority and a lower id. */
const antes = (pa: number, ca: number, pb: number, cb: number): boolean => pa > pb || (pa === pb && ca < cb);

/** Quickselect over cand/prio[lo..hi] so that positions [0, k) of the whole arrays hold the k best (k is absolute:
 * everything before `lo` is already known to be among them, everything after `hi` known not to be). Median of three as
 * pivot, Lomuto partition; the loop ends when the pivot lands on k-1 or k, or the range is one element. */
function quickselect(lo: number, hi: number, k: number): void {
  const C = cand, P = prio;
  while (hi > lo) {
    const mid = (lo + hi) >> 1;
    if (antes(P[mid], C[mid], P[lo], C[lo])) { const t = P[lo]; P[lo] = P[mid]; P[mid] = t; const u = C[lo]; C[lo] = C[mid]; C[mid] = u; }
    if (antes(P[hi], C[hi], P[lo], C[lo])) { const t = P[lo]; P[lo] = P[hi]; P[hi] = t; const u = C[lo]; C[lo] = C[hi]; C[hi] = u; }
    if (antes(P[hi], C[hi], P[mid], C[mid])) { const t = P[mid]; P[mid] = P[hi]; P[hi] = t; const u = C[mid]; C[mid] = C[hi]; C[hi] = u; }
    const pp = P[mid], pc = C[mid]; // the median, parked at hi while the rest is partitioned
    { const t = P[mid]; P[mid] = P[hi]; P[hi] = t; const u = C[mid]; C[mid] = C[hi]; C[hi] = u; }
    let st = lo;
    for (let i = lo; i < hi; i++) if (antes(P[i], C[i], pp, pc)) { const t = P[i]; P[i] = P[st]; P[st] = t; const u = C[i]; C[i] = C[st]; C[st] = u; st++; }
    { const t = P[st]; P[st] = P[hi]; P[hi] = t; const u = C[st]; C[st] = C[hi]; C[hi] = u; }
    if (st === k - 1 || st === k) return;
    if (st < k) lo = st + 1; else hi = st - 1;
  }
}

const radix = new Int32Array(65), paso = new Int32Array(1024);
let orden = new Int32Array(1024);
/** The m chosen ids (cand[0..m)) as a plain array in ascending id. E8: two counting passes of 6 bits when every id is
 * below 4,096 (ids are indices into the priority table, so its length bounds them) — about a third of the insertion
 * sort's cost for m = 50, which spent its time in mispredicted shifts; the insertion sort stays for bigger tables. */
function ordenaIds(m: number, cota: number): number[] {
  if (orden.length < m) { orden = new Int32Array(m); }
  if (cota <= 4096 && m <= paso.length) {
    radix.fill(0);
    for (let i = 0; i < m; i++) radix[(cand[i] & 63) + 1]++;
    for (let i = 0; i < 64; i++) radix[i + 1] += radix[i];
    for (let i = 0; i < m; i++) paso[radix[cand[i] & 63]++] = cand[i];
    radix.fill(0);
    for (let i = 0; i < m; i++) radix[(paso[i] >> 6) + 1]++;
    for (let i = 0; i < 64; i++) radix[i + 1] += radix[i];
    for (let i = 0; i < m; i++) orden[radix[paso[i] >> 6]++] = paso[i];
  } else {
    for (let i = 0; i < m; i++) { const id = cand[i]; let j = i; while (j > 0 && orden[j - 1] > id) { orden[j] = orden[j - 1]; j--; } orden[j] = id; }
  }
  const out: number[] = [];
  for (let i = 0; i < m; i++) out.push(orden[i]);
  return out;
}

// ---------- messages ----------
// Byte-aligned fields are written big-endian by hand (E9: encodeSnapshot) or with DataView, which is byte-for-byte what the
// MSB-first BitWriter produces: same wire format, ~10x less work. BitWriter stays for sub-byte fields.
// SNAPSHOT, wire format 2 (J2):
//   type 1 · tick 4 · ack 2 · self 2 · x 4 · z 4 · y 4 · vy 4 · flags 1 (bit 0 air jump spent, bits 1-2 jump buffer, bit 3 flying: additive, an older page masks it away)
//   · nLow 2 · nHigh 2, then nLow × (id 2, x 2, z 2) for others at ground level (their height quantizes to 0)
//   and nHigh × (id 2, x 2, z 2, y 2) for others above it. A crowd standing on the plaza costs what it cost before J2.
const SNAP_HEADER = 30;
const ZERO_Q = 32768; // quantPos(0)

/** E1: every avatar's three quantized coordinates, worked out once per snapshot tick instead of once per viewer that
 * sees it (~50 times each with 1.000 people). Same `quantPos`, so the same 16 bits. */
export type Cuantas = { x: Uint16Array; y: Uint16Array; z: Uint16Array };
let cuantas: Cuantas = { x: new Uint16Array(0), y: new Uint16Array(0), z: new Uint16Array(0) };
/** Fill (and return) the shared quantized table for this state. Valid until the next call or the next sim step. */
export function cuantizar(s: SimState): Cuantas {
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z;
  if (cuantas.x.length < X.length) cuantas = { x: new Uint16Array(X.length), y: new Uint16Array(X.length), z: new Uint16Array(X.length) };
  const qx = cuantas.x, qy = cuantas.y, qz = cuantas.z;
  for (const id of s.world.query(s.tf)) { qx[id] = quantPos(X[id]); qy[id] = quantPos(Y[id]); qz[id] = quantPos(Z[id]); }
  return cuantas;
}

/** E9: the header and the avatars are written straight into the byte array (no DataView), and the message is cut from a
 * shared slab instead of getting an allocation of its own. */
const SLAB = 1 << 14; // 16 kB: a slow client that holds a message pins at most this much
let losa = new Uint8Array(SLAB), losaO = 0;
/** One buffer slice per message cut from a shared slab (never rewritten once handed out) instead of one allocation each. */
function trozo(n: number): Uint8Array {
  if (n > SLAB >> 2) return new Uint8Array(n);
  if (losaO + n > SLAB) { losa = new Uint8Array(SLAB); losaO = 0; }
  const b = losa.subarray(losaO, losaO + n); losaO += n; return b;
}
/** SNAPSHOT: own state at full precision (exact reconciliation, height included), others quantized. `q` (E1, optional):
 * the table from `cuantizar` for this same state; without it, it is filled here (same values: same state). */
export function encodeSnapshot(s: SimState, self: number, ack: number, visible: number[], q?: Cuantas, saltos?: readonly Salto[]): Uint8Array {
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z, nv = visible.length;
  const t = q ?? cuantizar(s), qxs = t.x, qys = t.y, qzs = t.z;
  let high = 0;
  for (let i = 0; i < nv; i++) if (qys[visible[i]] !== ZERO_Q) high++;
  const low = nv - high;
  const nsal = saltos ? Math.min(saltos.length, SALTOS_MAX) : 0; // t_9cb3f636: the optional tail (see Salto); nothing when nobody jumped
  const buf = trozo(SNAP_HEADER + low * 6 + high * 8 + (nsal ? 1 + nsal * 4 : 0));
  const T = s.tick >>> 0, a = ack & 0xffff, sx = X[self], sz = Z[self], sy = Y[self], vy = s.mo.cols.vy[self];
  buf[0] = MSG.SNAPSHOT; buf[1] = T >>> 24; buf[2] = T >>> 16; buf[3] = T >>> 8; buf[4] = T; buf[5] = a >> 8; buf[6] = a; buf[7] = self >> 8; buf[8] = self;
  buf[9] = sx >>> 24; buf[10] = sx >>> 16; buf[11] = sx >>> 8; buf[12] = sx; buf[13] = sz >>> 24; buf[14] = sz >>> 16; buf[15] = sz >>> 8; buf[16] = sz;
  buf[17] = sy >>> 24; buf[18] = sy >>> 16; buf[19] = sy >>> 8; buf[20] = sy; buf[21] = vy >>> 24; buf[22] = vy >>> 16; buf[23] = vy >>> 8; buf[24] = vy;
  buf[25] = (s.mo.cols.air[self] & 1) | ((s.mo.cols.buf[self] & 3) << 1) | (s.mo.cols.modo[self] === MODO_VOLANDO ? 8 : 0);
  buf[26] = low >> 8; buf[27] = low; buf[28] = high >> 8; buf[29] = high;
  let o = SNAP_HEADER, h = SNAP_HEADER + low * 6;
  // big-endian 16-bit writes by hand (what DataView.setUint16 does by default), byte for byte the same
  for (let i = 0; i < nv; i++) {
    const id = visible[i], qx = qxs[id], qy = qys[id], qz = qzs[id];
    if (qy === ZERO_Q) { buf[o] = id >> 8; buf[o + 1] = id; buf[o + 2] = qx >> 8; buf[o + 3] = qx; buf[o + 4] = qz >> 8; buf[o + 5] = qz; o += 6; }
    else { buf[h] = id >> 8; buf[h + 1] = id; buf[h + 2] = qx >> 8; buf[h + 3] = qx; buf[h + 4] = qz >> 8; buf[h + 5] = qz; buf[h + 6] = qy >> 8; buf[h + 7] = qy; h += 8; }
  }
  if (nsal) { let t = h; buf[t++] = nsal; for (let i = 0; i < nsal; i++, t += 4) { const j = saltos![i], jt = j.tick & 0xffff; buf[t] = j.id >> 8; buf[t + 1] = j.id; buf[t + 2] = jt >> 8; buf[t + 3] = jt; } }
  return buf;
}
/** t_9cb3f636: an avatar that was put somewhere on purpose (a teleport, a return to a safe spot) at server tick `tick` (low 16 bits).
 * The snapshot carries it for a few ticks (snapshots are unreliable) in an optional tail after the avatars: one byte n, then n ×
 * (id 2, tick 2); no tail when nobody jumped, so the usual snapshot costs what it cost. A page that sees a NEW (id, tick) draws
 * that avatar at its new place at once instead of sliding it there from the old one. An older client ignores the tail. */
export type Salto = { id: number; tick: number };
export const SALTOS_MAX = 255;
export type Snapshot = { tick: number; ack: number; self: Body & { id: number }; others: { id: number; x: number; y: number; z: number }[]; saltos: Salto[] };
/** Returns null for a message too short to be a snapshot; lying counts are clipped. Never throws. */
export function decodeSnapshot(bytes: Uint8Array): Snapshot | null {
  if (bytes.length < SNAP_HEADER) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nLow = Math.min(dv.getUint16(26), Math.floor((bytes.length - SNAP_HEADER) / 6));
  const nHigh = Math.min(dv.getUint16(28), Math.floor((bytes.length - SNAP_HEADER - nLow * 6) / 8));
  const others = new Array(nLow + nHigh);
  let o = SNAP_HEADER;
  const sx = dv.getInt32(9), sz = dv.getInt32(13); // N1: others are read next to our own exact position (unwrapPos)
  for (let i = 0; i < nLow; i++, o += 6) others[i] = { id: dv.getUint16(o), x: unwrapPos(dv.getUint16(o + 2), sx), y: 0, z: unwrapPos(dv.getUint16(o + 4), sz) };
  for (let i = 0; i < nHigh; i++, o += 8) others[nLow + i] = { id: dv.getUint16(o), x: unwrapPos(dv.getUint16(o + 2), sx), y: dequantPos(dv.getUint16(o + 6)), z: unwrapPos(dv.getUint16(o + 4), sz) };
  const flags = dv.getUint8(25);
  const saltos: Salto[] = [];
  if (bytes.length > o) { // the optional tail; a lying count is clipped to what is there
    const n = Math.min(dv.getUint8(o), Math.floor((bytes.length - o - 1) / 4));
    for (let i = 0, t = o + 1; i < n; i++, t += 4) saltos.push({ id: dv.getUint16(t), tick: dv.getUint16(t + 2) });
  }
  return {
    tick: dv.getUint32(1), ack: dv.getUint16(5),
    self: { id: dv.getUint16(7), x: dv.getInt32(9), z: dv.getInt32(13), y: dv.getInt32(17), vy: dv.getInt32(21), air: flags & 1, buf: (flags >> 1) & 3, vuela: (flags >> 3) & 1 },
    others, saltos,
  };
}

/** INPUT: one per client tick. The server knows who sent it; mx/mz are int8 stick axes; buttons is one byte of
 * BTN_* bits (J2, additive: a 5-byte input from before J2 is still valid and means no buttons). */
export function encodeInput(seq: number, mx: number, mz: number, buttons = 0): Uint8Array {
  const w = new BitWriter(6); w.write(MSG.INPUT, 8); w.write(seq & 0xffff, 16); w.write(mx & 0xff, 8); w.write(mz & 0xff, 8); w.write(buttons & 0xff, 8); return w.finish();
}
export function decodeInput(bytes: Uint8Array): { seq: number; mx: number; mz: number; buttons: number } {
  const r = new BitReader(bytes); r.read(8);
  const seq = r.read(16), mx = (r.read(8) << 24) >> 24, mz = (r.read(8) << 24) >> 24;
  return { seq, mx, mz, buttons: bytes.length > 5 ? r.read(8) : 0 };
}

/** t_9cb3f636: the client's heartbeat, a few times a second: 2 bytes. `oculta` = the page is in a background tab (its timers run
 * slowly there, so the server waits much longer before it calls it gone). Anything the client sends counts as a sign of life;
 * this is the one that is sent when it has nothing else to say. */
export const encodeLatido = (oculta = false): Uint8Array => new Uint8Array([MSG.LATIDO, oculta ? 1 : 0]);
export const decodeLatido = (bytes: Uint8Array): { oculta: boolean } | null => (bytes.length === 2 && bytes[0] === MSG.LATIDO ? { oculta: bytes[1] === 1 } : null);
export const encodePing = (t: number): Uint8Array => { const w = new BitWriter(5); w.write(MSG.PING, 8); w.write(t >>> 0, 32); return w.finish(); };
export const encodePong = (t: number): Uint8Array => { const w = new BitWriter(5); w.write(MSG.PONG, 8); w.write(t >>> 0, 32); return w.finish(); };
export const decodeTime = (bytes: Uint8Array): number => { const r = new BitReader(bytes); r.read(8); return r.read(32); };

/** WELCOME: who you are, where you start, the reference run for the determinism probe, and (J2, one byte added at
 * the end) the server's wire format: 0 when absent, i.e. a server from before J2. */
export type Welcome = { entity: number; tick: number; x: number; z: number; ref: { seed: number; ticks: number; n: number; hash: number }; format?: number };
export function encodeWelcome(m: Welcome): Uint8Array {
  const w = new BitWriter(32);
  w.write(MSG.WELCOME, 8); w.write(m.entity, 16); w.write(m.tick, 32); w.write(m.x, 32); w.write(m.z, 32);
  w.write(m.ref.seed, 32); w.write(m.ref.ticks, 32); w.write(m.ref.n, 16); w.write(m.ref.hash, 32);
  w.write(m.format ?? WIRE_FORMAT, 8);
  return w.finish();
}
export function decodeWelcome(bytes: Uint8Array): Welcome {
  const r = new BitReader(bytes); r.read(8);
  const entity = r.read(16), tick = r.read(32), x = r.readSigned32(), z = r.readSigned32();
  const ref = { seed: r.read(32), ticks: r.read(32), n: r.read(16), hash: r.read(32) };
  return { entity, tick, x, z, ref, format: r.read(8) };
}

/** 16-bit sequence comparison with wrap-around: is a newer than b? */
export const seqNewer = (a: number, b: number): boolean => { const d = (a - b) & 0xffff; return d !== 0 && d < 0x8000; };

// ---------- transports: WebSocket now, WebTransport later, same interface ----------
export interface Transport {
  send(bytes: Uint8Array, reliable: boolean): void;
  onMessage(cb: (bytes: Uint8Array) => void): void;
  flush?(): void; // only in-memory transports need it
  readonly sentBytes: number;
}

/** In-memory pair for tests and headless runs: delivery happens when the owner calls flush(). */
export function loopbackPair(): [Transport & { flush(): void }, Transport & { flush(): void }] {
  const make = () => {
    const inbox: Uint8Array[] = [];
    let cb: (b: Uint8Array) => void = () => {};
    const t = {
      peer: null as null | { inbox: Uint8Array[] },
      inbox, sentBytes: 0,
      send(bytes: Uint8Array) { t.sentBytes += bytes.length; t.peer!.inbox.push(bytes); },
      onMessage(f: (b: Uint8Array) => void) { cb = f; },
      flush() { while (inbox.length) cb(inbox.shift()!); },
    };
    return t;
  };
  const a = make(), b = make();
  a.peer = b; b.peer = a;
  return [a, b];
}

/** Client side over the standard WebSocket API (browsers and Node >= 22 both have it). */
// ---------- REPORT (T1): one JSON object, at most REPORT_MAX bytes; the server keeps only the keys it knows ----------
export const REPORT_MAX = 1000; // the server's WebSocket refuses frames over WS_FRAME_MAX (1024) bytes, PASE aside
/** null when the object does not fit: drop the longest texts and try again. */
export function encodeReport(report: Record<string, unknown>): Uint8Array | null {
  const json = utf8enc.encode(JSON.stringify(report));
  if (json.length + 1 > REPORT_MAX) return null;
  const out = new Uint8Array(json.length + 1); out[0] = MSG.REPORT; out.set(json, 1); return out;
}
/** null for anything that is not a JSON object (never throws). */
export function decodeReport(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes[0] !== MSG.REPORT || bytes.length > REPORT_MAX) return null;
  try { const o = JSON.parse(utf8dec.decode(bytes.subarray(1))); return o && typeof o === "object" && !Array.isArray(o) ? o : null; }
  catch { return null; }
}

// ---------- IDENTITY (I1): a guest token, no personal data (instance/identidad.ts) ----------
/** Characters an identity request carries: a guest token or a1 ticket (≤ 120) or an outside agent's a2 ticket (ADR-080). */
export const IDENTIDAD_MAX = 200;
/** page -> server: the token this browser kept, or "" to ask for one. */
export function encodeIdentityRequest(token: string): Uint8Array {
  const t = utf8enc.encode(token.slice(0, IDENTIDAD_MAX));
  const out = new Uint8Array(t.length + 1); out[0] = MSG.IDENTITY; out.set(t, 1); return out;
}
export function decodeIdentityRequest(bytes: Uint8Array): string | null {
  if (bytes[0] !== MSG.IDENTITY || bytes.length > IDENTIDAD_MAX + 1) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(1)); } catch { return null; }
}
export type Identity = { token: string; id: string; nombre: string };
/** server -> page: who you are here (keep the token for the next visit). */
export function encodeIdentity(i: Identity): Uint8Array {
  const j = utf8enc.encode(JSON.stringify(i));
  const out = new Uint8Array(j.length + 1); out[0] = MSG.IDENTITY; out.set(j, 1); return out;
}
export function decodeIdentity(bytes: Uint8Array): Identity | null {
  try { const o = JSON.parse(utf8dec.decode(bytes.subarray(1))); return typeof o?.token === "string" && typeof o?.id === "string" && typeof o?.nombre === "string" ? o : null; }
  catch { return null; }
}

// ---------- PASE (H3b, additive type 12): numinia.com's world pass, page -> server, before IDENTITY ----------
// A pass is a compact JWS (header.payload.signature, base64url) of 600-1100 bytes, ~1.3 KB with 5 roles: it does not fit
// IDENTITY (120 B) nor the old 1024-byte WebSocket frame. Own message, own cap; IDENTITY and its 120 B stay untouched.
//   page -> server: [12, token as ASCII…]   (once per connection, before IDENTITY; the server answers nothing: IDENTITY's answer says who you are)
/** Largest PASE frame (type byte included) and, with it, the server's WebSocket maxPayload: the biggest frame any message may have. */
export const PASE_MAX = 2048;
/** Largest frame of every other message type: the server's WebSocket used to refuse anything over it (and still does, except PASE). */
export const WS_FRAME_MAX = 1024;
const PASE_FORMA = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** null when the token is not shaped like a compact JWS or does not fit PASE_MAX (the page then sends nothing). */
export function encodePase(token: string): Uint8Array | null {
  if (token.length + 1 > PASE_MAX || !PASE_FORMA.test(token)) return null;
  const out = new Uint8Array(token.length + 1); out[0] = MSG.PASE;
  for (let i = 0; i < token.length; i++) out[i + 1] = token.charCodeAt(i);
  return out;
}
/** The token, or null for anything that is not a well-shaped PASE of at most PASE_MAX bytes (never throws). */
export function decodePase(bytes: Uint8Array): string | null {
  if (bytes[0] !== MSG.PASE || bytes.length < 6 || bytes.length > PASE_MAX) return null;
  let s = "";
  for (let i = 1; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return PASE_FORMA.test(s) ? s : null;
}

// ---------- CONDICIONES (13) and ACEPTAR (14), condiciones/c2 (additive): the conditions of entry and their gate ----------
// The text lives in the world's aventura/condiciones.json (condiciones@1, packages/server/src/condiciones.ts). Two kinds of point:
// `norma` (the service's terms: a mandatory one closes the gate until accepted) and `datos` (optional data permissions: refusing
// them NEVER closes the gate, EDPB 05/2020 §39). The server decides (the gate is off unless the world turns it on).
//   server -> page  [13, JSON CondicionesMensaje]   sent by itself after IDENTITY when the gate is on, and whenever asked
//   page -> server  [13]                            (one byte) «send me the conditions and where I stand»: answered at any time
//   page -> server  [14, JSON {versiones, datos}]   what you accept; answered with a CondicionesMensaje WITHOUT `capas`
export type CondicionesPunto = { id: string; titulo: string; texto: string; obligatorio: boolean; tipo: "norma" | "datos" };
/** c6 (additive): what changed in one layer since the version this person accepted. Only present when they accepted ANOTHER version of
 * this layer before and the server kept its fingerprints; an old page ignores it and simply shows everything. A `datos` point that is
 * `nuevo` or `cambiado` is offered with its box EMPTY (a changed point loses the permission given before); one that is not listed
 * here was not changed: nothing is asked again and what the person said stays. `antes` = the previous titles of `cambiados` and `quitados`. */
export type CondicionesCambios = { desde: string; nuevos: string[]; cambiados: string[]; quitados: string[]; antes?: Record<string, string> };
export type CondicionesCapa = { capa: string; nombre?: string; version: string; puntos: CondicionesPunto[]; cambios?: CondicionesCambios };
export type CondicionesAceptado = { versiones: Record<string, string>; datos: string[]; en: string };
export type CondicionesMensaje = {
  formato: "condiciones-estado@1";
  puerta: boolean;                  // the world's gate is on
  abierta: boolean;                 // you may move, talk, build…: gate off, or every layer with a mandatory norma accepted at its current version
  faltan: string[];                 // the layers (`capa`) whose current version you still have to accept
  aceptado: CondicionesAceptado | null; // what the server keeps of you (the layers' versions you accepted, the data points you said yes to, UTC)
  capas?: CondicionesCapa[];        // the whole text: only in the offer (on entering, and when asked), not in the answer to ACEPTAR
  porPase?: string[];               // w5 (additive): the layers whose NORMS count as accepted because the signed pass said so (numinia.com); their `puntos` in `capas` are only the data points, or the layer is not there
};
/** What a page may accept in ACEPTAR: `versiones` = capa -> the version it read; `datos` = ids of the `datos` points it ticked. */
export type Aceptacion = { versiones: Record<string, string>; datos: string[] };
/** Largest ACEPTAR frame (the type byte included): under WS_FRAME_MAX. */
export const ACEPTAR_MAX = 900;
const ACEPTAR_CAPAS_MAX = 4, ACEPTAR_DATOS_MAX = 40, ACEPTAR_TEXTO_MAX = 40;
/** page -> server: «send me the conditions». */
export const encodePedirCondiciones = (): Uint8Array => new Uint8Array([MSG.CONDICIONES]);
/** server -> page. */
export function encodeCondiciones(m: CondicionesMensaje): Uint8Array {
  const j = utf8enc.encode(JSON.stringify(m));
  const out = new Uint8Array(j.length + 1); out[0] = MSG.CONDICIONES; out.set(j, 1); return out;
}
/** null for anything that is not a CondicionesMensaje (never throws). */
export function decodeCondiciones(bytes: Uint8Array): CondicionesMensaje | null {
  if (bytes[0] !== MSG.CONDICIONES || bytes.length < 2) return null;
  try {
    const o = JSON.parse(utf8dec.decode(bytes.subarray(1)));
    return o && o.formato === "condiciones-estado@1" && typeof o.puerta === "boolean" && typeof o.abierta === "boolean" && Array.isArray(o.faltan) ? o : null;
  } catch { return null; }
}
/** page -> server. null when it does not fit ACEPTAR_MAX. */
export function encodeAceptar(a: Aceptacion): Uint8Array | null {
  const j = utf8enc.encode(JSON.stringify({ versiones: a.versiones, datos: a.datos }));
  if (j.length + 1 > ACEPTAR_MAX) return null;
  const out = new Uint8Array(j.length + 1); out[0] = MSG.ACEPTAR; out.set(j, 1); return out;
}
/** The acceptance, or null when it is not `{versiones: {capa: version}, datos: [id…]}` within the caps (never throws). */
export function decodeAceptar(bytes: Uint8Array): Aceptacion | null {
  if (bytes[0] !== MSG.ACEPTAR || bytes.length < 2 || bytes.length > ACEPTAR_MAX) return null;
  try {
    const o = JSON.parse(utf8dec.decode(bytes.subarray(1)));
    const v = o?.versiones, d = o?.datos ?? [];
    if (!v || typeof v !== "object" || Array.isArray(v) || !Array.isArray(d) || d.length > ACEPTAR_DATOS_MAX) return null;
    const ks = Object.keys(v);
    if (ks.length > ACEPTAR_CAPAS_MAX || ks.some((k) => typeof v[k] !== "string" || v[k].length > ACEPTAR_TEXTO_MAX)) return null;
    if (d.some((x: unknown) => typeof x !== "string" || x.length > ACEPTAR_TEXTO_MAX)) return null;
    return { versiones: Object.fromEntries(ks.map((k) => [k, v[k]])), datos: d };
  } catch { return null; }
}

// ---------- LEYENDO (15), condiciones/c5 (additive): who is still reading the norms ----------
// With the gate on, a person who has not been let through yet stands inside a bubble for everybody else. The state of one entity is
// sent ONLY when it changes (arrives and has to read; accepts; leaves) and once, as a list, to someone who connects: nothing per tick, no
// bytes in the snapshot, nothing at all in a world whose gate is off. A page keeps the set and draws a bubble over each member it sees.
//   server -> page  [15, (entity u16 big-endian, state u8)…]   state 1 = reading now, 0 = no longer (accepted or gone)
// 3 bytes per entity + the type byte: a change is 4 bytes; the list is capped so a frame stays under WS_FRAME_MAX.
export type Leyendo = { entidad: number; leyendo: boolean };
export const LEYENDO_POR_MENSAJE = 300; // 1 + 300×3 = 901 bytes: under WS_FRAME_MAX
/** server -> page. At most LEYENDO_POR_MENSAJE entries (the caller splits longer lists); null when empty (nothing is sent for «no change»). */
export function encodeLeyendo(l: readonly Leyendo[]): Uint8Array | null {
  const n = Math.min(l.length, LEYENDO_POR_MENSAJE);
  if (n === 0) return null;
  const out = new Uint8Array(1 + 3 * n); out[0] = MSG.LEYENDO;
  for (let i = 0; i < n; i++) { const e = l[i].entidad & 0xffff; out[1 + 3 * i] = e >> 8; out[2 + 3 * i] = e & 0xff; out[3 + 3 * i] = l[i].leyendo ? 1 : 0; }
  return out;
}
/** null for anything that is not a whole LEYENDO (wrong type, empty, a length that is not 1 + 3n, a state other than 0/1); never throws. */
export function decodeLeyendo(bytes: Uint8Array): Leyendo[] | null {
  if (bytes[0] !== MSG.LEYENDO || bytes.length < 4 || (bytes.length - 1) % 3 !== 0 || bytes.length > 1 + 3 * LEYENDO_POR_MENSAJE) return null;
  const out: Leyendo[] = [];
  for (let i = 1; i < bytes.length; i += 3) {
    if (bytes[i + 2] > 1) return null;
    out.push({ entidad: (bytes[i] << 8) | bytes[i + 1], leyendo: bytes[i + 2] === 1 });
  }
  return out;
}

/** H7: close code the server sends when the world is full (its ficha `aforo`); the reason reads «lleno <inside>/<aforo>». */
export const CIERRE_LLENO = 4004;
/** t_9cb3f636: the server stopped hearing the page's heartbeat (its connection died without closing): 4005. */
export const CIERRE_SILENCIO = 4005;
/** t_9cb3f636: how often a page sends its heartbeat; the server calls a page that sent one gone after SILENCIO_MS without hearing
 * anything, or after SILENCIO_OCULTA_MS when the page said it is in a background tab (the browser throttles its timers to one a
 * second, and to one a minute after a few minutes). SILENCIO_MS is long on purpose: a phone or a headset can freeze the page's main
 * thread for several seconds (a big GLB parse, shader compiles on the loading screen, a GC pause, the notification shade, taking the
 * headset off) and that must not throw the player out. The loading screen is not treated apart: this limit simply covers it.
 * The PLAYER notices a dead connection fast on the page's side instead (SERVIDOR_CALLADO_MS, packages/client vigia-servidor.ts). */
export const LATIDO_MS = 400, SILENCIO_MS = 15_000, SILENCIO_OCULTA_MS = 150_000;
/** t_9cb3f636: the page calls the SERVER silent after this long without receiving anything (snapshots come at 10 Hz, a pong every second). */
export const SERVIDOR_CALLADO_MS = 1500;

/** `closed` says the close code and reason (4003 = the world's roles took it out: do not come back by yourself;
 * 4004 = full, CIERRE_LLENO: wait and reload). */
export function webSocketClient(url: string): Transport & { opened: Promise<void>; closed: Promise<{ code: number; reason: string }>; close(): void } {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  // v9: the page may open the socket long before it has a session to listen (the handshake then runs while the view is built):
  // what arrives meanwhile waits here and goes to the first listener, in order (of the snapshots, only the newest), instead of being dropped.
  let cb: ((b: Uint8Array) => void) | null = null;
  const espera: Uint8Array[] = [];
  const t = {
    sentBytes: 0,
    opened: new Promise<void>((ok, ko) => { ws.addEventListener("open", () => ok()); ws.addEventListener("error", () => ko(new Error(`cannot reach ${url}`))); }),
    closed: new Promise<{ code: number; reason: string }>((ok) => ws.addEventListener("close", (ev) => ok({ code: ev.code, reason: ev.reason }))),
    send(bytes: Uint8Array) { if (ws.readyState === 1) { ws.send(bytes); t.sentBytes += bytes.length; } },
    onMessage(f: (b: Uint8Array) => void) { cb = f; for (const b of espera.splice(0)) f(b); },
    close() { ws.close(); },
  };
  ws.addEventListener("message", (ev) => { if (!(ev.data instanceof ArrayBuffer)) return; const b = new Uint8Array(ev.data); if (cb) { cb(b); return; } if (b[0] === MSG.SNAPSHOT) { const i = espera.findIndex((x) => x[0] === MSG.SNAPSHOT); if (i >= 0) espera.splice(i, 1); } espera.push(b); }); // a snapshot is the whole picture: only the newest is worth keeping
  return t;
}
