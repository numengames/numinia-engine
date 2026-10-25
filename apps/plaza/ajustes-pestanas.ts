// MIS-239: the settings window is ONE card with tabs (Juego, Interfaz, Controles, Gráficos, Sonido…), like a game's
// options menu; on a narrow screen (a phone) the same categories are folded sections — press a heading and it opens
// (accordion). Pure rules here (tested in test/ajustes-pestanas.test.ts); the DOM lives in menu-ajustes.ts.

/** Below this width (CSS px) the window is a phone's: the tabs become folded sections. Same number as tema.css. */
export const ANCHO_ACORDEON = 700;

export type ModoAjustes = "pestanas" | "acordeon";

/** Tabs on a screen wide enough; folded sections on a narrow one or on a phone/tablet profile (data-aparato="movil-…"). */
export const modoAjustes = (ancho: number, aparato: string): ModoAjustes => (ancho <= ANCHO_ACORDEON || aparato.startsWith("movil") ? "acordeon" : "pestanas");

/** The category open after pressing `pedida`: in tabs a tab press always opens it; in folded sections a press on the
 * open heading folds it again (""), and any other heading replaces the open one (one section open at a time). */
export const categoriaTrasPulsar = (modo: ModoAjustes, abierta: string, pedida: string): string => (modo === "acordeon" && abierta === pedida ? "" : pedida);

/** The category shown when the window opens or the mode changes: tabs always have one selected (the first with
 * settings); folded sections start folded so the headings are all in view. */
export const categoriaInicial = (modo: ModoAjustes, conAjustes: readonly string[], actual: string): string => {
  if (modo === "acordeon") return conAjustes.includes(actual) ? actual : "";
  return conAjustes.includes(actual) ? actual : conAjustes[0] ?? "";
};

/** Arrow keys on the tab strip (roving focus, WAI-ARIA tabs): which tab gets the focus. Vertical strip on a wide
 * screen (↑ ↓), but ← → work too; Home/End jump to the ends; anything else is not ours (null). */
export function pestanaSiguiente(ids: readonly string[], actual: string, tecla: string): string | null {
  if (!ids.length) return null;
  const i = Math.max(0, ids.indexOf(actual));
  if (tecla === "ArrowDown" || tecla === "ArrowRight") return ids[(i + 1) % ids.length];
  if (tecla === "ArrowUp" || tecla === "ArrowLeft") return ids[(i - 1 + ids.length) % ids.length];
  if (tecla === "Home") return ids[0];
  if (tecla === "End") return ids[ids.length - 1];
  return null;
}

/** Which categories show their settings: with a search typed every category that has a match shows (the strip
 * and the headings keep working); without one only the open category does. */
export const categoriaVisible = (cat: string, abierta: string, buscando: boolean): boolean => buscando || cat === abierta;
