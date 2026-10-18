// N1: the walkable world is ±2000 m (was ±500), with the same bytes on the wire. Others travel in 16 bits that wrap every
// 1,024 m and are read next to the page's own exact position; the area-of-interest grid wraps too and skips far copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, FX_ONE, rngNext } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, step, BOUND, Transform } from "../packages/sim/src/index.ts";
import { encodeSnapshot, decodeSnapshot, buildGrid, selectVisible, quantPos, dequantPos, unwrapPos } from "../packages/net/src/index.ts";
import { APARICION_XZ_MAX } from "../features/entorno/esquema.ts";

test("mundo grande: an avatar walks past 500 m and stops at ±2000 m", () => {
  assert.equal(BOUND, fx(2000));
  assert.deepEqual([Transform.fields.x, Transform.fields.z].map((f) => f.kind === "fixed" && [f.min, f.max]), [[-2000, 2000], [-2000, 2000]]);
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  s.tf.cols.x[e] = fx(1999); s.tf.cols.z[e] = fx(-1999);
  for (let t = 0; t < 40; t++) step(s, new Int32Array([e, 127, -127, 2])); // running diagonally outwards for 2 s
  assert.equal(s.tf.cols.x[e], fx(2000));
  assert.equal(s.tf.cols.z[e], fx(-2000));
  assert.ok(APARICION_XZ_MAX + 40 <= 2000, "a declared spawn square stays inside the walkable world");
});

test("mundo grande: unwrapPos gives the same bits as dequantPos inside ±512 m, and the right place anywhere else", () => {
  const r = new Uint32Array([99]);
  for (let i = 0; i < 20000; i++) { // two avatars inside the old plaza, less than 500 m apart (the area of interest: ≤ ~72 m)
    const a = ((rngNext(r) % (1023 * FX_ONE)) | 0) - 511 * FX_ONE;
    const b = Math.max(-511 * FX_ONE, Math.min(511 * FX_ONE, a + ((rngNext(r) % (1000 * FX_ONE)) | 0) - 500 * FX_ONE));
    assert.equal(unwrapPos(quantPos(a), b), dequantPos(quantPos(a)), `a=${a} b=${b}`);
  }
  for (let i = 0; i < 20000; i++) {
    const ref = ((rngNext(r) % (4000 * FX_ONE)) | 0) - 2000 * FX_ONE;
    const d = ((rngNext(r) % (1000 * FX_ONE)) | 0) - 500 * FX_ONE; // up to 500 m away
    const v = Math.max(-2000 * FX_ONE, Math.min(2000 * FX_ONE, ref + d));
    const got = unwrapPos(quantPos(v), ref);
    assert.ok(got <= v && v - got < FX_ONE / 64, `v=${v} ref=${ref} got=${got}`);
  }
});

test("mundo grande: a snapshot far from the origin reads the others where they are", () => {
  const s = createSim(4, 2); for (let i = 0; i < 4; i++) spawnAvatar(s, i);
  const at = (e: number, x: number, z: number) => { s.tf.cols.x[e] = fx(x); s.tf.cols.z[e] = fx(z); };
  at(0, 1800.5, -1700.25); at(1, 1830, -1650); at(2, 1999, -2000); at(3, -1990, 1990);
  const d = decodeSnapshot(encodeSnapshot(s, 0, 0, [1, 2]))!;
  assert.deepEqual([d.self.x, d.self.z], [fx(1800.5), fx(-1700.25)]);
  const o = new Map(d.others.map((x) => [x.id, x]));
  assert.deepEqual([o.get(1)!.x, o.get(1)!.z], [fx(1830), fx(-1650)]);
  assert.deepEqual([o.get(2)!.x, o.get(2)!.z], [fx(1999), fx(-2000)]);
});

