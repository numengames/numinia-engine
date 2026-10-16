// net: wire format (bit-packed, quantized by schema), area of interest, transports.
// Every message starts with one type byte. The format is additive: new types, never changed ones.
import { fxToFloat, FX_ONE } from "../../core/src/index.ts";
import type { Body, SimState } from "../../sim/src/index.ts";
import { fieldBits, textLenBits } from "../../schema/src/index.ts";
import type { Field } from "../../schema/src/index.ts";

// 6-8 (J7, additive): only a server that runs game features sends them; with no features the wire is unchanged.
// 9 (T1, additive): REPORT, page -> server: how this player entered and how it is going (JSON, see server/sesiones.ts).
// 10 (I1, additive): IDENTITY. page -> server: the guest token it kept (or nothing); server -> page: {token, id, nombre}.
// 11 (U10, additive): VOICE, a frame of a person's microphone; the server relays it only to who is near (voz.ts).
// 12 (H3b, additive): PASE, numinia.com's world pass (a compact JWS), page -> server, before IDENTITY. Own cap PASE_MAX (2048).
export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4, WELCOME: 5, CATALOG: 6, FEATURE: 7, STATE: 8, REPORT: 9, IDENTITY: 10, VOICE: 11, PASE: 12 } as const;
export * from "./voz.ts";

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

// ---------- quantization for OTHER entities: 1/64 m in [-512, 512) -> 16 bits per axis ----------
export const POS_BITS = 16;
const Q = FX_ONE / 64;
export const quantPos = (v: number): number => (Math.floor(v / Q) + 32768) & 0xffff;
export const dequantPos = (q: number): number => (q - 32768) * Q;
export const ID_BITS = 16;
export const ENTITY_BITS = ID_BITS + 2 * POS_BITS; // 48 bits = 6 bytes per visible entity at ground level
export const ENTITY_BITS_HIGH = ENTITY_BITS + POS_BITS; // J2: 64 bits = 8 bytes for one above the ground (y too)

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
// SNAPSHOT, wire format 2 (J2):
//   type 1 · tick 4 · ack 2 · self 2 · x 4 · z 4 · y 4 · vy 4 · flags 1 (bit 0 air jump spent, bits 1-2 jump buffer)
//   · nLow 2 · nHigh 2, then nLow × (id 2, x 2, z 2) for others at ground level (their height quantizes to 0)
//   and nHigh × (id 2, x 2, z 2, y 2) for others above it. A crowd standing on the plaza costs what it cost before J2.
const SNAP_HEADER = 30;
const ZERO_Q = 32768; // quantPos(0)

/** SNAPSHOT: own state at full precision (exact reconciliation, height included), others quantized. */
export function encodeSnapshot(s: SimState, self: number, ack: number, visible: number[]): Uint8Array {
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z;
  let high = 0;
  for (const id of visible) if (quantPos(Y[id]) !== ZERO_Q) high++;
  const low = visible.length - high;
  const buf = new Uint8Array(SNAP_HEADER + low * 6 + high * 8), dv = new DataView(buf.buffer);
  dv.setUint8(0, MSG.SNAPSHOT); dv.setUint32(1, s.tick >>> 0); dv.setUint16(5, ack & 0xffff); dv.setUint16(7, self);
  dv.setInt32(9, X[self]); dv.setInt32(13, Z[self]); dv.setInt32(17, Y[self]); dv.setInt32(21, s.mo.cols.vy[self]);
  dv.setUint8(25, (s.mo.cols.air[self] & 1) | ((s.mo.cols.buf[self] & 3) << 1));
  dv.setUint16(26, low); dv.setUint16(28, high);
  let o = SNAP_HEADER, h = SNAP_HEADER + low * 6;
  for (const id of visible) {
    const qy = quantPos(Y[id]);
    if (qy === ZERO_Q) { dv.setUint16(o, id); dv.setUint16(o + 2, quantPos(X[id])); dv.setUint16(o + 4, quantPos(Z[id])); o += 6; }
    else { dv.setUint16(h, id); dv.setUint16(h + 2, quantPos(X[id])); dv.setUint16(h + 4, quantPos(Z[id])); dv.setUint16(h + 6, qy); h += 8; }
  }
  return buf;
}
export type Snapshot = { tick: number; ack: number; self: Body & { id: number }; others: { id: number; x: number; y: number; z: number }[] };
/** Returns null for a message too short to be a snapshot; lying counts are clipped. Never throws. */
export function decodeSnapshot(bytes: Uint8Array): Snapshot | null {
  if (bytes.length < SNAP_HEADER) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nLow = Math.min(dv.getUint16(26), Math.floor((bytes.length - SNAP_HEADER) / 6));
  const nHigh = Math.min(dv.getUint16(28), Math.floor((bytes.length - SNAP_HEADER - nLow * 6) / 8));
  const others = new Array(nLow + nHigh);
  let o = SNAP_HEADER;
  for (let i = 0; i < nLow; i++, o += 6) others[i] = { id: dv.getUint16(o), x: dequantPos(dv.getUint16(o + 2)), y: 0, z: dequantPos(dv.getUint16(o + 4)) };
  for (let i = 0; i < nHigh; i++, o += 8) others[nLow + i] = { id: dv.getUint16(o), x: dequantPos(dv.getUint16(o + 2)), y: dequantPos(dv.getUint16(o + 6)), z: dequantPos(dv.getUint16(o + 4)) };
  const flags = dv.getUint8(25);
  return {
    tick: dv.getUint32(1), ack: dv.getUint16(5),
    self: { id: dv.getUint16(7), x: dv.getInt32(9), z: dv.getInt32(13), y: dv.getInt32(17), vy: dv.getInt32(21), air: flags & 1, buf: (flags >> 1) & 3 },
    others,
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

/** `closed` says the close code and reason (4003 = the world's roles took it out: do not come back by yourself). */
export function webSocketClient(url: string): Transport & { opened: Promise<void>; closed: Promise<{ code: number; reason: string }>; close(): void } {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  let cb: (b: Uint8Array) => void = () => {};
  const t = {
    sentBytes: 0,
    opened: new Promise<void>((ok, ko) => { ws.addEventListener("open", () => ok()); ws.addEventListener("error", () => ko(new Error(`cannot reach ${url}`))); }),
    closed: new Promise<{ code: number; reason: string }>((ok) => ws.addEventListener("close", (ev) => ok({ code: ev.code, reason: ev.reason }))),
    send(bytes: Uint8Array) { if (ws.readyState === 1) { ws.send(bytes); t.sentBytes += bytes.length; } },
    onMessage(f: (b: Uint8Array) => void) { cb = f; },
    close() { ws.close(); },
  };
  ws.addEventListener("message", (ev) => { if (ev.data instanceof ArrayBuffer) cb(new Uint8Array(ev.data)); });
  return t;
}
