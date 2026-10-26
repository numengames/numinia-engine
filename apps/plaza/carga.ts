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

/** C: the pieces of the world (models, images… within view distance) fill the stretch between the welcome and «listo». */
export const TRAMO_PIEZAS = { desde: ETAPAS.bienvenida, hasta: 0.97 } as const;

/** C: how many pieces of the world within view are ready out of how many there are (`total` 0 = none placed yet). */
export type Piezas = { listas: number; total: number; /** M16: bytes in of the bytes the manifest says the zone needs to play. */ bytes?: { listos: number; total: number } };

/** «3,2 de 8,1 MB»-style text for the loading screen: what is in (bytes) of what the zone needs to play. Empty without a manifest. */
export function textoBytes(listos: number, total: number): string {
  if (!(total > 0)) return "";
  const mb = (n: number) => (n / 1048576).toFixed(n >= 10 * 1048576 ? 0 : 1).replace(".", ",");
  return `${mb(Math.min(listos, total))} de ${mb(total)} MB`;
}

/** C: the text of the count — «120 de 146 piezas»; empty when there are none (a bare world says nothing). */
export function textoPiezas(p: Piezas | null): string {
  if (!p || p.total <= 0) return "";
  const listas = Math.max(0, Math.min(p.listas, p.total));
  const mb = p.bytes ? textoBytes(p.bytes.listos, p.bytes.total) : "";
  return `${listas} de ${p.total} ${p.total === 1 ? "pieza" : "piezas"}${mb ? ` · ${mb}` : ""}`;
}

/**
 * The fraction (0…1) after the steps in `hechas`: the furthest one reached; none = 0. With `piezas`, once the welcome is in,
 * the real count of ready pieces moves it from the welcome step up to TRAMO_PIEZAS.hasta (the last bit is the first frame).
 */
export function fraccionCarga(hechas: Iterable<Etapa>, piezas?: Piezas | null): number {
  let f = 0, conBienvenida = false;
  for (const e of hechas) { f = Math.max(f, ETAPAS[e] ?? 0); if (e === "bienvenida") conBienvenida = true; }
  if (piezas && piezas.total > 0 && conBienvenida && f < 1) {
    const r = Math.max(0, Math.min(1, piezas.listas / piezas.total));
    f = Math.max(f, TRAMO_PIEZAS.desde + (TRAMO_PIEZAS.hasta - TRAMO_PIEZAS.desde) * r);
  }
  return f;
}

/** The slice of the screen this needs: custom properties on its style, a class list and the label that says the percentage. */
export type PantallaMalla = {
  style: { setProperty(nombre: string, valor: string): void };
  classList: { add(clase: string): void };
  querySelector(selector: string): { textContent: string | null } | null;
  /** C: optional so a fake without it still works; the page's element has it. */
  querySelectorAll?(selector: string): { forEach(f: (e: { textContent: string | null }) => void): void };
};

/**
 * H4: the line-mesh loading screen, only for a world whose espacio base is on (`/status` says so: `espacioBase`). `activar()`
 * turns it on (class «eb»: CSS shows the SVG and hides the moon); `etapa()` moves the progress (CSS custom property `--p`,
 * 0…1: the lines are drawn from it by CSS alone, nothing runs per frame). Without `activar()` the old screen is untouched.
 */
