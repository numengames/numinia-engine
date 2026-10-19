// terreno (naturaleza N1): seeded relief with five zones, as a pure height/zone function plus ONE mesh (one draw call).
//
// `alturaEn(semilla, x, z)` and `zonaEn(semilla, x, z)` are pure: the same seed gives the same hills on a phone, on the
// server (collision, spawn scatter) and in a test. `crearTerreno(h)` samples them on a grid (cells per side by device tier,
// calidad.ts levels) and builds a single non-indexed BufferGeometry: flat normals (faceted look), a colour per vertex that
// blends the zones softly and darkens in the valleys (free fake ambient occlusion), no texture, no light of its own.
//
// COPIED (ideas and technique, no assets, no code): Red Blob Games «Making maps with noise» (elevation + moisture-like masks
// choose the biome), Inigo Quilez «fbm» and «morenoise» (ridged detail on a mask), his smooth-max trick to lift basins.
// Flat shading + per-vertex colours in a tight palette is the common low-poly look (Kenney / Quaternius style).
// CHANGED: everything is a function of an integer seed (semilla.ts); a `plaza` disc is forced flat (the spawn stays
// walkable); a pond basin is carved at a seed-chosen place with a sand belt around it; the outer border fades to the fog
// colour and drops into a skirt so there is no visible edge.
import * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import { hash2, valor2, simplex2 } from "./semilla.ts";
import { CASA, VERDES, ESTACIONES, COLOR_ESTANQUE, FRANJAS, mezcla } from "./paleta.ts";
import type { Estacion } from "./paleta.ts";

import { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe, campo, sstep } from "../../../relieve/src/relieve.ts";
import type { Zona, OpcionesRelieve } from "../../../relieve/src/relieve.ts";
export { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe };
export type { Zona, OpcionesRelieve };
import { construirResiduos } from "./residuos.ts";
import { nodoRelleno } from "./relleno.ts";
import type { Sitio } from "./residuos.ts";
const TAMANO = 200, PLAZA = 12, AGUA = NIVEL_AGUA;

/** Grid cells per side by device tier (A desktop · B Quest · C mid phone · D old phone). Triangles = 2·n² + skirt (8·n). */
export const CELDAS_TERRENO: Record<Nivel, number> = { A: 34, B: 24, C: 20, D: 16 }; // R4: A/B/C shrank (were 40/28/24) so the baked Residuos (residuos.ts, RESIDUOS_POR_NIVEL) fit INSIDE the terrain's share of the budget

export type OpcionesTerreno = {
  semilla: number;
  /** Device tier (calidad.ts); picks the grid resolution. Default "A". */
  nivel?: Nivel;
  /** World side in metres (default 200). */
  tamano?: number;
  /** Radius (m) kept almost flat at the origin (default 12). */
  plaza?: number;
  /** Colour (hex) the outer border fades to; use the scene's fog colour (default 0xbcd6ee). */
  niebla?: number;
  /** Add the mesh to this parent (scene or group); dispose() removes it. */
  escena?: THREE.Object3D;
  /** N4: no pond (see OpcionesRelieve.sinEstanque). */
  sinEstanque?: boolean;
  /** N4: colours (hex) over the house palette, per zone: the world's palette (verano / otoño / primavera) changes the meadow only. */
  colores?: Partial<Record<Zona, number>>;
  /** R5.2: the world's season (paleta.ts ESTACIONES): picks the meadow colours; wins over the legacy `colores`. */
  estacion?: Estacion;
  /** N4: draw the mesh with shadows from the sun (tier A only: the caller decides). */
  recibeSombra?: boolean;
  /** N6: paint the pond into the terrain mesh as a flat disc of `LADOS_AGUA_PLANA` triangles (colour hex) instead of a separate water mesh: one draw call less (tier D). */
  aguaPlana?: number;
  /** R4: bake the Residuos (old machinery half buried in the landscape, residuos.ts) into this same mesh: no draw call. Default true; false = bare terrain. */
  residuos?: boolean;
};
/** Triangles of the painted pond (a fan). */
export const LADOS_AGUA_PLANA = 14;
export type Terreno = {
  malla: THREE.Mesh;
  alturaEn: (x: number, z: number) => number;
  zonaEn: (x: number, z: number) => Zona;
  /** R6.2: the ground bands at a point (pass the height when you have it: one relief sample less). */
  franjaEn: (x: number, z: number, h?: number) => Franjas;
  estanque: { x: number; z: number; radio: number; nivel: number };
  /** Triangles and vertices of the mesh (draw calls: 1). Includes the baked Residuos. */
  triangulos: number; vertices: number;
  /** R4: the baked Residuos (triangles inside `triangulos`) and their sites (position, kind) for later features. */
  residuos: { triangulos: number; sitios: Sitio[] };
  dispose: () => void;
};

