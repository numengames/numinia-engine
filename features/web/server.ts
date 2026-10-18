// web — server part (N17). The server decides everything: who may put or take a screen (api.puede "dirigir": owners
// and the Game Director), whether its address is allowed (the world's allow-list, https), and what the site says about
// being framed (it asks the site once — X-Frame-Options and CSP frame-ancestors — so every page knows whether to draw
// the iframe or the card, instead of each guessing). The screens of entorno/web.json are put at every start; the ones
// put live persist (S4) and are dropped at start if their site left the list.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { web, motivoUrl, resumirMarco, PANTALLAS_MAX, TITULO_MAX, TEXTO_MAX, ANCHO_M, ALTO_M } from "./feature.ts";
import type { WebMundo } from "./feature.ts";

/** What a site answers about framing: its two headers (null = not sent), or null when it could not be reached. */
export type Cabeceras = { xfo: string | null; csp: string | null } | null;
export type Probar = (url: string) => Promise<Cabeceras>;
/** How long the server waits for a site's answer, and how many redirects it follows (each one must be allowed too). */
export const PROBAR_MS = 4000;
export const REDIRECCIONES_MAX = 3;

/** The house prober: GET with redirects followed by hand (each hop's host must be on the list), headers only (the
 * body is cancelled). Never throws: an error or a timeout = null («?»: the page tries the iframe and keeps «Abrir»). */
export const probarConFetch = (dominios: readonly string[]): Probar => async (url) => {
  let u = url;
  for (let i = 0; i <= REDIRECCIONES_MAX; i++) {
    try {
      const r = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(PROBAR_MS), headers: { accept: "text/html" } });
      void r.body?.cancel().catch(() => {});
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        const sig = new URL(loc, u).toString();
        if (motivoUrl(sig, dominios)) return { xfo: "deny", csp: null }; // redirects off the list: treat as refused
        u = sig;
        continue;
      }
      return { xfo: r.headers.get("x-frame-options"), csp: r.headers.get("content-security-policy") };
    } catch { return null; }
  }
  return null;
};

/** Cut a text by UTF-8 bytes (never inside a character), control characters out. */
export function limpiar(t: string, max: number): string {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (enc.encode(out + ch).length > max) break; out += ch; }
  return out;
}
const q = (v: unknown, paso: number, min: number, max: number, defecto: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number((Math.round(Math.max(min, Math.min(max, n)) / paso) * paso).toFixed(2)) : defecto;
};
const giro = (g: unknown) => q(((((Number(g) || 0) + 180) % 360) + 360) % 360 - 180, 0.1, -180, 180, 0);

