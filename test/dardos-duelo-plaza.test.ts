// dardos duel in the plaza (AR-D4), no screen: the sign's text, the «En su pared (AR)» tag, the invitation, which
// darts fly in, the wire field that says who plays from a wall, and the controller read by a bystander next to the board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";
import { crearDardos } from "../features/dardos/server.ts";
import { crearCliente } from "../features/dardos/client.ts";
import { INVITACION, LETRERO_PX, RECIENTE_MS, TAG_PARED, claveLetrero, debeVolar, destinoPlaza, enPared, letreroDe, pintarLetrero, salidaPlaza } from "../packages/render/src/dardos-duelo-plaza.ts";
import { VUELO_RIVAL_S, vueloRival } from "../packages/render/src/dardos-duelo.ts";
import type { DueloV } from "../packages/render/src/dardos-duelo.ts";

const ana = { entity: 3, nombre: "Ana", puntos: 12 }, luis = { entity: 7, nombre: "Luis", puntos: 9, pared: true };
/** The match as a bystander sees it: Ana (host, at the board) against Luis (guest, on his wall). */
const curioso = (): DueloV => ({ ronda: 2, esperando: false, turnoDe: 7, yo: false, miTurno: false, rival: null, yoPuntos: 0, a: ana, b: luis, fin: null });

test("sign: names, points, round and turn of THAT duel; the tag appears only when someone plays from a wall", () => {
  const l = letreroDe(curioso(), 3);
  assert.equal(l.panel.fase, "juego"); assert.equal(l.panel.ronda, "Ronda 2/3");
  assert.deepEqual(l.panel.filas.map((f) => [f.nombre, f.puntos, f.turno, f.yo]), [["Ana", 12, false, false], ["Luis", 9, true, false]]);
  assert.equal(l.panel.pie, "Es el turno de Luis"); assert.equal(l.etiqueta, TAG_PARED); assert.equal(TAG_PARED, "En su pared (AR)");
  assert.equal(letreroDe({ ...curioso(), b: { ...luis, pared: false } }, 3).etiqueta, null, "both at the board: no tag");
  assert.equal(letreroDe({ ...curioso(), b: { entity: 7, nombre: "Luis", puntos: 9 } }, 3).etiqueta, null, "a v1-shaped player: no tag");
  const yo = letreroDe({ ...curioso(), yo: true, miTurno: false, rival: luis, yoPuntos: 12 }, 3);
  assert.equal(yo.panel.filas[0].yo, true, "the thrower in the world sees «tú» on their row");
});

test("sign: hidden without a duel, the invitation while a host waits alone, the result at the end", () => {
  assert.equal(letreroDe(null, 3).panel.fase, "nada"); assert.deepEqual(letreroDe(null, 3).pie, []);
  const espera: DueloV = { ronda: 0, esperando: true, turnoDe: null, yo: false, miTurno: false, rival: null, yoPuntos: 0, a: { ...ana, pared: true }, b: null, fin: null };
  const e = letreroDe(espera, 3);
  assert.equal(e.panel.fase, "espera"); assert.equal(e.pie.join(" "), INVITACION); assert.match(INVITACION, /¿juegas desde tu pared \(AR\)\?/);
  assert.equal(e.etiqueta, TAG_PARED, "a host on a wall waiting: the tag too");
  const fin = letreroDe({ ...curioso(), turnoDe: null, fin: { ganador: 7, empate: false, abandono: false, texto: "Gana Luis 21-12", gane: false } }, 3);
  assert.equal(fin.panel.fase, "fin"); assert.equal(fin.panel.pie, "Gana Luis 21-12", "a bystander reads the server's sentence");
});

