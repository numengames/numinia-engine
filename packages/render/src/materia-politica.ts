// materia-politica (spike «materia de bloques», D-058): the numbers and formulas of the cube-matter layer as plain
// code (no three.js), so the tests see exactly what the shader draws (the same split as teletransporte-politica.ts).
// For Pablo a particle is a BIG BLOCK, easy to paint, that assembles and disassembles: no points. ~80 % of a piece is
// opaque (depth write, no sorting: saber-3d concepts/point-rendering.md) and ~20 % translucent (additive, smaller, no
// sorting), so a piece is TWO instanced draw calls whatever its size. The block's shape is a parameter. A shape is
// a list of target points sampled on a surface (a simple SDF-like shape here, or a mesh's triangles); each cube flies
// from a scattered spot to its point and back, driven by ONE progress number 0..1 the vertex stage reads.
// Sources copied, not invented: the per-instance «start/target + one progress uniform + per-instance delay» dissolve of
// the three.js forum tutorial «Particles with TSL» (https://discourse.threejs.org/t/three-js-tutorial-particles-with-tsl/86645,
// video https://youtu.be/olufmONG7-Q), the area-weighted triangle sampling of three's MeshSurfaceSampler
// (examples/jsm/math/MeshSurfaceSampler.js, MIT) and the Fibonacci sphere of the three.js examples' point clouds.
import type { Nivel } from "./calidad.ts";
import { TURQUESA, VERDEMAR, suave } from "./teletransporte-politica.ts";

/** Blocks per piece, by tier. A desktop; B Quest/Pico in XR (stereo, fill-bound: few and cheap); C mid phone; D none
 * (the piece is not drawn: the solid world is still there). Each block is a die of the mix (MEZCLA, TRIS_DADO). */
export const BLOQUES_PIEZA: Record<Nivel, number> = { A: 4000, B: 800, C: 500, D: 0 };
/** Pieces drawn at once, by tier (each one is TWO draw calls: its opaque part and its translucent part). */
export const PIEZAS_MAX: Record<Nivel, number> = { A: 6, B: 3, C: 2, D: 0 };
/** Draw calls of one piece: one instanced mesh opaque (depth write on) + one translucent (additive, depth write off). */
export const LLAMADAS_PIEZA = 2;
/** Share of a piece's particles that are translucent (Pablo, 19-10: ~80 % opaque / ~20 % translucent), by tier. Quest (B)
 * lowers it: in stereo at 72-90 Hz every translucent pixel is painted twice over what is behind (fill-bound). */
export const TRANSLUCIDO: Record<Nivel, number> = { A: 0.2, B: 0.1, C: 0.15, D: 0 };
/** Translucent particles are smaller than the opaque ones (× side): less overdraw, a glow around the matter. */
export const TAMANO_TRANSLUCIDO = 0.6;
/** How many of N particles are opaque / translucent on a tier (the translucent ones are the last indices). */
export function reparto(n: Nivel, total: number): { opacas: number; translucidas: number } {
  const N = Math.max(0, total | 0), t = Math.round(N * TRANSLUCIDO[n]);
  return { opacas: N - t, translucidas: t };
}

/** The blocks are a MIX of the role-playing dice set (Pablo, 19-10): d4 tetrahedron, d6 cube, d8 octahedron, d10 pentagonal
 * trapezohedron, d12 dodecahedron, d20 icosahedron. Triangles of each (flat faces; a d12 pentagon = 3, a d10 kite = 2). */
export const DADOS = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;
export type Dado = (typeof DADOS)[number];
export const TRIS_DADO: Record<Dado, number> = { d4: 4, d6: 12, d8: 8, d10: 20, d12: 36, d20: 20 };
export type Mezcla = Record<Dado, number>;
/** Pablo's first taste mix (19-10), kept as reference: d8 35 %, d20 20 %, d6 15 %, d4 10 %, d12 10 %, d10 10 %. */
export const MEZCLA_INICIAL: Mezcla = { d8: 0.35, d20: 0.2, d6: 0.15, d4: 0.1, d12: 0.1, d10: 0.1 };

/** The mix is decided by PERFORMANCE, as a gradient per tier (Pablo, 19-10): weight of a die ∝ 1 / cost^k, k growing
 * as the tier gets cheaper (A → C → B → D), so cheap tiers lean on the cheapest dice. Cost proxy today: triangles per
 * die (COSTE_TRIS); swap in GPU ms per die from the bench when it exists (same function, other numbers). */
