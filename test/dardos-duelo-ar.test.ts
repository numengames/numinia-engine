// dardos duel in AR (AR-D3), the parts that need no screen: what the 3D panel says, when a throw is allowed, how the
// rival's dart flies in, which board an AR wall joins, the HUD line, and leaving a match on the rival's turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearDardos } from "../features/dardos/server.ts";
import { crearCliente } from "../features/dardos/client.ts";
import { panelDe, puedeLanzar, llegadas, salidaRival, vueloRival, VUELO_RIVAL_S } from "../packages/render/src/dardos-duelo.ts";
import type { DueloV } from "../packages/render/src/dardos-duelo.ts";
import { elegirSitioAR, lineaDuelo } from "../apps/plaza/dardos-duelo.ts";

const ana = { entity: 3, nombre: "Ana", puntos: 12 }, luis = { entity: 7, nombre: "Luis", puntos: 9 };
/** The match as `dardos.duelo()` gives it to Luis (the wall player, guest). */
const base = (): DueloV => ({ ronda: 2, esperando: false, turnoDe: 7, yo: true, miTurno: true, rival: ana, yoPuntos: 9, a: ana, b: luis, fin: null });

test("panel: two names, points, round r/N, the turn highlighted and «tú» on my row", () => {
  const p = panelDe(base(), 3);
  assert.equal(p.fase, "juego"); assert.equal(p.ronda, "Ronda 2/3");
  assert.deepEqual(p.filas, [{ nombre: "Ana", puntos: 12, turno: false, yo: false }, { nombre: "Luis", puntos: 9, turno: true, yo: true }]);
  assert.equal(p.pie, "Tu turno"); assert.equal(p.tono, "bien");
  const o = panelDe({ ...base(), turnoDe: 3, miTurno: false }, 3);
  assert.equal(o.pie, "Es el turno de Ana"); assert.equal(o.filas[0].turno, true); assert.equal(o.filas[1].turno, false);
});

test("panel: waiting for a rival, no match, and each way a match ends", () => {
  const esp: DueloV = { ronda: 0, esperando: true, turnoDe: null, yo: true, miTurno: false, rival: null, yoPuntos: 0, a: ana, b: null, fin: null };
  const p = panelDe(esp, 3);
  assert.equal(p.fase, "espera"); assert.equal(p.pie, "Esperando rival…"); assert.equal(p.filas[0].yo, true); assert.equal(p.filas[1].nombre, "…");
  assert.equal(panelDe(null, 3).fase, "nada");
  const fin = (f: Partial<NonNullable<DueloV["fin"]>>): DueloV => ({ ...base(), turnoDe: null, miTurno: false, fin: { ganador: 7, empate: false, abandono: false, texto: "x", gane: true, ...f } });
  assert.equal(panelDe(fin({}), 3).pie, "Ganas");
  assert.equal(panelDe(fin({ ganador: 3, gane: false }), 3).pie, "Pierdes");
  assert.equal(panelDe(fin({ ganador: 3, gane: false }), 3).tono, "mal");
  assert.equal(panelDe(fin({ ganador: null, empate: true, gane: false }), 3).pie, "Empate");
  assert.equal(panelDe(fin({ abandono: true }), 3).pie, "Ganas · tu rival se fue");
  assert.equal(panelDe(fin({}), 3).filas.some((f) => f.turno), false, "nobody has the turn after the end");
});

test("gating: v1 always throws; in a duel only on my live turn (never waiting, never after the end, never as a bystander)", () => {
  assert.equal(puedeLanzar(null, false), true);
  assert.equal(puedeLanzar(null, true), false, "joined but the match did not arrive yet");
  assert.equal(puedeLanzar(base(), true), true);
  assert.equal(puedeLanzar({ ...base(), miTurno: false, turnoDe: 3 }, true), false);
  assert.equal(puedeLanzar({ ...base(), esperando: true }, true), false);
  assert.equal(puedeLanzar({ ...base(), yo: false }, true), false);
  assert.equal(puedeLanzar({ ...base(), fin: { ganador: 7, empate: false, abandono: false, texto: "", gane: true } }, true), false);
});

test("rival darts: only the rival's new darts fly; mine and the ones already seen do not", () => {
  const vistos = new Set<string>();
  const d = (quien: number, numero: number) => ({ quien, sitio: "torre", numero, x: 0.1, y: 0.2 });
  assert.deepEqual(llegadas(vistos, [d(7, 1), d(3, 1)], 7).map((x) => x.quien), [3]);
  assert.deepEqual(llegadas(vistos, [d(7, 1), d(3, 1)], 7), [], "same list: nothing new");
  assert.deepEqual(llegadas(vistos, [d(7, 1), d(3, 1), d(3, 2)], 7).map((x) => x.numero), [2]);
  llegadas(vistos, [d(7, 1)], 7); // the rival's turn is over: its darts come out…
  assert.deepEqual(llegadas(vistos, [d(7, 1), d(3, 1)], 7).map((x) => x.numero), [1], "…and its next first dart flies again");
});

