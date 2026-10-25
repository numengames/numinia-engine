// posproceso-politica (H12b): the pure rules of the extra effects' cost gate. No three.js, no DOM (tested in test/posproceso.test.ts).
// The effects run only on level A and only when asked; on top of that a per-frame cost gate watches the frames it draws and
// switches them off by itself if the machine cannot hold the target: 60 fps is the promise («activarlo no baja de 60 FPS»), so the
// gate trips when the average frame lasts more than `TOPE_MS` over a full window — a slow GPU gets its plain picture back, not a stutter.

/** The frame time above which the effects are dropped: 1000/50 ms (a little under 60 fps, so a 60 Hz screen's jitter does not trip it). */
export const TOPE_MS = 20;
/** Frames in the window the average is taken over (about a second and a half at 60 fps), and frames ignored after a change (shader compile). */
export const VENTANA = 90;
export const CALENTAR = 45;

export type Puerta = { alDibujar(dtMs: number, tope?: number): "sigue" | "apagar"; reiniciar(): void; media(): number; muestras(): number };

/** One gate: feed it the time of each frame drawn WITH effects; it answers «apagar» once, when the window's average is over the cap. */
export function crearPuerta(tope = TOPE_MS, ventana = VENTANA, calentar = CALENTAR): Puerta {
  let visto = 0, suma = 0, n = 0, ultima = 0;
  return {
    alDibujar(dtMs, topeAhora = tope) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) return "sigue";
      if (visto++ < calentar) return "sigue"; // the first frames pay for compiling the passes
      suma += Math.min(dtMs, 250); n++;          // a tab that slept for seconds is not the effects' fault: one frame counts as at most 250 ms
      if (n < ventana) return "sigue";
      const m = suma / n; ultima = m;
      suma = 0; n = 0;
      return m > topeAhora ? "apagar" : "sigue";
    },
    reiniciar() { visto = 0; suma = 0; n = 0; ultima = 0; },
    media: () => (n ? suma / n : ultima),
    muestras: () => n,
  };
}

/** What the extra passes need, by effect: the scene pass always; AO adds a depth+normal pre-pass (a second scene draw). Used to explain cost in the panel. */
export function pasadasExtra(e: { bloom: boolean; ao: boolean }): number {
  return (e.ao ? 2 : 0) + (e.bloom ? 1 : 0);
}
