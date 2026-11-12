// i18n: the pure VR/entorno logic files answer in the active language (English first, Spanish second).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { vistaObra, pedidoPoner } from "../apps/plaza/obra-vr-logica.ts";
import { COLORES, CIELO_NOMBRE, notaNivel, opcionesFondo } from "../apps/plaza/entorno-fino-logica.ts";
import { notaDePaginas } from "../apps/plaza/condiciones-vr-logica.ts";

test("obra, entorno fino and condiciones-vr read the active language at the moment they are asked", () => {
  const pags = [{ lineas: [], datos: [] }, { lineas: [], datos: [], textoEntero: true }, { lineas: [], datos: [] }];
  try {
    fijarIdioma("en");
    assert.match(vistaObra(null, []).vacio, /slot is gone/);
    assert.equal(pedidoPoner(null, { sha: "abcdef0", ext: "png", nombre: "" }, false).ok, false);
    assert.equal(COLORES[0].texto, "Sky colour (top)");
    assert.equal(CIELO_NOMBRE.color, "Single colour");
    assert.match(notaNivel("C"), /big HDR is not fetched/);
    assert.equal(opcionesFondo("hdr", "", [])[0].texto, "None (the light comes from the sky itself)");
    assert.equal(notaDePaginas(pags, 1), "Page 2 of 3");
    fijarIdioma("es");
    assert.match(vistaObra(null, []).vacio, /ya no está/);
    assert.equal(COLORES[0].texto, "Color del cielo (arriba)");
    assert.equal(CIELO_NOMBRE.color, "Un solo color");
    assert.match(notaNivel("C"), /no se carga el HDR grande/);
    assert.equal(notaDePaginas(pags, 1), "Página 2 de 3");
  } finally { fijarIdioma("en"); }
});
