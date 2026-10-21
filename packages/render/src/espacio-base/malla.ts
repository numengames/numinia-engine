// espacio-base · malla (H2): the PURE part of the mesh — a few thousand LINE SEGMENTS as plain typed arrays (no three.js, no DOM, no clock), so a test can
// count them, check the plateau and compare with the collision mesh without a GPU. Nothing is a texture, an image or a data file: it is built from
// `alturaBase` (relieve/espacio-base.ts) in a few ms, once, and never touched again (zero CPU per frame).
//
// What it holds, in ONE vertex buffer + ONE Uint16 index buffer (one draw call):
//  · the lattice: n×n cells over the world's square, both directions (tipo 0). Lattice vertices are shared, so a line is 2 indices, not 2 vertices.
//  · contour lines every 12 m of height (tipo 1): marching squares over the same lattice (linear along the cell's edges).
//  · the ring at the plateau's edge (tipo 2): a polygon at y = 0 (the plateau is flat there).
//  · the rare accents (tipos 3–6: coral, ámbar, morado, verde): a short vertical tick on a lattice vertex picked by an integer hash of (i, j, seed).
// The lattice follows the same alternating-cell idea as the collision mesh only in its edges; the lines are not triangles, so no diagonal exists to match.
import { alturaBase, RADIO_MESETA } from "../../../relieve/src/espacio-base.ts";
import type { SemillaBase } from "../../../relieve/src/espacio-base.ts";
import type { Nivel } from "../calidad.ts";

/** The world's side (m): the same square the collision wall closes (sim/terreno-malla.ts TAMANO_ESPACIO_BASE; a test compares). */
export const LADO_MUNDO = 400;
/** Cells per side by tier: A 64 (6.25 m), B 48 (8.3 m), C 32 (12.5 m), D 20 (20 m, the minimum). Lattice lines = 2·n·(n+1). */
export const CELDAS_POR_NIVEL: Record<Nivel, number> = { A: 64, B: 48, C: 32, D: 20 };
/** The most line segments the whole mesh (lattice + contours + ring + accents) may send per tier; a test checks. D is the bare minimum. */
export const LINEAS_TOPE: Record<Nivel, number> = { A: 9500, B: 5600, C: 2700, D: 1200 };
/** Draw calls of the piece itself (the sky dome is the engine's): the line mesh + the accents' dots (one tiny quad mesh, ~600 vertices at most) + the translucent fill (B6: same vertices as the lines, only a triangle index). */
export const LLAMADAS = 3;
/** Contour interval (m of height) and the lowest height that gets one (the plateau and its lip stay clean). */
export const PASO_CURVA = 12;
/** Probability that a lattice vertex carries an accent tick. */
export const PROBABILIDAD_ACENTO = 0.03;
/** Radius (m) of the ring: the plateau's edge. */
export const RADIO_ANILLO = RADIO_MESETA;
export const TIPO = { red: 0, curva: 1, anillo: 2, coral: 3, ambar: 4, morado: 5, verde: 6 } as const;
const SEGMENTOS_ANILLO: Record<Nivel, number> = { A: 96, B: 72, C: 48, D: 32 };
const ALTO_ACENTO = 1.6;

export type Malla = {
  n: number; nv: number; posicion: Float32Array; tipo: Float32Array; indice: Uint16Array;
  /** B6: 2 triangles per lattice cell over the FIRST nv·nv vertices of `posicion` (the lattice), the diagonal alternating like sim/terreno-malla.ts. Heights are not recomputed. */
  indiceRelleno: Uint32Array;
  /** Segments (= indice.length / 2) and how many are of each kind. */
  /** The accents' dots (puntos.ts-free): one camera-facing quad per accent, at the tick's tip — position (x,y,z)×4, corner (±1,±1)×4, tipo×4, Uint16 index ×6. */
  puntos: { posicion: Float32Array; esquina: Float32Array; tipo: Float32Array; indice: Uint16Array };
  lineas: number; porTipo: { red: number; curva: number; anillo: number; acentos: number }; vertices: number; hmin: number; hmax: number;
};

