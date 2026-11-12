// espejo-embed: the postMessage bridge of the embed mode, wired to the page (mundo-hermes M7). A LAZY chunk: main.ts imports it only when the page is framed
// AND embed mode is asked for (`?embed=1`, or /status says `espejo.embed`); a world without the espejo never downloads it. All the rules live in
// features/espejo/puente.ts (pure, tested); this file only plugs the page's window, the network and the espejo controller into it.
//   · the credential comes from the URL FRAGMENT `#embed=<credential>` (never sent to a server) and is taken out of the address bar at once;
//   · what the host posts goes to `POST /espejo/embed` (CORS: the page's origin is opaque) with the credential as a Bearer token;
//   · the page binds itself as the source over the game socket (`embed` intent) and the server then sends it `hola` / `peticion` / `lista`, which go to the host.
import type { espejo as Controlador } from "../../features/espejo/client.ts";
import { crearPuente } from "../../features/espejo/puente.ts";
import type { Respuesta } from "../../features/espejo/puente.ts";

export function montarEmbed(o: { espejo: typeof Controlador; ventana?: Window }): { cerrar(): void } | null {
  const w = o.ventana ?? window;
  const cred = new URLSearchParams(w.location.hash.replace(/^#/, "")).get("embed") ?? "";
  if (!w.parent || w.parent === w || !cred) return null; // not framed, or no credential: nothing to bridge (a stranger who frames the page gets no answer)
  try { const p = new URLSearchParams(w.location.hash.replace(/^#/, "")); p.delete("embed"); w.history.replaceState(w.history.state, "", w.location.pathname + w.location.search + (p.size ? `#${p}` : "")); } catch { /* no history: the fragment stays, nobody reads it */ }
  const url = new URL("/espejo/embed", w.location.href).href;
  const enviar = async (trama: Record<string, unknown>): Promise<Respuesta> => {
    try { const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${cred}`, "content-type": "application/json" }, body: JSON.stringify(trama) }); return (await r.json()) as Respuesta; }
    catch { return { ok: false, motivo: "no he podido hablar con el mundo (POST /espejo/embed)" /* i18n-ok: protocol message for the embedding host page, not shown to the player */ }; }
  };
  const puente = crearPuente({ padre: w.parent, fuente: w.parent, enviar });
  let vinculado = false;
  w.addEventListener("message", puente.alMensaje);
  o.espejo.puente = (ev, m) => { if (ev === "hola") vinculado = true; puente.deMundo(ev, m); };
  const quitar = o.espejo.alCambiar((que) => { if (que === "rechazo" && o.espejo.estado.rechazo) puente.error("embed", o.espejo.estado.rechazo); });
  // the game socket may not be ready (catalog, identity): try once a second until the server answers `hola`
  let n = 0;
  const reintento = w.setInterval(() => { if (vinculado || ++n > 60) { w.clearInterval(reintento); return; } o.espejo.vincular(cred); }, 1000);
  o.espejo.vincular(cred);
  puente.listo();
  return { cerrar() { w.clearInterval(reintento); w.removeEventListener("message", puente.alMensaje); o.espejo.puente = null; quitar(); } };
}
