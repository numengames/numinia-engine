// avatares-politica (J1): the decisions behind VRM avatars, pure (no three.js, no DOM) so tests can run them.
// Who wears a VRM (the nearest, a cap per device class), which file each player gets, which clip plays for a
// speed, and the smoothed facing/speed read from position deltas. avatares.ts applies them to the scene.

/** VRM avatars drawn at once, by device class (docs/BACKLOG.md J1, mmo-browser-study/LIMITES.md §3). */
export const CUPO_VRM = { escritorio: 60, visor: 25, movil: 12 } as const;
/** Farther than this from you, an avatar's animation stands still (cold phones), like H1's things. */
export const ANIMAR_HASTA_M = 40;
/** J14 (lote13): farther than this from you (m), a player stops wearing a VRM and is the capsule again: at that distance a
 * person is a few dozen pixels tall (1.7 m at 30 m is ~40 px on a phone), the face and the gait cannot be read, and the
 * skinned mesh costs a draw call, ~2.6 k triangles and a skeleton update per person. The capsule stays the anchor for names,
 * bounces and the camera, so name tags keep reading. A PC has the room: it keeps VRMs out to the animation range. */
export const VRM_HASTA_M = { escritorio: 45, visor: 30, movil: 30 } as const;
/** A VRM already worn stays until it is this much (m) beyond `VRM_HASTA_M` (no flicker at the edge of the band). */
export const VRM_HISTERESIS_M = 4;
/** Between this distance and ANIMAR_HASTA_M an avatar's animation steps every other frame (one half of the mixer and rig
 * work; the eye does not tell a walk cycle at 15 Hz from one at 30 Hz past 15 m). Nearer: every frame. */
export const ANIMAR_MITAD_DESDE_M = 15;
/** How often an avatar `distanciaM` away steps its animation: 1 = every frame, 2 = every other frame, 0 = not at all. */
export function cadenciaAnimacion(distanciaM: number, hastaM = ANIMAR_HASTA_M, mitadM = ANIMAR_MITAD_DESDE_M): 0 | 1 | 2 {
  return distanciaM > hastaM ? 0 : distanciaM > mitadM ? 2 : 1;
}
/** A VRM file with more triangles than this is refused (the player stays a capsule). */
export const TRIANGULOS_MAX = 10_000;
/** Speed thresholds (m/s, horizontal): below QUIETO idle, above CORRER run, walk in between. */
export const QUIETO_MS = 0.3, CORRER_MS = 5;
/** Above the ground by more than this (m): in the air. */
export const EN_EL_AIRE_M = 0.15;
/** The height of the ground under (x, z) for feet at `y` (metres), as the simulation finds it (sim groundHeight): the
 * plaza (0) or the highest top of a solid box (metres, [x0 y0 z0 x1 y1 z1] each) not more than 0.4 m over the feet.
 * «In the air» is measured from THIS, not from y 0: on a stair or a roof you walk, you do not fly (Pablo, 16-10). */
export function sueloBajo(x: number, z: number, y: number, cajas: ArrayLike<number>): number {
  let g = 0;
  for (let o = 0; o + 5 < cajas.length; o += 6) {
    if (x < cajas[o] || x > cajas[o + 3] || z < cajas[o + 2] || z > cajas[o + 5]) continue;
    const top = cajas[o + 4];
    if (top > g && top <= y + 0.4 + 1e-6) g = top;
  }
  return g;
}
/** The ground a world with relieve gives the avatars: `suelo` = what the simulation walks on under (x, z) for feet at `y` (the collision mesh and
 * the solid boxes, metres), `malla` = the collision mesh alone. */
export type SueloTerreno = { suelo: (x: number, z: number, y: number) => number; malla: (x: number, z: number, y: number) => number };
/** What «in the air» is measured from: with relieve, the ground the simulation finds (hills included); without, the plaza and the boxes (`sueloBajo`). */
export function sueloDeVista(cajas: () => ArrayLike<number>, terreno: () => SueloTerreno | null): (x: number, z: number, y: number) => number {
  return (x, z, y) => { const t = terreno(); return t ? t.suelo(x, z, y) : sueloBajo(x, z, y, cajas()); };
}
/** How far (m) to lift or sink a standing avatar so it is DRAWN on the drawn terrain, not on the coarser collision mesh it walks on.
 * 0 when the ground under it is not the mesh (a solid box, a roof) or there is no drawn surface there. `dibujado(x, z)` = the drawn surface's height. */
export function asentadoEn(ts: SueloTerreno, dibujado: (x: number, z: number) => number, x: number, z: number, y: number): number {
  const m = ts.malla(x, z, y);
  if (m < SIN_SUELO_M || Math.abs(ts.suelo(x, z, y) - m) > 0.02) return 0; // no floor there (a slope too steep to stand on), or the floor is a box
  const d = dibujado(x, z) - m;
  return Number.isFinite(d) && Math.abs(d) < ASENTAR_MAX_M ? d : 0;
}
const ASENTAR_MAX_M = 4, SIN_SUELO_M = -100;
/** Crossfade between clips (s). */
export const FUNDIDO_S = 0.2;

