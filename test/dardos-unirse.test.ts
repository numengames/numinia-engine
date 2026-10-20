// dardos: the way in from afar (R4). What the page offers (the chip «Dardos: jugar en <diana>» and its state) is pure; what the
// server lets through is checked with a real instance: a `remoto` board is known to everybody wherever they stand and joins
// from far away (`desde: pared` = AR, `desde: lejos` = a flat screen), a board without `remoto` is neither seen from far nor
// joinable from far, and the player at the throwing line still joins without saying `desde`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearDardos } from "../features/dardos/server.ts";
import { crearCliente } from "../features/dardos/client.ts";
import { entradas, estadoEntrada, estaLejos, tituloEntrada, CERCA_EXTRA_M } from "../apps/plaza/dardos-unirse.ts";
import type { SitioU } from "../apps/plaza/dardos-unirse.ts";
import { elegirSitioAR } from "../apps/plaza/dardos-duelo.ts";

const s = (id: string, o: Partial<SitioU> = {}): SitioU => ({ id, nombre: `Diana ${id}`, x: 10, z: 0, radio: 3, ocupado: false, ...o });

test("estadoEntrada: free, somebody waiting, full, a live match, and a single-throw board", () => {
  assert.deepEqual(estadoEntrada(s("a", { duelo: true })), { texto: "Libre · sé el primero", libre: true });
  assert.deepEqual(estadoEntrada(s("a", { duelo: true, espera: true, jugadores: 1 })), { texto: "Esperando rival · 1/2", libre: true });
  assert.deepEqual(estadoEntrada(s("a", { duelo: true, espera: true, jugadores: 2, equipos: 3 })), { texto: "Esperando jugadores · 2/3", libre: true });
  assert.deepEqual(estadoEntrada(s("a", { duelo: true, espera: true, jugadores: 3, equipos: 3 })), { texto: "Completa · va a empezar", libre: false });
  assert.deepEqual(estadoEntrada(s("a", { duelo: true, ocupado: true, jugadores: 2 })), { texto: "Partida en marcha", libre: false });
  assert.deepEqual(estadoEntrada(s("a", { duelo: true, equipos: 4 })), { texto: "Libre · hasta 4 jugadores", libre: true });
  assert.deepEqual(estadoEntrada(s("a")), { texto: "Libre", libre: true });
  assert.deepEqual(estadoEntrada(s("a", { ocupado: true })), { texto: "Alguien está tirando", libre: false });
});

test("entradas: only `remoto` boards, never the one you stand at, the waiting ones first, the busy ones last", () => {
  const lista = [
    s("ocupada", { remoto: true, duelo: true, ocupado: true }), s("cerrada", { duelo: true }), s("libre", { remoto: true, duelo: true, x: 50 }),
    s("espera", { remoto: true, duelo: true, espera: true, jugadores: 1, x: 90 }),
  ];
  assert.deepEqual(entradas(lista, { x: -30, z: 0 }).map((e) => e.id), ["espera", "libre", "ocupada"]);
  assert.equal(entradas(lista, { x: -30, z: 0 })[0].titulo, "Dardos: jugar en Diana espera");
  assert.deepEqual(entradas(lista, null).map((e) => e.id), ["espera", "libre", "ocupada"], "unknown position: all of them");
  // standing on the throwing line of «ocupada» (10, 0, radio 3): its E prompt is there, no chip for it
  assert.deepEqual(entradas(lista, { x: 10 + 3, z: 0 }).map((e) => e.id), ["espera", "libre"]);
  assert.deepEqual(entradas(lista, { x: 10 + 3 + CERCA_EXTRA_M + 0.1, z: 0 }).map((e) => e.id), ["espera", "libre", "ocupada"]);
  assert.deepEqual(entradas([s("sola")], null), [], "a board without `remoto` is never offered");
  assert.equal(tituloEntrada(""), "Dardos: jugar en la diana");
});

test("estaLejos: beyond the throwing line (+ a little) or at an unknown place", () => {
  const b = { x: 10, z: 0, radio: 3 };
  assert.equal(estaLejos(b, { x: 12, z: 0 }), false); assert.equal(estaLejos(b, { x: 40, z: 0 }), true); assert.equal(estaLejos(b, null), true);
});

test("elegirSitioAR: the board picked in the lobby wins; a stale pick falls back to the usual choice", () => {
  const l = [s("uno", { duelo: true, remoto: true }), s("dos", { duelo: true, remoto: true }), s("tres", { duelo: true, remoto: true, espera: true })];
  assert.equal(elegirSitioAR(l)?.id, "tres");
  assert.equal(elegirSitioAR(l, "dos")?.id, "dos");
  assert.equal(elegirSitioAR(l, "no-existe")?.id, "tres");
  assert.equal(elegirSitioAR([s("uno", { duelo: true }), s("dos", { duelo: true, remoto: true })], "uno")?.id, "dos", "a board that does not take remote players cannot be picked");
});

