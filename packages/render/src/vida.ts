// vida (P2, «personas vivas»): the maths of a person who is not a statue — it breathes and shifts its weight, turns its body toward
// you when you come near, and walks a short way when the world puts it somewhere else for you. All pure and allocation-free: the
// render owns the clock and the group it moves (index.ts), these functions only say by how much. Page only: nothing is sent.
// The idle sits ON TOP of where the state puts the person (like reaccion.ts): the amplitudes are small enough that no one sees a
// pose jump when it starts or stops, and a person never drifts: every term is a bounded sine of the clock.

/** How a placed person is alive (the same shape as `Vida` in packages/feature: the feature says what it wants, the render does it). */
export type Vida = { id: string; reposo: boolean; mira: number; atiende?: boolean; camina?: boolean };

export const RESPIRA_MAX = 0.015;      // breathing: at most 1.5 % taller (and half as much wider)
export const RESPIRA_S: readonly [number, number] = [3.5, 5];  // its period range, seconds
export const BALANCEO_MAX_GRAD = 2;    // weight shift: at most 2° of sway to the side
export const BALANCEO_S: readonly [number, number] = [6, 9];   // its period range, seconds
export const LEJOS_REPOSO_M = 25;      // farther than this (or off screen) the idle stands still
export const MIRA_HOLGURA_M = 1;       // it notices you this much beyond its `radio`
export const GIRO_HACIA_S = 0.12;      // smoothing time turning toward you (settles in about 0.5 s)
export const GIRO_VUELTA_S = 0.22;     // ... and back to its own yaw (about 1 s)
export const CAMINA_MS = 1.4;          // walking speed, m/s (C-13 / C-21: never faster than a calm walk)
export const CAMINA_MAX_M = 10;        // farther than this a move is not walked (it would take too long): it is placed

/** A person's own constants, from its id alone (FNV-1a): same id, same numbers, on every page, so no two stand in sync. */
export type Fase = { respiraS: number; respira0: number; balanceoS: number; balanceo0: number };
export function faseDe(id: string): Fase {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const u = (n: number): number => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return ((h + n) >>> 0) / 0x100000000; };
  return {
    respiraS: RESPIRA_S[0] + u(1) * (RESPIRA_S[1] - RESPIRA_S[0]), respira0: u(2) * Math.PI * 2,
    balanceoS: BALANCEO_S[0] + u(3) * (BALANCEO_S[1] - BALANCEO_S[0]), balanceo0: u(4) * Math.PI * 2,
  };
}

/** What the idle adds at one instant: `alto`/`ancho` multiply the scale, `inclina` is degrees of lean to the side (rotation z), `giro` degrees
 * of yaw. Written in place by `reposoDe` (no allocation per frame). */
export type Reposo = { alto: number; ancho: number; inclina: number; giro: number };
export const nuevoReposo = (): Reposo => ({ alto: 1, ancho: 1, inclina: 0, giro: 0 });

/** The idle at `t` seconds for this person: breathing (a slow sine, never above RESPIRA_MAX) and a weight shift (a slower sine of lean and
 * a little yaw, never above BALANCEO_MAX_GRAD). Bounded for every t; deterministic; the same `t` gives the same pose. */
export function reposoDe(f: Fase, t: number, out: Reposo): Reposo {
  const r = (Math.sin((t / f.respiraS) * Math.PI * 2 + f.respira0) + 1) / 2; // 0…1: breathe in, breathe out
  const b = Math.sin((t / f.balanceoS) * Math.PI * 2 + f.balanceo0);          // -1…1: left, right
  out.alto = 1 + RESPIRA_MAX * r;
  out.ancho = 1 + (RESPIRA_MAX / 2) * r;
  out.inclina = BALANCEO_MAX_GRAD * b;
  out.giro = BALANCEO_MAX_GRAD * 0.35 * b; // the body turns a little as the weight moves
  return out;
}

/** The yaw (degrees, 0 = facing +z, as `giro` everywhere) that faces from (x, z) to (ax, az); `otro` when they are the same point. */
export const rumboHacia = (x: number, z: number, ax: number, az: number, otro: number): number => {
  const dx = ax - x, dz = az - z;
  return dx * dx + dz * dz < 1e-6 ? otro : (Math.atan2(dx, dz) * 180) / Math.PI;
};
/** `a` brought into (-180, 180]. */
export const envuelve = (a: number): number => { let r = (a + 180) % 360; if (r <= 0) r += 360; return r - 180; };

/** The yaw state of a person: where its body points now and how fast it is turning (deg/s). */
export type Giro = { yaw: number; vel: number };
/** Turn `e.yaw` toward `objetivo` (degrees) by the shortest way with a critically damped spring (ease in, ease out, never overshoots, the
 * same at any frame rate and after a long frame: `dt` is capped). `suave` is the smoothing time: the turn settles in about 4×. Written in place. */
export function giraHacia(e: Giro, objetivo: number, suave: number, dt: number): Giro {
  if (!(dt > 0)) return e;
  const d = Math.min(dt, 0.1), omega = 2 / Math.max(0.02, suave), x = omega * d;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cambio = envuelve(e.yaw - objetivo); // where we are, relative to the target (so the target is 0)
  const tmp = (e.vel + omega * cambio) * d;
  e.vel = (e.vel - omega * tmp) * k;
  let nuevo = cambio + tmp; nuevo *= k;
  if (cambio * nuevo < 0) { e.yaw = envuelve(objetivo); e.vel = 0; return e; } // would have crossed the target: stop on it
  e.yaw = envuelve(objetivo + nuevo);
  return e;
}

/** Is the player close enough for this person to turn? `radio` is the person's `radio` (m); `mira` the Vida's reach (0 = never). */
export const noto = (d2: number, mira: number, atiende: boolean | undefined): boolean => atiende === true || (mira > 0 && d2 <= (mira + MIRA_HOLGURA_M) ** 2);

/** The walk of a person put somewhere else: `(dx, dz)` is how far it still is from where it ended up (its drawn place = placed place +
 * this). Closes it at CAMINA_MS; returns the metres left. Written in place. */
export function caminaPaso(o: { dx: number; dz: number }, dt: number): number {
  const d = Math.hypot(o.dx, o.dz);
  if (d <= 1e-6) { o.dx = 0; o.dz = 0; return 0; }
  const paso = CAMINA_MS * Math.min(Math.max(dt, 0), 0.1);
  if (paso >= d) { o.dx = 0; o.dz = 0; return 0; }
  const k = (d - paso) / d; o.dx *= k; o.dz *= k;
  return d - paso;
}
/** A walk worth showing: the person was already drawn somewhere and the move is neither nothing nor too long. */
export const vaACaminar = (metros: number): boolean => metros > 0.05 && metros <= CAMINA_MAX_M;

/** A name that says the model has an idle clip of its own (it is played instead of the procedural idle). */
export const esClipReposo = (nombre: string): boolean => /idle|reposo|respira/i.test(nombre);
