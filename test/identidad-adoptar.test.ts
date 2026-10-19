// identidad/i1: the first numinia.com pass of someone who was a guest here adopts their progress. Everything each
// feature's store kept under the guest id moves under the pass's `sub` (IDENTIDAD.md, camino C, step 2): objects and
// receipts are joined, in quests and grants the more advanced wins, nothing is lost, the guest id ceases to exist.
// The pass reaches the Instance through `identificar(entity, token, pase)`; `credencial` here is a stub that names
// `sub-ana` for the pass "ana" (pase.ts's real check is covered by test/pase-mundo.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineFeature, fusionar, serverPart } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { crearInventario } from "../features/inventario/server.ts";
import { signer } from "../packages/server/src/secret.ts";

const sign = signer("una-clave-de-prueba-larga");
const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "identidad-"));
/** A feature that keys its store like misiones/pesca/teletransporte do (`p:<id>`, `c:<misión>:<id>`, `oculto:<id>`), no onAdoptar: the generic move. */
const cesta = defineFeature({ id: "cesta", version: 1, describe: "Prueba de identidad/i1.", store: { describe: "Por invitado." } });
const INV = (serie: number, ...nombres: string[]) => ({ v: 1, serie, objetos: nombres.map((n, i) => ({ id: `o${i + 1}`, tipo: "token", clase: "semilla", nombre: n, icono: "", color: "", valor: 1, n: 1, portado: false })) });

/** A world with the stub feature and the real inventario, on disk; `entrar` identifies a guest (with or without a pass). */
function mundo(dir: string) {
  const log: string[] = [];
  let api!: ServerApi;
  const storage = new FileStorage(dir, (l) => log.push(l));
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2, storage, log: (l) => log.push(l), identitySign: sign,
    features: [serverPart(cesta, (a) => { api = a; }), crearInventario()],
    credencial: (_e, pase) => (pase === "ana" ? { id: "sub-ana", nombre: "Ana" } : null),
  });
  const entrar = (invitado: string, pase?: string) => {
    const n = inst.conns.length; inst.join(n);
    const e = inst.conns[n].entity;
    inst.identificar(e, emitir(sign, invitado, today()), pase);
    return inst.who(e)!;
  };
  const inventario = async (id: string) => { await storage.flush(); return new FileStorage(dir).load("inventario")?.store.find(([k]) => k === `i:${id}`)?.[1] as { serie: number; objetos: { id: string; nombre: string }[] } | undefined; };
  return { inst, api, storage, log, entrar, inventario };
}

test("identidad: a guest with progress comes back with a pass: everything is under sub and nothing is left under the guest", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "inventario.jsonl"), JSON.stringify({ v: 1, op: "k", key: "i:invitadouno2", value: INV(2, "Semilla roja", "Semilla azul") }) + "\n");
  const W = mundo(dir);
  W.api.store.set("p:invitadouno2", { v: 1, activas: { ronda: { paso: 2, tiene: ["llave"], hechos: ["a"] } }, hechas: ["primeros-pasos"], seguida: "ronda" });
  W.api.store.set("c:primeros-pasos:invitadouno2", { jugador: "invitadouno2", mision: "primeros-pasos" });
  W.api.store.set("oculto:invitadouno2", true);
  W.api.store.set("p:invitadonue2", { v: 1, activas: {}, hechas: ["otra"], seguida: "" }); // another guest: untouched
  const quien = W.entrar("invitadouno2", "ana");
  assert.equal(quien.id, "sub-ana");
  assert.deepEqual(W.api.store.keys().sort(), ["c:primeros-pasos:sub-ana", "oculto:sub-ana", "p:invitadonue2", "p:sub-ana"]);
  assert.deepEqual(W.api.store.get("p:sub-ana"), { v: 1, activas: { ronda: { paso: 2, tiene: ["llave"], hechos: ["a"] } }, hechas: ["primeros-pasos"], seguida: "ronda" });
  assert.deepEqual((await W.inventario("sub-ana"))?.objetos.map((o) => o.nombre), ["Semilla roja", "Semilla azul"]);
  assert.equal(await W.inventario("invitadouno2"), undefined, "the guest's Reserva is gone");
  assert.ok(W.log.some((l) => l.includes("[identidad] invitadouno2 pasa a ser sub-ana: 3 claves movidas")));
});

