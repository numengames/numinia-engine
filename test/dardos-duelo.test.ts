// dardos v2: the DUEL, headless (in-memory world, pages pumped by 20 Hz ticks). A board with `duelo` takes a second
// player and plays a match; with `remoto` a player may join from a real wall far from the board. The server judges.
// Bare pages use `features.send` straight (the path a rogue client would take).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FUERZA_IDEAL, TURNO_INACTIVO_S, RONDAS_DEFECTO } from "../features/dardos/feature.ts";
import { crearDardos, limpiarNombre, rondasDe, HZ } from "../features/dardos/server.ts";
import type { Sitio } from "../features/dardos/server.ts";

const sign = signer("una-clave-de-prueba-larga");
const SITIOS: Sitio[] = [
  { id: "diana", nombre: "Diana", x: -300, z: 0, y: 0, radio: 3 },                                  // v1 board: no new fields
  { id: "duelo", nombre: "Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true },        // duel + remote
  { id: "cerrada", nombre: "Cerrada", x: 10, z: 50, y: 0, radio: 3, duelo: true },                  // duel, not remote
];
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A (host, at the board), B (a real wall 500 m away), C (bystander at the board), D (bystander far away), E (third player). */
function mundo(sitios: Sitio[] = SITIOS, n = 5, opts: { sinDardos?: boolean } = {}) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: opts.sinDardos ? [] : [crearDardos({ sitios })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), k = keeper();
    const s = new ClientSession(t, { identity: k });
    s.features.tap((feature, event, msg) => { if (feature === "dardos") eventos.push({ event, msg }); });
    return { t, s, eventos };
  });
  type P = (typeof pages)[number];
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (c: P, x: number, z: number) => { inst.sim.tf.cols.x[c.s.entity] = fx(x); inst.sim.tf.cols.z[c.s.entity] = fx(z); };
  const evs = (c: P, ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  const jugar = (c: P, sitio = "duelo", desde?: string) => c.s.features.send("dardos", "jugar", desde ? { sitio, desde } : { sitio });
  const lanzar = (c: P, sitio = "duelo", x = 0, y = 0.605, fuerza = FUERZA_IDEAL) => c.s.features.send("dardos", "lanzar", { sitio, x, y, fuerza });
  const salir = (c: P) => c.s.features.send("dardos", "salir", {});
  const estado = (c: P, id = "duelo") => c.s.features.stateOf("dardos").get(id);
  const ultimoRechazo = (c: P) => String(evs(c, "rechazado").at(-1)?.motivo);
  /** The usual set-up: A at the duel board, B on a wall 500 m away, C beside the board, D far from everything. */
  const montar = () => { pump(2); const [A, B, C, D] = pages; place(A, 8, 0); place(B, 510, 0); place(C, 12, 2); place(D, -1500, 0); pump(12); };
  return { inst, pages, pump, place, evs, jugar, lanzar, salir, estado, ultimoRechazo, montar };
}

test("duelo: the declaration is valid, rounds are clamped, names lose control characters and fit 40 bytes", async () => {
  const { dardos } = await import("../features/dardos/feature.ts");
  assert.deepEqual(dardos.issues, []);
  assert.equal(dardos.version, 3);
  assert.equal(rondasDe(undefined), RONDAS_DEFECTO); assert.equal(rondasDe(0), 1); assert.equal(rondasDe(99), 5); assert.equal(rondasDe(2.4), 2); assert.equal(rondasDe("x"), RONDAS_DEFECTO);
  assert.equal(limpiarNombre("Ana\u0000\n\u202EMar\tía"), "Ana Mar ía");
  assert.ok(Buffer.byteLength(limpiarNombre("ñ".repeat(60))) <= 40);
});

