// ONE close control for every panel, card and dialog of the page (Pablo, 2026-11-11: «que salga una X con el Close …
// siempre sea igual»): an X icon, the word «Close» and, on a keyboard device, a small «Esc» key cap. No «Close (J)» or
// «Close (Esc)» variants: Escape is taken for granted, and a panel's own letter still works (it stays in aria-keyshortcuts).
//
//   pintarCerrar(boton, { tecla? })   paints an existing <button> (its classes and listeners stay) as THE close control
//   botonCerrar(doc?, tecla?)         a new <button type=button class="cerrar cierre"> already painted
//   hayAlgoAbierto(fuera?)            some closable thing is on screen (an open <dialog>, a visible close control, the
//                                     conversation's «Goodbye», an open menu): Escape belongs to it, not to build mode
import { icono } from "./iconos.ts";
import { perfil } from "./perfil-aparato.ts";
import { alCambiarIdioma, tx } from "../../packages/feature/src/idioma.ts";
import { esMovil } from "../../packages/client/src/movil.ts"; // a phone names no key

void import("./cerrar-estilo.ts").catch(() => null); // the look (cerrar.css) is a side chunk; under node there is no CSS and it does not matter

export const rotuloCerrar = (): string => tx("Close", "Cerrar");

/** Paints `b` as the house close control. Safe on the tests' fake elements (they keep a plain text label). */
export function pintarCerrar<B extends HTMLElement>(b: B, o: { tecla?: string | (() => string) } = {}): B {
  const pintar = (): void => {
    const t = rotuloCerrar(), k = typeof o.tecla === "function" ? o.tecla() : o.tecla, teclas = k ? `${k} Escape` : "Escape";
    try {
      b.classList.add("cierre");
      let movil = false;
      try { movil = esMovil(perfil().clase); } catch { /* no device profile (tests) */ }
      b.innerHTML = `${icono("x", 16)}<span class="cierre-texto">${t}</span>${movil ? "" : "<kbd class=\"cierre-tecla\" aria-hidden=\"true\">Esc</kbd>"}`;
      b.setAttribute("aria-label", t);
      b.setAttribute("aria-keyshortcuts", teclas);
      b.title = t;
    } catch { b.textContent = t; }
  };
  alCambiarIdioma(pintar); // runs now too
  return b;
}

export function botonCerrar(doc: Document = document, tecla?: string): HTMLButtonElement {
  const b = doc.createElement("button"); b.type = "button"; b.className = "cerrar";
  return pintarCerrar(b, { tecla });
}

/** Something closable is on screen outside `fuera` (e.g. the builder's own panel): an open dialog, a visible close
 * control, the conversation's «Goodbye», an open menu. Escape closes that first; only with nothing open does it reach
 * the mode below (build mode leaves). */
export function hayAlgoAbierto(fuera?: Element | null, doc: Document = document): boolean {
  let lista: Element[] = [];
  try { lista = [...doc.querySelectorAll("dialog[open], .cierre, .adios, [role=menu]")]; } catch { return false; }
  return lista.some((x) => {
    if (fuera && fuera.contains(x)) return false;
    if (x.tagName === "DIALOG") return true;
    const h = x as HTMLElement;
    if (typeof h.checkVisibility === "function") return h.checkVisibility();
    return h.getClientRects().length > 0;
  });
}