export function crearProgresoMalla(el: PantallaMalla | null) {
  const hechas = new Set<Etapa>();
  let activa = false, ultima = -1, piezas: Piezas | null = null, textoAntes = "";
  const pintar = () => {
    if (!el) return;
    // C: «n de N piezas» on whichever screen is up (the moon's or the mesh's); only written when it changes
    const texto = textoPiezas(piezas);
    if (texto !== textoAntes) { textoAntes = texto; el.querySelectorAll?.(".c-piezas").forEach((t) => { t.textContent = texto; }); }
    if (!activa) return;
    const f = Math.max(ultima, fraccionCarga(hechas, piezas)); // the lines only ever go forward, even if a new piece joins the count
    if (f === ultima) return;
    ultima = f;
    el.style.setProperty("--p", String(f));
    const t = el.querySelector(".c-pct"); if (t) t.textContent = `${Math.round(f * 100)} %`;
  };
  return {
    activar(): void { if (!el || activa) return; activa = true; el.classList.add("eb"); pintar(); },
    etapa(e: Etapa): void { hechas.add(e); pintar(); },
    /** C: the count of ready pieces of the world within view (view.cargaMundo()). */
    piezas(p: Piezas): void { piezas = p; pintar(); },
    fraccion: () => fraccionCarga(hechas, piezas),
    activa: () => activa,
  };
}

/**
 * C: how long after `welcome` the screen gives up waiting for the world and goes anyway (a ground or a model that never builds
 * must not trap the player). It was 15 s when only the ground was awaited; now that every piece within view is awaited, 45 s.
 */
export const TOPE_CARGA_MS = 45000;

/**
 * B5: a ground is pending when the shared state asks for it (`activa` is not false, as `aplicar` reads it) and the view has not finished
 * building it yet (`activa` of the view's naturaleza / espacio base is true only once the last `aplicar` produced the real thing).
 * A world with neither answers false, so it behaves as before.
 */
export function sueloPendiente(o: { pideNaturaleza: boolean; pideBase: boolean; naturalezaLista: boolean; baseLista: boolean }): boolean {
  return (o.pideNaturaleza && !o.naturalezaLista) || (o.pideBase && !o.baseLista);
}

/** C: pieces still to be ready: models downloaded, textures uploaded and shaders compiled (view.cargaMundo()); a failed one counts as done. */
export const piezasPendientes = (p: Piezas | null | undefined): number => (p ? Math.max(0, p.total - p.listas) : 0);

export type EstadoCarga = "esperando" | "listo" | "tope";
export type EntradaCarga = { welcome: boolean; mundoRecibido: boolean; primerCuadro: boolean; sueloPendiente: boolean; piezasPendientes: number; msDesdeWelcome: number; topeMs?: number };

/**
 * C: where the loading screen stands. «listo» = `welcome` is in, a frame was drawn with the ground already built (`primerCuadro`: the
 * caller only says true for a frame that started with no ground pending) AND the world's things have arrived (`mundoRecibido`: the
 * server sends the welcome first and then, in the same burst, every thing near you — a frame between the two would count 0 pieces and
 * hide the screen on an empty world; the first snapshot after the welcome comes behind that whole burst, on the same ordered
 * socket) AND every piece within view is ready (`piezasPendientes` 0: pieces far away that proximity loading defers are not counted
 * by the caller). «tope» = `topeMs` passed since `welcome` with the
 * world still not whole: it goes anyway, and the caller says so in the log and the metrics. «esperando» otherwise.
 */
export function estadoCarga(o: EntradaCarga): EstadoCarga {
  if (!o.welcome) return "esperando";
  if (o.mundoRecibido && o.primerCuadro && !o.sueloPendiente && o.piezasPendientes <= 0) return "listo";
  if (o.msDesdeWelcome >= (o.topeMs ?? TOPE_CARGA_MS)) return "tope";
  return "esperando";
}

/** B5 + C: may the loading screen go? Whole world (see estadoCarga), or the cap. */
export function puedeOcultar(o: EntradaCarga): boolean {
  return estadoCarga(o) !== "esperando";
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
  /** C: «n de N piezas» of the world within view are ready (shown on the screen; the lines follow it). */
  piezas(p: Piezas): void { malla.piezas(p); },
  ocultar(): void {
    malla.etapa("listo");
    if (typeof document === "undefined") { hueco.ocultar(); return; }
    ocultarCarga(document.getElementById("carga") as unknown as ElementoCarga | null);
  },
};