test("duelo: a board without the new fields behaves as in v1 (state defaults, no `desde` needed, remote refused)", () => {
  const W = mundo(); const [A, B] = W.pages;
  W.montar(); W.place(A, -298, 0); W.pump(12);
  assert.deepEqual([W.estado(A, "diana")?.duelo, W.estado(A, "diana")?.remoto, W.estado(A, "diana")?.espera, W.estado(A, "diana")?.jugadores], [false, false, false, 0]);
  assert.equal(W.jugar(A, "diana").ok, true); W.pump(2);
  assert.equal(W.evs(A, "turno").length, 1);
  assert.equal(W.estado(A, "diana")?.ocupado, true);
  W.jugar(B, "diana", "pared"); W.pump();
  assert.match(W.ultimoRechazo(B), /no admite jugar desde una pared/);
  for (let i = 0; i < 3; i++) { W.lanzar(A, "diana"); W.pump(3); }
  assert.equal(W.evs(A, "fin").length, 1);
  assert.equal(W.evs(A, "duelo").length + W.evs(A, "finduelo").length, 0, "no duel events on a plain board");
  assert.equal(W.estado(A, "diana")?.ocupado, false);
});

test("duelo: the host waits (`espera`), a second player starts the match, a third is turned away, and a wall needs `remoto`", () => {
  const W = mundo(); const [A, B, C, D, E] = W.pages;
  W.montar(); W.place(E, 9, 1); W.pump(2);
  assert.equal(W.jugar(A).ok, true); W.pump(2);
  assert.deepEqual([W.estado(C)?.espera, W.estado(C)?.jugadores, W.estado(C)?.ocupado], [true, 1, false], "every page can read «esperando rival»");
  assert.deepEqual(W.evs(A, "duelo").at(-1), { sitio: "duelo", ronda: 0, turnoDe: 0, a: A.s.entity, nombreA: A.s.who!.nombre, puntosA: 0, b: 0, nombreB: "", puntosB: 0, paredA: false, paredB: false });
  W.lanzar(A); W.pump();
  assert.match(W.ultimoRechazo(A), /Espera a tu rival/);
  // B on a wall 500 m away cannot join a board that is not `remoto` (nor without saying `desde`), but can join this one
  W.jugar(B, "cerrada", "pared"); W.pump(); assert.match(W.ultimoRechazo(B), /no admite jugar desde una pared/);
  W.jugar(B); W.pump(); assert.match(W.ultimoRechazo(B), /Acércate/, "without `desde` the old rule holds");
  assert.equal(W.jugar(B, "duelo", "pared").ok, true); W.pump(2);
  assert.deepEqual([W.estado(C)?.espera, W.estado(C)?.jugadores, W.estado(C)?.ocupado], [false, 2, true]);
  assert.equal(W.evs(A, "turno").length, 1, "the host throws first"); assert.equal(W.evs(B, "turno").length, 0);
  W.jugar(E); W.pump(); assert.match(W.ultimoRechazo(E), /Ya hay un duelo en marcha/);
  const d = W.evs(B, "duelo").at(-1)!;
  assert.deepEqual([d.ronda, d.turnoDe, d.a, d.b], [1, A.s.entity, A.s.entity, B.s.entity]);
  assert.deepEqual([d.paredA, d.paredB], [false, true], "the server says who joined from a wall (AR-D4)");
  assert.deepEqual([W.evs(C, "duelo").at(-1)!.paredA, W.evs(C, "duelo").at(-1)!.paredB], [false, true], "…and a bystander hears it too");
  assert.equal(W.evs(C, "duelo").length >= 1, true, "a bystander at the board sees the match");
  assert.equal(W.evs(D, "duelo").length, 0, "…and one far away does not");
});

