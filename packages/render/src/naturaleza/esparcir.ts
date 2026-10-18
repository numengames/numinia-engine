// esparcir (naturaleza N4): where the trees go. PURE: no three.js, no DOM, no Math.random, no clock. The same
// (seed, size, plaza, density, tier, palette) gives the same list of trees on every device, on the server and in a test.
//
// METHOD: a jittered grid (one candidate per CELDA × CELDA square, moved by a seeded hash inside its square: «blue-noise
// enough» for trees and far cheaper than Bridson's Poisson disc, and every candidate is a pure function of (seed, cell), so
// the order never matters). The zone under the candidate (terreno.ts `zonaEn`) sets the chance and the species mix; a greedy
// pass in raster order then drops any tree closer than the sum of two species' radii to one already kept (a hash grid makes it
// O(n)). Rules (the brief): forest dense; meadow = sparse clusters (a slow value-noise mask) plus lone trees; shore: a few
// bushes; sand and rock: nothing, except bushes on the edge of the rock; nothing inside the plaza (+ a margin), in the pond,
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
export const RADIO_ESPECIE: Record<Especie, number> = { roble: 2.1, pino: 1.6, abedul: 1.4, arbusto: 0.8 };
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

/** Species mix per zone: cumulative weights over [roble, pino, abedul, arbusto]. */
const MEZCLA: Partial<Record<Zona, [Especie, number][]>> = {
  prado: [["roble", 0.5], ["abedul", 0.3], ["pino", 0.05], ["arbusto", 0.15]],
  bosque: [["pino", 0.44], ["roble", 0.34], ["abedul", 0.12], ["arbusto", 0.1]],
  orilla: [["arbusto", 1]],
  roca: [["arbusto", 1]],
};
const elegir = (mezcla: [Especie, number][], u: number): Especie => {
  let a = 0;
  for (const [e, w] of mezcla) { a += w; if (u < a) return e; }
  return mezcla[mezcla.length - 1][0];
};

/** Share of the trees of a species drawn in their second colour set (autumn orange / yellow / blossom) per palette. */
export const VARIANTE_POR_PALETA: Record<Paleta, Record<Especie, number>> = {
  verano: { roble: 0.07, pino: 0.0, abedul: 0.07, arbusto: 0.1 },
  otono: { roble: 0.82, pino: 0.12, abedul: 0.88, arbusto: 0.08 },
  primavera: { roble: 0.0, pino: 0.0, abedul: 0.0, arbusto: 0.72 },
};

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
    if (zona === "bosque") p = 0.86;
    else if (zona === "prado") {
      const mancha = valor2(s + 303, x * 0.03, z * 0.03);         // slow mask: clumps of trees …
      p = 0.035 + 0.5 * sstep(0.56, 0.74, mancha);                 // … and a thin rain of lone trees between them
    } else if (zona === "orilla") p = 0.09;                        // a few bushes on the wet sand
    else p = bordeDeRoca(f, x, z) ? 0.13 : 0;                       // rock: bushes only along its edge
    if (hash2(s + 103, i, j) >= p * dens) continue;
    const y = f.alturaEn(x, z);
    if (y < -0.05) continue;                                       // water level / basin
    const pend = Math.hypot(f.alturaEn(x + 0.7, z) - y, f.alturaEn(x, z + 0.7) - y) / 0.7;
    if (pend > PENDIENTE_MAX) continue;
    const especie = elegir(mezcla, hash2(s + 104, i, j));
    // size: bigger in the open, smaller in a crowd and on the shore
    const escala = (zona === "orilla" ? 0.75 : 0.82) + 0.42 * hash2(s + 105, i, j);
    const variante: 0 | 1 = hash2(s + 106, i, j) < VARIANTE_POR_PALETA[o.paleta][especie] ? 1 : 0;
    dentro.push({ x, y: Math.round(y * 100) / 100, z, escala: Math.round(escala * 1000) / 1000, giro: Math.round(hash2(s + 107, i, j) * 6283) / 1000, especie, variante });
  }
  // spacing: greedy in raster order against a hash grid of the kept trees
  const lado = 2 * RADIO_ESPECIE.roble * SEPARACION + 0.01, rejilla = new Map<number, PuntoArbol[]>();
  const clave = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
  const hechos: PuntoArbol[] = [];
  for (const t of dentro) {
    const cx = Math.floor(t.x / lado), cz = Math.floor(t.z / lado), ra = RADIO_ESPECIE[t.especie as Especie];
    let libre = true;
    for (let dz = -1; dz <= 1 && libre; dz++) for (let dx = -1; dx <= 1 && libre; dx++) {
      const v = rejilla.get(clave(cx + dx, cz + dz));
      if (!v) continue;
      for (const u of v) { const min = (ra + RADIO_ESPECIE[u.especie as Especie]) * SEPARACION; if ((u.x - t.x) ** 2 + (u.z - t.z) ** 2 < min * min) { libre = false; break; } }
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
