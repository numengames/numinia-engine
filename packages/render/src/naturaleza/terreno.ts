// terreno (naturaleza N1): seeded relief with five zones, as a pure height/zone function plus ONE mesh (one draw call).
//
// `alturaEn(semilla, x, z)` and `zonaEn(semilla, x, z)` are pure: the same seed gives the same hills on a phone, on the
// server (collision, spawn scatter) and in a test. `crearTerreno(h)` samples them on a grid (cells per side by device tier,
// calidad.ts levels) and builds a single INDEXED BufferGeometry (R7.2: shared lattice vertices, smooth normals), a colour per
// vertex that blends the zones softly and darkens in the valleys (free fake ambient occlusion), no texture, no light of its own.
//
// COPIED (ideas and technique, no assets, no code): Red Blob Games «Making maps with noise» (elevation + moisture-like masks
// choose the biome), Inigo Quilez «fbm» and «morenoise» (ridged detail on a mask), his smooth-max trick to lift basins.
// CHANGED: everything is a function of an integer seed (semilla.ts); a `plaza` disc is forced flat (the spawn stays
// walkable); a pond basin is carved at a seed-chosen place with a sand belt around it; the outer border fades to the fog
// colour and drops into a skirt so there is no visible edge.
//
// R7.2 · GROUND WITHOUT FACETS (work/naturaleza/investigacion/02-hierba-suelo.md §4 and «qué copiar primero» #3):
//  - Smooth normals that follow the heightfield: one normal per lattice vertex from central differences of the sampled heights,
//    exactly as three r186 `examples/jsm/generators/TerrainGenerator.js` (normals from the grid neighbours) and the official
//    `webgpu_tsl_procedural_terrain` example do. The lattice vertices are shared (indexed), so the light is continuous across
//    triangles. Heights, triangles and their split are untouched (collision = relieve `alturaEn`, byte-identical).
//  - Macro colour variation: Inigo Quilez's 2-D value noise (iquilezles.org/articles/morenoise, Shadertoy lsf3WH «Noise - value
//    - 2D», MIT; its sine-free hash) evaluated per fragment in world XZ, pushing the zone vertex colour toward a «dry» or a
//    «healthy» palette tone in patches (Unity terrain-grass «healthy/dry» noise patches, 02 [20]; the macro/grain split of
//    TerrainGenerator.js `macro`/`grain`). Tier A adds a second, finer octave (grain) that hides the grid's interpolation pattern.
//  - Slope blend: steep faces lean toward an exposed rock/earth tone — `mix(rock, grass, smoothstep(a, b, slope))` from
//    F. Piaggio «Painting the landscape» (02 [38]) and Unreal's stylised landscape (02 [31]); thresholds rescaled to our gentle
//    relief (the steepest lattice normal has n.y ≈ 0.91 on tier A).
//  - Tones only from paleta.ts (`SUELO_R72`): the light/dark choice follows the base colour's luminance, so the moor's patches are
//    golden crust / basalt and the garden's are straw / olive shade (zone moods of R6.2 kept; the dry stream bed band too).
//  Fragment cost (estimated, no texture fetch): one value-noise octave ≈ 4 hashes × ~10 ALU + ~10 = ~50 ALU; tone + slope ≈ 25 ALU.
//  Tier A ≈ 125 ALU (2 octaves), tiers B (Quest) / C / D ≈ 75 ALU (1 octave). Zero draw calls, zero textures, no new pass.
//
// FOR R7.3 (grass takes the ground colour): the SAME colour is available two ways —
//  - `terreno.colorSueloEn(x, z)`: pure CPU, the linear RGB the ground shows at a world point (lattice colour interpolated on the
//    drawn triangle, the same normal and mask, the noise mirrored in float32). Cheapest: bake it into each tuft's instance colour.
//  - `nodoSuelo({ base, xz, ny, mascara, semilla, nivel })`: the exported TSL node this material uses; feed it the tuft's base
//    colour (`terreno.colorBaseEn`), its root XZ and the ground normal's y (`terreno.normalEn`) to shade per fragment.
import * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import { hash2, valor2, simplex2 } from "./semilla.ts";
import { CASA, VERDES, ESTACIONES, COLOR_ESTANQUE, FRANJAS, SUELO_R72, mezcla } from "./paleta.ts";
import { Fn, float, vec2, vec3, color, floor, fract, mix, smoothstep, step, dot, max, abs, clamp, oneMinus, select, uint, vertexIndex, varying, attribute, positionLocal, positionWorld, normalWorld, positionGeometry, normalLocal, normalize, length, cameraPosition } from "three/tsl";
import type { Estacion } from "./paleta.ts";

import { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe, campo, sstep } from "../../../relieve/src/relieve.ts";
import type { Zona, OpcionesRelieve } from "../../../relieve/src/relieve.ts";
export { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe };
export type { Zona, OpcionesRelieve };
import { construirResiduos } from "./residuos.ts";
import { nodoRelleno } from "./relleno.ts";
import type { Sitio } from "./residuos.ts";
import { construirFlora } from "./flora.ts"; // R6.5
import { crearTrozos, gruesoEn, alturaGruesaEn, RELEVO } from "./trozos.ts"; // E02
import type { OpcionesTrozos, EstadisticasTrozos } from "./trozos.ts";
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
  /** B3: seed of the espacio base. Present = the nature is painted on the base's relief (heights = alturaBase, relieve.ts B1), with no pond; the mesh is pushed back in depth so the base's lines draw over it. */
  base?: number;
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
  /** R6.5: bake the lore's minor flora (flora.ts) into this same mesh: no draw call. Default: as `residuos` (so `residuos: false` stays bare terrain). */
  flora?: boolean;
  /** E02 (trozos.ts): cut the lattice into ~64 m chunks with two detail rings, still ONE draw call (index ranges + CDLOD-style morph).
   *  Absent/null = the single mesh as before (byte-identical index). Call `terreno.trozos.actualizar(x, z)` with the camera each frame. */
  trozos?: OpcionesTrozos | null;
  /** E02: cells per side (even), overriding the tier's CELDAS_TERRENO — for bigger maps at the tier's density (bench rows of 1–4 km). */
  celdas?: number;
};
/** Triangles of the painted pond (a fan). */
export const LADOS_AGUA_PLANA = 14;
export type Terreno = {
  malla: THREE.Mesh;
  alturaEn: (x: number, z: number) => number;
  /** avatares/suelo-relieve: the height of the DRAWN surface (the lattice triangle under the point), which the coarser collision mesh only approximates. */
  alturaDibujadaEn: (x: number, z: number) => number;
  zonaEn: (x: number, z: number) => Zona;
  /** R6.2: the ground bands at a point (pass the height when you have it: one relief sample less). */
  franjaEn: (x: number, z: number, h?: number) => Franjas;
  estanque: { x: number; z: number; radio: number; nivel: number };
  /** Triangles and vertices of the mesh (draw calls: 1). Includes the baked Residuos. */
  triangulos: number; vertices: number;
  /** R4: the baked Residuos (triangles inside `triangulos`) and their sites (position, kind) for later features. */
  residuos: { triangulos: number; sitios: Sitio[] };
  /** R6.5: the baked flora's triangles (inside `triangulos`). */
  flora: { triangulos: number };
  /** R7.2: the linear RGB the ground SHOWS at a world point (vertex colour + noise + slope, as the shader does): what R7.3's grass samples. */
  colorSueloEn: (x: number, z: number) => [number, number, number];
  /** E02: the chunk driver (null = single mesh). `actualizar` picks each chunk's ring for a camera at (x, z) and uploads the index if it changed. */
  trozos: { actualizar: (x: number, z: number) => boolean; estadisticas: () => EstadisticasTrozos } | null;
  /** R7.2: the ground's vertex colour (linear RGB) interpolated on the drawn triangle, before the shader's noise and slope. */
  colorBaseEn: (x: number, z: number) => [number, number, number];
  /** R7.2: the ground's smooth normal (unit, interpolated on the drawn triangle, as the fragment sees it). */
  normalEn: (x: number, z: number) => [number, number, number];
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

// ---------------------------------------------------------------- R7.2 · ground shading (macro noise + slope), CPU and TSL twins
/** Octaves of the per-fragment value noise by tier: A two (macro patches + fine grain); B (Quest), C, D one (macro only: ~50 ALU less). */
export const OCTAVAS_SUELO: Record<Nivel, 1 | 2> = { A: 2, B: 1, C: 1, D: 1 };
/** Noise frequencies (1/m): macro patches ≈ 19 m across, grain ≈ 4 m (finer than tier A's 5.9 m cell: it hides the interpolation pattern). */
export const ESCALA_SUELO = { macro: 1 / 19, grano: 1 / 4.3 } as const;
/** How far the noise / slope pull the vertex colour toward their palette tone (0…1 of a mix). */
export const FUERZA_SUELO = { seco: 0.42, sano: 0.36, grano: 0.12, roca: 0.6 } as const;
/** Noise ramps: dry patches from m = 0.45 (full at 0.85), healthy ones below 0.55 (full at 0.15): a thin neutral band, no hard contour. */
const RAMPA_SECO: readonly [number, number] = [0.45, 0.85], RAMPA_SANO: readonly [number, number] = [0.15, 0.55];
/** Slope (1 − n.y) where the rock/earth blend starts and where it is full: ≈ 10° … 21° (from ~the steepest 15 % of tier A ground) (our relief is gentle: steepest n.y ≈ 0.91). */
export const PENDIENTE_SUELO: readonly [number, number] = [0.014, 0.07];
/** Linear luminance band where the tones switch from the moor's (dark: golden crust, basalt) to the garden's (light: straw, olive shade). */
const LUZ_SUELO: readonly [number, number] = [0.05, 0.28];
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const off = (s: number, k: number) => [hash2(s, 7201 + k, 3) * 61, hash2(s, 7203 + k, 3) * 61] as const; // per-seed noise offset (kept small: float32 hash precision)
const lin = (hex: number) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as const; }; // sRGB hex → linear, as the TSL `color()` does

