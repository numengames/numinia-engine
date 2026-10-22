// Y1 (the Inventario): the rules on their own (canon limits: one weapon carried, three relics; tokens stack; a broken
// file reads as empty), the whole thing over the real plug (the example quest's Semilla verde lands in the inventory
// of who completed it, only in their tabs, survives a restart by guest), the intents from the page, and what sending
// a Reserva costs with 1,000 players. The simulation's fingerprint never moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { stateHash } from "../packages/sim/src/index.ts";
import { ServerRuntime } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { inventario } from "../features/inventario/feature.ts";
import { crearInventario } from "../features/inventario/server.ts";
import { crearCliente } from "../features/inventario/client.ts";
import { dar, quitar, equipar, desequipar, leerInventario, nuevoInventario, resumen, LIM, BOLSA_HUECOS, PAGINA, PAGINAS_MAX, juntar, trocear, ocupados, bolsaLlena } from "../features/inventario/reglas.ts";
import type { FeatureStorage, Saved } from "../packages/feature/src/index.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente as crearMisionesCliente } from "../features/misiones/client.ts";
import { cargarAventura } from "../features/misiones/formato.ts";
import funciones from "../features/servidor.ts";
import clientes from "../features/cliente.ts";

const EJEMPLO_DIR = new URL("../aventuras/ejemplo", import.meta.url).pathname;
const leer = lectorAventura(EJEMPLO_DIR);
const EJEMPLO = { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") };
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A headless plaza with the example adventure, misiones and inventario; each page has its own controllers. */
function world(opts: { storage?: FileStorage } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [...crearMisiones({ aventura: EJEMPLO }), crearInventario()], log: (l) => log.push(l), storage: opts.storage, identitySign: sign, now: () => Date.parse("2026-10-18T12:00:00Z") });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearMisionesCliente>["misiones"]; i: ReturnType<typeof crearCliente>["inventario"]; k: Keeper; cambios: number }[] = [];
  const add = (k: Keeper = keeper()) => {
    const t = inst.join(pages.length), mc = crearMisionesCliente(), ic = crearCliente();
    const s = new ClientSession(t, { features: [...mc.parts, ...ic.parts], identity: k, view: { label() {}, bounce() {} } });
    const p = { s, t, m: mc.misiones, i: ic.inventario, k, cambios: 0 };
    ic.inventario.alCambiar(() => { p.cambios++; });
    pages.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  const place = (p: (typeof pages)[number], x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  /** Walk the example quest «primeros-pasos» to its end for this page (pilar, Bruno, box). */
  const completar = (p: (typeof pages)[number]) => {
    place(p, 2, -2); pump(12);
    p.m.hablar("alma"); pump(2); p.m.elegir(1); pump(2); p.m.elegir(1); pump(2); p.m.elegir(1); pump(2); // the errand, accept, goodbye
    place(p, 16, 1); pump(12);                                                                        // the pillar
    place(p, 10, 10); pump(12); p.m.hablar("bruno"); pump(2); p.m.elegir(1); pump(2); p.m.elegir(1); pump(2); // Bruno's explicit option, goodbye
    place(p, 4, 15); pump(2); p.m.usar("caja-de-bruno"); pump(2);                                     // the box
  };
  return { inst, pages, add, pump, place, completar, log };
}

test("inventario: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(inventario.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "inventario") && clientes.some((f) => f.feature.id === "inventario"));
  assert.ok(funciones.findIndex((f) => f.feature.id === "inventario") > funciones.findIndex((f) => f.feature.id === "misiones"), "inventario listens to misiones: it comes after");
});

