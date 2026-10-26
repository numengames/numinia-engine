// gente-comun (ux2-gente): what the «Gente» panel (gente.ts) and the card in the world (gente-tarjeta.ts) share — the
// person as both show them, the actions, the portrait (or a silhouette, never a hole) and a button with an icon.
// innerHTML only ever receives the house icons (constants); every name goes in with textContent.
import { icono } from "./iconos.ts";
import { rotularBoton } from "./menu-secciones-ui.ts"; // v2 paridad: icon, name and tooltip from the one list of sections
import type { Amigo } from "./amigos.ts";
import type { IAPublica } from "../../features/ia/feature.ts";

export type Res = { ok: boolean; why?: string };
/** What the page knows about someone near (main.ts wires it from the render, the avatars, fishing and the moves). */
export type Mirada = {
  /** The house avatar they wear (its catalogue id and name), or null (an uploaded one, or unknown). */
  avatar(quien: number): { id: string; nombre: string } | null;
  /** Metres from you, or null when the page does not know where they are. */
  distancia(quien: number): number | null;
  /** What they are doing, in a few words («Pescando»), or null. */
  actividad(quien: number): string | null;
  /** The name over their head (the chat's names: who the page draws near). */
  nombre(quien: number): string | null;
  /** Does this person hold the Director's staff (features/baculo)? A badge shows next to their name. */
  baculo?(quien: number): boolean;
  /** The name of the voice bubble they are in (features/burbujas), or null: an icon shows next to their name. */
  burbuja?(quien: number): string | null;
};
/** The voice-bubble icon (a microphone): the mark next to the name of whoever is inside one. The label says which. */
export const insigniaBurbuja = (etiqueta: string): HTMLElement => {
  const s = el("span", { className: "insignia-burbuja", title: `En ${etiqueta}: solo se oyen con los de dentro` });
  s.setAttribute("role", "img"); s.setAttribute("aria-label", `En ${etiqueta}`);
  s.innerHTML = icono("microphone", 14); // constants only
  return s;
};
/** The staff badge (a medal): the small mark next to the name of whoever holds the Director's staff. */
export const insigniaBaculo = (): HTMLElement => {
  const s = el("span", { className: "insignia-baculo", title: "Tiene el báculo: dirige la partida" });
  s.setAttribute("role", "img"); s.setAttribute("aria-label", "Tiene el báculo");
  s.innerHTML = icono("medal", 14); // constants only
  return s;
};
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};
/** The light on an AI's card: a dot and «Escuchando ahora» / «No escucha ahora» (S16's words; the server's `atenta`). */
/** t_5096d6f4: «Ojos  ✦ Modelo grande» — the glyph (the eye shape of the avatar) on a dark chip in the step's colour, the size in words, and with `explicar` the sentence that says what the eyes mean. Never the model's name. */
export const ojosEl = (o: { etiqueta: string; nombre: string; glifo: string; color: string; texto: string; tamano: string }, explicar = false): HTMLParagraphElement => {
  const glifo = el("span", { className: "ojo-glifo", textContent: o.glifo });
  glifo.style.color = o.color; glifo.setAttribute("aria-hidden", "true");
  const p = el("p", { className: "ia-dato ojos", title: o.texto }, el("span", { className: "k", textContent: o.etiqueta }), glifo, el("b", { textContent: o.nombre }));
  p.dataset.tamano = o.tamano;
  if (explicar) p.append(el("small", { className: "ojos-texto", textContent: o.texto }));
  return p;
};
export const luzEl = (luz: { escucha: boolean; texto: string }): HTMLParagraphElement =>
  el("p", { className: `ia-dato luz${luz.escucha ? " escucha" : ""}` }, el("span", { className: "punto" }), el("b", { textContent: luz.texto }));
/** A button with a house icon and a text (the icon is a constant; the text a text node). */
export const botonCon = (ic: string, texto: string, clase = "", px = 18): HTMLButtonElement => {
  const b = el("button", { type: "button", className: clase });
  b.innerHTML = icono(ic, px); // constants only
  b.append(el("span", { textContent: texto }));
  return b;
};

/** Someone the panel or the card shows: connected (quien) or a friend not here now (quien null). */
/** `ia` is set when the server says this player is an AI (features/ia): the list, the sheet and the card then show the AI's own content. */
export type Elegido = { quien: number | null; nombre: string; huella?: string; avatar: { id: string; nombre: string } | null; ia?: IAPublica | null };

/** A portrait: the house avatar's picture (busto / cuerpo) or a neutral silhouette, never a hole. */
export function retrato(base: string, avatar: { id: string } | null, modo: "busto" | "cuerpo", px: number, apagado = false): HTMLElement {
  const caja = el("div", { className: `retrato ${modo}${apagado ? " apagado" : ""}` });
  caja.setAttribute("aria-hidden", "true");
  const silueta = () => { caja.classList.add("silueta"); caja.innerHTML = icono("user", Math.round(px * (modo === "busto" ? 0.6 : 0.42))); }; // constants only
  if (!avatar?.id || !/^[a-z0-9-]+$/.test(avatar.id)) { silueta(); return caja; }
  const img = el("img", { alt: "", src: `${base}${avatar.id}-${modo}.webp`, decoding: "async" });
  img.addEventListener("error", silueta, { once: true });
  caja.append(img);
  return caja;
}

export type Acciones = {
  esAmigo(p: Elegido): Amigo | undefined; silenciado(p: Elegido): boolean; bloqueado(p: Elegido): boolean;
  ir(p: Elegido): Res; mensaje(p: Elegido): Res; saludar(p: Elegido): Res; anadir(p: Elegido): Res; quitar(p: Elegido): Res;
  silenciar(p: Elegido): Res; bloquear(p: Elegido): Res; denunciar(p: Elegido): void; verFicha(p: Elegido): void;
  /** ia-llamar S11: «Hablar con ella» — open the box to call this AI (the notice first, once per browser); `puedeHablar` = the AI takes calls by button now. */
  puedeHablar?(p: Elegido): boolean; hablar?(p: Elegido): Res;
};


/** The bar's «Gente» button: icon, name and tooltip from the one list of sections, placed before «Foto» when that one is in the bar. */
export function crearBotonGente(barra: HTMLElement | null): HTMLButtonElement {
  const boton = el("button", { type: "button", id: "gente-abrir", className: "solo-icono" });
  rotularBoton(boton, "gente");
  const foto = document.getElementById("foto-abrir");
  if (barra && foto?.parentElement === barra) foto.before(boton); else (barra ?? document.body).appendChild(boton);
  return boton;
}
