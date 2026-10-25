// t_f87ffb93 (Graboso solo con la reliquia): the pure rule (no inventory = Graboso for everyone; a world that defines the relic
// gives the button only to whoever CARRIES it), how the server reads «the world defines it» from aventura/objetos/, and the
// whole path over the real plug (`lista.graboso`, the client's `grabosoLibre()` flips with equipar / desequipar / soltar and
// is per person).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { ClientApi } from "../packages/feature/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { clientPart, defineFeature, serverPart } from "../packages/feature/src/index.ts";
import { crearInventario } from "../features/inventario/server.ts";
import { crearCliente } from "../features/inventario/client.ts";
import { CLASE_GRABOSO, grabosoLibre, llevaGraboso, mundoDefineGraboso } from "../features/inventario/reglas.ts";

const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

const reliquia = (portado: boolean, clase = CLASE_GRABOSO, tipo = "reliquia") => ({ tipo, clase, portado });

test("grabosoLibre: a world that does not define the relic keeps the Graboso for everyone; one that does gives it only to who carries it", () => {
  assert.equal(grabosoLibre(false, []), true, "no inventory rule: as before");
  assert.equal(grabosoLibre(false, [reliquia(false)]), true);
  assert.equal(grabosoLibre(true, []), false, "defined and you have nothing");
  assert.equal(grabosoLibre(true, [reliquia(false)]), false, "owned but left in the Reserva");
  assert.equal(grabosoLibre(true, [reliquia(true)]), true, "carried");
  assert.equal(grabosoLibre(true, [reliquia(true, "lira"), reliquia(false)]), false, "another relic carried is not the Graboso");
  assert.equal(grabosoLibre(true, [reliquia(true, CLASE_GRABOSO, "arma")]), false, "a WEAPON of class graboso is not the relic");
  assert.equal(llevaGraboso([reliquia(true), reliquia(true, "lira")]), true);
});

test("mundoDefineGraboso: only a readable object file of type reliquia and class graboso counts", () => {
  const f = (fichero: string, o: unknown) => ({ fichero, texto: typeof o === "string" ? o : JSON.stringify(o) });
  assert.equal(mundoDefineGraboso([]), false);
  assert.equal(mundoDefineGraboso([f("objetos/graboso.json", { formato: "objeto@1", id: "graboso", tipo: "reliquia", clase: "graboso", nombre: "El Graboso" })]), true);
  assert.equal(mundoDefineGraboso([f("objetos/espada.json", { tipo: "arma", clase: "espada" }), f("objetos/g.json", { tipo: "arma", clase: "graboso" })]), false);
  assert.equal(mundoDefineGraboso([f("objetos/roto.json", "{ no es json"), f("objetos/LEEME.md", "graboso")]), false, "a broken file or a note never counts");
  assert.equal(mundoDefineGraboso([f("objetos/roto.json", "{ no es json"), f("objetos/g.json", { tipo: "reliquia", clase: "graboso" })]), true, "one broken file does not hide the good one");
});

// a donor of the test: one intent gives the relic through the same server-only `otorga` door misiones and pesca use
const DONANTE = defineFeature({
  id: "regalo", version: 1, level: "base", describe: "Prueba: da una reliquia a quien la pide.",
  intents: { dame: { describe: "Pedir la reliquia.", spoken: "pedir una reliquia", fields: { clase: { kind: "text", maxBytes: 32 } } } },
  events: { otorga: { describe: "Solo servidor: un objeto para quien.", fields: { quien: { kind: "int", min: 0, max: 65535 }, tipo: { kind: "enum", values: ["arma", "reliquia", "token", "captura"] }, clase: { kind: "text", maxBytes: 32 }, nombre: { kind: "text", maxBytes: 40 } }, announce: "silent" } },
});
const donante = serverPart(DONANTE, (api) => { api.on("dame", (e, m) => { api.emit("otorga", { quien: e, tipo: "reliquia", clase: String(m.clase), nombre: String(m.clase) === CLASE_GRABOSO ? "El Graboso" : "Lira de Nyx" }, "server"); }); });

function mundo(objetos: { fichero: string; texto: string }[]) {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [donante, crearInventario({ donantes: [["regalo", "otorga"]], objetos: () => objetos })], identitySign: sign });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; i: ReturnType<typeof crearCliente>["inventario"]; pide: (clase: string) => void }[] = [];
  const add = () => {
    let A: ClientApi | null = null;
    const t = inst.join(pages.length), ic = crearCliente(), cd = clientPart(DONANTE, (api) => { A = api; });
    const s = new ClientSession(t, { features: [cd, ...ic.parts], identity: keeper(), view: { label() {}, bounce() {} } });
    pages.push({ s, t, i: ic.inventario, pide: (clase) => { A!.send("dame", { clase }); } }); return pages[pages.length - 1];
  };
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  const dame = (p: (typeof pages)[number], clase: string) => p.pide(clase);
  return { inst, add, pump, dame };
}
const DEFINE = [{ fichero: "objetos/graboso.json", texto: JSON.stringify({ formato: "objeto@1", id: "graboso", tipo: "reliquia", clase: "graboso", nombre: "El Graboso" }) }];

test("over the real plug: with the relic defined the page has no Graboso until it carries it, per person; without it, always", () => {
  const W = mundo(DEFINE);
  const a = W.add(), b = W.add(); W.pump(3);
  assert.equal(a.i.estado.graboso, true, "the server says this world defines the Graboso");
  assert.deepEqual([a.i.grabosoLibre(), b.i.grabosoLibre()], [false, false], "nobody has it: no button");
  W.dame(a, "lira"); W.pump(3);
  assert.equal(a.i.grabosoLibre(), false, "another relic does not open it");
  W.dame(a, CLASE_GRABOSO); W.pump(3);
  const g = a.i.lista().find((o) => o.clase === CLASE_GRABOSO)!;
  assert.ok(g, "the relic reached a's Reserva");
  assert.equal(a.i.grabosoLibre(), false, "owned but not carried");
  assert.ok(a.i.equipar(g.id).ok); W.pump(3);
  assert.equal(a.i.grabosoLibre(), true, "carried: the button comes");
  assert.equal(b.i.grabosoLibre(), false, "…for a, not for b");
  let avisos = 0; a.i.alCambiar(() => { avisos++; });
  assert.ok(a.i.desequipar(g.id).ok); W.pump(3);
  assert.equal(a.i.grabosoLibre(), false, "put back in the Reserva: gone again");
  assert.ok(avisos > 0, "the page is told so it can hide the button");
  a.i.equipar(g.id); W.pump(3); assert.equal(a.i.grabosoLibre(), true);
  a.i.soltar(g.id); W.pump(3);
  assert.equal(a.i.grabosoLibre(), false, "dropped: gone");
});

test("a world with no relic defined (or a different one) keeps the Graboso for everyone, with an empty inventory", () => {
  for (const objetos of [[], [{ fichero: "objetos/espada.json", texto: JSON.stringify({ tipo: "arma", clase: "espada" }) }]]) {
    const W = mundo(objetos), a = W.add(); W.pump(3);
    assert.equal(a.i.estado.graboso, false);
    assert.equal(a.i.grabosoLibre(), true);
  }
});
