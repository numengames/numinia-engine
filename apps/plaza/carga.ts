// MVL3 step 1: the 2D "Cargando" screen (moon + running dots) is plain HTML + CSS in index.html, so it
// paints before any script runs — no black flash while the engine boots. This file only gives main.ts a
// typed handle to fade it out once the first frame is drawn. The 3D build-up sequence for heavy loads
// (the fractals from the mock-up) is a later step, out of scope here.

/** The slice of a real DOM element this module needs — kept narrow so a unit test can fake it without jsdom. */
export type ElementoCarga = {
  hidden: boolean;
  classList: { add(clase: string): void };
  addEventListener(tipo: "transitionend", escucha: () => void, opciones?: { once?: boolean }): void;
};

/**
 * Starts the fade (adds "ida", which CSS turns into an opacity transition) and hides the element for good
 * once the transition ends — or after `esperaMs` regardless, so a browser that skips transitionend (a test
 * page, `prefers-reduced-motion`, a tab that was never visible) never leaves the screen stuck on top of the
 * world. Calling it twice, or on an already-hidden screen, does nothing the second time.
 */
export function ocultarCarga(el: ElementoCarga | null, esperaMs = 700, ponerTimeout: (fn: () => void, ms: number) => void = setTimeout): void {
  if (!el || el.hidden) return;
  el.classList.add("ida");
  let hecho = false;
  const listo = () => { if (hecho) return; hecho = true; el.hidden = true; };
  el.addEventListener("transitionend", listo, { once: true });
  ponerTimeout(listo, esperaMs);
}

const hueco = { ocultar() {} };

/** The handle main.ts calls once the session says "welcome" and the first frame is drawn. */
export const carga = {
  ocultar(): void {
    if (typeof document === "undefined") { hueco.ocultar(); return; }
    ocultarCarga(document.getElementById("carga") as unknown as ElementoCarga | null);
  },
};
