// pesca → inventario (v3): every fish landed goes into the angler's Inventario as an object, decided by the server.
// Pure part: species → object (stack key, rarity colour, value, icon). Rules part: catches stack per species, are
// never carried, survive a hand-edited file, a full Reserva still takes one more of a species you already hold.
// Whole thing over the real plug: a sensible angler lands fish; `captura` says guardado, the Inventario page lists
// the fish with its count; a second fish of the same species stacks; a neighbour's Inventario stays empty; without
// the inventario feature the fish still counts in the cesta and `guardado` is false. The simulation never notices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { pesca } from "../features/pesca/feature.ts";
import { crearPesca, HZ } from "../features/pesca/server.ts";
import type { Pez } from "../features/pesca/server.ts";
import { crearCliente } from "../features/pesca/client.ts";
import { otorgaDeCaptura, COLOR_POR_RAREZA, VALOR_POR_RAREZA, ICONO_PEZ } from "../features/pesca/otorga.ts";
import { inventario } from "../features/inventario/feature.ts";
import { crearInventario, DONANTES } from "../features/inventario/server.ts";
import { crearCliente as crearClienteInventario } from "../features/inventario/client.ts";
import { COLORES, LIM, TIPOS, dar, equipar, leerInventario, nuevoInventario, quitar } from "../features/inventario/reglas.ts";
import tabla from "../features/pesca/peces.json" with { type: "json" };
import { notaDePescado } from "../apps/plaza/pesca.ts";
import { detalleDeCaptura, RAREZA_DE_COLOR } from "../apps/plaza/inventario.ts";

const PECES = (tabla as { peces: Pez[] }).peces;
const SITIO = { id: "estanque", nombre: "Estanque", x: 10, z: 0, y: 0, radio: 3 };
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x: string) => { t = x; } }; };

test("otorgaDeCaptura: each species of the table becomes a stackable object with its rarity colour, value and the fish icon", () => {
  const vistos = new Set<string>();
  for (const p of PECES) {
    const o = otorgaDeCaptura(7, p);
    assert.deepEqual(o, { quien: 7, tipo: "captura", clase: p.id, nombre: p.nombre, icono: "fish", color: COLOR_POR_RAREZA[p.rareza], valor: VALOR_POR_RAREZA[p.rareza], n: 1 });
    assert.ok(TIPOS.includes(o.tipo) && COLORES.includes(o.color), "inside inventario's vocabulary");
    assert.ok(new TextEncoder().encode(o.clase).length <= LIM.clase && new TextEncoder().encode(o.nombre).length <= LIM.nombre && o.icono.length <= LIM.icono);
    assert.ok(!vistos.has(o.clase), "one stack key per species"); vistos.add(o.clase);
  }
  assert.equal(ICONO_PEZ, "fish");
  assert.ok(VALOR_POR_RAREZA.comun < VALOR_POR_RAREZA.rara && VALOR_POR_RAREZA.rara < VALOR_POR_RAREZA.legendaria, "the rarer, the more it is worth");
  assert.deepEqual(Object.values(COLOR_POR_RAREZA), ["plateada", "azul", "dorada"]);
  assert.equal(otorgaDeCaptura(1, { id: "x".repeat(50), nombre: "Raro", rareza: "rara" }).clase.length, 32, "a long id never breaks the schema");
  assert.ok(DONANTES.some(([f, ev]) => f === "pesca" && ev === "otorga"), "inventario listens to pesca");
  // the panel reads the rarity from the colour: it must agree with what pesca writes
  for (const r of ["comun", "rara", "legendaria"] as const) assert.equal(RAREZA_DE_COLOR[COLOR_POR_RAREZA[r]], { comun: "común", rara: "rara", legendaria: "legendaria" }[r]);
  assert.equal(detalleDeCaptura({ color: "azul" }), "pez · rara");
});

