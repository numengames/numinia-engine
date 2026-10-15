// U2: ONE owner for «what Escape / back / B / Start do». Everything on the screen that can be closed registers a LAYER;
// the router closes the one on top, and when there is none it opens the game menu. Order of the layers (design §4):
// change a key › typing › open panels › a mode (a conversation, building) › the menu › playing.
//
//   capas.registrar({ id, rango, abierta, cerrar })   a layer: `abierta()` says if it is open, `cerrar()` closes it
//   capas.arriba()                                    the layer that owns Escape right now (or null)
//   capas.cerrarArriba()                              what Escape, back, B and the window's «atrás» gesture do
//   capas.alVaciarse(f)                               f runs when Escape / back / Start find no layer open: the menu opens there
//   capas.vigilar(dialog)                             a native <dialog> as a layer (opens in order, `cerrar` = close())
//
// The browser keeps its own rules: with the pointer captured or the page in full screen the FIRST Escape is the
// browser's and never reaches the page (design §4); the menu opens when the pointer is released / full screen ends
// (`alSoltarse`, wired in menu-juego.ts). Re-capturing the pointer always needs a click: nothing here does it.
import { escribiendo } from "./escribiendo.ts";

export const RANGO = { tecla: 60, escribir: 50, panel: 40, modo: 30, menu: 20 } as const;
export type Capa = { id: string; rango: number; abierta(): boolean; cerrar(): void };

const capas: (Capa & { desde: number })[] = [];
let contador = 0, alVaciar: () => void = () => {};
let bloqueo: () => boolean = () => false;

/** A text field is open for typing (not a range, checkbox or select: Escape closes the panel around those). */
export function escribeTexto(t: EventTarget | null): boolean {
  const e = t as HTMLElement | null;
  if (!e || typeof e.tagName !== "string") return false;
  if (e.isContentEditable || e.tagName === "TEXTAREA") return true;
  return e.tagName === "INPUT" && /^(?:text|search|number|email|url|tel|password)$/.test((e as HTMLInputElement).type);
}

/** Sort key: the order the layers had when they opened, so equal ranks close last-opened first. */
function sincronizar(): void {
  for (const c of capas) {
    const abierta = c.abierta();
    if (abierta && c.desde === 0) c.desde = ++contador;
    else if (!abierta) c.desde = 0;
  }
}

export function registrar(c: Capa): Capa {
  if (capas.some((x) => x.id === c.id)) throw new Error(`capas: «${c.id}» ya está registrada`);
  capas.push({ ...c, desde: 0 });
  return c;
}
export function abiertas(): string[] { sincronizar(); return capas.filter((c) => c.desde > 0).sort(orden).map((c) => c.id); }
const orden = (a: { rango: number; desde: number }, b: { rango: number; desde: number }) => b.rango - a.rango || b.desde - a.desde;
export function arriba(): Capa | null {
  sincronizar();
  const abiertas = capas.filter((c) => c.desde > 0).sort(orden);
  return abiertas[0] ?? null;
}
export function cerrarArriba(): boolean { const c = arriba(); if (!c) return false; c.cerrar(); return true; }
export function alVaciarse(f: () => void): void { alVaciar = f; }
/** While this says true (loading, leaving) no key opens the menu. */
export function bloquearMientras(f: () => boolean): void { bloqueo = f; }

/** A native dialog as a layer. `cerrar` goes through close() so the dialog's own «close» listeners run. */
export function vigilar(dialog: HTMLDialogElement, rango: number = RANGO.panel, id: string = dialog.id): Capa {
  return registrar({ id, rango, abierta: () => dialog.open, cerrar: () => dialog.close() });
}

/** What the keyboard does with Escape, and the only place that decides it. */
function alEscape(e: KeyboardEvent): void {
  if (e.code !== "Escape" || e.isComposing || e.repeat) return;
  const top = arriba();
  if (escribeTexto(e.target) && !(top && top.rango >= RANGO.escribir)) {
    (e.target as HTMLElement).blur(); // a text box with nothing registered: the first Escape leaves the box, never opens the menu
    e.preventDefault();
    return;
  }
  e.preventDefault(); e.stopImmediatePropagation(); // nobody else reacts to this Escape (a native <dialog> would close twice)
  if (top) { top.cerrar(); return; }
  if (!bloqueo()) alVaciar();
}

// ---- «atrás» on a phone: the window's back gesture closes the top layer, or opens the menu. One history entry of ours is
// always ahead of the page; each back consumes it and puts a fresh one. Only on touch screens (`?atras` forces it, for
// checks), and only after the first touch (browsers skip entries added without one). ----
function montarAtras(): void {
  const params = new URLSearchParams(location.search);
  if (!matchMedia("(pointer: coarse)").matches && !params.has("atras")) return;
  let puesta = false;
  const poner = () => { if (puesta) return; puesta = true; try { history.pushState({ numinia: "capa" }, ""); } catch { puesta = false; } };
  addEventListener("pointerdown", poner, { once: true, capture: true });
  addEventListener("keydown", poner, { once: true, capture: true });
  addEventListener("popstate", () => {
    if (!puesta) return;
    puesta = false; // the gesture consumed our entry
    if (!cerrarArriba() && !bloqueo()) alVaciar();
    poner();
  });
}

// ---- B and Start on a gamepad: B closes the top layer, Start opens (or closes) the menu ----
function montarMando(): void {
  let timer = 0, b = false, start = false;
  const mirar = () => {
    const p = [...(navigator.getGamepads?.() ?? [])].find((x) => x?.connected);
    if (!p) return;
    const nb = !!p.buttons[1]?.pressed, ns = !!p.buttons[9]?.pressed;
    if (nb && !b) cerrarArriba();
    if (ns && !start) { const top = arriba(); if (top) top.cerrar(); else if (!bloqueo()) alVaciar(); }
    b = nb; start = ns;
  };
  addEventListener("gamepadconnected", () => { if (!timer) timer = setInterval(mirar, 80) as unknown as number; }); // nothing polls until a pad exists
  addEventListener("gamepaddisconnected", () => { if (timer && ![...(navigator.getGamepads?.() ?? [])].some((x) => x?.connected)) { clearInterval(timer); timer = 0; } });
}

let montado = false;
/** Install the router (once). Capture phase on the window: it sees Escape before any panel, box or listener. */
export function montarCapas(): void {
  if (montado) return;
  montado = true;
  addEventListener("keydown", alEscape, { capture: true });
  montarAtras();
  montarMando();
}

// the page's `escribiendo` stays the rule for every OTHER key; re-exported so a listener needs one import
export { escribiendo };
