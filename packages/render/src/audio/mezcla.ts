// V6 · la mezcla en funciones puras: lo que se puede comprobar sin navegador.
//
//  - `ladoDe`: de qué lado del oyente cae una fuente (−1 izquierda … +1 derecha), con la cabeza (la pose del visor
//    en VR, la cámara fuera de VR) tal como la deja `oyente.ts`. Es la regla que cumple el `PannerNode`; está aquí
//    para poder decir en una prueba «un sonido a la derecha suena a la derecha» y que gire con la cabeza.
//  - `gananciasEstereo`: lo que sale por cada oído, con y sin modo mono (para quien oye por un solo oído).
//  - `intervaloBaliza`: cada cuánto suena la baliza simple según lo lejos que está el destino.
//  - `busDeGrupo`: H5, los grupos «música» y «efectos» de un sonido del mundo → bus del mezclador.
import type { Bus } from "./nucleo.ts";

type Punto = { x: number; y: number; z: number };
/** La pose del oyente tal como la escribe `oyente.ts` (posición, hacia dónde mira, hacia dónde es «arriba»). */
export type PoseOido = { x: number; y: number; z: number; fx: number; fy: number; fz: number; ux: number; uy: number; uz: number };

/**
 * Lado de `f` visto desde `o`: el coseno del ángulo entre el vector a la fuente y el «oído derecho» del oyente
 * (adelante × arriba, como en Web Audio). −1 = pegado al oído izquierdo, 0 = delante, detrás o encima, +1 = derecho.
 * En el mismo sitio que el oyente no hay lado: 0.
 */
export function ladoDe(o: PoseOido, f: Punto): number {
  const rx = o.fy * o.uz - o.fz * o.uy, ry = o.fz * o.ux - o.fx * o.uz, rz = o.fx * o.uy - o.fy * o.ux;
  const rl = Math.hypot(rx, ry, rz);
  const dx = f.x - o.x, dy = f.y - o.y, dz = f.z - o.z, dl = Math.hypot(dx, dy, dz);
  if (!(rl > 1e-9) || !(dl > 1e-9)) return 0;
  return Math.max(-1, Math.min(1, (rx * dx + ry * dy + rz * dz) / (rl * dl)));
}

/**
 * Ganancia de cada oído para un lado dado (−1…1), con el reparto de potencia constante del panner `equalpower`
 * (izq² + der² = 1). En modo mono los dos oídos reciben lo mismo (√½ cada uno): da igual de qué lado esté.
 */
export function gananciasEstereo(lado: number, mono: boolean): { izq: number; der: number } {
  if (mono) return { izq: Math.SQRT1_2, der: Math.SQRT1_2 };
  const l = Number.isFinite(lado) ? Math.max(-1, Math.min(1, lado)) : 0;
  const a = ((l + 1) * Math.PI) / 4;                      // 0 = todo a la izquierda, π/2 = todo a la derecha
  return { izq: Math.cos(a), der: Math.sin(a) };
}

/** La baliza simple: un sonido fijo en el destino que se repite. Más cerca, más seguido (como una baliza de verdad). */
export const BALIZA_MAX_S = 2.4;
export const BALIZA_MIN_S = 0.5;
/** Hasta qué distancia (m) sigue aflojando el ritmo; más lejos va siempre a `BALIZA_MAX_S`. */
export const BALIZA_LEJOS_M = 40;
export function intervaloBaliza(distancia: number): number {
  const d = Number.isFinite(distancia) ? Math.max(0, distancia) : BALIZA_LEJOS_M;
  const t = Math.min(1, d / BALIZA_LEJOS_M);
  return BALIZA_MIN_S + (BALIZA_MAX_S - BALIZA_MIN_S) * t;
}

/** H5 · los grupos de un sonido del mundo. «musica» y «efectos» son los dos que ofrece el nodo `Audio` de Hyperfy 2;
 *  «ambiente» es el colchón (bucle largo). Lo que no se conoce cae en `null` y el que llama decide el defecto. */
export const GRUPOS_SONIDO = ["musica", "efectos", "ambiente"] as const;
export type GrupoSonido = (typeof GRUPOS_SONIDO)[number];
export const esGrupoSonido = (g: unknown): g is GrupoSonido => typeof g === "string" && (GRUPOS_SONIDO as readonly string[]).includes(g);
export const busDeGrupo = (g: unknown): Bus | null => (esGrupoSonido(g) ? g : null);
