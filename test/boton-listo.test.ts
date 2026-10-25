// MIS-200 (t_9687b5fc): «Entrar en VR» / «Entrar en AR» wait while the world still loads, with a ceiling; the state is text too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearListo, aspectoBoton, TECHO_LISTO_MS, TEXTO_PREPARANDO, MOTIVO_PREPARANDO } from "../apps/plaza/boton-listo.ts";

test("loading → disabled → enabled: the entry waits while the world loads, then opens and stays open", () => {
  const b = crearListo();
  assert.equal(b.actualizar(true, 0), false, "loading at once: disabled");
  assert.equal(b.actualizar(true, 1000), false, "still loading");
  assert.equal(b.actualizar(false, 1500), true, "loading ended: enabled");
  assert.equal(b.actualizar(true, 1600), true, "sticky: a later model load does not grey it out again");
  assert.equal(b.listo, true);
});

test("nothing loading: enabled at once, no wait", () => {
  assert.equal(crearListo().actualizar(false, 0), true);
});

test("ceiling: a world that never settles still enables the buttons after 6 s of waiting", () => {
  assert.equal(TECHO_LISTO_MS, 6000);
  const b = crearListo();
  assert.equal(b.actualizar(true, 100), false, "the wait starts at the first busy reading");
  assert.equal(b.actualizar(true, 100 + 5999), false, "just before the ceiling: still waiting");
  assert.equal(b.actualizar(true, 100 + 6000), true, "at the ceiling: enabled anyway");
  assert.equal(b.actualizar(true, 999999), true, "and it stays enabled");
});

test("the ceiling is configurable (a short one for the test of the ceiling itself)", () => {
  const b = crearListo(1000);
  b.actualizar(true, 0);
  assert.equal(b.actualizar(true, 999), false);
  assert.equal(b.actualizar(true, 1000), true);
});

test("aspecto: waiting shows «Preparando…», aria-disabled and the reason; ready shows the normal label, no tooltip", () => {
  const espera = aspectoBoton(false, "Entrar en VR");
  assert.deepEqual(espera, { texto: TEXTO_PREPARANDO, ariaDisabled: true, titulo: MOTIVO_PREPARANDO });
  assert.equal(TEXTO_PREPARANDO, "Preparando…");
  assert.match(MOTIVO_PREPARANDO, /cargar/);
  assert.deepEqual(aspectoBoton(true, "Entrar en AR"), { texto: "Entrar en AR", ariaDisabled: false, titulo: "" });
});
