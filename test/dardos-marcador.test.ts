// dardos in VR, the scoreboard (v6): what it says (names, points, «Te toca» / «Le toca a X», the button that passes the turn),
// where its button is, how big its letters are, and that the 3-dart turn agrees with the server's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { marcadorDe, marcadorPara, disposicion, enBoton, letraGrados, LETRA_PX, DARDOS_POR_TURNO, FIN_VISIBLE_MS, ANCHO_PX } from "../packages/render/src/dardos-marcador.ts";
import type { SoloV } from "../packages/render/src/dardos-marcador.ts";
import type { DueloV } from "../packages/render/src/dardos-duelo.ts";
import { DARDOS_TURNO } from "../features/dardos/client.ts";

const SIN: SoloV = { sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null };
const ana = { entity: 5, nombre: "Ana", puntos: 41, yo: true }, luis = { entity: 7, nombre: "Luis", puntos: 28 };
const duelo = (o: Partial<DueloV> = {}): DueloV => ({ sitio: "d1", ronda: 2, esperando: false, turnoDe: 5, yo: true, miTurno: true, rival: luis, yoPuntos: 41, a: ana, b: luis, fin: null, equipos: [ana, luis], retirando: false, puedeCambiar: true, ...o });

test("a solo turn counts the darts left and shows the last dart; nothing without a turn", () => {
  assert.equal(DARDOS_POR_TURNO, DARDOS_TURNO);
  assert.equal(marcadorDe({ solo: SIN, duelo: null, rondas: 3, ahora: 0 }), null);
  const m = marcadorDe({ solo: { ...SIN, sitio: "d1", dardos: 1, tirada: 60, ultimo: { texto: "Triple 20 · 60", puntos: 60 } }, duelo: null, rondas: 3, ahora: 0 })!;
  assert.equal(m.fase, "solo"); assert.equal(m.pie, "Te toca · 2 dardos"); assert.equal(m.nota, "Triple 20 · 60"); assert.equal(m.filas[0].puntos, 60); assert.equal(m.boton, null);
  const ultimo = marcadorDe({ solo: { ...SIN, sitio: "d1", dardos: 2, tirada: 80, ultimo: { texto: "20 · 20", puntos: 20 } }, duelo: null, rondas: 3, ahora: 0 })!;
  assert.equal(ultimo.pie, "Te toca · 1 dardo");
  // a stale last dart (from the previous turn) is not shown before the first dart of this one
  assert.equal(marcadorDe({ solo: { ...SIN, sitio: "d1", ultimo: { texto: "viejo", puntos: 1 } }, duelo: null, rondas: 3, ahora: 0 })!.nota, "");
});

test("after a solo turn the panel says it ended and offers «Otro turno» for a while", () => {
  const solo: SoloV = { ...SIN, ultimo: { texto: "5 · 5", puntos: 5 }, fin: { dardos: 3, puntos: 77, cuando: 1000 } };
  const m = marcadorDe({ solo, duelo: null, rondas: 3, ahora: 2000 })!;
  assert.equal(m.fase, "fin-solo"); assert.equal(m.pie, "Turno acabado"); assert.equal(m.boton, "otra"); assert.equal(m.filas[0].puntos, 77);
  assert.equal(marcadorDe({ solo, duelo: null, rondas: 3, ahora: 1000 + FIN_VISIBLE_MS + 1 }), null);
});

