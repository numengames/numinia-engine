// «Qué hay de nuevo» (t_bdc2c2db): once per engine version this browser hasn't seen, a short card with the 3
// latest diary lines (baked in by tools/novedades-generar.mjs into ./novedades-datos.ts). Closes itself (button,
// Escape — the <dialog> does that), remembers the version in localStorage, never shows twice for the same one.
import { version, items } from "./novedades-datos.ts";
import { debeMostrarNovedades } from "../../packages/client/src/novedades.ts";

const GUARDA = "numinia.novedades.version";

/** Shows the card if `versionActual` (the running page's semantic version) is new to this browser. Safe to call
 * even with no items (nothing to show) or without the dialog in the page (older cached HTML). */
export function montarNovedades(versionActual: string): void {
  if (!items.length) return;
  let vista: string | null = null;
  try { vista = localStorage.getItem(GUARDA); } catch { /* private mode: show every time, nothing to remember */ }
  if (!debeMostrarNovedades(versionActual, vista)) return;
  const dialog = document.getElementById("novedades") as HTMLDialogElement | null;
  if (!dialog) return;
  const titulo = document.getElementById("novedades-titulo");
  const lista = document.getElementById("novedades-lista");
  const cerrar = document.getElementById("novedades-cerrar");
  if (!titulo || !lista || !cerrar) return;
  titulo.textContent = `Novedades en v${versionActual}`;
  lista.replaceChildren(...items.map((t) => { const li = document.createElement("li"); li.textContent = t; return li; }));
  const recordar = () => { try { localStorage.setItem(GUARDA, versionActual); } catch { /* private mode */ } };
  dialog.addEventListener("close", recordar, { once: true });
  cerrar.addEventListener("click", () => dialog.close(), { once: true });
  for (const t of ["pointerdown", "wheel"]) dialog.addEventListener(t, (e) => e.stopPropagation()); // not the joystick or the camera
  dialog.showModal();
}
