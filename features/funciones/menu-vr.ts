// menu-vr — the «Este mundo» block of the VR menu's Ajustes as data (funciones/v3). PURE: no DOM, no clock, no I/O. It REUSES
// panel.ts as it is (the rows, their order, who sees them, «Lo fija el servidor.» and every word come from there, in the
// same language as the computer's Entorno block); this file only shapes each row for the VR menu's list: a heading row,
// then one row per function with a button that says the state and is off («desactivado») when the server fixes it.
// The page (apps/plaza/xr-menu.ts) draws these rows and asks the server (`ponerFuncion`) when a button is pressed.
import { filasFunciones, tituloGrupo } from "./panel.ts";
import type { EntradaPanel } from "./panel.ts";
import type { Funcion } from "./feature.ts";

export type FilaVR = {
  /** «encabezado» is the heading row (no button); «funcion» is a switch row; «nota» is a line of its own under it (no button). */
  tipo: "encabezado" | "funcion" | "nota";
  funcion?: Funcion;
  texto: string;
  /** The function's first line under its name (its help); undefined when it has none. A second line («Lo fija el servidor.») gets a «nota» row: a row's detail is cut at ~65 letters and the two together would not fit. */
  detalle?: string;
  /** The button's words (the state, as panel.ts says it, with a capital); none on the heading. */
  boton?: string;
  /** The button's look: filled when the function is on, outlined when off, «desactivado» when the server fixes it. */
  estilo?: "accion" | "normal" | "desactivado";
  /** True when pressing it asks the server (you may build and the server does not fix it). */
  pulsable: boolean;
  /** What to ask the server when it is pressed: the opposite of the state the server shows. */
  quiero?: boolean;
};

const mayuscula = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The rows of «Este mundo» for the VR menu: [] when the world has no switches or you may not build (the block is not shown), otherwise the heading and one row per function, in panel.ts's order. Never throws. */
export function filasEsteMundoVR(e: EntradaPanel, idioma: unknown = "es"): FilaVR[] {
  const filas = filasFunciones(e, idioma);
  if (!filas.length) return [];
  const fuera: FilaVR[] = [{ tipo: "encabezado", texto: "Este mundo", detalle: tituloGrupo(idioma), pulsable: false }];
  for (const f of filas) {
    fuera.push({
      tipo: "funcion", funcion: f.funcion, texto: f.etiqueta, detalle: f.notas[0],
      boton: mayuscula(f.estado), estilo: !f.pulsable ? "desactivado" : f.activa ? "accion" : "normal", pulsable: f.pulsable, quiero: !f.activa,
    });
    for (const n of f.notas.slice(1)) fuera.push({ tipo: "nota", funcion: f.funcion, texto: n, pulsable: false });
  }
  return fuera;
}
