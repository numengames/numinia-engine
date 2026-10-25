// La Bolsa galáctica: «Soltar» asks first. Throwing away a weapon or a relic cannot be undone (the server's `soltar` removes it for
// good), so the page shows «¿Soltar X? Se perderá.» with «Sí, soltar» / «Cancelar» and sends the intent only after the yes.
// Tokens and catches go without asking (they pile up, and a stack is not a thing you earned once). Pure: no DOM; the panel
// (inventario.ts) draws `pendiente` as an inline choice in the detail card — the engine's own style (cf. entorno.ts «Restaurar el
// mundo»), so it also reads in a headset panel and never needs `window.confirm`, which does not exist inside VR.
import type { Objeto } from "./bolsa-rejilla.ts";

type Res = { ok: true } | { ok: false; why: string };

/** Only weapons and relics are asked about. */
export const pideConfirmar = (o: Pick<Objeto, "tipo">): boolean => o.tipo === "arma" || o.tipo === "reliquia";
/** The question, one sentence. */
export const preguntaSoltar = (o: Pick<Objeto, "nombre">): string => `¿Soltar ${o.nombre}? Se perderá.`;

export type Soltar = {
  /** The object whose confirmation is open now (null = none). */
  readonly pendiente: Objeto | null;
  /** «Soltar» pressed: asks first for a weapon or a relic (returns "pregunta", nothing sent), sends at once for the rest. */
  pedir(o: Objeto): "pregunta" | "enviado" | "rechazado";
  /** «Sí, soltar»: sends the intent for the object that was asked about. */
  confirmar(): "enviado" | "rechazado" | "nada";
  /** «Cancelar» (or Esc, another object chosen, the panel closed): nothing is sent, the object stays. `callar`: the caller redraws itself. */
  cancelar(callar?: boolean): void;
};

/** `enviar` is the controller's `soltar(id, n)`; `avisar` shows a refusal; `cambio` redraws the card. */
export function crearSoltar(enviar: (id: string, n?: number) => Res, avisar: (texto: string) => void, cambio: () => void): Soltar {
  let pendiente: Objeto | null = null;
  const mandar = (o: Objeto): "enviado" | "rechazado" => {
    const r = enviar(o.id, 0);
    if (!r.ok) { avisar(r.why); return "rechazado"; }
    return "enviado";
  };
  return {
    get pendiente() { return pendiente; },
    pedir(o) {
      if (!pideConfirmar(o)) return mandar(o);
      pendiente = o; cambio();
      return "pregunta";
    },
    confirmar() {
      const o = pendiente; if (!o) return "nada";
      pendiente = null; cambio();
      return mandar(o);
    },
    cancelar(callar = false) { if (!pendiente) return; pendiente = null; if (!callar) cambio(); },
  };
}