test("reglas: tokens stack by class and colour, weapons and relics never; the Reserva and a stack have a size", () => {
  const inv = nuevoInventario();
  const a = dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde" });
  const b = dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde", n: 2 });
  const c = dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla roja", color: "roja" });
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(a.objeto.id, b.objeto.id, "same stack");
  assert.deepEqual(inv.objetos.map((o) => [o.id, o.n, o.valor]), [["o1", 3, 1], ["o2", 1, 5]], "a semilla's value comes from its colour");
  assert.equal(resumen(inv).prestigio, 8);
  const h1 = dar(inv, { tipo: "arma", clase: "hoja", nombre: "Hoja" }), h2 = dar(inv, { tipo: "arma", clase: "hoja", nombre: "Hoja" });
  assert.ok(h1.ok && h2.ok && h1.objeto.id !== h2.objeto.id && h2.objeto.n === 1, "two weapons are two objects");
  assert.equal(dar(inv, { tipo: "token", clase: "semilla", nombre: "x", color: "verde", n: LIM.pila }).ok, false, "a stack has a top");
  for (let i = ocupados(inv); i < BOLSA_HUECOS; i++) assert.ok(dar(inv, { tipo: "reliquia", clase: `r${i}`, nombre: `Reliquia ${i}` }).ok);
  assert.match((dar(inv, { tipo: "reliquia", clase: "otra", nombre: "Otra" }) as { motivo: string }).motivo, /llena/);
  assert.ok(dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla roja", color: "roja" }).ok, "a full Reserva still stacks");
  assert.equal(dar(inv, { tipo: "token", clase: "", nombre: "x" }).ok, false);
  assert.equal(dar(inv, { tipo: "cosa" as "token", clase: "x", nombre: "x" }).ok, false);
});

test("reglas: the canon's limits — one weapon carried, three relics; tokens are never carried; drop shrinks a stack", () => {
  const inv = nuevoInventario();
  const ids = ["Hoja", "Cadena"].map((n) => (dar(inv, { tipo: "arma", clase: n.toLowerCase(), nombre: n }) as { objeto: { id: string } }).objeto.id);
  const rel = [1, 2, 3, 4].map((i) => (dar(inv, { tipo: "reliquia", clase: `r${i}`, nombre: `Reliquia ${i}` }) as { objeto: { id: string } }).objeto.id);
  const sem = (dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla azul", color: "azul", n: 3 }) as { objeto: { id: string } }).objeto.id;
  assert.ok(equipar(inv, ids[0]).ok);
  assert.ok(equipar(inv, ids[0]).ok, "again is fine");
  assert.match((equipar(inv, ids[1]) as { motivo: string }).motivo, /un arma/);
  assert.ok(desequipar(inv, ids[0]).ok && equipar(inv, ids[1]).ok, "swap: put one back, carry the other");
  for (const r of rel.slice(0, 3)) assert.ok(equipar(inv, r).ok);
  assert.match((equipar(inv, rel[3]) as { motivo: string }).motivo, /3 reliquias/);
  assert.match((equipar(inv, sem) as { motivo: string }).motivo, /tokens/);
  assert.equal(resumen(inv).portados, 4);
  assert.equal(equipar(inv, "o99").ok, false);
  assert.equal((quitar(inv, sem, 2) as { objeto: { n: number } }).objeto.n, 1);
  assert.equal((quitar(inv, sem) as { objeto: { n: number } }).objeto.n, 0);
  assert.equal(inv.objetos.some((o) => o.id === sem), false);
  assert.ok(quitar(inv, ids[1]).ok && !inv.objetos.some((o) => o.id === ids[1]));
  assert.equal(quitar(inv, ids[1]).ok, false);
  // ids never repeat after a drop: the series only grows
  assert.equal((dar(inv, { tipo: "arma", clase: "martillo", nombre: "Martillo" }) as { objeto: { id: string } }).objeto.id, "o8");
});

test("reglas: what S4 stored is read back exactly; a broken or hand-edited value never crashes and keeps the limits", () => {
  const inv = nuevoInventario();
  dar(inv, { tipo: "arma", clase: "hoja", nombre: "Hoja" }); dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde", n: 4 });
  equipar(inv, "o1");
  assert.deepEqual(leerInventario(JSON.parse(JSON.stringify(inv))), inv);
  for (const raw of [null, 3, "x", {}, { v: 2, objetos: [] }, { v: 1, objetos: "no" }]) assert.deepEqual(leerInventario(raw), nuevoInventario());
  const roto = leerInventario({ v: 1, serie: 0, objetos: [{ id: "o1", tipo: "arma", clase: "a", nombre: "A", portado: true }, { id: "o2", tipo: "arma", clase: "b", nombre: "B", portado: true }, { id: "o2", tipo: "token" }, { id: "zz", tipo: "token", clase: "x", nombre: "x" }, { id: "o5", tipo: "token", clase: "semilla", nombre: "S", color: "morada", n: 5000, portado: true }] });
  assert.deepEqual(roto.objetos.map((o) => [o.id, o.portado, o.n, o.color]), [["o1", true, 1, ""], ["o2", false, 1, ""], ["o5", false, LIM.pila, ""]], "second carried weapon goes back; a token is never carried; unknown colour = none; duplicate and bad ids dropped");
  assert.equal(roto.serie, 5, "the series continues after the highest id");
  assert.equal(leerInventario({ v: 1, serie: 0, objetos: Array.from({ length: 80 }, (_, i) => ({ id: `o${i + 1}`, tipo: "reliquia", clase: `r${i}`, nombre: `R${i}`, portado: i < 5 })) }).objetos.length, BOLSA_HUECOS + 3, "a hand-edited file with 80 objects keeps the 42 slots and the carried ones");
});

/** A bag as full as the rules allow, with the longest names the schema allows (what S4 has to hold). */
const llenaLarga = () => {
  const inv = nuevoInventario();
  for (let i = 0; i < BOLSA_HUECOS; i++) dar(inv, { tipo: i % 3 === 0 ? "arma" : "reliquia", clase: `${"c".repeat(28)}${i}`.slice(-32), nombre: `${"ñ".repeat(17)}${i}`.slice(-19) + "x".repeat(20), icono: "crane-tower-abc".padEnd(24, "x"), color: "dorada", valor: 9999 });
  for (const o of [inv.objetos.find((x) => x.tipo === "arma")!, ...inv.objetos.filter((x) => x.tipo === "reliquia").slice(0, 3)]) equipar(inv, o.id);
  return inv;
};

test("La Bolsa galáctica: 42 slots, one per stack; what is carried takes none; a NEW slot is refused when full, a stack still grows", () => {
  assert.equal(BOLSA_HUECOS, 42);
  const inv = nuevoInventario();
  const carpa = { tipo: "captura", clase: "carpa", nombre: "Carpa", icono: "fish", color: "plateada" } as const;
  for (let i = 0; i < 40; i++) assert.ok(dar(inv, { tipo: "reliquia", clase: `r${i}`, nombre: `Reliquia ${i}` }).ok);
  assert.ok(dar(inv, carpa).ok && dar(inv, carpa).ok && dar(inv, { tipo: "arma", clase: "hoja", nombre: "Hoja" }).ok);
  assert.deepEqual([ocupados(inv), bolsaLlena(inv), inv.objetos.length], [42, true, 42], "two carp are one slot; 42 slots used");
  for (const r of inv.objetos.filter((o) => o.tipo === "reliquia").slice(0, 3)) equipar(inv, r.id);
  equipar(inv, inv.objetos.find((o) => o.tipo === "arma")!.id);
  assert.deepEqual([ocupados(inv), bolsaLlena(inv), inv.objetos.length], [38, false, 42], "carried things leave their slots");
  assert.ok(dar(inv, { tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde" }).ok && dar(inv, { tipo: "arma", clase: "martillo", nombre: "Martillo" }).ok);
  assert.ok(dar(inv, { ...carpa, color: "azul", nombre: "Carpa rara" }).ok && dar(inv, { tipo: "reliquia", clase: "ultima", nombre: "Última" }).ok);
  assert.equal(ocupados(inv), 42);
  // full: a new slot is refused with the words the HUD shows; the same kinds still stack
  const nueva = dar(inv, { tipo: "captura", clase: "trucha", nombre: "Trucha", color: "azul" });
  assert.deepEqual(nueva, { ok: false, motivo: "Tu Bolsa está llena (42/42).", llena: true });
  assert.ok(dar(inv, carpa).ok && inv.objetos.find((o) => o.clase === "carpa" && o.color === "plateada")!.n === 3);
  assert.equal(dar(inv, { tipo: "reliquia", clase: "otra", nombre: "Otra" }).ok, false);
  // putting a carried thing back needs a slot again; dropping one frees it
  const llevada = inv.objetos.find((o) => o.portado)!;
  assert.deepEqual(desequipar(inv, llevada.id), { ok: false, motivo: "Tu Bolsa está llena (42/42): no hay hueco donde guardarlo.", llena: true });
  assert.equal(llevada.portado, true);
  assert.ok(quitar(inv, inv.objetos.find((o) => o.clase === "ultima")!.id).ok && desequipar(inv, llevada.id).ok && ocupados(inv) === 42);
  assert.ok(desequipar(inv, llevada.id).ok, "a thing already in the bag is fine to «put back»");
});

test("La Bolsa galáctica: a full bag with the longest names is stored in pages that each fit S4's key, and reads back exactly", () => {
  const inv = llenaLarga();
  assert.equal(inv.objetos.length, BOLSA_HUECOS, "42 objects, 4 of them carried");
  assert.equal(ocupados(inv), 38);
  for (let i = ocupados(inv); i < BOLSA_HUECOS; i++) dar(inv, { tipo: "reliquia", clase: `x${i}`, nombre: `${"ñ".repeat(19)}${i}`.slice(0, 40), icono: "x".repeat(24), color: "roja", valor: 9999 });
  assert.equal(inv.objetos.length, LIM.reserva);
  const paginas = trocear(inv);
  assert.equal(paginas.length, PAGINAS_MAX);
  for (const p of paginas) assert.ok(new TextEncoder().encode(JSON.stringify(p)).length <= 4096, "a page fits one S4 key");
  assert.equal((paginas[0] as { objetos: unknown[] }).objetos.length, PAGINA);
  assert.deepEqual(juntar((j) => JSON.parse(JSON.stringify(paginas[j] ?? null))), inv, "pages read back exactly");
  // a value written before pages existed (a single `i:<id>` with no `mas`) still reads
  const viejo = nuevoInventario(); dar(viejo, { tipo: "arma", clase: "hoja", nombre: "Hoja" });
  assert.deepEqual(juntar((j) => (j === 0 ? JSON.parse(JSON.stringify(viejo)) : undefined)), viejo);
  assert.deepEqual(juntar(() => undefined), nuevoInventario());
  assert.deepEqual(trocear(nuevoInventario()).length, 1, "an empty bag is one page");
});

/** A memory-only S4 holding `inventario` data, so a test can start with a bag that is already full. */
const memoria = (saved: Saved): FeatureStorage => ({ load: (f) => (f === "inventario" ? saved : null), record: () => {} });
const guardadoDe = (id: string, inv = llenaLarga()): Saved => ({ version: 1, state: [], store: trocear(inv).map((p, j) => [j ? `i:${id}:${j}` : `i:${id}`, p] as [string, unknown]) });

test("La Bolsa galáctica over the plug: the server refuses a new slot («Tu Bolsa está llena (42/42)»), says `huecos`, frees it on drop, and a restart keeps all 46 objects", async () => {
  const k = keeper();
  const W0 = world(); const a0 = W0.add(k); W0.pump(3);
  const id = a0.s.who!.id;
  const inv = llenaLarga();
  for (let i = ocupados(inv); i < BOLSA_HUECOS; i++) dar(inv, { tipo: "reliquia", clase: `x${i}`, nombre: `Reliquia ${i}` });
  const W = world({ storage: memoria(guardadoDe(id, inv)) });
  const a = W.add(k); W.pump(3);
  assert.equal(a.s.who?.id, id);
  assert.equal(a.i.lista().length, LIM.reserva, "42 in the bag + 4 carried arrive");
  assert.deepEqual([a.i.bolsa(), a.i.estado.huecos, a.i.portados().length], [{ ocupados: 42, huecos: 42 }, 42, 4]);
  // the example quest gives a Semilla verde: a NEW slot, the bag is full → refused, nothing lost silently (the log says so)
  W.completar(a);
  assert.equal(a.i.lista().some((o) => o.clase === "semilla"), false);
  assert.equal(a.i.estado.ultimoRechazo, "Tu Bolsa está llena (42/42).");
  assert.equal(a.i.estado.llena, true);
  assert.ok(W.log.some((l) => /no pude dar Semilla verde: Tu Bolsa está llena/.test(l)));
  assert.match(a.s.features.announcements.map((x) => x.text).join("|"), /Tu Bolsa está llena \(42\/42\)/);
  // putting a carried weapon back needs a slot too
  const llevada = a.i.portados()[0];
  a.i.desequipar(llevada.id); W.pump(2);
  assert.match(a.i.estado.ultimoRechazo, /no hay hueco/);
  assert.equal(a.i.portados().length, 4);
  // drop one thing → a slot is free → it fits; the list resets the «llena» mark
  a.i.soltar(a.i.reserva()[0].id); W.pump(2);
  assert.deepEqual([a.i.estado.llena, a.i.bolsa().ocupados], [false, 41]);
  a.i.desequipar(llevada.id); W.pump(2);
  assert.deepEqual([a.i.portados().length, a.i.bolsa().ocupados], [3, 42]);
});

test("La Bolsa galáctica is saved in pages: a smaller bag leaves no stale page behind, and a restart reads it all back", () => {
  const k = keeper();
  const W0 = world(); const a0 = W0.add(k); W0.pump(3); const id = a0.s.who!.id;
  const inv = llenaLarga();
  for (let i = ocupados(inv); i < BOLSA_HUECOS; i++) dar(inv, { tipo: "reliquia", clase: `x${i}`, nombre: `Reliquia ${i}` });
  const saved = guardadoDe(id, inv), claves = new Map(saved.store);
  const disco: FeatureStorage = { load: (f) => (f === "inventario" ? { ...saved, store: [...claves] } : null), record: (_f, _v, op) => { if (op.op === "k") claves.set(op.key, JSON.parse(JSON.stringify(op.value))); else if (op.op === "kd") claves.delete(op.key); } };
  assert.deepEqual([...claves.keys()], [`i:${id}`, `i:${id}:1`, `i:${id}:2`, `i:${id}:3`]);
  const W = world({ storage: disco }); const a = W.add(k); W.pump(3);
  assert.equal(a.i.lista().length, LIM.reserva);
  for (const o of a.i.reserva().slice(0, 40)) { a.i.soltar(o.id); W.pump(12); } // soltar is rate-limited: 2 a second
  assert.equal(a.i.lista().length, LIM.reserva - 40);
  assert.deepEqual([...claves.keys()], [`i:${id}`], "6 objects are one page: the others are deleted");
  // …and what is left reads back, through a second server over the same pages
  const W2 = world({ storage: { load: (f) => (f === "inventario" ? { version: 1, state: [], store: [...claves] } : null), record: () => {} } });
  const b = W2.add(k); W2.pump(3);
  assert.deepEqual(b.i.lista(), a.i.lista());
});

test("the example quest's Semilla verde lands in the inventory of whoever completed it, in every tab of that guest and nobody else's; equip, drop and refusals over the plug", () => {
  const W = world();
  const a = W.add(), b = W.add(), k = a.k;
  W.pump(3);
  assert.deepEqual([a.i.lista(), b.i.lista(), a.i.resumen()], [[], [], { objetos: 0, portados: 0, prestigio: 0 }], "a new guest owns nothing");
  const a2 = W.add(k); W.pump(3); // a second tab of the same guest
  assert.equal(a2.s.who?.id, a.s.who?.id);
  W.completar(a);
  assert.deepEqual(a.m.libro().map((m) => [m.id, m.estado]), [["primeros-pasos", "hecha"]]);
  assert.deepEqual(a.i.lista().map((o) => [o.id, o.tipo, o.clase, o.nombre, o.color, o.valor, o.n, o.portado]), [["o1", "token", "semilla", "Semilla verde", "verde", 1, 1, false]]);
  assert.deepEqual(a2.i.lista(), a.i.lista(), "both tabs of the guest see it");
  assert.deepEqual(b.i.lista(), [], "the other guest does not");
  assert.equal(a.i.estado.ultimoRecibido, "Semilla verde");
  assert.match(a.s.features.announcements.map((x) => x.text).join("|"), /Recibes Semilla verde/);
  assert.equal(a.s.features.log.some((e) => e.feature === "misiones" && e.event === "otorga"), false, "otorga never reaches a page");
  assert.equal(a.i.resumen().prestigio, 1);
  // intents: a token cannot be carried; something you do not own is refused with its reason; drop it and it is gone
  a.i.equipar("o1"); W.pump(2);
  assert.match(a.i.estado.ultimoRechazo, /tokens/);
  a.i.equipar("o7"); W.pump(2);
  assert.match(a.i.estado.ultimoRechazo, /No tienes eso/);
  b.i.soltar("o1"); W.pump(2);
  assert.match(b.i.estado.ultimoRechazo, /No tienes eso/);
  assert.equal(a.i.lista().length, 1, "another guest's intent never touches your Reserva");
  a.i.soltar("o1"); W.pump(2);
  assert.deepEqual([a.i.lista(), a2.i.lista()], [[], []]);
  assert.ok(W.log.every((l) => !/en listen|no pude/.test(l)), W.log.join("\n"));
});

test("the Reserva survives a restart, by guest (I1 + S4), through DATOS_DIR", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "inventario-"));
  const k = keeper(), s1 = new FileStorage(dir);
  const W1 = world({ storage: s1 });
  const a = W1.add(k); W1.pump(3); W1.completar(a);
  assert.equal(a.i.lista().length, 1);
  await s1.flush();
  const W2 = world({ storage: new FileStorage(dir) });
  const again = W2.add(k); W2.pump(3);
  assert.equal(again.s.who?.id, a.s.who?.id);
  assert.deepEqual(again.i.lista(), a.i.lista(), "same Reserva after the restart");
  const other = W2.add(); W2.pump(3);
  assert.equal(other.i.lista().length, 0);
  // a server without the misiones feature still has an inventory, and says once that nobody gives
  const log: string[] = [];
  new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [crearInventario()], log: (l) => log.push(l), identitySign: sign });
  assert.ok(log.some((l) => /listen\('misiones', 'otorga'\)/.test(l)), log.join("\n"));
});