test("a duel: names, points, whose turn; «Te toca» / «Le toca a X»; «Pasar turno» only once the visit is over", () => {
  const mio = marcadorDe({ solo: { ...SIN, sitio: "d1", dardos: 1 }, duelo: duelo(), rondas: 3, ahora: 0 })!;
  assert.equal(mio.fase, "juego"); assert.equal(mio.titulo, "Ronda 2/3");
  assert.deepEqual(mio.filas.map((f) => [f.nombre, f.puntos, f.turno, f.yo]), [["Ana", 41, true, true], ["Luis", 28, false, false]]);
  assert.equal(mio.pie, "Te toca · 2 dardos"); assert.equal(mio.boton, null); assert.equal(mio.tono, "bien");
  const retira = marcadorDe({ solo: { ...SIN, sitio: "d1", dardos: 3 }, duelo: duelo({ retirando: true }), rondas: 3, ahora: 0 })!;
  assert.equal(retira.pie, "Pasa el turno"); assert.equal(retira.boton, "cambiar");
  const suyo = marcadorDe({ solo: SIN, duelo: duelo({ miTurno: false, turnoDe: 7 }), rondas: 3, ahora: 0 })!;
  assert.equal(suyo.pie, "Le toca a Luis"); assert.equal(suyo.boton, null); assert.equal(suyo.tono, "neutro");
  assert.deepEqual(suyo.filas.map((f) => f.turno), [false, true]);
});

test("a duel waiting, with the host's «Empezar», and its end", () => {
  const e = marcadorDe({ solo: SIN, duelo: duelo({ esperando: true, ronda: 0, puedeEmpezar: true, turnoDe: null }), rondas: 3, ahora: 0 })!;
  assert.equal(e.fase, "espera"); assert.equal(e.boton, "empezar"); assert.equal(e.pie, "Pulsa Empezar");
  const w = marcadorDe({ solo: SIN, duelo: duelo({ esperando: true, ronda: 0, turnoDe: null, equipos: [ana] }), rondas: 3, ahora: 0 })!;
  assert.equal(w.boton, null); assert.equal(w.pie, "Esperando rival");
  const f = marcadorDe({ solo: SIN, duelo: duelo({ fin: { ganador: 5, empate: false, abandono: false, texto: "Gana Ana 90-60", gane: true } }), rondas: 3, ahora: 0 })!;
  assert.equal(f.fase, "fin"); assert.equal(f.pie, "Ganas"); assert.equal(f.tono, "bien"); assert.equal(f.boton, null);
});

test("a bystander of a match sees nothing of it; marcadorPara picks the board", () => {
  assert.equal(marcadorDe({ solo: SIN, duelo: duelo({ yo: false }), rondas: 3, ahora: 0 }), null);
  const r = marcadorPara({ solo: SIN, duelo: duelo(), sitios: [{ id: "d1", rondas: 5 }], ultimoSitio: "otra", ahora: 0 });
  assert.equal(r.sitio, "d1"); assert.equal(r.marcador!.titulo, "Ronda 2/5");
  const s = marcadorPara({ solo: { ...SIN, fin: { dardos: 3, puntos: 9, cuando: 0 } }, duelo: null, sitios: [], ultimoSitio: "d2", ahora: 10 });
  assert.equal(s.sitio, "d2"); assert.equal(s.marcador!.boton, "otra");
  assert.deepEqual(marcadorPara({ solo: SIN, duelo: null, sitios: [], ultimoSitio: "", ahora: 0 }), { sitio: "", marcador: null });
});

test("legibility: the smallest letter is at least 1.2° at 3 m, and the button is a rectangle you can hit", () => {
  assert.ok(letraGrados(LETRA_PX, 3) >= 1.2, `${letraGrados(LETRA_PX, 3)}°`);
  const m = marcadorDe({ solo: { ...SIN, sitio: "d1", dardos: 3 }, duelo: duelo({ retirando: true }), rondas: 3, ahora: 0 })!;
  const L = disposicion(m), b = L.boton!;
  assert.ok(b && b.w > ANCHO_PX / 2 && b.h >= 80 && b.y + b.h < L.alto);
  assert.ok(enBoton(m, b.x + b.w / 2, b.y + b.h / 2)); assert.ok(!enBoton(m, b.x + b.w / 2, b.y - 20)); assert.ok(!enBoton(m, -5, b.y + 5));
  const sin = marcadorDe({ solo: { ...SIN, sitio: "d1" }, duelo: null, rondas: 3, ahora: 0 })!;
  assert.equal(disposicion(sin).boton, null); assert.ok(!enBoton(sin, 100, 300)); assert.ok(!enBoton(null, 100, 300));
});
