// net: the «visita de enlace» (dardos enlazados, E1). A page of ANY world may open a second, light WebSocket to another world's
// server to take part in ONE game of it (today the darts board of the Alchemist Tower, from its AR wall). It says so in the
// address of the WebSocket — `…/ws?enlace=dardos` — so the wire format does not change: an older server ignores the query and the
// page simply gets a normal (but useless) connection, a newer one makes it a visit:
//   · no avatar of its own is shown to anybody (it is not among the people of the world) and it never moves;
//   · it gets no snapshots, no voice and no chat — of the server's features it hears and speaks to FUNCIONES_DE_ENLACE only;
//   · identity, the conditions of entry and every rate limit work as for anybody else.
export const ENLACE_PARAMETRO = "enlace";
export const ENLACE_VALOR = "dardos";
/** The features a darts visit may talk to on the server (everything else is neither sent to it nor taken from it). */
export const FUNCIONES_DE_ENLACE: readonly string[] = Object.freeze(["dardos"]);

/** The address a page opens: the server's, plus `?enlace=dardos`. */
export function direccionDeEnlace(servidor: string): string {
  const u = new URL(servidor); u.searchParams.set(ENLACE_PARAMETRO, ENLACE_VALOR); return u.toString();
}
/** Server side: is this request (the `url` of the WebSocket upgrade) a darts visit? */
export function esVisitaDeEnlace(url: string | undefined): boolean {
  if (!url) return false;
  try { return new URL(url, "http://x").searchParams.get(ENLACE_PARAMETRO) === ENLACE_VALOR; } catch { return false; }
}
