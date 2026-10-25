// MIS-246 Y2/Y3: (t_31e1f7ea) the weapon you carry is drawn in your hand on every page, taken off when you put it back or
// leave, and kept off when this server does not hold its model; (t_2b9f99c3 + t_31e1f7ea) the weapons and relics an adventure
// defines (objeto@1) are read with a diagnostic and handed over by `otorga` with the id of the object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { clientPart, defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ClientApi } from "../packages/feature/src/index.ts";
import { crearInventario } from "../features/inventario/server.ts";
import { crearCliente } from "../features/inventario/client.ts";
import { armaEnMano, dar, desequipar, equipar, leerInventario, nuevoInventario } from "../features/inventario/reglas.ts";
import { leerCatalogo, leerObjeto } from "../features/inventario/objeto.ts";

const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const MODELO = "b".repeat(64), OTRO = "c".repeat(64);

test("rules: only a carried weapon WITH a model is in the hand; a bad model reads as none; relics have no model", () => {
  const inv = nuevoInventario();
  const a = dar(inv, { tipo: "arma", clase: "espada", nombre: "Espada", modelo: MODELO }); assert.ok(a.ok);
  const b = dar(inv, { tipo: "arma", clase: "daga", nombre: "Daga" }); assert.ok(b.ok);
  const r = dar(inv, { tipo: "reliquia", clase: "lira", nombre: "Lira", modelo: MODELO }); assert.ok(r.ok);
  assert.equal(armaEnMano(inv), null, "nothing carried");
  if (!a.ok || !b.ok || !r.ok) return;
  assert.equal(a.objeto.modelo, MODELO); assert.equal(b.objeto.modelo, ""); assert.equal(r.objeto.modelo, "", "a relic is not drawn in the hand");
  assert.ok(equipar(inv, b.objeto.id).ok); assert.equal(armaEnMano(inv), null, "a weapon without a model draws nothing");
  assert.ok(desequipar(inv, b.objeto.id).ok);
  assert.ok(equipar(inv, a.objeto.id).ok); assert.equal(armaEnMano(inv)?.id, a.objeto.id);
  assert.ok(desequipar(inv, a.objeto.id).ok); assert.equal(armaEnMano(inv), null);
  const sucio = leerInventario({ v: 1, serie: 1, objetos: [{ id: "o1", tipo: "arma", clase: "x", nombre: "X", modelo: "no-es-sha", portado: true }] });
  assert.equal(sucio.objetos[0].modelo, "", "a hand-edited model that is not a sha256 reads as none");
});

const OBJ = (o: Record<string, unknown>) => JSON.stringify({ formato: "objeto@1", id: "lira-de-nyx", tipo: "reliquia", clase: "lira", nombre: "Lira de Nyx", competencia: "Tecnomancia", propiedad: "Resonancia Memorística", factorRiesgo: { nombre: "Desfase Armónico", consecuencia: "Glitches." }, ...o });

test("objeto@1: a valid file reads; each mistake says where and how to fix it, all at once", () => {
  const ok = leerObjeto("objetos/lira.json", OBJ({}));
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.objeto.competencia, "Tecnomancia"); assert.equal(ok.objeto.factorRiesgo?.nombre, "Desfase Armónico"); assert.equal(ok.objeto.modelo, ""); }
  const arma = leerObjeto("objetos/espada.json", OBJ({ id: "espada", tipo: "arma", clase: "espada", nombre: "Espada", factorRiesgo: undefined, modelo: MODELO }));
  assert.ok(arma.ok, "a weapon's Factor de Riesgo is optional"); if (arma.ok) assert.equal(arma.objeto.modelo, MODELO);
  const mal = (o: Record<string, unknown>, trozo: string) => { const r = leerObjeto("objetos/x.json", OBJ(o)); assert.equal(r.ok, false, trozo); if (!r.ok) assert.ok(r.problemas.some((p) => p.includes(trozo)), `${trozo} ∈ ${r.problemas.join(" | ")}`); };
  mal({ formato: "objeto@2" }, "formato");
  mal({ tipo: "token" }, "«tipo»");
  mal({ id: "Lira Mala" }, "«id»");
  mal({ nombre: undefined }, "falta «nombre»");
  mal({ competencia: undefined }, "falta «competencia»");
  mal({ factorRiesgo: undefined }, "una reliquia lleva «factorRiesgo»");
  mal({ factorRiesgo: { nombre: "X" } }, "falta «consecuencia»");
  mal({ nombre: "n".repeat(60) }, "pasa de 40 bytes");
  mal({ tipo: "arma", modelo: "no-es-sha" }, "«modelo»");
  mal({ valor: -1 }, "«valor»");
  const varios = leerObjeto("objetos/x.json", OBJ({ formato: "no", competencia: undefined, valor: "mucho" }));
  assert.ok(!varios.ok && varios.problemas.length === 3, "every problem at once, not only the first");
  assert.equal(leerObjeto("objetos/roto.json", "{ no es json").ok, false);
  assert.equal(leerObjeto("objetos/lista.json", "[]").ok, false);
  const aviso = leerObjeto("objetos/r.json", OBJ({ modelo: MODELO }));
  assert.ok(aviso.ok && aviso.avisos.length === 1, "a model on a relic is ignored, said");
});