test("rival darts: a ~0.4 s arc from the side and above to the landing point, never below the straight line at the middle", () => {
  const r = 0.17, a = salidaRival(0.3, -0.2, 1, r), b = { x: 0.3 * r, y: -0.2 * r, z: 0.012 };
  assert.ok(a.y > b.y + 0.4 && a.z > 0.5, "starts above and in front");
  assert.equal(salidaRival(0, 0, 1, r).x < 0, true); assert.equal(salidaRival(0, 0, 2, r).x > 0, true, "the sides alternate");
  assert.equal(VUELO_RIVAL_S, 0.4);
  const t0 = vueloRival(a, b, 0), tm = vueloRival(a, b, VUELO_RIVAL_S / 2), t1 = vueloRival(a, b, VUELO_RIVAL_S), tx = vueloRival(a, b, 5);
  assert.deepEqual([t0.u, t0.lista], [0, false]); assert.deepEqual(t0.pos, a);
  assert.equal(tm.lista, false); assert.ok(tm.pos.y > (a.y + b.y) / 2, "the arc lifts at the middle");
  assert.equal(t1.lista, true); assert.ok(Math.abs(t1.pos.x - b.x) < 1e-9 && Math.abs(t1.pos.y - b.y) < 1e-9 && Math.abs(t1.pos.z - b.z) < 1e-9, "lands exactly on the dart's place");
  assert.equal(tx.u, 1);
});

test("AR wall joins the first remote duel board (the one with somebody waiting first); none = v1", () => {
  const s = (id: string, o: object = {}) => ({ id, ...o });
  assert.equal(elegirSitioAR([s("a"), s("b", { duelo: true })]), null, "duel without remote: not for a wall");
  assert.equal(elegirSitioAR([]), null);
  assert.equal(elegirSitioAR([s("a"), s("torre", { duelo: true, remoto: true }), s("t2", { duelo: true, remoto: true })])?.id, "torre");
  assert.equal(elegirSitioAR([s("torre", { duelo: true, remoto: true }), s("t2", { duelo: true, remoto: true, espera: true })])?.id, "t2");
  assert.equal(elegirSitioAR([s("t1", { duelo: true, remoto: true, ocupado: true }), s("t2", { duelo: true, remoto: true })])?.id, "t2");
});

test("HUD line: scores, round and turn; waiting; the end; empty without a match", () => {
  assert.equal(lineaDuelo(null, 3), "");
  assert.equal(lineaDuelo(base(), 3), "Ana 12 – Luis (tú) 9 · Ronda 2/3 · Tu turno");
  assert.equal(lineaDuelo({ ...base(), turnoDe: 3, miTurno: false }, 3), "Ana 12 – Luis (tú) 9 · Ronda 2/3 · Es el turno de Ana");
  assert.equal(lineaDuelo({ ronda: 0, esperando: true, turnoDe: null, yo: true, miTurno: false, rival: null, yoPuntos: 0, a: ana, b: null, fin: null }, 3), "Esperando rival…");
  assert.match(lineaDuelo({ ...base(), turnoDe: null, miTurno: false, fin: { ganador: 3, empate: false, abandono: false, texto: "", gane: false } }, 3), /Pierdes$/);
});

// ---- leaving a match (AR `fin()` calls `dardos.salir()`): it must work on the rival's turn too ----
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
test("salir() in a match works on the rival's turn and hands them the win; alone it still says «no estás tirando»", () => {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: [{ id: "torre", nombre: "Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true }] })], log: () => {}, identitySign: sign });
  const pages = [0, 1].map((i) => { const t = inst.join(i), cli = crearCliente(); return { t, s: new ClientSession(t, { identity: keeper(), features: cli.parts }), d: cli.dardos }; });
  const pump = (n = 1) => { for (let i = 0; i < n; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const [A, B] = pages; pump(2);
  inst.sim.tf.cols.x[A.s.entity] = fx(8); inst.sim.tf.cols.z[A.s.entity] = fx(0); inst.sim.tf.cols.x[B.s.entity] = fx(500); pump(12);
  assert.equal(B.d.salir().ok, false);
  A.d.jugar("torre"); pump(3); B.d.jugar("torre", "pared"); pump(3);
  assert.equal(B.d.duelo()!.miTurno, false, "A has the turn"); assert.equal(B.d.tirando(), false);
  assert.equal(B.d.salir().ok, true); pump(3);
  const a = A.d.duelo()!; assert.equal(a.fin?.abandono, true); assert.equal(a.fin?.gane, true);
  assert.equal(B.d.duelo()!.fin?.gane, false);
});
