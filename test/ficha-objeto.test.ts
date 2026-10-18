// C3: the object card — when it shows, what it says, the link to the place. (The DOM is covered by the e2e leg.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { datosFicha, enlaceDeObjeto, fichaVisible, seleccionarAlIr } from "../apps/plaza/ficha-objeto.ts";
import { leerSitio } from "../apps/plaza/foto-nucleo.ts";

test("the card shows only for someone who may build, with the builder open and an object selected", () => {
  for (const puede of [false, true]) for (const abierto of [false, true]) for (const sel of ["", "o1"]) {
    assert.equal(fichaVisible(puede, abierto, sel), puede && abierto && sel !== "", `${puede} ${abierto} ${sel}`);
  }
});

test("«Ir» selects the object only when building is allowed, the builder is open and the object exists", () => {
  assert.equal(seleccionarAlIr(true, true, true), true);
  assert.equal(seleccionarAlIr(false, true, true), false);
  assert.equal(seleccionarAlIr(true, false, true), false);
  assert.equal(seleccionarAlIr(true, true, false), false);
});

test("the card says name, type and the facts the model carries — never a maker it does not have", () => {
  const d = datosFicha({ id: "o1", nombre: "Mesa", tipo: "sonido", x: 3.04, y: 0, z: -2, sx: 1, sy: 1, sz: 1, fijado: true });
  assert.equal(d.titulo, "Mesa");
  assert.equal(d.tipo, "Zona de sonido");
  assert.deepEqual(d.hechos, [["Posición", "x 3 · z -2"], ["Escala", "1"], ["Estado", "anclado"]]);
  assert.ok(!d.hechos.some(([k]) => /hecho|autor/i.test(k)));
  const e = datosFicha({ id: "o2", sx: 1, sy: 2, sz: 1 });
  assert.equal(e.titulo, "(decorado)");
  assert.equal(e.tipo, "Modelo");
  assert.deepEqual(e.hechos, [["Escala", "1 × 2 × 1"], ["Estado", "suelto"]]); // no x/z in the model: no position line
});

test("the link to an object is a #foto= place the photo mode can read back", () => {
  const url = enlaceDeObjeto({ origin: "https://x.test", pathname: "/", search: "?server=ws://a" }, { id: "o1", x: 4, y: 0, z: 5, sx: 1, sy: 2, sz: 1 });
  assert.ok(url?.startsWith("https://x.test/?server=ws://a#foto="));
  const sitio = leerSitio(url!.split("#foto=")[1]);
  assert.ok(sitio);
  assert.equal(sitio!.x, 4); assert.equal(sitio!.z, 5); assert.equal(sitio!.y, 1);
  assert.equal(enlaceDeObjeto({ origin: "https://x.test", pathname: "/", search: "" }, { id: "o3" }), null);
});
