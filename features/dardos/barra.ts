// dardos on a PC: the maths of the power bar's feedback and of the hand sway (pure: no DOM, no three; apps/plaza/dardos.ts
// draws them, test/dardos-barra.test.ts checks them). The SERVER judges the strength (features/dardos/server.ts
// `aterrizaje`, with ZONA_FUERZA[via]); this file only tells the player what that judgement will be, in words.
import { desvioFuerza } from "./feature.ts";

export type Suelta = { etiqueta: "PERFECTO" | "CASI" | "FLOJO ↓" | "FUERTE ↑"; clase: "perfecto" | "casi" | "flojo" | "fuerte"; delta: number };
/** The word for a release at `fuerza` (0-1, as sent: 3 decimals) when the straight window is ±`zona`. In the window = PERFECTO;
 *  up to twice its half-width = CASI; further, on which side (text, not only colour). Same rounding as the server's. Pure. */
export function etiquetaSuelta(fuerza: number, zona: number): Suelta {
  const delta = desvioFuerza(Math.round(fuerza * 1000) / 1000), d = Math.abs(delta);
  if (d <= zona) return { etiqueta: "PERFECTO", clase: "perfecto", delta };
  if (d <= Math.round(zona * 2 * 1e6) / 1e6) return { etiqueta: "CASI", clase: "casi", delta };
  return delta < 0 ? { etiqueta: "FLOJO ↓", clase: "flojo", delta } : { etiqueta: "FUERTE ↑", clase: "fuerte", delta };
}
/** How long the release feedback (ghost mark + word) stays (ms), and the aim ring + landing line on the board. */
export const SUELTA_MS = 900, ATERRIZAJE_MS = 1500;

// ---- the hand sway (board radii) ----
/** Resting amplitude (slow, readable); settles to FIRME in CALMA_S after the press; after DERIVA_DESDE_S held it drifts up to MAX at DERIVA_FIN_S. */
export const VAIVEN_REPOSO = 0.03, VAIVEN_FIRME = 0.012, VAIVEN_MAX = 0.06;
export const CALMA_S = 0.3, DERIVA_DESDE_S = 1.0, DERIVA_FIN_S = 2.2, VUELTA_S = 0.6;
/** The crosshair never moves faster than this (radii/s): a sway you cannot time is not skill (IGN on PDC Darts). */
export const VAIVEN_VEL_MAX = 0.25;
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 2;
/** Sway amplitude after holding the press for `s` seconds: calm → firm until DERIVA_DESDE_S → drifts up to MAX. */
export function amplitudVaiven(s: number): number {
  const calma = VAIVEN_REPOSO + (VAIVEN_FIRME - VAIVEN_REPOSO) * ease(s / CALMA_S);
  if (s <= DERIVA_DESDE_S) return calma;
  return VAIVEN_FIRME + (VAIVEN_MAX - VAIVEN_FIRME) * Math.min(1, (s - DERIVA_DESDE_S) / (DERIVA_FIN_S - DERIVA_DESDE_S));
}
/** After a release the amplitude eases back from `desde` to the resting one in VUELTA_S (the crosshair never jumps). */
export const amplitudTrasSoltar = (desde: number, s: number): number => desde + (VAIVEN_REPOSO - desde) * ease(s / VUELTA_S);

/** Three sway patterns (like Dorts' twelve, one per visit: here one per dart of the visit): angular speeds (rad/s) and phases. Slow: periods ≈ 5 s and 2 s. */
const PATRONES = [
  { fx: [1.26, 3.14], px: [0, 1.1], fy: [1.05, 2.8], py: [0.7, 2.4] },
  { fx: [1.05, 2.6], px: [2.2, 0.3], fy: [1.4, 3.1], py: [4.0, 1.9] },
  { fx: [1.4, 2.9], px: [4.1, 3.5], fy: [0.9, 3.0], py: [1.6, 5.2] },
] as const;
/** The pattern of dart `numero` (1-based; the same dart number always gets the same one). */
export const patronDe = (numero: number): number => ((Math.max(1, Math.floor(numero) || 1) - 1) % PATRONES.length + PATRONES.length) % PATRONES.length;
/** The sway offset at clock `t` (s) with amplitude `amp`, for dart `numero`. Pure. */
export function vaivenDe(t: number, numero: number, amp: number): { x: number; y: number } {
  const P = PATRONES[patronDe(numero)];
  return {
    x: amp * (0.7 * Math.sin(t * P.fx[0] + P.px[0]) + 0.3 * Math.sin(t * P.fx[1] + P.px[1])),
    y: amp * 0.8 * (0.7 * Math.cos(t * P.fy[0] + P.py[0]) + 0.3 * Math.sin(t * P.fy[1] + P.py[1])),
  };
}

// ---- the keyboard ----
/** One key press moves the aim this much (board radii); with Shift, the fine step. */
export const PASO = 0.04, PASO_FINO = 0.01;
/** The aim key: arrows or WASD (by physical key, so Shift's capital letters and other layouts still work). */
export const TECLAS_APUNTAR: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
};
