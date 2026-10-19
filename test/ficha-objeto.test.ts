// C3 + C4: the object card — when it shows, what it says, the link to the place, its tabs and the wires of an object.
// (The DOM is covered by the e2e leg.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { datosFicha, enlaceDeObjeto, fichaVisible, logicaDeObjeto, PESTANAS, pestanaConTecla, seleccionarAlIr } from "../apps/plaza/ficha-objeto.ts";
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

test("C4: the tabs are Ficha, Lógica and Ajustes; ←/→ wrap around, Home/End jump, other keys do nothing", () => {
  assert.deepEqual(PESTANAS.map(([id]) => id), ["ficha", "logica", "ajustes"]);
  assert.equal(pestanaConTecla("ficha", "ArrowRight"), "logica");
  assert.equal(pestanaConTecla("ajustes", "ArrowRight"), "ficha");
  assert.equal(pestanaConTecla("ficha", "ArrowLeft"), "ajustes");
  assert.equal(pestanaConTecla("logica", "ArrowLeft"), "ficha");
  assert.equal(pestanaConTecla("logica", "Home"), "ficha");
  assert.equal(pestanaConTecla("logica", "End"), "ajustes");
  for (const k of ["Enter", " ", "a", "ArrowUp", "Escape", "Tab"]) assert.equal(pestanaConTecla("logica", k), null, k);
});

test("C4: the wires of an object — who shows or hides it (by id or name), what stands at it, locks and counters at the same spot", () => {
  const mesa = { id: "o7", nombre: "Mesa", x: 10, y: 0, z: 10 };
  const w = {
    disparadores: [
      { id: "d1", nombre: "Palanca", tipo: "boton", x: 40, z: 40, receptores: [{ accion: "muestra", objeto: "o7" }, { accion: "suena", sonido: "campana" }] },
      { id: "d2", nombre: "Umbral", tipo: "zona", x: 30, z: 30, receptores: [{ accion: "oculta", objeto: "Mesa" }, { accion: "muestra", objeto: "otra" }] },
      { id: "d3", nombre: "Alfombra", tipo: "zona", x: 10.5, z: 9.5, receptores: [{ accion: "mueve", objeto: "o7" }, { accion: "da_paso" }] },
      { id: "d4", nombre: "Vacío", tipo: "boton", x: 10, z: 11, receptores: [] },
    ],
    cerraduras: [{ nombre: "Puerta", metodo: "codigo", abierta: false, x: 10, z: 10.4 }, { nombre: "Lejana", metodo: "llave", abierta: true, x: 90, z: 90 }],
    contadores: [{ nombre: "Vueltas", tipo: "cuenta_atras", valor: 3, x: 9.5, z: 10 }],
  };
  const l = logicaDeObjeto(mesa, w);
  assert.deepEqual(l.entran, ["«Palanca» (boton) muestra «o7»", "«Umbral» (zona) oculta «Mesa»"]); // «mueve» names a movedor, never counts; «otra» is not this object
  assert.deepEqual(l.salen, ["«Alfombra» (zona) → mueve «o7», da un paso de misión", "«Vacío» (boton) → sin receptores"]);
  assert.deepEqual(l.piezas, ["Cerradura «Puerta» (con código): cerrada", "Contador «Vueltas» (cuenta atras): 3"]);
  // an unnamed object is found by id only; an empty world says nothing
  assert.deepEqual(logicaDeObjeto({ id: "o9", x: 90, z: 90 }, w).entran, []);
  assert.deepEqual(logicaDeObjeto({ id: "o9", x: 90, z: 90 }, w).piezas, ["Cerradura «Lejana» (con llave): abierta"]);
  assert.deepEqual(logicaDeObjeto(mesa, { disparadores: [], cerraduras: [], contadores: [] }), { entran: [], salen: [], piezas: [] });
  // no position in the model: nothing «stands at» it
  assert.deepEqual(logicaDeObjeto({ id: "o8" }, w).salen, []);
});