test("identidad: sub already had progress in this world: objects join, the more advanced quest wins, grants stay once", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "inventario.jsonl"), [
    JSON.stringify({ v: 1, op: "k", key: "i:invitadouno2", value: INV(1, "Semilla roja") }),
    JSON.stringify({ v: 1, op: "k", key: "i:sub-ana", value: INV(2, "Hoja", "Célula") }),
  ].join("\n") + "\n");
  const W = mundo(dir);
  W.api.store.set("p:invitadouno2", { v: 1, activas: { ronda: { paso: 3, tiene: ["llave"], hechos: ["a", "b"] }, pesca: { paso: 1, tiene: [], hechos: [] } }, hechas: ["primeros-pasos"], seguida: "ronda" });
  W.api.store.set("p:sub-ana", { v: 1, activas: { ronda: { paso: 1, tiene: ["mapa"], hechos: ["a"] } }, hechas: ["bienvenida"], seguida: "" });
  W.api.store.set("c:primeros-pasos:invitadouno2", { jugador: "invitadouno2", instante: "2026-10-18" });
  W.api.store.set("c:primeros-pasos:sub-ana", { jugador: "sub-ana", instante: "2026-10-17" });
  W.entrar("invitadouno2", "ana");
  assert.deepEqual(W.api.store.keys().sort(), ["c:primeros-pasos:sub-ana", "p:sub-ana"]);
  assert.deepEqual(W.api.store.get("p:sub-ana"), { v: 1, activas: { ronda: { paso: 3, tiene: ["mapa", "llave"], hechos: ["a", "b"] }, pesca: { paso: 1, tiene: [], hechos: [] } }, hechas: ["bienvenida", "primeros-pasos"], seguida: "ronda" });
  assert.deepEqual(W.api.store.get("c:primeros-pasos:sub-ana"), { jugador: "sub-ana", instante: "2026-10-17" }, "a grant is once: the first stays");
  const inv = await W.inventario("sub-ana");
  assert.deepEqual(inv?.objetos.map((o) => [o.id, o.nombre]), [["o1", "Hoja"], ["o2", "Célula"], ["o3", "Semilla roja"]], "the guest's objects come after, renumbered");
  assert.equal(inv?.serie, 3);
  assert.equal(await W.inventario("invitadouno2"), undefined);
});

test("identidad: the same pass again moves nothing; a refused pass moves nothing either", () => {
  const W = mundo(tmp());
  W.api.store.set("p:invitadouno2", { v: 1, activas: {}, hechas: ["x"], seguida: "" });
  W.entrar("invitadouno2", "ana");
  const foto = () => JSON.stringify(W.api.store.keys().sort().map((k) => [k, W.api.store.get(k)]));
  const antes = foto();
  W.entrar("invitadouno2", "ana"); // the same browser, a second tab: the guest ticket is still there, nothing is under it
  assert.equal(foto(), antes);
  assert.equal(W.inst.features.adoptar("invitadouno2", "sub-ana"), 0);
  W.api.store.set("p:invitadodos2", { v: 1, activas: {}, hechas: ["y"], seguida: "" });
  assert.equal(W.entrar("invitadodos2", "mala").id, "invitadodos2", "a refused pass leaves the guest, as before");
  assert.deepEqual(W.api.store.get("p:invitadodos2"), { v: 1, activas: {}, hechas: ["y"], seguida: "" });
  assert.equal(W.log.filter((l) => l.includes("[identidad]")).length, 1);
});

test("fusionar: arrays union, numbers the larger, objects key by key, sub's scalar stays unless empty", () => {
  assert.deepEqual(fusionar([1, 2], [2, 3]), [1, 2, 3]);
  assert.equal(fusionar(2, 5), 5);
  assert.deepEqual(fusionar({ a: 1, s: "", t: "x" }, { a: 3, b: 2, s: "y", t: "z" }), { a: 3, s: "y", t: "x", b: 2 });
  assert.equal(fusionar(undefined, 7), 7);
});
