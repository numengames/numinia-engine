// dardos v3: duel by TEAMS of one player (2 to 4), the start by button, the change of turn by button and the «retirando» phase.
// Headless like dardos-duelo.test.ts: an in-memory world, pages pumped by 20 Hz ticks, the server judges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";
import { crearDardos, HZ } from "../features/dardos/server.ts";
import type { Sitio } from "../features/dardos/server.ts";
import { equiposDe, siguienteEquipo, terminada, resultado, RETIRANDO_S } from "../features/dardos/equipos.ts";

const sign = signer("una-clave-de-prueba-larga");
const SITIOS: Sitio[] = [
  { id: "viejo", nombre: "Viejo", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true },                 // no `equipos`: the v2 duel
  { id: "cuatro", nombre: "Cuatro", x: 10, z: 30, y: 0, radio: 3, duelo: true, remoto: true, equipos: 4, rondas: 2 },
  { id: "tres", nombre: "Tres", x: 10, z: 60, y: 0, radio: 3, duelo: true, remoto: true, equipos: 3, rondas: 2 },
  { id: "dos", nombre: "Dos", x: 10, z: 90, y: 0, radio: 3, duelo: true, remoto: true, equipos: 2, rondas: 1 },
];
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function mundo(n = 5) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: SITIOS })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), s = new ClientSession(t, { identity: keeper() });
    s.features.tap((feature, event, msg) => { if (feature === "dardos") eventos.push({ event, msg }); });
    return { t, s, eventos };
  });
  type P = (typeof pages)[number];
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  pump(2);
  pages.forEach((c, i) => { inst.sim.tf.cols.x[c.s.entity] = fx(500 + i * 3); inst.sim.tf.cols.z[c.s.entity] = fx(0); }); // everybody on a far wall
  pump(12);
  const evs = (c: P, ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  const send = (c: P, intent: string, m: Record<string, unknown>) => c.s.features.send("dardos", intent, m);
  const jugar = (c: P, sitio: string) => send(c, "jugar", { sitio, desde: "pared" });
  const lanzar = (c: P, sitio: string) => send(c, "lanzar", { sitio, x: 0, y: 0.6, fuerza: FUERZA_IDEAL });
  const cambiar = (c: P, sitio: string) => send(c, "cambiar", { sitio });
  const empezar = (c: P, sitio: string) => send(c, "empezar", { sitio });
  const duelo = (c: P) => evs(c, "duelo").at(-1) as Record<string, number | boolean | string>;
  const rechazo = (c: P) => String(evs(c, "rechazado").at(-1)?.motivo);
  /** The page of entity `e`. */
  const de = (e: unknown) => pages.find((c) => c.s.entity === e)!;
  /** The player on turn throws their three darts (3 ticks apart: inside the rate limit). */
  const tres = (c: P, sitio: string) => { for (let i = 0; i < 3; i++) { lanzar(c, sitio); pump(3); } };
  return { inst, pages, pump, evs, jugar, lanzar, cambiar, empezar, duelo, rechazo, de, tres, send };
}

test("equipos.ts: the pure rules (teams clamp, next team skips the ones that left, end, winner/tie)", () => {
  assert.deepEqual([equiposDe(undefined), equiposDe(1), equiposDe(9), equiposDe(3.4), equiposDe("x"), equiposDe(null)], [2, 2, 4, 3, 2, 2]);
  assert.equal(siguienteEquipo([false, false, false], 2), 0);
  assert.equal(siguienteEquipo([false, true, false], 0), 2);
  assert.equal(siguienteEquipo([true, true, false], 2), 2, "the only one left plays again");
  assert.equal(siguienteEquipo([true, true], 0), -1);
  assert.equal(terminada([2, 2, 2], [false, false, false], 2), true); assert.equal(terminada([2, 1, 2], [false, false, false], 2), false);
  assert.equal(terminada([2, 0, 2], [false, true, false], 2), true, "a team that left does not hold the match");
  assert.deepEqual(resultado([5, 9, 7]), { ganador: 1, empate: false, mejor: 9, segundo: 7 });
  assert.deepEqual(resultado([9, 9, 7]), { ganador: -1, empate: true, mejor: 9, segundo: 9 });
  assert.deepEqual(resultado([9, 3, 7], [true, false, false]), { ganador: 2, empate: false, mejor: 7, segundo: 3 }, "who left cannot win");
});

