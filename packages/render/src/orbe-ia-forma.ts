// orbe-ia-forma (t_466efdb8): the «thinking» orb over an AI that was called and has not answered. Pure (no three.js, no DOM) so a test can
// count what is drawn. The orb is a dotted sphere (Fibonacci points, projected flat: size by depth, the far ones dimmer) painted ONCE into a
// small texture; every orb on screen is one instance of ONE quad, so the draw cost is one call for all of them. It turns in the plane of the
// screen and breathes; with «menos movimiento» it stands still (it still says «thinking»). Copied idea: Thinking Orbs (MIT, dotted canvas
// spheres for AI loading states, note 54), redone for the engine: no library, no per-orb texture, no shader of our own.
import type { Nivel } from "./calidad.ts";

/** Dots on the sphere and the texture's side in pixels. */
export const ORBE_PUNTOS = 72, ORBE_TEXTURA_PX = 96;
/** Size over the plate (which already leaves a gap) in metres (at 1×), how far it is drawn, and the growth with distance so it still reads across a room. */
export const ORBE_DIAMETRO_M = 0.34, ORBE_VISTO_HASTA_M = 18, ORBE_SOBRE_ROTULO_M = 0.05;
/** How many orbs are drawn at once (the nearest win): the instance buffer is sized for the PC figure. */
export const ORBES_PC = 8, ORBES_MOVIL = 3;
export const orbesMax = (movil: boolean): number => (movil ? ORBES_MOVIL : ORBES_PC);
/** Tier D (old phones, Chromebooks) draws none: the chat line still says who is thinking. */
export const orbeDibuja = (nivel: Nivel): boolean => nivel !== "D";
export const escalaOrbe = (distM: number): number => Math.min(2.5, Math.max(1, distM / 5));

export type PuntoOrbe = { x: number; y: number; z: number };
/** `n` points spread evenly over a unit sphere (golden-angle spiral). */
export function puntosOrbe(n = ORBE_PUNTOS): PuntoOrbe[] {
  const out: PuntoOrbe[] = [], oro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * oro; out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r }); }
  return out;
}

/** What one frame of the animation looks like: the turn in the screen's plane (radians) and the breathing scale. Still when `quieto`. */
export function fotogramaOrbe(ms: number, quieto: boolean, fase = 0): { giro: number; escala: number } {
  if (quieto) return { giro: 0, escala: 1 };
  const s = ms / 1000;
  return { giro: -s * 1.6 + fase, escala: 1 + 0.08 * Math.sin(s * 3.1 + fase) };
}

/** The dots as the texture draws them, front to back: centre and radius in 0..1 of the texture's side, and the brightness 0..1 (the far side is dim). */
export function puntosPintados(n = ORBE_PUNTOS): { x: number; y: number; r: number; luz: number }[] {
  return puntosOrbe(n).map((p) => { const t = (p.z + 1) / 2; return { x: 0.5 + p.x * 0.36, y: 0.5 - p.y * 0.36, r: 0.014 + 0.026 * t, luz: 0.25 + 0.75 * t, z: p.z }; })
    .sort((a, b) => a.z - b.z).map(({ x, y, r, luz }) => ({ x, y, r, luz }));
}
