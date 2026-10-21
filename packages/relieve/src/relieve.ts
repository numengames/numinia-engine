// relieve (naturaleza N1, moved here by N5): the PURE terrain function of a world — `alturaEn(semilla, x, z)`, `zonaEn`, `estanqueDe`.
// No three.js, no DOM, no clock: the page draws it (render/naturaleza/terreno.ts) and, since N5, the sim builds the collision mesh
// from the very same numbers (sim/terreno-malla.ts): ONE source of truth for the hills. Copied/changed notes: see terreno.ts' header.
// COPIED: the seeded hills, the pond and the five soft zones, unchanged when `op.base` is absent.
// CHANGED (B1, «la base manda sobre las alturas»): `OpcionesRelieve.base` (the espacio base's seed). When it comes, the height at every point is
// `alturaBase(base, x, z)` (espacio-base.ts) — the base mesh is THE ground — and the pond is not carved (as `sinEstanque`; no orilla, no arena).
// The zones (meadow, forest, rock) stay the nature's own field: they are paint over that relief, not another ground.
import { fbm, cresta2, valor2, simplex2, hash2 } from "./semilla.ts";
import { alturaBase } from "./espacio-base.ts";

export type Zona = "prado" | "bosque" | "arena" | "roca" | "orilla";
export const ZONAS: readonly Zona[] = ["prado", "bosque", "arena", "roca", "orilla"];

/** The house palette for the ground (sRGB hex). Meadow warm light green fading to a deeper forest green, sand, violet-grey rock. */
export const PALETA_TERRENO: Record<Zona, number> = { prado: 0x9bc25a, bosque: 0x4f8a3c, arena: 0xe6d3a1, roca: 0x8a8594, orilla: 0xb8a878 };

export type OpcionesRelieve = {
  /** World side in metres the pond is placed against (default 200). */
  tamano?: number;
  /** Radius (m) of the almost flat disc around the origin, the spawn (default 12). */
  plaza?: number;
  /** N4: no pond at all (no basin, no sand belt): a world that says `estanque: false`. */
  sinEstanque?: boolean;
  /** B1: seed of the espacio base. Present = the height is `alturaBase(base, x, z)` (the base governs), no pond is carved; zones are still painted. */
  base?: number | string;
};
const TAMANO = 200, PLAZA = 12, AGUA = -0.2;
/** Height (m) of the pond's water surface; the basin is carved below it. */
export const NIVEL_AGUA = AGUA;

export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Smooth maximum (Quilez polynomial): lifts `a` to at least about `b` without a kink. */
const maxSuave = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

/** Where the pond is for a seed: centre (m) and radius (m). Pure. */
export function estanqueDe(semilla: number, tamano = TAMANO): { x: number; z: number; radio: number } {
  const ang = hash2(semilla, 7001, 3) * Math.PI * 2, d = tamano * (0.26 + hash2(semilla, 7002, 3) * 0.08);
  return { x: Math.cos(ang) * d, z: Math.sin(ang) * d, radio: tamano * (0.075 + hash2(semilla, 7003, 3) * 0.025) };
}

const W = [0, 0, 0, 0, 0]; // scratch for zone weights (order of ZONAS)

/** Height and soft zone weights at a point. Weights sum to 1 and follow the order of ZONAS. */
export function campo(semilla: number, x: number, z: number, op?: OpcionesRelieve, conPesos = true): { h: number; w: number[]; valle: number } {
  const tam = op?.tamano ?? TAMANO, plaza = op?.plaza ?? PLAZA;
  const conBase = op?.base !== undefined;
  if (conBase && !conPesos) return { h: alturaBase(op!.base!, x, z), w: W, valle: 0 }; // B1: the base mesh is the ground, nothing else to compute
  const r = Math.hypot(x, z);
  // rolling hills: low simplex fbm, lifted so the world sits above the pond water
  const colinas = fbm(semilla, x * 0.016, z * 0.016, 4) * 7.5 + 2.2;
  // rocky ridges: a ridged field, only where a slow mask says «mountain»
  const wpRoca = sstep(plaza * 1.5, plaza * 3.5, r);
  const mascara = sstep(0.5, 0.74, valor2(semilla + 77, x * 0.0085 + 3.1, z * 0.0085 - 1.7));
  const cr = cresta2(semilla + 5, x * 0.028, z * 0.028, 3);
  const cima = mascara * Math.pow(cr, 2.2) * 24;
  let h = maxSuave(colinas, 0.5, 1.2) + cima + fbm(semilla + 9, x * 0.09, z * 0.09, 2) * 0.35;
  // the plaza stays flat at 0 and the world rises gently around it
  const wp = sstep(plaza, plaza * 3.2, r);
  h *= wp * (1 - 0.85 * sstep(tam * 0.34, tam * 0.5, Math.max(Math.abs(x), Math.abs(z)))); // the border settles low: a calm edge under the fog
  // pond basin with a gentle approach
  const e = estanqueDe(semilla, tam);
  const dpr = op?.sinEstanque || conBase ? 99 : Math.hypot(x - e.x, z - e.z) / e.radio + simplex2(semilla + 31, x * 0.07, z * 0.07) * 0.1;
  // the bank: a bowl under the water, then a gentle slope rising with the distance; the land never stands above it (smooth min)
  const banco = AGUA - 1.45 + 1.4 * sstep(0, 1.05, dpr) + Math.max(0, dpr - 1.05) * 1.3;
  if (!op?.sinEstanque && !conBase) h = -maxSuave(-h, -banco, 1.0);
  if (conBase) h = alturaBase(op!.base!, x, z); // B1: zones below read the nature's field; the height is the base's
  if (!conPesos) return { h, w: W, valle: 0 };
  // ---- zones (soft weights, priority: orilla > arena > roca > bosque > prado) ----
  const rocoso = sstep(0.6, 2.2, cima * wpRoca);
  const bosq = sstep(0.12, 0.34, fbm(semilla + 211, x * 0.014 + 40, z * 0.014 - 25, 3)) * sstep(plaza * 1.4, plaza * 3.5, r);
  const wo = 1 - sstep(1.12, 1.4, dpr);
  const wa = (1 - sstep(1.5, 1.95, dpr)) * (1 - wo);
  const wr = rocoso * (1 - wo - wa);
  const wb = bosq * (1 - wo - wa - wr);
  const wprado = 1 - wo - wa - wr - wb;
  W[0] = wprado; W[1] = wb; W[2] = wa; W[3] = wr; W[4] = wo;
  return { h, w: W, valle: 1 - sstep(-1.3, 0.9, h) };
}

/** Terrain height (m) at a world point. Pure and deterministic; ≈ −1.6 … +12. Within the plaza radius it is 0. */
export function alturaEn(semilla: number, x: number, z: number, op?: OpcionesRelieve): number {
  return campo(semilla, x, z, op, false).h;
}

/** The zone at a world point (the heaviest of the soft weights). Pure and deterministic. */
export function zonaEn(semilla: number, x: number, z: number, op?: OpcionesRelieve): Zona {
  const w = campo(semilla, x, z, op).w;
  let k = 0;
  for (let i = 1; i < 5; i++) if (w[i] > w[k]) k = i;
  return ZONAS[k];
}

