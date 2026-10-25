// t_2b9f99c3 (Y3, the rest): a `coge` quest step may carry `otorga: "<objeto id>"` — picking the thing up hands over the weapon
// or relic the ADVENTURE defined (objeto@1). Format: an `otorga` on any other step, or naming an object the adventure does not
// define (or defines badly), is said with its file and path and the quest does not load. Server: the grant happens the
// moment the step is done, once, to who did it (every tab of that guest sees it), and never to anyone else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { crearInventario } from "../features/inventario/server.ts";
import { crearCliente } from "../features/inventario/client.ts";
import { leerCatalogo } from "../features/inventario/objeto.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente as crearMisionesCliente } from "../features/misiones/client.ts";
import { cargarAventura, leerMision } from "../features/misiones/formato.ts";

const EJEMPLO_DIR = new URL("../aventuras/ejemplo", import.meta.url).pathname;
const leer = lectorAventura(EJEMPLO_DIR);
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

const LIRA = { fichero: "objetos/lira.json", texto: leer("objetos").find((f) => f.fichero.includes("lira"))!.texto };
const mision = (otorga?: unknown, tipo = "coge") => ({ formato: "mision@1", id: "recado", titulo: "Un recado", descripcion: "Trae la caja.", pasos: [{ id: "caja", tipo, texto: "Recupera la caja", cosa: "caja-de-bruno", ...(otorga === undefined ? {} : { otorga }) }], recompensas: [], textos: { aceptada: "Hecho.", completada: "Gracias." } });
const doc = (m: unknown) => ({ fichero: "misiones/recado.json", texto: JSON.stringify(m) });

test("mision@1: a coge step reads `otorga`; any other step, a bad id or a missing object says exactly where", () => {
  const ok = leerMision(JSON.parse(doc(mision("lira-de-nyx")).texto));
  assert.ok(ok.ok);
  if (ok.ok) assert.equal((ok.value.pasos[0] as { otorga?: string }).otorga, "lira-de-nyx");
  const sin = leerMision(JSON.parse(doc(mision()).texto)); assert.ok(sin.ok); if (sin.ok) assert.equal("otorga" in sin.value.pasos[0], false, "optional: nothing added when absent");
  const usa = leerMision(JSON.parse(doc(mision("lira-de-nyx", "usa")).texto));
  assert.ok(!usa.ok && usa.issues.some((i) => i.path === "pasos[0].otorga" && /campo desconocido/.test(i.message)), "only `coge` may hand an object over");
  const malo = leerMision(JSON.parse(doc(mision("Lira Mala")).texto));
  assert.ok(!malo.ok && malo.issues.some((i) => i.path === "pasos[0].otorga" && /un id/.test(i.message)));

  const base = { pnj: leer("pnj"), cosas: leer("cosas") };
  const catalogo = new Set(leerCatalogo([LIRA]).objetos.keys());
  const bien = cargarAventura({ ...base, misiones: [doc(mision("lira-de-nyx"))] }, { objetos: catalogo });
  assert.deepEqual(bien.issues.filter((i) => i.path.startsWith("misiones/")), []); assert.ok(bien.aventura.misiones.has("recado"));
  const falta = cargarAventura({ ...base, misiones: [doc(mision("espada-que-no-esta"))] }, { objetos: catalogo });
  assert.equal(falta.aventura.misiones.has("recado"), false, "a quest that hands over an object nobody defined does not load");
  const i = falta.issues.find((x) => x.path.includes("pasos[0].otorga"))!;
  assert.match(i.path, /misiones\/recado/); assert.match(i.message, /espada-que-no-esta/); assert.match(i.message, /lira-de-nyx/, "it lists what the adventure does define");
  const roto = leerCatalogo([{ fichero: "objetos/lira.json", texto: LIRA.texto.replace('"competencia": "Tecnomancia"', '"competencia": ""') }]);
  assert.equal(roto.objetos.size, 0, "an invalid objeto@1 is not in the catalogue…");
  assert.equal(cargarAventura({ ...base, misiones: [doc(mision("lira-de-nyx"))] }, { objetos: new Set(roto.objetos.keys()) }).aventura.misiones.has("recado"), false, "…so a step naming it does not load");
  assert.ok(cargarAventura({ ...base, misiones: [doc(mision("lo-que-sea"))] }).aventura.misiones.has("recado"), "no catalogue given (a tool that cannot read it): not checked");
});

