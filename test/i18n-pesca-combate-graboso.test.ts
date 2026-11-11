// i18n: pesca / combate / pantalla-logica / graboso speak the active language (English first, Spanish second).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { notaDePescado, cmTexto } from "../apps/plaza/pesca.ts";
import { casillas } from "../apps/plaza/combate.ts";
import { fraseInicio } from "../apps/plaza/pantalla-logica.ts";

test("player-visible text follows the active language", () => {
  try {
    fijarIdioma("en");
    assert.equal(notaDePescado({ pez: "Carpa", rareza: "rara", guardado: false }, 2), "rare · In your basket: 2");
    assert.equal(cmTexto(12.5), "12.5 cm");
    assert.match(casillas(0)[1].etiqueta, /^Skill 2,/);
    assert.match(fraseInicio("Cine"), /^Sharing your screen/);
    fijarIdioma("es");
    assert.equal(notaDePescado({ pez: "Carpa", rareza: "rara", guardado: false }, 2), "rara · En tu cesta: 2");
    assert.equal(cmTexto(12.5), "12,5 cm");
    assert.match(casillas(0)[1].etiqueta, /^Habilidad 2,/);
    assert.match(fraseInicio("Cine"), /^Compartiendo tu pantalla/);
  } finally { fijarIdioma("en"); }
});