test("duelo: out of turn is refused; both players get every dart 500 m apart; a bystander near sees it, one far away does not", () => {
  const W = mundo(); const [A, B, C, D] = W.pages;
  W.montar(); W.jugar(A); W.jugar(B, "duelo", "pared"); W.pump(2);
  W.lanzar(B); W.pump(); assert.match(W.ultimoRechazo(B), /No es tu turno/);
  assert.equal(W.evs(B, "dardo").length, 0);
  for (let n = 1; n <= 3; n++) { W.lanzar(A); W.pump(3); }
  for (const who of [A, B, C]) assert.equal(W.evs(who, "dardo").length, 3);
  assert.equal(W.evs(D, "dardo").length, 0);
  assert.equal(W.evs(B, "fin").length, 1, "the turn end reaches the rival too"); assert.equal(W.evs(A, "fin").length, 1); assert.equal(W.evs(D, "fin").length, 0);
  assert.equal(W.evs(B, "turno").length, 1, "now it is B's turn");
  W.lanzar(A); W.pump(); assert.match(W.ultimoRechazo(A), /No es tu turno/);
  W.lanzar(B); W.pump(3);
  assert.equal(W.evs(A, "dardo").length, 4, "A, 500 m away from B's wall, sees B's dart");
  const d = W.evs(A, "duelo").at(-1)!; assert.equal(d.turnoDe, B.s.entity);
  assert.equal(d.puntosA, W.evs(A, "dardo").slice(0, 3).reduce((s, x) => s + Number(x.puntos), 0));
  assert.equal(d.puntosB, Number(W.evs(A, "dardo")[3].puntos));
});

/** Plays a full match (3 rounds) with fixed throws; returns what each page saw. */
function partidaCompleta() {
  const W = mundo(); const [A, B, C] = W.pages;
  W.montar(); W.jugar(A); W.jugar(B, "duelo", "pared"); W.pump(2);
  const tiros: [number, number, number][] = [[0, 0.6, 0.65], [0.3, 0.4, 0.8], [-0.5, 0.1, 0.5]];
  for (let ronda = 0; ronda < RONDAS_DEFECTO; ronda++) for (const q of [A, B]) for (const [x, y, f] of tiros) { W.lanzar(q, "duelo", x, y, f); W.pump(3); }
  return { W, A, B, C };
}

test("duelo: a full 3-round match ends with the higher total winning, frees the board, and is the same in two worlds", () => {
  const r1 = partidaCompleta(), r2 = partidaCompleta();
  const { W, A, B, C } = r1;
  assert.equal(W.evs(A, "dardo").length, 18);
  const fin = W.evs(A, "finduelo"); assert.equal(fin.length, 1);
  const f = fin[0], pa = Number(f.puntosA), pb = Number(f.puntosB);
  const suma = (q: typeof A, de: number) => W.evs(A, "dardo").filter((x) => x.quien === q.s.entity).reduce((s, x) => s + Number(x.puntos), 0) + de;
  assert.equal(pa, suma(A, 0)); assert.equal(pb, suma(B, 0));
  assert.equal(f.abandono, false);
  if (pa === pb) { assert.equal(f.empate, true); assert.equal(f.ganador, 0); } else { assert.equal(f.empate, false); assert.equal(f.ganador, pa > pb ? A.s.entity : B.s.entity); }
  assert.deepEqual(W.evs(B, "finduelo"), fin); assert.deepEqual(W.evs(C, "finduelo"), fin, "the bystander at the board sees the result");
  assert.deepEqual([W.estado(C)?.ocupado, W.estado(C)?.espera, W.estado(C)?.jugadores], [false, false, 0]);
  assert.equal(W.evs(A, "duelo").at(-1)!.ronda, 3);
  // determinism: same throws on the same ticks, same result everywhere
  const huella = (x: typeof r1) => JSON.stringify([x.W.evs(x.A, "dardo"), x.W.evs(x.B, "finduelo"), x.W.evs(x.C, "duelo")]).replace(/Invitado [A-Z0-9]{4}/g, "N") // guest names are random per world;
  assert.equal(huella(r1), huella(r2));
  // the board is free for another match
  W.jugar(C); W.pump(2); assert.equal(W.estado(C)?.espera, true);
});

