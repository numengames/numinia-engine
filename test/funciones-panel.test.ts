// funciones/f3 · the «Funciones de este mundo» block of the Entorno panel as pure data: which rows, what they say, whether they can be pressed.
// The page (apps/plaza/entorno.ts) only draws them; the browser leg tools/e2e-piernas/funciones-interruptores.mjs checks the drawing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCIONES } from "../features/funciones/feature.ts";
import { FRASES, filasFunciones, idiomaDe, textoCambio, tituloGrupo } from "../features/funciones/panel.ts";
import { FRASES_ES } from "../features/funciones/frases.es.ts";
import { FRASES_EN } from "../features/funciones/frases.en.ts";

test("f3 rows: one per function the world has, in the panel's order, with the server's state", () => {
  const filas = filasFunciones({ actual: { pesca: false, normas: true, dardos: true }, fija: {}, puede: true });
  assert.deepEqual(filas.map((f) => f.funcion), ["normas", "dardos", "pesca"]);
  assert.deepEqual(filas.map((f) => f.etiqueta), ["Normas de entrada", "Dardos", "Pesca"]);
  assert.deepEqual(filas.map((f) => f.activa), [true, true, false]);
  assert.deepEqual(filas.map((f) => f.estado), ["encendida", "encendida", "apagada"]);
  assert.ok(filas.every((f) => f.pulsable && !f.fija && f.titulo.length > 20));
});

test("f3 rows: a function the world lacks has no row (no conditions, no «Normas de entrada»)", () => {
  assert.deepEqual(filasFunciones({ actual: { dardos: true, pesca: true }, fija: {}, puede: true }).map((f) => f.funcion), ["dardos", "pesca"]);
  assert.deepEqual(filasFunciones({ actual: {}, fija: {}, puede: true }), []);
});

test("f3 rows: whoever cannot build sees nothing", () => {
  assert.deepEqual(filasFunciones({ actual: { normas: true, dardos: true, pesca: true }, fija: {}, puede: false }), []);
});

test("f3 rows: «fija» = shown with its state, not pressable, and says the server fixes it", () => {
  const [normas, dardos] = filasFunciones({ actual: { normas: false, dardos: true }, fija: { normas: true }, puede: true });
  assert.equal(normas.fija, true); assert.equal(normas.pulsable, false); assert.equal(normas.activa, false);
  assert.deepEqual(normas.notas, ["Apagadas, se entra sin aceptar normas. Para demos.", "Lo fija el servidor."]);
  assert.equal(dardos.pulsable, true); assert.deepEqual(dardos.notas, []);
});

test("f3 rows: the help line sits under «Normas de entrada» only", () => {
  const filas = filasFunciones({ actual: { normas: true, dardos: true, pesca: true }, fija: {}, puede: true });
  assert.deepEqual(filas.map((f) => f.notas), [["Apagadas, se entra sin aceptar normas. Para demos."], [], []]);
});

test("f3 rows: the same state and language always give the same rows; English says it in English", () => {
  const e = { actual: { normas: true, dardos: false }, fija: {}, puede: true };
  assert.deepEqual(filasFunciones(e, "es"), filasFunciones(e, "es"));
  const en = filasFunciones(e, "en-GB");
  assert.deepEqual(en.map((f) => f.etiqueta), ["Conditions of entry", "Darts"]);
  assert.equal(en[0].notas[0], "When off, people enter without accepting any conditions. For demos.");
  assert.equal(tituloGrupo("en"), "Features of this world"); assert.equal(tituloGrupo("es"), "Funciones de este mundo");
});

test("f3 language: unknown or missing falls back to Spanish and nothing throws", () => {
  assert.equal(idiomaDe(undefined), "es"); assert.equal(idiomaDe("ja"), "es"); assert.equal(idiomaDe("pt-BR"), "es"); assert.equal(idiomaDe("EN_us"), "en");
  assert.equal(tituloGrupo(42), "Funciones de este mundo");
  assert.deepEqual(filasFunciones(null as never), []);
  assert.deepEqual(filasFunciones({ puede: true } as never), []);
  assert.equal(textoCambio("otra" as never, "encendida"), "");
  assert.equal(textoCambio("dardos", "raro" as never), "");
});

test("f3 status line: asking, done and refused-because-fixed, with the function's name", () => {
  assert.equal(textoCambio("dardos", "encendiendo"), "Encendiendo: Dardos…");
  assert.equal(textoCambio("pesca", "apagando"), "Apagando: Pesca…");
  assert.equal(textoCambio("normas", "apagada"), "Normas de entrada: apagada.");
  assert.equal(textoCambio("normas", "encendida", "en"), "Conditions of entry: on.");
  assert.match(textoCambio("normas", "fija"), /la fija el servidor/);
});

test("f3 texts: every language has exactly the keys and the {parameters} of Spanish, and every function a label and a title", () => {
  const claves = Object.keys(FRASES_ES).sort();
  assert.deepEqual(Object.keys(FRASES_EN).sort(), claves);
  for (const k of claves) {
    const par = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(par(FRASES_EN[k as keyof typeof FRASES_EN]), par(FRASES_ES[k as keyof typeof FRASES_ES]), `parameters of ${k}`);
    assert.ok(FRASES_ES[k as keyof typeof FRASES_ES].length > 0 && FRASES_EN[k as keyof typeof FRASES_EN].length > 0, `${k} is empty`);
  }
  for (const f of FUNCIONES) for (const p of ["funcion", "titulo"]) assert.ok(`${p}.${f}` in FRASES.es && `${p}.${f}` in FRASES.en, `${p}.${f}`);
});
