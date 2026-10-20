// habitantes-http: the door numinia.com's owner panel uses to manage a world's own AI inhabitants over HTTP — camino
// A of «Add an AI» (B is an outside agent, agentes-http.ts). Same shape as that door, on purpose:
//   GET    /habitantes        -> { habitantes: [{ id, nombre, escalon }] }
//   POST   /habitantes        -> body: a whole habitante@1 object (the same as the chat order, once it exists) (201)
//   DELETE /habitantes/<id>   -> the inhabitant's file is deleted (200)
// Who may: whoever carries a numinia.com world pass (the same verifier as the WebSocket, `aud` = this world) that
// holds `manage-organization` or is an owner (`dueno`). No pass configured at all = the door is shut (404, fail
// closed). 401 = no/invalid pass, 403 = a valid pass without the permission.
// CORS: only https://numinia.com (the panel's origin) is answered; any other Origin gets no CORS header. Never `*`.
// The work itself is done by habitantes.ts's GestionHabitantes (one code path, shared with the future chat order);
// this file only speaks HTTP. After a write, the service that walks and talks the inhabitants is told to reload
// (GestionHabitantes' own `recargar`): this door never restarts anything itself.
import type { IncomingMessage, ServerResponse } from "node:http";
import { verificarPase } from "./pase.ts";
import type { ConfigPase } from "./pase.ts";
import type { GestionHabitantes, ResultadoHabitante } from "./habitantes.ts";

/** The one browser origin allowed to call this door (same as agentes-http.ts). */
export const ORIGEN_PANEL = "https://numinia.com";
/** The permission (numinia.com's STD-051 name) that lets a pass manage the world's inhabitants. */
export const PERMISO_HABITANTES = "manage-organization";
const CUERPO_MAX = 16_384; // bytes of a POST body: a whole habitante@1 (persona, ruta, saludo, respuestas…) fits

export type OpcionesHabitantesHttp = {
  pase: ConfigPase | null;                 // the world's pass settings; null = the door is disabled
  habitantes: () => GestionHabitantes | null; // null until the engine has started it
  ahora?: () => number;                    // the clock (ms); default Date.now
  log?: (line: string) => void;
};

const STATUS: Record<string, number> = { invalido: 400, conflicto: 409, "no-hay": 404, servidor: 500 };

export function crearHabitantesHttp(o: OpcionesHabitantesHttp) {
  const ahora = o.ahora ?? Date.now;

  const responder = (res: ServerResponse, origen: string | undefined, code: number, body: unknown, extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin", ...extra };
    if (origen === ORIGEN_PANEL) h["access-control-allow-origin"] = ORIGEN_PANEL;
    res.writeHead(code, h);
    res.end(JSON.stringify(body));
  };

  const leerCuerpo = (req: IncomingMessage): Promise<string | null> => new Promise((ok) => {
    let cuerpo = "", n = 0, fin = false;
    req.setEncoding("utf8");
    req.on("data", (c: string) => { n += Buffer.byteLength(c); if (n > CUERPO_MAX) { if (!fin) { fin = true; ok(null); } } else cuerpo += c; });
    req.on("end", () => { if (!fin) ok(cuerpo); });
    req.on("error", () => { if (!fin) ok(null); });
  });

  /** True when the request was for this door (and has been answered). */
  const atender = (method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean => {
    const m = /^\/habitantes(?:\/([^/]*))?\/?$/.exec(path);
    if (!m) return false;
    const origen = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

    if (method === "OPTIONS") { // preflight: no pass is sent with it
      const h: Record<string, string> = { vary: "Origin", "cache-control": "no-store" };
      if (origen === ORIGEN_PANEL) {
        h["access-control-allow-origin"] = ORIGEN_PANEL;
        h["access-control-allow-methods"] = "GET,POST,DELETE,OPTIONS";
        h["access-control-allow-headers"] = "Authorization, Content-Type";
        h["access-control-max-age"] = "600";
      }
      res.writeHead(204, h); res.end();
      return true;
    }
    if (!o.pase) { // fail closed: a world that checks no passes cannot tell who is asking
      responder(res, origen, 404, { error: "habitantes-desactivado", texto: "Este mundo no acepta pases de numinia.com (falta MOTOR_PASE_CLAVE): la gestión de habitantes por HTTP está desactivada." });
      return true;
    }
    let id: string | null = null;
    try { id = m[1] ? decodeURIComponent(m[1]) : null; } catch { responder(res, origen, 400, { error: "id", texto: "El id de la ruta no está bien escrito." }); return true; }
    if (!((method === "GET" || method === "POST") ? id === null : method === "DELETE" && id !== null)) {
      const hay = id === null ? "GET, POST, OPTIONS" : "DELETE, OPTIONS";
      responder(res, origen, 405, { error: "metodo", texto: `Aquí vale: ${hay}.` }, { allow: hay });
      return true;
    }

    // who is asking: the world pass, checked as the WebSocket checks it
    const cab = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = /^Bearer\s+(\S+)\s*$/i.exec(cab)?.[1];
    if (!token) { responder(res, origen, 401, { error: "sin-pase", texto: "Falta el pase de numinia.com: envíalo en la cabecera Authorization: Bearer ***" }, { "www-authenticate": "Bearer" }); return true; }
    const v = verificarPase(token, o.pase.clave, { aud: o.pase.mundo, now: Math.floor(ahora() / 1000), org: o.pase.org });
    if (!v.ok) { o.log?.(`[habitantes] pase rechazado en HTTP: ${v.motivo}`); responder(res, origen, 401, { error: v.motivo, texto: v.texto }, { "www-authenticate": "Bearer" }); return true; }
    if (!v.pase.dueno && !v.pase.permisos.includes(PERMISO_HABITANTES)) {
      responder(res, origen, 403, { error: "sin-permiso", texto: "Tu pase no deja gestionar los habitantes de este mundo: hace falta el permiso de gestionar la organización." });
      return true;
    }
    const g = o.habitantes();
    if (!g) { responder(res, origen, 503, { error: "arrancando", texto: "El mundo está arrancando; vuelve a probar en un momento." }); return true; }

    const fin = (r: ResultadoHabitante, okCode: number) => {
      if (r.ok) responder(res, origen, okCode, { ok: true, texto: r.texto, ...(r.habitante ? { habitante: r.habitante } : {}) });
      else responder(res, origen, STATUS[r.motivo], { error: r.motivo, texto: r.texto });
    };
    if (method === "GET") { responder(res, origen, 200, { habitantes: g.listar() }); return true; }
    if (method === "DELETE") { fin(g.quitar(id!), 200); return true; }

    // POST: the body is a whole habitante@1 object (validated by validarHabitante inside GestionHabitantes.anadir)
    void leerCuerpo(req).then((txt) => {
      if (txt === null) {
        res.once("finish", () => req.destroy());
        return responder(res, origen, 413, { error: "grande", texto: `El cuerpo pasa de ${CUERPO_MAX} bytes.` }, { connection: "close" });
      }
      let b: unknown;
      try { b = JSON.parse(txt); } catch { return responder(res, origen, 400, { error: "json", texto: "El cuerpo no es JSON." }); }
      fin(g.anadir(b), 201);
    });
    return true;
  };

  return { atender };
}
