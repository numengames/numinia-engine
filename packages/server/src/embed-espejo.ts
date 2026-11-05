// embed-espejo — the engine side of the embed mode (mundo-hermes M7): the world page runs inside a sandboxed frame of a host app (Hermes Desktop's
// SandboxedFrame: sandbox="allow-scripts allow-pointer-lock", NO allow-same-origin), so it has an OPAQUE origin (`Origin: null`). Two things live here:
//   1) the world-join CREDENTIAL of the embed: `e1.<exp ms>.<nonce>.<hmac hex>` with hmac = HMAC-SHA256(link key, "numinia-embed@1\n<exp>.<nonce>").
//      The host's plugin makes one (it holds the link key, `enlace.env`) and puts it in the URL FRAGMENT of the world (`#embed=<credential>`; a fragment never
//      reaches a server, a log or a Referer). It lives at most 24 h. Whoever holds it is, for this world, the machine's owner («dueño local»).
//   2) `POST /espejo/embed`: the page's bridge hands over what the host's plugin published (the SAME frames the local link carries: lote, alta, cambio,
//      baja, resultado, pulso) because a snapshot (up to 16 KB) does not fit the game socket (frames over 1 KB are refused there).
// THREAT, in plain words. `Origin: null` is what EVERY sandboxed or data: page sends, from any site: it proves nothing, so it is never enough on its own.
// What lets a request in is (a) the world has `embed.activa: true` in its espejo.json, (b) the request comes from this machine (loopback, no proxy header)
// and (c) it carries a valid, unexpired credential. Without (a) the route does not exist (404, as always); the game socket never checked Origin and still
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
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600" };

export function crearEmbedHttp(o: Opciones) {
  const ahora = o.reloj ?? Date.now, log = o.log ?? (() => {});
  const responder = (res: ServerResponse, code: number, body: Record<string, unknown>) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS }); res.end(JSON.stringify({ v: 1, ...body })); };
  let fichas = RAFAGA, recarga = ahora(); // one bucket for the whole embed (a single owner publishes): the link's own rate
  return {
    /** Answers POST/OPTIONS /espejo/embed; false = not ours (embed off, or another path): the route does not exist then. */
    atender(method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean {
      if (path !== RUTA || !o.activo()) return false;
      if (method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return true; }
      if (method !== "POST") { responder(res, 405, { ok: false, motivo: "solo POST" }); return true; }
      const h = req.headers;
      if (!esLoopback(req.socket.remoteAddress) || h["x-forwarded-for"] !== undefined || h.forwarded !== undefined) { responder(res, 403, { ok: false, motivo: "el modo embebido solo acepta a esta máquina" }); return true; }
      const cred = /^Bearer\s+(\S+)$/i.exec(String(h.authorization ?? ""))?.[1];
      if (!verificarCredencial(o.clave(), cred, ahora())) { responder(res, 401, { ok: false, motivo: "credencial de embed ausente, caducada o no válida" }); return true; }
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
