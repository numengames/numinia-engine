// ux2-gente: the friends list kept in this browser (apps/plaza/amigos.ts) — pure, no page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerAmigos, escribirAmigos, anadir, quitar, esAmigo, fusionar, filtrar, haceTexto, fechaTexto, distanciaTexto, claveDe, leerMarcas, escribirMarcas, AMIGOS_MAX } from "../apps/plaza/amigos.ts";

const T0 = Date.parse("2026-10-19T10:00:00Z"), MIN = 60_000, DIA = 86_400_000;
const lucia = { quien: 7, nombre: "Lucía", huella: "0123456789abcdef", avatar: "astrodisco" };
const marcos = { quien: 9, nombre: "Marcos", huella: "fedcba9876543210", avatar: "skelly" };

test("amigos: add once, by the identity's tag (by name only without one); remove; the stored text reads back", () => {
  let l = anadir([], lucia, T0);
  l = anadir(l, lucia, T0 + 5);
  assert.equal(l.length, 1, "once");
  assert.deepEqual(l[0], { clave: "h:0123456789abcdef", nombre: "Lucía", avatar: "astrodisco", desde: T0, visto: T0 });
  l = anadir(l, { quien: 3, nombre: "Ána  María" }, T0);
  assert.equal(l[1].clave, "n:ana maria", "no tag: by name, without accents or case");
  assert.ok(esAmigo(l, { nombre: "ANA MARIA" }) && esAmigo(l, { nombre: "Otra", huella: lucia.huella }) && !esAmigo(l, marcos));
  assert.deepEqual(leerAmigos(escribirAmigos(l)), l);
  assert.deepEqual(quitar(l, claveDe(lucia)).map((a) => a.nombre), ["Ána  María"]);
});

test("amigos: whatever is stored never breaks the page (junk, an old shape, duplicates)", () => {
  assert.deepEqual(leerAmigos(null), []);
  assert.deepEqual(leerAmigos("{no es json"), []);
  assert.deepEqual(leerAmigos('{"a":1}'), []);
  const l = leerAmigos(JSON.stringify([{ clave: "h:aa", nombre: "A", desde: "x" }, { clave: "h:aa", nombre: "A2" }, { clave: "zz", nombre: "B" }, { clave: "n:c" }, 5, null]));
  assert.deepEqual(l, [{ clave: "h:aa", nombre: "A", avatar: null, desde: 0, visto: 0 }]);
});

test("amigos: beyond the cap, the one seen longest ago leaves", () => {
  let l = Array.from({ length: AMIGOS_MAX }, (_, i) => ({ clave: `h:${i}`, nombre: `P${i}`, avatar: null, desde: T0, visto: T0 + i }));
  l[50].visto = T0 - DIA;
  l = anadir(l, lucia, T0 + DIA);
  assert.equal(l.length, AMIGOS_MAX);
  assert.ok(!l.some((a) => a.clave === "h:50") && esAmigo(l, lucia));
});

test("amigos: merged with who is connected now — online first by name, offline by last seen; the record follows a new name", () => {
  let l = anadir(anadir([], lucia, T0 - 3 * DIA), marcos, T0 - 3 * DIA);
  l = anadir(l, { quien: 2, nombre: "Ana" }, T0 - 3 * DIA);
  l[2].visto = T0 - 2 * DIA;
  const f = fusionar(l, [{ ...lucia, nombre: "Lucía R.", quien: 11 }, { quien: 2, nombre: "ana", huella: "1111222233334444" }, { quien: 5, nombre: "Nadie" }], T0);
  assert.deepEqual(f.conectados.map((x) => [x.amigo.nombre, x.persona.quien]), [["ana", 2], ["Lucía R.", 11]]);
  assert.equal(f.conectados[0].amigo.clave, "h:1111222233334444", "a friend saved by name moves to their tag once seen with one");
  assert.deepEqual(f.desconectados.map((a) => a.nombre), ["Marcos"]);
  assert.ok(f.cambio);
  assert.equal(f.lista.find((a) => a.clave === claveDe(lucia))!.visto, T0, "last seen = now");
  const g = fusionar(f.lista, [{ ...lucia, nombre: "Lucía R.", quien: 11 }], T0 + 10_000);
  assert.equal(g.cambio, false, "nothing new within a minute: no write");
  assert.equal(fusionar(g.lista, [{ ...lucia, nombre: "Lucía R.", quien: 11 }], T0 + 2 * MIN).cambio, true, "«last seen» moves once a minute");
  const h = fusionar(l, [], T0);
  assert.deepEqual(h.desconectados.map((a) => a.nombre), ["Ana", "Lucía", "Marcos"], "the most recently seen first, then by name");
});

test("amigos: the search box, the times and the distances read like people talk", () => {
  assert.deepEqual(filtrar([lucia, marcos], "luc").map((p) => p.nombre), ["Lucía"]);
  assert.deepEqual(filtrar([lucia, marcos], "  ").length, 2);
  assert.equal(haceTexto(T0 - 30_000, T0), "hace un momento");
  assert.equal(haceTexto(T0 - 5 * MIN, T0), "hace 5 min");
  assert.equal(haceTexto(T0 - 3 * 3_600_000, T0), "hace 3 h");
  assert.equal(haceTexto(T0 - DIA, T0), "hace 1 día");
  assert.equal(haceTexto(T0 - 2 * DIA, T0), "hace 2 días");
  assert.equal(haceTexto(T0 - 90 * DIA, T0), "hace 3 meses");
  assert.equal(haceTexto(0, T0), "sin ver todavía");
  assert.equal(fechaTexto(new Date(2026, 9, 3, 12).getTime(), T0), "3 de octubre");
  assert.equal(fechaTexto(new Date(2025, 0, 9, 12).getTime(), T0), "9 de enero de 2025");
  assert.equal(distanciaTexto(40.4), "a 40 m");
  assert.equal(distanciaTexto(1.2), "a tu lado");
});

test("amigos: muted and blocked marks keep the name they had, and junk reads as none", () => {
  const m = new Map([["h:0123456789abcdef", "Lucía"], ["n:ana", "Ana"]]);
  assert.deepEqual(leerMarcas(escribirMarcas(m)), m);
  assert.equal(leerMarcas("[1,2]").size, 0);
  assert.equal(leerMarcas("nope").size, 0);
  assert.equal(leerMarcas('{"x":"y","h:1":2}').size, 0);
});
