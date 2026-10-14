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

// ---------- area of interest: grid cells + accumulated priority + per-client budget ----------
// Runs on the server only and decides WHAT is sent, never game state, so floats are allowed here.
export type Viewer = { entity: number; priority: Float64Array }; // priority per entity id
export const CELL = 32 * FX_ONE;

export function buildGrid(s: SimState): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  for (const id of s.world.query(s.tf)) {
    const key = cellKey(Math.floor(s.tf.cols.x[id] / CELL), Math.floor(s.tf.cols.z[id] / CELL));
    let list = grid.get(key);
    if (!list) grid.set(key, (list = []));
    list.push(id); // ascending id because query is ascending
  }
  return grid;
}
const cellKey = (cx: number, cz: number): number => (cx + 1024) * 4096 + (cz + 1024);

/** Pick at most k entities for this viewer: nearby cells only, highest accumulated priority. */
export function selectVisible(s: SimState, grid: Map<number, number[]>, v: Viewer, k: number, radiusCells = 2): number[] {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const cx = Math.floor(X[v.entity] / CELL), cz = Math.floor(Z[v.entity] / CELL);
  const cands: number[] = [];
  for (let dx = -radiusCells; dx <= radiusCells; dx++)
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      const list = grid.get(cellKey(cx + dx, cz + dz));
      if (list) for (const id of list) if (id !== v.entity) cands.push(id);
    }
  for (const id of cands) {
    const ddx = fxToFloat(X[id] - X[v.entity]), ddz = fxToFloat(Z[id] - Z[v.entity]);
    v.priority[id] += 1 / (1 + Math.sqrt(ddx * ddx + ddz * ddz)); // closer accumulates faster
  }
  cands.sort((a, b) => v.priority[b] - v.priority[a] || a - b);
  const chosen = cands.slice(0, k);
  for (const id of chosen) v.priority[id] = 0; // sent: back to the end of the queue
  return chosen.sort((a, b) => a - b);
}

// ---------- messages ----------
/** SNAPSHOT: own position at full precision (exact reconciliation), others quantized. */
export function encodeSnapshot(s: SimState, self: number, ack: number, visible: number[]): Uint8Array {
  const w = new BitWriter(24 + visible.length * 6);
  w.write(MSG.SNAPSHOT, 8);
  w.write(s.tick, 32);
  w.write(ack & 0xffff, 16);
  w.write(self, ID_BITS);
  w.write(s.tf.cols.x[self], 32); w.write(s.tf.cols.z[self], 32);
  w.write(visible.length, 16);
  for (const id of visible) {
    w.write(id, ID_BITS);
    w.write(quantPos(s.tf.cols.x[id]), POS_BITS);
    w.write(quantPos(s.tf.cols.z[id]), POS_BITS);
  }
  return w.finish();
}
export type Snapshot = { tick: number; ack: number; self: { id: number; x: number; z: number }; others: { id: number; x: number; z: number }[] };
export function decodeSnapshot(bytes: Uint8Array): Snapshot {
  const r = new BitReader(bytes);
  r.read(8);
  const tick = r.read(32), ack = r.read(16);
  const self = { id: r.read(ID_BITS), x: r.readSigned32(), z: r.readSigned32() };
  const n = Math.min(r.read(16), Math.floor((bytes.length * 8) / ENTITY_BITS)); // never trust a count
  const others = [];
  for (let i = 0; i < n; i++) others.push({ id: r.read(ID_BITS), x: dequantPos(r.read(POS_BITS)), z: dequantPos(r.read(POS_BITS)) });
  return { tick, ack, self, others };
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
