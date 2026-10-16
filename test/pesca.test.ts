// pesca v1: the whole cycle headless (in-memory world, two pages, pump by 20 Hz ticks). The server decides everything:
// the bite happens inside the declared wait, missing the window loses the fish, the fight raises and lowers tension with
// one button, a sensible angler lands a fish of the table and it is written down per guest; a page without a bite
// cannot catch anything; the simulation never notices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { pesca, ESPERA_S, VENTANA_S, PELEA } from "../features/pesca/feature.ts";
import { crearPesca, tirarPez, pasoPelea, HZ } from "../features/pesca/server.ts";
import type { Pez } from "../features/pesca/server.ts";
import { crearCliente, cmTexto } from "../features/pesca/client.ts";
import tabla from "../features/pesca/peces.json" with { type: "json" };
import funciones from "../features/servidor.ts";
import clientes from "../features/cliente.ts";

const PECES = (tabla as { peces: Pez[] }).peces;
const SITIO = { id: "estanque", nombre: "Estanque", x: 10, z: 0, y: 0, radio: 3 };
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A headless pond: the pesca server with a known seed, n pages each with its own controller, a pump by ticks. */
function mundo(n = 2, semilla = 7, opts: { sinPesca?: boolean } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: opts.sinPesca ? [] : [crearPesca({ sitios: [SITIO], semilla })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), cli = crearCliente((event, msg) => eventos.push({ event, msg })), seen: string[] = [], k = keeper();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label: (e, text) => seen.push(`label ${e} ${text}`), bounce: (e) => seen.push(`bounce ${e}`) } });
    return { t, s, p: cli.pesca, seen, eventos, k };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  return { inst, pages, pump, place, evs, log };
}
/** Pump until the page reaches `fase` (or `max` ticks pass); returns the ticks it took. */
function hasta(W: ReturnType<typeof mundo>, c: ReturnType<typeof mundo>["pages"][number], fase: string, max: number): number {
  let n = 0;
  while (c.p.estado().fase !== fase && n < max) { W.pump(); n++; }
  return n;
}

test("pesca: the declaration meets the plug's rules and is in both lists; the fish table is sane", () => {
  assert.deepEqual(pesca.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "pesca") && clientes.some((f) => f.feature.id === "pesca"));
  assert.ok(PECES.length >= 1 && PECES.length <= 3 && PECES.some((p) => p.rareza === "comun"));
  for (const p of PECES) assert.ok(p.cm[0] < p.cm[1] && p.peso > 0 && p.fuerza > 0 && p.heft > 0);
});

test("pesca: tirarPez is deterministic from the seed, respects the table (sizes inside, common fish most often)", () => {
  const a = tirarPez(new Uint32Array([42]), PECES), b = tirarPez(new Uint32Array([42]), PECES);
  assert.deepEqual(a, b);
  const rng = new Uint32Array([3]), cuenta: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) {
    const p = tirarPez(rng, PECES);
    const sp = PECES.find((x) => x.id === p.id)!;
    assert.ok(p.cm >= sp.cm[0] && p.cm <= sp.cm[1], `${p.id} ${p.cm} cm`);
    cuenta[p.id] = (cuenta[p.id] ?? 0) + 1;
  }
  assert.ok(cuenta.carpa > cuenta.trucha && cuenta.trucha > (cuenta.lucio ?? 0), JSON.stringify(cuenta));
});

test("pesca: the fight, pure: reeling raises tension and progress, resting lowers both; 100 tension breaks the line; a sensible angler lands the common fish in 8-25 s", () => {
  const pez = { ...PECES[0], cm: 40, fuerza: PECES[0].fuerza };
  const nuevo = () => ({ pez, tension: PELEA.tensionInicial, progreso: PELEA.progresoInicial, recogiendo: true, t: 0, arrancada: "no" as const, proxima: 99, dura: 0 });
  const f = nuevo();
  for (let i = 0; i < 10; i++) assert.equal(pasoPelea(f, 1 / HZ), null);
  assert.ok(f.tension > PELEA.tensionInicial && f.progreso > PELEA.progresoInicial);
  const t1 = f.tension, p1 = f.progreso;
  f.recogiendo = false;
  for (let i = 0; i < 10; i++) assert.equal(pasoPelea(f, 1 / HZ), null);
  assert.ok(f.tension < t1 && f.progreso < p1);
  // hold forever: the line snaps before the fish is in
  const g = nuevo(); let fin: string | null = null, n = 0;
  while (!fin && n++ < 2000) fin = pasoPelea(g, 1 / HZ);
  assert.equal(fin, "rota");
  // never reel: the fish slips away after the grace time
  const h = nuevo(); h.recogiendo = false; fin = null; n = 0;
  while (!fin && n++ < 2000) fin = pasoPelea(h, 1 / HZ);
  assert.equal(fin, "escapa");
  // reel under 65 %, rest over 35 % (what a person does watching the bar): a catch in a sensible time
  const s = nuevo(); fin = null; n = 0;
  while (!fin && n++ < 5000) { if (s.tension > 65) s.recogiendo = false; else if (s.tension < 35) s.recogiendo = true; fin = pasoPelea(s, 1 / HZ); }
  assert.equal(fin, "captura");
  assert.ok(s.t >= 8 && s.t <= 25, `la pelea duró ${s.t.toFixed(1)} s`);
});

