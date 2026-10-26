// apps-http (M20): the door an ADMIN uses to read, edit and reload a world app's script without restarting the world.
//   GET  /apps/<id>/main.ts        -> the script's text (text/plain)
//   PUT  /apps/<id>/main.ts        -> body = the new text; it is tried in a throwaway sandbox, written atomically, then swapped in
//   POST /apps/<id>/recargar       -> re-read the folder from disk and swap the script in (after an edit by file)
// Who may (admin only; a script is server code, never shown or changed from a page): whoever carries a numinia.com world pass for
// this world that holds `manage-organization` or is an owner (as /funciones), OR the world's administration code as a Bearer token
// (as /mundo; timing-safe, 5 wrong codes in 10 minutes = 429). No pass configured and no code = the door is shut (404, fail closed).
// 401 = nothing valid, 403 = a valid pass without the permission, 404 = no such app/script, 413 = text over the main.ts cap,
// 422 = the new text does not load (and nothing was written), 429 = too many wrong codes.
// CORS: only https://numinia.com (the panel's origin); never `*`.
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { APP_MAIN_MAX } from "./apps.ts";
import type { EjecutorApps, ResultadoRecarga } from "./apps-ejecutar.ts";
import { ORIGEN_PANEL, PERMISO_FUNCIONES } from "./funciones-http.ts";
import { verificarPase } from "./pase.ts";
import type { ConfigPase } from "./pase.ts";

const ADMIN_MIN = 12;           // same floor as mundo-zip.ts: a shorter code is no code
const FALLOS_MAX = 5, FALLOS_VENTANA_MS = 10 * 60_000;
export const RUTA_APPS = /^\/apps\/([a-z0-9][a-z0-9-]{0,31})\/(main\.ts|recargar)\/?$/;

export type OpcionesAppsHttp = {
  pase: ConfigPase | null; admin?: string; ejecutor: () => EjecutorApps; ahora?: () => number; log?: (l: string) => void;
};
const STATUS: Record<string, number> = { ausente: 404, "sin-main": 409, grande: 413, tipos: 422, carga: 422, app: 422 };