test("equipos: the order of turns is A, B, C, D, A, … with 2, 3 and 4 teams, and the match ends after `rondas` visits each", () => {
  for (const [sitio, n, rondas] of [["dos", 2, 1], ["tres", 3, 2], ["cuatro", 4, 2]] as const) {
    const W = mundo(5);
    const eq = W.pages.slice(0, n);
    eq.forEach((c) => { W.jugar(c, sitio); W.pump(2); });
    assert.deepEqual([W.duelo(eq[0]).plazas, W.duelo(eq[0]).equipos, W.duelo(eq[0]).ronda], [n, SITIOS.find((s) => s.id === sitio)!.equipos, 0], "everybody seated, nobody plays yet");
    W.lanzar(eq[0], sitio); W.pump(); assert.match(W.rechazo(eq[0]), /Espera a tu rival/);
    W.empezar(eq[0], sitio); W.pump(2);
    const orden: number[] = [];
    for (let v = 0; v < n * rondas; v++) {
      const d = W.duelo(eq[0]);
      assert.equal(d.turnoEq, (v % n) + 1, `visit ${v + 1}: team ${(v % n) + 1} is on turn`);
      assert.equal(d.ronda, Math.floor(v / n) + 1);
      const quien = W.de(d.turnoDe); orden.push(eq.indexOf(quien));
      W.tres(quien, sitio); W.cambiar(quien, sitio); W.pump(3);
    }
    assert.deepEqual(orden, Array.from({ length: n * rondas }, (_, v) => v % n));
    const f = W.evs(eq[0], "finduelo").at(-1)!;
    assert.deepEqual([f.abandono, f.plazas], [false, n]);
    const total = eq.map((c) => W.evs(eq[0], "dardo").filter((x) => x.quien === c.s.entity).reduce((s, x) => s + Number(x.puntos), 0));
    assert.deepEqual(["A", "B", "C", "D"].slice(0, n).map((l) => f[`puntos${l}`]), total, "every team's total is on the wire");
    for (const c of eq) assert.equal(W.evs(c, "finduelo").length, 1, "every team hears the end");
  }
});

test("equipos: after the third dart the visit is «retirando»: nothing scores until `cambiar`, or RETIRANDO_S pass", () => {
  const W = mundo(3); const [A, B] = W.pages;
  W.jugar(A, "dos"); W.jugar(B, "dos"); W.pump(2); W.empezar(A, "dos"); W.pump(2);
  assert.equal(W.duelo(A).retirando, false);
  W.tres(A, "dos");
  const d = W.duelo(A); assert.deepEqual([d.retirando, d.turnoEq, d.turnoDe], [true, 1, A.s.entity], "A is still the one on turn, but waiting");
  const pts = d.puntosA, darts = W.evs(A, "dardo").length;
  W.lanzar(A, "dos"); W.pump(3); assert.match(W.rechazo(A), /Retira los dardos/);
  W.lanzar(B, "dos"); W.pump(3); assert.match(W.rechazo(B), /No es tu turno/);
  assert.equal(W.evs(A, "dardo").length, darts, "a throw in «retirando» is not a dart");
  assert.equal(W.duelo(A).puntosA, pts, "…and does not score");
  W.cambiar(B, "dos"); W.pump(2); assert.match(W.rechazo(B), /No es tu turno/, "only the team on turn presses");
  // the clock: 12 s without anybody pressing and it changes by itself
  W.pump(RETIRANDO_S * HZ - 40); assert.equal(W.duelo(A).retirando, true, "just before the limit it still waits");
  W.pump(80);
  const d2 = W.duelo(B); assert.deepEqual([d2.retirando, d2.turnoEq, d2.turnoDe], [false, 2, B.s.entity], "B got the dice");
  assert.equal(W.evs(B, "turno").length, 1);
  W.lanzar(B, "dos"); W.pump(3); assert.equal(W.evs(B, "dardo").length, darts + 1);
});

test("equipos: `cambiar` before the third dart opens «retirando» too (a second press changes the turn)", () => {
  const W = mundo(3); const [A, B] = W.pages;
  W.jugar(A, "dos"); W.jugar(B, "dos"); W.pump(2); W.empezar(A, "dos"); W.pump(2);
  W.lanzar(A, "dos"); W.pump(3); W.cambiar(A, "dos"); W.pump(2);
  assert.equal(W.duelo(A).retirando, true); assert.equal(W.evs(A, "fin").length, 1, "the short visit is closed (its points are kept)");
  W.cambiar(A, "dos"); W.pump(2);
  assert.deepEqual([W.duelo(A).retirando, W.duelo(A).turnoDe], [false, B.s.entity]);
});