/** Number of triangles of a terrain with `n` cells per side: the grid plus a four-sided skirt. */
export const triangulosDeTerreno = (n: number, aguaPlana = false) => 2 * n * n + 8 * n + (aguaPlana ? LADOS_AGUA_PLANA : 0);

/** R1: the season whose meadow colour is nearest to a legacy hex (naturaleza.ts still passes pre-palette hexes for spring/autumn): terrain and grass only ever wear ESTACIONES colours. */
export function estacionDe(hex?: number): (typeof ESTACIONES)[Estacion] {
  if (hex === undefined) return ESTACIONES.verano;
  let mejor: Estacion = "verano", d0 = Infinity;
  for (const k of Object.keys(ESTACIONES) as Estacion[]) {
    const c = ESTACIONES[k].hierba, d = ((c >> 16) - (hex >> 16)) ** 2 + (((c >> 8) & 255) - ((hex >> 8) & 255)) ** 2 + ((c & 255) - (hex & 255)) ** 2;
    if (d < d0) { d0 = d; mejor = k; }
  }
  return ESTACIONES[mejor];
}
const lim = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * R6.2 · The three bands of the ground (DISENO-LORE.md), as soft weights at a world point: `agua` (the pond's surroundings and the
 * banks of the dry stream bed), `lecho` (the bed itself: a pale band of silica pebbles), `paramo` (the anthracite moor on the higher,
 * farther ground) and `jardin` (the colony garden: what is left). agua + paramo + jardin = 1; `lecho` lies inside `agua`.
 * The bed is a meandering curve that leaves the pond and crosses the meadow beside the plaza (colour and grass only: alturaEn, the
 * collision, is untouched). Transitions are gradual and broken by noise, never a line. Pure: a function of (seed, x, z, h).
 */
