// E51 · agua con código (agua-estilo.ts variante «oceano» + agua-glifos.ts): the glyph atlas, the deep-ocean ramp, the night
// factor, the pulse front and «same mesh, same draw call» for the three variants.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { fondoDeAgua, materialDeAgua, geometriaDeAgua, rampaOrilla, rampaOceano, nocheDeSol, pulsoEn, PULSO, BINARIOS_TENUE, oleajeEn, brilloCodigo, OLEAJE } from "../packages/render/src/agua-estilo.ts";
import { atlasGlifos, pixelesAtlas, GLIFOS, ORDEN, ATLAS, FAMILIAS } from "../packages/render/src/agua-glifos.ts";
import { AGUA_OCEANO } from "../packages/render/src/naturaleza/paleta.ts";
import { alturaEn, estanqueDe, NIVEL_AGUA } from "../packages/relieve/src/relieve.ts";

const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test("the atlas: 32 glyphs of 7×7 in 8 × 4 cells of 16 px (128×64 R8, 8 KB), families in order, no glyph empty or bleeding", () => {
  assert.equal(ORDEN.length, ATLAS.columnas * ATLAS.filas);
  for (const k of ORDEN) { const g = GLIFOS[k]; assert.equal(g.length, 7, k); for (const fila of g) assert.equal(fila.length, 7, k); assert.ok(g.join("").includes("#"), k); }
  assert.deepEqual([ORDEN[0], ORDEN[1]], ["0", "1"]);
  assert.equal(FAMILIAS.simbolos[1], ORDEN.length);
  const { datos, ancho, alto } = pixelesAtlas();
  assert.equal(ancho * alto, 128 * 64);
  const t = atlasGlifos();
  assert.equal(t.format, THREE.RedFormat); assert.equal(t.generateMipmaps, false); assert.equal(atlasGlifos(), t, "one shared texture");
  // every cell has ink, and the cell's outer ring of texels stays empty (no bleeding into the neighbour under bilinear reads)
  for (let k = 0; k < ORDEN.length; k++) {
    const cx = (k % 8) * 16, cy = Math.floor(k / 8) * 16;
    let tinta = 0, borde = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = datos[(cy + y) * ancho + cx + x]; if (v === 255) tinta++; if ((x === 0 || y === 0 || x === 15 || y === 15) && v > 200) borde++; }
    assert.ok(tinta >= 12, `${ORDEN[k]} ink ${tinta}`);
    assert.equal(borde, 0, `${ORDEN[k]} bleeds`);
  }
});

test("the deep-ocean ramp is far darker than the shore water, still teal, never pure black (paleta.ts only)", () => {
  for (const t of [0, 0.5, 1]) assert.ok(lum(rampaOceano(t)) < lum(rampaOrilla(t)) * 0.35, `t ${t}`);
  const h = rampaOceano(1);
  assert.ok(h[1] >= h[0] && h[2] >= h[0], `teal ${h}`);
  assert.ok(lum(h) > 0.0005, "not a black hole");
  assert.ok(lum(rampaOceano(0)) > lum(h), "shallow lighter than deep");
  const p = new THREE.Color(AGUA_OCEANO.plancton);
  assert.ok(p.g > p.r && p.b > p.r, "plankton glows blue-green");
  for (const v of Object.values(AGUA_OCEANO)) assert.notEqual(v, 0xffffff);
});

test("night factor: 0 with the sun up, 1 with the sun well under the horizon, monotone through dusk", () => {
  assert.equal(nocheDeSol(0.8), 0); assert.equal(nocheDeSol(-0.5), 1);
  let prev = 2; for (let y = -0.3; y <= 0.3; y += 0.01) { const n = nocheDeSol(y); assert.ok(n <= prev + 1e-12); prev = n; }
});

test("the pulse is a front that travels along the current at PULSO.vel: bright head, fading tail, dark ahead", () => {
  const cabeza = (t: number) => { let best = -1, at = 0; for (let s = 0; s < PULSO.lambda; s += 0.05) { const v = pulsoEn(s, t); if (v > best) { best = v; at = s; } } return at; };
  const a = cabeza(1), b = cabeza(3);
  assert.ok(Math.abs(b - a - 2 * PULSO.vel) < 0.2, `moved ${b - a}`);
  assert.ok(pulsoEn(a - PULSO.cola, 1) < 0.4 && pulsoEn(a - PULSO.cola, 1) > 0.3, "e^-1 one tail behind");
  assert.ok(pulsoEn(a + 1, 1) < 0.01, "dark just ahead");
});

test("the three variants ± code build on the SAME geometry (one mesh, one draw call); «oceano» glows at night only", () => {
  const e = estanqueDe(1234, 200), r = e.radio * 1.2;
  const fondo = fondoDeAgua((x, z) => alturaEn(1234, x, z), NIVEL_AGUA, e.x, e.z, r * 2);
  const detalle = { olas: 96, espumaViva: true, lineas: true, causticas: true, destellos: true };
  const forma = { tipo: "circulo" as const, radio: r };
  const n = geometriaDeAgua(forma, detalle, 12).getAttribute("position").count;
  for (const variante of ["continuo", "bandas", "oceano"] as const) for (const binarios of [0, BINARIOS_TENUE, undefined]) {
    const m = materialDeAgua({ color: 0x3f8fa8, forma, detalle, tiempo: uniform(0) as never, orilla: { variante, fondo }, binarios, corriente: uniform(new THREE.Vector3(3, 0, 1)) as never }, 12);
    assert.ok(m.colorNode && m.opacityNode && m.emissiveNode, `${variante} ${binarios}`);
    assert.ok(m.transparent);
  }
  assert.equal(geometriaDeAgua(forma, detalle, 12).getAttribute("position").count, n);
  assert.ok(BINARIOS_TENUE > 0.35, "AG10 raised from E03's 0.35");
});

test("the swell (Pablo's reference): its slope is the true derivative of its height, and the code glows faint at noon, more at golden hour, fully at night", () => {
  for (const [x, z, tt] of [[1, 2, 0], [-7.3, 4.1, 2.5], [13, -9, 7]]) {
    const e = 1e-4, a = oleajeEn(x, z, tt), dx = (oleajeEn(x + e, z, tt).h - oleajeEn(x - e, z, tt).h) / (2 * e), dz = (oleajeEn(x, z + e, tt).h - oleajeEn(x, z - e, tt).h) / (2 * e);
    assert.ok(Math.abs(a.gx - dx * OLEAJE.A) < 1e-6 && Math.abs(a.gz - dz * OLEAJE.A) < 1e-6);
    assert.ok(Math.abs(a.h) <= 1);
  }
  const noon = brilloCodigo(0.9), dorada = brilloCodigo(0.17), noche = brilloCodigo(-0.4);
  assert.ok(Math.abs(noon - 0.18) < 1e-9, `noon ${noon}`);
  assert.ok(dorada > 0.4 && dorada < 0.65, `golden ${dorada}`);
  assert.equal(noche, 1);
});
