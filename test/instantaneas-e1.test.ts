// E1: the snapshot send got cheaper (one pass per cell, heap top-k, coordinates quantized once per tick), and what
// goes on the wire must not change. The reference below is the pre-E1 code, kept verbatim: same picks, same
// priorities left behind, same bytes, for crowds, people in the air and a world past the 1,024 m wrap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FX_ONE, fx } from "../packages/core/src/index.ts";
import { Bot, Instance } from "../packages/instance/src/index.ts";
import { buildGrid, selectVisible, encodeSnapshot, cuantizar, quantPos, GRID_SIDE, CELL, CAND_MIN, RING_MAX, MSG } from "../packages/net/src/index.ts";
import type { Grid, Viewer } from "../packages/net/src/index.ts";
import type { SimState } from "../packages/sim/src/index.ts";

// ---------- reference: selectVisible / topK / encodeSnapshot as they were before E1 ----------
const cellOf = (v: number): number => Math.floor(v / CELL) & (GRID_SIDE - 1);
const ALIAS = (GRID_SIDE * CELL) / 2;
let cand = new Int32Array(1024), prio = new Float64Array(1024);
function refSelect(s: SimState, grid: Grid, v: Viewer, k: number, ringMax = RING_MAX): number[] {
  const X = s.tf.cols.x, Z = s.tf.cols.z;
  const vx = X[v.entity], vz = Z[v.entity];
  const cx = cellOf(vx), cz = cellOf(vz);
  let n = 0;
  const visit = (gx: number, gz: number) => {
    const c = (gx & (GRID_SIDE - 1)) * GRID_SIDE + (gz & (GRID_SIDE - 1)), end = grid.start[c + 1];
    if (n + (end - grid.start[c]) > cand.length) { const m = Math.max(cand.length * 2, n + end - grid.start[c]); const a = new Int32Array(m); a.set(cand); cand = a; prio = new Float64Array(m); }
    for (let i = grid.start[c]; i < end; i++) {
      const id = grid.items[i];
      if (id !== v.entity && Math.abs(X[id] - vx) < ALIAS && Math.abs(Z[id] - vz) < ALIAS) cand[n++] = id;
    }
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
    prio[i] = (v.priority[id] += 1 / (1 + (dx * dx + dz * dz) * 0.01));
  }
  if (n > k) refTopK(n, k);
  const m = Math.min(n, k), chosen = new Array<number>(m);
  for (let i = 0; i < m; i++) { chosen[i] = cand[i]; v.priority[cand[i]] = 0; }
  return chosen.sort((a, b) => a - b);
}
function refTopK(n: number, k: number): void {
  const better = (i: number, j: number) => prio[i] > prio[j] || (prio[i] === prio[j] && cand[i] < cand[j]);
  const swap = (i: number, j: number) => { const c = cand[i]; cand[i] = cand[j]; cand[j] = c; const p = prio[i]; prio[i] = prio[j]; prio[j] = p; };
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    swap((lo + hi) >> 1, hi);
    let store = lo;
    for (let i = lo; i < hi; i++) if (better(i, hi)) swap(i, store++);
    swap(store, hi);
    if (store === k - 1 || store === k) return;
    if (store < k) lo = store + 1; else hi = store - 1;
  }
}
function refEncode(s: SimState, self: number, ack: number, visible: number[]): Uint8Array {
  const X = s.tf.cols.x, Y = s.tf.cols.y, Z = s.tf.cols.z, ZERO_Q = 32768;
  let high = 0;
  for (const id of visible) if (quantPos(Y[id]) !== ZERO_Q) high++;
  const low = visible.length - high;
  const buf = new Uint8Array(30 + low * 6 + high * 8), dv = new DataView(buf.buffer);
  dv.setUint8(0, MSG.SNAPSHOT); dv.setUint32(1, s.tick >>> 0); dv.setUint16(5, ack & 0xffff); dv.setUint16(7, self);
  dv.setInt32(9, X[self]); dv.setInt32(13, Z[self]); dv.setInt32(17, Y[self]); dv.setInt32(21, s.mo.cols.vy[self]);
  dv.setUint8(25, (s.mo.cols.air[self] & 1) | ((s.mo.cols.buf[self] & 3) << 1));
  dv.setUint16(26, low); dv.setUint16(28, high);
  let o = 30, h = 30 + low * 6;
  for (const id of visible) {
    const qy = quantPos(Y[id]);
    if (qy === ZERO_Q) { dv.setUint16(o, id); dv.setUint16(o + 2, quantPos(X[id])); dv.setUint16(o + 4, quantPos(Z[id])); o += 6; }
    else { dv.setUint16(h, id); dv.setUint16(h + 2, quantPos(X[id])); dv.setUint16(h + 4, quantPos(Z[id])); dv.setUint16(h + 6, qy); h += 8; }
  }
  return buf;
}

