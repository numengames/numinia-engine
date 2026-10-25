// dardos in VR, the maths of one throw (pure: no three, no DOM; apps/plaza/dardos-vr.ts feeds it, test/dardos-vr.test.ts
// checks it). A hand lets go of a dart at position `p` moving at velocity `v` (world, m/s); the board's face is a plane
// (`Cara`). What the server gets is the SAME verb as the mouse HUD and the AR wall: dardos.lanzar(x, y, fuerza), with
// (x, y) in board radii (x right, y up) and fuerza 0-1. The server then bends it (drop under FUERZA_IDEAL, climb and
// scatter over it) and decides where the dart lands: this file never decides a landing, it only reads the gesture.
//   · aim   = where the hand's direction of travel meets the board (a straight line: the server adds the drop);
//   · power = how fast the hand moved (V_LLENO m/s = full strength; FUERZA_IDEAL is reached at 65% of it);
//   · help  = v14: `ayuda` (0-1, from gesto.ts: the closer the gesture is to a professional's throw, the more) pulls the aim toward
//             the middle (the farther out, the harder) and the strength toward FUERZA_IDEAL; 0 changes nothing. The raw reading
//             stays in `crudo`. The server still bends and scatters what it gets: help is partial, never total;
//   · caps  = the aim is held inside TOPE_RADIOS of the bull's eye (a wild throw is a rim hit, never "gone"), and a
//             gesture that is too slow, backwards or sideways is NOT a throw: the dart just falls from the hand.
// Sources of the ideas (nothing copied verbatim; see the PR body): Valve's SteamVR Interaction System VelocityEstimator
// (BSD-3-Clause: velocity = average over the last few frames), three.js webxr_xr_ballshooter (MIT: select = launch),
// super-hands for A-Frame (MIT: release velocity), Half-Life: Alyx's «partial assistance, never total» (see the guide).

import { FUERZA_IDEAL } from "./feature.ts";

export type V3 = [number, number, number];
/** The board's face in the world: centre, unit normal pointing at the thrower, unit "right", and metres per board radius. */
export type Cara = { c: V3; n: V3; r: V3; m: number };
export type Muestra = { t: number; x: number; y: number; z: number };

/** A hand this fast (m/s) throws at full strength; FUERZA_IDEAL (0.65) = 4.55 m/s, an easy underhand dart throw. */
export const V_LLENO = 7;
/** Slower than this (m/s) is not a throw: the dart drops from the hand. */
export const V_MIN = 0.9;
/** The direction of travel must be at least this much toward the board (cos of the angle to its normal): 0.25 = within ~75°. */
export const COS_MIN = 0.25;
/** The aim never leaves this radius (board radii): a wild throw lands on the rim, not on the wall behind the plaza. */
export const TOPE_RADIOS = 1.25;
/** The velocity is read from the last VENTANA_MS before the release (a pinch opening jerks the joints: the hands end earlier). */
export const VENTANA_MS = 120;
export const FIN_PELLIZCO_MS = 45;
/** Help pulls an aim at distance rho (board radii) toward the middle with weight (rho / RADIO_AYUDA)², capped at 1: an aim near the bull's eye is barely touched, one that would miss the board is pulled in. */
export const RADIO_AYUDA = 1.0;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Strength (0-1) from a hand's speed (m/s). */
export const fuerzaDeVelocidad = (v: number): number => clamp(v / V_LLENO, 0, 1);

/** On a slow frame rate the window may hold one sample: the last two before the release then speak for it, if they are this close (ms). */
export const SALTO_MAX_MS = 350;

/** The hand's velocity (m/s): the least-squares slope of position over time for the samples in [fin - ventana, fin] (a line fit,
 *  not two endpoints: a headset renders faster than the hand tracker updates, so neighbouring samples can repeat a pose). Needs
 *  samples spanning 25 ms at least; if the window holds less (a stalled frame), the last sample against the newest one 25 ms
 *  or more older, within SALTO_MAX_MS; else null. */