export const COSTE_TRIS: Record<Dado, number> = { ...TRIS_DADO };
export const SENSIBILIDAD: Record<Nivel, number> = { A: 0.5, C: 1, B: 1.5, D: 2 };
/** The one art rule: octahedra and icosahedra together never under half of the blocks (the look's backbone). */
export const D8_D20_MIN = 0.5;
/** A die under this share is dropped (it would only add vertex slots for almost nobody: see trisEnviados «relleno»). */
export const CUOTA_MIN = 0.05;
const normaliza = (m: Mezcla): Mezcla => { const s = DADOS.reduce((a, d) => a + m[d], 0) || 1; return Object.fromEntries(DADOS.map((d) => [d, m[d] / s])) as Mezcla; };
function conRegla(m: Mezcla): Mezcla {
  const ej = m.d8 + m.d20;
  if (ej >= D8_D20_MIN - 1e-12) return m;
  const fEje = ej > 0 ? D8_D20_MIN / ej : 0, resto = 1 - ej, fResto = resto > 0 ? (1 - D8_D20_MIN) / resto : 0;
  const out = Object.fromEntries(DADOS.map((d) => [d, (d === "d8" || d === "d20" ? fEje : fResto) * m[d]])) as Mezcla;
  if (ej <= 0) { out.d8 = D8_D20_MIN / 2; out.d20 = D8_D20_MIN / 2; }
  return normaliza(out);
}
/** The mix for a tier from the dice's costs (pure): 1/cost^k, the d8+d20 rule, small shares dropped, rule again. */
export function mezcla(n: Nivel, costes: Record<Dado, number> = COSTE_TRIS): Mezcla {
  const k = SENSIBILIDAD[n];
  let m = normaliza(Object.fromEntries(DADOS.map((d) => [d, 1 / Math.pow(Math.max(1e-6, costes[d]), k)])) as Mezcla);
  m = conRegla(m);
  m = normaliza(Object.fromEntries(DADOS.map((d) => [d, m[d] < CUOTA_MIN ? 0 : m[d]])) as Mezcla);
  return conRegla(m);
}
/** The mix per tier (performance gradient). */
export const MEZCLA: Record<Nivel, Mezcla> = { A: mezcla("A"), B: mezcla("B"), C: mezcla("C"), D: mezcla("D") };

/** How one piece carries six shapes:
 *  - "pegados": ONE geometry with the dice back to back; each instance collapses the other dice's triangles to one point
 *    (zero area, never rasterised) → every particle submits the SUM of the dice in the mix (100 with all six), whatever its
 *    own shape: the mix does NOT change the cost. 2 draw calls.
 *  - "relleno": ONE geometry of as many triangle slots as the biggest die in the mix; the vertex stage reads its die's
 *    corners from a small table (texture, like crowd.ts's VAT) and collapses the spare slots → every particle submits
 *    the MAX of the mix (36 with a d12, 20 without): the mix changes the cost only through WHICH dice are in it. 2 calls.
 *  - "separados": one instanced draw per die present (opaque and translucent): each particle submits exactly its own die,
 *    the mix changes the cost linearly — at 2 calls per die (12 with all six). */
export type Metodo = "pegados" | "relleno" | "separados";
export const METODO: Metodo = "relleno";
const presentes = (m: Mezcla): Dado[] => DADOS.filter((d) => m[d] > 0);
/** Triangles each particle submits on average (what renderer.info counts and the vertex stage runs 3× of). */
export function trisEnviados(m: Mezcla, metodo: Metodo = METODO): number {
  const ds = presentes(m);
  if (metodo === "separados") return trisUtiles(m);
  return metodo === "pegados" ? ds.reduce((s, d) => s + TRIS_DADO[d], 0) : Math.max(0, ...ds.map((d) => TRIS_DADO[d]));
}
/** Draw calls of one piece by method (opaque + translucent parts). */
export const llamadas = (m: Mezcla, metodo: Metodo = METODO): number => (metodo === "separados" ? 2 * presentes(m).length : LLAMADAS_PIEZA);
/** Triangles that really reach the screen per particle (the mix's average): what 6 separate draws would submit. */
export function trisUtiles(m: Mezcla): number {
  const tot = DADOS.reduce((s, d) => s + Math.max(0, m[d]), 0) || 1;
  return DADOS.reduce((s, d) => s + (Math.max(0, m[d]) / tot) * TRIS_DADO[d], 0);
}
/** The most triangles the layer may submit on a tier (pieces × particles × triangles per particle): the budget the tests check. */
export const trisMax = (n: Nivel, metodo: Metodo = METODO): number => PIEZAS_MAX[n] * BLOQUES_PIEZA[n] * trisEnviados(MEZCLA[n], metodo);

