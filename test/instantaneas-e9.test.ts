// E9: encodeSnapshot writes the header by hand and cuts each message from a shared slab. A message handed out must never
// change afterwards (the transport may still hold it), and a message bigger than a slab slice must still come out right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bot, Instance } from "../packages/instance/src/index.ts";
import { buildGrid, selectVisible, encodeSnapshot, decodeSnapshot, cuantizar } from "../packages/net/src/index.ts";

function plaza(n: number) {
  const inst = new Instance({ seed: 7, capacity: n + 8, k: 50, snapshotEvery: 2 });
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) bots.push(new Bot(inst.join(i), (7 ^ (i * 0x9e3779b1)) >>> 0));
  for (let t = 0; t < 80; t++) { for (const b of bots) b.think(); inst.tick(); }
  return inst;
}

test("E9: messages stay intact while hundreds more are encoded (slab slices are never rewritten)", () => {
  const inst = plaza(120), grid = buildGrid(inst.sim), q = cuantizar(inst.sim);
  const out: { bytes: Uint8Array; copy: Uint8Array }[] = [];
  for (let r = 0; r < 4; r++) for (const c of inst.conns) {
    const vis = selectVisible(inst.sim, grid, c.viewer, 50);
    const bytes = encodeSnapshot(inst.sim, c.entity, 9, vis, q);
    out.push({ bytes, copy: bytes.slice() });
  }
  assert.ok(out.length >= 400);
  for (const { bytes, copy } of out) assert.deepEqual(bytes, copy);
  const d = decodeSnapshot(out[0].bytes)!;
  assert.equal(d.self.id, inst.conns[0].entity);
  assert.equal(d.ack, 9);
});

test("E9: a snapshot larger than a slab slice (and one with the jump tail) decodes to what was asked", () => {
  const inst = plaza(1200), q = cuantizar(inst.sim);
  const vis = Array.from({ length: 1000 }, (_, i) => i + 1); // ~8 kB: bigger than a quarter slab
  const big = encodeSnapshot(inst.sim, 0, 3, vis, q, [{ id: 5, tick: 70000 }]);
  const d = decodeSnapshot(big)!;
  assert.equal(d.others.length, 1000);
  assert.deepEqual(d.saltos, [{ id: 5, tick: 70000 & 0xffff }]);
  const small = encodeSnapshot(inst.sim, 0, 3, vis.slice(0, 3), q);
  assert.equal(decodeSnapshot(small)!.others.length, 3);
  assert.deepEqual(decodeSnapshot(big)!.others.length, 1000); // still intact after the next one
});
