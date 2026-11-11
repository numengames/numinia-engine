// i18n: the small pure texts of the builder family answer in both languages (English first, Spanish kept).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { etiquetaHora } from "../packages/client/src/reloj.ts";
import { preguntaEnlace } from "../apps/plaza/enlaces.ts";
import { eleccionDesde } from "../packages/client/src/aparato.ts";

test("clock label, link question and device notice: English by default, Spanish on request", () => {
  fijarIdioma("en");
  assert.equal(etiquetaHora("utc"), "UTC time");
  assert.match(preguntaEnlace("https://a.b"), /^Open in a new tab\?\nhttps/);
  assert.match(eleccionDesde({ url: "movil", desarrollo: false }).aviso ?? "", /only works in development/);
  fijarIdioma("es");
  try {
    assert.equal(etiquetaHora("utc"), "Hora UTC");
    assert.match(preguntaEnlace("https://a.b"), /^¿Abrir en una pestaña nueva\?/);
    assert.match(eleccionDesde({ url: "movil", desarrollo: false }).aviso ?? "", /solo vale en desarrollo/);
  } finally { fijarIdioma("en"); }
});