export function crearAppsHttp(o: OpcionesAppsHttp) {
  const ahora = o.ahora ?? Date.now;
  const clave = o.admin && o.admin.length >= ADMIN_MIN ? createHash("sha256").update(o.admin).digest() : null;
  let fallos: number[] = [];

  const responder = (res: ServerResponse, origen: string | undefined, code: number, body: unknown, extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin", ...extra };
    if (origen === ORIGEN_PANEL) h["access-control-allow-origin"] = ORIGEN_PANEL;
    res.writeHead(code, h);
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const leerCuerpo = (req: IncomingMessage): Promise<string | null> => new Promise((ok) => {
    const trozos: Buffer[] = []; let n = 0, fin = false;
    req.on("data", (c: Buffer) => { n += c.length; if (n > APP_MAIN_MAX) { if (!fin) { fin = true; ok(null); } } else trozos.push(c); });
    req.on("end", () => { if (!fin) ok(Buffer.concat(trozos).toString("utf8")); });
    req.on("error", () => { if (!fin) ok(null); });
  });

  /** Who is asking: null = allowed; else the answer to give. */
  const autorizar = (req: IncomingMessage): { code: number; error: string; texto: string; extra?: Record<string, string> } | { quien: string } => {
    const token = /^Bearer\s+(\S+)\s*$/i.exec(typeof req.headers.authorization === "string" ? req.headers.authorization : "")?.[1];
    if (!token) return { code: 401, error: "sin-credencial", texto: "Falta el pase de numinia.com o el código de administración: envíalo en la cabecera Authorization: Bearer <…>", extra: { "www-authenticate": "Bearer" } };
    const t = ahora();
    fallos = fallos.filter((x) => t - x < FALLOS_VENTANA_MS);
    if (fallos.length >= FALLOS_MAX) return { code: 429, error: "demasiados-intentos", texto: "Demasiados códigos equivocados; espera diez minutos.", extra: { "retry-after": "600" } };
    if (o.pase && token.split(".").length === 3) {
      const v = verificarPase(token, o.pase.clave, { aud: o.pase.mundo, now: Math.floor(t / 1000), org: o.pase.org });
      if (v.ok) {
        if (v.pase.dueno || v.pase.permisos.includes(PERMISO_FUNCIONES)) return { quien: `el pase ${v.pase.sub}` };
        return { code: 403, error: "sin-permiso", texto: "Tu pase no deja cambiar los scripts de este mundo: hace falta el permiso de gestionar la organización." };
      }
      fallos.push(t); o.log?.(`[apps] pase rechazado en HTTP: ${v.motivo}`);
      return { code: 401, error: v.motivo, texto: v.texto, extra: { "www-authenticate": "Bearer" } };
    }
    if (clave && timingSafeEqual(createHash("sha256").update(token).digest(), clave)) return { quien: "el código de administración" };
    fallos.push(t); o.log?.("[apps] código de administración equivocado (scripts)");
    return { code: 401, error: "credencial", texto: clave || o.pase ? "Ese pase o código no vale." : "Este mundo no tiene pase ni código de administración: los scripts no se pueden cambiar por HTTP.", extra: { "www-authenticate": "Bearer" } };
  };

  /** True when the request was for this door (and has been answered). */
  const atender = (method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean => {
    const m = RUTA_APPS.exec(path);
    if (!m) return false;
    const [, id, que] = m;
    const origen = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (method === "OPTIONS") {
      const h: Record<string, string> = { vary: "Origin", "cache-control": "no-store" };
      if (origen === ORIGEN_PANEL) { h["access-control-allow-origin"] = ORIGEN_PANEL; h["access-control-allow-methods"] = "GET,PUT,POST,OPTIONS"; h["access-control-allow-headers"] = "Authorization, Content-Type"; h["access-control-max-age"] = "600"; }
      res.writeHead(204, h); res.end();
      return true;
    }
    if (!o.pase && !clave) { responder(res, origen, 404, { error: "scripts-desactivado", texto: "Este mundo no acepta pases de numinia.com ni tiene código de administración: cambiar sus scripts por HTTP está desactivado." }); return true; }
    const permitido = que === "main.ts" ? ["GET", "PUT"] : ["POST"];
    if (!permitido.includes(method)) { responder(res, origen, 405, { error: "metodo", texto: `Aquí vale: ${permitido.join(", ")}, OPTIONS.` }, { allow: `${permitido.join(", ")}, OPTIONS` }); return true; }
    const a = autorizar(req);
    if (!("quien" in a)) { responder(res, origen, a.code, { error: a.error, texto: a.texto }, a.extra); return true; }
    const ej = o.ejecutor();
    if (!ej.tiene(id)) { responder(res, origen, 404, { error: "ausente", texto: `No hay una app «${id}» con main.ts corriendo en este mundo.` }); return true; }
    const dar = (r: ResultadoRecarga) => r.ok
      ? responder(res, origen, 200, { ok: true, app: id, version: r.version, sha256: r.sha256, script: ej.estadoDe(id) })
      : responder(res, origen, STATUS[r.motivo] ?? 422, { error: r.motivo, texto: r.detalle });
    if (method === "GET") { const t = ej.leerTexto(id); responder(res, origen, t === null ? 404 : 200, t === null ? { error: "sin-main", texto: "La app no tiene main.ts." } : t); return true; }
    if (method === "POST") { void ej.recargar(id).then((r) => { if (r.ok) o.log?.(`[apps] ${a.quien} recargó «${id}»`); dar(r); }); return true; }
    void leerCuerpo(req).then((txt) => {
      if (txt === null) { res.once("finish", () => req.destroy()); return responder(res, origen, 413, { error: "grande", texto: `El cuerpo pasa de ${APP_MAIN_MAX} bytes (limits.json app_main_max_kb).` }, { connection: "close" }); }
      void ej.escribir(id, txt).then((r) => { if (r.ok) o.log?.(`[apps] ${a.quien} cambió «${id}»/main.ts`); dar(r); });
    });
    return true;
  };

  return { atender };
}
