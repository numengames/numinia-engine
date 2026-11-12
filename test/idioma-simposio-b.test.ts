// i18n (Symposium): the texts of the quest book, the character sheet, VR build, photo filters and walking-to are English first and Spanish second.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { frase } from "../packages/client/src/ir-andando.ts";
import { rumbo, ESTADOS } from "../apps/plaza/misiones.ts";
import { vistaConstruirVR, vistaPintarVR, textoInvitado } from "../apps/plaza/construir-vr-logica.ts";
import { estadoVisible, tituloPestana } from "../apps/plaza/ficha.ts";
import { FILTROS, nombreArchivo } from "../apps/plaza/foto-nucleo.ts";

afterEach(() => { fijarIdioma("en"); });

test("English is the default; Spanish follows the active language", () => {
  fijarIdioma("en");
  assert.equal(frase("lejos", "X", "en"), "X is too far to walk to (more than 600 m).");
  assert.match(frase("atasco", "the fountain"), /No direct way to the fountain/);
  assert.equal(rumbo(0, -10), "10 m north");
  assert.equal(ESTADOS.hecho.dice, "Done");
  assert.equal(vistaPintarVR(false).boton, "Start");
  assert.equal(vistaConstruirVR({ puede: true, invitado: false, activo: true }).tipo, "activo");
  assert.equal(textoInvitado(), "Sign in with your name to build");
  assert.equal(estadoVisible("Colapsado"), "Collapsed");
  assert.equal(tituloPestana("insignias"), "Badges");
  assert.equal(FILTROS[1].nombre, "Amber");
  assert.match(nombreArchivo("", new Date(2026, 0, 1)), /^world-/);
  fijarIdioma("es");
  assert.match(frase("lejos", "X"), /queda demasiado lejos/);
  assert.equal(frase("lejos", "X", "en"), "X is too far to walk to (more than 600 m).");
  assert.equal(rumbo(0, -10), "a 10 m al norte");
  assert.equal(ESTADOS.hecho.dice, "Hecho");
  assert.equal(vistaPintarVR(false).boton, "Empezar");
  assert.equal(textoInvitado(), "Entra con tu nombre para construir");
  assert.equal(estadoVisible("Colapsado"), "Colapsado");
  assert.equal(tituloPestana("insignias"), "Insignias");
  assert.equal(FILTROS[1].nombre, "Ámbar");
  assert.match(nombreArchivo("", new Date(2026, 0, 1)), /^mundo-/);
});
