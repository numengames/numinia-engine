// R7.2 (naturaleza): ground without facets — smooth normals over shared lattice vertices, macro colour by IQ value noise, slope blend.
// The heights (and so the collision, relieve `alturaEn`) and the baked pieces stay byte-identical; the shown colour has a pure CPU twin for R7.3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { crearTerreno, CELDAS_TERRENO, franjasEn, ruidoValor, sombrearSuelo, nodoSuelo, OCTAVAS_SUELO, NIVEL_AGUA, estanqueDe } from "../packages/render/src/naturaleza/terreno.ts";
import { campo } from "../packages/relieve/src/relieve.ts";
import { construirResiduos } from "../packages/render/src/naturaleza/residuos.ts";
import { SUELO_R72 } from "../packages/render/src/naturaleza/paleta.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const S = 1234, NIVELES: Nivel[] = ["A", "B", "C", "D"];
const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test("R7.2: heights byte-identical — every lattice vertex is float32(relieve campo().h), every triangle keeps its pre-R7.2 split", () => {
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: S, nivel: n }), g = t.malla.geometry, pos = g.attributes.position.array as Float32Array, idx = g.index!.array;
    const c = CELDAS_TERRENO[n], nv = c + 1, paso = 200 / c;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
      const k = j * nv + i, h = campo(S, -100 + i * paso, -100 + j * paso, { tamano: 200, plaza: 12, sinEstanque: undefined }).h;
      assert.equal(pos[k * 3 + 1], Math.fround(h), `${n} vertex ${i},${j}`);
    }
    // the first cell's two triangles: (i+j) even → a,c,d and a,d,b (the same diagonal alturaMalla and the Residuos use)
    assert.deepEqual(Array.from(idx.slice(0, 6)), [0, nv, nv + 1, 0, nv + 1, 1]);
    assert.deepEqual(Array.from(idx.slice(6, 12)), [1, nv + 1, 2, 2, nv + 1, nv + 2], "odd cell: a,c,b and b,c,d");
    t.dispose();
  }
});

test("R7.2: the baked Residuos land in the mesh with the exact same coordinates as construirResiduos gives", () => {
  const t = crearTerreno({ semilla: S, nivel: "A", flora: false }), g = t.malla.geometry, pos = g.attributes.position.array as Float32Array;
  const nv = CELDAS_TERRENO.A + 1, paso = 200 / CELDAS_TERRENO.A, H = new Float32Array(nv * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) H[j * nv + i] = campo(S, -100 + i * paso, -100 + j * paso, { tamano: 200, plaza: 12 }).h;
  const alturaMalla = (x: number, z: number) => { // the pre-R7.2 formula, verbatim
    const n = CELDAS_TERRENO.A, fi = Math.min(n - 1e-6, Math.max(0, (x + 100) / paso)), fj = Math.min(n - 1e-6, Math.max(0, (z + 100) / paso)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = H[j * nv + i], b = H[j * nv + i + 1], c = H[(j + 1) * nv + i], d = H[(j + 1) * nv + i + 1];
    if ((i + j) & 1) return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
    return u <= v ? a + v * (c - a) + u * (d - c) : a + u * (b - a) + v * (d - b);
  };
  const r = construirResiduos(S, { nivel: "A", tamano: 200, plaza: 12, estanque: estanqueDe(S, 200) }, alturaMalla, (x, z) => t.zonaEn(x, z));
  const desde = pos.length - r.posiciones.length;
  assert.deepEqual(Array.from(pos.slice(desde)), Array.from(new Float32Array(r.posiciones)));
  t.dispose();
});

test("R7.2: smooth normals — unit, up-facing, from the heightfield's central differences; the loose pieces keep a face normal", () => {
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: S, nivel: n }), g = t.malla.geometry, P = g.attributes.position, Nn = g.attributes.normal;
    const c = CELDAS_TERRENO[n], nv = c + 1, paso = 200 / c, H = (i: number, j: number) => P.getY(Math.min(c, Math.max(0, j)) * nv + Math.min(c, Math.max(0, i)));
    let ladera = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
      const k = j * nv + i, gx = (H(i + 1, j) - H(i - 1, j)) / (2 * paso), gz = (H(i, j + 1) - H(i, j - 1)) / (2 * paso), l = Math.hypot(gx, 1, gz);
      assert.ok(Math.abs(Math.hypot(Nn.getX(k), Nn.getY(k), Nn.getZ(k)) - 1) < 1e-5);
      assert.ok(Math.abs(Nn.getX(k) + gx / l) < 1e-5 && Math.abs(Nn.getY(k) - 1 / l) < 1e-5 && Math.abs(Nn.getZ(k) + gz / l) < 1e-5, `${n} ${i},${j}`);
      if (Nn.getY(k) < 0.985) ladera++;
    }
    assert.ok(n === "D" || ladera > 10, `${n}: a few slopes exist (${ladera})`);
    // an inner lattice vertex is shared by several triangles (smooth light across them)
    const idx = g.index!.array, k0 = 5 * nv + 5; let usos = 0;
    for (let q = 0; q < 2 * c * c * 3; q++) if (idx[q] === k0) usos++;
    assert.ok(usos === 4 || usos === 8, `alternating diagonals: 4 or 8 triangles share a lattice vertex (${usos})`);
    t.dispose();
  }
});

test("R7.2: material — smooth (no flatShading), colour from the ground node, one mesh, no texture", () => {
  const t = crearTerreno({ semilla: S, nivel: "B" }), m = t.malla.material as THREE.MeshLambertNodeMaterial;
  assert.equal(m.flatShading, false);
  assert.ok(m.colorNode && m.emissiveNode, "ground node + the R5.1 fill");
  assert.equal(m.map, null);
  assert.equal(t.malla.children.length, 0);
  assert.equal(OCTAVAS_SUELO.B, 1, "Quest pays one noise octave");
  t.dispose();
});