test("reglas: catches stack per species and colour, never carried, kept over a hand-edited file; a full Reserva takes one more of a species you hold", () => {
  const inv = nuevoInventario();
  const carpa = otorgaDeCaptura(0, PECES[0]), trucha = otorgaDeCaptura(0, PECES[1]);
  const a = dar(inv, carpa), b = dar(inv, carpa), c = dar(inv, trucha);
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(inv.objetos.length, 2, "two carp are one line");
  assert.deepEqual(inv.objetos.map((o) => [o.nombre, o.n, o.tipo, o.icono]), [[PECES[0].nombre, 2, "captura", "fish"], [PECES[1].nombre, 1, "captura", "fish"]]);
  assert.equal(inv.objetos[0].valor, VALOR_POR_RAREZA[PECES[0].rareza]);
  // same species, other rarity colour = other stack (a rare carp is not a common carp)
  dar(inv, { ...carpa, color: "dorada" });
  assert.equal(inv.objetos.length, 3);
  // never carried
  const r = equipar(inv, inv.objetos[0].id);
  assert.ok(!r.ok && /peces/.test(r.motivo));
  // a hand-edited file cannot carry a fish or give it a weapon's count of 1
  const leido = leerInventario({ v: 1, serie: 1, objetos: [{ id: "o1", tipo: "captura", clase: "carpa", nombre: "Carpa", icono: "fish", color: "plateada", valor: 1, n: 5, portado: true }] });
  assert.deepEqual([leido.objetos[0].n, leido.objetos[0].portado], [5, false]);
  // dropping units of a stack
  assert.ok(quitar(inv, inv.objetos[0].id, 1).ok);
  assert.equal(inv.objetos[0].n, 1);
  // a full Reserva: a new species is refused, one more of a species you already hold is taken (it stacks, it takes no slot)
  const llena = nuevoInventario();
  for (let i = 0; i < LIM.reserva - 1; i++) dar(llena, { tipo: "arma", clase: "arma", nombre: `Arma ${i}` });
  assert.ok(dar(llena, carpa).ok);
  assert.equal(llena.objetos.length, LIM.reserva);
  assert.ok(!dar(llena, trucha).ok, "no slot for a new species");
  assert.ok(dar(llena, carpa).ok && llena.objetos.at(-1)!.n === 2, "but the carp you hold stacks");
});

test("notaDePescado: «A tu Inventario» when the server kept it (with the count once there are several), the old basket line when not", () => {
  assert.equal(notaDePescado({ pez: "Carpa", rareza: "comun", guardado: true }, 4, 1), "común · A tu Inventario");
  assert.equal(notaDePescado({ pez: "Carpa", rareza: "comun", guardado: true }, 4, 3), "común · A tu Inventario (× 3)");
  assert.equal(notaDePescado({ pez: "Trucha", rareza: "rara", guardado: false }, 4), "rara · En tu cesta: 4");
});

/** A headless pond with the real pesca and (optionally) the real inventario; each page has both controllers. */
function mundo(opts: { conInventario?: boolean; n?: number; semilla?: number } = {}) {
  const log: string[] = [];
  const features = [crearPesca({ sitios: [SITIO], semilla: opts.semilla ?? 7 }), ...(opts.conInventario === false ? [] : [crearInventario()])];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features, log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: opts.n ?? 2 }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), pc = crearCliente((event, msg) => eventos.push({ event, msg })), ic = crearClienteInventario();
    const s = new ClientSession(t, { features: [...pc.parts, ...ic.parts], identity: keeper(), view: { label() {}, bounce() {} } });
    return { t, s, p: pc.pesca, i: ic.inventario, eventos };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  /** Cast, wait for the bite, hook and play the one-button fight like a sensible person until it ends. */
  const pescar = (c: (typeof pages)[number]) => {
    c.p.lanzar(); pump();
    let n = 0;
    while (c.p.estado().fase !== "picada" && n++ < 20 * HZ) pump();
    pump(4);
    c.p.recoger(true);
    n = 0;
    while (c.p.estado().fase !== "nada" && n++ < 60 * HZ) {
      const e = c.p.estado();
      if (e.fase === "pelea") { if (e.tension > 65 && e.recogiendo) c.p.recoger(false); else if (e.tension < 35 && !e.recogiendo) c.p.recoger(true); }
      pump();
    }
    pump(4);
  };
  return { inst, pages, pump, place, evs, pescar, log };
}

