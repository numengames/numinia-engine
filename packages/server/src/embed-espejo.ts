// embed-espejo — the engine side of the embed mode (mundo-hermes M7): the world page runs inside a sandboxed frame of a host app (Hermes Desktop's
// SandboxedFrame: sandbox="allow-scripts allow-pointer-lock", NO allow-same-origin), so it has an OPAQUE origin (`Origin: null`). Two things live here:
//   1) the world-join CREDENTIAL of the embed: `e1.<exp ms>.<nonce>.<hmac hex>` with hmac = HMAC-SHA256(link key, "numinia-embed@1\n<exp>.<nonce>").
//      The host's plugin makes one (it holds the link key, `enlace.env`) and puts it in the URL FRAGMENT of the world (`#embed=<credential>`; a fragment never
//      reaches a server, a log or a Referer). It lives at most 24 h. Whoever holds it is, for this world, the machine's owner («dueño local»).
//   2) `POST /espejo/embed`: the page's bridge hands over what the host's plugin published (the SAME frames the local link carries: lote, alta, cambio,
//      baja, resultado, pulso) because a snapshot (up to 16 KB) does not fit the game socket (frames over 1 KB are refused there).
// THREAT, in plain words. `Origin: null` is what EVERY sandboxed or data: page sends, from any site: it proves nothing, so it is never enough on its own.
// What lets a request in is (a) the world has `embed.activa: true` in its espejo.json, (b) the request comes from this machine (loopback socket, no proxy header,
// a local Host name against DNS rebinding, Origin absent/«null»/own), (c) JSON content-type and (d) a valid, unexpired credential in the Authorization header
// (never the query string). A credential is bound to the first identity that proves it on the game socket (features/espejo/server.ts); bad ones are rate-limited. Without (a) the route does not exist (404, as always); the game socket never checked Origin and still
// does not (a public world is public: identity there is a token, not an origin). CORS `*` on the page's files is harmless: they are public, and nothing
// here uses cookies or ambient credentials. A leaked credential lets its holder publish fake things and ask for verbs as the owner until it expires:
// the plugin makes a short one (1 h) on every open; the key itself never travels.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { esLoopback, MENSAJE_MAX, RAFAGA, RITMO } from "./enlace-espejo.ts";
import type { EnlaceEspejo } from "./enlace-espejo.ts";

export const TTL_MAX_MS = 24 * 3600_000, TTL_DEFECTO_MS = 3600_000, RUTA = "/espejo/embed";
const firma = (clave: string, cuerpo: string): string => createHmac("sha256", clave).update(`numinia-embed@1\n${cuerpo}`).digest("hex");
const igual = (a: string, b: string): boolean => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** A credential good for `ttlMs` (at most 24 h) from `ahora`. The plugin does the same with the same key (docs/EXTENDER.md «Embed (v1)»). */
export function acunarCredencial(clave: string, o: { ahora?: number; ttlMs?: number } = {}): string {
  const exp = (o.ahora ?? Date.now()) + Math.min(TTL_MAX_MS, Math.max(1000, o.ttlMs ?? TTL_DEFECTO_MS)), cuerpo = `${exp}.${randomBytes(12).toString("base64url")}`;
  return `e1.${cuerpo}.${firma(clave, cuerpo)}`;
}
/** Is this credential genuine, unexpired and not made for longer than 24 h? Never throws. */
export function verificarCredencial(clave: string, cred: unknown, ahora = Date.now()): boolean {
  if (typeof cred !== "string" || cred.length > 160 || !clave) return false;
  const m = /^e1\.(\d{10,15})\.([A-Za-z0-9_-]{16})\.([0-9a-f]{64})$/.exec(cred);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= ahora || exp > ahora + TTL_MAX_MS + 60_000) return false;
  return igual(m[3], firma(clave, `${m[1]}.${m[2]}`));
}

type Opciones = { enlace: EnlaceEspejo; clave: () => string; activo: () => boolean; reloj?: () => number; log?: (l: string) => void };
const CORS_BASE = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600" };
/** CORS `*` only for a caller that is opaque (`Origin: null`) or not a browser (no Origin): a web page of another site never gets to READ an answer. */
const cors = (origin: string | undefined): Record<string, string> => (origin === undefined || origin === "null" ? CORS_BASE : {});
const PROXY = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "via", "x-client-ip", "cf-connecting-ip", "true-client-ip"];
/** The Host a loopback visitor uses: localhost, 127.x or [::1] (with or without a port). Anything else is a DNS-rebinding name that merely resolves here. */
const hostLocal = (host: string | undefined): boolean => { const m = /^(localhost|\[::1\]|127(?:\.\d{1,3}){3})(:\d{1,5})?$/i.exec(host ?? ""); return !!m && (m[1].toLowerCase() === "localhost" || m[1][0] === "[" || esLoopback(m[1])); };
/** Origin is absent (not a browser), "null" (the sandboxed host frame) or the world's own address; any other site is refused. */
export const origenAdmitido = (origin: string | undefined, host: string | undefined): boolean => origin === undefined || origin === "null" || origin === `http://${host}`;

