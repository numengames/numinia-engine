// destellos — the flash limiter (V7, WCAG 2.3.1): whatever asks for a flash (a blow, a light column, a fire, a particle
// burst), ask this first. At most DESTELLOS_POR_S_MAX flashes may START in any sliding window of one second. Pure: the
// clock is injected, nothing here reads the page, the simulation or the wire. One limiter per screen, shared by every
// asker, so two features that each stay under 3/s cannot add up to 6/s.
/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const DESTELLOS_POR_S_MAX = 3;
/** The sliding window (ms). */
export const VENTANA_MS = 1000;

export type LimitadorDestellos = {
  /** Ask for a flash at the current time: true = go ahead (it is counted), false = skip it (nothing is counted). */
  pedir: () => boolean;
  /** Would a flash be allowed now? Does not count it. */
  puede: () => boolean;
  /** Flashes counted in the current window. */
  enVentana: () => number;
};

/** `max` is clamped to 1..DESTELLOS_POR_S_MAX: a caller can be stricter than the rule, never looser. */
export function crearLimitadorDestellos(reloj: () => number = Date.now, max: number = DESTELLOS_POR_S_MAX): LimitadorDestellos {
  const tope = Math.max(1, Math.min(DESTELLOS_POR_S_MAX, Math.floor(max) || DESTELLOS_POR_S_MAX));
  const inicios: number[] = [];
  const purgar = (ahora: number): void => {
    // a clock that goes back (a clock change) forgets the past instead of blocking for hours
    if (inicios.length && ahora < inicios[inicios.length - 1]!) inicios.length = 0;
    while (inicios.length && ahora - inicios[0]! >= VENTANA_MS) inicios.shift();
  };
  return {
    pedir: () => {
      const ahora = reloj();
      purgar(ahora);
      if (inicios.length >= tope) return false;
      inicios.push(ahora);
      return true;
    },
    puede: () => { purgar(reloj()); return inicios.length < tope; },
    enVentana: () => { purgar(reloj()); return inicios.length; },
  };
}