export function velocidadDe(muestras: readonly Muestra[], fin: number, ventana = VENTANA_MS): V3 | null {
  const hasta = muestras.filter((s) => s.t <= fin);
  let w = hasta.filter((s) => s.t >= fin - ventana);
  if (w.length < 2 || w[w.length - 1].t - w[0].t < 25) { // a stalled frame: the last sample against the newest one at least 25 ms older
    const ultima = hasta[hasta.length - 1], vieja = ultima && [...hasta].reverse().find((s) => ultima.t - s.t >= 25);
    if (!ultima || !vieja || ultima.t - vieja.t > SALTO_MAX_MS) return null;
    w = [vieja, ultima];
  }
  const n = w.length, tm = w.reduce((a, s) => a + s.t, 0) / n;
  let stt = 0; const sx = [0, 0, 0], mean: V3 = [0, 0, 0];
  for (const s of w) { mean[0] += s.x / n; mean[1] += s.y / n; mean[2] += s.z / n; }
  for (const s of w) { const dt = (s.t - tm) / 1000; stt += dt * dt; sx[0] += dt * (s.x - mean[0]); sx[1] += dt * (s.y - mean[1]); sx[2] += dt * (s.z - mean[2]); }
  return stt > 0 ? [sx[0] / stt, sx[1] / stt, sx[2] / stt] : null;
}

export type Tiro =
  | { tipo: "tiro"; x: number; y: number; fuerza: number; velocidad: number; recortado: boolean; distancia: number; ayuda: number; crudo: { x: number; y: number; fuerza: number } }
  | { tipo: "suelta"; motivo: "lento" | "atras" | "detras" | "sin-velocidad" };

/** The help applied to an aim and a strength: `ayuda` 0 returns them unchanged, 1 would put a far-off aim at the middle and the strength at the ideal. Pure. */
export function ayudar(x: number, y: number, fuerza: number, ayuda: number): { x: number; y: number; fuerza: number } {
  const a = clamp(ayuda, 0, 1), rho = Math.hypot(x, y), k = 1 - a * Math.min(1, (rho / RADIO_AYUDA) ** 2);
  return { x: x * k, y: y * k, fuerza: fuerza + (FUERZA_IDEAL - fuerza) * a };
}

/** One release: the throw to send, or why the dart just falls. `ayuda` (0-1): the help the gesture earned (gesto.ts). Pure. */
export function lanzamiento(cara: Cara, p: V3, v: V3 | null, ayuda = 0): Tiro {
  if (!v) return { tipo: "suelta", motivo: "sin-velocidad" };
  const vel = Math.hypot(v[0], v[1], v[2]);
  if (!(vel >= V_MIN)) return { tipo: "suelta", motivo: "lento" };
  const hacia = -dot(v, cara.n); // speed toward the board (its normal points at the thrower)
  if (hacia / vel < COS_MIN) return { tipo: "suelta", motivo: "atras" };
  const delante: V3 = [p[0] - cara.c[0], p[1] - cara.c[1], p[2] - cara.c[2]];
  const pn = dot(delante, cara.n);
  if (pn <= 0.05) return { tipo: "suelta", motivo: "detras" }; // the hand is at or past the board
  const t = pn / hacia;
  const hx = delante[0] + v[0] * t, hy = delante[1] + v[1] * t, hz = delante[2] + v[2] * t;
  let x = dot([hx, hy, hz], cara.r) / cara.m, y = hy / cara.m; // "up" is the world's: the face is vertical
  const rho = Math.hypot(x, y);
  const recortado = rho > TOPE_RADIOS;
  if (recortado) { x *= TOPE_RADIOS / rho; y *= TOPE_RADIOS / rho; }
  const fuerza = fuerzaDeVelocidad(vel), a = clamp(Number.isFinite(ayuda) ? ayuda : 0, 0, 1), h = ayudar(x, y, fuerza, a);
  return { tipo: "tiro", x: r3(h.x), y: r3(h.y), fuerza: r3(h.fuerza), velocidad: r3(vel), recortado, distancia: r3(pn), ayuda: r3(a), crudo: { x: r3(x), y: r3(y), fuerza: r3(fuerza) } };
}

/** How long the flight to the board is drawn (ms): the real distance at the throw's speed, within a readable range. */
export const duracionVuelo = (distancia: number, velocidad: number): number => Math.round(clamp((distancia / clamp(velocidad, 3, 9)) * 1000, 220, 900));
