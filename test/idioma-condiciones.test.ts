// The rules bubble's words (apps/plaza/condiciones-logica.ts) speak English first and Spanish second.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { ETIQUETAS, botonesDePie, lineaQuitado, marcasVacias, planificar, rotuloSinOpcional, rotuloTodo, textosDePaso, tituloCambios } from "../apps/plaza/condiciones-logica.ts";

test("the bubble's labels read the active language", () => {
  try {
    fijarIdioma("en");
    assert.equal(tituloCambios(), "The rules have changed"); assert.equal(ETIQUETAS.nuevo, "NEW"); assert.equal(rotuloTodo(), "Accept all and enter");
    assert.equal(rotuloSinOpcional(0), "Enter without the optional"); assert.equal(lineaQuitado({ id: "x", titulo: null }).nota, "no longer there");
    fijarIdioma("es");
    assert.equal(tituloCambios(), "Han cambiado las normas"); assert.equal(ETIQUETAS.nuevo, "NUEVO"); assert.equal(rotuloTodo(), "Aceptar todo y entrar");
    assert.equal(lineaQuitado({ id: "x", titulo: null }).nota, "ya no está");
  } finally { fijarIdioma("en"); }
  void [botonesDePie, marcasVacias, planificar, textosDePaso];
});