test("pesca: cast → (nibble) → bite inside the declared wait; both pages see the float; the spot is taken meanwhile; the same seed gives the same bite tick", () => {
  const corre = (semilla: number) => {
    const W = mundo(2, semilla);
    const [A, B] = W.pages;
    W.pump(2);
    W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2);
    W.pump(12); // the area of interest refreshes every 10 ticks: both now hold the spot
    assert.deepEqual(A.p.sitios().map((s) => [s.id, s.nombre, s.ocupado]), [["estanque", "Estanque", false]]);
    assert.ok(A.p.ofrece("pesca", "estanque"));
    assert.equal(A.p.lanzar().ok, true);
    W.pump();
    assert.equal(A.p.estado().fase, "espera");
    assert.deepEqual(B.p.flotadores(), [{ quien: A.s.entity, sitio: "estanque", x: 10, y: 0, z: 0 }]);
    assert.equal(A.p.sitios()[0].ocupado, true);
    assert.equal(A.p.ofrece("pesca", "estanque"), false);
    const t = hasta(W, A, "picada", ESPERA_S[1] * HZ + 5) + 1;
    assert.equal(A.p.estado().fase, "picada");
    assert.ok(t >= ESPERA_S[0] * HZ && t <= ESPERA_S[1] * HZ, `picada a los ${t} ticks`);
    const mordisqueos = W.evs(A, "mordisqueo");
    if (mordisqueos.length) assert.ok(A.eventos.findIndex((e) => e.event === "mordisqueo") < A.eventos.findIndex((e) => e.event === "picada"));
    assert.equal(W.evs(B, "picada").length, 0, "the bite is only the angler's");
    assert.ok(W.inst.features.catalog.features.some((f) => f.id === "pesca"));
    return { t, ventana: A.p.estado().ventana, mordisqueos: mordisqueos.length };
  };
  assert.deepEqual(corre(7), corre(7));
  assert.ok(corre(7).ventana <= VENTANA_S && corre(7).ventana >= VENTANA_S * 0.75);
});

test("pesca: not reeling inside the window = the fish leaves (tarde), the spot is free again and the float goes", () => {
  const W = mundo(2);
  const [A, B] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2); W.pump(12);
  A.p.lanzar(); W.pump();
  hasta(W, A, "picada", 300);
  W.pump(Math.round(VENTANA_S * HZ) + 3);
  assert.equal(A.p.estado().fase, "nada");
  assert.deepEqual(W.evs(A, "escape").map((m) => m.motivo), ["tarde"]);
  assert.match(A.p.estado().aviso, /tardaste/);
  assert.deepEqual(W.evs(B, "fin"), [{ quien: A.s.entity, sitio: "estanque", resultado: "escape", pez: "", cm: 0, rareza: "comun" }]);
  assert.deepEqual(B.p.flotadores(), []);
  assert.equal(A.p.sitios()[0].ocupado, false);
  assert.equal(W.evs(A, "captura").length, 0);
});

