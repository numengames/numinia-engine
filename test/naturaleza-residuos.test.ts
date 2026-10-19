// R4 (naturaleza): the Residuos baked into the terrain mesh: determinism, exclusions, triangle share per tier, palette membership.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirResiduos, RESIDUOS_POR_NIVEL, PALETA_RESIDUOS, aLineal, TIPOS_PIEZA } from "../packages/render/src/naturaleza/residuos.ts";
import { crearTerreno, CELDAS_TERRENO, triangulosDeTerreno, alturaEn, zonaEn, estanqueDe } from "../packages/render/src/naturaleza/terreno.ts";
import { PRESUPUESTO_NATURALEZA } from "../packages/render/src/naturaleza/niveles.ts";
import { SENAL, COLOR_ESTANQUE } from "../packages/render/src/naturaleza/paleta.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"], S = 1234;
const op = { tamano: 200, plaza: 12 };
const hacer = (nivel: Nivel, semilla = S) => construirResiduos(semilla, { nivel, tamano: 200, plaza: 12, estanque: estanqueDe(semilla, 200) }, (x, z) => alturaEn(semilla, x, z, op), (x, z) => zonaEn(semilla, x, z, op));

test("deterministic: same seed, same bytes; another seed, other sites", () => {
  const a = hacer("A"), b = hacer("A"), c = hacer("A", 99);
  assert.deepEqual(a.sitios, b.sitios);
  assert.deepEqual(Array.from(a.posiciones), Array.from(b.posiciones));
  assert.deepEqual(Array.from(a.colores), Array.from(b.colores));
  assert.notDeepEqual(a.sitios, c.sitios);
});

test("seed 1234 snapshot: site count and pieces per tier", () => {
  const cuenta = Object.fromEntries(NIVELES.map((n) => [n, hacer(n).sitios.length]));
  assert.deepEqual(cuenta, { A: 6, B: 3, C: 2, D: 0 });
  const a = hacer("A");
  assert.ok(a.sitios.every((s) => s.piezas >= 3 && s.piezas <= 7), "a site is 3–7 pieces");
  assert.equal(a.piezas.length, a.sitios.reduce((t, s) => t + s.piezas, 0));
});