/** Run a crowd for a while, calling the new and the reference code side by side on twin priority tables. */
function compara(o: { bots: number; ticks: number; k: number; mueve?: (s: SimState, t: number, ents: number[]) => void }): { envios: number; bytes: number; altos: number } {
  const inst = new Instance({ seed: 11, capacity: o.bots + 8, k: o.k, snapshotEvery: 2 });
  const bots: Bot[] = [];
  for (let i = 0; i < o.bots; i++) bots.push(new Bot(inst.join(i), (11 ^ (i * 0x9e3779b1)) >>> 0));
  const ents = inst.conns.map((c) => c.entity);
  const nuevo: Viewer[] = ents.map((e) => ({ entity: e, priority: new Float32Array(o.bots + 8) }));
  const ref: Viewer[] = ents.map((e) => ({ entity: e, priority: new Float32Array(o.bots + 8) }));
  let envios = 0, bytes = 0, altos = 0;
  for (let t = 0; t < o.ticks; t++) {
    for (const b of bots) b.think();
    inst.tick();
    o.mueve?.(inst.sim, t, ents);
    const s = inst.sim, grid = buildGrid(s), q = cuantizar(s);
    for (let i = 0; i < ents.length; i++) {
      const a = selectVisible(s, grid, nuevo[i], o.k), b = refSelect(s, grid, ref[i], o.k);
      assert.deepEqual(a, b, `tick ${t}, persona ${ents[i]}: otra elección`);
      const ba = encodeSnapshot(s, ents[i], t & 0xffff, a, q), bb = refEncode(s, ents[i], t & 0xffff, b);
      assert.deepEqual(ba, bb, `tick ${t}, persona ${ents[i]}: otros bytes`);
      assert.deepEqual(encodeSnapshot(s, ents[i], t & 0xffff, a), bb, "sin tabla, los mismos bytes");
      envios++; bytes += ba.length; altos += new DataView(ba.buffer).getUint16(28);
    }
    for (let i = 0; i < ents.length; i++) assert.deepEqual(nuevo[i].priority, ref[i].priority, `tick ${t}: prioridades distintas`);
  }
  return { envios, bytes, altos };
}

test("E1: a dense crowd gets the same picks, priorities and bytes as before", () => {
  const r = compara({ bots: 400, ticks: 24, k: 50 });
  assert.equal(r.envios, 400 * 24);
  assert.ok(r.bytes > r.envios * 30 * 5, "crowded: most snapshots carry many others");
});

test("E1: small k, few people (n ≤ k) and people in the air", () => {
  compara({ bots: 60, ticks: 20, k: 8 });
  compara({ bots: 5, ticks: 10, k: 50 });
  const r = compara({ bots: 80, ticks: 16, k: 20, mueve: (s, t, ents) => { for (let i = 0; i < ents.length; i += 3) s.tf.cols.y[ents[i]] = fx(((i + t) % 7) * 0.5); } });
  assert.ok(r.altos > 0, "some others travel with their height");
});

test("E1: past the 1,024 m wrap and near the ±2000 m edge, still the same", () => {
  compara({ bots: 120, ticks: 12, k: 30, mueve: (s, _t, ents) => {
    ents.forEach((e, i) => { s.tf.cols.x[e] = fx(1990 - (i % 12) * 3 - (i % 2) * 1024); s.tf.cols.z[e] = fx(-1995 + Math.floor(i / 12) * 2.5); });
  } });
});
