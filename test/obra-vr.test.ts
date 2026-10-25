// MIS-222 t_ac672264 (story 1 of 2): fill a hole from inside VR with an image ALREADY on the server. The pure view (obra-vr-logica.ts),
// the client's list of uploaded images, the menu's «Obra» view (never greyed out, a press on «Poner» reaches the page), and
// huecos.ts choosing the VR route instead of the file picker. The whole way through a real session: tools/e2e-piernas/huecos-vr.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { vistaObra, pedidoPoner, nombreObra, recortarNombre } from "../apps/plaza/obra-vr-logica.ts";
import { ETIQUETAS, ICONOS, VISTAS_SUELTAS, SECCIONES } from "../packages/render/src/menu-vr.ts";
import { createMenuInvocado, type Proveedor } from "../packages/render/src/menu-invocado.ts";
import { montarHuecos } from "../apps/plaza/huecos.ts";

const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

const hueco = { id: "o7", nombre: "Marco grande", ancho: 2.4, alto: 1.6, lleno: false };
const imgs = [{ sha: "a".repeat(64), ext: "png", nombre: "Sol de Ravena" }, { sha: "b1c2d3" + "0".repeat(58), ext: "jpg", nombre: "" }];

test("the view lists each uploaded image with «Poner», and says which hole and how big", () => {
  const v = vistaObra(hueco, imgs);
  assert.match(v.titulo, /Marco grande/); assert.match(v.titulo, /2,4 × 1,6 m/);
  assert.equal(v.filas.length, 2);
  assert.equal(v.filas[0].texto, "Sol de Ravena"); assert.equal(v.filas[0].detalle, ".png");
  assert.equal(v.filas[1].texto, "Imagen b1c2d3", "a nameless image is never shown as a bare hash");
  assert.ok(v.filas.every((f) => f.boton?.texto === "Poner" && f.boton.poner));
  assert.match(v.nota, /ya están en este mundo/);
  assert.match(vistaObra({ ...hueco, lleno: true }, imgs).nota, /sustituye/);
});
test("no images: the view says so and where to get them; a hole that vanished says that", () => {
  const v = vistaObra(hueco, []);
  assert.deepEqual(v.filas, []); assert.match(v.vacio, /Aún no hay imágenes/);
  assert.match(vistaObra(null, imgs).vacio, /ya no está/);
  assert.deepEqual(vistaObra(null, imgs).filas, [], "no hole, nothing to press");
});
test("a press asks the server for exactly that file in that hole; no permission or no hole = no request", () => {
  assert.deepEqual(pedidoPoner(hueco, imgs[0], true), { ok: true, id: "o7", sha: imgs[0].sha, ext: "png", nombre: "Sol de Ravena" });
  assert.equal((pedidoPoner(hueco, imgs[1], true) as { nombre: string }).nombre, "Imagen b1c2d3");
  assert.equal(pedidoPoner(hueco, imgs[0], false).ok, false);
  assert.equal(pedidoPoner(null, imgs[0], true).ok, false);
});
test("long names are cut to one line", () => {
  const largo = "x".repeat(80);
  assert.ok(recortarNombre(largo).length <= 34 && recortarNombre(largo).endsWith("…"));
  assert.ok(nombreObra({ sha: "z", ext: "png", nombre: largo }).length <= 34);
});

test("«obra» is a view of the menu that is not a row of the list, with a name and an icon", () => {
  assert.ok(VISTAS_SUELTAS.includes("obra") && VISTAS_SUELTAS.includes("avisos"));
  assert.ok(!(SECCIONES as readonly string[]).includes("obra"), "not a row of the list: only a pressed hole opens it");
  assert.equal(ETIQUETAS.obra, "Obra"); assert.equal(ICONOS.obra, "image-square");
});

test("the menu opens on «Obra» even where every section is greyed out, and a «Poner» press reaches the page", () => {
  const visto: string[] = []; let puestas = 0;
  const m = createMenuInvocado({ scene: new THREE.Scene(), ahora: () => 1000, salir: () => {}, alCerrar: () => {}, alPulsar: () => {} });
  const p: Proveedor = {
    contenido: (v) => { visto.push(v); return v === "obra" ? { tipo: "lista", titulo: "Hueco", vacio: "", filas: [{ texto: "Sol", botones: [{ texto: "Poner", accion: () => { puestas++; } }] }] } : { tipo: "lista", vacio: "x", filas: [] }; },
    desactivadas: () => new Set(["tu", "gente", "bolsa", "misiones", "mapa", "construir", "ajustes", "chat"]), // everything off
  };
  m.proveedor(p);
  assert.equal(m.abrir(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1), "obra"), true);
  assert.ok(visto.includes("obra"), "the view was asked for its content");
  const panel = m.paneles()[0]; assert.ok(panel);
  // the content's first button is id 100 (menu-vr.ts idBoton(0))
  panel.pulsar!(100);
  assert.equal(puestas, 1);
});

// ---- huecos.ts: the VR route replaces the file picker ----
function entornoHuecos(enVR: boolean) {
  const clics: string[] = [], elegidos: string[] = [];
  const hijos: unknown[] = [];
  const el = (): Record<string, unknown> => ({ style: {}, classList: { add() {} }, append() {}, setAttribute() {}, addEventListener() {}, click() { clics.push("picker"); }, hidden: false });
  (globalThis as { document?: unknown }).document = { createElement: () => el(), body: { append: (x: unknown) => { hijos.push(x); } } };
  const huecos = [{ id: "h1", nombre: "Marco", x: 0, y: 1.2, z: -2, ancho: 2, alto: 1, lleno: false, fijado: false }];
  const h = montarHuecos({
    constructor: { estado: { puede: true, seleccionado: "" }, huecos: () => huecos, objeto: () => null, hueco: () => ({ ok: true }), vaciar: () => ({ ok: true }), escuchar: () => () => {} },
    view: {}, rellenar: async () => {}, decir: () => {}, panel: null,
    vr: { activo: () => enVR, elegir: (id) => { elegidos.push(id); } },
  });
  return { h, clics, elegidos };
}
test("in VR a hole opens the «Obra» view, not a file picker — by the trigger near it and by the ray at it", () => {
  const { h, clics, elegidos } = entornoHuecos(true);
  const oferta = h.cerca(0, 0)[0];
  assert.ok(oferta, "within reach it is offered");
  assert.deepEqual(oferta.local(), { ok: true });
  assert.equal(h.pinchar("h1"), true);
  assert.deepEqual(elegidos, ["h1", "h1"]);
  assert.deepEqual(clics, [], "no picker inside a headset");
  assert.equal(h.llenable("h1"), true); assert.equal(h.llenable("nada"), false, "the ray only aims at holes");
});
test("outside VR nothing changes: the file picker opens", () => {
  const { h, clics, elegidos } = entornoHuecos(false);
  assert.deepEqual(h.abrir("h1"), { ok: true });
  assert.deepEqual(clics, ["picker"]); assert.deepEqual(elegidos, []);
});
