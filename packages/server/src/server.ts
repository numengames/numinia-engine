// server: one instance process. HTTP + WebSocket on one port, the Instance (authority) behind, 20 Hz loop.
//   WebSocket upgrade on any path (Caddy passes /ws) · GET /health · GET /metrics (JSON, see metrics.ts)
//   GET /sesiones (T1: how each connected player entered; like /metrics, never published by Caddy)
//   /mundo (download the world as a zip, upload one: mundo-zip.ts; only with the administration code)
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { signer } from "./secret.ts";
import { crearRecibos } from "./recibos.ts"; // N10: digital goods' ownership receipts
import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { hex } from "../../core/src/index.ts";
import { REFERENCE, referenceRecording, replayFingerprint, TICK_HZ } from "../../sim/src/index.ts";
import type { SpawnArea } from "../../sim/src/index.ts";
import { Instance } from "../../instance/src/index.ts";
import type { Suelo } from "../../instance/src/index.ts";
import { construirMalla } from "./colision-mundo.ts";
import { CIERRE_LLENO, MSG, PASE_MAX, WS_FRAME_MAX } from "../../net/src/index.ts";
import type { Transport } from "../../net/src/index.ts";
import type { HttpReply, ServerPart } from "../../feature/src/index.ts";
import { buildMetrics, ByteWindow, TickWindow, toPrometheus } from "./metrics.ts";
import { entorno, Runtime } from "./runtime.ts";
import { KEEP_DAYS, Sesiones } from "./sesiones.ts";
import { FileStorage } from "./datos.ts";
import { Activos, BIBLIOTECA } from "./activos.ts";
import { Subidas } from "./subidas.ts";
import { CopiaMundo } from "./mundo-zip.ts";
import { Pagina } from "./pagina.ts";
import { infoMotor } from "./version.ts";
import type { Motor } from "./version.ts";
import { nombreDe, today, verificar } from "../../instance/src/identidad.ts";
import { leerFicha, leerTema, lectorAventura } from "./aventura.ts";
import { crearRoles } from "./roles-mundo.ts";
import { configPase } from "./pase.ts";
import { crearAgentesHttp } from "./agentes-http.ts";
import type { ConfigPase } from "./pase.ts";
import type { Who } from "../../instance/src/index.ts";
import { leerHabitantes } from "../../agent/src/formato.ts";
import { crearPuerta } from "./puerta.ts";
import { ColaOptimizar } from "./optimizar-cola.ts";
import type { Metrics } from "./metrics.ts";

