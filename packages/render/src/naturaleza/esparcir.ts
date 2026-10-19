// esparcir (naturaleza N4): where the trees go. PURE: no three.js, no DOM, no Math.random, no clock. The same
// (seed, size, plaza, density, tier, palette) gives the same list of trees on every device, on the server and in a test.
//
// METHOD: a jittered grid (one candidate per CELDA × CELDA square, moved by a seeded hash inside its square: «blue-noise
// enough» for trees and far cheaper than Bridson's Poisson disc, and every candidate is a pure function of (seed, cell), so
// the order never matters). The zone under the candidate (terreno.ts `zonaEn`) sets the chance and the species mix; a greedy
// pass in raster order then drops any tree closer than the sum of two species' radii to one already kept (a hash grid makes it
// O(n)). Rules (the brief): forest dense; meadow = sparse clusters (a slow value-noise mask) plus lone trees; shore: a few
// bushes on the edge of the rock; R6.3: weeping willows only on the ring of ground around the pond; nothing inside the plaza (+ a margin), in the pond,
// on steep ground or at the very border of the world. Above the tier's cap the list is thinned evenly (by hash), not cut.
//
// COPIED (technique only): jittered / stratified sampling (e.g. Red Blob Games «Making maps with noise», trees placed by
// blue noise over a biome map); the greedy hash-grid spacing check is the inner loop of Bridson's Poisson-disc sampling
// (R. Bridson, SIGGRAPH 2007 sketch). CHANGED: candidates come from a hash of the cell, not from a growing active list, so the
// result does not depend on iteration order; spacing is per species pair. COMBINED: terreno.ts zones/heights, semilla.ts hash.
import { hash2, valor2 } from "./semilla.ts";
import { ARBOLES_MAX_POR_NIVEL } from "./niveles.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "./terreno.ts";
import type { PuntoArbol, Especie } from "./arboles.ts";

export type Paleta = "verano" | "otono" | "primavera";
export const PALETAS: readonly Paleta[] = ["verano", "otono", "primavera"];

/** Side (m) of a candidate square. */
export const CELDA = 2.2;
/** Radius (m) each species keeps free around it: two trees are at least 0.85 × (ra + rb) apart. */
export const RADIO_ESPECIE: Record<Especie, number> = { encina: 2.1, pino: 1.8, cipres: 0.9, olivo: 1.9, arbusto: 0.8, sauce: 2.0 };
/** R6.3: willows grow ONLY by the water: within this many pond radii of the pond's centre (the pond itself ends at 1.25 radii for trees). */
export const SAUCE_AGUA = 2.3;
export const SEPARACION = 0.85;
/** Margin (m) kept free beyond the plaza's flat disc, and at the world's border. */
export const MARGEN_PLAZA = 2.5, MARGEN_BORDE = 7;
/** Steeper ground (rise over run) than this gets no tree. */
export const PENDIENTE_MAX = 1.05;

export type FuenteEsparcir = { alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona };
export type OpcionesEsparcir = {
  semilla: number;
  /** World side (m). */
  tamano: number;
  /** Radius (m) of the plaza (nothing is planted in it nor within MARGEN_PLAZA of it). */
  plaza: number;
  /** 0…1: how many of the candidates that the zone accepts are kept. */
  densidad: number;
  nivel: Nivel;
  paleta: Paleta;
  /** The pond (terreno.ts `estanque`) or null: no tree stands within `radio × 1.25` of it. */
  estanque: { x: number; z: number; radio: number } | null;
};

/** Species mix per zone (R2: Mediterranean garden): weights over the five species. */
const MEZCLA: Partial<Record<Zona, [Especie, number][]>> = {
  prado: [["encina", 0.3], ["olivo", 0.28], ["pino", 0.1], ["cipres", 0.06], ["arbusto", 0.26]],
  bosque: [["pino", 0.3], ["encina", 0.3], ["cipres", 0.12], ["olivo", 0.1], ["arbusto", 0.18]],
  orilla: [["arbusto", 1]],
  roca: [["arbusto", 1]],
};
/** Groves of ONE species: a slow noise picks, per patch of ground, a dominant species; inside a grove most trees are that one. */
const DOMINANTES: Especie[] = ["encina", "pino", "olivo", "encina", "pino", "cipres", "olivo", "encina"];
/** Lone old trees stand alone in the meadow: bigger, and nothing is planted close around them. */
export const VIEJOS: Especie[] = ["encina", "olivo", "pino"];
const elegir = (mezcla: [Especie, number][], u: number): Especie => {
  let a = 0;
  for (const [e, w] of mezcla) { a += w; if (u < a) return e; }
  return mezcla[mezcla.length - 1][0];
};

