// «Qué hay de nuevo» (t_bdc2c2db): once per engine version this browser hasn't seen, the 3 latest diary lines (baked in
// by tools/novedades-generar.mjs into ./novedades-datos.ts). ux2-barra: no card over the top-left corner any more (it
// covered your character's card) — the news is a notice in the bell's history (avisos.ts), whole and unread, so the
// bell shows its count; nothing is laid over the world when it arrives. Reading it (opening the bell) remembers the
// version in localStorage: it never comes back for the same one.
import { items } from "./novedades-datos.ts";
import { avisoDeNovedades, debeMostrarNovedades } from "../../packages/client/src/novedades.ts";
import { avisoFijo } from "./avisos.ts";

const GUARDA = "numinia.novedades.version";

/** Puts the news in the bell's history if `versionActual` (the running page's semantic version) is new to this browser.
 * Safe to call with no items (nothing to say), before or after the bell exists (avisos.ts queues it). */
export function montarNovedades(versionActual: string): void {
  if (!items.length) return;
  let vista: string | null = null;
  try { vista = localStorage.getItem(GUARDA); } catch { /* private mode: every time, nothing to remember */ }
  if (!debeMostrarNovedades(versionActual, vista)) return;
  const aviso = avisoDeNovedades(versionActual, items);
  if (!aviso) return;
  avisoFijo({ ...aviso, tipo: "novedades", alLeer: () => { try { localStorage.setItem(GUARDA, versionActual); } catch { /* private mode */ } } });
}
