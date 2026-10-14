// net: wire format (bit-packed, quantized by schema), area of interest, transports.
// Every message starts with one type byte. The format is additive: new types, never changed ones.
import { fxToFloat, FX_ONE } from "../../core/src/index.ts";
import type { SimState } from "../../sim/src/index.ts";

export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4, WELCOME: 5 } as const;

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
}

// ---------- quantization for OTHER entities: 1/64 m in [-512, 512) -> 16 bits per axis ----------
export const POS_BITS = 16;
const Q = FX_ONE / 64;
export const quantPos = (v: number): number => (Math.floor(v / Q) + 32768) & 0xffff;
export const dequantPos = (q: number): number => (q - 32768) * Q;
export const ID_BITS = 16;
export const ENTITY_BITS = ID_BITS + 2 * POS_BITS; // 48 bits = 6 bytes per visible entity

// ---------- area of interest: flat grid of 8 m cells + rings + accumulated priority + top-k ----------
// Runs on the server only and decides WHAT is sent, never game state, so floats are allowed here.
// Each viewer looks at rings of cells around it until it has enough candidates (or reaches the view
// radius), so a dense crowd costs ~CAND_MIN candidates per viewer, not everyone.
export type Viewer = { entity: number; priority: Float32Array | Float64Array }; // priority per entity id
export const CELL_M = 8;
export const CELL = CELL_M * FX_ONE;
export const GRID_SIDE = 128;  // 128 cells x 8 m = 1,024 m: the whole +-512 m plaza
export const CAND_MIN = 150;   // stop widening once this many candidates are in hand
export const RING_MAX = 8;     // view radius: 8 rings x 8 m = 64 m
const cellOf = (v: number): number => { const c = Math.floor(v / CELL) + GRID_SIDE / 2; return c < 0 ? 0 : c >= GRID_SIDE ? GRID_SIDE - 1 : c; };

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

/** Pick at most k entities for this viewer: nearest rings only, highest accumulated priority. */
export function selectVisible(s: SimState, grid: Grid, v: Viewer, k: number, ringMax = RING_MAX): number[] {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const vx = X[v.entity], vz = Z[v.entity];
  const cx = cellOf(vx), cz = cellOf(vz);
  let n = 0;
  const visit = (gx: number, gz: number) => {
    if (gx < 0 || gz < 0 || gx >= GRID_SIDE || gz >= GRID_SIDE) return;
    const c = gx * GRID_SIDE + gz, end = grid.start[c + 1];
    if (n + (end - grid.start[c]) > cand.length) { const m = Math.max(cand.length * 2, n + end - grid.start[c]); const a = new Int32Array(m); a.set(cand); cand = a; prio = new Float64Array(m); }
    for (let i = grid.start[c]; i < end; i++) { const id = grid.items[i]; if (id !== v.entity) cand[n++] = id; }
  };
  for (let r = 0; r <= ringMax && n < CAND_MIN; r++) {
    if (r === 0) { visit(cx, cz); continue; }
    for (let gx = cx - r; gx <= cx + r; gx++) {
      if (gx === cx - r || gx === cx + r) for (let gz = cz - r; gz <= cz + r; gz++) visit(gx, gz);
      else { visit(gx, cz - r); visit(gx, cz + r); }
    }
  }
  for (let i = 0; i < n; i++) {
    const id = cand[i], dx = (X[id] - vx) / FX_ONE, dz = (Z[id] - vz) / FX_ONE;
    prio[i] = (v.priority[id] += 1 / (1 + (dx * dx + dz * dz) * 0.01)); // closer accumulates faster
  }
  if (n > k) topK(n, k);
  const m = Math.min(n, k), chosen = new Array<number>(m);
  for (let i = 0; i < m; i++) { chosen[i] = cand[i]; v.priority[cand[i]] = 0; } // sent: back of the queue
  return chosen.sort((a, b) => a - b);
}

/** Move the k best (priority desc, id asc) to the front of cand/prio. Quickselect, deterministic pivot. */
function topK(n: number, k: number): void {
  const better = (i: number, j: number) => prio[i] > prio[j] || (prio[i] === prio[j] && cand[i] < cand[j]);
  const swap = (i: number, j: number) => { const c = cand[i]; cand[i] = cand[j]; cand[j] = c; const p = prio[i]; prio[i] = prio[j]; prio[j] = p; };
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    swap((lo + hi) >> 1, hi); // pivot to the end
    let store = lo;
    for (let i = lo; i < hi; i++) if (better(i, hi)) swap(i, store++);
    swap(store, hi);
    if (store === k - 1 || store === k) return;
    if (store < k) lo = store + 1; else hi = store - 1;
  }
}

// ---------- messages ----------
// Byte-aligned fields are written with DataView (big-endian), which is byte-for-byte what the
// MSB-first BitWriter produces: same wire format, ~10x less work. BitWriter stays for sub-byte fields.
const SNAP_HEADER = 19; // type 1 + tick 4 + ack 2 + self 2 + x 4 + z 4 + count 2

