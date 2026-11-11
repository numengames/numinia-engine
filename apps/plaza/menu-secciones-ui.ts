// menu-secciones-ui (v2 paridad): the computer's and the phone's buttons take their icon, name and tooltip from the world's
// one list of sections (packages/render/src/menu-secciones.ts) — the same list the VR menu reads — instead of each file
// writing its own. Only the glyph and the words change here; ids, handlers and `hidden` rules stay where they were.
import { icono } from "./iconos.ts";
import { fijarIdiomaEfectivo, fijarTeclaEfectiva, iconoDe, nombreDe, tituloDe } from "../../packages/render/src/menu-secciones.ts";
import { teclas } from "./teclas.ts";
import { alCambiarIdioma, idiomaActivo } from "../../packages/feature/src/idioma.ts";

// Keymap v1: the key a tooltip names is the one in effect (Yours if set, else the Default), and the tooltips follow a change at once.
const ACCION_DE_SECCION: Record<string, string> = { tu: "ficha", gente: "gente", bolsa: "bolsa", misiones: "misiones", mapa: "mapa", construir: "construir", ajustes: "menu", micro: "microfono", foto: "camara", camara: "camara", grabar: "grabar", avisos: "avisos", menu: "menu", teclas: "ayuda", interactuar: "usar" };
fijarTeclaEfectiva((id) => (ACCION_DE_SECCION[id] ? teclas.etiqueta(ACCION_DE_SECCION[id]) : undefined));
fijarIdiomaEfectivo(idiomaActivo); // the bar speaks the language in effect (stored choice > the world's > the browser's > English)
const rotulados = new Map<HTMLElement, { id: string; o: { visible?: boolean; px?: number; extra?: string } }>();
teclas.alCambiar(() => { for (const [b, r] of rotulados) { if (b.isConnected) b.title = tituloDe(r.id); else rotulados.delete(b); } });
// the language changes: every bar button is written again (a button that was given other words by its owner is rewritten by its owner)
alCambiarIdioma(() => { for (const [b, r] of rotulados) { if (b.isConnected) rotularBoton(b, r.id, r.o); else rotulados.delete(b); } });

/** Fills a bar button for section `id`: its icon, its name for screen readers (or visible with `visible`) and «Nombre (K)». */
export function rotularBoton(b: HTMLElement, id: string, o: { visible?: boolean; px?: number; extra?: string } = {}): void {
  const nombre = nombreDe(id);
  // constants only: the icon is a fixed house glyph and the name comes from the list in code
  b.innerHTML = `${icono(iconoDe(id), o.px)}<span class="${o.visible ? "" : "solo-lector"}">${nombre}</span>${o.extra ?? ""}`;
  b.title = tituloDe(id);
  rotulados.set(b, { id, o });
}