/** Share of the trees of a species drawn in their second colour set (autumn orange / yellow / blossom) per palette. */
export const VARIANTE_POR_PALETA: Record<Paleta, Record<Especie, number>> = {
  verano: { encina: 0.05, pino: 0.0, cipres: 0.0, olivo: 0.0, arbusto: 0.1, sauce: 0.0 },
  otono: { encina: 0.82, pino: 0.12, cipres: 0.0, olivo: 0.35, arbusto: 0.08, sauce: 0.4 },
  primavera: { encina: 0.0, pino: 0.0, cipres: 0.0, olivo: 0.0, arbusto: 0.72, sauce: 0.0 },
};

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0…1: how much sand lies within ~6 m (four probes, 0.25 each). */
function cercaDeArena(f: FuenteEsparcir, x: number, z: number): number {
  const d = 6;
  return ((f.zonaEn(x + d, z) === "arena" ? 1 : 0) + (f.zonaEn(x - d, z) === "arena" ? 1 : 0) + (f.zonaEn(x, z + d) === "arena" ? 1 : 0) + (f.zonaEn(x, z - d) === "arena" ? 1 : 0)) / 4;
}

/** True when the point is next to ground of another zone than `roca` (the edge of the rock: where bushes may grow). */
function bordeDeRoca(f: FuenteEsparcir, x: number, z: number): boolean {
  const d = 2.6;
  return f.zonaEn(x + d, z) !== "roca" || f.zonaEn(x - d, z) !== "roca" || f.zonaEn(x, z + d) !== "roca" || f.zonaEn(x, z - d) !== "roca";
}