test("R7.2: IQ value noise — deterministic, in 0…1, continuous, not constant", () => {
  let mn = 1, mx = 0;
  for (let i = 0; i < 400; i++) {
    const x = i * 0.173 + 3.1, y = i * 0.091 - 7.7, v = ruidoValor(x, y);
    assert.equal(v, ruidoValor(x, y));
    assert.ok(v >= 0 && v <= 1, `${v}`);
    assert.ok(Math.abs(ruidoValor(x + 1e-3, y) - v) < 0.02, "continuous");
    mn = Math.min(mn, v); mx = Math.max(mx, v);
  }
  assert.ok(mx - mn > 0.6, `range ${mn}…${mx}`);
});

test("R7.2: the SHOWN colour (colorSueloEn, the CPU twin R7.3 samples) keeps the zone moods and the dry bed, and varies inside each zone", () => {
  const t = crearTerreno({ semilla: S, nivel: "A", residuos: false });
  const acc: Record<string, { l: number[]; verde: number }> = {};
  let difiere = 0, total = 0;
  for (let x = -80; x <= 80; x += 1.7) for (let z = -80; z <= 80; z += 1.7) {
    const y = t.alturaEn(x, z); if (y < NIVEL_AGUA + 0.3) continue;
    const f = franjasEn(S, x, z, y), b = f.lecho > 0.7 ? "lecho" : f.agua > 0.75 ? "agua" : f.paramo > 0.75 ? "paramo" : f.jardin > 0.75 ? "jardin" : null;
    const c = t.colorSueloEn(x, z), base = t.colorBaseEn(x, z);
    assert.ok(c.every((v) => v >= 0 && v <= 1), `${x},${z}`);
    total++; if (Math.abs(lum(c) - lum(base)) > 0.03 * lum(base)) difiere++;
    if (!b) continue;
    const a = (acc[b] ??= { l: [], verde: 0 }); a.l.push(lum(c)); a.verde += c[1] - (c[0] + c[2]) / 2;
  }
  const m = (b: string) => acc[b].l.reduce((s, v) => s + v, 0) / acc[b].l.length, v = (b: string) => acc[b].verde / acc[b].l.length;
  for (const b of ["lecho", "agua", "paramo", "jardin"]) assert.ok(acc[b]?.l.length > 20, `${b}: ${acc[b]?.l.length}`);
  assert.ok(m("paramo") < m("jardin") * 0.5, `moor ${m("paramo").toFixed(3)} vs garden ${m("jardin").toFixed(3)}`);
  assert.ok(m("lecho") > m("jardin") * 1.1, `bed ${m("lecho").toFixed(3)} vs garden ${m("jardin").toFixed(3)}`);
  assert.ok(v("agua") > v("jardin") + 0.02, `water green ${v("agua").toFixed(3)} vs garden ${v("jardin").toFixed(3)}`);
  assert.ok(difiere / total > 0.4, `the noise touches most of the ground (${difiere}/${total})`);
  const sd = (b: string) => { const mu = m(b); return Math.sqrt(acc[b].l.reduce((s, x) => s + (x - mu) ** 2, 0) / acc[b].l.length); };
  assert.ok(sd("jardin") > 0.02, `the garden varies: σ ${sd("jardin").toFixed(3)}`);
  t.dispose();
});

test("R7.2: steep ground leans to the rock/earth tone; masked ground (under water, fog border, baked pieces) keeps its vertex colour", () => {
  const roca = new THREE.Color(SUELO_R72.roca), R = [roca.r, roca.g, roca.b], base = [0.6, 0.55, 0.45];
  const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let mas = 0;
  for (let i = 0; i < 50; i++) {
    const x = i * 3.3 - 80, z = i * 2.1 - 50;
    if (d(sombrearSuelo(base, x, z, 0.9, 1, S), R) < d(sombrearSuelo(base, x, z, 1, 1, S), R)) mas++;
    assert.deepEqual(sombrearSuelo(base, x, z, 0.9, 0, S), base, "mask 0 = untouched");
  }
  assert.equal(mas, 50);
  const t = crearTerreno({ semilla: S, nivel: "A" }), e = t.estanque;
  assert.deepEqual(t.colorSueloEn(e.x, e.z), t.colorBaseEn(e.x, e.z), "the pond bed under the water is not shaded");
  const b0 = t.colorBaseEn(100, 100), b1 = t.colorSueloEn(100, 100);
  assert.ok(b0.every((v, q) => Math.abs(v - b1[q]) < 1e-4), "the fog border corner is not shaded");
  t.dispose();
});

test("R7.2: the TSL node builds for every tier (graph only; the GPU compile is checked by the photo kit)", () => {
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: S, nivel: n, residuos: false });
    assert.ok((t.malla.material as THREE.MeshLambertNodeMaterial).colorNode);
    t.dispose();
  }
  assert.equal(typeof nodoSuelo, "function");
});

test("R7.2: SUELO_R72 lives at the end of paleta.ts and uses only tokens and mezcla (no raw hex)", () => {
  const pal = readFileSync(new URL("../packages/render/src/naturaleza/paleta.ts", import.meta.url), "utf8");
  const i = pal.indexOf("export const SUELO_R72"), bloque = pal.slice(i, pal.indexOf("} as const;", i));
  assert.ok(i > 0 && !/0x[0-9a-f]/i.test(bloque), "no raw hex in SUELO_R72");
  assert.ok(pal.trimEnd().endsWith("} as const;"), "the file closes its last block");
});
