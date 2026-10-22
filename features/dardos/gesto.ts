// dardos in VR, v14: how much does the hand's gesture look like a professional's throw? (pure: no three, no DOM;
// apps/plaza/dardos-vr.ts feeds it the hand's samples, lanzamiento.ts turns the score into help, test/dardos-gesto.test.ts checks it).
//
// What a professional does, as far as the papers we read say (full list with quotes: work/motor-vr/v14-dardos/ESTUDIO.md):
//   · a throw is a short, fast forward swing out of a backswing toward the face; the forearm does the work and the swing
//     goes straight at the board: «the upper arm stays still and only the forearm works … sideways components in the
//     acceleration phase transfer directly to the dart and cause horizontal spread» (mydart.app, five phases);
//   · the dart is let go WHILE the hand is still speeding up, not after it stopped: the dart's speed and the wrist's
//     angular acceleration at the release are tied to the width of the time window that still hits (Tran, Yano & Kondo 2019,
//     PLOS ONE 14(10):e0223837); the whole throw lasts under 200 ms (BJSM 45(15):A10.1, Cork);
//   · skilled throwers repeat: the spread of their top arm speed and of their throw timing is a fraction of a recreational
//     player's (same BJSM abstract: SD of timing 0.15 s pro vs 0.67 s recreational);
//   · a speed that is neither a lob nor a fling: the model of «Optimal strategies for throwing accurately» finds the most accurate overarm dart throw at
//     about 5.5 m/s (PMC5414278, section 5.1 «Dart throws»).
// So the score looks at four things the headset CAN see in a hand: how straight the swing goes at the board (recta), whether
// the hand was still accelerating when it let go (aceleracion), whether its speed is in the band of a real throw (velocidad)
// and whether there was a backswing (retroceso). What the headset cannot see (the upper arm held still, the elbow angle of
// 150-160° at the release that mydart gives) is NOT scored: the controller is a hand, not an arm.
// The thresholds below are DESIGN choices tuned by hand around those findings, not measured constants: calibrate them in the headset.
import type { Cara, Muestra, V3 } from "./lanzamiento.ts";
import { velocidadDe, V_MIN } from "./lanzamiento.ts";

/** The part of the hand's path that is looked at (ms before the release): backswing + forward swing fit inside. */
export const VENTANA_GESTO_MS = 600;
/** Each speed is read from this many ms (shorter than the throw's own 120 ms: a swing that speeds up for ~150 ms is read ~60 ms late by a long window). */
export const LECTURA_MS = 60;
/** Weights of the four parts (they add up to 1). The straightness weighs most: it is what decides left/right misses. */
export const PESOS = { recta: 0.35, aceleracion: 0.25, velocidad: 0.25, retroceso: 0.15 } as const;
/** The help never reaches 100 %: partial, never total (a perfect gesture still has the server's tremor). */
export const AYUDA_MAX = 0.6;