export function crearWeb(o: Partial<WebMundo> & { probar?: Probar } = {}) {
  const dominios = o.dominios ?? [], deFichero = o.pantallas ?? [];
  const probar = o.probar ?? probarConFetch(dominios);
  return serverPart(web, (api) => {
    const puede = (e: number) => api.puede(e, "dirigir");
    const NO_PUEDES = "Poner o quitar pantallas web es cosa de los dueños del mundo y de quien dirige (permiso «Gestionar rituales»).";
    const rechazar = (e: number, motivo: string, porChat: boolean) => {
      if (porChat) api.emit("aviso", { quien: e, texto: limpiar(motivo, 300) }, "server");
      else api.emit("rechazado", { motivo: limpiar(motivo, 200) }, { to: e });
    };
    /** Ask the site about framing and write the answer, unless the screen changed address meanwhile. */
    const comprobar = (id: string) => {
      const p = api.state.get(id), url = String(p?.url ?? "");
      if (!url) return;
      void probar(url).then((c) => {
        const ahora = api.state.get(id);
        if (!ahora || ahora.url !== url) return;
        const marco = c ? resumirMarco(c.xfo, c.csp) : "?";
        if (ahora.marco !== marco) api.state.set(id, { ...ahora, marco });
        api.log(`[web] ${id} ${new URL(url).host}: ${marco === "si" ? "se deja mostrar dentro del mundo" : marco === "no" ? "no se deja enmarcar (se verá como tarjeta con «Abrir»)" : marco === "?" ? "no contesta (la página lo intentará)" : `solo deja enmarcarse en: ${marco}`}`);
      }).catch(() => {});
    };

    // at start: drop what left the list (or the file), then put the file's screens
    for (const k of api.state.keys()) {
      const p = api.state.get(k)!, motivo = motivoUrl(String(p.url), dominios);
      if (p.fichero === true && !deFichero.some((f) => f.id === k)) api.state.delete(k);
      else if (motivo) { api.log(`[web] quito la pantalla ${k}: ${motivo}`); api.state.delete(k); }
    }
    for (const f of deFichero) {
      api.state.set(f.id, {
        url: f.url, titulo: limpiar(f.titulo, TITULO_MAX), texto: limpiar(f.texto ?? "", TEXTO_MAX),
        x: q(f.x, 0.01, -2000, 2000, 0), y: q(f.y ?? 1.6, 0.01, -100, 500, 1.6), z: q(f.z, 0.01, -2000, 2000, 0), ry: giro(f.ry ?? 0),
        ancho: q(f.ancho ?? ANCHO_M.defecto, 0.01, ANCHO_M.min, ANCHO_M.max, ANCHO_M.defecto), alto: q(f.alto ?? ALTO_M.defecto, 0.01, ALTO_M.min, ALTO_M.max, ALTO_M.defecto),
        marco: "?", fichero: true,
      });
    }
    if (deFichero.length || dominios.length) api.log(`[web] ${dominios.length} sitio(s) en la lista (${dominios.join(", ")}); ${deFichero.length} pantalla(s) de web.json`);
    for (const k of api.state.keys()) comprobar(k);

    const avisar = (e: number) => { api.emit("permiso", { poner: puede(e) }, { to: e }); };
    api.onJoin(avisar);
    api.onIdentify((e) => avisar(e));
    api.listen("roles", "cambio", (m) => { avisar(Number(m.quien)); return true; });

    const nuevoId = () => {
      let n = 1;
      for (const k of api.state.keys()) { const m = /^w(\d+)$/.exec(k); if (m) n = Math.max(n, Number(m[1]) + 1); }
      return `w${n}`;
    };
    const poner = (from: number, m: Msg, porChat: boolean): string | null => {
      if (!puede(from)) { rechazar(from, NO_PUEDES, porChat); return null; }
      const url = String(m.url ?? "").trim(), motivo = motivoUrl(url, dominios);
      if (motivo) { rechazar(from, motivo, porChat); return null; }
      const titulo = limpiar(String(m.titulo ?? ""), TITULO_MAX) || limpiar(new URL(url).host, TITULO_MAX);
      let id = String(m.id ?? "").trim();
      const antes = id ? api.state.get(id) : undefined;
      if (id && !antes) { rechazar(from, `No hay ninguna pantalla «${limpiar(id, 16)}».`, porChat); return null; }
      if (antes?.fichero === true) { rechazar(from, "Esa pantalla viene de entorno/web.json: se cambia en el fichero.", porChat); return null; }
      if (!id) {
        if (api.state.keys().length >= PANTALLAS_MAX) { rechazar(from, `Este mundo ya tiene ${PANTALLAS_MAX} pantallas web: quita alguna antes.`, porChat); return null; }
        id = nuevoId();
      }
      api.state.set(id, {
        url, titulo, texto: limpiar(String(m.texto ?? ""), TEXTO_MAX),
        x: q(m.x, 0.01, -2000, 2000, 0), y: q(m.y, 0.01, -100, 500, 1.6), z: q(m.z, 0.01, -2000, 2000, 0), ry: giro(m.ry),
        ancho: q(m.ancho, 0.01, ANCHO_M.min, ANCHO_M.max, ANCHO_M.defecto), alto: q(m.alto, 0.01, ALTO_M.min, ALTO_M.max, ALTO_M.defecto),
        marco: antes?.url === url ? String(antes.marco) : "?", fichero: false,
      });
      api.log(`[web] ${api.who(from)?.nombre ?? `e${from}`} pone la pantalla ${id}: ${url}`);
      if (antes?.url !== url) comprobar(id);
      api.emit("hecho", { id, accion: "poner" }, { to: from });
      return id;
    };
    const quitar = (from: number, id: string, porChat: boolean): boolean => {
      if (!puede(from)) { rechazar(from, NO_PUEDES, porChat); return false; }
      const p = api.state.get(id);
      if (!p) { rechazar(from, `No hay ninguna pantalla «${limpiar(id, 16)}».`, porChat); return false; }
      if (p.fichero === true) { rechazar(from, "Esa pantalla viene de entorno/web.json: se quita del fichero.", porChat); return false; }
      api.state.delete(id);
      api.emit("hecho", { id, accion: "quitar" }, { to: from });
      return true;
    };
    api.on("poner", (from, m) => { poner(from, m, false); });
    api.on("quitar", (from, m) => { quitar(from, String(m.id), false); });

    // the chat: /web (the list), /web <url> [título] (a screen 3 m north of you, facing you), /web quitar <id>
    api.listen("chat", "orden", (m) => {
      const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
      const partes = texto.split(/\s+/);
      if (partes[0]?.toLowerCase() !== "web") return false;
      const aviso = (t: string) => api.emit("aviso", { quien: from, texto: limpiar(t, 300) }, "server");
      if (partes.length === 1) {
        const lista = api.state.keys().map((k) => `${k}: ${String(api.state.get(k)!.titulo)} (${new URL(String(api.state.get(k)!.url)).host})`);
        aviso(lista.length ? `Pantallas web: ${lista.join(" · ")}.` : `No hay pantallas web.${dominios.length ? ` Sitios permitidos: ${dominios.join(", ")}.` : ""} Pon una con /web <dirección> [título].`);
        return true;
      }
      if (partes[1].toLowerCase() === "quitar") { if (quitar(from, partes[2] ?? "", true)) aviso(`Pantalla ${partes[2]} quitada.`); return true; }
      const p = api.position(from);
      if (!p) return true;
      const id = poner(from, { url: partes[1], titulo: partes.slice(2).join(" "), texto: "", x: p.x, y: p.y + 1.6, z: p.z - 3, ry: 0, ancho: ANCHO_M.defecto, alto: ALTO_M.defecto }, true);
      if (id) aviso(`Pantalla ${id} puesta delante (al norte). Quítala con /web quitar ${id}.`);
      return true;
    });
  });
}

export default crearWeb();
