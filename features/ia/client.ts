// ia — client part (ia-visible S3): the page's accessor to the public card of each AI. Read-only: the server decides.
//   iaPagina.de(entity)      → IAPublica | null   (null = not an AI, or not known yet)
//   iaPagina.es(entity)      → boolean            (is this player an AI?)
//   iaPagina.lista()         → { quien, ia }[]    (every AI connected now, by entity)
//   iaPagina.alCambiar(fn)   → unsubscribe        (an entry appeared, changed or went)
// The nameplate mark (S4), the ring on the floor and the map diamond (S5), «Gente» (S6) and the card (S7) read this; the same
// entries are in `session.features.stateOf("ia")` for agents and tests. Exposed on the page as `__numinia.ia`.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { ia, publica } from "./feature.ts";
import type { IAPublica } from "./feature.ts";

export type { IAPublica } from "./feature.ts";

/** One per page (tests make one per client). */
export function crearIAPagina() {
  let api: ClientApi | null = null;
  const oyentes = new Set<(quien: number, ficha: IAPublica | null) => void>();
  const ctl = {
    /** The public card of this player if it is an AI, else null. */
    de: (quien: number): IAPublica | null => { const v = api?.state.get(String(quien)); return v ? publica(v) : null; },
    es: (quien: number): boolean => api?.state.get(String(quien)) !== undefined,
    lista: (): { quien: number; ia: IAPublica }[] => (api?.state.keys() ?? []).flatMap((k) => { const v = api?.state.get(k); return v && /^\d+$/.test(k) ? [{ quien: Number(k), ia: publica(v) }] : []; }).sort((a, b) => a.quien - b.quien),
    alCambiar: (f: (quien: number, ficha: IAPublica | null) => void): (() => void) => { oyentes.add(f); return () => oyentes.delete(f); },
  };
  const part = clientPart(ia, (a) => {
    api = a;
    a.state.onChange((k, v) => {
      if (!/^\d+$/.test(k)) return;
      for (const f of oyentes) { try { f(Number(k), v ? publica(v) : null); } catch { /* a page's listener must not stop the rest */ } }
    });
  });
  return { ...ctl, part };
}

/** The page's accessor (one per page). */
export const iaPagina = crearIAPagina();
export default iaPagina.part;
