// enlace-espejo — the local WebSocket link between the engine and an outside source (mundo-hermes, historia 5). Not part of the game port:
// its own listener, on 127.0.0.1 only, started ONLY when the world has an active espejo.json (no file = no socket, nothing listens).
// The OUTSIDE source (a Hermes plugin) opens the connection; nothing connects to it. What it says is JSON, one object per message:
//   engine → source  { v:1, t:"reto", nonce }                                  a fresh random challenge, good for ONE answer
//   source → engine  { v:1, t:"hola", plugin, hermes_version, firma }          firma = HMAC-SHA256(clave, nonce) in hex; the key itself never travels
//   engine → source  { v:1, t:"hola", funciones:[…], zonas:[…], acciones:{…} }  what is ON (what is off is never asked for)
//   source → engine  lote { objetos[] } · alta/cambio/baja { objeto } · resultado { peticion, ok, texto } · pulso
//   engine → source  peticion { id, objeto, verbo, seguridad, quien, caduca } · pulso · error { en, motivo }
//   engine → source  funciones { funciones:[…] }   a person switched a function on or off from inside the world: the NEW full list of what is on
//                    (what just went off must stop being published; what just came on may now be sent with lote). Same list as hola.funciones.
// Refused at the door: any address that is not loopback, any request with an `Origin` header (a web page must not talk to it), a second
// source while one is connected, a message over 16 KB, more than a few messages a second, a wrong or late signature. The engine never
// interprets what comes in beyond the espejo schema, and never runs anything. The key is the world's own (`MOTOR_ENLACE_CLAVE`, made once
// in claves.env, 600, never in the zip) — distinct from MOTOR_SECRET, so a leaked link key cannot forge a pass.
import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

// Layers (tools/layers.json): packages/ never imports features/, so the seam is described here by its shape; the composition root
// (main.ts) hands over features/espejo's `enlace`, which fits it (the test of this file runs against the real one).
type Resultado = { ok: true } | { ok: false; motivo: string; problemas?: { path: string; message: string }[] };
export type Peticion = { id: string; objeto: string; verbo: string; seguridad: string; quien: { id: string; nombre: string }; caduca: number };
export type EnlaceEspejo = {
  funciones(): string[];
  config(): { zonas: { id: string; tipos: string[] }[]; acciones: Record<string, string> } | null;
  alta(objeto: unknown): Resultado; cambio(objeto: unknown): Resultado; baja(ref: { tipo: string; id: string }): Resultado; lote(objetos: unknown[]): Resultado;
  conectada(si: boolean): void; resultado(peticion: string, ok: boolean, texto: string): boolean;
  alPedir(fn: ((p: Peticion) => void) | null): void;
  /** Where a change of the world's switches goes (called with the functions that are ON after each flip). */
  alFunciones?(fn: ((funciones: string[]) => void) | null): void;
};

export const V = 1;
export const MENSAJE_MAX = 16 * 1024;
/** Messages a source may send per second (a token bucket: a burst of RAFAGA, then RITMO per second). A lote counts as one. */
export const RITMO = 20, RAFAGA = 40;
export const RETO_MS = 5000;     // the source has this long to answer the challenge
export const SILENCIO_MS = 45000; // no message (not even a pulso) for this long = the source is gone
export const PULSO_MS = 15000;
export const CIERRE = { MALA_FIRMA: 4401, ORIGEN: 4403, OCUPADO: 4409, GRANDE: 1009, RITMO: 4429, PROTOCOLO: 4400, SILENCIO: 4408 } as const;

export type OpcionesEnlace = {
  enlace: EnlaceEspejo;
  clave: string;              // the shared key (≥ 16 chars, as MOTOR_ENLACE_CLAVE)
  puerto: number;             // 0 = any free port (tests)
  host?: string;              // default 127.0.0.1; anything else is refused at start
  log?: (l: string) => void;
  reloj?: () => number;
  pulsoMs?: number; silencioMs?: number; retoMs?: number;
};
export type EnlaceEscuchando = { puerto: number; conectado(): boolean; close(): Promise<void> };