/** Integer hash of (i, j, seed) → [0, 1): lowbias32-style, deterministic everywhere (Math.imul is exact). */
function hash(i: number, j: number, s: number): number {
  let h = (Math.imul(i + 1013, 0x9e3779b1) ^ Math.imul(j + 7919, 0x85ebca6b) ^ Math.imul(s + 17, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The mesh of a seed on a tier. Pure; a few ms. */
export function construirMalla(semilla: SemillaBase, nivel: Nivel): Malla {
  const n = CELDAS_POR_NIVEL[nivel], nv = n + 1, mitad = LADO_MUNDO / 2, paso = LADO_MUNDO / n;
  const pos: number[] = [], tipo: number[] = [], idx: number[] = [];
  let hmin = Infinity, hmax = -Infinity;
  const H = new Float32Array(nv * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const x = -mitad + i * paso, z = -mitad + j * paso, y = Math.fround(alturaBase(semilla, x, z));
    H[j * nv + i] = y; pos.push(x, y, z); tipo.push(TIPO.red);
    if (y < hmin) hmin = y; if (y > hmax) hmax = y;
  }
  let red = 0, curva = 0, anillo = 0, acentos = 0;
  const pp: number[] = [], pe: number[] = [], pt: number[] = [], pi: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const a = j * nv + i;
    if (i < n) { idx.push(a, a + 1); red++; }
    if (j < n) { idx.push(a, a + nv); red++; }
  }
  const rel = new Uint32Array(6 * n * n);
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1; // the same diagonal rule as the collision mesh and the drawn terrain
    if ((i + j) & 1) { rel[o++] = a; rel[o++] = c; rel[o++] = b; rel[o++] = b; rel[o++] = c; rel[o++] = d; }
    else { rel[o++] = a; rel[o++] = c; rel[o++] = d; rel[o++] = a; rel[o++] = d; rel[o++] = b; }
  }
  const nuevo = (x: number, y: number, z: number, t: number): number => { pos.push(x, y, z); tipo.push(t); return tipo.length - 1; };
  // contour lines: marching squares, level k·PASO_CURVA for k ≠ 0 (the plateau is the 0 level and the ring marks it)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = [H[j * nv + i], H[j * nv + i + 1], H[(j + 1) * nv + i + 1], H[(j + 1) * nv + i]]; // corners: (i,j) (i+1,j) (i+1,j+1) (i,j+1)
    const cx = [-mitad + i * paso, -mitad + (i + 1) * paso, -mitad + (i + 1) * paso, -mitad + i * paso], cz = [-mitad + j * paso, -mitad + j * paso, -mitad + (j + 1) * paso, -mitad + (j + 1) * paso];
    const lo = Math.min(...h), hi = Math.max(...h);
    for (let k = Math.ceil(lo / PASO_CURVA); k <= Math.floor(hi / PASO_CURVA); k++) {
      if (k === 0) continue;
      const L = k * PASO_CURVA, cortes: number[][] = [];
      for (let e = 0; e < 4; e++) {
        const p = h[e], q = h[(e + 1) % 4];
        if ((p < L) !== (q < L)) { const t = (L - p) / (q - p); cortes.push([cx[e] + (cx[(e + 1) % 4] - cx[e]) * t, L, cz[e] + (cz[(e + 1) % 4] - cz[e]) * t]); }
      }
      if (cortes.length === 2) { idx.push(nuevo(cortes[0][0], L, cortes[0][2], TIPO.curva), nuevo(cortes[1][0], L, cortes[1][2], TIPO.curva)); curva++; }
      else if (cortes.length === 4) { idx.push(nuevo(cortes[0][0], L, cortes[0][2], TIPO.curva), nuevo(cortes[1][0], L, cortes[1][2], TIPO.curva), nuevo(cortes[2][0], L, cortes[2][2], TIPO.curva), nuevo(cortes[3][0], L, cortes[3][2], TIPO.curva)); curva += 2; }
    }
  }
  // the ring of the plateau's edge
  const sa = SEGMENTOS_ANILLO[nivel], v0 = tipo.length;
  for (let s = 0; s < sa; s++) { const t = (s / sa) * Math.PI * 2; nuevo(Math.cos(t) * RADIO_ANILLO, 0.02, Math.sin(t) * RADIO_ANILLO, TIPO.anillo); }
  for (let s = 0; s < sa; s++) { idx.push(v0 + s, v0 + ((s + 1) % sa)); anillo++; }
  // rare accents: a short vertical tick over a lattice vertex (never on the plateau's centre: 14 m around the spawn stay clean)
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const x = -mitad + i * paso, z = -mitad + j * paso;
    if (Math.hypot(x, z) < 14 || hash(i, j, semilla) >= PROBABILIDAD_ACENTO) continue;
    const r = hash(j + 311, i + 77, semilla), t = r < 0.3 ? TIPO.coral : r < 0.6 ? TIPO.ambar : r < 0.8 ? TIPO.morado : TIPO.verde, y = H[j * nv + i];
    idx.push(nuevo(x, y, z, t), nuevo(x, y + ALTO_ACENTO, z, t)); acentos++;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pp.push(x, y + ALTO_ACENTO, z); pe.push(a, b); pt.push(t); }
    pi.push(4 * (acentos - 1), 4 * acentos - 3, 4 * acentos - 2, 4 * (acentos - 1), 4 * acentos - 2, 4 * acentos - 1);
  }
  if (tipo.length > 65535) throw new Error("espacio-base: más de 65535 vértices (los índices son Uint16)");
  return { n, nv, posicion: new Float32Array(pos), tipo: new Float32Array(tipo), indice: new Uint16Array(idx), indiceRelleno: rel, puntos: { posicion: new Float32Array(pp), esquina: new Float32Array(pe), tipo: new Float32Array(pt), indice: new Uint16Array(pi) }, lineas: idx.length / 2, porTipo: { red, curva, anillo, acentos }, vertices: tipo.length, hmin, hmax };
}
