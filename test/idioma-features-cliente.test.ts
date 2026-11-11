// Feature clients answer in the active language: English first, Spanish second.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { consejo, cmTexto } from "../features/pesca/client.ts";
import { resumenTexto } from "../apps/plaza/inventario-resumen.ts";

test("pesca coaching, cm and the inventory line speak both languages", () => {
  try {
    fijarIdioma("en");
    assert.equal(consejo({ fase: "picada", tension: 0, arrancada: "no", pez: "" }), "BITE! Reel in now");
    assert.equal(cmTexto(33.3), "33.3 cm"); assert.equal(resumenTexto({ objetos: 0, portados: 0, prestigio: 0 }), "You are not carrying anything yet.");
    fijarIdioma("es");
    assert.equal(consejo({ fase: "picada", tension: 0, arrancada: "no", pez: "" }), "¡PICA! Recoge ahora");
    assert.equal(cmTexto(33.3), "33,3 cm"); assert.equal(resumenTexto({ objetos: 0, portados: 0, prestigio: 0 }), "No llevas nada todavía.");
  } finally { fijarIdioma("en"); }
});
