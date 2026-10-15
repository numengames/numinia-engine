// avatares-politica (J1): the decisions behind VRM avatars, pure (no three.js, no DOM) so tests can run them.
// Who wears a VRM (the nearest, a cap per device class), which file each player gets, which clip plays for a
// speed, and the smoothed facing/speed read from position deltas. avatares.ts applies them to the scene.

/** VRM avatars drawn at once, by device class (docs/BACKLOG.md J1, mmo-browser-study/LIMITES.md §3). */
export const CUPO_VRM = { escritorio: 60, visor: 25, movil: 12 } as const;
/** Farther than this from you, an avatar's animation stands still (cold phones), like H1's things. */
export const ANIMAR_HASTA_M = 40;
/** A VRM file with more triangles than this is refused (the player stays a capsule). */
export const TRIANGULOS_MAX = 10_000;
/** Speed thresholds (m/s, horizontal): below QUIETO idle, above CORRER run, walk in between. */
export const QUIETO_MS = 0.3, CORRER_MS = 5;
/** Above the ground by more than this (m): in the air. */
export const EN_EL_AIRE_M = 0.15;
/** Crossfade between clips (s). */
export const FUNDIDO_S = 0.2;

export type Estado = "quieto" | "andar" | "correr" | "saltar";
export type Clip = "quieto" | "andar" | "trotar" | "correr" | "saltar";

export function cupoVRM(c: { mobile: boolean; xr: boolean }): number {
  return c.xr ? CUPO_VRM.visor : c.mobile ? CUPO_VRM.movil : CUPO_VRM.escritorio;
}

/** Which of the `n` house avatars a player gets: fixed by its entity id until players can choose (row H10). */
export function elegirAvatar(id: number, n: number): number {
  if (n <= 0) return -1;
  return ((id % n) + n) % n;
}

export function estadoPor(velocidad: number, altura: number): Estado {
  if (altura > EN_EL_AIRE_M) return "saltar";
  if (velocidad < QUIETO_MS) return "quieto";
  return velocidad > CORRER_MS ? "correr" : "andar";
}

/**
 * The clip for a state, and how fast it plays. `natural` = each clip's ground speed in hips heights per second
 * (measured by tools/vrma/convertir.mjs), `cadera` = the avatar's hips height (m). Walking picks the walk or the
 * jog cycle, whichever stride is closer to the speed (a short avatar jogs where a tall one walks); a clip that is
 * missing falls back to the nearest one there is.
 */
export function clipPara(estado: Estado, velocidad: number, cadera: number, natural: Partial<Record<Clip, number>>, hay: (c: Clip) => boolean): { clip: Clip; ritmo: number } | null {
  const orden: Clip[] = estado === "quieto" ? ["quieto"] : estado === "saltar" ? ["saltar", "quieto"]
    : estado === "correr" ? ["correr", "trotar", "andar", "quieto"] : elegirPaso(velocidad / Math.max(0.1, cadera), natural);
  const clip = orden.find(hay);
  if (!clip) return null;
  const n = natural[clip] ?? 0;
  const ritmo = n > 0 && clip !== "quieto" && clip !== "saltar" ? Math.min(2, Math.max(0.5, velocidad / (n * Math.max(0.1, cadera)))) : 1;
  return { clip, ritmo };
}
function elegirPaso(relativa: number, natural: Partial<Record<Clip, number>>): Clip[] {
  const a = natural.andar ?? 0.8, t = natural.trotar ?? 5.2;
  return relativa < Math.sqrt(a * t) ? ["andar", "trotar", "quieto"] : ["trotar", "andar", "quieto"];
}

/**
 * Who wears a VRM: you (when `yo` is set) and the nearest others, `cupo` in total. Whoever already has one keeps it
 * unless someone else is `margen` metres closer (no flicker when two people stand at the same distance).
 */
export function elegirCercanos(yo: { x: number; z: number } | null, otros: { id: number; x: number; z: number }[], cupo: number, actuales: ReadonlySet<number>, margen = 3): Set<number> {
  const plazas = Math.max(0, cupo - (yo ? 1 : 0));
  const orden = otros.map((o) => ({ id: o.id, d: (yo ? Math.hypot(o.x - yo.x, o.z - yo.z) : 0) - (actuales.has(o.id) ? margen : 0) }))
    .sort((a, b) => a.d - b.d || a.id - b.id);
  return new Set(orden.slice(0, plazas).map((o) => o.id));
}

/** Smoothed horizontal speed and facing from position deltas (per avatar). */
export type Marcha = { x: number; z: number; vx: number; vz: number; velocidad: number; rumbo: number; listo: boolean };
export const nuevaMarcha = (): Marcha => ({ x: 0, z: 0, vx: 0, vz: 0, velocidad: 0, rumbo: 0, listo: false });
const TAU_VELOCIDAD = 0.15, TAU_GIRO = 0.12;

/** Feed a new position after `dt` seconds. Facing turns towards the direction of movement while moving. */
export function seguir(m: Marcha, x: number, z: number, dt: number): Marcha {
  if (!m.listo || dt <= 0 || dt > 1) { // first sample, or a long pause (tab hidden): no speed from a jump in time
    m.x = x; m.z = z; m.listo = true; if (dt > 1) { m.vx = 0; m.vz = 0; m.velocidad = 0; } return m;
  }
  const k = 1 - Math.exp(-dt / TAU_VELOCIDAD);
  m.vx += ((x - m.x) / dt - m.vx) * k;
  m.vz += ((z - m.z) / dt - m.vz) * k;
  m.x = x; m.z = z;
  m.velocidad = Math.hypot(m.vx, m.vz);
  if (m.velocidad >= QUIETO_MS) m.rumbo = girarHacia(m.rumbo, Math.atan2(m.vx, m.vz), dt, TAU_GIRO);
  return m;
}

/** Turn `actual` towards `objetivo` (radians, shortest way) with time constant `tau`. */
export function girarHacia(actual: number, objetivo: number, dt: number, tau: number): number {
  let d = objetivo - actual;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return actual + d * (1 - Math.exp(-dt / tau));
}
