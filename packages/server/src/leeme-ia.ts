// leeme-ia (t_06071dee): `aventura/LEEME-IA.md`, the AGENTS.md of ONE world for any AI that comes in by the door — what it
// may build here, in which style, and what it must not touch. Plain markdown in the world's folder (file over app): the
// owner (or numinia.com through the world's door, ADR-079) edits it, it travels in the zip, and a NEW world is born with
// one (plantillas/taller/aventura/LEEME-IA.md). The MCP bridge hands its text to the AI (`leeme_ia` tool and resource),
// and for that the server serves it at `GET /leeme-ia` (public like /status: never put a secret in it).
// It is read when asked (an edit is seen at once), cached by mtime + size, at most LEEME_IA_MAX bytes of valid UTF-8.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const LEEME_IA = "LEEME-IA.md";
/** Bytes. An AI reads it whole at the start of every visit, so it must stay short (~3,000 words at most). */
export const LEEME_IA_MAX = 12 * 1024;

export type LeemeIA = { texto: string | null; problema: string | null };
const cache = new Map<string, { clave: string; r: LeemeIA }>();

/** The world's LEEME-IA text, or why there is none. No file = `{texto: null, problema: null}` (an old world, nothing wrong). */
export function leerLeemeIA(aventura: string | null): LeemeIA {
  if (!aventura) return { texto: null, problema: null };
  const p = join(aventura, LEEME_IA);
  let st;
  try { st = statSync(p); } catch { return { texto: null, problema: null }; }
  if (!st.isFile()) return { texto: null, problema: `${LEEME_IA} no es un fichero` };
  const clave = `${st.mtimeMs}:${st.size}`, antes = cache.get(p);
  if (antes?.clave === clave) return antes.r;
  let r: LeemeIA;
  if (st.size > LEEME_IA_MAX) r = { texto: null, problema: `${LEEME_IA} pesa ${st.size} bytes y el máximo es ${LEEME_IA_MAX}: una IA lo lee entero cada vez, acórtalo` };
  else {
    try {
      const texto = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(p));
      r = texto.includes("\0") ? { texto: null, problema: `${LEEME_IA} tiene caracteres nulos: tiene que ser texto` } : texto.trim() ? { texto, problema: null } : { texto: null, problema: `${LEEME_IA} está vacío` };
    } catch { r = { texto: null, problema: `${LEEME_IA} no es texto UTF-8 válido` }; }
  }
  cache.set(p, { clave, r });
  return r;
}
