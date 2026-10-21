// llamar — client part (ia-llamar S11): the page's accessor to how each AI can be called, and the one verb the «Hablar con ella» button and the
// E key use. Read-only state: the server decides (reach, limits, whether the button is on); the page only asks and draws.
//   llamarPagina.de(entity)          → CfgLlamar | null   (null = no such AI, or not known yet)
//   llamarPagina.puedeBoton(entity)  → boolean            (the AI's `boton` switch is on: show «Hablar con ella» / the E prompt)
//   llamarPagina.llamar(ia, texto)   → { ok } | { ok:false, why }   (the intent `llamar`; refused here when the text is longer than 190 bytes)
// The server answers the caller with its own `aviso` («Has llamado a Ada.» or why not), which the page announces like any notice.
// The same entries are in `session.features.stateOf("llamar")` for agents and tests. Exposed on the page as `__numinia.llamar`.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { TEXTO_MAX, cortar, linea, llamar } from "./feature.ts";

export type CfgLlamar = { nombre: boolean; barra: boolean; boton: boolean; dentro: boolean; frase: string };
type Res = { ok: true } | { ok: false; why: string };

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** Pure: the AI's `llamar` entry as the world says it; anything missing or odd reads as the house default (all on, from inside, no phrase). */
export function leerCfg(v: Readonly<Record<string, unknown>> | null | undefined): CfgLlamar {
  const si = (x: unknown, d: boolean): boolean => (typeof x === "boolean" ? x : d);
  return { nombre: si(v?.nombre, true), barra: si(v?.barra, true), boton: si(v?.boton, true), dentro: si(v?.dentro, true), frase: typeof v?.frase === "string" ? v.frase : "" };
}

/** Pure: what the person typed, ready to send — one clean line. `largo` = it does not fit in 190 bytes (refuse, never cut what they meant). */
export function prepararTexto(crudo: string): { texto: string; bytes: number; largo: boolean } {
  const texto = linea(crudo, 4 * TEXTO_MAX), n = bytes(texto);
  return { texto: n > TEXTO_MAX ? cortar(texto, TEXTO_MAX) : texto, bytes: n, largo: n > TEXTO_MAX };
}

/** One per page (tests make one per client). */
export function crearLlamarPagina() {
  let api: ClientApi | null = null;
  const ctl = {
    de: (quien: number): CfgLlamar | null => { const v = api?.state.get(String(quien)); return v ? leerCfg(v) : null; },
    puedeBoton: (quien: number): boolean => ctl.de(quien)?.boton === true,
    llamar(ia: number, crudo: string): Res {
      const p = prepararTexto(crudo);
      if (p.largo) return { ok: false, why: `Demasiado largo: ${p.bytes} de ${TEXTO_MAX} bytes. Acórtalo.` };
      return api?.send("llamar", { ia, texto: p.texto }) ?? { ok: false, why: "la página aún no ha arrancado" };
    },
  };
  const part = clientPart(llamar, (a) => { api = a; });
  return { ...ctl, part };
}

/** The page's accessor (one per page). */
export const llamarPagina = crearLlamarPagina();
export default llamarPagina.part;