test("the plaza's fingerprint does not move with the inventory (nothing of it touches the simulation)", () => {
  const sin = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [], identitySign: sign });
  const con = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [...crearMisiones({ aventura: EJEMPLO }), crearInventario()], identitySign: sign });
  for (const inst of [sin, con]) { inst.join(0); for (let i = 0; i < 40; i++) inst.tick(); }
  assert.equal(stateHash(con.sim), stateHash(sin.sim));
});

test("per-tick cost: 1,000 players each receive a Reserva of 8 objects on entering (limits: inventario send)", () => {
  const N = 1000, players = Array.from({ length: N }, (_, i) => i);
  const reserva = nuevoInventario();
  for (let i = 0; i < 6; i++) dar(reserva, { tipo: "reliquia", clase: `r${i}`, nombre: `Reliquia ${i}` });
  dar(reserva, { tipo: "arma", clase: "hoja", nombre: "Hoja" }); dar(reserva, { tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde", n: 9 });
  const guardado: Saved = { version: 1, state: [], store: players.map((e) => [`i:g${e}`, reserva]) };
  let enviados = 0;
  const rt = new ServerRuntime([crearInventario({ donantes: [] })], {
    players: () => players, position: () => null, send: () => { enviados++; }, tick: () => 0, log: () => {},
    who: (e) => ({ id: `g${e}`, nombre: `Invitado ${e}` }), storage: { load: (f) => (f === "inventario" ? guardado : null), record: () => {} },
  });
  for (const e of players) rt.join(e);
  const t0 = performance.now();
  for (const e of players) rt.identify(e);
  const ms = performance.now() - t0;
  console.log(`[inventario] 1.000 personas entran con 8 objetos cada una: ${ms.toFixed(1)} ms en total`);
  assert.equal(enviados, N, "one bundle per person (the runtime packs lista + 8 objetos into one send)");
  assert.ok(ms < 500, `${ms} ms for 1,000 entries (they never arrive in one tick)`);
});