/** SNAPSHOT: own position at full precision (exact reconciliation), others quantized. */
export function encodeSnapshot(s: SimState, self: number, ack: number, visible: number[]): Uint8Array {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const buf = new Uint8Array(SNAP_HEADER + visible.length * 6), dv = new DataView(buf.buffer);
  dv.setUint8(0, MSG.SNAPSHOT); dv.setUint32(1, s.tick >>> 0); dv.setUint16(5, ack & 0xffff); dv.setUint16(7, self);
  dv.setInt32(9, X[self]); dv.setInt32(13, Z[self]); dv.setUint16(17, visible.length);
  let o = SNAP_HEADER;
  for (const id of visible) { dv.setUint16(o, id); dv.setUint16(o + 2, quantPos(X[id])); dv.setUint16(o + 4, quantPos(Z[id])); o += 6; }
  return buf;
}
export type Snapshot = { tick: number; ack: number; self: { id: number; x: number; z: number }; others: { id: number; x: number; z: number }[] };
/** Returns null for a message too short to be a snapshot; a lying count is clipped. Never throws. */
export function decodeSnapshot(bytes: Uint8Array): Snapshot | null {
  if (bytes.length < SNAP_HEADER) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.min(dv.getUint16(17), Math.floor((bytes.length - SNAP_HEADER) / 6));
  const others = new Array(n);
  for (let i = 0, o = SNAP_HEADER; i < n; i++, o += 6) others[i] = { id: dv.getUint16(o), x: dequantPos(dv.getUint16(o + 2)), z: dequantPos(dv.getUint16(o + 4)) };
  return { tick: dv.getUint32(1), ack: dv.getUint16(5), self: { id: dv.getUint16(7), x: dv.getInt32(9), z: dv.getInt32(13) }, others };
}

/** INPUT: one per client tick. The server knows who sent it; mx/mz are int8 stick axes. */
export function encodeInput(seq: number, mx: number, mz: number): Uint8Array {
  const w = new BitWriter(5); w.write(MSG.INPUT, 8); w.write(seq & 0xffff, 16); w.write(mx & 0xff, 8); w.write(mz & 0xff, 8); return w.finish();
}
export function decodeInput(bytes: Uint8Array): { seq: number; mx: number; mz: number } {
  const r = new BitReader(bytes); r.read(8);
  const seq = r.read(16), mx = (r.read(8) << 24) >> 24, mz = (r.read(8) << 24) >> 24;
  return { seq, mx, mz };
}

export const encodePing = (t: number): Uint8Array => { const w = new BitWriter(5); w.write(MSG.PING, 8); w.write(t >>> 0, 32); return w.finish(); };
export const encodePong = (t: number): Uint8Array => { const w = new BitWriter(5); w.write(MSG.PONG, 8); w.write(t >>> 0, 32); return w.finish(); };
export const decodeTime = (bytes: Uint8Array): number => { const r = new BitReader(bytes); r.read(8); return r.read(32); };

/** WELCOME: who you are, where you start, and the reference run for the determinism probe. */
export type Welcome = { entity: number; tick: number; x: number; z: number; ref: { seed: number; ticks: number; n: number; hash: number } };
export function encodeWelcome(m: Welcome): Uint8Array {
  const w = new BitWriter(32);
  w.write(MSG.WELCOME, 8); w.write(m.entity, 16); w.write(m.tick, 32); w.write(m.x, 32); w.write(m.z, 32);
  w.write(m.ref.seed, 32); w.write(m.ref.ticks, 32); w.write(m.ref.n, 16); w.write(m.ref.hash, 32);
  return w.finish();
}
export function decodeWelcome(bytes: Uint8Array): Welcome {
  const r = new BitReader(bytes); r.read(8);
  const entity = r.read(16), tick = r.read(32), x = r.readSigned32(), z = r.readSigned32();
  const ref = { seed: r.read(32), ticks: r.read(32), n: r.read(16), hash: r.read(32) };
  return { entity, tick, x, z, ref };
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
export function webSocketClient(url: string): Transport & { opened: Promise<void>; closed: Promise<void>; close(): void } {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  let cb: (b: Uint8Array) => void = () => {};
  const t = {
    sentBytes: 0,
    opened: new Promise<void>((ok, ko) => { ws.addEventListener("open", () => ok()); ws.addEventListener("error", () => ko(new Error(`cannot reach ${url}`))); }),
    closed: new Promise<void>((ok) => ws.addEventListener("close", () => ok())),
    send(bytes: Uint8Array) { if (ws.readyState === 1) { ws.send(bytes); t.sentBytes += bytes.length; } },
    onMessage(f: (b: Uint8Array) => void) { cb = f; },
    close() { ws.close(); },
  };
  ws.addEventListener("message", (ev) => { if (ev.data instanceof ArrayBuffer) cb(new Uint8Array(ev.data)); });
  return t;
}
