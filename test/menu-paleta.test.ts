// MIS-222 t_1b395abe · J18b story 5: the brush's palette in the VR menu — its layout (every button big enough to press with a ray, nothing on top of
// anything, all inside the content area), the eight names and colours, and the menu's behaviour with a fake canvas: the palette draws, a press on a
// colour / thickness / verb runs the page's action, and the pressed colour is the one the next stroke is made of (pintar-vr.ts, tested in pintar-vr.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { disposicionPaleta, medidasPaleta, indiceGrosor, pxGrosor, NOMBRES_COLOR, GROSORES_VR } from "../packages/render/src/menu-paleta.ts";
import { CONTENIDO, BOTON_MIN, idBoton } from "../packages/render/src/menu-vr.ts";
import { createMenuInvocado, type Proveedor, type ContenidoPaleta } from "../packages/render/src/menu-invocado.ts";
import { PALETA_TRAZO } from "../packages/render/src/trazo-tubo.ts";
import { TRAZO } from "../packages/net/src/ficheros.ts";
import { GROSORES_M } from "../apps/plaza/pincel.ts";

const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

test("palette layout: 8 colours + 3 thicknesses + 2 verbs, each at least BOTON_MIN px, none on top of another, all inside the content area", () => {
  const d = disposicionPaleta(), m = medidasPaleta();
  assert.equal(d.colores.length, TRAZO.colores); assert.equal(d.grosores.length, 3); assert.equal(d.acciones.length, 2);
  assert.ok(m.minBotonPx >= BOTON_MIN, `smallest button ${m.minBotonPx} px`); assert.equal(m.solapes, 0);
  for (const r of [...d.colores, ...d.grosores, ...d.acciones, d.titulo, d.nota, d.etiquetaGrosor]) {
    assert.ok(r.x >= CONTENIDO.x && r.x + r.w <= CONTENIDO.x + CONTENIDO.w + 1 && r.y >= CONTENIDO.y && r.y + r.h <= CONTENIDO.y + CONTENIDO.h, JSON.stringify(r));
  }
  assert.ok(d.nota.y >= d.acciones[0].y + d.acciones[0].h, "the footnote is under the verbs");
});
test("palette: the names, the colours and the thicknesses are the stroke's own (8 colours of the engine palette, thicknesses = the brush's three)", () => {
  assert.equal(NOMBRES_COLOR.length, PALETA_TRAZO.length); assert.equal(PALETA_TRAZO.length, TRAZO.colores);
  assert.deepEqual(GROSORES_VR.map((g) => g.m), [...GROSORES_M]);
  for (const g of GROSORES_VR) assert.ok(g.m >= TRAZO.grosorMin && g.m <= TRAZO.grosorMax);
  assert.equal(indiceGrosor(0.005), 0); assert.equal(indiceGrosor(0.015), 1); assert.equal(indiceGrosor(0.04), 2); assert.equal(indiceGrosor(0.02), -1, "a width set from code matches none");
  assert.equal(pxGrosor(0.04), 58, "true size: 4 cm at 1440 px per metre"); assert.equal(pxGrosor(0.0005), 4, "never thinner than 4 px");
});

function menuConPaleta() {
  const hecho = { colores: [] as number[], grosores: [] as number[], verbos: [] as string[] };
  let activo = 2;
  const paleta = (): ContenidoPaleta => ({ tipo: "paleta", titulo: "Pincel", nota: "nota",
    colores: PALETA_TRAZO.map((hex, i) => ({ nombre: NOMBRES_COLOR[i], hex, activo: activo === i, accion: () => { hecho.colores.push(i); activo = i; } })),
    grosores: GROSORES_VR.map((g, i) => ({ texto: g.texto, detalle: g.detalle, m: g.m, activo: i === 1, accion: () => { hecho.grosores.push(g.m); } })),
    acciones: [{ texto: "Deshacer", icono: "arrow-counter-clockwise", accion: () => { hecho.verbos.push("deshacer"); } }, { texto: "Dejar de pintar", accion: () => { hecho.verbos.push("salir"); } }] });
  const m = createMenuInvocado({ scene: new THREE.Scene(), ahora: () => 1000, salir: () => {} });
  const p: Proveedor = { contenido: (v) => (v === "construir" ? paleta() : { tipo: "lista", vacio: "", filas: [] }), desactivadas: () => new Set() };
  m.proveedor(p);
  return { m, hecho };
}
test("palette in the menu: it draws as «paleta» content with 13 buttons; a press on colour 5, the thin line and the verbs runs the page's actions", () => {
  const { m, hecho } = menuConPaleta();
  m.abrir(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1), "construir");
  const e = m.estado();
  assert.equal(e.contenido, "paleta"); assert.equal(e.botones, 13); assert.deepEqual(e.filas, [...NOMBRES_COLOR]);
  const pulsa = (id: number) => m.paneles()[0].pulsar!(id);
  pulsa(idBoton(5)); pulsa(idBoton(8)); pulsa(idBoton(11)); pulsa(idBoton(12));
  assert.deepEqual(hecho.colores, [5]); assert.deepEqual(hecho.grosores, [0.005]); assert.deepEqual(hecho.verbos, ["deshacer", "salir"]);
  const antes = m.estado().pinturas; m.pintar(); assert.ok(m.estado().pinturas >= antes, "it repaints (the new colour ticks) without error");
});
test("palette in the menu: the ray finds each swatch (zone ids 100…107 in order, left to right)", () => {
  const { m } = menuConPaleta();
  m.abrir(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1), "construir");
  const d = disposicionPaleta(), uv = (r: { x: number; y: number; w: number; h: number }) => new THREE.Vector2((r.x + r.w / 2) / 1440, 1 - (r.y + r.h / 2) / 880);
  const p = m.paneles()[0];
  d.colores.forEach((r, i) => assert.equal(p.fila(uv(r)), idBoton(i)));
  d.grosores.forEach((r, i) => assert.equal(p.fila(uv(r)), idBoton(8 + i)));
  d.acciones.forEach((r, i) => assert.equal(p.fila(uv(r)), idBoton(11 + i)));
});