test("equipos: `empezar` needs the host and at least 2 teams; a v2 board (no `equipos`) still starts alone when the second arrives", () => {
  const W = mundo(5); const [A, B, C, D, E] = W.pages;
  W.jugar(A, "cuatro"); W.pump(2);
  W.empezar(A, "cuatro"); W.pump(2); assert.match(W.rechazo(A), /al menos 2 equipos/);
  W.empezar(B, "cuatro"); W.pump(2); assert.match(W.rechazo(B), /No estás esperando/);
  W.jugar(B, "cuatro"); W.pump(2);
  assert.equal(W.duelo(A).ronda, 0, "two seated but the host did not press: still waiting (the 3rd and 4th may come)");
  W.empezar(B, "cuatro"); W.pump(2); assert.match(W.rechazo(B), /Solo el anfitrión/);
  W.jugar(C, "cuatro"); W.jugar(D, "cuatro"); W.pump(2);
  assert.equal(W.duelo(A).plazas, 4);
  W.jugar(E, "cuatro"); W.pump(2); assert.match(W.rechazo(E), /completa/, "a fifth cannot sit");
  W.empezar(A, "cuatro"); W.pump(2);
  assert.deepEqual([W.duelo(A).ronda, W.duelo(A).turnoEq], [1, 1]);
  W.empezar(A, "cuatro"); W.pump(2); assert.match(W.rechazo(A), /ya ha empezado/);
  // the old board: the second player starts it (no button)
  W.jugar(E, "viejo"); W.pump(2); assert.equal(W.duelo(E).ronda, 0);
  const W2 = mundo(3); W2.jugar(W2.pages[0], "viejo"); W2.jugar(W2.pages[1], "viejo"); W2.pump(2);
  assert.deepEqual([W2.duelo(W2.pages[0]).ronda, W2.duelo(W2.pages[0]).turnoEq, W2.duelo(W2.pages[0]).equipos], [1, 1, 2]);
  W2.jugar(W2.pages[2], "viejo"); W2.pump(2); assert.match(W2.rechazo(W2.pages[2]), /Ya hay un duelo en marcha/);
});

test("equipos: a team that leaves mid-match is skipped; the last one standing wins by default", () => {
  const W = mundo(4); const [A, B, C] = W.pages;
  [A, B, C].forEach((c) => { W.jugar(c, "tres"); W.pump(2); }); W.empezar(A, "tres"); W.pump(2);
  W.tres(A, "tres"); W.cambiar(A, "tres"); W.pump(3);                       // B's turn
  W.send(B, "salir", {}); W.pump(3);                                        // B leaves on its own turn
  let d = W.duelo(A); assert.deepEqual([d.fueraB, d.turnoEq, d.turnoDe, W.evs(A, "finduelo").length], [true, 3, C.s.entity, 0], "the match goes on with A and C; C has the dice");
  W.tres(C, "tres"); W.cambiar(C, "tres"); W.pump(3);
  assert.deepEqual([W.duelo(A).turnoEq, W.duelo(A).ronda], [1, 2], "B is skipped: A again, round 2");
  W.send(C, "salir", {}); W.pump(3);
  const f = W.evs(A, "finduelo").at(-1)!; assert.deepEqual([f.abandono, f.ganador], [true, A.s.entity]);
  assert.deepEqual(W.evs(B, "finduelo").map((x) => x.texto), ["Has salido del duelo"], "B, who left early, was told once for themself (the match went on)");
});

test("equipos: the host leaving the wait cancels it; a guest leaving closes the seat", () => {
  const W = mundo(4); const [A, B, C] = W.pages;
  W.jugar(A, "cuatro"); W.jugar(B, "cuatro"); W.jugar(C, "cuatro"); W.pump(2);
  W.send(B, "salir", {}); W.pump(2);
  assert.deepEqual([W.duelo(A).plazas, W.duelo(A).b === C.s.entity], [2, true], "C moved up to seat B");
  W.send(A, "salir", {}); W.pump(2);
  assert.equal(W.evs(C, "fin").at(-1)?.sitio, "cuatro", "the others hear that the wait is over");
  W.jugar(B, "cuatro"); W.pump(2); assert.equal(W.duelo(B).plazas, 1, "the board is free for a new host");
});