export type Estado = "quieto" | "andar" | "correr" | "saltar";
export type Clip = "quieto" | "andar" | "trotar" | "correr" | "saltar";

export function cupoVRM(c: { mobile: boolean; xr: boolean }): number {
  return c.xr ? CUPO_VRM.visor : c.mobile ? CUPO_VRM.movil : CUPO_VRM.escritorio;
}
/** How far (m) a VRM is worn, by device class (same classes as `cupoVRM`). */
export function distanciaVRM(c: { mobile: boolean; xr: boolean }): number {
  return c.xr ? VRM_HASTA_M.visor : c.mobile ? VRM_HASTA_M.movil : VRM_HASTA_M.escritorio;
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
export function clipPara(estado: Estado, velocidad: number, cadera: number, natural: Partial<Record<Clip, number>>, hay: (c: Clip) => boolean, duracion: Partial<Record<Clip, number>> = {}): { clip: Clip; ritmo: number } | null {
  const orden: Clip[] = estado === "quieto" ? ["quieto"] : estado === "saltar" ? ["saltar", "quieto"]
    : estado === "correr" ? ["correr", "trotar", "andar", "quieto"] : elegirPaso(velocidad / Math.max(0.1, cadera), natural);
  const clip = orden.find(hay);
  if (!clip) return null;
  const n = natural[clip] ?? 0, h = Math.max(0.1, cadera);
  let ritmo = n > 0 && clip !== "quieto" && clip !== "saltar" ? velocidad / (n * h) : 1; // the feet stay still on the ground
  // N1b (Pablo, 16-10: «va como corriendo despacito»): the house jog and sprint loops take 2 long steps per loop, so
  // played at the speed that keeps the feet still they bound in slow motion (≈ 90 steps a minute at 4 m/s). Meet a
  // natural step rate half way (geometric mean): `CADENCIA` steps a second for hips of 0.9 m, faster for shorter legs
  // (∝ 1/√hips, like a pendulum); the feet slide a little, the gait stops floating.
  const d = duracion[clip] ?? 0;
  if ((clip === "trotar" || clip === "correr") && d > 0 && ritmo > 0) {
    const porCadencia = (CADENCIA[clip] * Math.sqrt(0.9 / h)) / (2 / d);
    ritmo = Math.sqrt(ritmo * porCadencia);
  }
  if (clip !== "quieto" && clip !== "saltar") ritmo = Math.min(2, Math.max(0.5, ritmo));
  return { clip, ritmo };
}
/** Steps a second a person of hips 0.9 m takes jogging and sprinting (our choice, ≈ 165 and 190 steps a minute). */
export const CADENCIA = { trotar: 2.75, correr: 3.15 } as const;
function elegirPaso(relativa: number, natural: Partial<Record<Clip, number>>): Clip[] {
  const a = natural.andar ?? 0.8, t = natural.trotar ?? 5.2;
  return relativa < Math.sqrt(a * t) ? ["andar", "trotar", "quieto"] : ["trotar", "andar", "quieto"];
}

/**
 * Who wears a VRM: you (when `yo` is set) and the nearest others, `cupo` in total. Whoever already has one keeps it
 * unless someone else is `margen` metres closer (no flicker when two people stand at the same distance).
 * `hastaM`: the farthest a VRM is worn at all (the capsule beyond; `distanciaVRM`).
 */
export function elegirCercanos(yo: { x: number; z: number } | null, otros: { id: number; x: number; z: number }[], cupo: number, actuales: ReadonlySet<number>, margen = 3, hastaM = Infinity): Set<number> {
  const plazas = Math.max(0, cupo - (yo ? 1 : 0));
  // `hastaM` (J14): nobody beyond it wears a VRM (a VRM already worn keeps it VRM_HISTERESIS_M longer)
  const orden = otros.map((o) => ({ id: o.id, real: yo ? Math.hypot(o.x - yo.x, o.z - yo.z) : 0, ya: actuales.has(o.id) }))
    .filter((o) => o.real <= hastaM + (o.ya ? VRM_HISTERESIS_M : 0))
    .map((o) => ({ id: o.id, d: o.real - (o.ya ? margen : 0) }))
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

/**
 * U13: whoever's voice you are hearing right now (an entry in apps/plaza/voz.ts's `voces`, i.e. someone near has
 * their mic on and is making sound) gets their "aa" mouth shape driven by the volume being decoded for THIS
 * listener (not the speaker's own level — that is what decides whether playback audio exists at all here; two
 * listeners at different distances/network conditions can hear a different level of the same speaker). Below
 * `BOCA_SILENCIO_RMS` (same idea as voz.ts's sender-side SILENCIO) the mouth stays shut: brief noise floor from
 * the decoder does not twitch it open.
 */
export const BOCA_SILENCIO_RMS = 0.012;
const BOCA_GANANCIA = 6; // how fast RMS saturates the shape fully open (1.0)

/** A decoded voice frame's RMS turned into how open the mouth shape should be (0 closed .. 1 fully open). */
export function nivelBoca(rms: number): number {
  return rms <= BOCA_SILENCIO_RMS ? 0 : Math.min(1, (rms - BOCA_SILENCIO_RMS) * BOCA_GANANCIA);
}

/**
 * The mouth's level between voice frames. A speaker's frames stop arriving the moment they go quiet (the sender
 * never transmits silence, see net/voz.ts's own SILENCIO), so a listener has no explicit "stop talking" signal —
 * the level must fade on its own instead of sticking open at the last word's volume. Call once per tick (U13's
 * 100 ms interval in voz.ts) with `rms` = the newest decoded frame since the last call, or `null` when none
 * arrived; `factor` is how much of the previous level survives one tick (lower = closes faster).
 */
export function decaerBoca(anterior: number, rms: number | null, factor = 0.55): number {
  const decaido = anterior * factor;
  return rms === null ? decaido : Math.max(decaido, nivelBoca(rms));
}

// ---- J7b: moves (the movement wheel) over the speed-driven clips ----
/** A move as the view plays it (same shape as the feature's MovimientoVista; render does not import packages/feature). */
export type Movimiento = { id: string; clips: readonly string[]; modo: "una" | "bucle" | "quedarse"; hastaS: number; viva: boolean };
/** One avatar's move in progress. `desde` = when its first clip started (ms), null while its files are still loading. */
export type EnCurso = { mov: Movimiento; pedido: number; desde: number | null; serie: number };
/** A move whose files have not all arrived after this long is dropped (a slow network must not freeze someone later). */
export const ESPERA_CARGA_MS = 5000;
let series = 0;
export const empezarMovimiento = (mov: Movimiento, ahora: number): EnCurso => ({ mov, pedido: ahora, desde: null, serie: ++series });

/** What to play now for a move: `fin` (over: back to the speed-driven clip), `esperar` (files loading: keep what plays)
 * or a clip with `bucle` (loop it) and `tramo` (which of its clips: a new tramo restarts the action). Walking or jumping
 * (`estado` other than quieto) ends any move at once, on every screen, because every screen sees the same walk. */
export function pasoDeMovimiento(e: EnCurso, ahora: number, estado: Estado, duracion: (clip: string) => number | undefined, listo: (clip: string) => boolean):
  { fin: true } | { fin: false; esperar: true } | { fin: false; esperar: false; clip: string; bucle: boolean; tramo: number; mantener: boolean } {
  if (estado !== "quieto") return { fin: true };
  const clips = e.mov.clips;
  if (!clips.length) return { fin: true };
  if (e.desde === null) {
    if (clips.every(listo)) e.desde = ahora;
    else return ahora - e.pedido > ESPERA_CARGA_MS ? { fin: true } : { fin: false, esperar: true };
  }
  let t = (ahora - e.desde) / 1000;
  if (t > e.mov.hastaS) return { fin: true };
  for (let i = 0; i < clips.length - 1; i++) { // the lead-in clips play once each (sit down, then sit)
    const d = duracion(clips[i]) ?? 0;
    if (t < d) return { fin: false, esperar: false, clip: clips[i], bucle: false, tramo: i, mantener: false };
    t -= d;
  }
  const ultimo = clips.length - 1, d = duracion(clips[ultimo]) ?? 0;
  if (e.mov.modo === "bucle") return { fin: false, esperar: false, clip: clips[ultimo], bucle: true, tramo: ultimo, mantener: false };
  if (e.mov.modo === "quedarse") return { fin: false, esperar: false, clip: clips[ultimo], bucle: false, tramo: ultimo, mantener: true };
  return t < d ? { fin: false, esperar: false, clip: clips[ultimo], bucle: false, tramo: ultimo, mantener: false } : { fin: true };
}

/** Does a move keep the page drawing? Lively ones and the lead-ins do; a calm loop or a held pose draws at the idle rate. */
export function movimientoOcupa(e: EnCurso, ahora: number, duracion: (clip: string) => number | undefined): boolean {
  if (e.mov.viva || e.desde === null) return true;
  let entrada = 0;
  for (const c of e.mov.modo === "bucle" ? e.mov.clips.slice(0, -1) : e.mov.clips) entrada += duracion(c) ?? 0;
  return (ahora - e.desde) / 1000 < entrada + FUNDIDO_S;
}