test("pesca → inventario over the real plug: the fish is in the angler's Inventario (server-decided), stacks, and nobody else's changes", () => {
  const W = mundo();
  const [A, B] = W.pages;
  W.pump(2);
  W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2);
  W.pump(12);
  assert.deepEqual([A.i.lista(), B.i.lista()], [[], []]);
  assert.ok(DONANTES.some(([f]) => f === "pesca") && inventario.issues.length === 0 && pesca.issues.length === 0);

  W.pescar(A);
  const c1 = W.evs(A, "captura");
  assert.equal(c1.length, 1, `escape: ${JSON.stringify(W.evs(A, "escape"))}`);
  assert.equal(c1[0].guardado, true, "the server says it kept the fish");
  const sp = PECES.find((p) => p.nombre === c1[0].pez)!;
  const lista = A.i.lista();
  assert.equal(lista.length, 1);
  assert.deepEqual(
    { tipo: lista[0].tipo, clase: lista[0].clase, nombre: lista[0].nombre, icono: lista[0].icono, color: lista[0].color, valor: lista[0].valor, n: lista[0].n, portado: lista[0].portado },
    { tipo: "captura", clase: sp.id, nombre: sp.nombre, icono: "fish", color: COLOR_POR_RAREZA[sp.rareza], valor: VALOR_POR_RAREZA[sp.rareza], n: 1, portado: false });
  assert.equal(A.i.estado.ultimoRecibido, sp.nombre);
  assert.ok(A.s.features.announcements.some((a) => a.feature === "inventario" && a.text === `Recibes ${sp.nombre}.`), "the house announces it");
  assert.equal(A.p.estado().ultimo?.guardado, true);
  assert.equal(A.p.estado().cesta.peces, 1, "the cesta still counts (stats keep working)");
  assert.equal(A.i.resumen().prestigio, 0, "a fish is not a Semilla: no Prestigio");
  assert.deepEqual(B.i.lista(), [], "a neighbour keeps nothing");
  assert.equal(W.evs(B, "captura").length, 0);
  assert.equal(B.s.features.announcements.some((a) => a.feature === "inventario"), false);
  assert.ok(W.log.every((l) => !/en listen|no pude|no cumple/.test(l)), W.log.join("\n"));

  // the same angler lands a second fish: a seeded world gives species by weight; whatever it is, the total adds up and the same species stacks
  W.pescar(A);
  W.pescar(A);
  const todas = W.evs(A, "captura");
  assert.equal(todas.length, 3, `escapes: ${JSON.stringify(W.evs(A, "escape"))}`);
  const lleva = new Map<string, number>();
  for (const m of todas) lleva.set(String(m.pez), (lleva.get(String(m.pez)) ?? 0) + 1);
  const ahora = A.i.lista();
  assert.equal(ahora.length, lleva.size, "one line per species");
  for (const o of ahora) assert.equal(o.n, lleva.get(o.nombre), `${o.nombre} stacks`);
  assert.equal(ahora.reduce((s, o) => s + o.n, 0), 3);
  assert.equal(A.p.estado().cesta.peces, 3);
  assert.ok(ahora.every((o) => !o.portado), "none of them is carried");
  // equipping a fish is refused by the server too
  A.i.equipar(ahora[0].id); W.pump(2);
  assert.match(A.i.estado.ultimoRechazo, /peces/);
});

test("pesca without inventario: the fish still counts in the cesta, `guardado` is false, nothing breaks", () => {
  const W = mundo({ conInventario: false, n: 1 });
  const [A] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.pump(12);
  W.pescar(A);
  const c = W.evs(A, "captura");
  assert.equal(c.length, 1, `escape: ${JSON.stringify(W.evs(A, "escape"))}`);
  assert.equal(c[0].guardado, false);
  assert.equal(A.p.estado().ultimo?.guardado, false);
  assert.equal(A.p.estado().cesta.peces, 1);
  assert.deepEqual(A.i.lista(), []);
  assert.equal(notaDePescado(A.p.estado().ultimo!, A.p.estado().cesta.peces), `${{ comun: "común", rara: "rara", legendaria: "legendaria" }[String(c[0].rareza) as "comun"]} · En tu cesta: 1`);
});

test("the simulation's fingerprint does not move with pesca → inventario", () => {
  const sin = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [], identitySign: sign });
  const con = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [crearPesca({ sitios: [SITIO] }), crearInventario()], identitySign: sign });
  for (const inst of [sin, con]) { inst.join(0); for (let i = 0; i < 40; i++) inst.tick(); }
  assert.equal(con.hash(), sin.hash());
});