/** Which die each of n particles is: exact quotas of the mix (largest remainder), shuffled by the seed. */
export function repartirDados(n: number, m: Mezcla, semilla = 1): Uint8Array {
  const N = Math.max(0, n | 0), tot = DADOS.reduce((s, d) => s + Math.max(0, m[d]), 0);
  const out = new Uint8Array(N);
  if (!N || !(tot > 0)) return out;
  const exacto = DADOS.map((d) => (Math.max(0, m[d]) / tot) * N), cuota = exacto.map(Math.floor);
  let falta = N - cuota.reduce((s, x) => s + x, 0);
  const orden = exacto.map((x, k) => [x - Math.floor(x), k] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; falta > 0; j = (j + 1) % orden.length, falta--) cuota[orden[j][1]]++;
  let i = 0;
  cuota.forEach((c, k) => { for (let q = 0; q < c; q++) out[i++] = k; });
  const r = rng(semilla ^ 0x9e3779b9);
  for (let k = N - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)), t = out[k]; out[k] = out[j]; out[j] = t; }
  return out;
}

/** The d10 (pentagonal trapezohedron) as 20 flat triangles, outward winding: ten kites around two apexes, each kite two
 * triangles. Ring at ±0.105 and apexes at ±1 make each kite flat (the proportions of the MIT threejs-dice d10,
 * https://github.com/byWulf/threejs-dice). Size: circumradius 1. Returns xyz per vertex (60 vertices) and flat normals. */
export function d10(): { pos: Float32Array; nor: Float32Array } {
  const e = 0.105, h = 1, R: V3[] = [];
  for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5; R.push([Math.cos(a), k % 2 ? -e : e, Math.sin(a)]); }
  const T: V3 = [0, h, 0], B: V3 = [0, -h, 0], tris: V3[][] = [];
  for (let j = 0; j < 5; j++) {
    const a = R[2 * j], b = R[2 * j + 1], c = R[(2 * j + 2) % 10], d = R[(2 * j + 3) % 10];
    tris.push([T, a, b], [T, b, c], [B, b, c], [B, c, d]);
  }
  const pos = new Float32Array(60 * 3), nor = new Float32Array(60 * 3);
  tris.forEach((t, i) => {
    let [p, q, s] = t;
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const cx = p[0] + q[0] + s[0], cy = p[1] + q[1] + s[1], cz = p[2] + q[2] + s[2];
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) { [q, s] = [s, q]; n = n.map((x) => -x); }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    [p, q, s].forEach((v, k) => { pos.set(v, (i * 3 + k) * 3); nor.set([n[0] / l, n[1] / l, n[2] / l], (i * 3 + k) * 3); });
  });
  return { pos, nor };
}

/** House palette (STD-023 / tema.css): turquoise, sea green, amber, paper. Materia never leaves it. */
export const AMBAR = 0xefa517, PAPEL = 0xf9ebdc;
export const PALETA: readonly number[] = [TURQUESA, VERDEMAR, AMBAR, PAPEL];

