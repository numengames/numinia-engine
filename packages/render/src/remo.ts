// Rowing with the hands (MIS-229, t_ee0ca4a3): the optional way to walk in VR with tracked hands. With the setting
// `controles.gestoAndarVR = remar`, pinch in empty air and pull the hand BACK towards you: you move forward, the longer the
// stroke the faster; push the hand FORWARD and you brake. Let go and you glide to a stop. Pure maths: no THREE,
// no DOM, no clock (vr.ts gives the hands' distance in front of the head each frame), so it is tested headless.
// What the user does is a stroke, release, hand forward in the air, pinch, stroke again — the recovery happens with the
// hand open, so it never brakes. Never goes backwards: the forward push only takes speed away.

/** Hand travel (m) that takes you from standing to full pace with a pull. */
export const REMO_LARGO_M = 0.6;
/** Hand travel (m) forward that takes you from full pace to a stop (braking is quicker than speeding up). */
export const REMO_FRENO_M = 0.3;
/** Seconds to lose 63 % of the speed after letting go (the glide). */
export const REMO_DESLIZA_S = 1.4;
/** Slower than this (m/s) the hand is «still» (tracking noise, a resting hand) and does nothing. */
export const REMO_QUIETA_MS = 0.1;
/** Faster than this (m/s) is a tracking glitch (a hand that jumped), not a stroke: the frame is ignored. */
export const REMO_MAX_MS = 3;
/** A frame longer than this (s) is a stall: nothing is read from it. */
export const REMO_DT_MAX_S = 0.25;
/** The pace a full stroke reaches, as a fraction of the stick's range: the walking pace the pinch-to-point gesture uses (0.9 and up runs). */
export const REMO_RITMO = 0.7;

export type ManoRemo = { lado: string; /** metres the hand is in front of the head along where you face; negative = behind it */ delante: number };

/** One state per player. `paso(dt, manos)` is called every frame with the hands pinching in empty air (none = []), and returns
 * the speed fraction 0..1 to walk forward along the facing; multiply by REMO_RITMO for the stick-equivalent. */
export function crearRemo() {
  let v = 0;                                              // current speed, 0..1
  const antes = new Map<string, number>();                // hand → where it was last frame
  return {
    get velocidad(): number { return v; },
    reset(): void { v = 0; antes.clear(); },
    paso(dt: number, manos: readonly ManoRemo[]): number {
      if (!(dt > 0) || dt > REMO_DT_MAX_S) { antes.clear(); return v; }
      const aqui = new Set(manos.map((m) => m.lado));
      for (const k of [...antes.keys()]) if (!aqui.has(k)) antes.delete(k);   // a hand that let go starts fresh next pinch
      let ganado = 0, perdido = 0;
      for (const m of manos) {
        const a = antes.get(m.lado);
        antes.set(m.lado, m.delante);
        if (a === undefined || !Number.isFinite(m.delante)) continue;
        const vel = (m.delante - a) / dt;                  // m/s, + forward (away from the head), − back (towards it)
        if (Math.abs(vel) < REMO_QUIETA_MS || Math.abs(vel) > REMO_MAX_MS) continue;
        if (vel < 0) ganado += (-vel * dt) / REMO_LARGO_M; else perdido += (vel * dt) / REMO_FRENO_M;
      }
      v = Math.max(0, Math.min(1, v + ganado - perdido));
      if (manos.length === 0) v *= Math.exp(-dt / REMO_DESLIZA_S);
      if (v < 0.005) v = 0;
      return v;
    },
  };
}