test("leerCatalogo: valid ones in, invalid ones said, duplicate ids refused, notes skipped", () => {
  const f = (fichero: string, texto: string) => ({ fichero, texto });
  const c = leerCatalogo([f("objetos/b.json", OBJ({ id: "lira-de-nyx" })), f("objetos/a.json", OBJ({ id: "lira-de-nyx", nombre: "Otra" })), f("objetos/c.json", OBJ({ id: "dados", clase: "dados", nombre: "Dados" })), f("objetos/d.json", OBJ({ competencia: undefined, id: "malo" })), f("objetos/LEEME.md", "# notas")]);
  assert.deepEqual([...c.objetos.keys()].sort(), ["dados", "lira-de-nyx"]);
  assert.equal(c.objetos.get("lira-de-nyx")?.nombre, "Otra", "files are read in name order: a.json wins, b.json is the duplicate");
  assert.equal(c.problemas.length, 2);
  assert.ok(c.problemas.some((p) => p.includes("objetos/b.json") && p.includes("ya lo usa")));
  assert.ok(c.problemas.some((p) => p.includes("objetos/d.json") && p.includes("falta «competencia»")));
});

// a donor of the test: the same server-only `otorga` door misiones and pesca use, with `objeto` (misiones v8)
const DONANTE = defineFeature({
  id: "regalo", version: 1, level: "base", describe: "Prueba: da lo que se pide.",
  intents: { dame: { describe: "Pedir un objeto.", spoken: "pedir un objeto", fields: { objeto: { kind: "text", maxBytes: 32 } } } },
  events: { otorga: { describe: "Solo servidor.", fields: { quien: { kind: "int", min: 0, max: 65535 }, tipo: { kind: "enum", values: ["arma", "reliquia", "token"] }, clase: { kind: "text", maxBytes: 32 }, nombre: { kind: "text", maxBytes: 40 }, objeto: { kind: "text", maxBytes: 32, default: "" } }, announce: "silent" } },
});
const donante = serverPart(DONANTE, (api) => { api.on("dame", (e, m) => { api.emit("otorga", { quien: e, tipo: "token", clase: "x", nombre: "ignorado", objeto: String(m.objeto) }, "server"); }); });

type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; i: ReturnType<typeof crearCliente>["inventario"]; pide: (objeto: string) => void; lleva: Map<number, string> };
function mundo(objetos: { fichero: string; texto: string }[], activos: string[] = [MODELO]) {
  const registro: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [donante, crearInventario({ donantes: [["regalo", "otorga"]], objetos: () => objetos })], identitySign: sign, activo: (sha) => activos.includes(sha), log: (m: string) => registro.push(m) } as never);
  const pages: Pagina[] = [];
  const add = (k: Keeper = keeper()): Pagina => {
    let A: ClientApi | null = null;
    const lleva = new Map<number, string>();
    const t = inst.join(pages.length), ic = crearCliente(), cd = clientPart(DONANTE, (api) => { A = api; });
    const s = new ClientSession(t, { features: [cd, ...ic.parts], identity: k, view: { label() {}, bounce() {}, lleva: (e, p, ranura) => { if (p) lleva.set(e, `${ranura ?? "bien"}:${p.donde}:${p.model.slice(0, 2)}`); else lleva.delete(e); } } });
    const pg: Pagina = { s, t, i: ic.inventario, pide: (objeto) => { A!.send("dame", { objeto }); }, lleva }; pages.push(pg); return pg;
  };
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  return { inst, add, pump, registro };
}
const ESPADA = { fichero: "objetos/espada.json", texto: JSON.stringify({ formato: "objeto@1", id: "espada-de-luz", tipo: "arma", clase: "espada", nombre: "Espada de luz", competencia: "Esgrima", modelo: MODELO }) };
const SINSERVIR = { fichero: "objetos/lanza.json", texto: JSON.stringify({ formato: "objeto@1", id: "lanza", tipo: "arma", clase: "lanza", nombre: "Lanza", competencia: "Asta", modelo: OTRO }) };
const LIRA = { fichero: "objetos/lira.json", texto: OBJ({}) };