/** How much of the progress the cubes' starts are spread over: cube i starts at retraso(i) × RETRASO. */
export const RETRASO = 0.45;
/** Below this progress the cubes grow from nothing (opaque matter cannot fade: it shrinks). */
export const NACER = 0.06;
/** How far (× the shape's radius) the scattered cubes lie. */
export const DISPERSION = 2.2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** A cube's random 0..1 of kind k (the shader uses three's `hash`; only the tests read this one). */
export function azar(i: number, k: number): number {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
/** Cube i's own moment (0..1) at piece progress p: 0 = still scattered, 1 = in its place. */
export function tCubo(i: number, p: number): number {
  return suave(0, 1, clamp01((clamp01(p) - azar(i, 0) * RETRASO) / (1 - RETRASO)));
}
/** Size of a cube (× its side) at piece progress p and its own moment t: grows in from nothing, a little smaller while flying. */
export const tamano = (p: number, t: number): number => suave(0, NACER, p) * (0.55 + 0.45 * t);

export type V3 = [number, number, number];
/** Where cube i waits when scattered (assembling: a wide ring around and above; crumbling: drifting up and away). */
export function disperso(i: number, radio: number, modo: "junta" | "deshace"): V3 {
  const a = azar(i, 1) * Math.PI * 2, r = radio * DISPERSION * (0.6 + 0.4 * azar(i, 2));
  if (modo === "junta") return [Math.cos(a) * r, radio * (0.2 + 1.6 * azar(i, 3)), Math.sin(a) * r];
  return [Math.cos(a) * r * 0.5, radio * (2.5 + 2 * azar(i, 3)), Math.sin(a) * r * 0.5];
}
/** Where cube i is at progress p (without the noise wobble the shader adds while flying): exact on its target at 1. */
export function posicion(i: number, destino: V3, radio: number, p: number, modo: "junta" | "deshace"): V3 {
  const t = tCubo(i, p), d = disperso(i, radio, modo);
  return [d[0] + (destino[0] - d[0]) * t, d[1] + (destino[1] - d[1]) * t, d[2] + (destino[2] - d[2]) * t];
}

/** Preferred side of a block (m): big, easy to read and to paint (Pablo: «cubos grandes»), never dust. */
export const LADO = 0.1;
/** How many blocks a surface of `area` m² wants at side `l` (edge to edge), capped by the tier. */
export function cuantos(area: number, n: Nivel, l = LADO): number {
  if (!(area > 0) || !(l > 0)) return 0;
  return Math.min(BLOQUES_PIEZA[n], Math.ceil(area / (l * l)));
}
/** Side of each block (m) so `n` of them cover `area` m²: the preferred side, bigger when the tier gives fewer blocks. */
export function lado(area: number, n: number, l = LADO): number {
  if (!(n > 0) || !(area > 0)) return l;
  return Math.min(0.5, Math.max(l, Math.sqrt(area / n) * 1.05));
}

/** A small deterministic RNG (mulberry32): the same shape everywhere for the same seed. */
export function rng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type Forma =
  | { tipo: "esfera"; radio: number }
  | { tipo: "columna"; radio: number; alto: number }
  | { tipo: "arco"; ancho: number; alto: number; grueso: number };
export type Muestra = { puntos: Float32Array; colores: Float32Array; area: number; radio: number; n: number };

/** Colour of a point by its height in the shape (0 bottom .. 1 top) and a little noise: bands of the house palette. */
export function colorDe(h: number, r: number, paleta: readonly number[] = PALETA): number {
  const k = Math.min(paleta.length - 1, Math.max(0, Math.floor(clamp01(h * 0.85 + r * 0.3) * paleta.length)));
  return paleta[k];
}
function pintar(colores: Float32Array, i: number, hex: number) {
  colores[i * 3] = ((hex >> 16) & 255) / 255; colores[i * 3 + 1] = ((hex >> 8) & 255) / 255; colores[i * 3 + 2] = (hex & 255) / 255;
}

/** Surface (m²) of a simple shape, as muestrear weighs it (the sphere's whole skin, the column without its bottom, the arch's outer faces). */
export function areaForma(f: Forma): number {
  if (f.tipo === "esfera") return 4 * Math.PI * f.radio * f.radio;
  if (f.tipo === "columna") return 2 * Math.PI * f.radio * f.alto + Math.PI * f.radio * f.radio;
  const g = f.grueso, Ri = f.ancho / 2 - g, Ro = f.ancho / 2, hp = Math.max(0, f.alto - Ro);
  return 2 * 4 * g * hp + Math.PI * (Ro + Ri) * g + 2 * (Math.PI / 2) * (Ro * Ro - Ri * Ri);
}

/** N target points on a simple shape's surface (base on y = 0), with their palette colours. */
export function muestrear(f: Forma, n: number, semilla = 1, paleta: readonly number[] = PALETA): Muestra {
  const N = Math.max(0, n | 0), puntos = new Float32Array(N * 3), colores = new Float32Array(N * 3), r = rng(semilla);
  let area = 0, alto = 1, radio = 1;
  const poner = (i: number, x: number, y: number, z: number) => { puntos[i * 3] = x; puntos[i * 3 + 1] = y; puntos[i * 3 + 2] = z; pintar(colores, i, colorDe(y / alto, r(), paleta)); };
  if (f.tipo === "esfera") {
    // Fibonacci sphere: even, deterministic (golden angle), lifted so it rests on the ground
    const R = f.radio; area = 4 * Math.PI * R * R; alto = 2 * R; radio = R;
    const oro = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) { const y = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - y * y), a = i * oro; poner(i, Math.cos(a) * rr * R, (y + 1) * R, Math.sin(a) * rr * R); }
  } else if (f.tipo === "columna") {
    // side and top cap, area-weighted (the bottom rests on the floor: nobody sees it)
    const R = f.radio, H = f.alto, lat = 2 * Math.PI * R * H, tapa = Math.PI * R * R; area = lat + tapa; alto = H; radio = Math.max(R, H / 2);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2;
      if (r() * area < lat) poner(i, Math.cos(a) * R, r() * H, Math.sin(a) * R);
      else { const rr = Math.sqrt(r()) * R; poner(i, Math.cos(a) * rr, H, Math.sin(a) * rr); }
    }
  } else {
    // arch: two square legs and a half ring on top (the outer faces of each), area-weighted
    const W = f.ancho, H = f.alto, g = f.grueso, Ri = W / 2 - g, Ro = W / 2, hp = Math.max(0, H - Ro);
    const pata = 4 * g * hp, anillo = Math.PI * (Ro + Ri) * g + 2 * (Math.PI / 2) * (Ro * Ro - Ri * Ri);
    area = 2 * pata + anillo; alto = H; radio = Math.max(W, H) / 2;
    for (let i = 0; i < N; i++) {
      const u = r() * area;
      if (u < 2 * pata) {
        const lado = u < pata ? -1 : 1, cx = lado * (W / 2 - g / 2), y = r() * hp, cara = Math.floor(r() * 4), s = (r() - 0.5) * g;
        if (cara === 0) poner(i, cx + s, y, -g / 2); else if (cara === 1) poner(i, cx + s, y, g / 2); else if (cara === 2) poner(i, cx - g / 2, y, s); else poner(i, cx + g / 2, y, s);
      } else {
        const a = r() * Math.PI, rr = Ri + r() * g, z = (r() < 0.5 ? -1 : 1) * g / 2;
        const enCara = r() < 0.5; // half on the flat faces, half on the curved ones
        const R = enCara ? rr : (r() < 0.5 ? Ri : Ro);
        poner(i, Math.cos(a) * R, hp + Math.sin(a) * R, enCara ? z : (r() - 0.5) * g);
      }
    }
  }
  return { puntos, colores, area, radio, n: N };
}