test("pesca: hooking in the window starts the fight; holding raises tension, letting go lowers it; holding on breaks the line", () => {
  const W = mundo(1);
  const [A] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.pump(12);
  A.p.lanzar(); W.pump();
  hasta(W, A, "picada", 300);
  W.pump(5); // 0.25 s of human reaction
  assert.equal(A.p.recoger(true).ok, true);
  W.pump(2);
  assert.equal(A.p.estado().fase, "pelea");
  assert.ok(PECES.some((p) => p.nombre === A.p.estado().pez));
  W.pump(20);
  const t1 = A.p.estado().tension, p1 = A.p.estado().progreso;
  assert.ok(t1 > PELEA.tensionInicial && p1 > PELEA.progresoInicial, `tension ${t1} progreso ${p1}`);
  A.p.recoger(false); W.pump(20);
  assert.ok(A.p.estado().tension < t1, "resting lowers tension");
  assert.ok(W.evs(A, "tension").length >= 15, "state ~10 times a second");
  A.p.recoger(true); W.pump(200);
  assert.equal(A.p.estado().fase, "nada");
  assert.deepEqual(W.evs(A, "escape").map((m) => m.motivo), ["rota"]);
  assert.equal(W.evs(A, "captura").length, 0);
});

test("pesca: a sensible angler lands a fish of the table; it is written down per guest (store, cesta) and announced «Has pescado»; the simulation never notices", () => {
  const W = mundo(2), plain = mundo(2, 7, { sinPesca: true });
  const [A, B] = W.pages;
  W.pump(2); plain.pump(2);
  W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2); plain.place(0, 8, 0); plain.place(1, 12, 2);
  W.pump(12); plain.pump(12);
  assert.ok(A.s.who && B.s.who, "guests identified");
  assert.deepEqual(A.p.estado().cesta, { peces: 0, clases: 0, mejor: "", mejorCm: 0 });
  A.p.lanzar(); W.pump(); plain.pump();
  const t = hasta(W, A, "picada", 300); plain.pump(t);
  W.pump(4); plain.pump(4);
  A.p.recoger(true);
  let n = 0;
  while (A.p.estado().fase !== "nada" && n++ < 60 * HZ) {
    const e = A.p.estado();
    if (e.fase === "pelea") { if (e.tension > 65 && e.recogiendo) A.p.recoger(false); else if (e.tension < 35 && !e.recogiendo) A.p.recoger(true); }
    W.pump(); plain.pump();
  }
  const c = W.evs(A, "captura");
  assert.equal(c.length, 1, `escape: ${JSON.stringify(W.evs(A, "escape"))}`);
  const sp = PECES.find((p) => p.nombre === c[0].pez)!;
  assert.ok(sp && Number(c[0].cm) >= sp.cm[0] && Number(c[0].cm) <= sp.cm[1] && c[0].rareza === sp.rareza && c[0].total === 1);
  assert.ok(n / HZ >= 6 && n / HZ <= 30, `la pelea duró ${(n / HZ).toFixed(1)} s`);
  assert.match(A.p.estado().aviso, /^Has pescado: /);
  assert.ok(A.seen.some((s) => s.startsWith(`label ${A.s.entity} 🐟 ${sp.nombre}`)));
  assert.ok(A.s.features.announcements.some((a) => a.feature === "pesca" && a.text.startsWith("Has pescado: ") && a.sound === "exito"));
  assert.deepEqual(A.p.estado().cesta, { peces: 1, clases: 1, mejor: sp.nombre, mejorCm: Number(c[0].cm) });
  assert.deepEqual(W.evs(B, "fin").at(-1), { quien: A.s.entity, sitio: "estanque", resultado: "captura", pez: sp.nombre, cm: Number(c[0].cm), rareza: sp.rareza });
  assert.equal(W.evs(B, "captura").length, 0);
  assert.equal(A.p.sitios()[0].ocupado, false);
  assert.equal(W.inst.hash(), plain.inst.hash(), "features must never change the simulation");
  // the store, per guest: another visit of the same guest gets the basket back
  const cli2 = crearCliente(), t5 = W.inst.join(5);
  new ClientSession(t5, { features: cli2.parts, identity: A.k, view: { label() {}, bounce() {} } });
  for (let i = 0; i < 6; i++) { t5.flush(); W.pump(); t5.flush(); }
  assert.equal(cli2.pesca.estado().cesta.peces, 1, "the basket comes back on the next visit");
});

