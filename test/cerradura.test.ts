// cerradura: headless (in-memory world, pages pumped by 20 Hz ticks). A code lock opens with the right digits and
// refuses the wrong ones (and never leaks the code); a key lock opens only once the guest has been given that key
// (by their guest id, not their connection); only builders place or remove locks; a run of wrong tries makes the
// lock wait before the next one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cerradura, CODIGO_MIN, CODIGO_MAX, INTENTOS_MAX } from "../features/cerradura/feature.ts";
import { crearCerradura } from "../features/cerradura/server.ts";
import { crearCliente } from "../features/cerradura/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (id: string): GuestKeeper => ({ load: () => id, save: () => {} }); // a fixed guest id per page (I1)

function mundo(ids: string[], puede = true) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearCerradura()], log: (l) => log.push(l), identitySign: sign, puede: () => puede });
  const pages = ids.map((id, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(id), features: [cli.part] });
    return { t, s, c: cli.cerradura };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  return { inst, pages, pump, log };
}

test("cerradura: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(cerradura.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "cerradura"));
  assert.ok(paginas.some((f) => f.feature.id === "cerradura"));
});

test("code lock: the builder sets it, the right digits open it, the code never reaches any page", () => {
  const W = mundo(["ana", "beto"]);
  const [A, B] = W.pages;
  W.pump();
  A.c.poner({ id: "puerta1", metodo: "codigo", codigo: "1234", nombre: "Puerta del sótano", x: 1, z: 2 });
  W.pump();
  assert.deepEqual(A.c.cerradura("puerta1"), { id: "puerta1", metodo: "codigo", abierta: false, nombre: "Puerta del sótano", x: 1, y: 0, z: 2, evento: "" });
  assert.ok(!("codigo" in (B.s.features.stateOf("cerradura").get("puerta1") ?? {})), "the code is never a state field");

  B.c.abrir("puerta1", "0000");
  W.pump();
  assert.equal(B.c.estado.ultimaAbierta, "");
  assert.match(B.c.estado.ultimoRechazo, /código no es/);
  assert.equal(B.c.cerradura("puerta1")!.abierta, false);

  B.c.abrir("puerta1", "1234");
  W.pump();
  assert.equal(B.c.estado.ultimaAbierta, "puerta1");
  assert.equal(B.c.cerradura("puerta1")!.abierta, true);
  assert.equal(A.c.cerradura("puerta1")!.abierta, true, "everyone sees it open");
});

test("code lock: a code must be 3-8 digits; wrong shape is refused before it is even compared", () => {
  const W = mundo(["ana"]);
  const [A] = W.pages;
  W.pump();
  A.c.poner({ id: "p", metodo: "codigo", codigo: "12", nombre: "x", x: 0, z: 0 });
  W.pump();
  assert.match(A.c.estado.ultimoRechazo, new RegExp(`${CODIGO_MIN} a ${CODIGO_MAX}`));
  assert.equal(A.c.cerradura("p"), null, "not created");
  A.c.poner({ id: "p", metodo: "codigo", codigo: "12a4", nombre: "x", x: 0, z: 0 });
  W.pump();
  assert.ok(A.c.estado.ultimoRechazo);
  assert.equal(A.c.cerradura("p"), null);
});

test("key lock: opens only for a guest this feature was told to give the key to, by their guest id", () => {
  const W = mundo(["ana", "beto"]);
  const [A, B] = W.pages;
  W.pump();
  A.c.poner({ id: "cofre", metodo: "llave", llave: "llave-oro", nombre: "Cofre", x: 0, z: 0 });
  W.pump();
  B.c.abrir("cofre");
  W.pump();
  assert.match(B.c.estado.ultimoRechazo, /No tienes la llave/);
  B.c.dar("llave-oro"); // builder-only today (D-042 h1-2); a non-builder would be refused the same way
  W.pump();
  assert.equal(B.c.estado.ultimaLlave, "llave-oro");
  B.c.abrir("cofre");
  W.pump();
  assert.equal(B.c.estado.ultimaAbierta, "cofre");
  assert.equal(B.c.cerradura("cofre")!.abierta, true);
});

test("only builders place, change or remove a lock; a visitor is refused and nothing changes", () => {
  const W = mundo(["ana"], false);
  const [A] = W.pages;
  W.pump();
  A.c.poner({ id: "p", metodo: "codigo", codigo: "111", nombre: "x", x: 0, z: 0 });
  W.pump();
  assert.match(A.c.estado.ultimoRechazo, /No puedes construir/);
  assert.equal(A.c.cerradura("p"), null);
});

test("a run of wrong tries makes the lock wait before the next one, per lock and per guest", () => {
  const W = mundo(["ana", "beto"]);
  const [A, B] = W.pages;
  W.pump();
  A.c.poner({ id: "p", metodo: "codigo", codigo: "9999", nombre: "x", x: 0, z: 0 });
  W.pump();
  for (let i = 0; i < INTENTOS_MAX; i++) { B.c.abrir("p", "0000"); W.pump(); }
  assert.match(B.c.estado.ultimoRechazo, /código no es/);
  B.c.abrir("p", "9999"); // right code, but still inside the wait: refused for waiting, not for the code
  W.pump();
  assert.match(B.c.estado.ultimoRechazo, /espera un poco/);
  assert.equal(B.c.cerradura("p")!.abierta, false);
  A.c.abrir("p", "9999"); // another guest, same lock: not affected by beto's wait
  W.pump();
  assert.equal(A.c.cerradura("p")!.abierta, true);
});

test("quitar: removes the lock and its code; poner again on the same id starts clean", () => {
  const W = mundo(["ana"]);
  const [A] = W.pages;
  W.pump();
  A.c.poner({ id: "p", metodo: "codigo", codigo: "4321", nombre: "x", x: 0, z: 0 });
  W.pump();
  A.c.quitar("p");
  W.pump();
  assert.equal(A.c.estado.ultimoHecho, "quitar p");
  assert.equal(A.c.cerradura("p"), null);
  A.c.poner({ id: "p", metodo: "codigo", codigo: "0001", nombre: "x", x: 0, z: 0 });
  W.pump();
  A.c.abrir("p", "4321"); // the old code of the removed lock no longer opens the new one with the same id
  W.pump();
  assert.match(A.c.estado.ultimoRechazo, /código no es/);
});
