// P15: which of the things in reach does «E: …» speak about? The one the player LOOKS at.
// Loaded on demand by interactuar.ts (the first time something is within reach), not with the first frame: the start bundle has a cap.
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

/** P15: the ring over the offered thing (metres). A person never gets a ring round the body (it hid them): a small one lies on the floor at
 *  their feet. A thing gets a ring about as big as it is (`tam`, its size when the page knows it; never above 2× the size, never above 0.45 m
 *  radius, 0.2 m when unknown), centred on the middle of its model when the page knows it (`centro`), else half a radius over its place. */
export const RADIO_PERSONA = 0.4, RADIO_MAX = 0.45, RADIO_MIN = 0.05, RADIO_COSA = 0.2;
export const marcaDe = (c: { at?: { x: number; z: number; y?: number }; role?: string }, pies: number, tam?: number, centro?: { x: number; y: number; z: number }): { x: number; y: number; z: number; r: number; suelo?: boolean } | null => {
  if (!c.at) return null;
  const y = c.at.y ?? pies;
  if (c.role === "persona") return { x: c.at.x, y: y + 0.03, z: c.at.z, r: RADIO_PERSONA, suelo: true };
  const r = tam !== undefined && tam > 0 ? Math.min(RADIO_MAX, Math.max(RADIO_MIN, Math.round(tam * 100) / 100)) : RADIO_COSA;
  if (centro) return { x: centro.x, y: centro.y, z: centro.z, r }; // the middle of the model itself (a flat piece whose origin is at one edge is ringed round what it is)
  return { x: c.at.x, y: y + Math.round(r * 50) / 100, z: c.at.z, r };
};

/** The ring in the world for what the page offers: asks the view where the thing's model is and how big (`medida`), places the ring
 *  (`marcaDe`) and tells the view only when it changes (`marcar(null)` once when nothing is offered any more). No ring in VR. */
export const crearMarcador = (view: { medida?(key: string): { x: number; y: number; z: number; r: number } | undefined; marcar?(p: ReturnType<typeof marcaDe>): void; vr?: { active: boolean } }) => {
  let marcado = false;
  return (c: { feature: string; key: string; at?: { x: number; z: number; y?: number }; role?: string } | null, pies: number): void => {
    const md = c ? view.medida?.(`${c.feature}:${c.key}`) : undefined, m = c && !view.vr?.active ? marcaDe(c, pies, md?.r, md) : null; // a person's ring ignores the size (marcaDe)
    if (!m && !marcado) return;
    marcado = !!m;
    view.marcar?.(m);
  };
};
