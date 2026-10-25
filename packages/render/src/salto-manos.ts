// MIS-200 card t_8d0bc2dd: jump with bare hands = both wrists flicked UP at the same moment (the reference games' way).
// Pure: the hands module feeds it each wrist's height (metres, in the rig's frame so the avatar's own jumps and walking
// add nothing) with a clock in ms, and it answers true on the frame the gesture completes. No three.js, no browser.
//
// Why these numbers (a real headset was NOT used to tune them; they are a first pass to adjust on a Quest):
//  · SALTO_SUBE_MS 1.8 m/s: a deliberate flick moves a wrist ~0.3-0.4 m in ~0.2 s (peak 3+ m/s, ~2.5 averaged over the
//    window below); walking arm swing and reaching for things stay under ~1.2 m/s, a slow raise (0.4 m in 1 s) is 0.4 m/s.
//  · SALTO_VENTANA_MS 100: velocity is the rise over the last ~100 ms, not frame to frame — a tracker slower than the
//    renderer repeats poses (two neighbouring frames read 0), and a stalled frame must not read as a flick.
//  · SALTO_RECARGA_MS 0.6 m/s: hysteresis. After a jump nothing fires again until BOTH wrists have slowed below this
//    (held up, or coming down), so a raised arm or its return swing is not a second jump.
//  · SALTO_ESPERA_MS 350: even re-armed, no two jumps closer than this (the arms' bounce at the top of a flick).
//  · SALTO_MAX_MS 10 m/s: a sample-to-sample speed faster than any arm moves = a tracking glitch (teleporting joint): the
//    read starts over and needs a calm moment to re-arm, it is never a jump.

/** Both wrists must each rise at least this fast (m/s) at once. */
export const SALTO_SUBE_MS = 1.8;
/** Both wrists must slow below this (m/s, rising) after a jump before the next can fire. */
export const SALTO_RECARGA_MS = 0.6;
/** Span of samples a velocity is read over (ms). */
export const SALTO_VENTANA_MS = 100;
/** Least time between two jumps (ms). */
export const SALTO_ESPERA_MS = 350;
/** Faster than this (m/s) is tracking noise, never a hand. */
export const SALTO_MAX_MS = 10;
/** Least span of samples (ms) to trust a velocity. */
const SPAN_MIN_MS = 40;
/** A gap this long between the last two samples (a stalled frame, a tracker that paused) is no reading: a flick is not seen through it. */
export const SALTO_HUECO_MS = 150;

type Muestra = { t: number; y: number };

export function crearSaltoManos() {
  const hist: [Muestra[], Muestra[]] = [[], []];
  let armado = false, ultimo = -Infinity;

  /** Rise rate (m/s) of one wrist over the last SALTO_VENTANA_MS, or null with too little history. */
  function velocidad(h: Muestra[], t: number): number | null {
    while (h.length > 2 && t - h[1].t >= SALTO_VENTANA_MS) h.shift(); // keep one sample at/older than the window start
    const a = h[0], b = h[h.length - 1];
    if (h.length < 2 || b.t - a.t < SPAN_MIN_MS || b.t - h[h.length - 2].t > SALTO_HUECO_MS) return null;
    return ((b.y - a.y) / (b.t - a.t)) * 1000;
  }

  return {
    /** One frame: `t` in ms, each wrist's height in metres (rig frame) or null when that hand is not tracked / is busy.
     *  true exactly on the frame both wrists rise fast together. */
    muestra(t: number, izq: number | null, der: number | null): boolean {
      const ys = [izq, der];
      for (let k = 0; k < 2; k++) {
        const y = ys[k];
        if (y === null || !Number.isFinite(y)) { hist[k].length = 0; armado = false; continue; } // a hand gone: start over, re-arm only once both read slow
        const h = hist[k], ult = h[h.length - 1];
        if (ult && t > ult.t && (Math.abs(y - ult.y) / (t - ult.t)) * 1000 > SALTO_MAX_MS) { h.length = 0; armado = false; } // a joint that teleported: start over
        h.push({ t, y });
      }
      if (izq === null || der === null || !Number.isFinite(izq) || !Number.isFinite(der)) return false;
      const vi = velocidad(hist[0], t), vd = velocidad(hist[1], t);
      if (vi === null || vd === null) return false;
      if (!armado) { if (vi < SALTO_RECARGA_MS && vd < SALTO_RECARGA_MS) armado = true; return false; }
      if (vi >= SALTO_SUBE_MS && vd >= SALTO_SUBE_MS && t - ultimo >= SALTO_ESPERA_MS) { ultimo = t; armado = false; return true; }
      return false;
    },
    /** Forget everything (leaving VR, a panel opening): the next jump needs a calm read first. */
    reiniciar(): void { hist[0].length = 0; hist[1].length = 0; armado = false; },
  };
}
