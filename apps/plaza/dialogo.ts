// J5 on the page: the conversation box. The person's name, what they say, the answers as real buttons (Tab, Enter,
// a tap, E for the first one, or the digits 1-4 while the box is open) and «Adiós» (Esc). Focus moves to the first answer so a keyboard or
// a screen reader lands in it; the line itself reaches screen readers once, through the engine's announcements (the
// polite #avisos region, V1), so the box does not repeat it. It only asks: features/misiones decides on the server.
import { teclas } from "./teclas.ts";
import { anclar } from "./anclar.ts";
import { pintarCerrar } from "./cerrar.ts";
import { escribiendo, construyendo } from "./interactuar.ts";
import { perfil } from "./perfil-aparato.ts";
import { esMovil } from "../../packages/client/src/movil.ts"; // a phone names no key: answers without a digit

type Res = { ok: true } | { ok: false; why: string };
type Dialogo = { pnj: string; nombre: string; oficio?: string; texto: string; opciones: string[] };
type Ctl = { dialogo(): Dialogo | null; elegir(n: number): Res; adios(): Res; estado: { ultimoRechazo: string }; alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown };
type Vista = { renderer: { domElement: HTMLElement }; cam?: { modo?(): string } };
/** Pablo 11-11: the box stays beside the person who talks to you. `donde(pnj)` = that person's head on the screen (CSS px), or null
 * (behind the camera, unknown: the box goes back to its place in the stylesheet). */
type Anclaje = { donde(pnj: string): { x: number; y: number } | null };
const ANCLA_HUECO = 56, ANCLA_MARGEN = 16; // px between the person and the box; px kept from the window's edges

/** Where the box goes beside a person at `p` (screen px): on the side away from the centre (where your own character is), unless
 * it does not fit there; its top a little over their head, kept inside the window. Pure, for tests. */
export function sitioJunto(p: { x: number; y: number }, caja: { w: number; h: number }, ventana: { w: number; h: number }): { x: number; y: number } {
  const derecha = p.x >= ventana.w / 2;
  let x = derecha ? p.x + ANCLA_HUECO : p.x - ANCLA_HUECO - caja.w;
  if (x + caja.w > ventana.w - ANCLA_MARGEN) x = p.x - ANCLA_HUECO - caja.w;
  if (x < ANCLA_MARGEN) x = Math.min(p.x + ANCLA_HUECO, ventana.w - ANCLA_MARGEN - caja.w);
  const y = Math.min(Math.max(p.y - 40, ANCLA_MARGEN), ventana.h - ANCLA_MARGEN - caja.h);
  return { x: Math.round(Math.max(ANCLA_MARGEN, x)), y: Math.round(y) };
}

export function montarDialogo(c: Ctl, caja: HTMLElement, view: Vista, ancla?: Anclaje): void {
  const nombre = document.createElement("h2"), texto = document.createElement("p"), opciones = document.createElement("div");
  const estado = document.createElement("p"), adios = document.createElement("button");
  nombre.id = "dialogo-nombre"; texto.className = "texto"; opciones.className = "opciones"; estado.className = "estado";
  adios.type = "button"; adios.className = "adios"; pintarCerrar(adios); // Pablo 11-11: the same X + Close + Esc as every panel
  caja.setAttribute("role", "dialog"); caja.setAttribute("aria-labelledby", "dialogo-nombre");
  caja.append(nombre, texto, opciones, estado, adios);
  caja.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // a tap here is not a joystick touch
  adios.addEventListener("click", () => c.adios());

  let mostrado = "", rechazoVisto = "";
  // Pablo 11-11: while a person talks to you the box stays beside them and never covers another panel (anclar.ts).
  const anclaje = ancla ? anclar(caja, () => { const d = c.dialogo(); return d ? ancla.donde(d.pnj) : null; }, () => !!c.dialogo()) : null;
  const seguir = (): void => anclaje?.seguir();
  const pintar = () => {
    const d = c.dialogo();
    if (!d) {
      if (!caja.hidden) { caja.hidden = true; if (caja.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); }
      mostrado = "";
      return;
    }
    if (c.estado.ultimoRechazo !== rechazoVisto) { rechazoVisto = c.estado.ultimoRechazo; estado.textContent = rechazoVisto; }
    const firma = JSON.stringify(d);
    if (firma === mostrado) return;
    mostrado = firma;
    estado.textContent = "";
    nombre.textContent = d.nombre;
    if (d.oficio) { // U14 (4): the person's trade next to the name, smaller (a screen reader hears «Cosimo, Carpintero»)
      const coma = document.createElement("span"), oficio = document.createElement("span");
      coma.className = "solo-lector"; coma.textContent = ", ";
      oficio.className = "oficio"; oficio.textContent = d.oficio;
      oficio.style.cssText = "font-size:.72em;font-weight:500;opacity:.8;margin-left:.6em;text-transform:none;letter-spacing:normal";
      nombre.append(coma, oficio);
    }
    texto.textContent = d.texto;
    opciones.replaceChildren(...d.opciones.map((t, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.n = String(i + 1);
      // The first option is E (the key you talk with), the last one (with two or more) is Q, the ones between keep their number; the key is
      // drawn in a box like the bottom bar's badges, and a phone shows no keys.
      const tecla = esMovil(perfil().clase) ? "" : teclaDeOpcion(i, d.opciones.length);
      if (tecla) { const k = document.createElement("kbd"); k.textContent = tecla; k.style.cssText = KBD; b.append(k); }
      b.append(t);
      b.style.display = "flex"; b.style.alignItems = "center";
      b.addEventListener("click", () => c.elegir(i + 1));
      return b;
    }));
    caja.hidden = false;
    seguir();
    ((opciones.firstElementChild as HTMLElement | null) ?? adios).focus({ preventScroll: true });
  };
  rechazoVisto = c.estado.ultimoRechazo;
  c.alCambiar((que) => { if (que === "dialogo") pintar(); });
  addEventListener("keydown", (e) => {
    if (caja.hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || construyendo(view)) return;
    if (e.code === "Escape") { e.preventDefault(); c.adios(); return; }
    if (teclas.es(e, "usar")) { e.preventDefault(); c.elegir(1); return; } // the key you talked with goes on (Continuar / Aceptar)
    const n = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (n) { e.preventDefault(); c.elegir(Number(n[1])); }
  });
  montarTeclaQ(c, caja, view);
}
// Q = the last option (reject / no). Caught first (capture) and stopped while a conversation is open: Q also opens the microphone
// (voz.ts) and drops what you hold, and neither may fire while you answer.
export function montarTeclaQ(c: Pick<Ctl, "dialogo" | "elegir">, caja: HTMLElement, view: Vista): void {
  addEventListener("keydown", (e) => {
    if (!teclas.es(e, "soltar") || caja.hidden || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || construyendo(view)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const n = c.dialogo()?.opciones.length ?? 0;
    if (!e.repeat && n >= 2) c.elegir(n);
  }, true);
}

/** The key drawn on option i of n: E the first, Q the last (n >= 2), the number for the ones between. */
export const teclaDeOpcion = (i: number, n: number): string => (i === 0 ? "E" : n >= 2 && i === n - 1 ? "Q" : String(i + 1));
const KBD = "display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;margin-right:.6em;padding:0 .35em;border:1px solid currentColor;border-radius:5px;font:600 12px/1 'Geist Mono',ui-monospace,monospace;opacity:.9;flex:none";
