// MIS-241: «Objetos del mundo» in the builder — the list, the search, where a press takes you (apps/plaza/objetos-mundo.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encuadreDe, filasDeObjetos, filtrarObjetos, firmaDeLista, frase, LISTA_OBJETOS_MAX, piezasDe, recortarLista, resumenLista, sitioJunto, yaJunto } from "../apps/plaza/objetos-mundo.ts";
import type { ObjetoMundo } from "../apps/plaza/objetos-mundo.ts";

const o = (id: string, extra: Record<string, unknown> = {}): ObjetoMundo => ({ id, x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, tipo: "modelo", ...extra });
const mundo = {
  disparadores: [
    { id: "d1", nombre: "Botón de la puerta", tipo: "tocar", x: 10, z: 10, receptores: [{ accion: "muestra", objeto: "Puerta" }] },
    { id: "d2", nombre: "Timbre", tipo: "tocar", x: 3, z: 3, receptores: [{ accion: "suena" }, { accion: "mueve", objeto: "x" }] },
  ],
  cerraduras: [{ nombre: "Candado", metodo: "codigo", abierta: false, x: 3, z: 3 }],
  contadores: [{ nombre: "Visitas", tipo: "contador_simple", valor: 4, x: 3, z: 3 }],
};

test("the rows: named things A→Z without accents, then the unnamed decor; the kind and the state in words", () => {
  const filas = filasDeObjetos([o("c", { nombre: "Árbol" }), o("z"), o("a", { nombre: "Banco", fijado: true }), o("b", { tipo: "sonido", nombre: "Cascada", oculto: true }), o("y", { tipo: "imagen" })]);
  assert.deepEqual(filas.map((f) => f.nombre), ["Árbol", "Banco", "Cascada", "(decorado)", "(decorado)"]);
  assert.deepEqual(filas.slice(3).map((f) => f.id), ["y", "z"], "unnamed: by kind («Imagen» < «Modelo»), then id");
  assert.equal(filas[1].fijado, true); assert.equal(filas[2].oculto, true);
  assert.equal(filas[2].tipo, "Zona de sonido"); assert.equal(filas[3].tipo, "Imagen");
});

test("«lleva pieza»: the cable at it, locks and counters beside it, the cables that show it, and a link", () => {
  assert.deepEqual(piezasDe(o("t", { nombre: "Mesa", x: 3, z: 3 }), mundo), ["1 cable", "cerradura", "contador"]);
  assert.deepEqual(piezasDe(o("p", { nombre: "Puerta", x: 50, z: 50 }), mundo), ["lo activa 1 cable"]);
  assert.deepEqual(piezasDe(o("e", { enlace: "https://numinia.com" }), mundo), ["enlace"]);
  assert.deepEqual(piezasDe(o("n", { x: 50, z: 50 }), mundo), [], "a plain thing carries nothing");
  assert.deepEqual(piezasDe(o("n"), undefined), [], "without the world's wires: nothing, no crash");
  assert.deepEqual(piezasDe(o("c", { x: 3, z: 3 }), { ...mundo, disparadores: [mundo.disparadores[1], { ...mundo.disparadores[1], id: "d3" }] }).slice(0, 1), ["2 cables"]);
});

test("the search: name, kind or id, no accents, no case; «con pieza» keeps only the wired ones", () => {
  const filas = filasDeObjetos([o("a1", { nombre: "Árbol grande" }), o("a2", { nombre: "Banco", x: 3, z: 3 }), o("a3", { tipo: "sonido", nombre: "Cascada" }), o("a4", { enlace: "https://x.es" })], mundo);
  assert.equal(filtrarObjetos(filas, "").length, 4);
  assert.deepEqual(filtrarObjetos(filas, "ARBOL").map((f) => f.id), ["a1"]);
  assert.deepEqual(filtrarObjetos(filas, "zona de sonido").map((f) => f.id), ["a3"], "by kind");
  assert.deepEqual(filtrarObjetos(filas, "a4").map((f) => f.id), ["a4"], "by id");
  assert.deepEqual(filtrarObjetos(filas, "", true).map((f) => f.id).sort(), ["a2", "a4"]);
  assert.deepEqual(filtrarObjetos(filas, "banco", true).map((f) => f.id), ["a2"]);
  assert.equal(filtrarObjetos(filas, "nada de eso").length, 0);
});

