// pulsaciones (U26): every button of the screen answers the finger. While it is held it carries `data-pulsado` (tema.css
// paints it turquoise and, unless «Menos movimiento», shrinks it a little), and a quick tap keeps that look at least
// PULSADO_MIN_MS so the eye catches it. Where the device can vibrate, a touch press also gives a 10 ms tick (setting
// «Vibrar al tocar un botón», interfaz.vibrar). Listens once on the window, passive, in capture: it never stops or
// delays the button's own click, the camera's drag or the joystick.
import type { Valor } from "../../packages/client/src/ajustes.ts";

export const PULSADO_MIN_MS = 120;
export const VIBRAR_MS = 10;
const BOTON = "button, [role=\"button\"]";

/** Does this press vibrate? Only a finger, only while the setting is not off, only once the page may vibrate. */
export function debeVibrar(o: { tipo: string; ajuste: Valor | undefined; activado?: boolean }): boolean {
  return o.tipo === "touch" && o.ajuste !== false && o.activado !== false;
}

/** How long the pressed look must still stay after the finger lifts (0 = take it off now). */
export function restoPulsado(desde: number, ahora: number, minimo = PULSADO_MIN_MS): number {
  return Math.max(0, minimo - Math.max(0, ahora - desde));
}

export function montarPulsaciones(o: { ajuste: (id: string) => Valor | undefined }): void {
  let pulsado: HTMLElement | null = null, desde = 0;
  const quitar = (b: HTMLElement) => b.removeAttribute("data-pulsado");
  const soltar = () => {
    const b = pulsado;
    if (!b) return;
    pulsado = null;
    const resto = restoPulsado(desde, performance.now());
    if (resto > 0) setTimeout(() => { if (pulsado !== b) quitar(b); }, resto); else quitar(b);
  };
  const opciones = { capture: true, passive: true } as const;
  addEventListener("pointerdown", (e) => {
    const b = (e.target as Element | null)?.closest?.(BOTON) as HTMLElement | null;
    if (!b || (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true") return;
    if (pulsado && pulsado !== b) quitar(pulsado);
    pulsado = b; desde = performance.now();
    b.setAttribute("data-pulsado", "");
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    // a browser blocks vibrate() until the person has tapped the page once: ask first so it does not complain in the console
    if (debeVibrar({ tipo: e.pointerType, ajuste: o.ajuste("interfaz.vibrar"), activado: nav.userActivation?.hasBeenActive })) {
      try { nav.vibrate?.(VIBRAR_MS); } catch { /* a device that refuses: the colour is still there */ }
    }
  }, opciones);
  for (const t of ["pointerup", "pointercancel"]) addEventListener(t, soltar, opciones);
  addEventListener("blur", soltar);
  // the finger slid off the button: it no longer looks pressed (the browser will not click it either)
  addEventListener("pointerout", (e) => {
    if (pulsado && pulsado.contains(e.target as Node | null) && !pulsado.contains(e.relatedTarget as Node | null)) soltar();
  }, opciones);
}