export function crearEmbedHttp(o: Opciones) {
  const ahora = o.reloj ?? Date.now, log = o.log ?? (() => {});
  const responder = (res: ServerResponse, code: number, body: Record<string, unknown>, origen = (res as { req?: IncomingMessage }).req?.headers.origin) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(origen) }); res.end(JSON.stringify({ v: 1, ...body })); };
  let fichas = RAFAGA, recarga = ahora(), malas = RAFAGA, recargaMalas = ahora(); // `malas`: the same bucket for NOT valid credentials (valid ones never wait on it, so a sandboxed frame of any site cannot lock the owner out)
   // one bucket for the whole embed (a single owner publishes): the link's own rate
  return {
    /** Answers POST/OPTIONS /espejo/embed; false = not ours (embed off, or another path): the route does not exist then. */
    atender(method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean {
      if (path !== RUTA || !o.activo()) return false;
      const h = req.headers, mal = (code: number, motivo: string) => { responder(res, code, { ok: false, motivo }); return true; };
      // 1) who may even be answered: this machine, by a local name, with no proxy in between, from no other site. Checked BEFORE the preflight, so nothing foreign learns the route exists.
      if (!esLoopback(req.socket.remoteAddress) || PROXY.some((k) => h[k] !== undefined)) return mal(403, "el modo embebido solo acepta a esta máquina");
      if (!hostLocal(h.host)) return mal(403, "nombre de host no admitido (el modo embebido solo se abre por localhost o 127.0.0.1)");
      if (!origenAdmitido(h.origin, h.host)) return mal(403, "origen no admitido");
      if (method === "OPTIONS") { res.writeHead(204, cors(h.origin)); res.end(); return true; }
      if (method !== "POST") return mal(405, "solo POST");
      if (!/^application\/json\s*(;|$)/i.test(String(h["content-type"] ?? ""))) return mal(415, "el cuerpo debe ser application/json");
      if (Number(h["content-length"] ?? 0) > MENSAJE_MAX) { req.resume(); return mal(413, "mensaje de más de 16 KB"); }
      const cred = /^Bearer\s+(\S+)$/i.exec(String(h.authorization ?? ""))?.[1]; // the header only: a credential in the query string is never read
      if (!verificarCredencial(o.clave(), cred, ahora())) {
        const t0 = ahora(); malas = Math.min(RAFAGA, malas + ((t0 - recargaMalas) / 1000) * RITMO); recargaMalas = t0;
        if (malas < 1) { log("[embed] demasiadas credenciales no válidas seguidas"); return mal(429, "demasiado rápido"); }
        malas -= 1; return mal(401, "credencial de embed ausente, caducada o no válida");
      }
      const t = ahora(); fichas = Math.min(RAFAGA, fichas + ((t - recarga) / 1000) * RITMO); recarga = t;
      if (fichas < 1) { responder(res, 429, { ok: false, motivo: "demasiado rápido" }); return true; }
      fichas -= 1;
      let cuerpo = "", n = 0, cortado = false;
      req.setEncoding("utf8");
      req.on("data", (c: string) => { n += Buffer.byteLength(c); if (n > MENSAJE_MAX) { if (!cortado) { cortado = true; responder(res, 413, { ok: false, motivo: "mensaje de más de 16 KB" }); req.resume(); /* drain, not destroy: the client reads the 413 instead of a reset */ } } else cuerpo += c; });
      req.on("end", () => {
        if (cortado) return;
        let m: Record<string, unknown>;
        try { const x = JSON.parse(cuerpo); if (typeof x !== "object" || x === null || Array.isArray(x)) throw new Error("no es un objeto"); m = x as Record<string, unknown>; } catch { return responder(res, 400, { ok: false, motivo: "JSON no válido" }); }
        if (m.v !== 1) return responder(res, 400, { ok: false, motivo: "versión no admitida (se habla la 1)" });
        const e = o.enlace, tipo = String(m.t ?? "");
        const sale = (r: { ok: boolean; motivo?: string; problemas?: unknown; puestas?: number; quitadas?: number; descartadas?: unknown[] }) => responder(res, 200, r.ok ? { ok: true, en: tipo, puestas: r.puestas ?? 0, quitadas: r.quitadas ?? 0, descartadas: (r.descartadas ?? []).slice(0, 20) } : { ok: false, en: tipo, motivo: String(r.motivo ?? "no"), problemas: ((r.problemas ?? []) as unknown[]).slice(0, 5) });
        switch (tipo) {
          case "pulso": return responder(res, 200, { ok: true, en: tipo });
          case "lote": return sale(e.lote(Array.isArray(m.objetos) ? m.objetos : (null as never)));
          case "alta": return sale(e.alta(m.objeto));
          case "cambio": return sale(e.cambio(m.objeto));
          case "baja": return sale(e.baja((m.objeto ?? {}) as { tipo: string; id: string }));
          case "resultado":
            if (typeof m.peticion !== "string" || typeof m.ok !== "boolean") return responder(res, 200, { ok: false, en: tipo, motivo: "resultado necesita { peticion: texto, ok: true|false, texto }" });
            return e.resultado(m.peticion, m.ok, String(m.texto ?? "")) ? responder(res, 200, { ok: true, en: tipo }) : responder(res, 200, { ok: false, en: tipo, motivo: "nadie espera esa petición (no existe o ya caducó)" });
          default: log(`[embed] mensaje desconocido «${tipo.slice(0, 24)}»`); return responder(res, 200, { ok: false, en: tipo.slice(0, 24), motivo: "mensaje desconocido (son: lote, alta, cambio, baja, resultado, pulso)" });
        }
      });
      return true;
    },
  };
}