test("a long list is cut and the cut is counted; the list's signature changes only when the rows do", () => {
  const muchos = Array.from({ length: LISTA_OBJETOS_MAX + 30 }, (_, i) => o(`m${i}`, { nombre: `Cosa ${String(i).padStart(3, "0")}` }));
  const filas = filasDeObjetos(muchos), r = recortarLista(filas);
  assert.equal(r.visibles.length, LISTA_OBJETOS_MAX); assert.equal(r.resto, 30);
  assert.equal(recortarLista(filas.slice(0, 5)).resto, 0);
  const f1 = firmaDeLista(filas, "", false);
  assert.equal(firmaDeLista(filasDeObjetos(muchos.map((x) => ({ ...x, x: 7 }))), "", false), f1, "moving an object changes nothing the list shows");
  assert.notEqual(firmaDeLista(filasDeObjetos([...muchos, o("nuevo", { nombre: "Nuevo" })]), "", false), f1);
  assert.notEqual(firmaDeLista(filasDeObjetos(muchos.map((x, i) => (i === 0 ? { ...x, nombre: "Otro" } : x))), "", false), f1, "a rename shows");
  assert.notEqual(firmaDeLista(filas, "cosa", false), f1);
});

test("the line over the list", () => {
  assert.match(resumenLista(0, 0, false), /no tiene objetos/);
  assert.equal(resumenLista(1, 1, false), "1 objeto en el mundo.");
  assert.equal(resumenLista(226, 226, false), "226 objetos en el mundo.");
  assert.equal(resumenLista(226, 3, true), "3 de 226 objetos.");
  assert.equal(resumenLista(226, 0, true), "Ningún objeto coincide.");
});

test("where a press takes you: beside the object on your side, never inside it; nothing to do when you are already there", () => {
  const mesa = o("m", { x: 20, z: -10, sx: 2, sz: 2 });
  assert.deepEqual(sitioJunto(mesa, { x: 20, z: 10 }), { x: 20, z: -7.5 }, "you are to its south (+z): 2.5 m on that side");
  assert.deepEqual(sitioJunto(mesa, { x: 0, z: -10 }), { x: 17.5, z: -10 }, "you are to the west");
  assert.deepEqual(sitioJunto(mesa, null), { x: 20, z: -7.5 }, "unknown: its south");
  assert.deepEqual(sitioJunto(mesa, { x: 20, z: -10 }), { x: 20, z: -7.5 }, "standing on it: its south, no NaN");
  const torre = o("t", { x: 0, z: 0, sx: 12, sz: 12 }), s = sitioJunto(torre, { x: 100, z: 0 });
  assert.deepEqual(s, { x: 7.5, z: 0 }, "a big one: its half-width (6) plus 1.5 m");
  assert.ok(Math.hypot(s.x, s.z) > 6, "outside its footprint");
  assert.equal(sitioJunto(o("g", { x: 0, z: 0, sx: 80, sz: 80 }), null).z, 11.5, "huge: at most 10 m of half-width + 1.5");
  assert.equal(yaJunto(mesa, { x: 20, z: -6 }), true);
  assert.equal(yaJunto(mesa, { x: 20, z: 10 }), false);
  assert.equal(yaJunto(mesa, null), false);
});

test("the camera frame fits the object; the words after a press", () => {
  assert.deepEqual(encuadreDe(o("a", { x: 5, y: 1, z: -2, sx: 2, sy: 4, sz: 1 })), { centro: { x: 5, y: 3, z: -2 }, radio: 6 });
  assert.equal(encuadreDe(o("b", { sx: 0.2, sy: 0.2, sz: 0.2 })).radio, 1.5, "a tiny thing: at least 1.5 m away");
  assert.match(frase("Mesa", "viaja"), /te llevo junto a él/); assert.match(frase("Mesa", "cerca"), /ya estás junto/);
  assert.match(frase("Mesa", "apagado"), /apagado/); assert.match(frase("Mesa", "sin-viaje"), /seleccionado/);
});

test("wired in: the drawer, the map's «Editar» (only for world objects) and the dock keep to the house rules", () => {
  const constructor = readFileSync(new URL("../apps/plaza/constructor.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../apps/plaza/main.ts", import.meta.url), "utf8");
  const mapa = readFileSync(new URL("../apps/plaza/mapa.ts", import.meta.url), "utf8");
  assert.match(constructor, /cuerpos\.objetos\.append\(/, "the drawer's body is filled");
  assert.match(constructor, /if \(cajon === "objetos"\) pintarLista\(\)/, "the list follows the world while open");
  assert.match(main, /idDeObjeto = \(marca: string\): string => \(marca\.startsWith\("c:objetos:"\)/, "only an objetos card is editable from the map");
  assert.match(main, /puedeEditar: \(donde\) =>/); assert.match(main, /alEditar: \(donde\) => constructorUI\.editar/);
  assert.match(mapa, /h\.puedeEditar\?\.\(e\) && h\.alEditar/, "no hook = no button");
  assert.doesNotMatch(constructor, /innerHTML = [^;]*\bf\.(nombre|tipo)/, "names are set as text, never as HTML");
});