export type ServerOptions = {
  port: number;          // 0 = any free port (tests)
  host: string;
  maxPlayers?: number;   // default 1000
  statsMs?: number;      // console summary period; default 30000
  sampleMs?: number;     // byte-rate sample period (kbit/s window = 10 samples); default 1000
  version?: string;      // default: ENGINE_BUILD env, then ../VERSION (written by the installer), then "dev"
  features?: readonly ServerPart[]; // game features (J7): composition roots pass them in
  secret?: string;       // signs QR URLs etc. (api.sign); default: MOTOR_SECRET env; under 16 characters = none
  sesiones?: string | null; // T1: folder for the session log (one JSONL per UTC day); default null = keep in memory only
  datos?: string | null;    // S4: folder where the features' saved state and stores live; default null = memory only
  construir?: "todos" | "nadie"; // H1/H3: whether @todos builds in a NEW world (its roles are stored after that; /construir); default "nadie" (env MOTOR_CONSTRUIR)
  voz?: boolean;                 // U10: whether microphones are relayed in a NEW world (stored after that; /voz); default: env MOTOR_VOZ, on unless "no"
  biblioteca?: string | null;    // H1: the house library served at /a/<sha256>.<ext>; default the repo's activos/ (null = none)
  subidas?: string | null;       // H1/H9: folder of uploaded files named <sha256>.<ext>; default null (= no uploads)
  subir?: { topesMB?: Partial<Record<string, number>>; totalMB?: number }; // H9: smaller caps (tests); default ficheros.ts
  optimizar?: boolean;           // N22: lighter copies of uploaded .glb in the background (optimizar-cola.ts); default MOTOR_OPTIMIZAR !== "no"
  aventura?: string | null;      // J5: the adventure's folder (quests, people, things as text files); default null = none
  agentes?: string;              // P4: the secret that signs AI inhabitants' tickets (env MOTOR_AGENTES_SECRET); none or short = no inhabitants
  dominios?: readonly string[];  // ADR-080: the world's public names an outside agent signs (env MOTOR_DOMINIO, commas); none = the host each connection asks for
  admin?: string;                // the administration code for /mundo and /dueño (env MOTOR_ADMIN; main.ts also ADMIN_CODE); none or short = /mundo answers 403
  pase?: ConfigPase | null;      // H3b: numinia.com's world pass (key, this world's id, org); undefined = read MOTOR_PASE_* from the environment; null = ignore passes
  reiniciar?: () => void;        // after a world was uploaded and swapped in: the installed server exits (systemd starts it again)
  mundo?: string | null;         // C2: the world folder (MOTOR_MUNDO): a world upload swaps datos/ aventura/ entorno/ in it
  entorno?: string | null;       // the world's entorno/ folder (entorno.json, elementos.json): travels in the world's zip
  aparicion?: SpawnArea | null;  // where people appear (entorno.json `aparicion`, read by the composition root); none = the house square of 40 m
  suelo?: Suelo | null;          // D-045: entorno.json `sueloMinimo` + `vuelta` (read by the composition root); none = no void
  dondeCodigo?: string;          // where the administration code can be read (the /mundo page says it; never the code)
  www?: string | null;           // C1: the built page (WWW_DIR) served on / by the engine itself; null = none (Caddy or vite serve it)
  motor?: Motor;                 // build, full commit and image (version.ts); default infoMotor()
  log?: (line: string) => void;
};

/** WebSocket close code when the world's roles take someone out (taken out, banned, members only): don't reconnect. */
export const CIERRE_ROLES = 4003;
/** H7: WebSocket close code when the world is full (its ficha `aforo`, or the engine's capacity): wait and try again. The
 * reason («lleno <inside>/<aforo>») is what the page turns into its message. Defined in net (the page reads it too). */
export { CIERRE_LLENO };
/** Largest POST body a feature route accepts. */
export const MAX_BODY = 4096;

export type RunningServer = {
  port: number;
  inst: Instance;
  sesiones: Sesiones;
  datos: FileStorage | null;
  fingerprint: string;
  metrics(): Metrics;
  /** N22: the queue that makes the uploads' lighter copies (tests wait on it). */
  optimizar: ColaOptimizar;
  close(): Promise<void>;
};

/** Total bytes sent over every WebSocket ever opened by this process (survives disconnects). */
let bytesOut = 0;

