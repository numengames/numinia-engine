// dardos enlazados (E2) — the AR chooser without a browser: the words and decisions of apps/plaza/ar-elegir-logica.ts, the norms'
// bubble's words when it asks for ANOTHER world's norms (condiciones-logica.ts `textosDePaso(..., enlazada)`), and the promise that the
// page's own AR button is untouched where no link applies (the chooser draws nothing until it is opened). The real clicks (the chooser, the
// norms step, `requestSession` inside the click) are tools/e2e-piernas/dardos-enlace.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoParaPersonas, nombreDelEnlace, rotuloDardos, vistaElegir, ROTULO_MESA, ROTULO_REINTENTAR } from "../apps/plaza/ar-elegir-logica.ts";
import type { EstadoEnlaceDardos } from "../apps/plaza/dardos-enlace.ts";
import { planificar, SUBTITULO_ENLAZADA, textosDePaso } from "../apps/plaza/condiciones-logica.ts";
import { ENLACE_DARDOS } from "../features/dardos/enlace.ts";
import type { CondicionesCapa } from "../packages/net/src/index.ts";

const torre = { servidor: ENLACE_DARDOS.servidor };
const otro = { servidor: "ws://127.0.0.1:8913/ws" };

test("nombre: the house link is «la Torre»; another server is its address", () => {
  assert.deepEqual(nombreDelEnlace(torre), { corto: "la Torre", largo: "la Torre de los Alquimistas" });
  assert.deepEqual(nombreDelEnlace(otro), { corto: "127.0.0.1:8913", largo: "127.0.0.1:8913" });
  assert.equal(rotuloDardos("la Torre"), "Dardos de la Torre en tu pared");
  assert.equal(ROTULO_MESA, "El mundo en tu mesa");
});

test("chooser: while the link connects the darts button waits (on, focusable, does nothing); the miniature is not part of it", () => {
  for (const e of ["cerrado", "conectando"] as EstadoEnlaceDardos[]) {
    const v = vistaElegir(e, "", torre);
    assert.equal(v.dardos.texto, "Dardos de la Torre en tu pared");
    assert.deepEqual([v.dardos.accion, v.dardos.apagado, v.reintentar, v.fallo], ["esperar", true, false, ""]);
    assert.match(v.dardos.ayuda, /Conectando con la Torre/);
  }
});

test("chooser: gate shut → the button leads to the norms; accepted → «go»; ready → «go»", () => {
  const p = vistaElegir("puerta", "", torre);
  assert.deepEqual([p.dardos.accion, p.dardos.apagado], ["normas", false]);
  assert.match(p.dardos.ayuda, /aceptar las normas de la Torre/);
  const l = vistaElegir("listo", "", torre), a = vistaElegir("listo", "", torre, { aceptadas: true });
  assert.deepEqual([l.dardos.accion, l.dardos.apagado, a.dardos.accion, a.dardos.apagado], ["entrar", false, "entrar", false]);
  assert.match(a.dardos.ayuda, /Normas aceptadas/);
  assert.doesNotMatch(l.dardos.ayuda, /Normas aceptadas/);
});

test("chooser: an error is plain Spanish with «Reintentar»; the darts button is off", () => {
  const v = vistaElegir("error", "el mundo enlazado está lleno", torre);
  assert.deepEqual([v.dardos.accion, v.dardos.apagado, v.reintentar], ["reintentar", true, true]);
  assert.equal(v.fallo, "La Torre está llena ahora mismo. Prueba en un rato o entra con la maqueta.");
  assert.equal(ROTULO_REINTENTAR, "Reintentar");
});

test("motivo: every reason the link gives becomes one sentence for people, never a code", () => {
  const casos: [string, RegExp][] = [
    ["el mundo enlazado está lleno", /llena/], ["el mundo enlazado no te deja entrar", /no te deja entrar/], ["el mundo enlazado no responde", /no responde/],
    ["no se pudo llegar a alchemiststower.numinia.com", /No se puede llegar a la Torre/], ["no se pudo abrir x: boom", /No se puede llegar/], ["conexión cerrada (1006)", /conexión con la Torre/], ["", /Ahora no se puede jugar en la Torre/], ["algo raro 4999", /Ahora no se puede jugar/],
  ];
  for (const [m, re] of casos) { const t = motivoParaPersonas(m, "la Torre"); assert.match(t, re, m); assert.doesNotMatch(t, /\b\d{4}\b|wss?:|Error/, `no codes in «${t}»`); assert.ok(t.length < 110, t); }
});

test("chooser: AR itself failing (permission, device) while the link is fine keeps the button on and says why", () => {
  const v = vistaElegir("listo", "", torre, { falloAR: "El navegador no ha dado permiso para la realidad aumentada." });
  assert.deepEqual([v.dardos.accion, v.dardos.apagado, v.reintentar], ["entrar", false, false]);
  assert.match(v.fallo, /permiso/);
  assert.equal(vistaElegir("error", "x", torre, { falloAR: "no" }).dardos.accion, "reintentar", "a dead link is not an AR failure: the link's own reason wins");
});

test("chooser: playing → nothing to press", () => { assert.deepEqual([vistaElegir("jugando", "", torre).dardos.accion, vistaElegir("jugando", "", torre).dardos.apagado], ["nada", true]); });

test("norms of another world: the bubble speaks of THAT world and says that refusing costs nothing here", () => {
  const capas: CondicionesCapa[] = [
    { capa: "casa", version: "1.0", puntos: [{ id: "t", titulo: "Trato", texto: "Sin acoso.", obligatorio: true, tipo: "norma" }, { id: "d", titulo: "Informe", texto: "Rendimiento.", obligatorio: false, tipo: "datos" }] },
    { capa: "comunidad", nombre: "Alquimistas", version: "A", puntos: [{ id: "u", titulo: "Turnos", texto: "Respeta.", obligatorio: true, tipo: "norma" }] },
  ];
  const pasos = planificar(capas, null);
  const casa = textosDePaso(pasos[0], capas, "la Torre de los Alquimistas", true);
  assert.equal(casa.eyebrow, "Antes de entrar · la Torre de los Alquimistas");
  assert.equal(casa.titulo, "Las normas de la Torre de los Alquimistas");
  assert.equal(casa.subtitulo, SUBTITULO_ENLAZADA);
  assert.doesNotMatch(casa.subtitulo, /burbuja|nadie te oye/);
  assert.equal(textosDePaso(pasos[1], capas, "la Torre de los Alquimistas", true).titulo, "Las normas de Alquimistas");
  // the data step is the world's own words, unchanged: optional, nothing ticked
  const datos = pasos.find((p) => p.tipo === "datos")!;
  assert.match(textosDePaso(datos, capas, "x", true).subtitulo, /opcional/);
  // and without the flag nothing changed for the world's own bubble
  assert.match(textosDePaso(pasos[0], capas, "Mi mundo").subtitulo, /burbuja/);
  assert.equal(textosDePaso(pasos[0], capas, "Mi mundo").titulo, "Las normas de este sitio");
});
