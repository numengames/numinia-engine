// ia-visible S4: which name plate an entity gets. An AI's plate is always on, green, with an «IA» chip (and a moon asleep);
// a person's plate keeps the rules of carteles.ts. Pure: the drawing (canvas) is checked in the browser leg.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estiloCartel, nombreSinMarca, VERDE_IA } from "../packages/render/src/ia-marca.ts";
import { nombreVisible } from "../packages/render/src/carteles.ts";

test("a person has no AI style: their plate is the plain one", () => {
  assert.equal(estiloCartel(null), null);
  assert.equal(estiloCartel(undefined), null);
  assert.equal(estiloCartel("otra-cosa" as never), null, "an unknown state never makes a person look like an AI");
});

test("an active AI: green border, «IA» chip, no moon, always on", () => {
  const e = estiloCartel("activa")!;
  assert.equal(e.siempre, true);
  assert.equal(e.chip, "IA");
  assert.equal(e.borde, VERDE_IA);
  assert.equal(e.chipFondo, VERDE_IA);
  assert.equal(e.luna, false);
});

test("a sleeping AI: the same chip and a moon, a calmer green, dimmer letters", () => {
  const a = estiloCartel("activa")!, d = estiloCartel("dormida")!;
  assert.equal(d.chip, "IA");
  assert.equal(d.luna, true);
  assert.notEqual(d.borde, a.borde);
  assert.notEqual(d.tinta, a.tinta);
});

test("the same green as the map's diamond for an agent", () => {
  assert.equal(VERDE_IA, "#14897a");
});

test("the chip replaces the server's « · IA» suffix; a name that is only the suffix is kept", () => {
  assert.equal(nombreSinMarca("Hermes · IA"), "Hermes");
  assert.equal(nombreSinMarca("Ana"), "Ana");
  assert.equal(nombreSinMarca(" · IA"), " · IA");
  assert.equal(nombreSinMarca("Hermes · IA · leyendo las normas…"), "Hermes · IA · leyendo las normas…");
});

test("an AI's plate shows without looking at it; a person's still needs a look, a word or Alt", () => {
  const nada = { todos: false, mirado: false, habla: false };
  assert.equal(nombreVisible(nada), false, "a person, far from your gaze: no plate");
  assert.equal(nombreVisible({ ...nada, ia: true }), true);
  assert.equal(nombreVisible({ ...nada, ia: false }), false);
  assert.equal(nombreVisible({ ...nada, mirado: true }), true);
  assert.equal(nombreVisible({ ...nada, habla: true }), true);
  assert.equal(nombreVisible({ ...nada, todos: true }), true);
});
