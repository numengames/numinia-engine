// carteles (U22): the arithmetic of name plates and speech bubbles, pure (no three.js, no DOM) so it is tested on its
// own. Two rules: (1) WHO gets a name over the head: the one you look at, whoever speaks, and everybody while «todos»
// is held (Alt, a touch button, a gamepad button); (2) HOW BIG: a plate never takes more than an angle of your view,
// on a screen and in a headset alike (8° tall for a name, 30° wide for a bubble), so a plate seen from a metre away
// is no longer bigger than the person.

export const NOMBRE_GRADOS_MAX = 8;     // a name's plate, its name line: at most this tall in your view
export const DIALOGO_GRADOS_MAX = 30;   // a bubble: at most this wide in your view
export const MIRADA_GRADOS = 7;         // «you look at it»: the view's centre passes this close to the person (angle)
export const MIRADA_SOSTEN_GRADOS = 11; // the one already looked at stays until you leave this wider cone (no flicker)
const MARCA_FIJA = true;               // Pablo 2026-10-18: a «!» keeps its plate on (quest marks always visible)
const DIST_MIN_M = 0.3;                 // closer than this counts as this (a plate is never asked to shrink to nothing)

const rad = (g: number) => (g * Math.PI) / 180;

/** The widest a plate of real size `tamanoM` may be drawn at distance `distM` so it takes at most `maxGrados` of view. */
export const tamanoMaxM = (distM: number, maxGrados: number): number => 2 * Math.max(DIST_MIN_M, distM) * Math.tan(rad(maxGrados) / 2);

/** The scale to draw a plate of real size `tamanoM` at, starting from the one it would have (`natural`, e.g. the
 * far-growth ×1..×3): never more than what `maxGrados` allows at `distM`. */
export function escalaAcotada(natural: number, tamanoM: number, distM: number, maxGrados: number): number {
  return Math.min(natural, tamanoMaxM(distM, maxGrados) / tamanoM);
}

/** Visual angle (degrees) that a plate of `tamanoM` takes at `distM` once drawn at `escala` (for checks). */
export const grados = (tamanoM: number, escala: number, distM: number): number => (2 * Math.atan((tamanoM * escala) / (2 * Math.max(DIST_MIN_M, distM))) * 180) / Math.PI;

export type V3 = { x: number; y: number; z: number };
/** Something that may be looked at: a vertical segment (feet to head) standing at x, z. */
export type Mirable<K> = { clave: K; x: number; z: number; pies: number; cabeza: number };

/** Angle (degrees) between the view's `ojo` + unit `adelante` and the nearest point of a vertical segment. Behind you = 180. */
export function anguloAlSegmento(ojo: V3, adelante: V3, m: { x: number; z: number; pies: number; cabeza: number }): number {
  let mejor = 180;
  for (let i = 0; i <= 6; i++) {
    const y = m.pies + ((m.cabeza - m.pies) * i) / 6, dx = m.x - ojo.x, dy = y - ojo.y, dz = m.z - ojo.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return 0;
    const c = (dx * adelante.x + dy * adelante.y + dz * adelante.z) / d;
    mejor = Math.min(mejor, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return mejor;
}

/** Which one is looked at: the nearest to the view's centre within `MIRADA_GRADOS` (the one in `previo` keeps it up to
 * `MIRADA_SOSTEN_GRADOS`), only among those within `maxM` metres. null = none. */
export function elegirMirado<K>(ojo: V3, adelante: V3, cand: readonly Mirable<K>[], previo: K | null, maxM: number): K | null {
  let mejor: K | null = null, mejorA = Infinity, aPrevio = Infinity;
  for (const m of cand) {
    if (Math.hypot(m.x - ojo.x, m.z - ojo.z) > maxM) continue;
    const a = anguloAlSegmento(ojo, adelante, m);
    if (m.clave === previo) aPrevio = a;
    if (a < mejorA) { mejorA = a; mejor = m.clave; }
  }
  if (previo !== null && aPrevio <= MIRADA_SOSTEN_GRADOS && !(mejor !== previo && mejorA < MIRADA_GRADOS)) return previo;
  return mejorA <= MIRADA_GRADOS ? mejor : null;
}

/** Does this name show? `todos` (Alt held), the one looked at, or whoever speaks. `marca` is accepted for a later decision (a quest mark that keeps its plate on) and is off today. */
export const nombreVisible = (o: { todos: boolean; mirado: boolean; habla: boolean; marca?: boolean }): boolean => o.todos || o.mirado || o.habla || (MARCA_FIJA && !!o.marca);
