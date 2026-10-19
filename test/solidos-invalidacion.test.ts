// E6: the simulation's solid boxes (U10, `solidsFrom`) are redone only when something they are made of changes — a
// thing that is or was `solido: true` set with another box, turned solid or not, or deleted — not on every change of
// the shared state (a counter ticking, a solid creature losing coherencia). And the instance hands the feature runtime
// one shared list of players, rebuilt only on join/leave, while a piece's `api.players()` still gets its own array.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { solidsFrom } from "../packages/sim/src/index.ts";

const cosas = defineFeature({
  id: "cosas", version: 1, describe: "Cosas sólidas y no sólidas (prueba de E6).",
  state: {
    describe: "Cada cosa: si es sólida, su caja y un número que cambia.",
    fields: {
      solido: { kind: "bool", default: false },
      bx0: { kind: "fixed", min: -100, max: 100, step: 1 / 64 }, by0: { kind: "fixed", min: -100, max: 100, step: 1 / 64 }, bz0: { kind: "fixed", min: -100, max: 100, step: 1 / 64 },
      bx1: { kind: "fixed", min: -100, max: 100, step: 1 / 64 }, by1: { kind: "fixed", min: -100, max: 100, step: 1 / 64 }, bz1: { kind: "fixed", min: -100, max: 100, step: 1 / 64 },
      n: { kind: "int", min: 0, max: 100000 },
    },
  },
});
const caja = (x: number, n = 0, solido = true) => ({ solido, bx0: x, by0: 0, bz0: 0, bx1: x + 1, by1: 1, bz1: 1, n });

function mundo() {
  let api!: ServerApi;
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [serverPart(cosas, (a) => { api = a; })] });
  return { inst, api: () => api, mismas: () => assert.deepEqual([...inst.sim.solids], [...solidsFrom(inst.features.allState())], "the sim's boxes are what solidsFrom says") };
}

test("E6: a change outside the solids (a counter, a creature's coherencia) does not redo the boxes; a solid changing does", () => {
  const W = mundo();
  W.api().state.set("muro", caja(0));
  W.api().state.set("contador", caja(0, 0, false));
  W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 1, "the first look always builds");
  W.mismas();
  const antes = W.inst.sim.solids;
  for (let i = 1; i <= 20; i++) { W.api().state.set("contador", caja(i, i, false)); W.api().state.set("muro", caja(0, i)); W.inst.tick(); }
  assert.equal(W.inst.solidosRehechos, 1, "40 changes that leave every box as it was: no rebuild");
  assert.equal(W.inst.sim.solids, antes, "the same boxes, untouched");
  W.api().state.set("muro", caja(5)); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 2, "the solid moved: rebuild"); W.mismas();
  W.api().state.set("contador", caja(3)); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 3, "a thing turned solid: rebuild"); W.mismas();
  assert.equal(W.inst.sim.solids.length, 12);
  W.api().state.set("contador", caja(3, 0, false)); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 4, "it stopped being solid: rebuild without it"); W.mismas();
  W.api().state.delete("muro"); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 5, "the solid deleted: rebuild"); W.mismas();
  assert.equal(W.inst.sim.solids.length, 0);
  W.api().state.delete("contador"); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 5, "deleting something that was not solid changes no box");
});

test("E6: a piece that edits the value it got and sets it again still moves the boxes", () => {
  const W = mundo();
  W.api().state.set("muro", caja(0)); W.inst.tick();
  const v = W.api().state.get("muro")!;
  v.bx0 = 2; v.bx1 = 3;
  W.api().state.set("muro", v); W.inst.tick();
  assert.equal(W.inst.solidosRehechos, 2); W.mismas();
  assert.equal(W.inst.sim.solids[0], 2 * 65536);
});

test("E6: one shared, frozen players list until someone joins or leaves; a piece's api.players() is its own copy", () => {
  const W = mundo();
  W.inst.join(0); W.inst.join(1);
  const a = W.inst.players();
  assert.equal(W.inst.players(), a, "no copy per call");
  assert.ok(Object.isFrozen(a));
  assert.deepEqual([...a], W.inst.conns.map((c) => c.entity));
  W.inst.tick();
  assert.equal(W.inst.players(), a, "a tick copies nothing");
  const mia = W.api().players() as number[];
  assert.notEqual(mia, a, "a piece gets its own array");
  mia.reverse(); mia.push(99);
  assert.deepEqual([...W.inst.players()], W.inst.conns.map((c) => c.entity), "what a piece does with its copy changes nothing");
  W.inst.join(2);
  const b = W.inst.players();
  assert.notEqual(b, a); assert.equal(b.length, 3);
  assert.equal(a.length, 2, "whoever was walking the old list keeps it whole");
  W.inst.disconnect(b[0]);
  assert.deepEqual([...W.inst.players()], [b[1], b[2]]);
});