test("duelo: equal totals are a draw (`empate`, ganador 0)", () => {
  const W = mundo(); const [A, B] = W.pages;
  W.montar(); W.jugar(A); W.jugar(B, "duelo", "pared"); W.pump(2);
  // aim far outside the board: every dart is out (0 points) for both, so 0-0 is a tie by construction
  for (let r = 0; r < RONDAS_DEFECTO; r++) for (const q of [A, B]) for (let i = 0; i < 3; i++) { W.lanzar(q, "duelo", 2.5, 2.5, FUERZA_IDEAL); W.pump(7); } // 7 ticks apart: inside the verb's rate limit
  const f = W.evs(A, "finduelo").at(-1)!;
  assert.deepEqual([f.empate, f.ganador, f.puntosA, f.puntosB, f.abandono], [true, 0, 0, 0, false]);
  assert.match(String(f.texto), /^Empate/);
});

test("duelo: leaving, disconnecting or going idle in a match gives the rival the win by default (`abandono`)", () => {
  const preparar = () => { const W = mundo(); const [A, B] = W.pages; W.montar(); W.jugar(A); W.jugar(B, "duelo", "pared"); W.pump(2); W.lanzar(A); W.pump(2); return { W, A, B }; };
  { // salir by the guest while it is the host's turn
    const { W, A, B } = preparar(); W.salir(B); W.pump(2);
    const f = W.evs(A, "finduelo").at(-1)!; assert.deepEqual([f.abandono, f.ganador, f.empate], [true, A.s.entity, false]);
    assert.equal(W.estado(A)?.ocupado, false); assert.equal(W.estado(A)?.jugadores, 0);
    W.lanzar(B); W.pump(); assert.equal(W.evs(B, "dardo").length, 1, "B only saw A's dart: B's throw out of the match is refused");
  }
  { // disconnect of the host mid-turn
    const { W, A, B } = preparar(); W.inst.disconnect(A.s.entity); W.pump(2);
    const f = W.evs(B, "finduelo").at(-1)!; assert.deepEqual([f.abandono, f.ganador], [true, B.s.entity]);
    assert.equal(W.estado(W.pages[2])?.jugadores, 0);
  }
  { // idle: A (host) has thrown once and then does nothing for a minute
    const { W, A, B } = preparar(); W.pump(TURNO_INACTIVO_S * HZ - 40); assert.equal(W.evs(B, "finduelo").length, 0);
    W.pump(80);
    const f = W.evs(B, "finduelo").at(-1)!; assert.deepEqual([f.abandono, f.ganador], [true, B.s.entity]);
    assert.equal(W.evs(A, "finduelo").length, 1);
  }
  { // a host nobody joins times out as a single turn does, and cancelling frees the board
    const W = mundo(); const [A] = W.pages; W.montar(); W.jugar(A); W.pump(2); assert.equal(W.estado(A)?.espera, true);
    W.pump(TURNO_INACTIVO_S * HZ + 40);
    assert.equal(W.estado(A)?.espera, false); assert.equal(W.evs(A, "fin").length, 1); assert.equal(W.evs(A, "finduelo").length, 0);
  }
  { // the waiting host walks away with `salir`
    const W = mundo(); const [A, B] = W.pages; W.montar(); W.jugar(A); W.pump(2); W.salir(A); W.pump(2);
    assert.equal(W.estado(A)?.espera, false);
    W.jugar(B, "duelo", "pared"); W.pump(2); assert.equal(W.estado(A)?.espera, true, "B is the new host");
  }
});

test("duelo: the simulation never notices (same fingerprint with or without the feature running)", () => {
  const W = mundo(), plain = mundo(SITIOS, 5, { sinDardos: true });
  W.montar(); plain.montar();
  W.jugar(W.pages[0]); W.jugar(W.pages[1], "duelo", "pared"); W.pump(2); plain.pump(2);
  W.lanzar(W.pages[0]); W.pump(); plain.pump();
  assert.equal(W.evs(W.pages[1], "dardo").length, 1);
  assert.equal(W.inst.hash(), plain.inst.hash());
});
