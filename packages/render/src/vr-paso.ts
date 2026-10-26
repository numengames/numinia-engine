// How the VR stick's push (and a tracked hand's walk) becomes what the sim is told: a push in -1..1 and the run flag.
// «Velocidad al andar en VR» (controles.velocidadVR) is 40-200 %. Up to 100 % it only shrinks the push, as it always did.
// Above 100 % the push may not grow (the sim clamps its length to 1, so a bigger push changes nothing): a walk that is
// faster than the walking pace is asked for as a SMALLER push with the run flag, whose step is RUN_SPEED/SPEED times
// longer — the same m/s, no change to the sim, no new speed the server does not already know.
// The stick's own edge still runs at the full running pace, as before. Pure numbers: no three.js, no view.

/** The setting's top, as a share of the walking pace (2 = 200 %). Published in limits.json («vr_stick_speed_cap»). */
export const VELOCIDAD_MAX = 2;
/** The setting's bottom (comfort). */
export const VELOCIDAD_MIN = 0.4;
/** Walking and running pace of the sim (packages/sim/src/index.ts SPEED, RUN_SPEED), m/s: test/vr-velocidad.test.ts keeps them equal. */
export const ANDAR_MS = 1.5, CORRER_MS = 4;
/** The stick's push (after the setting up to 100 %) from which it runs: most of the throw walks, only the very end runs. */
export const BORDE_CORRER = 0.97;

export type PasoVR = { mx: number; mz: number; correr: boolean };

/** `mx`, `mz`: the push in the world frame, length ≤ 1; `velocidad`: the setting as a share (1 = 100 %). */
export function pasoVR(mx: number, mz: number, velocidad: number): PasoVR {
  const m = Math.hypot(mx, mz);
  if (!(m > 0)) return { mx: 0, mz: 0, correr: false };
  const v = Math.max(VELOCIDAD_MIN, Math.min(VELOCIDAD_MAX, Number.isFinite(velocidad) ? velocidad : 1));
  const hasta1 = Math.min(v, 1);
  if (m * hasta1 >= BORDE_CORRER) return { mx: mx * hasta1, mz: mz * hasta1, correr: true }; // the edge: runs, as shipped
  if (v <= 1) return { mx: mx * v, mz: mz * v, correr: false };
  const pasos = m * v; // in walking paces
  if (pasos <= 1) return { mx: mx * v, mz: mz * v, correr: false };
  const k = (pasos * ANDAR_MS) / CORRER_MS / m; // the same m/s as a push of `pasos` walking steps, but with the run flag
  return { mx: mx * k, mz: mz * k, correr: true };
}

/** m/s the sim moves you for a push of this length (≤ 1) and flag: the number a test checks the cap against. */
export const metrosPorSegundo = (largo: number, correr: boolean): number => largo * (correr ? CORRER_MS : ANDAR_MS);