/** The trees of the world, in raster order. Pure. */
export function esparcirArboles(f: FuenteEsparcir, o: OpcionesEsparcir): PuntoArbol[] {
  const s = o.semilla | 0, mitad = o.tamano / 2, dens = Math.min(1, Math.max(0, o.densidad));
  if (dens <= 0) return [];
  const n = Math.floor((o.tamano - 2 * MARGEN_BORDE) / CELDA), x0 = -n * CELDA / 2;
  const dentro: PuntoArbol[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = Math.round((x0 + (i + hash2(s + 101, i, j)) * CELDA) * 100) / 100, z = Math.round((x0 + (j + hash2(s + 102, i, j)) * CELDA) * 100) / 100; // centimetres: the height below is read at the stored point
    if (Math.abs(x) > mitad - MARGEN_BORDE || Math.abs(z) > mitad - MARGEN_BORDE) continue;
    if (Math.hypot(x, z) < o.plaza + MARGEN_PLAZA) continue;
    const e = o.estanque;
    if (e && Math.hypot(x - e.x, z - e.z) < e.radio * 1.25) continue;
    const zona = f.zonaEn(x, z), mezcla = MEZCLA[zona];
    if (!mezcla) continue;                                         // sand: nothing
    // chance by zone
    let p: number;
    const claro = sstep(0.3, 0.42, valor2(s + 401, x * 0.045, z * 0.045)); // R2: clearings (a slow mask is low → no trees)
    if (zona === "bosque") p = 0.86 * (0.25 + 0.75 * claro);
    else if (zona === "prado") {
      const mancha = valor2(s + 303, x * 0.03, z * 0.03);         // slow mask: clumps of trees …
      p = (0.03 + 0.5 * sstep(0.56, 0.74, mancha)) * claro;        // … and a thin rain of lone trees between them
    } else if (zona === "orilla") p = 0.09;                        // a few bushes on the wet sand
    else p = bordeDeRoca(f, x, z) ? 0.13 : 0;                       // rock: bushes only along its edge
    // R6.3: by the pond the chance rises (willows), most on the first ring of ground past the water
    const agua = e ? sstep(SAUCE_AGUA, 1.5, Math.hypot(x - e.x, z - e.z) / e.radio) : 0;
    if (agua > 0 && zona === "orilla") p = Math.max(p, 0.2 * agua); // the shore: a few more trees (willows) by the water; meadow and forest keep their density
    if (zona === "prado" || zona === "bosque") p *= 1 - 0.8 * cercaDeArena(f, x, z); // R2: thinning toward the sand (up to −80 %)
    // R2: a lone old tree: rare, in the open meadow, in the middle of a clearing-ish spot
    const viejo = zona === "prado" && hash2(s + 109, i, j) < 0.003 * dens && sstep(0.3, 0.5, valor2(s + 401, x * 0.045, z * 0.045)) > 0.5;
    if (!viejo && hash2(s + 103, i, j) >= p * dens) continue;
    const y = f.alturaEn(x, z);
    if (y < -0.05) continue;                                       // water level / basin
    const pend = Math.hypot(f.alturaEn(x + 0.7, z) - y, f.alturaEn(x, z + 0.7) - y) / 0.7;
    if (pend > PENDIENTE_MAX) continue;
    // R2: groves of one species (a dominant species per patch of ground) over the zone's mix
    const dom = DOMINANTES[Math.floor(valor2(s + 502, x * 0.017 + 3, z * 0.017) * DOMINANTES.length * 0.999)];
    const fuerza = sstep(0.62, 0.78, valor2(s + 503, x * 0.02 + 7, z * 0.02));
    let especie = zona === "prado" || zona === "bosque" ? (hash2(s + 110, i, j) < fuerza * 0.7 ? dom : elegir(mezcla, hash2(s + 104, i, j))) : elegir(mezcla, hash2(s + 104, i, j));
    if (viejo) especie = VIEJOS[Math.floor(hash2(s + 111, i, j) * VIEJOS.length * 0.999)];
    else if (agua > 0 && zona !== "roca" && hash2(s + 112, i, j) < 0.85 * agua) especie = "sauce"; // R6.3: the willows of the Virelai, only here
    // size: bigger in the open, smaller in a crowd and on the shore; old trees are big; cypresses vary little, shrubs are small
    let escala = (zona === "orilla" ? 0.75 : 0.82) + 0.42 * hash2(s + 105, i, j);
    if (viejo) escala = 1.45 + 0.35 * hash2(s + 105, i, j);
    else if (especie === "cipres") escala = 0.9 + 0.35 * hash2(s + 105, i, j);
    else if (especie === "sauce") escala = 0.85 + 0.35 * hash2(s + 105, i, j);
    const variante: 0 | 1 = hash2(s + 106, i, j) < VARIANTE_POR_PALETA[o.paleta][especie] ? 1 : 0;
    dentro.push({ x, y: Math.round(y * 100) / 100, z, escala: Math.round(escala * 1000) / 1000, giro: Math.round(hash2(s + 107, i, j) * 6283) / 1000, especie, variante });
  }
  // spacing: greedy in raster order against a hash grid of the kept trees
  const lado = 2 * RADIO_ESPECIE.encina * 1.9 * SEPARACION + 0.01, rejilla = new Map<number, PuntoArbol[]>();
  const clave = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
  const hechos: PuntoArbol[] = [];
  for (const t of dentro) {
    const cx = Math.floor(t.x / lado), cz = Math.floor(t.z / lado), ra = RADIO_ESPECIE[t.especie as Especie] * Math.max(1, t.escala * 0.95);
    let libre = true;
    for (let dz = -1; dz <= 1 && libre; dz++) for (let dx = -1; dx <= 1 && libre; dx++) {
      const v = rejilla.get(clave(cx + dx, cz + dz));
      if (!v) continue;
      for (const u of v) { const min = (ra + RADIO_ESPECIE[u.especie as Especie] * Math.max(1, u.escala * 0.95)) * SEPARACION; if ((u.x - t.x) ** 2 + (u.z - t.z) ** 2 < min * min) { libre = false; break; } }
    }
    if (!libre) continue;
    const k = clave(cx, cz);
    (rejilla.get(k) ?? rejilla.set(k, []).get(k)!).push(t); hechos.push(t);
  }
  // the tier's cap: thin evenly by hash (never cut a side of the world off)
  const tope = ARBOLES_MAX_POR_NIVEL[o.nivel];
  if (hechos.length <= tope) return hechos;
  const umbral = tope / hechos.length;
  const fino = hechos.filter((t, k) => hash2(s + 108, k, 7) < umbral);
  return fino.length > tope ? fino.slice(0, tope) : fino;
}
