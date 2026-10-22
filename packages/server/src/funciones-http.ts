// funciones-http (e1): the door numinia.com's admin panel uses to switch a world's functions over HTTP, without entering the world.
// Same shape as habitantes-http.ts / agentes-http.ts, on purpose:
//   GET  /funciones  -> { funciones: [{ id: "normas"|"dardos"|"pesca", activa, fija }] }   (only the ones this world has)
//   POST /funciones  -> body { funcion, activa } -> 200 { ok, funcion: {id, activa, fija}, funciones: [...] }
// «normas» = Normas de entrada (the gate of the conditions of entry: Numinia's + the community's, one gate). `puerta` is accepted as its
// other name on POST. Encendiendo las normas solo se pide aceptar a quien llega después; quien ya está dentro sigue (as the intent does).
// Who may: whoever carries a numinia.com world pass (the same verifier as the WebSocket, `aud` = this world) that holds
// `manage-organization` or is an owner (`dueno`). No pass configured at all = the door is shut (404, fail closed). 401 = no/invalid pass,
// 403 = a valid pass without the permission. 409 = the server pins the function (`fija`) or funciones.json is wrong; 400 = unknown function
// or a body that is not { funcion: string, activa: boolean }; 404 = this world lacks that function or does not run the piece.
// CORS: only https://numinia.com (the panel's origin) is answered; any other Origin gets no CORS header. Never `*`.
// ONE code path: the work is done by the `funciones` piece (features/funciones/server.ts `cambiar`), the same the intent `poner` runs: it writes
// funciones.json atomically and tells every connected page. This file only speaks HTTP. The log says who changed it (the pass's `sub`).
import type { IncomingMessage, ServerResponse } from "node:http";
import { verificarPase } from "./pase.ts";
import type { ConfigPase } from "./pase.ts";
import type { CambioFuncion, EnlaceFunciones } from "../../feature/src/index.ts";

/** The one browser origin allowed to call this door (same as agentes-http.ts). */
export const ORIGEN_PANEL = "https://numinia.com";
/** The permission (numinia.com's STD-051 name) that lets a pass manage the world (same as the other doors). */
export const PERMISO_FUNCIONES = "manage-organization";
const CUERPO_MAX = 1_024; // bytes of a POST body: { funcion, activa } is ~40
const OTRO_NOMBRE: Record<string, string> = { puerta: "normas" };

export type OpcionesFuncionesHttp = {
  pase: ConfigPase | null;                      // the world's pass settings; null = the door is disabled
  enlace: () => EnlaceFunciones | null;         // the `funciones` piece's seam; null = this server does not run it
  ahora?: () => number;                         // the clock (ms); default Date.now
  log?: (line: string) => void;
};

const STATUS: Record<string, number> = { desconocida: 400, ausente: 404, fija: 409, fichero: 409, servidor: 500, arrancando: 503 };

export function crearFuncionesHttp(o: OpcionesFuncionesHttp) {
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
    if (!/^\/funciones\/?$/.test(path)) return false;
    const origen = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

    if (method === "OPTIONS") { // preflight: no pass is sent with it
      const h: Record<string, string> = { vary: "Origin", "cache-control": "no-store" };
      if (origen === ORIGEN_PANEL) {
        h["access-control-allow-origin"] = ORIGEN_PANEL;
        h["access-control-allow-methods"] = "GET,POST,OPTIONS";
        h["access-control-allow-headers"] = "Authorization, Content-Type";
        h["access-control-max-age"] = "600";
      }
      res.writeHead(204, h); res.end();
      return true;
    }
    if (!o.pase) { // fail closed: a world that checks no passes cannot tell who is asking
      responder(res, origen, 404, { error: "funciones-desactivado", texto: "Este mundo no acepta pases de numinia.com (falta MOTOR_PASE_CLAVE): cambiar sus funciones por HTTP está desactivado." });
      return true;
    }
    if (method !== "GET" && method !== "POST") {
      responder(res, origen, 405, { error: "metodo", texto: "Aquí vale: GET, POST, OPTIONS." }, { allow: "GET, POST, OPTIONS" });
      return true;
    }

    // who is asking: the world pass, checked as the WebSocket checks it
    const cab = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = /^Bearer\s+(\S+)\s*$/i.exec(cab)?.[1];
    if (!token) { responder(res, origen, 401, { error: "sin-pase", texto: "Falta el pase de numinia.com: envíalo en la cabecera Authorization: Bearer <pase>" }, { "www-authenticate": "Bearer" }); return true; }
    const v = verificarPase(token, o.pase.clave, { aud: o.pase.mundo, now: Math.floor(ahora() / 1000), org: o.pase.org });
    if (!v.ok) { o.log?.(`[funciones] pase rechazado en HTTP: ${v.motivo}`); responder(res, origen, 401, { error: v.motivo, texto: v.texto }, { "www-authenticate": "Bearer" }); return true; }
    if (!v.pase.dueno && !v.pase.permisos.includes(PERMISO_FUNCIONES)) {
      responder(res, origen, 403, { error: "sin-permiso", texto: "Tu pase no deja cambiar las funciones de este mundo: hace falta el permiso de gestionar la organización." });
      return true;
    }
    const e = o.enlace();
    if (!e) { responder(res, origen, 404, { error: "sin-funciones", texto: "Este servidor no corre las funciones del mundo (normas, dardos, pesca)." }); return true; }
    const estado = e.estado();
    if (!estado) { responder(res, origen, 503, { error: "arrancando", texto: "El mundo está arrancando; vuelve a probar en un momento." }); return true; }

    if (method === "GET") { responder(res, origen, 200, { funciones: estado }); return true; }

    // POST { funcion, activa }
    const quien = `el pase ${v.pase.sub}`;
    void leerCuerpo(req).then((txt) => {
      if (txt === null) {
        res.once("finish", () => req.destroy());
        return responder(res, origen, 413, { error: "grande", texto: `El cuerpo pasa de ${CUERPO_MAX} bytes.` }, { connection: "close" });
      }
      let b: unknown;
      try { b = JSON.parse(txt); } catch { return responder(res, origen, 400, { error: "json", texto: "El cuerpo no es JSON." }); }
      const c = (typeof b === "object" && b !== null && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
      if (typeof c.funcion !== "string" || typeof c.activa !== "boolean") return responder(res, origen, 400, { error: "invalido", texto: "El cuerpo es { \"funcion\": \"normas\"|\"dardos\"|\"pesca\", \"activa\": true|false }." });
      const r: CambioFuncion = e.cambiar(OTRO_NOMBRE[c.funcion] ?? c.funcion, c.activa, quien);
      if (!r.ok) return responder(res, origen, STATUS[r.motivo] ?? 500, { error: r.motivo, texto: r.motivo === "fija" ? "Lo fija el servidor. " + r.texto : r.texto });
      responder(res, origen, 200, { ok: true, funcion: r.estado, funciones: e.estado() ?? [] });
    });
    return true;
  };

  return { atender };
}