test("sign: repaints only when the content changes (the key) and paints the canvas calls it needs", () => {
  const k = (d: DueloV | null) => claveLetrero(letreroDe(d, 3));
  assert.equal(k(curioso()), k(curioso()));
  assert.notEqual(k(curioso()), k({ ...curioso(), a: { ...ana, puntos: 20 } }));
  assert.notEqual(k(curioso()), k({ ...curioso(), turnoDe: 3 }));
  assert.notEqual(k(curioso()), k({ ...curioso(), b: { ...luis, pared: false } }));
  const textos: string[] = [];
  const ctx = new Proxy({}, { get: (_t, p) => (p === "fillText" ? (t: string) => textos.push(t) : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D;
  pintarLetrero(ctx, letreroDe(curioso(), 3));
  assert.ok(textos.includes("Ana") || textos.some((t) => t.includes("Ana"))); assert.ok(textos.includes(TAG_PARED));
  textos.length = 0; pintarLetrero(ctx, letreroDe(null, 3)); assert.equal(textos.length, 0, "nothing painted without a duel");
  assert.ok(LETRERO_PX.h > 192);
});

test("darts: only a remote player's fresh dart of a live duel flies; v1 boards, the thrower at the board and old darts do not", () => {
  const d = curioso(), ahora = 10_000;
  const x = (quien: number, ms: number, sitio = "torre") => ({ quien, sitio, cuando: ahora - ms });
  assert.equal(enPared(d, 7), true); assert.equal(enPared(d, 3), false);
  assert.equal(debeVolar(d, { ...x(7, 50), sitio: "torre" }, ahora), false, "wrong board name");
  assert.equal(debeVolar({ ...d, sitio: "torre" }, x(7, 50), ahora), true);
  assert.equal(debeVolar({ ...d, sitio: "torre" }, x(3, 50), ahora), false, "the player at the board: sticks as in v1");
  assert.equal(debeVolar({ ...d, sitio: "torre" }, x(7, RECIENTE_MS + 1), ahora), false, "already there when you arrived");
  assert.equal(debeVolar(null, x(7, 50), ahora), false, "no duel (a plain board)");
  assert.equal(debeVolar({ ...d, sitio: "torre", fin: { ganador: 7, empate: false, abandono: false, texto: "", gane: false } }, x(7, 50), ahora), false);
  assert.equal(debeVolar({ ...d, sitio: "torre" }, { quien: 7, sitio: "torre" }, ahora), false, "no timestamp: do not guess");
});

test("darts: the arc starts above-left of the board, ends where the stuck dart sits, and takes the AR flight time", () => {
  for (const [x, y] of [[0, 0], [0.4, 0.3], [-0.5, -0.2]]) {
    const a = salidaPlaza(x, y), b = destinoPlaza(x, y);
    assert.ok(a.x < b.x && a.y > b.y && a.z > b.z, "from the left, above and in front");
    const v0 = vueloRival(a, b, 0), v1 = vueloRival(a, b, VUELO_RIVAL_S);
    assert.deepEqual(v0.pos, a); assert.equal(v1.lista, true); assert.ok(Math.abs(v1.pos.x - b.x) < 1e-9 && Math.abs(v1.pos.y - b.y) < 1e-9);
    assert.ok(vueloRival(a, b, VUELO_RIVAL_S / 2).pos.y > (a.y + b.y) / 2 - 1e-9, "the arc lifts in the middle");
  }
  assert.ok(destinoPlaza(3, 3).y < 0, "a dart way off the board ends under it");
});

// ---- the wire field and the controller, with a real server -------------------------------------------------------
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
function mundo() {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: [{ id: "torre", nombre: "Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true }] })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: 4 }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts });
    return { t, s, d: cli.dardos };
  });
  const pump = (n = 1) => { for (let i = 0; i < n; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (c: (typeof pages)[number], x: number, z: number) => { inst.sim.tf.cols.x[c.s.entity] = fx(x); inst.sim.tf.cols.z[c.s.entity] = fx(z); };
  pump(2); const [A, B, C, D] = pages; place(A, 8, 0); place(B, 510, 0); place(C, 12, 2); place(D, -1500, 0); pump(12);
  return { pages, pump, place, A, B, C, D };
}

test("controller + wire: a bystander near the board reads the waiting host, the wall guest's tag, the turns and the result; the player at the board gets yo", () => {
  const W = mundo(); const { A, B, C, D, pump } = W;
  assert.equal(C.d.duelo(), null);
  A.d.jugar("torre"); pump(3);
  let c = C.d.duelo()!; assert.deepEqual([c.yo, c.esperando, c.a.nombre, c.a.pared, c.b], [false, true, A.s.who!.nombre, false, null]);
  assert.equal(letreroDe(c, 3).pie.join(" "), INVITACION);
  assert.equal(D.d.duelo(), null, "far away: no sign");
  B.d.jugar("torre", "pared"); pump(3);
  c = C.d.duelo()!; assert.deepEqual([c.esperando, c.yo, c.miTurno, c.a.pared, c.b!.pared, c.turnoDe], [false, false, false, false, true, A.s.entity]);
  assert.equal(letreroDe(c, 3).etiqueta, TAG_PARED);
  const a = A.d.duelo()!; assert.deepEqual([a.yo, a.miTurno, a.rival!.pared], [true, true, true], "the thrower at the board sees the rival is on a wall");
  assert.equal(enPared(a, B.s.entity), true); assert.equal(enPared(a, A.s.entity), false);
  assert.equal(letreroDe(a, 3).panel.filas[0].yo, true);
  // a dart of the host (at the board): the bystander sees it, and it must NOT be flown in; then the guest's own
  for (let i = 0; i < 3; i++) { A.d.lanzar(0, 0.6, FUERZA_IDEAL, "torre"); pump(7); }
  const delHost = C.d.clavados("torre").find((x) => x.quien === A.s.entity)!; assert.ok(delHost, "the bystander has the host's darts while he removes them");
  A.d.cambiar(); pump(3); // v3: the host presses «cambiar» and his darts come out
  B.d.lanzar(0, 0.6, FUERZA_IDEAL, "torre"); pump(3);
  const mios = C.d.clavados("torre"), suyo = mios.find((x) => x.quien === B.s.entity)!;
  assert.ok(suyo && !mios.some((x) => x.quien === A.s.entity), "the bystander has the guest's dart; the host's came out with the change");
  const d = C.d.duelo()!;
  assert.equal(debeVolar(d, suyo, performance.now()), true, "the wall player's dart flies in");
  assert.equal(debeVolar(d, delHost, performance.now() + 0), false, "the dart of the player at the board does not");
  assert.equal(letreroDe(d, 3).panel.filas.find((f) => f.turno)!.nombre, B.s.who!.nombre);
});

test("controller: a bystander forgets a host that gave up waiting (the sign must not wait forever); a v1 board gives no duel", () => {
  const W = mundo(); const { A, C, pump } = W;
  A.d.jugar("torre"); pump(3); assert.equal(C.d.duelo()?.esperando, true);
  const visto: string[] = []; C.d.alCambiar((q) => visto.push(q));
  A.d.salir(); pump(3);
  assert.equal(C.d.duelo(), null, "the wait was cancelled: the sign is gone"); assert.ok(visto.includes("duelo"));
  assert.equal(A.d.duelo(), null);
});

test("controller: a bystander who walks into a live match sees it at once, and sees the result when it ends", () => {
  const W = mundo(); const { A, B, C, pump, place } = W;
  place(C, -1500, 0); pump(12); assert.equal(C.d.duelo(), null);
  A.d.jugar("torre"); B.d.jugar("torre", "pared"); pump(3);
  place(C, 12, 2); pump(12);
  // the next change of the match (a dart) reaches the newcomer
  A.d.lanzar(0, 0.6, FUERZA_IDEAL, "torre"); pump(3);
  const c = C.d.duelo()!; assert.ok(c && c.ronda >= 1 && c.a.pared === false && c.b!.pared === true);
  A.d.salir(); pump(3);
  const f = C.d.duelo()!; assert.ok(f.fin && f.fin.abandono); assert.equal(letreroDe(f, 3).panel.fase, "fin");
  assert.equal(letreroDe(f, 3).etiqueta, TAG_PARED, "the tag stays with the result");
});
