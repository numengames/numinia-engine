// menu-secciones-ui (v2 paridad): the computer's and the phone's buttons take their icon, name and tooltip from the world's
// one list of sections (packages/render/src/menu-secciones.ts) — the same list the VR menu reads — instead of each file
// writing its own. Only the glyph and the words change here; ids, handlers and `hidden` rules stay where they were.
import { icono } from "./iconos.ts";
import { iconoDe, nombreDe, tituloDe } from "../../packages/render/src/menu-secciones.ts";

/** Fills a bar button for section `id`: its icon, its name for screen readers (or visible with `visible`) and «Nombre (K)». */
export function rotularBoton(b: HTMLElement, id: string, o: { visible?: boolean; px?: number; extra?: string } = {}): void {
  const nombre = nombreDe(id);
  // constants only: the icon is a fixed house glyph and the name comes from the list in code
  b.innerHTML = `${icono(iconoDe(id), o.px)}<span class="${o.visible ? "" : "solo-lector"}">${nombre}</span>${o.extra ?? ""}`;
  b.title = tituloDe(id);
}