/** N target points on a mesh's triangles, area-weighted (MeshSurfaceSampler's method: cumulative areas + binary search,
 * then a uniform point in the triangle). `pos` = xyz per vertex, `indice` = 3 per triangle (or null: every 3 vertices). */
export function muestrearMalla(pos: ArrayLike<number>, indice: ArrayLike<number> | null, n: number, semilla = 1, paleta: readonly number[] = PALETA): Muestra {
  const T = indice ? Math.floor(indice.length / 3) : Math.floor(pos.length / 9);
  const v = (t: number, k: number) => (indice ? indice[t * 3 + k] : t * 3 + k);
  const acum = new Float64Array(T);
  let area = 0, minY = Infinity, maxY = -Infinity, rad = 0;
  for (let t = 0; t < T; t++) {
    const a = v(t, 0) * 3, b = v(t, 1) * 3, c = v(t, 2) * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2; acum[t] = area;
  }
  for (let i = 1; i < pos.length; i += 3) { minY = Math.min(minY, pos[i]); maxY = Math.max(maxY, pos[i]); rad = Math.max(rad, Math.hypot(pos[i - 1], pos[i + 1])); }
  const N = T && area > 0 ? Math.max(0, n | 0) : 0, puntos = new Float32Array(N * 3), colores = new Float32Array(N * 3), r = rng(semilla);
  const alto = Math.max(1e-6, maxY - minY);
  for (let i = 0; i < N; i++) {
    const objetivo = r() * area;
    let lo = 0, hi = T - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (acum[m] < objetivo) lo = m + 1; else hi = m; }
    let s = r(), q = r(); if (s + q > 1) { s = 1 - s; q = 1 - q; }
    const a = v(lo, 0) * 3, b = v(lo, 1) * 3, c = v(lo, 2) * 3;
    for (let k = 0; k < 3; k++) puntos[i * 3 + k] = pos[a + k] + (pos[b + k] - pos[a + k]) * s + (pos[c + k] - pos[a + k]) * q;
    pintar(colores, i, colorDe((puntos[i * 3 + 1] - minY) / alto, r(), paleta));
  }
  return { puntos, colores, area, radio: Math.max(rad, alto / 2), n: N };
}
