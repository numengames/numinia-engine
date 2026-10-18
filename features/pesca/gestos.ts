// pesca — the rod's gestures in VR (pure, no three, no DOM: test/pesca-gestos.test.ts). The page samples where the
// rod's TIP is (1 m along the rod from the hand) every XR frame; a flick of the wrist moves the tip far faster than the
// hand, so measuring the tip makes a small real cast and a big arm swing both read as a cast, with a controller or a
// tracked hand alike. Two gestures:
//   · lanzar (cast): the tip goes FORWARD (where the head looks, flattened) fast — the end of an overhead or side cast;
//   · tirón (strike): the tip goes UP or BACK toward you fast — lifting the rod to set the hook or to pump the fish.
// Speeds come from the samples inside a short window (not frame to frame), so a slow headset frame rate or one late
// frame does not make or break a gesture. Each gesture has a cooldown so one swing fires once.

export type Muestra = { t: number; x: number; y: number; z: number };
export type Gesto = { lanzar: boolean; tiron: boolean; vel: { x: number; y: number; z: number }; adelante: number };

/** Thresholds (m/s of the rod tip, ms). A relaxed wrist flick moves the tip 4-8 m/s; walking moves it ~1.5. */
export const GESTOS = {
  ventanaMs: 140,      // the speed is measured over the samples of the last ventanaMs
  minMs: 30,           // …but never over less than this (one sample is no speed)
  lanceAdelante: 3.0,  // cast: tip speed along the look direction
  lanceArribaMax: 2.0, // …while not going up faster than this (a lift is a strike, not a cast)
  tironArriba: 2.4,    // strike: tip speed upward…
  tironAtras: 2.8,     // …or back toward you (with some upward part)
  enfriarMs: 700,      // one gesture per swing
  recorridoM: 0.3,     // …and the tip must really travel this far inside the window (a pinch closing, or a tracked
                       // hand's joints jumping between poses, moves it a few cm in one frame: fast, but no swing)
} as const;

export function crearGestos(g: { -readonly [K in keyof typeof GESTOS]: number } = { ...GESTOS }) {
  const hist: Muestra[] = [];
  let ultimoLance = -Infinity, ultimoTiron = -Infinity;
  return {
    /** Feed one sample (tip position, world metres; time ms) and the flattened look direction; get what happened. */
    muestra(m: Muestra, mirada: { x: number; z: number }): Gesto {
      hist.push({ ...m });
      while (hist.length > 2 && m.t - hist[1].t >= g.ventanaMs) hist.shift();
      const a = hist[0], dt = (m.t - a.t) / 1000;
      const out: Gesto = { lanzar: false, tiron: false, vel: { x: 0, y: 0, z: 0 }, adelante: 0 };
      if (hist.length < 2 || m.t - a.t < g.minMs || dt > 0.5) return out;
      const vx = (m.x - a.x) / dt, vy = (m.y - a.y) / dt, vz = (m.z - a.z) / dt;
      const l = Math.hypot(mirada.x, mirada.z) || 1, fx = mirada.x / l, fz = mirada.z / l;
      const adelante = vx * fx + vz * fz, dAdelante = adelante * dt, dArriba = vy * dt;
      out.vel = { x: vx, y: vy, z: vz }; out.adelante = adelante;
      if (adelante >= g.lanceAdelante && dAdelante >= g.recorridoM && vy <= g.lanceArribaMax && m.t - ultimoLance >= g.enfriarMs) { out.lanzar = true; ultimoLance = m.t; ultimoTiron = m.t; }
      else if (((vy >= g.tironArriba && dArriba >= g.recorridoM * 0.8) || (-adelante >= g.tironAtras && -dAdelante >= g.recorridoM && vy > 0)) && m.t - ultimoTiron >= g.enfriarMs) { out.tiron = true; ultimoTiron = m.t; }
      return out;
    },
    /** Forget the samples (the rod changed hands, XR ended): the next speed starts from scratch. */
    reiniciar(): void { hist.length = 0; },
  };
}

/** Reeling with a trigger or a pinch: on above `sube`, off below `baja` (hysteresis, so a half-pressed trigger does not flicker). */
export function conHisteresis(sube = 0.55, baja = 0.35) {
  let on = false;
  return (v: number): boolean => (on = on ? v > baja : v >= sube);
}
