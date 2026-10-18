// dardos v2: the DUEL as the page's controller sees it, headless (same harness as dardos-duelo.test.ts, but every page
// runs the real client part). Checks `dardos.duelo()`, the rival's darts in `clavados()`, `alCambiar("duelo")` and
// the rejection texts in `estado().aviso`. A board without duel fields must stay exactly as in v1.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FUERZA_IDEAL, RONDAS_DEFECTO } from "../features/dardos/feature.ts";
import { crearDardos } from "../features/dardos/server.ts";
import type { Sitio } from "../features/dardos/server.ts";
import { crearCliente, DUELO_DARDOS_MS, DUELO_FIN_MS } from "../features/dardos/client.ts";

const sign = signer("una-clave-de-prueba-larga");
const SITIOS: Sitio[] = [
  { id: "diana", nombre: "Diana", x: -300, z: 0, y: 0, radio: 3 },                              // v1 board
  { id: "duelo", nombre: "Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true },    // duel + remote
];
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A (host, at the board), B (a wall 500 m away), C (bystander at the board), D (far away). Every page has the controller. */
function mundo() {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: SITIOS })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: 4 }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts });
    const cambios: string[] = []; cli.dardos.alCambiar((q) => cambios.push(q));
    return { t, s, d: cli.dardos, cambios };
  });
  type P = (typeof pages)[number];
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (c: P, x: number, z: number) => { inst.sim.tf.cols.x[c.s.entity] = fx(x); inst.sim.tf.cols.z[c.s.entity] = fx(z); };
  const montar = () => { pump(2); const [A, B, C, D] = pages; place(A, 8, 0); place(B, 510, 0); place(C, 12, 2); place(D, -1500, 0); pump(12); };
  return { inst, pages, pump, place, montar };
}
const lanzar = (c: { d: ReturnType<typeof crearCliente>["dardos"] }, x = 0, y = 0.605, f = FUERZA_IDEAL) => c.d.lanzar(x, y, f, "duelo");

test("duelo cliente: a board without duel fields behaves as in v1 (no duel state, nothing new in the listener)", () => {
  const W = mundo(); const [A] = W.pages; W.montar(); W.place(A, -298, 0); W.pump(12);
  assert.equal(A.d.duelo(), null);
  assert.equal(A.d.jugar("diana").ok, true); W.pump(2);
  assert.equal(A.d.tirando(), true); assert.equal(A.d.duelo(), null);
  for (let i = 0; i < 3; i++) { A.d.lanzar(0, 0.6, FUERZA_IDEAL, "diana"); W.pump(3); }
  assert.equal(A.d.tirando(), false); assert.equal(A.d.estado().fin?.dardos, 3);
  assert.equal(A.d.duelo(), null); assert.equal(A.cambios.includes("duelo"), false);
});

test("duelo cliente: waiting, joining from a wall, turns flip, miTurno is true for one at a time, rejections reach `aviso`", () => {
  const W = mundo(); const [A, B, C, D] = W.pages; W.montar();
  assert.equal(C.d.duelo(), null);
  assert.equal(A.d.jugar("duelo").ok, true); W.pump(3);
  let a = A.d.duelo()!;
  assert.deepEqual([a.esperando, a.ronda, a.yo, a.miTurno, a.rival, a.turnoDe, a.b], [true, 0, true, false, null, null, null]);
  assert.equal(a.a.entity, A.s.entity); assert.equal(a.a.nombre, A.s.who!.nombre);
  assert.equal(A.d.ofrece("dardos", "duelo"), false, "in a match the prompt is not offered");
  assert.equal(C.d.duelo()?.yo, false); assert.equal(C.d.duelo()?.esperando, true);
  lanzar(A); W.pump(); assert.match(A.d.estado().aviso, /Espera a tu rival/);
  assert.equal(D.d.duelo(), null, "far away: nothing");
  // B joins from a wall 500 m away; it does not need the board in reach
  assert.equal(B.d.jugar("duelo", "pared").ok, true); W.pump(3);
  a = A.d.duelo()!; const b = B.d.duelo()!;
  assert.deepEqual([a.esperando, a.ronda, a.yo, a.miTurno, a.turnoDe, a.rival?.entity, a.rival?.nombre], [false, 1, true, true, A.s.entity, B.s.entity, B.s.who!.nombre]);
  assert.deepEqual([b.ronda, b.yo, b.miTurno, b.turnoDe, b.rival?.entity, b.yoPuntos, b.rival?.puntos], [1, true, false, A.s.entity, A.s.entity, 0, 0]);
  assert.equal(A.d.tirando(), true); assert.equal(B.d.tirando(), false);
  lanzar(B); W.pump(); assert.match(B.d.estado().aviso, /No es tu turno/);
  assert.ok(A.cambios.includes("duelo") && B.cambios.includes("duelo"));
  // A throws three; the turn passes to B and the flags flip
  for (let i = 0; i < 3; i++) { lanzar(A); W.pump(3); }
  assert.deepEqual([A.d.duelo()!.miTurno, B.d.duelo()!.miTurno, C.d.duelo()!.turnoDe], [false, true, B.s.entity]);
  assert.equal(B.d.tirando(), true); assert.equal(A.d.tirando(), false);
  assert.equal(C.d.duelo()!.yo, false); assert.equal(C.d.duelo()!.rival, null); assert.equal(C.d.duelo()!.yoPuntos, 0);
  assert.equal(C.d.duelo()!.miTurno, false);
  lanzar(A); W.pump(); assert.match(A.d.estado().aviso, /No es tu turno/);
  assert.equal(D.d.duelo(), null);
});

