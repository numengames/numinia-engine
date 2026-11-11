// i18n batch: the capability catalogue, the density names, the bag rows and the VR sheet speak English first and Spanish second.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
import { CAPACIDADES } from "../packages/client/src/capacidades.ts";
import { NOMBRES_DENSIDAD, MARCOS_PLAZA } from "../packages/client/src/densidad.ts";
import { accionDe, etiquetaHueco, lineaTipo, detalleDeCaptura } from "../apps/plaza/bolsa-rejilla.ts";
import { filasIdentidad } from "../apps/plaza/info-aparato.ts";
import { lineasMandos, LINEAS_MANDOS } from "../apps/plaza/xr-mandos.ts";

const arma = { id: "a", tipo: "arma", clase: "", nombre: "Hoja", descripcion: "", icono: "", color: "", valor: 0, n: 1, portado: false } as never;

test("the same getters read English by default and Spanish after fijarIdioma('es')", () => {
  fijarIdioma("en");
  try {
    assert.match(CAPACIDADES.tactil, /^Touch screen/);
    assert.equal(NOMBRES_DENSIDAD.minimo, "Minimal");
    assert.equal(MARCOS_PLAZA.find((m) => m.id === "hud.reloj")!.nombre, "Clock");
    assert.equal(accionDe(arma), "Equip"); assert.equal(lineaTipo(arma), "weapon"); assert.equal(detalleDeCaptura({ color: "azul" }), "fish · rare");
    assert.equal(etiquetaHueco(null, 0, "bolsa"), "Backpack slot 1: empty");
    assert.equal(LINEAS_MANDOS[0], lineasMandos("en")[0]);
    fijarIdioma("es");
    assert.match(CAPACIDADES.tactil, /^Pantalla táctil/);
    assert.equal(NOMBRES_DENSIDAD.minimo, "Mínimo");
    assert.equal(MARCOS_PLAZA.find((m) => m.id === "hud.reloj")!.nombre, "Reloj");
    assert.equal(accionDe(arma), "Llevar"); assert.equal(lineaTipo(arma), "arma"); assert.equal(detalleDeCaptura({ color: "azul" }), "pez · rara");
    assert.equal(etiquetaHueco(null, 0, "bolsa"), "Hueco 1 de la Bolsa: vacío");
    assert.equal(LINEAS_MANDOS[0], "Mandos (Y: abre o cierra el menú)");
    assert.equal(filasIdentidad({ session: { entity: -1, who: null, stats: { rttMs: 0, visible: 0 } } })[0][0], "Nombre");
  } finally { fijarIdioma("en"); }
});