/** Server end of one WebSocket, behind the engine's Transport interface. */
export function wsTransport(ws: WebSocket): Transport {
  let cb: (b: Uint8Array) => void = () => {};
  const t = {
    sentBytes: 0,
    send(bytes: Uint8Array) { if (ws.readyState === 1) { ws.send(bytes); t.sentBytes += bytes.length; bytesOut += bytes.length; } },
    onMessage(f: (b: Uint8Array) => void) { cb = f; },
  };
  ws.on("message", (data, isBinary) => {
    if (!isBinary || !(data instanceof Buffer)) return; // text frames and fragments are ignored
    // maxPayload is PASE_MAX (the biggest frame any message has); every other type keeps the old WS_FRAME_MAX: over it, close as the WebSocket library used to
    if (data.byteLength > WS_FRAME_MAX && data[0] !== MSG.PASE) { ws.close(1009, "message too big"); return; }
    cb(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  });
  return t;
}

export function engineVersion(): string {
  return infoMotor().build;
}

export function startServer(o: ServerOptions): Promise<RunningServer> {
  const log = o.log ?? ((l: string) => console.log(l));
  const maxPlayers = o.maxPlayers ?? 1000;
  const motor: Motor = o.motor ?? (o.version ? { ...infoMotor(), build: o.version } : infoMotor());
  const version = o.version ?? motor.build;
  const born = performance.now();
  // ADR-074: what the world is called, from its own folder (aventura/ficha.json); none = the engine's defaults
  const { ficha, problemas: fichaMal } = leerFicha(o.aventura ?? null);
  for (const p of fichaMal) log(`[ficha] no se carga: ${p}`);
  const { tema, problemas: temaMal } = leerTema(ficha?.tema); // how its page looks (an event's colours and titles); a bad value drops only itself
  for (const p of temaMal) log(`[ficha] ${p}: lo dejo fuera`);
  const pagina = o.www ? new Pagina(o.www, { titulo: ficha?.nombre ?? null }) : null; // C1: the page from the engine itself (one port per world)

  const t0 = performance.now();
  const refHash = replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n));
  const refMs = Math.round(performance.now() - t0);
  const sesiones = new Sesiones({ dir: o.sesiones ?? null, log });
  const datos = o.datos ? new FileStorage(o.datos, log) : null;
  // I1: guest tokens are signed with the server's secret; without one, with a secret made now (guests are
  // then new after every restart, and the log says so)
  const secret = o.secret ?? process.env.MOTOR_SECRET;
  let identitySign = signer(secret);
  if (!identitySign("probe")) { identitySign = signer(randomBytes(24).toString("hex")); log("[identidad] sin MOTOR_SECRET: los invitados no se reconocen después de reiniciar"); }
  // H3: the world's roles are numinia.com's (roles.ts, roles-mundo.ts): every permission check asks them; a visitor is
  // «@todos», whose «build-in-worlds» the world keeps (--construir / MOTOR_CONSTRUIR only seeds a new world; /construir)
  const construir = o.construir ?? "nadie";
  // H3b: numinia.com's world pass. Settings come from MOTOR_PASE_CLAVE / _MUNDO / _ORG (or `o.pase`); a key that is set but
  // wrong stops the start (fail closed: never a world that thinks it checks passes and does not); no key = passes ignored.
  const cfgPase = o.pase === undefined ? configPase(process.env) : { ok: true as const, pase: o.pase };
  if (!cfgPase.ok) return Promise.reject(new Error(cfgPase.error));
  log(cfgPase.pase ? `[pase] el mundo «${cfgPase.pase.mundo}» acepta pases de numinia.com (clave ${cfgPase.pase.clave.kid}${cfgPase.pase.org ? `, organización ${cfgPase.pase.org}` : ""})` : "[pase] sin MOTOR_PASE_CLAVE: los pases de numinia.com se ignoran (todos entran como invitados)");
  const sockets = new Map<number, WebSocket>();
  // P4: who may enter as an AI inhabitant = the habitantes/ of the adventure, with a ticket of the agents' secret
  const lector = lectorAventura(o.aventura ?? null, log);
  const hab = leerHabitantes(lector("habitantes"));
  for (const p of hab.problemas) log(`[habitantes] no se carga: ${p}`);
  // ADR-080: outside agents = the adventure's agentes/ (their public keys); they sign their own a2 tickets
  const dominios = o.dominios ?? (process.env.MOTOR_DOMINIO ?? "").split(",").filter((d) => d.trim());
  const puerta = crearPuerta({ aventura: o.aventura ?? null, habitantes: () => new Set(hab.habitantes.map((h) => h.id)), dominios, log });
  if (puerta.leer()) log(`[agentes] agentes de fuera que pueden entrar: ${puerta.agentes.map((x) => `${x.nombre} (${x.id}${x.rol ? `, rol ${x.rol}` : ""})`).join(", ")}${dominios.length ? ` · el mundo firma como ${dominios.join(", ")}` : ""}`);
  const roles = crearRoles({
    construir: construir === "todos", voz: o.voz ?? process.env.MOTOR_VOZ !== "no", admin: o.admin ?? process.env.MOTOR_ADMIN, log, firmar: identitySign, pase: cfgPase.pase, puerta,
    cerrar: (e) => { sockets.get(e)?.close(CIERRE_ROLES, "fuera"); }, // the reason went out in the chat just before
  });
  const funciones = o.features?.length ? [...o.features, roles.part] : o.features; // no features (bare tests) = the pre-J7 wire
  const puede = (who: Who | null, accion: string) => roles.puede(who, accion);
  const activos = new Activos(o.biblioteca === undefined ? BIBLIOTECA : o.biblioteca, o.subidas ?? null, log);
  const optimizar = new ColaOptimizar(activos, log, o.optimizar ?? process.env.MOTOR_OPTIMIZAR !== "no"); // N22
  optimizar.repasar();
  if (o.aventura) log(`[aventura] ${o.aventura}${existsSync(o.aventura) ? "" : " (no existe: el mundo arranca sin aventura)"}`);
  const agentesSign = signer(o.agentes ?? process.env.MOTOR_AGENTES_SECRET);
  const agentes = agentesSign("probe") ? { sign: agentesSign, nombre: (id: string) => hab.habitantes.find((h) => h.id === id)?.nombre ?? null } : undefined;
  if (hab.habitantes.length) log(`[habitantes] ${hab.habitantes.map((h) => h.nombre).join(", ")}${agentes ? "" : " — sin MOTOR_AGENTES_SECRET: no podrán entrar como IA"}`);
  // the cover: a picture this server has (library or datos/activos/); one it does not have is said once and left out
  const [portadaSha, portadaExt] = ficha?.portada?.split(".") ?? [];
  const portada = portadaSha && activos.buscar(portadaSha, portadaExt) ? `/a/${ficha!.portada}` : null;
  if (ficha) log(`[ficha] el mundo se llama «${ficha.nombre}»${ficha.portada ? (portada ? `, portada ${portada}` : `; su portada ${ficha.portada} no está en este servidor (súbela al mundo): no la enseño`) : ""}`);
  // H7: how many may be inside at once = the world's aforo (its ficha) under the engine's capacity; everyone counts (people and AIs)
  const aforo = Math.min(ficha?.aforo ?? maxPlayers, maxPlayers);
  if (ficha?.aforo) log(`[ficha] aforo ${ficha.aforo} persona${ficha.aforo === 1 ? "" : "s"}${ficha.aforo > maxPlayers ? ` (el motor admite ${maxPlayers}: ese es el tope)` : ""}${ficha.avatar ? ` · avatar de todos: ${ficha.avatar}` : ""}`);
  else if (ficha?.avatar) log(`[ficha] avatar de todos: ${ficha.avatar}`);
  const fichaPublica = ficha ? { nombre: ficha.nombre, descripcion: ficha.descripcion, portada: portada ?? undefined, tema: tema ?? undefined, avatar: ficha.avatar, aforo } : { aforo };
  if (o.suelo) log(`[mundo] suelo mínimo ${o.suelo.minimo} m: bajo él se vuelve a la última posición segura${o.suelo.vuelta ? ` (punto de vuelta ${o.suelo.vuelta.x}, ${o.suelo.vuelta.y}, ${o.suelo.vuelta.z})` : ""}`);
  if (o.aparicion) log(`[mundo] la gente aparece en el cuadrado de ${2 * o.aparicion.radio} m centrado en (${o.aparicion.x}, ${o.aparicion.z})`);
  // N10: digital goods' receipts, signed with a key derived from the world's secret (none without MOTOR_SECRET: no goods)
  const recibos = crearRecibos(secret, dominios[0]?.trim() || "local");
  if (recibos) log(`[bienes] los recibos de este mundo los firma ${recibos.emisor}`); else log("[bienes] sin MOTOR_SECRET este mundo no da bienes digitales (no tiene con qué firmar sus recibos)");
  const leerActivo = (h: string, ext: string): Uint8Array | null => { const ruta = activos.buscar(h, ext); if (!ruta) return null; try { return readFileSync(ruta); } catch { return null; } }; // M6 h8: /a/<sha256>.<ext>'s own bytes, for the world's collision mesh
  const inst = new Instance({ seed: 42, capacity: maxPlayers + 24, k: 50, snapshotEvery: 2, reference: { ...REFERENCE, hash: refHash }, features: funciones, sign: signer(secret), log, onReport: (e, r) => sesiones.informe(e, r), storage: datos ?? undefined, identitySign, random: () => randomInt(0, 32) / 32, puede, credencial: roles.credencial, renovarPase: roles.renovar, activo: (h, ext) => activos.buscar(h, ext) !== null, medidas: (h, ext) => activos.medidas(h, ext), aventura: lector, agentes, externos: { verificar: puerta.verificar }, recibos: recibos ?? undefined, sinVoz: () => !roles.voz, escenario: (e) => roles.enEscenario(inst.who(e)?.id), oye: (de, a) => roles.oye(inst.who(de), inst.who(a)), aparicion: o.aparicion ?? null, suelo: o.suelo ?? null, construirMalla: construirMalla(leerActivo) }); // U10: the world's voice setting (MOTOR_VOZ=no seeds it off; /voz); M6 h8: malla things build the world's mesh
  // H9: uploads (PUT /a/<sha256>.<ext>) by whoever may build; the page shows its guest token (I1) to say who it is
  const subidas = new Subidas({
    dir: o.subidas ?? null, activos, log, topesMB: o.subir?.topesMB, totalMB: o.subir?.totalMB,
    quien: (token) => {
      const v = verificar(identitySign, token, today());
      if (!v) return null;
      const c = inst.conns.find((k) => (k.invitado ?? k.who?.id) === v.id); // connected now: its name and entity (H3: roles per identity; H3b: a numinia.com person is found by the guest token their page still holds)
      return { who: c?.who ?? { id: v.id, nombre: nombreDe(v.id) }, entity: c?.entity ?? -1 };
    },
    puede: (who) => puede(who, "construir"), // the same question every building intent asks (api.puede)
    guardado: (hash, tipo) => optimizar.pedir(hash, tipo), // N22: its lighter copy, in the background
  });

  // the world as a zip (download / upload): see mundo-zip.ts; `apagar` is filled in below, once the loop exists
  let apagar: () => Promise<void> = async () => {};
  const copia = new CopiaMundo({
    datos: o.datos ?? null, subidas: o.datos ? (o.subidas ?? null) : null, admin: o.admin ?? process.env.MOTOR_ADMIN, version, log,
    aventura: o.aventura ?? null, entorno: o.entorno ?? null, mundo: o.mundo ?? null, dondeCodigo: o.dondeCodigo, motor: { ...motor, build: version },
    vaciar: async () => { await datos?.flush(); }, apagar: () => apagar(),
    reiniciar: o.reiniciar ?? (() => log("[mundo] mundo cambiado: reinicia el servidor para usarlo")),
  });

  const ticks = new TickWindow(200), lags = new TickWindow(200), responses = new TickWindow(200), bytes = new ByteWindow(11);
  const runtime = new Runtime(), env = entorno();
  const counts = { aceptadas: 0, cerradas: 0, rechazadasLlenas: 0 };
  const tickMs = 1000 / TICK_HZ;
  let n = 0, lagMs = 0, start = 0, stopped = false, tickSumMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const metrics = () => buildMetrics({
    version, uptimeMs: performance.now() - born, tick: inst.sim.tick, tickHz: TICK_HZ, people: inst.conns.length,
    capacity: aforo, ticks, bytes, lagMs, mem: process.memoryUsage(),
    lags, responses, runtime: runtime.window(), entorno: env, counts, bytesTotal: bytesOut, tickSumMs,
  });

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const reply = (res: ServerResponse, r: HttpReply) => {
    const type = r.type ?? "json";
    const ct = type === "html" ? "text/html; charset=utf-8" : type === "text" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
    res.writeHead(r.status ?? 200, { "content-type": ct, "cache-control": "no-store" });
    res.end(type === "json" ? JSON.stringify(r.body) : String(r.body));
  };
  const agentesHttp = crearAgentesHttp({ pase: cfgPase.pase, agentes: () => roles.agentes, log });
  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const [path, qs = ""] = (req.url ?? "/").split("?");
    const method = req.method ?? "GET";
    if (method === "GET" && path === "/health") {
      const personas = inst.conns.filter((c) => !c.who?.id.startsWith("ia-")).length, total = inst.conns.length;
      return json(res, 200, { ok: true, version, huella: hex(refHash), conectados: total, personas, agentes: total - personas });
    }
    // C4: what the Worlds room of numinia.com reads (no people's names, no positions); people only, not the AI inhabitants;
    // with a ficha (ADR-074) also the world's own name, description and cover (/a/<sha256>.<ext>)
    // STD personas/agentes (Pablo, 17-10): `conectados` stays people-only (numinia.com's room reads it as the room's
    // size); `agentes` and `total` are new. `agentesDe` says whose each agent is: a world inhabitant (habitante, P4,
    // never anyone's but the world's own) or one of numinia.com's organizations (ADR-080, a signed pass), by org id.
    if (method === "GET" && path === "/status") {
      const agentesConectados = inst.conns.filter((c) => c.who?.id.startsWith("ia-"));
      const personas = inst.conns.length - agentesConectados.length;
      const agentesDe: { habitante: number; organizacion: Record<string, number> } = { habitante: 0, organizacion: {} };
      for (const c of agentesConectados) {
        const org = roles.organizacionDeAgente(c.who!.id);
        if (org) agentesDe.organizacion[org] = (agentesDe.organizacion[org] ?? 0) + 1; else agentesDe.habitante++;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
      return void res.end(JSON.stringify({
        uptime: Math.floor((performance.now() - born) / 1000), conectados: personas, agentes: agentesConectados.length,
        total: inst.conns.length, agentesDe, commitHash: motor.commit ?? undefined, version,
        ...(cfgPase.pase ? { mundoPase: cfgPase.pase.mundo } : {}), ...fichaPublica,
      }));
    }
    if (method === "GET" && path === "/metrics") return json(res, 200, metrics());
    if (method === "GET" && path === "/sesiones") return json(res, 200, { schema: "numinia-engine/sesiones@1", carpeta: sesiones.dir, resumen: sesiones.resumen(), ahora: sesiones.ahora() });
    if (method === "GET" && path === "/metrics.prom") { res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" }); return void res.end(toPrometheus(metrics())); }
    if ((method === "GET" || method === "HEAD") && path.startsWith("/a/") && activos.servir(path, res, method === "HEAD", req.headers.range, String(req.headers["accept-encoding"] ?? ""), String(req.headers.accept ?? ""))) return; // H1: files by their sha256
    if ((method === "PUT" || method === "OPTIONS") && path.startsWith("/a/")) return subidas.atender(method, path, req, res); // H9: uploads
    if (agentesHttp.atender(method, path, req, res)) return; // ADR-080: numinia.com's panel manages the outside agents (pass-authenticated)
    if (copia.atender(method, path, req, res)) return; // the world as a zip
    if (pagina?.servir(method, path, req, res)) return; // C1: the page (index.html, assets/) when the engine serves it
    if (method !== "GET" && method !== "POST") return json(res, 405, { error: "solo GET o POST" });
    // everything else may be a game feature's route (e.g. the page a QR opens)
    const answer = (body: string) => {
      const r = inst.features.http(method, path, Object.fromEntries(new URLSearchParams(qs)), body);
      if (r) return reply(res, r);
      json(res, 404, { error: `no existe ${method} ${path}`, hay: ["/health", "/status", "/metrics", "/metrics.prom", "/sesiones", "/agentes", ...inst.features.routes(), "WebSocket en cualquier ruta (/ws)"] });
    };
    if (method === "GET") return answer("");
    let body = "", size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size <= MAX_BODY) body += chunk;
      else if (size > 64 * MAX_BODY) req.destroy(); // someone streaming without end: cut, no answer
    });
    req.on("end", () => (size > MAX_BODY ? json(res, 413, { error: `cuerpo de más de ${MAX_BODY} bytes` }) : answer(body)));
  });

  // maxPayload = PASE_MAX (2048, H3b): the one message that needs more than the old 1024 is the world pass (600-1300 B). The library
  // checks the size before anything is read, so the biggest legal frame has to fit here; wsTransport cuts the others at WS_FRAME_MAX as before.
  const wss = new WebSocketServer({ server: http, maxPayload: PASE_MAX, perMessageDeflate: false });
  wss.on("connection", (ws, req) => {
    // H7: full = the world's aforo (or the engine's capacity): refused at the door with the reason the page shows
    if (inst.conns.length >= aforo) { counts.rechazadasLlenas++; ws.close(CIERRE_LLENO, `lleno ${inst.conns.length}/${aforo}`); return; }
    counts.aceptadas++;
    const entity = inst.connect(wsTransport(ws), undefined, req.headers.host); // ADR-080: the host an outside agent signs
    sockets.set(entity, ws);
    sesiones.abrir(entity);
    ws.on("close", (code) => { counts.cerradas++; sockets.delete(entity); sesiones.cerrar(entity, { cierre: code }); inst.disconnect(entity); });
    ws.on("error", () => ws.terminate());
  });

  // fixed-rate loop: schedule against the start time so timer drift never accumulates
  const loop = () => {
    if (stopped) return;
    const a = performance.now();
    lagMs = a - (start + n * tickMs);
    inst.tick();
    const took = performance.now() - a;
    ticks.record(took); lags.record(Math.max(0, lagMs)); responses.record(Math.max(0, lagMs) + took); tickSumMs += took;
    n++;
    timer = setTimeout(loop, Math.max(0, start + n * tickMs - performance.now()));
  };
  const sampler = setInterval(() => { bytes.sample(performance.now(), bytesOut, inst.conns.length); runtime.sample(); void sesiones.vaciar(); void datos?.flush(); }, o.sampleMs ?? 1000);
  sampler.unref();
  const stats = setInterval(() => {
    const m = metrics();
    log(`[instancia] tick ${m.tick} · conectados ${m.conectados} · tick p99 ${m.tickMs.p99.toFixed(2)} ms (peor ${m.tickMs.peor.toFixed(2)}) · ${m.kbitPorPersona.toFixed(1)} kbit/s por persona`);
  }, o.statsMs ?? 30000);
  stats.unref();
  // stop the world for good (before a swap of datos/): no tick, nobody connected, no new connections, all written
  apagar = async () => {
    stopped = true; clearTimeout(timer); clearInterval(sampler); clearInterval(stats);
    for (const c of wss.clients) c.terminate();
    wss.close(); http.close(); http.closeIdleConnections();
    await Promise.all([sesiones.vaciar(), datos?.flush(), optimizar.parar()]);
  };

  return new Promise((ok, ko) => {
    http.once("error", ko);
    http.listen(o.port, o.host, () => {
      const addr = http.address();
      const port = typeof addr === "object" && addr ? addr.port : o.port;
      bytes.sample(performance.now(), bytesOut, 0);
      start = performance.now();
      loop();
      log(`[instancia] ws://${o.host}:${port} · 20 Hz · huella de referencia ${hex(refHash)} (${REFERENCE.ticks} ticks, ${refMs} ms) · /health /metrics /sesiones · versión ${version}`);
      if (sesiones.dir) log(`[sesiones] cómo entra cada jugador: ${sesiones.dir}/sesiones-<día UTC>.jsonl (${KEEP_DAYS} días; npm run sesiones)`);
      ok({
        port, inst, sesiones, datos, fingerprint: hex(refHash), metrics, optimizar,
        close: () => new Promise<void>((done) => {
          stopped = true; clearTimeout(timer); clearInterval(sampler); clearInterval(stats); runtime.close();
          for (const c of wss.clients) c.terminate();
          wss.close(); http.close(() => void Promise.all([sesiones.vaciar(), datos?.flush(), optimizar.parar()]).then(() => done()));
        }),
      });
    });
  });
}