// Inigo Quilez, 2-D value noise with his sine-free hash (Shadertoy lsf3WH, MIT): mirrored in float32 so the CPU twin matches the GPU.
const f32 = Math.fround, fr32 = (v: number) => f32(v - Math.floor(v));
function hashIQ(px: number, py: number): number {
  const qx = f32(50 * fr32(f32(f32(px * 0.3183099) + 0.71))), qy = f32(50 * fr32(f32(f32(py * 0.3183099) + 0.113)));
  return fr32(f32(f32(qx * qy) * f32(qx + qy)));
}
/** Pure: IQ value noise in 0…1 at (x, y) (noise units), float32 like the shader. */
export function ruidoValor(x: number, y: number): number {
  x = f32(x); y = f32(y);
  const ix = Math.floor(x), iy = Math.floor(y), fx = f32(x - ix), fy = f32(y - iy);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hashIQ(ix, iy), b = hashIQ(ix + 1, iy), c = hashIQ(ix, iy + 1), d = hashIQ(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
type N = ReturnType<typeof float>;
type V2 = ReturnType<typeof vec2>;
type V3 = ReturnType<typeof vec3>;
const hashT = (p: V2): N => { const q = fract(p.mul(0.3183099).add(vec2(0.71, 0.113))).mul(50) as unknown as V2; return fract(q.x.mul(q.y).mul(q.x.add(q.y))) as unknown as N; };
/** TSL twin of `ruidoValor` (IQ value noise, 0…1). */
export const ruidoValorNodo = Fn(([p]: [V2]) => {
  const i = floor(p).toVar(), f = fract(p).toVar(), u = f.mul(f).mul(f.mul(-2).add(3)).toVar() as unknown as V2;
  const ii = i as unknown as V2;
  return mix(mix(hashT(ii), hashT(ii.add(vec2(1, 0))), u.x), mix(hashT(ii.add(vec2(0, 1))), hashT(ii.add(vec2(1, 1))), u.x), u.y);
}) as unknown as (p: V2) => N;

const sm = (a: number, b: number, x: number) => sstep(a, b, x);
const mixA = (a: readonly number[], b: readonly number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * Pure CPU twin of `nodoSuelo`: the colour the ground shows from its vertex colour `base` (linear RGB), the world point, the normal's y and
 * the mask (1 = open ground; 0 = skirt, painted pond, baked Residuos/flora, under water, fog border). Same constants, same order of mixes.
 */
export function sombrearSuelo(base: readonly number[], x: number, z: number, ny: number, mascara: number, semilla: number, nivel: Nivel = "A"): [number, number, number] {
  if (mascara <= 0) return [base[0], base[1], base[2]];
  const T = tonosSuelo(), luz = sm(LUZ_SUELO[0], LUZ_SUELO[1], base[0] * LUMA[0] + base[1] * LUMA[1] + base[2] * LUMA[2]);
  const seco = mixA(T.secoParamo, T.seco, luz), sano = mixA(T.sanoParamo, T.sano, luz), roca = mixA(T.rocaParamo, T.roca, luz);
  const [ox, oz] = off(semilla, 0), m = ruidoValor(x * ESCALA_SUELO.macro + ox, z * ESCALA_SUELO.macro + oz);
  let c = mixA(base, seco, sm(RAMPA_SECO[0], RAMPA_SECO[1], m) * FUERZA_SUELO.seco * mascara);
  c = mixA(c, sano, (1 - sm(RAMPA_SANO[0], RAMPA_SANO[1], m)) * FUERZA_SUELO.sano * mascara);
  if (OCTAVAS_SUELO[nivel] > 1) {
    const [gx, gz] = off(semilla, 1), g = ruidoValor((x * 0.8 - z * 0.6) * ESCALA_SUELO.grano + gx, (x * 0.6 + z * 0.8) * ESCALA_SUELO.grano + gz); // rotated 37°: no shared grid axis with the macro octave
    c = mixA(c, g >= 0.5 ? seco : sano, Math.abs(g - 0.5) * 2 * FUERZA_SUELO.grano * mascara);
  }
  const e = sm(PENDIENTE_SUELO[0], PENDIENTE_SUELO[1], 1 - ny) * (0.7 + 0.3 * m); // the rock shows through in noisy patches, not a contour line
  c = mixA(c, roca, e * FUERZA_SUELO.roca * mascara);
  return [c[0], c[1], c[2]];
}
let tonos: Record<keyof typeof SUELO_R72, readonly [number, number, number]> | null = null;
const tonosSuelo = () => (tonos ??= Object.fromEntries(Object.entries(SUELO_R72).map(([k, v]) => [k, lin(v)])) as Record<keyof typeof SUELO_R72, readonly [number, number, number]>);

export type EntradaSuelo = { base: V3; xz: V2; ny: N; mascara: N; semilla: number; nivel?: Nivel };
/**
 * R7.2 · The ground's colour node (TSL): the zone colour `base` (linear) pushed toward dry / healthy palette tones by IQ value noise in world XZ
 * and toward rock/earth on steep faces (`ny` = the normal's world y), weighted by `mascara`. Terrain material = this; R7.3's grass may reuse it.
 */
export function nodoSuelo(e: EntradaSuelo): V3 {
  const T = tonosSuelo(), c3 = (k: keyof typeof SUELO_R72) => color(...(T[k] as [number, number, number])) as unknown as V3;
  const luz = smoothstep(LUZ_SUELO[0], LUZ_SUELO[1], dot(e.base, vec3(...LUMA)));
  const seco = mix(c3("secoParamo"), c3("seco"), luz).toVar() as unknown as V3, sano = mix(c3("sanoParamo"), c3("sano"), luz).toVar() as unknown as V3;
  const roca = mix(c3("rocaParamo"), c3("roca"), luz) as unknown as V3;
  const [ox, oz] = off(e.semilla, 0), m = ruidoValorNodo(e.xz.mul(ESCALA_SUELO.macro).add(vec2(ox, oz)) as unknown as V2).toVar() as unknown as N;
  let c = mix(e.base, seco, smoothstep(RAMPA_SECO[0], RAMPA_SECO[1], m).mul(FUERZA_SUELO.seco).mul(e.mascara)) as unknown as V3;
  c = mix(c, sano, oneMinus(smoothstep(RAMPA_SANO[0], RAMPA_SANO[1], m)).mul(FUERZA_SUELO.sano).mul(e.mascara)) as unknown as V3;
  if (OCTAVAS_SUELO[e.nivel ?? "A"] > 1) {
    const [gx, gz] = off(e.semilla, 1), x = e.xz.x as unknown as N, z = e.xz.y as unknown as N;
    const g = ruidoValorNodo(vec2(x.mul(0.8).sub(z.mul(0.6)), x.mul(0.6).add(z.mul(0.8))).mul(ESCALA_SUELO.grano).add(vec2(gx, gz)) as unknown as V2);
    c = mix(c, mix(sano, seco, step(0.5, g)), abs(g.sub(0.5)).mul(2 * FUERZA_SUELO.grano).mul(e.mascara)) as unknown as V3;
  }
  const pend = smoothstep(PENDIENTE_SUELO[0], PENDIENTE_SUELO[1], oneMinus(e.ny)).mul(m.mul(0.3).add(0.7));
  return mix(c, roca, pend.mul(FUERZA_SUELO.roca).mul(e.mascara)) as unknown as V3;
}

/** Build the terrain: ONE mesh (one draw call), R7.2 smooth-shaded over shared lattice vertices, vertex colours + the ground node, no texture. */
export function crearTerreno(o: OpcionesTerreno): Terreno {
  const nivel = o.nivel ?? "A", n = o.celdas ?? CELDAS_TERRENO[nivel], tam = o.tamano ?? TAMANO, sinEstanque = !!o.sinEstanque || o.base !== undefined, op: OpcionesRelieve = { tamano: tam, plaza: o.plaza ?? PLAZA, sinEstanque, ...(o.base !== undefined ? { base: o.base } : {}) };
  const s = o.semilla, mitad = tam / 2, paso = tam / n;
  const nv = n + 1;
  // sample heights and zone weights once per lattice vertex, then colour in a second pass (slope and curvature need the neighbours)
  const H = new Float32Array(nv * nv), W = new Float32Array(nv * nv * 5), V0 = new Float32Array(nv * nv), C = new Float32Array(nv * nv * 3);
  const NR = new Float32Array(nv * nv * 3), M = new Float32Array(nv * nv); // R7.2: smooth normal and shading mask per lattice vertex
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
    const gx = (Hh(i + 1, j) - Hh(i - 1, j)) / (2 * paso), gz = (Hh(i, j + 1) - Hh(i, j - 1)) / (2 * paso), pend = Math.hypot(gx, gz);
    // R7.2: the heightfield's normal by central differences (TerrainGenerator.js / webgpu_tsl_procedural_terrain): (−∂h/∂x, 1, −∂h/∂z), normalised
    const il = 1 / Math.hypot(gx, 1, gz); NR[k * 3] = -gx * il; NR[k * 3 + 1] = il; NR[k * 3 + 2] = -gz * il;
    const fr = franjasEn(s, x, z, h, op);
    const hex = colorTerreno(s, x, z, h, W.subarray(k * 5, k * 5 + 5), V0[k], (h - media) / paso, pend, est, op.plaza ?? PLAZA, op, fr);
    const f = sstep(mitad - borde, mitad, Math.max(Math.abs(x), Math.abs(z))); // 0 inside … 1 at the border
    tmpC.setHex(f > 0 ? mezcla(hex, nieblaHex, f) : hex);
    C[k * 3] = tmpC.r; C[k * 3 + 1] = tmpC.g; C[k * 3 + 2] = tmpC.b;
    M[k] = mascaraSuelo(x, z, h, mitad, borde); // the shader recomputes this per vertex (same formula): the CPU twin interpolates it on the triangle like the GPU
  }
  const e = estanqueDe(s, tam), plana = o.aguaPlana !== undefined && !sinEstanque;
  // the drawn surface: the triangle of the lattice cell under (x, z) and its barycentric weights (the split alternates by cell parity, as built below)
  const celda = (x: number, z: number, cb: (ka: number, wa: number, kb: number, wb: number, kc: number, wc: number) => number) => {
    const fi = Math.min(n - 1e-6, Math.max(0, (x + mitad) / paso)), fj = Math.min(n - 1e-6, Math.max(0, (z + mitad) / paso)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
    if ((i + j) & 1) return u + v <= 1 ? cb(a, 1 - u - v, b, u, c, v) : cb(d, u + v - 1, c, 1 - u, b, 1 - v);
    return u <= v ? cb(a, 1 - v, c, v - u, d, u) : cb(a, 1 - u, b, u - v, d, v);
  };
  // R4: the Residuos are baked into this mesh. They stand on the DRAWN surface (the grid's triangles, not the smooth alturaEn), so they never float or sink on a facet.
  // (kept in its pre-R7.2 arithmetic, so the Residuos/flora positions stay byte-identical)
  const alturaMalla = (x: number, z: number) => {
    const fi = Math.min(n - 1e-6, Math.max(0, (x + mitad) / paso)), fj = Math.min(n - 1e-6, Math.max(0, (z + mitad) / paso)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = H[j * nv + i], b = H[j * nv + i + 1], c = H[(j + 1) * nv + i], d = H[(j + 1) * nv + i + 1];
    if ((i + j) & 1) return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
    return u <= v ? a + v * (c - a) + u * (d - c) : a + u * (b - a) + v * (d - b);
  };
  const en3 = (A: Float32Array, x: number, z: number): [number, number, number] => { const r: [number, number, number] = [0, 0, 0]; celda(x, z, (ka, wa, kb, wb, kc, wc) => { for (let q = 0; q < 3; q++) r[q] = A[ka * 3 + q] * wa + A[kb * 3 + q] * wb + A[kc * 3 + q] * wc; return 0; }); return r; };
  const res = o.residuos === false ? null : construirResiduos(s, { nivel, tamano: tam, plaza: op.plaza ?? PLAZA, estanque: sinEstanque ? null : e }, alturaMalla, (x, z) => zonaEn(s, x, z, op));
  const flo = !(o.flora ?? o.residuos !== false) ? null : construirFlora(s, { nivel, tamano: tam, plaza: op.plaza ?? PLAZA, estanque: sinEstanque ? null : e, evitar: res?.piezas }, alturaMalla, (x, z) => zonaEn(s, x, z, op)); // R6.5
  const triRes = res?.triangulos ?? 0, triFlo = flo?.triangulos ?? 0, tris = triangulosDeTerreno(n, plana) + triRes + triFlo;
  // R7.2 vertex layout: [lattice nv² (shared, smooth)] [skirt, pond, Residuos, flora: 3 own vertices per triangle (their faces stay flat)]
  const nRejilla = nv * nv, nSueltos = (tris - 2 * n * n) * 3, nvt = nRejilla + nSueltos;
  const pos = new Float32Array(nvt * 3), col = new Float32Array(nvt * 3), nor = new Float32Array(nvt * 3);
  const idx = nvt > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) { const k = j * nv + i; pos[k * 3] = -mitad + i * paso; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = -mitad + j * paso; }
  col.set(C); nor.set(NR);
  let t = 0, p = nRejilla;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ka = j * nv + i, kb = ka + 1, kc = ka + nv, kd = kc + 1;
    // winding so the normal points up (+y); the diagonal alternates for a less regular pattern (same split as before R7.2: alturaMalla and the collision agree)
    if ((i + j) & 1) { idx[t++] = ka; idx[t++] = kc; idx[t++] = kb; idx[t++] = kb; idx[t++] = kc; idx[t++] = kd; }
    else { idx[t++] = ka; idx[t++] = kc; idx[t++] = kd; idx[t++] = ka; idx[t++] = kd; idx[t++] = kb; }
  }
  /** One loose triangle (own vertices); `nrm` null = its face normal from the winding (front faces face the viewer, as flatShading did). */
  const suelto = (q: number[][], cs: THREE.Color[], nrm: number[] | null) => {
    let nx = 0, ny = 1, nz = 0;
    if (!nrm) {
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2], vx = q[2][0] - q[0][0], vy = q[2][1] - q[0][1], vz = q[2][2] - q[0][2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    } else [nx, ny, nz] = nrm;
    for (let v = 0; v < 3; v++) {
      pos[p * 3] = q[v][0]; pos[p * 3 + 1] = q[v][1]; pos[p * 3 + 2] = q[v][2];
      col[p * 3] = cs[v].r; col[p * 3 + 1] = cs[v].g; col[p * 3 + 2] = cs[v].b;
      nor[p * 3] = nx; nor[p * 3 + 1] = ny; nor[p * 3 + 2] = nz; idx[t++] = p++;
    }
  };
  const caida = 10; // skirt drop (m) below the border height
  const V = (i: number, j: number) => [-mitad + i * paso, H[j * nv + i], -mitad + j * paso];
  const ARRIBA = [0, 1, 0], nn = [niebla, niebla, niebla];
  // skirt: a wall of fog colour under each border edge, so the border never shows a hole when seen from the side (lit as the ground above it: normal up)
  const pared = (a: number[], b: number[]) => {
    const a2 = [a[0], a[1] - caida, a[2]], b2 = [b[0], b[1] - caida, b[2]];
    suelto([a, a2, b], nn, ARRIBA); suelto([b, a2, b2], nn, ARRIBA);
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
      suelto([[e.x, y, e.z], [e.x + Math.cos(a1) * r, y, e.z + Math.sin(a1) * r], [e.x + Math.cos(a0) * r, y, e.z + Math.sin(a0) * r]], [c0, c1, c1], ARRIBA);
    }
  }
  // R4 / R6.5: the baked Residuos and flora (flat triangles, vertex colours): each keeps its face normal, so they light exactly as with flatShading
  const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
  for (const b of [res && triRes > 0 ? res : null, flo && triFlo > 0 ? flo : null]) {
    if (!b) continue;
    const P = b.posiciones, K = b.colores, nt = P.length / 9;
    for (let q = 0; q < nt; q++) {
      const o9 = q * 9;
      cA.setRGB(K[o9], K[o9 + 1], K[o9 + 2]); cB.setRGB(K[o9 + 3], K[o9 + 4], K[o9 + 5]); cC.setRGB(K[o9 + 6], K[o9 + 7], K[o9 + 8]);
      suelto([[P[o9], P[o9 + 1], P[o9 + 2]], [P[o9 + 3], P[o9 + 4], P[o9 + 5]], [P[o9 + 6], P[o9 + 7], P[o9 + 8]]], [cA, cB, cC], null);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); // R7.2: smooth on the lattice, per face on the loose triangles (F4 had dropped it while the faces were flat)
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const atIdx = new THREE.BufferAttribute(idx, 1);
  g.setIndex(atIdx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  // E02 · chunks with two detail rings in ONE draw call (trozos.ts): every vertex also carries the coarse surface's height, normal and
  // colour at its place (`grueso` = h + normal, `colorGrueso`); the vertex shader morphs toward them by camera distance. Loose props
  // (skirt, Residuos, flora) shift by the coarse − fine height under them, so they stay on the ground; the painted pond stays flat.
  let trozos: Terreno["trozos"] = null;
  if (o.trozos) {
    const hG = gruesoEn(H, n, 1), nG = gruesoEn(NR, n, 3), cG = gruesoEn(C, n, 3);
    const gr = new Float32Array(nvt * 4), cgr = new Float32Array(nvt * 3);
    for (let k = 0; k < nRejilla; k++) { gr[k * 4] = hG[k]; gr[k * 4 + 1] = nG[k * 3]; gr[k * 4 + 2] = nG[k * 3 + 1]; gr[k * 4 + 3] = nG[k * 3 + 2]; cgr.set(cG.subarray(k * 3, k * 3 + 3), k * 3); }
    const pond0 = nRejilla + 8 * n * 3, pond1 = pond0 + (plana ? LADOS_AGUA_PLANA * 3 : 0);
    for (let k = nRejilla; k < nvt; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], estanq = k >= pond0 && k < pond1;
      gr[k * 4] = estanq ? y : y + alturaGruesaEn(H, n, tam, x, z) - alturaMalla(x, z);
      gr[k * 4 + 1] = nor[k * 3]; gr[k * 4 + 2] = nor[k * 3 + 1]; gr[k * 4 + 3] = nor[k * 3 + 2];
      cgr[k * 3] = col[k * 3]; cgr[k * 3 + 1] = col[k * 3 + 1]; cgr[k * 3 + 2] = col[k * 3 + 2];
    }
    g.setAttribute("grueso", new THREE.BufferAttribute(gr, 4));
    g.setAttribute("colorGrueso", new THREE.BufferAttribute(cgr, 3));
    const T = crearTrozos({ n, tam, opciones: o.trozos }, idx, idx.slice(6 * n * n)); // the loose triangles go first (constant), the chunk ranges after
    const subir = () => { atIdx.clearUpdateRanges(); atIdx.addUpdateRange(T.inicio, T.cuenta - T.inicio); atIdx.needsUpdate = true; g.setDrawRange(0, T.cuenta); };
    subir();
    trozos = { actualizar: (x, z) => { const c = T.actualizar(x, z); if (c) subir(); return c; }, estadisticas: () => T.estadisticas() };
  }
  const mat = materialSuelo({ semilla: s, nivel, nRejilla, mitad, borde, radioDetalle: o.trozos?.radioDetalle ?? 0 });
  if (o.base !== undefined) { mat.polygonOffset = true; mat.polygonOffsetFactor = 2; mat.polygonOffsetUnits = 2; } // B3: the base's lines (drawn after, depth-tested) win the tie with this surface
  const malla = new THREE.Mesh(g, mat);
  malla.name = "terreno-naturaleza";
  malla.userData.sinSombra = true; malla.receiveShadow = !!o.recibeSombra;
  malla.matrixAutoUpdate = false; malla.updateMatrix(); // never moves: no per-frame matrix work
  o.escena?.add(malla);
  const colorBaseEn = (x: number, z: number) => en3(C, x, z);
  const normalEn = (x: number, z: number): [number, number, number] => { const r = en3(NR, x, z), l = Math.hypot(r[0], r[1], r[2]) || 1; return [r[0] / l, r[1] / l, r[2] / l]; };
  const mascaraEn = (x: number, z: number) => celda(x, z, (ka, wa, kb, wb, kc, wc) => M[ka] * wa + M[kb] * wb + M[kc] * wc);
  return {
    malla, estanque: { ...e, nivel: AGUA }, triangulos: tris, vertices: nvt, residuos: { triangulos: triRes, sitios: res?.sitios ?? [] }, flora: { triangulos: triFlo },
    alturaEn: (x, z) => alturaEn(s, x, z, op), alturaDibujadaEn: alturaMalla, zonaEn: (x, z) => zonaEn(s, x, z, op),
    franjaEn: (x, z, h) => franjasEn(s, x, z, h ?? alturaEn(s, x, z, op), op),
    colorBaseEn, normalEn,
    colorSueloEn: (x, z) => sombrearSuelo(colorBaseEn(x, z), x, z, normalEn(x, z)[1], mascaraEn(x, z), s, nivel),
    trozos,
    dispose: () => { malla.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}

/** R7.2: where the ground shading applies (1) — open ground above the water, fading out over the fog border like the vertex colour does. */
function mascaraSuelo(x: number, z: number, h: number, mitad: number, borde: number): number {
  return (1 - sstep(mitad - borde, mitad, Math.max(Math.abs(x), Math.abs(z)))) * sstep(AGUA - 0.1, AGUA + 0.25, h);
}

/**
 * R7.2 · The terrain's material: smooth Lambert (no flatShading), colour = `nodoSuelo` over the vertex colour. The mask is computed in the
 * vertex stage: lattice vertices only (`vertexIndex` < nv²: the skirt, painted pond and baked Residuos/flora keep their own colours), the same
 * border fade and water line as `mascaraSuelo`, then interpolated (one varying).
 */
function materialSuelo(q: { semilla: number; nivel: Nivel; nRejilla: number; mitad: number; borde: number; radioDetalle?: number }): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial();
  mat.name = "terreno-naturaleza";
  const pl = positionLocal as unknown as V3;
  const enRejilla = select(vertexIndex.lessThan(uint(q.nRejilla)), float(1), float(0)) as unknown as N;
  const fuera = smoothstep(q.mitad - q.borde, q.mitad, max(abs(pl.x), abs(pl.z)));
  const mascara = varying(enRejilla.mul(oneMinus(fuera)).mul(smoothstep(AGUA - 0.1, AGUA + 0.25, pl.y))) as unknown as N;
  let base = attribute("color", "vec3") as unknown as V3;
  if (q.radioDetalle) { // E02: CDLOD-style morph toward the coarse ring by horizontal camera distance (trozos.ts factorRelevo is the CPU twin)
    const pg = positionGeometry as unknown as V3, g = attribute("grueso", "vec4") as unknown as ReturnType<typeof vec3> & { x: N; yzw: V3 };
    const d = length((pg.xz as unknown as V2).sub((cameraPosition as unknown as V3).xz)) as unknown as N;
    const m = smoothstep(RELEVO[0] * q.radioDetalle, RELEVO[1] * q.radioDetalle, d) as unknown as N;
    mat.positionNode = Fn(() => {
      (normalLocal as unknown as { assign: (v: unknown) => void }).assign(normalize(mix(normalLocal as unknown as V3, g.yzw, m)));
      return vec3(pg.x, mix(pg.y, g.x, m), pg.z);
    })() as unknown as V3;
    base = varying(mix(base, attribute("colorGrueso", "vec3") as unknown as V3, m)) as unknown as V3;
  }
  mat.colorNode = nodoSuelo({ base, xz: (positionWorld as unknown as V3).xz as unknown as V2, ny: (normalWorld as unknown as V3).y as unknown as N, mascara, semilla: q.semilla, nivel: q.nivel });
  // R5.1 fill, weighted by the SMOOTH normal (relleno.ts's default is the flat facet's normal, which would bring the facets back in the shade)
  mat.emissiveNode = nodoRelleno(clamp((normalWorld as unknown as V3).y.mul(0.5).add(0.5), 0, 1) as unknown as N);
  return mat;
}