// ---- with a real server ----
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const SITIOS = [
  { id: "torre", nombre: "Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true },
  { id: "cerrada", nombre: "Cerrada", x: 10, z: 40, y: 0, radio: 3, duelo: true },
  { id: "suelta", nombre: "Suelta", x: 10, z: 80, y: 0, radio: 3, remoto: true },
];
function mundo(n = 3) {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: SITIOS })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => { const t = inst.join(i), cli = crearCliente(); return { t, s: new ClientSession(t, { identity: keeper(), features: cli.parts }), d: cli.dardos }; });
  const pump = (k = 1) => { for (let i = 0; i < k; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const poner = (i: number, x: number, z: number) => { inst.sim.tf.cols.x[pages[i].s.entity] = fx(x); inst.sim.tf.cols.z[pages[i].s.entity] = fx(z); };
  pump(2);
  return { pages, pump, poner };
}

test("a `remoto` board is known to a player far from it (past ALCANCE_M); the other boards only to who is near", () => {
  const { pages: [A, B], pump, poner } = mundo(2);
  poner(0, 8, 0); poner(1, 1500, 1500); pump(12);
  assert.deepEqual(A.d.sitios().map((x) => x.id).sort(), ["cerrada", "suelta", "torre"], "A, at the line, knows the boards within ALCANCE_M and the remote ones");
  assert.deepEqual(B.d.sitios().map((x) => x.id).sort(), ["suelta", "torre"], "B at 2 km knows the remote boards and only those");
  const t = B.d.sitios().find((x) => x.id === "torre")!;
  assert.deepEqual([t.duelo, t.remoto, t.espera, t.jugadores, t.nombre], [true, true, false, 0, "Torre"]);
  // the chip's state follows the board for the far player
  A.d.jugar("torre"); pump(3);
  assert.equal(B.d.sitios().find((x) => x.id === "torre")!.espera, true);
  assert.equal(entradas(B.d.sitios() as never, { x: 1500, z: 1500 }).find((e) => e.id === "torre")?.estado, "Esperando rival · 1/2");
});

test("joining: the player at the line needs no `desde` on a remote board; far away, `lejos` (screen) and `pared` (AR) join and are told apart", () => {
  const { pages: [A, B, C], pump, poner } = mundo(3);
  poner(0, 8, 0); poner(1, 1500, 0); poner(2, -900, 0); pump(12);
  // far away without saying `desde`: «Acércate»
  assert.equal(C.d.jugar("torre").ok, true); pump(3);
  assert.match(C.d.estado().aviso, /Acércate/); assert.equal(C.d.duelo(), null);
  // the host at the line (no `desde`: `api.within` reads the board's place although the board is global)
  assert.equal(A.d.jugar("torre").ok, true); pump(3);
  assert.equal(A.d.duelo()?.esperando, true, "the host sat down at the line");
  // a flat-screen player far away joins with `lejos`: the match starts and nobody says he is on a wall
  assert.equal(B.d.jugar("torre", "lejos").ok, true); pump(4);
  const d = A.d.duelo()!;
  assert.equal(d.esperando, false); assert.equal(d.a.pared ?? false, false); assert.equal(d.b?.pared ?? false, false, "`lejos` is not a wall");
  assert.equal(B.d.duelo()?.yo, true); assert.equal(B.d.duelo()?.miTurno, false);
  // a third, on a wall, is turned away (the duel is full) but the way in was accepted
  C.d.jugar("torre", "pared"); pump(3);
  assert.match(C.d.estado().aviso, /en marcha|completa/i);
});

test("a wall (AR) is still marked as a wall", () => {
  const { pages: [A, B], pump, poner } = mundo(2);
  poner(0, 8, 0); poner(1, 1500, 0); pump(12);
  B.d.jugar("torre", "pared"); pump(3); A.d.jugar("torre"); pump(4);
  const d = A.d.duelo()!; const b = d.a.entity === B.s.entity ? d.a : d.b!;
  assert.equal(b.pared, true); assert.equal((d.a.entity === A.s.entity ? d.a : d.b!).pared ?? false, false);
});

test("`lejos` and `pared` on a board without `remoto` are refused; a single-throw `remoto` board takes a far player for a turn", () => {
  const { pages: [A, B], pump, poner } = mundo(2);
  poner(0, 8, 0); poner(1, 12, 40); pump(12); // B stands at «cerrada» (not remote)... and far from «torre»
  poner(1, 1500, 0); pump(12);
  assert.equal(B.d.sitios().some((x) => x.id === "cerrada"), false, "far from a board that is not remote: it is not even known");
  B.d.jugar("cerrada", "lejos"); pump(3);
  assert.match(B.d.estado().aviso, /no admite jugar desde lejos/);
  B.d.jugar("cerrada", "pared"); pump(3);
  assert.match(B.d.estado().aviso, /no admite jugar desde una pared/);
  // «suelta»: remote, no duel → a v1 turn from afar
  assert.equal(B.d.jugar("suelta", "lejos").ok, true); pump(3);
  assert.equal(B.d.tirando(), true); assert.equal(B.d.estado().sitio, "suelta");
  assert.equal(B.d.lanzar(0, 0, 0.65, "suelta").ok, true); pump(3);
  assert.equal(B.d.estado().dardos, 1);
  void A;
});