/** HMAC-SHA256 of the challenge, hex. The source computes the same with the same key. */
export const firmarReto = (clave: string, nonce: string): string => createHmac("sha256", clave).update(`numinia-enlace@1\n${nonce}`).digest("hex");
const igual = (a: string, b: string): boolean => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** Loopback only: IPv4 127.x.x.x, IPv6 ::1, and the IPv4-mapped form. */
export const esLoopback = (ip: string | undefined): boolean => !!ip && (/^127\.\d+\.\d+\.\d+$/.test(ip) || ip === "::1" || /^::ffff:127\.\d+\.\d+\.\d+$/i.test(ip));

export function abrirEnlace(o: OpcionesEnlace): Promise<EnlaceEscuchando> {
  const log = o.log ?? (() => {}), ahora = o.reloj ?? Date.now, host = o.host ?? "127.0.0.1";
  if (!esLoopback(host) && host !== "localhost") return Promise.reject(new Error(`el enlace solo escucha en 127.0.0.1 (se pidió «${host}»)`));
  if (typeof o.clave !== "string" || o.clave.length < 16) return Promise.reject(new Error("el enlace necesita una clave de al menos 16 caracteres (MOTOR_ENLACE_CLAVE)"));
  const http = createServer((_req, res) => { res.statusCode = 404; res.end(); }); // no page, no route: only the upgrade
  const wss = new WebSocketServer({ server: http, maxPayload: MENSAJE_MAX, perMessageDeflate: false });
  let activo: WebSocket | null = null;

  wss.on("connection", (ws, req) => {
    const quitar = (code: number, why: string, nota: string) => { log(`[enlace] rechazada: ${nota}`); try { ws.close(code, why); } catch { /* gone */ } };
    // 1) only this machine; 2) never a web page (a browser always sends Origin; a plugin does not)
    if (!esLoopback(req.socket.remoteAddress)) return quitar(CIERRE.ORIGEN, "solo desde esta máquina", `dirección que no es local (${String(req.socket.remoteAddress).slice(0, 40)})`);
    if (req.headers.origin !== undefined) return quitar(CIERRE.ORIGEN, "origen web no admitido", "tiene cabecera Origin (una página web no puede hablar con el enlace)");
    // 3) one source at a time
    if (activo && activo.readyState === activo.OPEN) return quitar(CIERRE.OCUPADO, "ya hay una fuente conectada", "ya hay una fuente conectada");

    const nonce = randomBytes(24).toString("hex");
    let dentro = false, fichas = RAFAGA, ultimaRecarga = ahora(), ultimoMensaje = ahora();
    const mandar = (m: Record<string, unknown>) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ v: V, ...m })); };
    const cerrar = (code: number, why: string, nota: string) => { log(`[enlace] cierro: ${nota}`); try { ws.close(code, why); } catch { /* gone */ } };
    const plazo = setTimeout(() => { if (!dentro) cerrar(CIERRE.MALA_FIRMA, "sin respuesta al reto", "no contestó al reto a tiempo"); }, o.retoMs ?? RETO_MS);
    const latido = setInterval(() => {
      if (!dentro) return;
      if (ahora() - ultimoMensaje > (o.silencioMs ?? SILENCIO_MS)) return cerrar(CIERRE.SILENCIO, "sin señales", "la fuente dejó de dar señales");
      mandar({ t: "pulso" });
    }, o.pulsoMs ?? PULSO_MS);
    latido.unref?.();
    mandar({ t: "reto", nonce });

    const responder = (r: { ok: boolean; motivo?: string; problemas?: { path: string; message: string }[] }, t: string) => { if (!r.ok) mandar({ t: "error", en: t, motivo: String(r.motivo ?? "no"), problemas: (r.problemas ?? []).slice(0, 5) }); };

    ws.on("message", (data, esBinario) => {
      if (esBinario) return cerrar(CIERRE.PROTOCOLO, "solo texto JSON", "mensaje binario");
      const crudo = data.toString("utf8");
      if (crudo.length > MENSAJE_MAX) return cerrar(CIERRE.GRANDE, "mensaje demasiado grande", "mensaje de más de 16 KB");
      // the rate: a token bucket per connection
      const t = ahora(); fichas = Math.min(RAFAGA, fichas + ((t - ultimaRecarga) / 1000) * RITMO); ultimaRecarga = t;
      if (fichas < 1) return cerrar(CIERRE.RITMO, "demasiado rápido", "más mensajes por segundo de los permitidos");
      fichas -= 1; ultimoMensaje = t;
      let m: Record<string, unknown>;
      try { const x = JSON.parse(crudo); if (typeof x !== "object" || x === null || Array.isArray(x)) throw new Error("no es un objeto"); m = x as Record<string, unknown>; }
      catch { return cerrar(CIERRE.PROTOCOLO, "JSON no válido", "mensaje que no es un objeto JSON"); }
      if (m.v !== V) return cerrar(CIERRE.PROTOCOLO, "versión no admitida", `versión ${String(m.v).slice(0, 8)} (se habla la ${V})`);
      const tipo = String(m.t ?? "");

      if (!dentro) {
        // the first (and only) thing allowed before the handshake is `hola` with the signed challenge
        if (tipo !== "hola") return cerrar(CIERRE.PROTOCOLO, "primero hola", `llegó «${tipo.slice(0, 16)}» antes de hola`);
        const esperada = firmarReto(o.clave, nonce);
        if (typeof m.firma !== "string" || !igual(m.firma, esperada)) return cerrar(CIERRE.MALA_FIRMA, "firma no válida", "firma del reto no válida");
        clearTimeout(plazo); dentro = true; activo = ws;
        const cfg = o.enlace.config();
        mandar({ t: "hola", funciones: o.enlace.funciones(), zonas: (cfg?.zonas ?? []).map((z) => ({ id: z.id, tipos: z.tipos })), acciones: cfg?.acciones ?? {} });
        o.enlace.alPedir((p: Peticion) => mandar({ t: "peticion", id: p.id, objeto: p.objeto, verbo: p.verbo, seguridad: p.seguridad, quien: { id: p.quien.id, nombre: p.quien.nombre }, caduca: p.caduca }));
        o.enlace.alFunciones?.((fs: string[]) => mandar({ t: "funciones", funciones: fs }));
        o.enlace.conectada(true);
        log(`[enlace] conectada la fuente «${String(m.plugin ?? "?").slice(0, 40)}» (${String(m.hermes_version ?? "?").slice(0, 20)})`);
        return;
      }
      switch (tipo) {
        case "pulso": return;
        case "lote": return responder(o.enlace.lote(Array.isArray(m.objetos) ? m.objetos : (null as never)), tipo);
        case "alta": return responder(o.enlace.alta(m.objeto), tipo);
        case "cambio": return responder(o.enlace.cambio(m.objeto), tipo);
        case "baja": return responder(o.enlace.baja((m.objeto ?? {}) as { tipo: string; id: string }), tipo);
        case "resultado": {
          if (typeof m.peticion !== "string" || typeof m.ok !== "boolean") return mandar({ t: "error", en: tipo, motivo: "resultado necesita { peticion: texto, ok: true|false, texto }" });
          if (!o.enlace.resultado(m.peticion, m.ok, String(m.texto ?? ""))) mandar({ t: "error", en: tipo, motivo: "nadie espera esa petición (no existe o ya caducó)" });
          return;
        }
        default: return mandar({ t: "error", en: tipo.slice(0, 24), motivo: "mensaje desconocido (son: lote, alta, cambio, baja, resultado, pulso)" });
      }
    });
    ws.on("close", () => {
      clearTimeout(plazo); clearInterval(latido);
      if (activo === ws) { activo = null; o.enlace.alPedir(null); o.enlace.alFunciones?.(null); o.enlace.conectada(false); log("[enlace] la fuente se desconectó"); }
    });
    ws.on("error", () => ws.terminate());
  });

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(o.puerto, host === "localhost" ? "127.0.0.1" : host, () => {
      const a = http.address();
      const puerto = typeof a === "object" && a ? a.port : o.puerto;
      log(`[enlace] escuchando en 127.0.0.1:${puerto} (solo esta máquina; con reto firmado)`);
      resolve({
        puerto,
        conectado: () => !!activo && activo.readyState === activo.OPEN,
        close: () => new Promise<void>((fin) => { for (const c of wss.clients) c.terminate(); wss.close(() => http.close(() => fin())); }),
      });
    });
  });
}
