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

/** Where the «lo lee su cerebro» acceptance is kept: this browser, once (D-083). */
export const CLAVE_AVISO = "numinia.llamar-ia.aviso";
type Almacen = Pick<Storage, "getItem" | "setItem">;
export const avisoAceptado = (a: Almacen | null | undefined): boolean => { try { return a?.getItem(CLAVE_AVISO) === "1"; } catch { return false; } };
export const aceptarAviso = (a: Almacen | null | undefined): void => { try { a?.setItem(CLAVE_AVISO, "1"); } catch { /* no storage: it asks again next time */ } };