test("pesca: no bite, no fish: reeling without fishing, casting from afar, casting on a taken spot, two casts at once are refused; soltar brings the rod back", () => {
  const W = mundo(2);
  const [A, B] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 40, 0); W.pump(12);
  assert.equal(B.p.recoger(true).ok, false);          // the page already knows it is not fishing
  assert.equal(B.s.features.send("pesca", "recoger", { activo: true }).ok, true); // straight to the wire, as a rogue agent would
  assert.equal(B.s.features.send("pesca", "lanzar", { sitio: "estanque" }).ok, true);
  W.pump(2);
  assert.deepEqual(W.evs(B, "rechazado").map((m) => String(m.motivo).split(":")[0]), ["No estás pescando", "Acércate al agua para pescar en Estanque."]);
  A.p.lanzar(); W.pump();
  assert.equal(A.p.lanzar("estanque").ok, true); W.pump();
  assert.match(String(W.evs(A, "rechazado").at(-1)?.motivo), /Ya estás pescando/);
  W.place(B.s.entity, 12, 0); W.pump(12);
  assert.equal(B.p.lanzar().ok, false, "the page sees the spot is taken");
  B.p.lanzar("estanque"); W.pump();
  assert.match(String(W.evs(B, "rechazado").at(-1)?.motivo), /ya pesca alguien/);
  for (let i = 0; i < 400; i++) { B.s.features.send("pesca", "recoger", { activo: true }); W.pump(); if (A.p.estado().fase === "nada") break; }
  assert.equal(W.evs(B, "captura").length + W.evs(B, "pelea").length, 0);
  // soltar while waiting: the rod comes back with nothing, the spot is free
  A.p.lanzar(); W.pump(3);
  assert.equal(A.p.estado().fase, "espera");
  assert.equal(A.p.soltar().ok, true); W.pump();
  assert.equal(A.p.estado().fase, "nada");
  assert.equal(A.p.estado().aviso, "Has recogido la caña.");
  assert.equal(W.evs(B, "fin").at(-1)?.resultado, "suelto");
  assert.equal(A.p.sitios()[0].ocupado, false);
  // walking away from the water loses the fish
  A.p.lanzar(); W.pump(3); W.place(A.s.entity, 30, 0); W.pump(12);
  assert.equal(A.p.estado().fase, "nada");
  assert.equal(W.evs(A, "escape").at(-1)?.motivo, "lejos");
});

test("pesca v2: the catch reaches whoever is near with the fish (fin: pez, cm, rareza); both pages hold it «in the hand» (capturas) for a while and label the angler; a far guest gets nothing", () => {
  const W = mundo(3);
  const [A, B, C] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2); W.place(C.s.entity, 200, 0); W.pump(12);
  A.p.lanzar(); W.pump();
  hasta(W, A, "picada", 300); W.pump(4);
  A.p.recoger(true);
  let n = 0;
  while (A.p.estado().fase !== "nada" && n++ < 60 * HZ) {
    const e = A.p.estado();
    if (e.fase === "pelea") { if (e.tension > 65 && e.recogiendo) A.p.recoger(false); else if (e.tension < 35 && !e.recogiendo) A.p.recoger(true); }
    W.pump();
  }
  const c = W.evs(A, "captura");
  assert.equal(c.length, 1, `escape: ${JSON.stringify(W.evs(A, "escape"))}`);
  const fin = W.evs(B, "fin").at(-1)!;
  assert.deepEqual(fin, { quien: A.s.entity, sitio: "estanque", resultado: "captura", pez: c[0].pez, cm: c[0].cm, rareza: c[0].rareza });
  assert.deepEqual(W.evs(A, "fin").at(-1), fin, "the angler's own fin says the same");
  assert.equal(W.evs(C, "fin").length + W.evs(C, "lanzado").length, 0, "200 m away: nothing");
  // both pages keep the fish in the angler's hand (the 3D draws it there) and label it «🐟 Carpa · 23,4 cm»
  for (const P of [A, B]) {
    const en = P.p.capturas();
    assert.equal(en.length, 1);
    assert.equal(en[0].quien, A.s.entity); assert.equal(en[0].pez, c[0].pez); assert.equal(en[0].cm, Math.round(Number(c[0].cm) * 10) / 10); assert.equal(en[0].rareza, c[0].rareza);
    assert.ok(P.seen.some((s) => s === `label ${A.s.entity} 🐟 ${c[0].pez} · ${cmTexto(Number(c[0].cm))}`), P.seen.join(" | "));
  }
  assert.equal(C.p.capturas().length, 0);
  // an escape or letting go carries no fish
  A.p.lanzar(); W.pump(3); A.p.soltar(); W.pump();
  assert.deepEqual(W.evs(B, "fin").at(-1), { quien: A.s.entity, sitio: "estanque", resultado: "suelto", pez: "", cm: 0, rareza: "comun" });
  assert.equal(B.p.capturas().length, 1, "the fish of before is still in the hand");
  // the hand empties after EN_MANO_MS (the page's clock)
  B.p.olvidar(0);
  assert.equal(B.p.capturas().length, 0);
});
