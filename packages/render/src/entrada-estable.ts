// MIS-200 (t_04ada0ed): when does the VR extras (panel, hands, watch, bubble) start to show after entering? Not on the
// first frame: the world is already drawn, but the first frames of a session stop to compile and upload. This waits for
// a few frames in a row near the headset's own period, and for the world's loading work to be over (with a ceiling, so a
// world that never settles still gets its panel). Pure: no THREE, no DOM; the caller gives it the clock.

export type OpcionesEstable = {
  /** The headset's frame period in ms (1000 / frameRate); 13.9 (72 Hz) when unknown. */
  periodoMs?: number;
  /** A frame is calm when it took less than `factor` × the period since the previous one. */
  factor?: number;
  /** Calm frames in a row needed. */
  necesarios?: number;
  /** Ceiling: after this many ms in the session the extras show anyway. */
  maxMs?: number;
  /** True while the world still has loading work pending (view's `loading` / compile queue). */
  ocupado?: () => boolean;
};

export type Estable = {
  /** Call once per presented frame with a monotonic clock (ms). True from the frame the extras may show; sticky. */
  fotograma(ahoraMs: number): boolean;
  readonly listo: boolean;
  /** Back to the start (a new session). */
  reiniciar(): void;
};

export function crearEstable(o: OpcionesEstable = {}): Estable {
  const periodo = o.periodoMs && o.periodoMs > 0 ? o.periodoMs : 1000 / 72;
  const limite = (o.factor ?? 1.5) * periodo, hacen = o.necesarios ?? 3, techo = o.maxMs ?? 6000;
  let previo: number | null = null, inicio: number | null = null, seguidos = 0, listo = false;
  return {
    get listo() { return listo; },
    reiniciar() { previo = inicio = null; seguidos = 0; listo = false; },
    fotograma(ahora) {
      if (listo) return true;
      inicio ??= ahora;
      if (previo !== null) seguidos = ahora - previo < limite ? seguidos + 1 : 0; // the first frame has no period to judge
      previo = ahora;
      let trabajo = false; try { trabajo = !!o.ocupado?.(); } catch { /* a broken probe must not hold the panel back */ }
      if ((seguidos >= hacen && !trabajo) || ahora - inicio >= techo) listo = true;
      return listo;
    },
  };
}