test("nothing inside the plaza, the pond, the border; nothing under water", () => {
  for (const semilla of [S, 7, 99, 31337, 2024]) {
    const e = estanqueDe(semilla, 200), r = hacer("A", semilla);
    for (const p of r.piezas) {
      assert.ok(Math.hypot(p.x, p.z) >= 12 + 6, `seed ${semilla}: piece ${p.tipo} in the plaza (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      assert.ok(Math.hypot(p.x - e.x, p.z - e.z) >= e.radio * 1.25 + 3 - 1e-6, `seed ${semilla}: piece ${p.tipo} in the pond`);
      assert.ok(Math.abs(p.x) < 100 - 8 && Math.abs(p.z) < 100 - 8, "inside the world");
    }
  }
});

test("triangle share per tier: baked pieces fit the tier's cap, and terrain + props stay inside the terrain's share of the budget", () => {
  for (const n of NIVELES) {
    const r = hacer(n);
    assert.ok(r.triangulos <= RESIDUOS_POR_NIVEL[n], `${n}: ${r.triangulos} > ${RESIDUOS_POR_NIVEL[n]}`);
    assert.equal(r.posiciones.length, r.triangulos * 9);
    assert.equal(r.colores.length, r.triangulos * 9);
    const t = crearTerreno({ semilla: S, nivel: n, aguaPlana: n === "D" ? COLOR_ESTANQUE : undefined });
    assert.equal(t.residuos.triangulos, r.triangulos, "the terrain bakes exactly what construirResiduos returns");
    assert.equal(t.triangulos, triangulosDeTerreno(CELDAS_TERRENO[n], n === "D") + r.triangulos + t.flora.triangulos); // R6.5: the flora is baked too
    assert.equal(t.malla.geometry.attributes.position.count, t.triangulos * 3);
    assert.ok(t.triangulos <= PRESUPUESTO_NATURALEZA[n].reparto.terreno, `${n}: terrain ${t.triangulos} > share ${PRESUPUESTO_NATURALEZA[n].reparto.terreno}`);
    t.dispose();
  }
  assert.equal(hacer("D").triangulos, 0, "tier D carries none");
  assert.ok(hacer("A").triangulos > 600, "tier A is not empty");
});

test("pieces are 12–60 triangles; at least 8 distinct kinds exist across a few seeds", () => {
  const vistos = new Set<string>();
  for (const semilla of [S, 7, 99, 31337, 2024, 5, 6, 8, 9, 10]) for (const s of hacer("A", semilla).piezas) vistos.add(s.tipo);
  assert.ok(vistos.size >= 8, `${vistos.size} kinds seen: ${[...vistos]}`);
  assert.equal(TIPOS_PIEZA.length, 10);
});

/** Is the linear colour inside the convex hull of the palette (every colour is a blend of palette entries)? Frank-Wolfe on the simplex. */
function enCasco(lineal: [number, number, number], puntos: [number, number, number][]): number {
  const w = new Float64Array(puntos.length).fill(1 / puntos.length);
  const at = () => { const x = [0, 0, 0]; puntos.forEach((p, i) => { x[0] += w[i] * p[0]; x[1] += w[i] * p[1]; x[2] += w[i] * p[2]; }); return x; };
  for (let it = 0; it < 400; it++) {
    const x = at(), g = [x[0] - lineal[0], x[1] - lineal[1], x[2] - lineal[2]];
    let mejor = 0, v = Infinity;
    puntos.forEach((p, i) => { const d = p[0] * g[0] + p[1] * g[1] + p[2] * g[2]; if (d < v) { v = d; mejor = i; } });
    const gamma = 2 / (it + 3);
    for (let i = 0; i < w.length; i++) w[i] *= 1 - gamma; w[mejor] += gamma;
  }
  const x = at();
  return Math.hypot(x[0] - lineal[0], x[1] - lineal[1], x[2] - lineal[2]);
}

test("every vertex colour is a blend of palette colours; the led is the only saturated accent and stays under 1 % of the area", () => {
  // blends are made in sRGB (paleta.ts `mezcla`), so the hull is judged in sRGB too: undo the linear conversion of the stored colours
  const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const r = hacer("A"), P = PALETA_RESIDUOS.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => v / 255) as [number, number, number]), vistos = new Map<string, number>();
  for (let i = 0; i < r.colores.length; i += 3) {
    const c: [number, number, number] = [srgb(r.colores[i]), srgb(r.colores[i + 1]), srgb(r.colores[i + 2])], k = c.map((v) => v.toFixed(4)).join();
    if (!vistos.has(k)) vistos.set(k, enCasco(c, P));
  }
  const peor = Math.max(...vistos.values());
  assert.ok(peor < 0.012, `a colour is ${peor.toFixed(4)} (sRGB, 0–1) outside the palette's hull`);
  // area share of the led-coloured triangles (all three vertices turquoise or coral)
  const led = [aLineal(SENAL.turquesa), aLineal(SENAL.coral)], igual = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-4;
  let area = 0, areaLed = 0, nLed = 0;
  for (let t = 0; t < r.triangulos; t++) {
    const o = t * 9, p = r.posiciones, ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    area += a;
    const c = Array.from(r.colores.slice(o, o + 3));
    if (led.some((l) => igual(c, l))) { areaLed += a; nLed++; }
  }
  assert.ok(nLed > 0, "some pieces carry a tiny led");
  assert.ok(areaLed / area < 0.01, `led area share ${(areaLed / area * 100).toFixed(2)} %`);
});

test("nothing identical: no two pieces of the same kind share scale, yaw and burial", () => {
  const r = hacer("A"), llaves = r.piezas.map((p) => `${p.tipo}|${p.escala.toFixed(3)}|${p.giro.toFixed(3)}`);
  assert.equal(new Set(llaves).size, llaves.length);
});

test("the terrain mesh keeps working: positions finite, colours in range, props stand on the drawn surface", () => {
  const t = crearTerreno({ semilla: S, nivel: "A" });
  const pos = t.malla.geometry.attributes.position.array as Float32Array, col = t.malla.geometry.attributes.color.array as Float32Array;
  assert.ok(pos.every(Number.isFinite) && col.every((v) => v >= 0 && v <= 1.001));
  assert.ok(t.residuos.sitios.length >= 3);
  const bare = crearTerreno({ semilla: S, nivel: "A", residuos: false });
  assert.equal(bare.residuos.triangulos, 0);
  assert.equal(bare.triangulos, triangulosDeTerreno(CELDAS_TERRENO.A));
  // the collision source of truth is untouched: alturaEn does not depend on the props
  for (const [x, z] of [[0, 31], [-9, 30], [20, -40]]) assert.equal(t.alturaEn(x, z), bare.alturaEn(x, z));
  t.dispose(); bare.dispose();
});