function mundo(objetos: { fichero: string; texto: string }[], m: unknown = mision("lira-de-nyx")) {
  const log: string[] = [];
  // the example's people and things, with the example quest replaced by ours (Alma offers «primeros-pasos»: same id, so her dialogue still works)
  const rec = { ...(m as Record<string, unknown>), id: "primeros-pasos" };
  const aventura = { misiones: [doc(rec)], pnj: leer("pnj"), cosas: leer("cosas"), objetos };
  const inst = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [...crearMisiones({ aventura }), crearInventario({ objetos: () => objetos })], log: (l) => log.push(l), identitySign: sign, now: () => Date.parse("2026-10-18T12:00:00Z") });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearMisionesCliente>["misiones"]; i: ReturnType<typeof crearCliente>["inventario"] }[] = [];
  const add = (k: Keeper = keeper()) => {
    const t = inst.join(pages.length), mc = crearMisionesCliente(), ic = crearCliente();
    const s = new ClientSession(t, { features: [...mc.parts, ...ic.parts], identity: k, view: { label() {}, bounce() {} } });
    const p = { s, t, m: mc.misiones, i: ic.inventario }; pages.push(p); return p;
  };
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  const place = (p: (typeof pages)[number], x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const aceptar = (p: (typeof pages)[number]) => { place(p, 2, -2); pump(12); p.m.hablar("alma"); pump(2); p.m.elegir(1); pump(2); p.m.elegir(1); pump(2); p.m.elegir(1); pump(2); };
  return { inst, pages, add, pump, place, aceptar, log };
}

test("over the real plug: picking the thing up hands over the adventure's object, once, to who did it (both tabs), nobody else", () => {
  const W = mundo([LIRA]);
  const k = keeper(), a = W.add(k), b = W.add(); W.pump(3);
  W.aceptar(a);
  assert.equal(a.i.lista().length, 0, "nothing before the step");
  W.place(a, 4, 15); W.pump(2); a.m.usar("caja-de-bruno"); W.pump(3);
  const lira = a.i.lista().find((o) => o.clase === "lira");
  assert.ok(lira, "the lira arrived in the Reserva with the step: " + JSON.stringify(a.i.lista()));
  assert.deepEqual([lira.tipo, lira.nombre, lira.competencia, lira.riesgo], ["reliquia", "Lira de Nyx", "Tecnomancia", "Desfase Armónico"], "what objeto@1 defined");
  assert.equal(a.i.lista().length, 1);
  const a2 = W.add(k); W.pump(3);
  assert.equal(a2.i.lista().length, 1, "a second tab of the same guest sees it too");
  assert.equal(b.i.lista().length, 0, "another player got nothing");
  W.pump(2); a.m.usar("caja-de-bruno"); W.pump(3);
  assert.equal(a.i.lista().length, 1, "using the thing again (the step is done) gives nothing more");
});

test("an object the adventure stops defining: the quest never loaded (said in the log), nobody is given anything", () => {
  const W = mundo([], mision("lira-de-nyx"));
  const a = W.add(); W.pump(3);
  assert.ok(W.log.some((l) => l.includes("pasos[0].otorga") && l.includes("lira-de-nyx")), "the author reads why: " + W.log.join(" | "));
  W.aceptar(a); W.place(a, 4, 15); W.pump(2); a.m.usar("caja-de-bruno"); W.pump(3);
  assert.equal(a.i.lista().length, 0);
});
