// burbuja — client part (ia-llamar S9): the page's accessor to the public shape of each AI's action bubble. Read-only: the server
// decides who is inside (features/burbuja/server.ts); the page only draws the shape (packages/render/src/burbujas.ts).
//   burbujaPagina.de(entity)      → Burbuja | null      (null = that entity has no bubble, or it is not known yet)
//   burbujaPagina.lista()         → { quien, burbuja }[] (every bubble now, by entity)
//   burbujaPagina.mira(entity)    → number              (presence: the person that AI is with now, -1 = nobody)
//   burbujaPagina.alCambiar(fn)   → unsubscribe          (a bubble appeared, changed its shape/radius/visibility/mira, or went; a new listener
//                                                         is first told every bubble already known: the page subscribes after the first state may have arrived)
//   burbujaPagina.alEntrar(fn)    → unsubscribe          (`entras`: YOU have just entered the bubble of AI `ia`; the page flashes it)
//   burbujaPagina.alSalir(fn)     → unsubscribe          (`sales`: YOU have left the bubble of AI `ia` whose entry told you; the «E: hablar con…» prompt goes)
// The same entries are in `session.features.stateOf("burbuja")` for agents and tests. Exposed on the page as `__numinia.burbuja`.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { NADIE, burbuja, leerBurbuja } from "./feature.ts";
import type { Burbuja } from "./feature.ts";

export type { Burbuja } from "./feature.ts";

/** One per page (tests make one per client). */
export function crearBurbujaPagina() {
  let api: ClientApi | null = null;
  const cambios = new Set<(quien: number, b: Burbuja | null) => void>();
  const entradas = new Set<(ia: number, nombre: string) => void>();
  const salidas = new Set<(ia: number, nombre: string) => void>();
  const claveIA = (k: string): boolean => /^\d+$/.test(k);
  const ctl = {
    /** The bubble of this player if it is an AI, else null. Anything odd in the state reads as the house default. */
    de: (quien: number): Burbuja | null => { const v = api?.state.get(String(quien)); return v ? leerBurbuja(v) : null; },
    lista: (): { quien: number; burbuja: Burbuja }[] => (api?.state.keys() ?? []).flatMap((k) => { const v = api?.state.get(k); return v && claveIA(k) ? [{ quien: Number(k), burbuja: leerBurbuja(v) }] : []; }).sort((a, b) => a.quien - b.quien),
    /** Presence: the entity of the person this AI is with now (the server decides), or -1. */
    mira: (quien: number): number => { const m = Number(api?.state.get(String(quien))?.mira); return Number.isInteger(m) && m >= 0 ? m : NADIE; },
    alCambiar: (f: (quien: number, b: Burbuja | null) => void): (() => void) => {
      cambios.add(f);
      for (const { quien, burbuja: b } of ctl.lista()) { try { f(quien, b); } catch { /* a page's listener must not stop the rest */ } } // what is already here (v9 hands the first state over before the page listens)
      return () => cambios.delete(f);
    },
    alEntrar: (f: (ia: number, nombre: string) => void): (() => void) => { entradas.add(f); return () => entradas.delete(f); },
    alSalir: (f: (ia: number, nombre: string) => void): (() => void) => { salidas.add(f); return () => salidas.delete(f); },
  };
  const part = clientPart(burbuja, (a) => {
    api = a;
    a.state.onChange((k, v) => {
      if (!claveIA(k)) return;
      for (const f of cambios) { try { f(Number(k), v ? leerBurbuja(v) : null); } catch { /* a page's listener must not stop the rest */ } }
    });
    a.on("entras", (m) => {
      const ia = Number(m.ia), nombre = typeof m.nombre === "string" ? m.nombre : "";
      if (!Number.isInteger(ia)) return;
      for (const f of entradas) { try { f(ia, nombre); } catch { /* idem */ } }
    });
    a.on("sales", (m) => {
      const ia = Number(m.ia), nombre = typeof m.nombre === "string" ? m.nombre : "";
      if (!Number.isInteger(ia)) return;
      for (const f of salidas) { try { f(ia, nombre); } catch { /* idem */ } }
    });
  });
  return { ...ctl, part };
}

/** The page's accessor (one per page). */
export const burbujaPagina = crearBurbujaPagina();
export default burbujaPagina.part;