export type Franjas = { agua: number; lecho: number; paramo: number; jardin: number };
export function franjasEn(s: number, x: number, z: number, h: number, op?: OpcionesRelieve): Franjas {
  const tam = op?.tamano ?? TAMANO, plaza = op?.plaza ?? PLAZA, r = Math.hypot(x, z);
  const n1 = valor2(s + 141, x * 0.022, z * 0.022), n2 = valor2(s + 143, x * 0.07, z * 0.07);
  let lecho = 0, orillaLecho = 0, aguaEst = 0;
  if (!op?.sinEstanque) {
    const e = estanqueDe(s, tam), de = Math.hypot(e.x, e.z) || 1;
    // the bed's axis: from the pond, toward the far side, turned aside so it passes the plaza at a distance
    const giro = (hash2(s, 7101, 5) < 0.5 ? -1 : 1) * 0.46, bx = -e.x / de, bz = -e.z / de;
    const dx = bx * Math.cos(giro) - bz * Math.sin(giro), dz = bx * Math.sin(giro) + bz * Math.cos(giro);
    const px = x - e.x, pz = z - e.z, u = px * dx + pz * dz, v = -px * dz + pz * dx;
    const f1 = 0.045, f2 = 0.11, a1 = 8, a2 = 3.2, ph = hash2(s, 7102, 5) * 6.283;
    const c = a1 * Math.sin(u * f1 + ph) + a2 * Math.sin(u * f2 + ph * 1.7) + 3 * simplex2(s + 93, u * 0.02, 1.7);
    const dc = a1 * f1 * Math.cos(u * f1 + ph) + a2 * f2 * Math.cos(u * f2 + ph * 1.7);
    const d = Math.abs(v - c) / Math.sqrt(1 + dc * dc), ancho = 6 + 3 * valor2(s + 94, u * 0.03, 0.5);
    const tramo = sstep(e.radio * 0.6, e.radio * 1.1, u) * (1 - sstep(tam * 0.6, tam * 0.78, u)) * sstep(plaza * 1.05, plaza * 1.7, r);
    lecho = (1 - sstep(ancho * 0.55, ancho, d + (n2 - 0.5) * 1.6)) * tramo;
    orillaLecho = (1 - sstep(ancho, ancho + 6 + 7 * n1, d)) * tramo;
    aguaEst = 1 - sstep(1.45, 2.6, Math.hypot(x - e.x, z - e.z) / e.radio + (n1 - 0.5) * 0.9);
  }
  const agua = Math.max(aguaEst, orillaLecho);
  // the moor: farther from the plaza, higher, and where a slow noise says so; never at the plaza, faded under the water band
  const lejos = sstep(plaza * 2, tam * 0.42, r), alto = lim(h / 6);
  const base = 0.42 * lejos + 0.22 * alto + 0.55 * valor2(s + 147, x * 0.011 + 2.3, z * 0.011 - 4.1) + 0.18 * (n1 - 0.5);
  const paramo = sstep(0.56, 0.74, base) * sstep(plaza * 1.6, plaza * 3.2, r) * (1 - agua);
  return { agua, lecho, paramo, jardin: Math.max(0, 1 - agua - paramo) };
}

/**
 * R1: the colour (hex) of the ground at a lattice vertex, ONLY from paleta.ts and mezcla(). Pure.
 * R6.2: the open ground reads in three bands (franjasEn): the colony garden in light parchment (warm sand, dry olive patches,
 * straw), the water band in livelier moss green and verdigris, the anthracite moor dark and golden (ash and basalt, ochre crust
 * patches, faint crack lines); the dry stream bed is a pale band of silica pebbles. Forest floor, sand, rock and shore keep their
 * zone colours, leaning toward the band they sit in.
 * `w` = zone weights (ZONAS order), `valle` 0…1 (1 = hollow), `conv` = height above the neighbours' mean per metre (>0 ridge, <0 hollow), `pend` = slope.
 * Warmer toward the light on ridges and sunlit rises, cooler and darker in hollows; the bed and rock ledges are colour only (the mesh keeps alturaEn).
 */
