// llamar-nucleo (ia-llamar S11): the pure part of «Hablar con ella» — which AI bubbles you are inside (from the server's `entras` / `sales`),
// which one the E prompt offers, and whether you already accepted the notice «lo lee su cerebro». No DOM; llamar-ia.ts draws it.
import { sinMarca } from "./gente-ia.ts";

/** The AI bubbles you are in now. `entra` / `sale` come from the server's events to you; `quita` when the AI leaves the world. */
export function crearDentro() {
  const m = new Map<number, string>();
  return {
    entra(ia: number, nombre: string): void { m.set(ia, sinMarca(nombre || "una IA")); },
    sale(ia: number): void { m.delete(ia); },
    quita(ia: number): void { m.delete(ia); },
    esta: (ia: number): boolean => m.has(ia),
    nombre: (ia: number): string | undefined => m.get(ia),
    lista: (): { ia: number; nombre: string }[] => [...m].map(([ia, nombre]) => ({ ia, nombre })).sort((a, b) => a.ia - b.ia),
    /** The AI the prompt offers: among those you are inside and may be called by button, the nearest (unknown distance last, then the lowest entity). */
    elegir(puede: (ia: number) => boolean, distancia: (ia: number) => number | null): { ia: number; nombre: string; distancia: number } | null {
      let mejor: { ia: number; nombre: string; distancia: number } | null = null;
      for (const { ia, nombre } of this.lista()) {
        if (!puede(ia)) continue;
        const d = distancia(ia) ?? Number.POSITIVE_INFINITY;
        if (!mejor || d < mejor.distancia) mejor = { ia, nombre, distancia: d };
      }
      return mejor && { ...mejor, distancia: Number.isFinite(mejor.distancia) ? mejor.distancia : 0 };
    },
  };
}

/** The option is on AND this device can take a box that appears by itself: never touch (soft keyboard with no tap) nor a VR/AR session (a DOM dialog is not usable there). */
export const abrirSolo = (ajuste: boolean, tactil: boolean, sesionXR: boolean): boolean => ajuste && !tactil && !sesionXR;

/** Auto-open on entering a bubble: which AIs already opened (or tried to open) the talk during THIS stay inside their bubble, so closing the box
 * does not bring it back until you leave that bubble and enter it again. Pure; llamar-ia.ts decides when to call it. */
export function crearAperturas() {
  const s = new Set<number>();
  return {
    /** You entered `ia`'s bubble: true when the box should open by itself (option on, not opened already in this stay, and no box is open: `libre`). Marks the stay only when it says true,
     * so an AI whose bubble you entered while another box was open can still open when that one closes. */
    entra(ia: number, activo: boolean, puede: boolean, libre = true): boolean { if (!activo || !puede || !libre || s.has(ia)) return false; s.add(ia); return true; },
    /** You left the bubble (or the AI left the world): the next entry may open again. */
    sale(ia: number): void { s.delete(ia); },
    ya: (ia: number): boolean => s.has(ia),
  };
}

/** Where the «lo lee su cerebro» acceptance is kept: this browser, once (D-083). */
export const CLAVE_AVISO = "numinia.llamar-ia.aviso";
type Almacen = Pick<Storage, "getItem" | "setItem">;
export const avisoAceptado = (a: Almacen | null | undefined): boolean => { try { return a?.getItem(CLAVE_AVISO) === "1"; } catch { return false; } };
export const aceptarAviso = (a: Almacen | null | undefined): void => { try { a?.setItem(CLAVE_AVISO, "1"); } catch { /* no storage: it asks again next time */ } };
