// P15: which of the things in reach does «E: …» speak about? The one the player LOOKS at.
// Pure (no DOM, no three.js): a list of candidates + where the player stands + where the camera looks → the chosen one.
//
// The rule, in the order it is applied:
//   1. A candidate with a known place whose bearing is within MIRADA_MAX_RAD (40°) of the camera's heading is «in front».
//      Among those: the smallest angle wins; angles within EMPATE_RAD (3°) of the best count as equal and the nearest of
//      them wins (two things on one table that look the same from here: the closer one).
//   2. Nobody in front (looking away, or only things without a known place such as a seat or a file hole): the nearest of
//      all, exactly as before P15. We never take the prompt away from someone who simply aims badly.
//   3. Stickiness: the previous choice stays while it is still a candidate and is no worse than the new one by more than
//      HISTERESIS_RAD (4° of angle; 0.15 m of distance when nobody is in front), so the prompt does not flicker between
//      two things while the camera drifts across the gap.
// The heading is the camera's yaw (packages/render/src/camara-orbita.ts: 0 = along −z, + turns left). Measured on the floor
// plane from the PLAYER, not from the camera: in third person the camera sits behind the avatar, but «what is ahead» is the same.
// VR: the controllers keep their own logic (xr.ts aims with the ray); the head heading is not used there — see EXTENDER.

export const MIRADA_MAX_RAD = (40 * Math.PI) / 180;
export const EMPATE_RAD = (3 * Math.PI) / 180;
export const HISTERESIS_RAD = (4 * Math.PI) / 180;
export const HISTERESIS_M = 0.15;
/** Closer than this the bearing is meaningless (you stand on it): counts as straight ahead. */
export const SOBRE_M = 0.25;

export type Candidato = { feature: string; key: string; distance: number; at?: { x: number; z: number } };
export type Desde = { x: number; z: number; yaw: number };

const dosPi = 2 * Math.PI;
/** Smallest absolute difference between two headings, 0..π. */
export const difAngulo = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % dosPi + dosPi) % dosPi);
  return d > Math.PI ? dosPi - d : d;
};
/** Angle (radians, 0..π) between where the camera looks and the thing; `null` when the thing has no known place. */
export function anguloA(c: Candidato, d: Desde): number | null {
  if (!c.at) return null;
  const dx = c.at.x - d.x, dz = c.at.z - d.z;
  if (Math.hypot(dx, dz) < SOBRE_M) return 0;
  return difAngulo(Math.atan2(-dx, -dz), d.yaw); // yaw 0 = looking along −z, + = to the left (same as rumboHacia)
}
const mismo = (a: Candidato, b: { feature: string; key: string }) => a.feature === b.feature && a.key === b.key;

/** The candidate to offer, or null when the list is empty. `previo` = what was offered a moment ago (stickiness). */
export function elegirMirada<T extends Candidato>(lista: readonly T[], desde: Desde, previo?: { feature: string; key: string } | null): T | null {
  if (lista.length === 0) return null;
  const medidos = lista.map((c) => ({ c, a: anguloA(c, desde) }));
  const delante = medidos.filter((m): m is { c: T; a: number } => m.a !== null && m.a <= MIRADA_MAX_RAD);
  if (delante.length > 0) {
    const mejorA = Math.min(...delante.map((m) => m.a));
    const mejor = delante.filter((m) => m.a <= mejorA + EMPATE_RAD).sort((x, y) => x.c.distance - y.c.distance || x.a - y.a)[0]!;
    const p = previo ? delante.find((m) => mismo(m.c, previo)) : undefined;
    return p && p.a - mejorA <= HISTERESIS_RAD ? p.c : mejor.c;
  }
  const cerca = [...lista].sort((x, y) => x.distance - y.distance)[0]!;
  const p = previo ? lista.find((c) => mismo(c, previo)) : undefined;
  return p && p.distance - cerca.distance <= HISTERESIS_M ? p : cerca;
}