export type Partes = { recta: number; aceleracion: number; velocidad: number; retroceso: number };
export type Gesto = { puntos: number; partes: Partes; muestras: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** 1 at or below `bueno`, 0 at or above `malo`, linear between. */
const rampa = (x: number, bueno: number, malo: number) => clamp((malo - x) / (malo - bueno), 0, 1);
/** 0 below `a0`, 1 from `a1` to `b1`, 0 above `b0`, linear between. */
const meseta = (x: number, a0: number, a1: number, b1: number, b0: number) => (x < a1 ? clamp((x - a0) / (a1 - a0), 0, 1) : rampa(x, b1, b0));

/** The hand speed band of a real throw (m/s): full marks from 4 to 6.5 (the model's 5.5 m/s in the middle), nothing under 1.5 or over 9.5. */
export const BANDA_VELOCIDAD = { cero0: 1.5, pleno0: 4, pleno1: 6.5, cero1: 9.5 } as const;
/** The swing leaves the board's axis by at most this many degrees for full marks; more than the second one scores 0. */
export const ANGULO_LATERAL = { bueno: 5, malo: 25 } as const;
/** RMS distance (m) of the last 200 ms of the swing from a straight line, sideways: full marks under the first, none over the second. */
export const DESVIO_LATERAL_M = { bueno: 0.01, malo: 0.05 } as const;
/** A hand that is already slower than this fraction of its peak at the release was not accelerating: full marks from 0.9, none at 0.5. */
export const RAZON_ACELERACION = { bueno: 0.9, malo: 0.5 } as const;
/** Backswing depth (m, away from the board) that scores full: 12 cm. */
export const RETROCESO_PLENO_M = 0.12;

const CERO: Partes = { recta: 0, aceleracion: 0, velocidad: 0, retroceso: 0 };

/** The score (0-1) of the gesture that ended at `fin`. `muestras` are the hand's positions with the same orientation as the world
 *  (a translation does not matter, only differences are read); `cara` is the board the throw is meant for. Pure. */
export function valorarGesto(cara: Cara, muestras: readonly Muestra[], fin: number): Gesto {
  const w = muestras.filter((s) => s.t <= fin && s.t >= fin - VENTANA_GESTO_MS);
  if (w.length < 5) return { puntos: 0, partes: { ...CERO }, muestras: w.length };
  const vFin = velocidadDe(w, fin, LECTURA_MS);
  if (!vFin) return { puntos: 0, partes: { ...CERO }, muestras: w.length };
  const rapidez = Math.hypot(vFin[0], vFin[1], vFin[2]);
  if (!(rapidez >= V_MIN)) return { puntos: 0, partes: { ...CERO }, muestras: w.length }; // a hand that does not move is no gesture (and a speed of 1e-16 has a «direction» that is noise)

  // 1. straight at the board: the swing's direction in the horizontal plane against the board's axis, and how much the path wobbles sideways
  const haciaN = -dot(vFin, cara.n), lado = dot(vFin, cara.r);
  const angulo = haciaN > 0 ? (Math.atan2(Math.abs(lado), haciaN) * 180) / Math.PI : 90;
  const ultimos = w.filter((s) => s.t >= fin - 200);
  let rms = 0;
  if (ultimos.length >= 3) {
    const lx = ultimos.map((s) => dot([s.x, s.y, s.z], cara.r)), ts = ultimos.map((s) => (s.t - fin) / 1000);
    const n = ultimos.length, tm = ts.reduce((a, b) => a + b, 0) / n, lm = lx.reduce((a, b) => a + b, 0) / n;
    let stt = 0, stl = 0; for (let i = 0; i < n; i++) { stt += (ts[i] - tm) ** 2; stl += (ts[i] - tm) * (lx[i] - lm); }
    const b = stt > 0 ? stl / stt : 0; let ss = 0; for (let i = 0; i < n; i++) ss += (lx[i] - lm - b * (ts[i] - tm)) ** 2;
    rms = Math.sqrt(ss / n);
  }
  const recta = Math.min(rampa(angulo, ANGULO_LATERAL.bueno, ANGULO_LATERAL.malo), rampa(rms, DESVIO_LATERAL_M.bueno, DESVIO_LATERAL_M.malo));

  // 2. still accelerating at the release: the speed now against the peak speed of the swing (speeds read every 20 ms with the same line fit)
  let pico = rapidez;
  for (let k = 1; k <= 20; k++) {
    const v = velocidadDe(w, fin - k * 20, LECTURA_MS); if (!v) continue;
    pico = Math.max(pico, Math.hypot(v[0], v[1], v[2]));
  }
  const razon = pico > 0 ? rapidez / pico : 0;
  const aceleracion = clamp((razon - RAZON_ACELERACION.malo) / (RAZON_ACELERACION.bueno - RAZON_ACELERACION.malo), 0, 1);

  // 3. the speed of a real throw
  const velocidad = meseta(rapidez, BANDA_VELOCIDAD.cero0, BANDA_VELOCIDAD.pleno0, BANDA_VELOCIDAD.pleno1, BANDA_VELOCIDAD.cero1);

  // 4. a backswing: before the rearmost point (largest distance from the board) the hand went BACK from where it started
  let atras = 0, iMax = 0;
  const prof = w.map((s) => dot([s.x, s.y, s.z], cara.n));
  for (let i = 1; i < w.length; i++) if (prof[i] > prof[iMax]) iMax = i;
  if (iMax > 0 && fin - w[iMax].t > 30) atras = prof[iMax] - Math.min(...prof.slice(0, iMax));
  const retroceso = clamp(atras / RETROCESO_PLENO_M, 0, 1);

  const partes: Partes = { recta: r3(recta), aceleracion: r3(aceleracion), velocidad: r3(velocidad), retroceso: r3(retroceso) };
  const puntos = partes.recta * PESOS.recta + partes.aceleracion * PESOS.aceleracion + partes.velocidad * PESOS.velocidad + partes.retroceso * PESOS.retroceso;
  return { puntos: r3(clamp(puntos, 0, 1)), partes, muestras: w.length };
}

/** The help a score earns: grows with the score (linear), never above AYUDA_MAX. */
export const ayudaDe = (puntos: number): number => r3(AYUDA_MAX * clamp(puntos, 0, 1));

/** Which part of the gesture to tell the thrower about: the lowest weighted loss (null when it was a pro throw or nothing can be said). */
export function consejo(g: Gesto): keyof Partes | null {
  if (g.puntos >= 0.8 || g.muestras < 5) return null;
  let peor: keyof Partes | null = null, perdida = 0.04;
  for (const k of Object.keys(PESOS) as (keyof Partes)[]) { const p = (1 - g.partes[k]) * PESOS[k]; if (p > perdida) { perdida = p; peor = k; } }
  return peor;
}
