// MIS-200 (t_9687b5fc): «Entrar en VR» and «Entrar en AR» wait while the world still loads. The gate is the one the VR entry
// already uses (packages/render/src/index.ts: `loading > 0 || precompilar.pendientes() > 0`), NOT view.busy(): busy() holds
// permanent states (sound, near animations) and would never empty. The wait has a ceiling (6 s, as entrada-estable.ts):
// after it the buttons enable anyway, so a world that never settles cannot lock the entry. Sticky: once active, they stay
// active (a later model load must not grey the button out while you are about to press it).

/** How long the entry buttons may wait for the world before they enable anyway (the same 6 s as entrada-estable.ts). */
export const TECHO_LISTO_MS = 6000;

/** The text of a button that waits (announced in text; the colour alone says nothing). */
export const TEXTO_PREPARANDO = "Preparando…";
/** Why it waits: the button's tooltip and the line the page says when it is pressed too early. */
export const MOTIVO_PREPARANDO = "Preparando el mundo: la entrada se activa cuando termine de cargar.";

export type Listo = {
  /** Call on every tick with the world's gate (`cargando`) and a monotonic clock (ms). True once the entry may be offered; sticky. */
  actualizar(cargando: boolean, ahoraMs: number): boolean;
  readonly listo: boolean;
};

export function crearListo(techoMs: number = TECHO_LISTO_MS): Listo {
  let listo = false, inicio: number | null = null;
  return {
    get listo() { return listo; },
    actualizar(cargando, ahoraMs) {
      if (listo) return true;
      if (!cargando) { listo = true; return true; } // nothing loading (any more): the entry is offered
      inicio ??= ahoraMs; // the ceiling counts from the first moment the button had to wait
      if (ahoraMs - inicio >= techoMs) listo = true;
      return listo;
    },
  };
}

/** What a waiting entry button shows: its text, aria-disabled, and its tooltip (empty when it is active). */
export function aspectoBoton(listo: boolean, texto: string): { texto: string; ariaDisabled: boolean; titulo: string } {
  return listo ? { texto, ariaDisabled: false, titulo: "" } : { texto: TEXTO_PREPARANDO, ariaDisabled: true, titulo: MOTIVO_PREPARANDO };
}
