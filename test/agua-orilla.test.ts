// E03 · AG1 agua de orilla + AG10 binarios (agua-estilo.ts): the bed under the pond, the two variants and the binaries toggle.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { fondoDeAgua, profundidadEn, distanciaOrillaEn, alturaDeMalla, tDeProfundidad, bandear, rampaOrilla, materialDeAgua, geometriaDeAgua, BANDAS_ORILLA, FONDO } from "../packages/render/src/agua-estilo.ts";
import { AGUA_ORILLA, CASA } from "../packages/render/src/naturaleza/paleta.ts";
import { alturaEn, estanqueDe, NIVEL_AGUA } from "../packages/relieve/src/relieve.ts";

const e = estanqueDe(1234, 200), r = e.radio * 1.2;
const fondo = fondoDeAgua((x, z) => alturaEn(1234, x, z), NIVEL_AGUA, e.x, e.z, r * 2);

test("the bed: deep in the middle, shallow towards the rim, dry past it; the shore distance changes sign at the waterline", () => {
  const d = (k: number) => profundidadEn(fondo, e.x + e.radio * k, e.z);
  assert.ok(d(0) > 1, `centre ${d(0)}`);
  assert.ok(d(0) > d(0.5) && d(0.5) > d(0.9) && d(0.9) > d(1.2), [0, 0.5, 0.9, 1.2].map(d).join(" "));
  assert.ok(d(1.2) < 0, "the bank is above the water");
  const s = (k: number) => distanciaOrillaEn(fondo, e.x + e.radio * k, e.z);
  assert.ok(s(0.5) > 4 && s(1.2) < 0, `${s(0.5)} ${s(1.2)}`);
  for (const k of [0, 0.5, 0.9, 1.2]) assert.equal(Math.sign(s(k)) || 1, Math.sign(d(k)) || 1, `sign at ${k}`);
});

test("the bed texture: 64² RG8, linear, no mipmaps (one fetch per pixel, ~8 KB)", () => {
  assert.equal(fondo.res, FONDO.res);
  assert.equal(fondo.datos.length, FONDO.res * FONDO.res * 2);
  assert.equal(fondo.textura.format, THREE.RGFormat);
  assert.equal(fondo.textura.generateMipmaps, false);
});

test("alturaDeMalla reads the drawn triangles and falls back where none covers the point", () => {
  const g = new THREE.PlaneGeometry(10, 10, 2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g); m.position.y = 0.7;
  const h = alturaDeMalla(m, -5, -5, 10, () => -9);
  assert.ok(Math.abs(h(1, 1) - 0.7) < 1e-6);
  assert.equal(h(40, 40), -9);
});

test("variant b is variant a sampled at 4 flat levels: same ends, monotone, exactly 4 values", () => {
  const vals = new Set<number>();
  let prev = -1;
  for (let i = 0; i <= 400; i++) { const t = tDeProfundidad(i / 100), b = bandear(t); assert.ok(b >= prev); prev = b; vals.add(b); }
  assert.equal(vals.size, BANDAS_ORILLA);
  assert.equal(bandear(0), 0); assert.equal(bandear(1), 1);
  assert.equal(tDeProfundidad(0), 0);
  assert.ok(tDeProfundidad(2) > 0.95);
});

test("colours: the ramp goes somera → honda, turquoise-green and luminous, never white (paleta.ts only)", () => {
  const s = rampaOrilla(0), h = rampaOrilla(1), lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(s) > lum(h), "shallow lighter than deep");
  for (const c of [s, h]) assert.ok(c[1] >= c[0] && c[2] >= c[0], `turquoise-green ${c}`);
  for (const k of ["espuma", "codigoCresta"] as const) assert.notEqual(AGUA_ORILLA[k], 0xffffff);
  assert.ok(lum(h) > 0.05, "deep is not a black hole");
  assert.ok(Object.values(CASA).length > 0);
});

test("both variants ± binaries build on the SAME geometry (one mesh, one draw call: only the material changes)", () => {
  const detalle = { olas: 96, espumaViva: true, lineas: true, causticas: true, destellos: true };
  const forma = { tipo: "circulo" as const, radio: r };
  const g = geometriaDeAgua(forma, detalle, 12), n = g.getAttribute("position").count;
  for (const variante of ["continuo", "bandas"] as const) for (const binarios of [0, 0.35]) {
    const m = materialDeAgua({ color: 0x3f8fa8, forma, detalle, tiempo: uniform(0) as never, orilla: { variante, fondo }, binarios, corriente: uniform(new THREE.Vector3(3, 0, 1)) as never }, 12);
    assert.ok(m.colorNode && m.opacityNode, `${variante} ${binarios}`);
    assert.ok(m.transparent);
  }
  assert.equal(geometriaDeAgua(forma, detalle, 12).getAttribute("position").count, n);
});
