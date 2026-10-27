// rayo-politica (MIS-229, t_2bb3461e): the rules of the beacon's «special» look, pure (no three.js, no DOM) so a test can read them.
// The beam of a beacon (`view.beacon`: a mission's «sigue la luz», «Ir» to someone) keeps its column, and gains: motes of light rising
// along it, a soft pulse climbing it, a ground ring that breathes, and a swell when you arrive or when a mission completes.
// Cost: the column and the ring are ONE mesh (merged geometry, one shader) = the draw call the beam always had; the motes are ONE
// instanced sprite = the single extra call per beacon. No texture. Tier D keeps the plain column of before (nothing animated);
// «Menos movimiento» freezes it on one still pose and never swells.
import type { Nivel } from "./calidad.ts";

/** Motes rising along one beam by tier (A desktop, B Quest in XR, C mid phone, D old phone: none, and the plain column). */
export const MOTAS: Record<Nivel, number> = { A: 28, B: 14, C: 10, D: 0 };
/** Tier D draws the column as it was: no ring, no motes, no pulse. */
export const rayoEspecial = (nivel: Nivel): boolean => nivel !== "D";

/** Height the motes climb before they melt away (m), the column's own height (m) and the ground ring's radius (m). */
export const MOTA_ALTO_M = 16, COLUMNA_ALTO_M = 40, ANILLO_M = 2.4;
/** The swell: how long it lasts (s). */
export const DESTELLO_S = 1.6;
/** Closer than this the beam counts as «you arrived» (swell once); it re-arms only after you walk past REARMA_M. */
export const LLEGADA_M = 4, REARMA_M = 9;
/** From here (m) the ring starts to brighten, reaching its fullest at LLEGADA_M. */
export const CERCA_DESDE_M = 16;

const suave = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0 far … 1 at the foot of the beam: how «present» it is for the one who walks (drives the ring and the motes' brightness). */
export const cerca = (distM: number): number => (Number.isFinite(distM) ? 1 - suave(LLEGADA_M, CERCA_DESDE_M, distM) : 0);

/** The swell's curve over its life (0 → 1 → 0, smooth, no hard edge: a gentle bloom, never a strobe). `t` in seconds since it began. */
export function destello(t: number): number {
  if (!(t >= 0) || t >= DESTELLO_S) return 0;
  const x = t / DESTELLO_S;
  return x < 0.25 ? suave(0, 0.25, x) : 1 - suave(0.25, 1, x);
}

/** One beam's memory of the walker: has it greeted them (swelled) and is it armed. `paso` returns true on the frame the swell should begin. */
export type Saludo = { saludado: boolean };
export function paso(s: Saludo, distM: number): boolean {
  if (!s.saludado && distM <= LLEGADA_M) { s.saludado = true; return true; }
  if (s.saludado && distM >= REARMA_M) s.saludado = false;
  return false;
}

/** The clock the shader reads (s, wrapped so a long session keeps its precision). Frozen (0) with «menos movimiento». */
export const relojRayo = (ms: number, quieto: boolean): number => (quieto ? 0 : (ms / 1000) % 3600);