export function colorTerreno(s: number, x: number, z: number, h: number, w: ArrayLike<number>, valle: number, conv: number, pend: number, est: (typeof ESTACIONES)[Estacion], plaza = PLAZA, op?: OpcionesRelieve, fr: Franjas = franjasEn(s, x, z, h, { ...op, plaza })): number {
  const ruido = valor2(s + 37, x * 0.03, z * 0.03), fino = valor2(s + 23, x * 0.11, z * 0.11), mancha = valor2(s + 51, x * 0.045, z * 0.045);
  const seco = sstep(0.42, 0.7, ruido), sol = lim(conv * 4 + 0.5), hondo = lim(valle * 0.9 - conv * 3);
  // garden (light parchment): warm sand and sun-baked earth, dry olive-green patches, straw; rises lighter, hollows a touch greener
  let jardin = mezcla(FRANJAS.jardin.arena, FRANJAS.jardin.tierra, lim(0.35 + 0.6 * (fino - 0.5) + hondo * 0.3));
  jardin = mezcla(jardin, mezcla(FRANJAS.jardin.olivo, est.hierba, 0.25), lim(sstep(0.42, 0.72, mancha) * 0.8 * (1 - 0.4 * seco) + hondo * 0.25));
  jardin = mezcla(jardin, FRANJAS.jardin.paja, sstep(0.5, 0.78, ruido) * 0.65 * (1 - sstep(0.5, 0.7, mancha)));
  jardin = mezcla(jardin, CASA.arena, lim((sol - 0.5) * 0.5));
  // water band: fresh moss green, verdigris in the hollows and damp patches (the season's green leans in)
  let agua = mezcla(mezcla(FRANJAS.agua.suelo, est.hierba, 0.3), FRANJAS.agua.fresco, lim(0.35 + 0.7 * (fino - 0.5) + (sol - 0.5) * 0.6));
  agua = mezcla(agua, FRANJAS.agua.verdin, lim(hondo * 0.55 + sstep(0.62, 0.85, mancha) * 0.35));
  // moor (dark and golden): ash and basalt, ochre/amber crust patches catching the light, faint crack lines
  const costra = sstep(0.48, 0.72, valor2(s + 151, x * 0.06, z * 0.06)), grieta = 1 - sstep(0.035, 0.11, Math.abs(simplex2(s + 97, x * 0.045, z * 0.045)));
  let paramo = mezcla(FRANJAS.paramo.ceniza, FRANJAS.paramo.basalto, lim(0.3 + hondo * 0.55 + (fino - 0.5) * 0.6 - (sol - 0.5) * 0.4));
  paramo = mezcla(paramo, FRANJAS.paramo.costra, lim(costra * 0.55 + (sol - 0.5) * 0.3) * (1 - fr.agua)); // no gold crust in the damp band
  paramo = mezcla(paramo, FRANJAS.paramo.grieta, grieta * 0.55);
  // the open ground: garden → moor → water by the band weights (they sum to 1), a chain of mezcla inside the palette hull
  let prado = mezcla(jardin, paramo, fr.paramo / Math.max(fr.paramo + fr.jardin, 1e-6));
  prado = mezcla(prado, agua, fr.agua);
  // forest floor: dark mountain green with moss on rises, deep shade in hollows; it leans toward the band around it
  let bosque = mezcla(VERDES.monte, VERDES.musgo, lim(mancha * 0.55 + (sol - 0.5) * 0.7));
  bosque = mezcla(bosque, VERDES.monteSombra, lim(0.18 + hondo * 0.6));
  bosque = mezcla(bosque, prado, 0.3 + 0.3 * fr.paramo);
  // sand: warm, two tones
  const arena = mezcla(mezcla(CASA.arenaVelada, CASA.arena, 0.2 + 0.5 * fino), VERDES.hierbaLuz, 0.22 + seco * 0.15 + hondo * 0.1);
  // rock: ash with bronze strata (ledges follow the height and steepen with the slope), sunlit rises toward sand-light, a touch of moss; darker on the moor
  const estrato = 0.5 + 0.5 * Math.sin(h * 2.3 + simplex2(s + 71, x * 0.05, z * 0.05) * 2);
  let roca = mezcla(CASA.ceniza, CASA.bronce, lim(0.12 + 0.3 * estrato * lim(pend * 0.8) + hondo * 0.45));
  roca = mezcla(roca, CASA.arenaVelada, lim((sol - 0.45) * 0.55));
  roca = mezcla(roca, VERDES.musgo, sstep(0.66, 0.85, mancha) * (1 - lim(pend * 0.9)) * 0.5 * (1 - fr.paramo));
  roca = mezcla(roca, paramo, fr.paramo * 0.55);
  // shore above the water: damp sand with moss
  const orilla = mezcla(mezcla(CASA.arenaVelada, VERDES.musgo, 0.22 + 0.3 * fino), VERDES.hierbaSombra, hondo * 0.3);
  const zonas = [prado, bosque, arena, roca, orilla];
  // the zone weights give the pond a wide sand belt; as colour only half of it stays pale sand, the rest reads as the water band's green (the weights and alturaEn stay as they are)
  const wc = [w[0] + w[2] * 0.55, w[1], w[2] * 0.45, w[3], w[4]];
  // linear blend of the five zone colours by weight, done as a chain of mezcla (stays inside the palette hull)
  let c = zonas[0], acum = wc[0];
  for (let q = 1; q < 5; q++) { acum += wc[q]; if (wc[q] > 0) c = mezcla(c, zonas[q], wc[q] / Math.max(acum, 1e-6)); }
  // the dry stream bed: pale silica pebbles and sand over whatever zone it crosses (speckled by a fine noise), above the water only
  const lecho = mezcla(FRANJAS.lecho.claro, FRANJAS.lecho.guijarro, lim(sstep(0.4, 0.8, fino) * 0.4 + (1 - sol) * 0.15));
  c = mezcla(c, lecho, fr.lecho * 0.92 * sstep(AGUA, AGUA + 0.4, h));
  // underwater: sea-green shallows, turquoise, deep turquoise with depth (the pond's bed shows through the water)
  const prof = AGUA - h;
  if (prof > -0.1) {
    const fondo = mezcla(mezcla(CASA.arenaVelada, CASA.verdemar, sstep(0, 0.35, prof)), mezcla(mezcla(CASA.turquesa, CASA.ceniza, 0.3), mezcla(CASA.turquesaProfundo, CASA.bronce, 0.35), sstep(0.9, 1.9, prof)), sstep(0.35, 1.4, prof));
    c = mezcla(c, fondo, sstep(-0.1, 0.2, prof));
  }
  return c;
}