test("duelo cliente: the rival's darts of the current round stay visible 500 m away, and come out when their next turn starts", () => {
  const W = mundo(); const [A, B, C, D] = W.pages; W.montar();
  A.d.jugar("duelo"); B.d.jugar("duelo", "pared"); W.pump(3);
  for (let i = 0; i < 3; i++) { lanzar(A, 0, 0.6); W.pump(3); }
  assert.equal(B.d.clavados("duelo").length, 3, "B sees A's three darts after A's turn ended");
  assert.equal(C.d.clavados("duelo").length, 3); assert.equal(D.d.clavados().length, 0);
  assert.equal(A.d.clavados("duelo").length, 3);
  lanzar(B, 0.3, 0.4, 0.8); W.pump(3);
  assert.equal(B.d.clavados("duelo").length, 4); assert.equal(A.d.clavados("duelo").length, 4, "A, far from B's wall, sees B's dart");
  assert.equal(A.d.duelo()!.yoPuntos, A.d.clavados().filter((d) => d.quien === A.s.entity).reduce((s, d) => s + d.puntos, 0));
  assert.equal(A.d.duelo()!.rival!.puntos, B.d.clavados().filter((d) => d.quien === B.s.entity)[0].puntos);
  for (let i = 0; i < 2; i++) { lanzar(B); W.pump(3); }
  // round 2: A's first dart takes A's old darts out (v1 rule), B's stay until B's own next turn
  lanzar(A, 0, 0.6); W.pump(3);
  assert.equal(B.d.clavados("duelo").filter((d) => d.quien === A.s.entity).length, 1);
  assert.equal(B.d.clavados("duelo").filter((d) => d.quien === B.s.entity).length, 3);
});

/** A full match, with fixed throws; returns the pages. */
function partida(tiros: [number, number, number][]) {
  const W = mundo(); const [A, B] = W.pages; W.montar();
  A.d.jugar("duelo"); B.d.jugar("duelo", "pared"); W.pump(3);
  const vistos: number[] = [];
  for (let r = 0; r < RONDAS_DEFECTO; r++) for (const q of [A, B]) for (const [x, y, f] of tiros) { lanzar(q, x, y, f); W.pump(3); vistos.push(W.pages[0].d.duelo()!.ronda ?? 0); }
  return { W, vistos };
}