test("mundo grande: the area of interest sees neighbours at 1,800 m and never a copy 1,024 m away", () => {
  const s = createSim(6, 3); for (let i = 0; i < 6; i++) spawnAvatar(s, i);
  const at = (e: number, x: number, z: number) => { s.tf.cols.x[e] = fx(x); s.tf.cols.z[e] = fx(z); };
  at(0, 1800, 1800); at(1, 1805, 1803);           // a neighbour
  at(2, 1805 - 1024, 1803); at(3, 1805, 1803 - 1024); at(4, 1805 - 2048, 1803 - 2048); // same cell of the wrapped grid
  at(5, 1800 + 60, 1800 - 60);                    // 60 m away on both axes, inside the view radius
  const vis = selectVisible(s, buildGrid(s), { entity: 0, priority: new Float64Array(6) }, 50);
  assert.deepEqual(vis, [1, 5]);
});

test("mundo grande: inside ±500 m the area of interest picks exactly what the clamped grid picked", () => {
  // the old grid, written out here: cells clamped at the edges, no wrap
  const GRID = 128, CELL = 8 * FX_ONE;
  const oldCell = (v: number) => { const c = Math.floor(v / CELL) + GRID / 2; return c < 0 ? 0 : c >= GRID ? GRID - 1 : c; };
  const s = createSim(400, 9); for (let i = 0; i < 400; i++) spawnAvatar(s, i);
  const r = new Uint32Array([5]);
  for (let i = 0; i < 400; i++) { s.tf.cols.x[i] = ((rngNext(r) % (1000 * FX_ONE)) | 0) - 500 * FX_ONE; s.tf.cols.z[i] = (i % 3 === 0 ? 480 * FX_ONE : 0) + (((rngNext(r) % (40 * FX_ONE)) | 0) - 20 * FX_ONE); }
  const grid = buildGrid(s);
  for (const viewer of [0, 3, 7, 100, 399]) {
    const got = selectVisible(s, grid, { entity: viewer, priority: new Float64Array(400) }, 50);
    // reference: every candidate in the 17x17 clamped cells, nearest-first by the same priority on a fresh queue
    const X = s.tf.cols.x, Z = s.tf.cols.z, cx = oldCell(X[viewer]), cz = oldCell(Z[viewer]);
    const cands: number[] = [];
    for (let rr = 0; rr <= 8 && cands.length < 150; rr++) for (let i = 0; i < 400; i++) {
      if (i === viewer) continue;
      const dx = Math.abs(oldCell(X[i]) - cx), dz = Math.abs(oldCell(Z[i]) - cz);
      if (Math.max(dx, dz) === rr) cands.push(i);
    }
    const pr = (i: number) => 1 / (1 + (((X[i] - X[viewer]) / FX_ONE) ** 2 + ((Z[i] - Z[viewer]) / FX_ONE) ** 2) * 0.01);
    const want = cands.sort((a, b) => pr(b) - pr(a) || a - b).slice(0, 50).sort((a, b) => a - b);
    assert.deepEqual(got, want, `viewer ${viewer}`);
  }
});

test("mundo grande: two pages 1,800 m from the origin see each other where they are, through the real protocol", async () => {
  const { Instance } = await import("../packages/instance/src/index.ts");
  const { ClientSession } = await import("../packages/client/src/index.ts");
  const { loopbackPair } = await import("../packages/net/src/index.ts");
  const inst = new Instance({ seed: 3, capacity: 8, k: 8, snapshotEvery: 2 });
  const pages = [0, 1].map(() => { const [srv, cli] = loopbackPair(); inst.connect(srv); const s = new ClientSession(cli); cli.flush(); return { s, cli }; });
  const put = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  put(pages[0].s.entity, 1800, -1900); put(pages[1].s.entity, 1805.5, -1897.25);
  for (let t = 0; t < 12; t++) { for (const p of pages) p.s.tick(0, 0); inst.tick(); for (const p of pages) p.cli.flush(); }
  const me = pages[0].s.selfPosition(1);
  assert.deepEqual([me.x, me.z], [1800, -1900]);
  const other = pages[0].s.remotePositions().find((r) => r.id === pages[1].s.entity);
  assert.ok(other, "page A sees page B");
  assert.deepEqual([other!.x, other!.z], [1805.5, -1897.25]);
});