/** Build the terrain: ONE mesh, flat-shaded, vertex colours, no texture. */
export function crearTerreno(o: OpcionesTerreno): Terreno {
  const nivel = o.nivel ?? "A", n = CELDAS_TERRENO[nivel], tam = o.tamano ?? TAMANO, op: OpcionesRelieve = { tamano: tam, plaza: o.plaza ?? PLAZA, sinEstanque: o.sinEstanque };
  const s = o.semilla, mitad = tam / 2, paso = tam / n;
  const nv = n + 1;
  // sample heights and zone weights once per lattice vertex, then colour in a second pass (slope and curvature need the neighbours)
  const H = new Float32Array(nv * nv), W = new Float32Array(nv * nv * 5), V0 = new Float32Array(nv * nv), C = new Float32Array(nv * nv * 3), P = new Float32Array(nv * nv), L = new Float32Array(nv * nv);
  const est = o.estacion ? ESTACIONES[o.estacion] : estacionDe(o.colores?.prado), niebla = new THREE.Color(o.niebla ?? 0xbcd6ee), nieblaHex = niebla.getHex();
  const borde = tam * 0.14, tmpC = new THREE.Color();
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const c = campo(s, -mitad + i * paso, -mitad + j * paso, op), k = j * nv + i;
    H[k] = c.h; V0[k] = c.valle;
    for (let q = 0; q < 5; q++) W[k * 5 + q] = c.w[q];
  }
  const Hh = (i: number, j: number) => H[Math.min(nv - 1, Math.max(0, j)) * nv + Math.min(nv - 1, Math.max(0, i))];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const x = -mitad + i * paso, z = -mitad + j * paso, k = j * nv + i, h = H[k];
    const media = (Hh(i - 1, j) + Hh(i + 1, j) + Hh(i, j - 1) + Hh(i, j + 1)) / 4;
    const pend = Math.hypot(Hh(i + 1, j) - Hh(i - 1, j), Hh(i, j + 1) - Hh(i, j - 1)) / (2 * paso);
    const fr = franjasEn(s, x, z, h, op); P[k] = fr.paramo; L[k] = h > AGUA + 0.2 ? fr.lecho : 0; // R6.2: the band weights; the moor's and the bed's shares also tint their facets below
    const hex = colorTerreno(s, x, z, h, W.subarray(k * 5, k * 5 + 5), V0[k], (h - media) / paso, pend, est, op.plaza ?? PLAZA, op, fr);
    const f = sstep(mitad - borde, mitad, Math.max(Math.abs(x), Math.abs(z))); // 0 inside … 1 at the border
    tmpC.setHex(f > 0 ? mezcla(hex, nieblaHex, f) : hex);
    C[k * 3] = tmpC.r; C[k * 3 + 1] = tmpC.g; C[k * 3 + 2] = tmpC.b;
  }
  const e = estanqueDe(s, tam), plana = o.aguaPlana !== undefined && !o.sinEstanque;
  // R4: the Residuos are baked into this mesh. They stand on the DRAWN surface (the grid's triangles, not the smooth alturaEn), so they never float or sink on a facet.
  const alturaMalla = (x: number, z: number) => {
    const fi = Math.min(n - 1e-6, Math.max(0, (x + mitad) / paso)), fj = Math.min(n - 1e-6, Math.max(0, (z + mitad) / paso)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = H[j * nv + i], b = H[j * nv + i + 1], c = H[(j + 1) * nv + i], d = H[(j + 1) * nv + i + 1];
    if ((i + j) & 1) return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
    return u <= v ? a + v * (c - a) + u * (d - c) : a + u * (b - a) + v * (d - b);
  };
  const res = o.residuos === false ? null : construirResiduos(s, { nivel, tamano: tam, plaza: op.plaza ?? PLAZA, estanque: o.sinEstanque ? null : e }, alturaMalla, (x, z) => zonaEn(s, x, z, op));
  const triRes = res?.triangulos ?? 0, tris = triangulosDeTerreno(n, plana) + triRes, nvt = tris * 3;
  const pos = new Float32Array(nvt * 3), col = new Float32Array(nvt * 3);
  let p = 0;
  const caida = 10; // skirt drop (m) below the border height
  const tri = (a: number[], b: number[], c: number[], ia: number, ib: number, ic: number, fog: boolean) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const u = fog ? 0.5 : hash2(s, (a[0] * 7) | 0, (a[2] * 7) | 0); // a faint per-face tint so the facets read: toward sand-light or toward dark bronze, never a flat scale
    const idx = [ia, ib, ic], pts = [a, b, c];
    for (let q = 0; q < 3; q++) {
      pos[p * 3] = pts[q][0]; pos[p * 3 + 1] = pts[q][1]; pos[p * 3 + 2] = pts[q][2];
      if (idx[q] < 0) { col[p * 3] = niebla.r; col[p * 3 + 1] = niebla.g; col[p * 3 + 2] = niebla.b; }
      else {
        const v = idx[q] * 3; tmpC.setRGB(C[v], C[v + 1], C[v + 2]);
        const pm = P[idx[q]];
        if (u > 0.55 || u < 0.45) tmpC.setHex(u > 0.5 ? mezcla(tmpC.getHex(), CASA.arena, (u - 0.5) * 0.28 * (1 - 0.7 * pm)) : mezcla(tmpC.getHex(), CASA.bronceOscuro, (0.5 - u) * 0.28));
        // R6.2: on the moor some facets read as a crack (near-black basalt) or as a golden crust plate
        // R6.2: the dry bed is pebbly: a third of its facets read as grey silica pebbles, the rest as pale sand
        if (L[idx[q]] > 0.05 && u < 0.36) tmpC.setHex(mezcla(tmpC.getHex(), FRANJAS.lecho.guijarro, L[idx[q]] * 0.55));
        if (pm > 0.05 && (u < 0.12 || u > 0.88)) tmpC.setHex(mezcla(tmpC.getHex(), u < 0.12 ? FRANJAS.paramo.grieta : FRANJAS.paramo.costra, u < 0.12 ? pm * 0.4 : lim((pm - 0.3) / 0.7) * 0.45));
        col[p * 3] = tmpC.r; col[p * 3 + 1] = tmpC.g; col[p * 3 + 2] = tmpC.b;
      }
      p++;
    }
  };
  const V = (i: number, j: number) => [-mitad + i * paso, H[j * nv + i], -mitad + j * paso];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
    const ka = j * nv + i, kb = ka + 1, kc = ka + nv, kd = kc + 1;
    // winding so the normal points up (+y); the diagonal alternates for a less regular facet pattern
    if ((i + j) & 1) { tri(a, c, b, ka, kc, kb, false); tri(b, c, d, kb, kc, kd, false); }
    else { tri(a, c, d, ka, kc, kd, false); tri(a, d, b, ka, kd, kb, false); }
  }
  // skirt: a wall of fog colour under each border edge, so the border never shows a hole when seen from the side
  const pared = (a: number[], b: number[]) => {
    const a2 = [a[0], a[1] - caida, a[2]], b2 = [b[0], b[1] - caida, b[2]];
    tri(a, a2, b, -1, -1, -1, true); tri(b, a2, b2, -1, -1, -1, true);
  };
  for (let i = 0; i < n; i++) {
    pared(V(i + 1, 0), V(i, 0)); // north (z = −mitad): outward −z
    pared(V(i, n), V(i + 1, n)); // south
    pared(V(0, i), V(0, i + 1)); // west
    pared(V(n, i + 1), V(n, i)); // east
  }
  if (plana) { // N6: the pond as a flat blue fan at the water level, slightly lighter at the rim (no animation, no extra draw call)
    const r = e.radio * 1.2, y = AGUA + 0.02, c0 = new THREE.Color(COLOR_ESTANQUE), c1 = new THREE.Color(mezcla(COLOR_ESTANQUE, CASA.verdemar, 0.5)); // R5.2: the pond's palette colour (the same body as tier A's water), a sea-green rim; the hex the caller passes only switches the painted pond on
    for (let k = 0; k < LADOS_AGUA_PLANA; k++) {
      const a0 = (k / LADOS_AGUA_PLANA) * Math.PI * 2, a1 = ((k + 1) / LADOS_AGUA_PLANA) * Math.PI * 2;
      const q = [[e.x, y, e.z], [e.x + Math.cos(a1) * r, y, e.z + Math.sin(a1) * r], [e.x + Math.cos(a0) * r, y, e.z + Math.sin(a0) * r]];
      for (let v = 0; v < 3; v++) {
        pos[p * 3] = q[v][0]; pos[p * 3 + 1] = q[v][1]; pos[p * 3 + 2] = q[v][2];
        const c = v === 0 ? c0 : c1; col[p * 3] = c.r; col[p * 3 + 1] = c.g; col[p * 3 + 2] = c.b; p++;
      }
    }
  }
  if (res && triRes > 0) { pos.set(res.posiciones, p * 3); col.set(res.colores, p * 3); p += triRes * 3; } // R4: the baked Residuos (flat triangles, vertex colours)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  // F4 audit: no normal buffer (a third of the terrain's bytes): the faces are flat, so the material takes them from screen derivatives
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  mat.name = "terreno-naturaleza";
  mat.emissiveNode = nodoRelleno(); // R5.1: the shade fill (relleno.ts): sunless facets of ruins/rocks and shadowed ground read sea-green, not black
  const malla = new THREE.Mesh(g, mat);
  malla.name = "terreno-naturaleza";
  malla.userData.sinSombra = true; malla.receiveShadow = !!o.recibeSombra;
  malla.matrixAutoUpdate = false; malla.updateMatrix(); // never moves: no per-frame matrix work
  o.escena?.add(malla);
  return {
    malla, estanque: { ...e, nivel: AGUA }, triangulos: tris, vertices: nvt, residuos: { triangulos: triRes, sitios: res?.sitios ?? [] },
    alturaEn: (x, z) => alturaEn(s, x, z, op), zonaEn: (x, z) => zonaEn(s, x, z, op),
    franjaEn: (x, z, h) => franjasEn(s, x, z, h ?? alturaEn(s, x, z, op), op),
    dispose: () => { malla.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}
