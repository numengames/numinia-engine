// mundo-hermes · M5: the plain Spanish of the espejo's buttons: «Ir al umbral», «Ir a la torre de control», and one label with article for EVERY function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FUNCIONES, TEXTO_FUNCION, nombreFuncion, textoFuncion, textoIrA } from "../features/espejo/esquema.ts";

test("textoIrA: contracts «a el» and lowers the article, for every zone of the Hermes template", () => {
  assert.equal(textoIrA("El umbral"), "Ir al umbral");
  assert.equal(textoIrA("El reloj"), "Ir al reloj");
  assert.equal(textoIrA("La torre de control"), "Ir a la torre de control");
  assert.equal(textoIrA("Las sesiones"), "Ir a las sesiones");
  assert.equal(textoIrA("Los archivos"), "Ir a los archivos");
  const plantilla = JSON.parse(readFileSync(new URL("../plantillas/hermes/entorno/espejo.json", import.meta.url), "utf8")) as { zonas: { nombre: string }[] };
  for (const z of plantilla.zonas) assert.doesNotMatch(textoIrA(z.nombre), /^Ir a (El|La|Las|Los) |^Ir a el /, `«${textoIrA(z.nombre)}»`);
});

test("textoIrA: bad cases: no article stays as is, a name that merely starts with «El…» is not cut, blanks are trimmed", () => {
  assert.equal(textoIrA("Plaza"), "Ir a Plaza");
  assert.equal(textoIrA("Elena"), "Ir a Elena", "«Elena» is not «El ena»");
  assert.equal(textoIrA("Lasagna"), "Ir a Lasagna");
  assert.equal(textoIrA("  El umbral "), "Ir al umbral");
  assert.equal(textoIrA("El"), "Ir a El", "an article alone is just a name");
  assert.equal(textoIrA(""), "Ir a ");
});

test("every function has a label with article; lists use it without the article; an unknown name is shown as is", () => {
  for (const f of FUNCIONES) {
    assert.match(TEXTO_FUNCION[f], /^(el|la|los|las) \S/, `${f}: «${TEXTO_FUNCION[f]}»`);
    assert.doesNotMatch(nombreFuncion(f), /^(el|la|los|las) /);
    assert.doesNotMatch(TEXTO_FUNCION[f], /usar|\busted\b|\btú\b/i);
  }
  assert.equal(Object.keys(TEXTO_FUNCION).length, FUNCIONES.length, "no label without a function");
  assert.equal(`Apagar ${textoFuncion("uso")}`, "Apagar el gasto");
  assert.equal(`Encender ${textoFuncion("perfiles")}`, "Encender los agentes");
  assert.equal(`Encender ${textoFuncion("sesiones")}`, "Encender las sesiones");
  assert.equal(textoFuncion("cosa-rara"), "cosa-rara");
  assert.equal(nombreFuncion("cosa-rara"), "cosa-rara");
});