test("over the real plug: otorga with an objeto id hands over the adventure's weapon, and its model is in the hand on EVERY page", () => {
  const W = mundo([ESPADA, LIRA, SINSERVIR, { fichero: "objetos/roto.json", texto: "{ no" }]);
  const a = W.add(), b = W.add(); W.pump(3);
  assert.ok(W.registro.some((m) => m.includes("objeto@1 inválido") && m.includes("objetos/roto.json")), "the broken file is said in the server log");
  a.pide("espada-de-luz"); a.pide("lira-de-nyx"); W.pump(3);
  const espada = a.i.lista().find((o) => o.clase === "espada")!, lira = a.i.lista().find((o) => o.clase === "lira")!;
  assert.ok(espada && lira, "both arrived through otorga");
  assert.deepEqual([espada.nombre, espada.competencia, espada.modelo], ["Espada de luz", "Esgrima", MODELO], "what the adventure defined, not the event\'s own fields");
  assert.deepEqual([lira.tipo, lira.competencia, lira.riesgo], ["reliquia", "Tecnomancia", "Desfase Armónico"]);
  assert.equal(b.lleva.size, 0, "carried nothing: no weapon in any hand");
  assert.ok(a.i.equipar(espada.id).ok); W.pump(3);
  assert.equal(b.lleva.get(a.s.entity), "arma:mano:bb", "the other tab sees it in A\'s hand");
  assert.equal(a.lleva.get(a.s.entity), "arma:mano:bb", "and A\'s own page too");
  assert.deepEqual(Object.keys(b.i.armasEnMano()).map(Number), [a.s.entity]);
  assert.ok(a.i.desequipar(espada.id).ok); W.pump(3);
  assert.equal(b.lleva.has(a.s.entity), false, "put back in the Reserva: out of the hand");
  a.i.equipar(espada.id); W.pump(3); assert.ok(b.lleva.has(a.s.entity));
  a.i.soltar(espada.id); W.pump(3);
  assert.equal(b.lleva.has(a.s.entity), false, "dropped: out of the hand");
});

test("an id the adventure does not define (or a broken one) gives nothing and says so; a model this server lacks is not drawn", () => {
  const W = mundo([ESPADA, SINSERVIR, { fichero: "objetos/malo.json", texto: OBJ({ id: "malo", competencia: undefined }) }]);
  const a = W.add(), b = W.add(); W.pump(3);
  a.pide("no-existe"); a.pide("malo"); W.pump(3);
  assert.equal(a.i.lista().length, 0);
  assert.ok(W.registro.some((m) => m.includes("«no-existe»")) && W.registro.some((m) => m.includes("«malo»")));
  a.pide("lanza"); W.pump(3);
  const lanza = a.i.lista().find((o) => o.clase === "lanza")!;
  assert.ok(lanza && a.i.equipar(lanza.id).ok); W.pump(3);
  assert.equal(b.lleva.size, 0, "the server does not hold that model: nothing to draw (the weapon is still carried)");
  assert.equal(a.i.lista().find((o) => o.id === lanza.id)!.portado, true);
});

test("leaving takes the weapon out of the hand for the others; coming back puts it on again", () => {
  const W = mundo([ESPADA]);
  const k = keeper(), a = W.add(k), b = W.add(); W.pump(3);
  a.pide("espada-de-luz"); W.pump(3);
  a.i.equipar(a.i.lista()[0].id); W.pump(3);
  const ea = a.s.entity; assert.ok(b.lleva.has(ea));
  W.inst.disconnect(ea); W.pump(3);
  assert.equal(b.lleva.has(ea), false, "gone with the avatar");
  const a2 = W.add(k); W.pump(4);
  assert.ok(a2.i.lista().some((o) => o.portado), "the same guest comes back carrying it");
  assert.equal(b.lleva.get(a2.s.entity), "arma:mano:bb", "and it is in the new avatar\'s hand");
});
