// teletransporte-politica (N16): the timing and the masks of the light that takes you and leaves you, as plain
// numbers (no three.js) so the tests see exactly what the shader draws. Three looks (variante), the same for every
// watcher (the server picks it): 0 collapses to the chest from head and feet, 1 a beam lifts you from the feet up,
// 2 digital blocks that go out almost at random. Design: mmo-browser-study/RELOJ-CRISTAL-TELETRANSPORTE.md §5.
import type { Nivel } from "./calidad.ts";

/** How long the light lasts (s): neither a blink nor an opera (1.3–1.5 s in the design). */
export const DURACION_S = 1.4;
/** When the body is no longer there (leaving) / is there already (arriving), as a fraction of the light. */
export const CORTE_SALE = 0.55, CORTE_LLEGA = 0.45;
/** The blocks of variant 2 (around × up). */
export const BLOQUES: readonly [number, number] = [8, 14];
/** Lights at once, by tier (each one 2–3 draw calls for 1.4 s); D draws none: the person just goes and comes. */
export const LUCES_MAX: Record<Nivel, number> = { A: 6, B: 3, C: 3, D: 0 };
/** Sparks per light, by tier (one instanced draw call). */
export const CHISPAS: Record<Nivel, number> = { A: 24, B: 10, C: 12, D: 0 };
/** House colours (turquoise / sea green): the palette never changes per look. */
export const TURQUESA = 0x018ea1, VERDEMAR = 0xa6dad5;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const suave = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** How far the dissolve is at fraction `t` of the light: 0 = whole body, 1 = gone. Leaving goes 0→1, arriving 1→0. */
export function umbral(t: number, tipo: "sale" | "llega"): number {
  const s = suave(0.1, 0.85, clamp01(t));
  return tipo === "sale" ? s : 1 - s;
}
/** How bright the light is at fraction `t` (rises fast, holds, fades): the shell's and the sparks' alpha. */
export const brillo = (t: number): number => suave(0, 0.18, t) * (1 - suave(0.7, 1, t));

/** Whether a point of the shell (u around 0..1, v up 0..1) still glows: the mask of each look (the shader's formula). */
export function visible(variante: number, u: number, v: number, s: number, azar: (i: number, j: number) => number = hashBloque): boolean {
  if (variante === 0) return Math.abs(v - 0.5) < 0.5 * (1 - s);           // collapses to the middle
  if (variante === 1) return v > s;                                          // eaten from the feet up
  const i = Math.floor(u * BLOQUES[0]), j = Math.floor(v * BLOQUES[1]);
  return azar(i, j) > s;                                                     // blocks, each its own moment
}
/** A block's moment (0..1), the same in JS and in the shader's spirit (any good hash: only the tests compare). */
export function hashBloque(i: number, j: number): number {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Whether the person's body is drawn at fraction `t` of their light (leaving: until CORTE_SALE; arriving: from CORTE_LLEGA). */
export const cuerpoVisible = (t: number, tipo: "sale" | "llega"): boolean => (tipo === "sale" ? t < CORTE_SALE : t >= CORTE_LLEGA);

/** The body is hidden from the cut of its leaving light until the cut of its arriving one (or this long at most, s). */
export const OCULTO_MAX_S = 3;

/** The variant as the wire says it, kept in 0..2 (an unknown number = the first look). */
export const varianteDe = (v: unknown): 0 | 1 | 2 => { const n = Number(v); return n === 1 || n === 2 ? n : 0; };