test("duelo cliente: a full match seen by both players and a bystander; scores add up; gane/empate; darts stay then clear", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { W } = partida([[0, 0.6, 0.65], [0.3, 0.4, 0.8], [-0.5, 0.1, 0.5]]);
    const [A, B, C, D] = W.pages;
    const a = A.d.duelo()!, b = B.d.duelo()!, c = C.d.duelo()!;
    assert.ok(a.fin && b.fin && c.fin);
    for (const x of [a, b, c]) assert.deepEqual([x.a.entity, x.b!.entity, x.a.puntos, x.b!.puntos, x.turnoDe, x.miTurno, x.ronda], [A.s.entity, B.s.entity, a.a.puntos, a.b!.puntos, null, false, 3]);
    // the last round's darts are what is in the board; the totals are the sum of every dart each one threw
    assert.equal(a.yoPuntos, a.a.puntos); assert.equal(b.yoPuntos, b.b!.puntos); assert.equal(a.rival!.puntos, b.yoPuntos);
    assert.equal(a.a.puntos + a.b!.puntos > 0, true);
    if (a.a.puntos === a.b!.puntos) {
      for (const x of [a, b, c]) assert.deepEqual([x.fin!.empate, x.fin!.ganador, x.fin!.gane], [true, null, false]);
    } else {
      const ganaA = a.a.puntos > a.b!.puntos;
      assert.deepEqual([a.fin!.gane, b.fin!.gane, c.fin!.gane], [ganaA, !ganaA, false]);
      assert.equal(a.fin!.ganador, ganaA ? A.s.entity : B.s.entity); assert.equal(a.fin!.empate, false);
    }
    assert.equal(a.fin!.abandono, false); assert.match(a.fin!.texto, /Empate|Gana/);
    assert.equal(A.d.ofrece("dardos", "duelo"), true, "the match is over: the prompt is back");
    assert.equal(D.d.duelo(), null);
    assert.ok(A.cambios.at(-1) === "estado" || A.cambios.includes("duelo"));
    // the darts of the last round stay a few seconds for both (and the bystander), then come out
    assert.equal(A.d.clavados("duelo").length, 6); assert.equal(B.d.clavados("duelo").length, 6); assert.equal(C.d.clavados("duelo").length, 6);
    mock.timers.tick(DUELO_DARDOS_MS - 100); assert.equal(B.d.clavados("duelo").length, 6);
    mock.timers.tick(200);
    for (const p of [A, B, C]) assert.equal(p.d.clavados("duelo").length, 0);
    assert.ok(A.d.duelo()?.fin, "the result outlives the darts");
    mock.timers.tick(DUELO_FIN_MS); for (const p of [A, B, C]) assert.equal(p.d.duelo(), null);
    // the board is free: the next match starts clean
    C.d.jugar("duelo"); W.pump(3); assert.equal(C.d.duelo()!.esperando, true); assert.equal(C.d.duelo()!.fin, null);
  } finally { mock.timers.reset(); }
});

test("duelo cliente: a draw (every dart out) reads as empate with ganador null, and entity 0 is not mistaken for «nobody»", () => {
  const { W } = partida([[2.5, 2.5, FUERZA_IDEAL], [2.5, 2.5, FUERZA_IDEAL], [2.5, 2.5, FUERZA_IDEAL]]);
   const [A, B] = W.pages;
  const a = A.d.duelo();
  if (a?.fin) {
    assert.deepEqual([a.fin.empate, a.fin.ganador, a.fin.gane, B.d.duelo()!.fin!.gane, a.a.puntos, a.b!.puntos], [true, null, false, false, 0, 0]);
    assert.match(a.fin.texto, /^Empate/);
  } else assert.fail("the match should be over");
});

test("duelo cliente: leaving gives the rival the win by default (abandono); a host who gives up leaves no duel", () => {
  { const W = mundo(); const [A, B, C] = W.pages; W.montar();
    A.d.jugar("duelo"); B.d.jugar("duelo", "pared"); W.pump(3); lanzar(A); W.pump(3);
    assert.equal(B.d.salir().ok, false, "B is not throwing (A's turn): salir needs a turn of its own");
    A.d.salir(); W.pump(3);
    for (const p of [A, B, C]) assert.ok(p.d.duelo()?.fin?.abandono);
    assert.deepEqual([A.d.duelo()!.fin!.gane, B.d.duelo()!.fin!.gane, B.d.duelo()!.fin!.ganador], [false, true, B.s.entity]);
    assert.match(B.d.duelo()!.fin!.texto, /su rival se fue/);
    assert.equal(A.d.tirando(), false);
  }
  { const W = mundo(); const [A, B] = W.pages; W.montar();
    A.d.jugar("duelo"); W.pump(3); assert.equal(A.d.duelo()!.esperando, true);
    A.d.salir(); W.pump(3); // a host with no turn of its own cannot salir through the controller…
    assert.equal(A.d.duelo()!.esperando, true);
    A.s.features.send("dardos", "salir", {}); W.pump(3); // …but the raw verb cancels the wait
    assert.equal(A.d.duelo(), null, "the cancelled wait leaves no duel behind");
    B.d.jugar("duelo", "pared"); W.pump(3); assert.equal(B.d.duelo()!.esperando, true);
  }
});

test("duelo cliente: rejections show in `aviso` (third player, wall on a board that is not remote, too far)", () => {
  const W = mundo(); const [A, B, C, D] = W.pages; W.montar();
  A.d.jugar("duelo"); B.d.jugar("duelo", "pared"); W.pump(3);
  C.d.jugar("duelo"); W.pump(2); assert.match(C.d.estado().aviso, /Ya hay un duelo en marcha/);
  assert.equal(C.d.duelo()!.yo, false, "the refused third stays a bystander");
  D.d.jugar("duelo"); W.pump(2); assert.match(D.d.estado().aviso, /Acércate/);
  D.d.jugar("diana", "pared"); W.pump(2); assert.match(D.d.estado().aviso, /no admite jugar desde una pared/);
});
