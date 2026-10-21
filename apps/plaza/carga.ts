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

/**
 * H4: what has really happened on the way to the first frame, in order, and how much of the wait each step stands for. The
 * mesh of an espacio-base world is drawn to this fraction. The weights are an estimate of the usual wait (the page's code and
 * the 3D view are the long part); the screen only ever moves forward, and the last step is the first frame itself.
 */
export const ETAPAS = { codigo: 0.1, estado: 0.25, vista: 0.55, bienvenida: 0.8, mundo: 0.93, listo: 1 } as const;
export type Etapa = keyof typeof ETAPAS;

/** The fraction (0…1) after the steps in `hechas`: the furthest one reached; none = 0. */
export function fraccionCarga(hechas: Iterable<Etapa>): number {
  let f = 0;
  for (const e of hechas) f = Math.max(f, ETAPAS[e] ?? 0);
  return f;
}

/** The slice of the screen this needs: custom properties on its style, a class list and the label that says the percentage. */
export type PantallaMalla = {
  style: { setProperty(nombre: string, valor: string): void };
  classList: { add(clase: string): void };
  querySelector(selector: string): { textContent: string | null } | null;
};

/**
 * H4: the line-mesh loading screen, only for a world whose espacio base is on (`/status` says so: `espacioBase`). `activar()`
 * turns it on (class «eb»: CSS shows the SVG and hides the moon); `etapa()` moves the progress (CSS custom property `--p`,
 * 0…1: the lines are drawn from it by CSS alone, nothing runs per frame). Without `activar()` the old screen is untouched.
 */
export function crearProgresoMalla(el: PantallaMalla | null) {
  const hechas = new Set<Etapa>();
  let activa = false, ultima = -1;
  const pintar = () => {
    if (!el || !activa) return;
    const f = fraccionCarga(hechas);
    if (f === ultima) return;
    ultima = f;
    el.style.setProperty("--p", String(f));
    const t = el.querySelector(".c-pct"); if (t) t.textContent = `${Math.round(f * 100)} %`;
  };
  return {
    activar(): void { if (!el || activa) return; activa = true; el.classList.add("eb"); pintar(); },
    etapa(e: Etapa): void { hechas.add(e); pintar(); },
    fraccion: () => fraccionCarga(hechas),
    activa: () => activa,
  };
}

/** B5: how long after `welcome` the screen gives up waiting for the ground and goes anyway (a ground that never builds must not trap the player). */
export const TOPE_CARGA_MS = 15000;

/**
 * B5: a ground is pending when the shared state asks for it (`activa` is not false, as `aplicar` reads it) and the view has not finished
 * building it yet (`activa` of the view's naturaleza / espacio base is true only once the last `aplicar` produced the real thing).
 * A world with neither answers false, so it behaves as before.
 */
export function sueloPendiente(o: { pideNaturaleza: boolean; pideBase: boolean; naturalezaLista: boolean; baseLista: boolean }): boolean {
  return (o.pideNaturaleza && !o.naturalezaLista) || (o.pideBase && !o.baseLista);
}

/**
 * B5: may the loading screen go? Yes once `welcome` is in, a frame was drawn with the ground already built (`primerCuadro`: the
 * caller only says true for a frame that started with no ground pending) — or whatever the state, once `tope` ms passed since `welcome`.
 */
export function puedeOcultar(o: { welcome: boolean; primerCuadro: boolean; sueloPendiente: boolean; msDesdeWelcome: number; topeMs?: number }): boolean {
  if (!o.welcome) return false;
  if (o.msDesdeWelcome >= (o.topeMs ?? TOPE_CARGA_MS)) return true;
  return o.primerCuadro && !o.sueloPendiente;
}

const hueco = { ocultar() {} };
const malla = crearProgresoMalla(typeof document === "undefined" ? null : (document.getElementById("carga") as unknown as PantallaMalla | null));

/** The handle main.ts calls once the session says "welcome" and the first frame is drawn. */
export const carga = {
  /** H4: `/status` said the world has an espacio base: draw the mesh instead of the moon. */
  espacioBase(): void { malla.activar(); },
  /** H4: is this the mesh screen (so main.ts only looks at the espacio base while it waits)? */
  conMalla(): boolean { return malla.activa(); },
  /** H4: a step of the real load is done (the mesh draws itself up to it; no effect on other worlds). */
  etapa(e: Etapa): void { malla.etapa(e); },
  ocultar(): void {
    malla.etapa("listo");
    if (typeof document === "undefined") { hueco.ocultar(); return; }
    ocultarCarga(document.getElementById("carga") as unknown as ElementoCarga | null);
  },
};
