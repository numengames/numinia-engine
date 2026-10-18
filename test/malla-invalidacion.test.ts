// D2: the world's collision mesh (M6 h8) is rebuilt only when something it is made of changes — a `malla` entry of
// the shared state added, removed or changed — not on every change of the shared state (a counter ticking, a box
// moving). A build that could not read some file (`faltaAlgo`) or threw still retries on the next change of any kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance, entradasMalla, huellaMalla } from "../packages/instance/src/index.ts";
import type { ConstruirMalla } from "../packages/instance/src/index.ts";

const cosas = defineFeature({
  id: "cosas", version: 1, describe: "Cosas con y sin malla (prueba de D2).",
  state: {
    describe: "Cada cosa: su colisión y dónde está.",
    fields: { colision: { kind: "enum", values: ["ninguna", "caja", "malla"], default: "ninguna" }, x: { kind: "int", min: -1000, max: 1000 }, n: { kind: "int", min: 0, max: 100000 } },
  },
});

const vuelta = () => new Promise<void>((r) => setImmediate(r));

function mundo(o: { falta?: () => boolean; lanza?: () => boolean } = {}) {
  let api!: ServerApi;
  const llamadas: [string, Record<string, unknown>][][] = [];
  const construir: ConstruirMalla = Object.assign(async (objs: Iterable<[string, Record<string, unknown>]>) => {
    llamadas.push([...objs]);
    if (o.lanza?.()) throw new Error("glb roto");
    return null;
  }, o.falta ? { faltaAlgo: o.falta } : {});
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [serverPart(cosas, (a) => { api = a; })], construirMalla: construir });
  const paso = async () => { inst.tick(); await vuelta(); };
  return { inst, llamadas, paso, api: () => api };
}

test("D2: a change outside the mesh (a counter, a box) does not rebuild it; a malla entry changing does", async () => {
  const W = mundo();
  W.api().state.set("suelo", { colision: "malla", x: 0, n: 0 });
  W.api().state.set("contador", { colision: "ninguna", x: 0, n: 0 });
  W.api().state.set("caja", { colision: "caja", x: 0, n: 0 });
  await W.paso();
  assert.equal(W.llamadas.length, 1, "the first look always builds");
  assert.deepEqual(W.llamadas[0].map(([k]) => k), ["cosas:suelo"], "the builder gets only the malla entries");
  for (let i = 1; i <= 20; i++) { W.api().state.set("contador", { colision: "ninguna", x: 0, n: i }); W.api().state.set("caja", { colision: "caja", x: i, n: 0 }); await W.paso(); }
  assert.equal(W.llamadas.length, 1, "40 changes to things that are not malla: no rebuild");
  W.api().state.set("suelo", { colision: "malla", x: 0, n: 0 }); await W.paso();
  assert.equal(W.llamadas.length, 1, "set again to the same value: nothing the mesh reads changed");
  W.api().state.set("suelo", { colision: "malla", x: 5, n: 0 }); await W.paso();
  assert.equal(W.llamadas.length, 2, "the malla thing moved: rebuild");
  assert.equal(W.llamadas[1][0][1].x, 5);
  W.api().state.set("caja", { colision: "malla", x: 3, n: 0 }); await W.paso();
  assert.equal(W.llamadas.length, 3, "a box turned malla: rebuild");
  assert.deepEqual(W.llamadas[2].map(([k]) => k), ["cosas:suelo", "cosas:caja"]);
  W.api().state.set("caja", { colision: "caja", x: 3, n: 0 }); await W.paso();
  assert.equal(W.llamadas.length, 4, "it stopped being malla: rebuild without it");
  W.api().state.delete("suelo"); await W.paso();
  assert.equal(W.llamadas.length, 5, "the malla thing deleted: rebuild");
  assert.deepEqual(W.llamadas[4], [], "nothing left to build from");
  W.api().state.set("contador", { colision: "ninguna", x: 0, n: 99 }); await W.paso();
  assert.equal(W.llamadas.length, 5);
  assert.equal(W.inst.mallasConstruidas, 5);
});

test("D2: a world without any malla thing asks once (null mesh) and never again", async () => {
  const W = mundo();
  for (let i = 0; i < 10; i++) { W.api().state.set("contador", { colision: "ninguna", x: 0, n: i }); await W.paso(); }
  assert.equal(W.llamadas.length, 1);
  assert.equal(W.inst.sim.mesh, null);
});

test("D2: a build that missed a file (faltaAlgo) or threw retries on the next change of any kind, then settles", async () => {
  let falta = true;
  const W = mundo({ falta: () => falta });
  W.api().state.set("suelo", { colision: "malla", x: 0, n: 0 });
  await W.paso();
  assert.equal(W.llamadas.length, 1);
  await W.paso();
  assert.equal(W.llamadas.length, 1, "no change at all: no retry (no busy loop)");
  W.api().state.set("contador", { colision: "ninguna", x: 0, n: 1 }); await W.paso();
  assert.equal(W.llamadas.length, 2, "the file was missing: any change retries, as before D2");
  falta = false;
  W.api().state.set("contador", { colision: "ninguna", x: 0, n: 2 }); await W.paso();
  assert.equal(W.llamadas.length, 3, "still missing at the last build: retry");
  W.api().state.set("contador", { colision: "ninguna", x: 0, n: 3 }); await W.paso();
  assert.equal(W.llamadas.length, 3, "complete now: counters no longer rebuild");

  let lanza = true;
  const L = mundo({ lanza: () => lanza });
  L.api().state.set("suelo", { colision: "malla", x: 0, n: 0 });
  await L.paso();
  lanza = false;
  L.api().state.set("contador", { colision: "ninguna", x: 0, n: 1 }); await L.paso();
  assert.equal(L.llamadas.length, 2, "it threw: the next change retries");
  L.api().state.set("contador", { colision: "ninguna", x: 0, n: 2 }); await L.paso();
  assert.equal(L.llamadas.length, 2);
});

test("D2: huellaMalla sees only malla entries, in order", () => {
  const a: [string, Record<string, unknown>][] = [["o:1", { colision: "malla", x: 1 }], ["o:2", { colision: "caja", x: 2 }], ["c:1", { n: 3 }]];
  const b: [string, Record<string, unknown>][] = [["o:1", { colision: "malla", x: 1 }], ["o:2", { colision: "caja", x: 9 }], ["c:1", { n: 4 }]];
  assert.deepEqual(entradasMalla(a).map(([k]) => k), ["o:1"]);
  assert.equal(huellaMalla(entradasMalla(a)), huellaMalla(entradasMalla(b)));
  assert.notEqual(huellaMalla(entradasMalla(a)), huellaMalla(entradasMalla([["o:1", { colision: "malla", x: 2 }]])));
});
