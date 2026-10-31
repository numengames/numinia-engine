// E8: the selection of the k visible people (packages/net selectVisible) picks exactly the same set as a brute-force
// reference under the total order «higher priority, then lower id», whatever the state of the viewer's pivot guess
// (`umbral`): missing, stale, absurd. The guess may only change how long the work takes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, spawnAvatar } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { buildGrid, selectVisible, type Viewer } from "../packages/net/src/index.ts";

/** A crowd of n people on a grid of `paso` metres around the origin (everyone within the view radius when small). */
function multitud(n: number, paso: number, semilla: number) {
  const s = createSim(n + 8, semilla);
  const lado = Math.ceil(Math.sqrt(n));
  const ids: number[] = [];
  for (let i = 0; i < n; i++) { const e = spawnAvatar(s, i); s.tf.cols.x[e] = fx((i % lado - lado / 2) * paso + ((i * 7) % 5) * 0.1); s.tf.cols.z[e] = fx((Math.floor(i / lado) - lado / 2) * paso + ((i * 3) % 7) * 0.1); ids.push(e); }
  return { s, ids };
}

/** What a viewer should see: the same scan selectVisible does, sorted by the total order, cut at k, ids ascending.
 * Priorities are read BEFORE the call and accumulated the same way; the reference does not touch them. */
function referencia(s: ReturnType<typeof createSim>, ids: number[], v: Viewer, k: number, alcanceM: number): { visibles: number[]; prio: Map<number, number> } {
  const X = s.tf.cols.x, Z = s.tf.cols.z, vx = X[v.entity], vz = Z[v.entity];
  const cands: { id: number; p: number }[] = [];
  for (const id of ids) {
    if (id === v.entity) continue;
    const dx = (X[id] - vx) / 65536, dz = (Z[id] - vz) / 65536;
    if (Math.abs(dx) > alcanceM || Math.abs(dz) > alcanceM) continue; // the grid's rings are squares of cells: generous bound, see below
    cands.push({ id, p: v.priority[id] + 1 / (1 + (dx * dx + dz * dz) * 0.01) });
  }
  cands.sort((a, b) => (b.p - a.p) || (a.id - b.id));
  const top = cands.slice(0, k).map((c) => c.id).sort((a, b) => a - b);
  return { visibles: top, prio: new Map(cands.map((c) => [c.id, c.p])) };
}

test("E8: the k chosen are the brute-force k best, with any pivot guess", () => {
  // 140 people 1.5 m apart (an 18 m square): fewer than CAND_MIN, so the rings never stop early and every ring up to
  // the view radius is read — the scan sees everyone, and the brute force over everyone is the right reference
  const { s, ids } = multitud(140, 1.5, 3);
  const grid = buildGrid(s);
  for (const k of [1, 2, 7, 50, 139, 200]) {
    const umbrales: (number | undefined)[] = [undefined, 0, 1e9, -5, 0.73];
    for (const u of umbrales) {
      for (const e of [ids[0], ids[70], ids[139]]) {
        const v: Viewer = { entity: e, priority: new Float32Array(148) };
        // give it some history so priorities differ: a few sends with the real function first
        for (let t = 0; t < 3; t++) selectVisible(s, grid, v, 10);
        if (u !== undefined) v.umbral = u; else delete v.umbral;
        const copia = { entity: e, priority: Float32Array.from(v.priority) };
        const esperado = referencia(s, ids, copia, k, 100);
        const got = selectVisible(s, grid, v, k);
        assert.deepEqual(got, esperado.visibles, `k=${k} umbral=${u} viewer=${e}`);
        for (const id of got) assert.equal(v.priority[id], 0, "the sent go to the back of the queue");
        if (k < ids.length - 1) assert.ok(typeof v.umbral === "number" && Number.isFinite(v.umbral), "the guess is written for next time");
      }
    }
  }
});

test("E8: exact ties on priority break by lower id, like before", () => {
  // four people at the same distance from the viewer, fresh priorities (all equal): the lower ids win
  const s = createSim(16, 1);
  const pon = (owner: number, x: number, z: number) => { const e = spawnAvatar(s, owner); s.tf.cols.x[e] = fx(x); s.tf.cols.z[e] = fx(z); return e; };
  const me = pon(0, 0, 0);
  const otros = [pon(1, 3, 0), pon(2, -3, 0), pon(3, 0, 3), pon(4, 0, -3)];
  const v: Viewer = { entity: me, priority: new Float32Array(16) };
  assert.deepEqual(selectVisible(s, buildGrid(s), v, 2), otros.slice(0, 2).sort((a, b) => a - b));
  // next send: the two sent are at 0, the two unsent accumulated → they win now
  assert.deepEqual(selectVisible(s, buildGrid(s), v, 2), otros.slice(2).sort((a, b) => a - b));
});

test("E8: the id order of the output holds for big tables (insertion path) and small ones (radix path)", () => {
  for (const cap of [64, 4096, 4097, 9000]) {
    const s = createSim(cap, 5);
    const ids: number[] = [];
    for (let i = 0; i < 60; i++) { const e = spawnAvatar(s, i); s.tf.cols.x[e] = fx((i % 8) * 2); s.tf.cols.z[e] = fx(Math.floor(i / 8) * 2); ids.push(e); }
    const v: Viewer = { entity: ids[0], priority: new Float32Array(cap) };
    const got = selectVisible(s, buildGrid(s), v, 40);
    assert.equal(got.length, 40);
    for (let i = 1; i < got.length; i++) assert.ok(got[i - 1] < got[i], `cap ${cap}: ascending ids`);
  }
});
