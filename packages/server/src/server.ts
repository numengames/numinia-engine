// server: one instance process. HTTP + WebSocket on one port, the Instance (authority) behind, 20 Hz loop.
//   WebSocket upgrade on any path (Caddy passes /ws) · GET /health · GET /metrics (JSON, see metrics.ts)
//   GET /sesiones (T1: how each connected player entered; like /metrics, never published by Caddy)
//   /mundo (download the world as a zip, upload one: mundo-zip.ts; only with the administration code)
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { signer } from "./secret.ts";
import { crearRecibos } from "./recibos.ts"; // N10: digital goods' ownership receipts
import { randomBytes, randomInt } from "node:crypto";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { hex } from "../../core/src/index.ts";
import { REFERENCE, referenceRecording, replayFingerprint, TICK_HZ } from "../../sim/src/index.ts";
import type { SpawnArea } from "../../sim/src/index.ts";
import { FASES_TICK, Instance } from "../../instance/src/index.ts";
import type { Suelo } from "../../instance/src/index.ts";
import { construirMalla } from "./colision-mundo.ts";
import { CIERRE_LLENO, CIERRE_SILENCIO, FUNCIONES_DE_ENLACE, MSG, PASE_MAX, WS_FRAME_MAX, esVisitaDeEnlace } from "../../net/src/index.ts";
import type { Transport } from "../../net/src/index.ts";
import type { HttpReply, ServerPart } from "../../feature/src/index.ts";
import { buildMetrics, ByteWindow, CosteTick, cierresVacios, motivoDeCierre, OPENMETRICS, PROM_TEXT, quiereOpenMetrics, TickWindow, toPrometheus } from "./metrics.ts";
import { entorno, Runtime } from "./runtime.ts";
import { KEEP_DAYS, Sesiones } from "./sesiones.ts";
import { FileStorage } from "./datos.ts";
import { Activos, BIBLIOTECA } from "./activos.ts";
import { archivoHashes, CacheHashes, construirManifiesto, type Cosa } from "./manifiesto.ts";
import { avataresDelMundo } from "./avatares-mundo.ts";
import { leerMundo } from "./mundo.ts";
import { Subidas } from "./subidas.ts";
import { CopiaMundo } from "./mundo-zip.ts";
import { Pagina } from "./pagina.ts";
import { infoMotor, semverMotor } from "./version.ts";
import type { Motor } from "./version.ts";
import { nombreDe, today, verificar } from "../../instance/src/identidad.ts";
import { leerFicha, leerTema, lectorAventura } from "./aventura.ts";
import { leerLeemeIA } from "./leeme-ia.ts";
import { crearFichaViva } from "./ficha-viva.ts"; // H7: the ficha while running (the owner edits it from the settings panel)
import { leerCondiciones, PUERTA_POR_DEFECTO } from "./condiciones.ts";
import { crearPuertaCondiciones } from "./condiciones-puerta.ts"; // condiciones/c2: the gate
import { conEnlace, conFicha } from "../../feature/src/index.ts"; // funciones/f1: the switches piece the features bring
import { elegirFuente, iniciarFuente, ESPERA_ARRANQUE_MS } from "./condiciones-fuente.ts"; // condiciones/w4: the community's norms, pulled
import { crearRoles } from "./roles-mundo.ts";
import { configPase } from "./pase.ts";
import { crearAgentesHttp } from "./agentes-http.ts";
import type { ConfigPase } from "./pase.ts";
import type { Who } from "../../instance/src/index.ts";
import { crearHabitantesGestion } from "./habitantes.ts";
import { crearHabitantesHttp } from "./habitantes-http.ts";
import { crearFuncionesHttp } from "./funciones-http.ts";
import { leerApps, listaDeApps } from "./apps.ts"; // M19: the world's apps/ folder, read and validated
import { crearEjecutorApps } from "./apps-ejecutar.ts"; // M20: each app's main.ts runs in the SES sandbox (CPU and memory caps, hot reload)
import type { EjecutorApps } from "./apps-ejecutar.ts";
import { crearAppsHttp } from "./apps-http.ts"; // M20: the admin door that edits and reloads a script
import { MODELO_POR_DEFECTO } from "../../agent/src/cerebro.ts";
import { crearPuerta } from "./puerta.ts";
import { ColaOptimizar } from "./optimizar-cola.ts";
import type { Metrics } from "./metrics.ts";

export type ServerOptions = {
  port: number;          // 0 = any free port (tests)
  host: string;
  maxPlayers?: number;   // default 1000
  statsMs?: number;      // console summary period; default 30000
  silencioMs?: number;   // t_9cb3f636: how long a page that sends heartbeats may say nothing before it is dropped; default SILENCIO_MS (15 s: a frozen page is not a dead one)
  sampleMs?: number;     // byte-rate sample period (kbit/s window = 10 samples); default 1000
  version?: string;      // default: ENGINE_BUILD env, then ../VERSION (written by the installer), then "dev"
  features?: readonly ServerPart[]; // game features (J7): composition roots pass them in
  secret?: string;       // signs QR URLs etc. (api.sign); default: MOTOR_SECRET env; under 16 characters = none
  sesiones?: string | null; // T1: folder for the session log (one JSONL per UTC day); default null = keep in memory only
  datos?: string | null;    // S4: folder where the features' saved state and stores live; default null = memory only
  construir?: "todos" | "nadie"; // H1/H3: whether @todos builds in a NEW world (its roles are stored after that; /construir); default "nadie" (env MOTOR_CONSTRUIR)
  condicionesFuente?: string;    // condiciones/w4: where the community layer is downloaded from (https URL; "no" = never); default: env MOTOR_CONDICIONES_FUENTE, else `comunidad.fuente` of aventura/condiciones.json, else none
  condicionesFuenteMs?: number;  // condiciones/w4: ms between downloads (the env path never goes under 5 minutes); default 15 minutes
  condicionesPuerta?: boolean;   // condiciones/c2: the gate of the conditions of entry (condiciones-puerta.ts): until someone accepts the mandatory norms they stay where they arrived and are not heard or read; default: env MOTOR_CONDICIONES_PUERTA (si|no), else the `puerta` of aventura/condiciones.json, else off
  voz?: boolean;                 // U10: whether microphones are relayed in a NEW world (stored after that; /voz); default: env MOTOR_VOZ, on unless "no"
  biblioteca?: string | null;    // H1: the house library served at /a/<sha256>.<ext>; default the repo's activos/ (null = none)
  subidas?: string | null;       // H1/H9: folder of uploaded files named <sha256>.<ext>; default null (= no uploads)
  subir?: { topesMB?: Partial<Record<string, number>>; totalMB?: number }; // H9: smaller caps (tests); default ficheros.ts
  optimizar?: boolean;           // N22: lighter copies of uploaded .glb in the background (optimizar-cola.ts); default MOTOR_OPTIMIZAR !== "no"
  apps?: string | null;          // M19: the world's apps/ folder (one folder per app: app.json, main.ts, assets/); default null = none. Read at start; GET /apps lists them; their files join /a/; each main.ts runs in the SES sandbox (M20)
  vigilarApps?: boolean;         // M20: reload an app's script when its main.ts changes on disk; default true
  aventura?: string | null;      // J5: the adventure's folder (quests, people, things as text files); default null = none
  agentes?: string;              // P4: the secret that signs AI inhabitants' tickets (env MOTOR_AGENTES_SECRET); none or short = no inhabitants
  dominios?: readonly string[];  // ADR-080: the world's public names an outside agent signs (env MOTOR_DOMINIO, commas); none = the host each connection asks for
  admin?: string;                // the administration code for /mundo and /dueño (env MOTOR_ADMIN; main.ts also ADMIN_CODE); none or short = /mundo answers 403
  pase?: ConfigPase | null;      // H3b: numinia.com's world pass (key, this world's id, org); undefined = read MOTOR_PASE_* from the environment; null = ignore passes
  reiniciar?: () => void;        // after a world was uploaded and swapped in: the installed server exits (systemd starts it again)
  recargarHabitantes?: () => void; // told after /habitantes writes or deletes a file (default: `systemctl restart numinia-habitantes`, best effort)
  mundo?: string | null;         // C2: the world folder (MOTOR_MUNDO): a world upload swaps datos/ aventura/ entorno/ in it
  entorno?: string | null;       // the world's entorno/ folder (entorno.json, elementos.json): travels in the world's zip
  aparicion?: SpawnArea | null;  // where people appear (entorno.json `aparicion`, read by the composition root); none = the house square of 40 m
  vuelo?: "nadie" | "constructores" | "todos" | null; // H2: entorno.json `vuelo` (read by the composition root); none = nobody flies
  suelo?: Suelo | null;          // D-045: entorno.json `sueloMinimo` + `vuelta` (read by the composition root); none = no void
  enlaceDardos?: { servidor: string; diana: string } | null; // dardos enlazados (E1): the darts link this world's AR uses (dardos.json `enlace`, read by the composition root), told to the page in /status; null = off; undefined = not said (the page uses the house link)
  dondeCodigo?: string;          // where the administration code can be read (the /mundo page says it; never the code)
  www?: string | null;           // C1: the built page (WWW_DIR) served on / by the engine itself; null = none (Caddy or vite serve it)
  motor?: Motor;                 // build, full commit and image (version.ts); default infoMotor()
  log?: (line: string) => void;
};

/** WebSocket close code when the world's roles take someone out (taken out, banned, members only): don't reconnect. */
export const CIERRE_ROLES = 4003;
/** H7: WebSocket close code when the world is full (its ficha `aforo`, or the engine's capacity): wait and try again. The
 * reason («lleno <inside>/<aforo>») is what the page turns into its message. Defined in net (the page reads it too). */
export { CIERRE_LLENO, CIERRE_SILENCIO };
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
  /** M20: the apps' scripts (their state, a handler call, a reload). */
  apps: EjecutorApps;
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
  const semver = semverMotor();   // once: /status says which engine version this is (numinia.com reads it to know what a world understands)
  const born = performance.now();
  // ADR-074: what the world is called, from its own folder (aventura/ficha.json); none = the engine's defaults
  const { ficha: ficha0, problemas: fichaMal } = leerFicha(o.aventura ?? null);
  const ficha = ficha0; // the ficha AS IT WAS AT START (its tema and audio stay); the name, cover, avatar and aforo that people may change live are read from `fichaViva` below
  for (const p of fichaMal) log(`[ficha] no se carga: ${p}`);
  const { tema, problemas: temaMal } = leerTema(ficha?.tema); // how its page looks (an event's colours and titles); a bad value drops only itself
  for (const p of temaMal) log(`[ficha] ${p}: lo dejo fuera`);
  // C1: its conditions of entry, from aventura/condiciones.json; none or broken = the house example (said in the log)
  const { condiciones, deFichero: condicionesPropias, problemas: condicionesMal } = leerCondiciones(o.aventura ?? null);
  for (const p of condicionesMal) log(`[condiciones] no se carga, uso las de la casa: ${p}`);
  log(`[condiciones] ${condicionesPropias ? "del mundo" : "de la casa"}: ${condiciones.capas.map((c) => `${c.capa} ${c.version} (${c.puntos.length})`).join(" → ")}`);
  // c2: the gate. Off unless asked (without the bubble of c3 nobody could accept and the world would stay shut): the option (or MOTOR_CONDICIONES_PUERTA),
  // then funciones.json `normas` (f1: the world's own switch, flipped live), then the `puerta` of condiciones.json, then the default.
  const enlaceFunciones = (o.features ?? []).find(conEnlace)?.enlace ?? null; // f1: the features' `funciones` piece, if this server runs it
  const normasEscritas = enlaceFunciones?.normasEscritas();
  const puertaActiva = o.condicionesPuerta ?? normasEscritas ?? condiciones.puerta ?? PUERTA_POR_DEFECTO;
  const puertaCondiciones = crearPuertaCondiciones({ condiciones, activa: puertaActiva, log });
  log(`[condiciones] puerta ${puertaActiva ? "ENCENDIDA: nadie se mueve, habla ni construye hasta aceptar las normas obligatorias" : "apagada (MOTOR_CONDICIONES_PUERTA=si, \"normas\": true en funciones.json o \"puerta\": true en condiciones.json la enciende)"}${o.condicionesPuerta !== undefined ? " · fijada por el entorno del servidor" : normasEscritas !== undefined ? " · según funciones.json" : ""}`);
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
  const lector = lectorAventura(o.aventura ?? null, log);
  // P4: who may enter as an AI inhabitant = the habitantes/ of the adventure, with a ticket of the agents' secret.
  // Its own door (GET/POST/DELETE /habitantes, camino A of «Add an AI») writes and deletes those files and reads
  // the folder again; the separate service that walks and talks them (numinia-habitantes) only reads it at its own
  // start, so a change here calls `recargarHabitantes` once it loads (default: restart that service; env
  // MOTOR_HABITANTES_SIN_RECARGA=1 to skip it, e.g. in tests). `puertaRef` (an id taken by the OTHER kind of AI,
  // agentes/) is filled in once `puerta` exists just below, breaking the chicken-and-egg between the two doors.
  const puertaRef: { puerta: ReturnType<typeof crearPuerta> | null } = { puerta: null };
  const hab = crearHabitantesGestion({
    aventura: o.aventura ?? null, agentesExternos: () => new Set(puertaRef.puerta?.agentes.map((a) => a.id) ?? []),
    recargar: o.recargarHabitantes ?? (process.env.MOTOR_HABITANTES_SIN_RECARGA === "1" ? undefined : () => {
      try { execFileSync("systemctl", ["restart", "numinia-habitantes"], { stdio: "ignore" }); } catch (e) { log(`[habitantes] no he podido recargar numinia-habitantes: ${(e as Error).message}`); }
    }), log,
  });
  // P5a / «Add an AI» historia 2: whether THIS machine can think (a provider key is configured) and which model —
  // read straight from env, same as the inhabitants' service (packages/agent/src/main.ts); the key itself never
  // leaves this scope (only the boolean and the model id reach /status).
  const claveCerebro = process.env.CEREBRO_CLAVE ?? process.env.ANTHROPIC_API_KEY ?? "";
  const cerebroEstado = { pensar: claveCerebro.length >= 20, modelo: process.env.CEREBRO_MODELO || MODELO_POR_DEFECTO };
  // ADR-080: outside agents = the adventure's agentes/ (their public keys); they sign their own a2 tickets
  const dominios = o.dominios ?? (process.env.MOTOR_DOMINIO ?? "").split(",").filter((d) => d.trim());
  const puerta = crearPuerta({ aventura: o.aventura ?? null, habitantes: () => new Set(hab.habitantes.map((h) => h.id)), dominios, log });
  puertaRef.puerta = puerta;
  if (puerta.leer()) log(`[agentes] agentes de fuera que pueden entrar: ${puerta.agentes.map((x) => `${x.nombre} (${x.id}${x.rol ? `, rol ${x.rol}` : ""})`).join(", ")}${dominios.length ? ` · el mundo firma como ${dominios.join(", ")}` : ""}`);
  const roles = crearRoles({
    construir: construir === "todos", voz: o.voz ?? process.env.MOTOR_VOZ !== "no", admin: o.admin ?? process.env.MOTOR_ADMIN, log, firmar: identitySign, pase: cfgPase.pase, puerta,
    habitante: (id) => { const h = hab.habitantes.find((x) => x.id === id); return h ? { escalon: h.escalon, modelo: h.cerebro?.modelo ?? cerebroEstado.modelo, ...(h.apariencia && activos.buscar(h.apariencia.modelo, "glb") ? { apariencia: h.apariencia } : {}) /* no .glb on this server: the robot, never an invisible body */ } : undefined; }, // t_5096d6f4: the eyes of an inhabitant say the size of its model
    cerrar: (e) => { sockets.get(e)?.close(CIERRE_ROLES, "fuera"); }, // the reason went out in the chat just before
  });
  // f1: the «normas» switch exists only if this world has conditions of entry (its own file, a community source, or the gate forced from outside); then the gate's feature is always there (who accepted is kept even while it is off)
  const fuenteElegida = elegirFuente(o.condicionesFuente, o.aventura ?? null, log);
  const normasConInterruptor = !!enlaceFunciones && (condicionesPropias || o.condicionesPuerta !== undefined || fuenteElegida !== undefined);
  enlaceFunciones?.conectar({
    normas: normasConInterruptor ? { fija: o.condicionesPuerta !== undefined, activa: () => puertaCondiciones.activa, poner: (si) => { puertaCondiciones.fijar(si); inst.puertaCambiada(si); log(`[condiciones] puerta ${si ? "ENCENDIDA desde el mundo: solo se pide a quien llegue después; quien ya está dentro sigue" : "APAGADA desde el mundo: quien leía las normas entra"}`); } } : null,
    presentes: (o.features ?? []).map((p) => p.feature.id),
  });
  const funciones = o.features?.length ? [...o.features, roles.part, ...(puertaActiva || normasConInterruptor ? [puertaCondiciones.part] : [])] : o.features; // the gate keeps what people accepted in a feature of its own, only when it is on; no features (bare tests) = the pre-J7 wire
  const puede = (who: Who | null, accion: string) => roles.puede(who, accion);
  const activos = new Activos(o.biblioteca === undefined ? BIBLIOTECA : o.biblioteca, o.subidas ?? null, log);
  // M19: the apps (a bad app is left out and the log says where and why); M20: each good app's main.ts runs in the SES sandbox below
  const apps = leerApps(o.apps ?? null);
  for (const r of apps.rechazadas) for (const i of r.issues) log(`[apps] no se carga «${r.id}»: ${i.path}: ${i.message}`);
  for (const a of apps.apps) activos.agregar(join(a.carpeta, "assets"));
  if (o.apps && (apps.apps.length || apps.rechazadas.length)) log(`[apps] ${apps.apps.length} cargada${apps.apps.length === 1 ? "" : "s"}${apps.rechazadas.length ? `, ${apps.rechazadas.length} rechazada${apps.rechazadas.length === 1 ? "" : "s"}` : ""} (${o.apps})`);
  const ejecutor = crearEjecutorApps({ apps: apps.apps, log, vigilar: o.vigilarApps });
  const scriptsListos = ejecutor.arrancar().catch((e) => log(`[apps] los scripts no arrancaron: ${(e as Error).message}`)); // M20: the worlds listens once the scripts are up (a script that fails to start is reported, never blocks)
  const optimizar = new ColaOptimizar(activos, log, o.optimizar ?? process.env.MOTOR_OPTIMIZAR !== "no"); // N22
  const hashes = new CacheHashes(archivoHashes(o.subidas ?? null)); // M16: the sha256 of every file the manifest lists, kept while the file does not change
  // E3: the world's own avatars (entorno/avatares.json → files in datos/activos/, checked now with the same VRM reader the uploads use); none = nothing told, the world as always
  const avataresMundo = o.entorno ? avataresDelMundo(leerMundo(o.entorno, log), (h, ext) => activos.buscar(h, ext), log) : [];
  optimizar.repasar();
  if (o.aventura) log(`[aventura] ${o.aventura}${existsSync(o.aventura) ? "" : " (no existe: el mundo arranca sin aventura)"}`);
  const agentesSign = signer(o.agentes ?? process.env.MOTOR_AGENTES_SECRET);
  const agentes = agentesSign("probe") ? { sign: agentesSign, nombre: (id: string) => hab.habitantes.find((h) => h.id === id)?.nombre ?? null } : undefined;
  if (hab.habitantes.length) log(`[habitantes] ${hab.habitantes.map((h) => h.nombre).join(", ")}${agentes ? "" : " — sin MOTOR_AGENTES_SECRET: no podrán entrar como IA"}`);
  // the cover: a picture this server has (library or datos/activos/); one it does not have is said once and left out
  const [portadaSha, portadaExt] = ficha?.portada?.split(".") ?? [];
  const portada0 = portadaSha && activos.buscar(portadaSha, portadaExt) ? `/a/${ficha!.portada}` : null;
  if (ficha) log(`[ficha] el mundo se llama «${ficha.nombre}»${ficha.portada ? (portada0 ? `, portada ${portada0}` : `; su portada ${ficha.portada} no está en este servidor (súbela al mundo): no la enseño`) : ""}`);
  // H7: how many may be inside at once = the world's aforo (its ficha) under the engine's capacity; everyone counts (people and AIs)
  if (ficha?.aforo) log(`[ficha] aforo ${ficha.aforo} persona${ficha.aforo === 1 ? "" : "s"}${ficha.aforo > maxPlayers ? ` (el motor admite ${maxPlayers}: ese es el tope)` : ""}${ficha.avatar ? ` · avatar de todos: ${ficha.avatar}` : ""}`);
  else if (ficha?.avatar) log(`[ficha] avatar de todos: ${ficha.avatar}`);
  // H7 (settings panel): the owner changes the title, cover, default avatar and limit live; the file (aventura/ficha.json) is written and these follow it
  const fichaViva = crearFichaViva({ aventura: o.aventura ?? null, ficha, maxPlayers, tieneImagen: (h, ext) => !!activos.buscar(h, ext), dentro: () => { try { return inst.conns.length; } catch { return 0; } }, log, // (the feature asks once while the instance is still being built)
    alCambiarNombre: (n) => { if (pagina) pagina.titulo = n; } });
  const aforo = (): number => fichaViva.aforo();
  const fichaPublica = () => {
    const f = fichaViva.ficha(), [sha, ext] = f?.portada?.split(".") ?? [];
    const portada = sha && activos.buscar(sha, ext) ? `/a/${f!.portada}` : undefined;
    return f ? { nombre: f.nombre, descripcion: f.descripcion, portada, tema: tema ?? undefined, avatar: f.avatar, aforo: aforo(), ...(ficha?.audio ? { audio: ficha.audio } : {}) } : { aforo: aforo() };
  };
  if (pagina) pagina.portada = () => { const p = fichaPublica(); return "portada" in p ? p.portada ?? null : null; }; // MIS-265: the cover in every page's og:image, live as the owner changes it
  (o.features ?? []).find(conFicha)?.ficha.conectar({ ajustes: fichaViva.ajustes, cambiar: fichaViva.cambiar });
  if (o.suelo) log(`[mundo] suelo mínimo ${o.suelo.minimo} m: bajo él se vuelve a la última posición segura${o.suelo.vuelta ? ` (punto de vuelta ${o.suelo.vuelta.x}, ${o.suelo.vuelta.y}, ${o.suelo.vuelta.z})` : ""}`);
  if (o.aparicion) log(`[mundo] la gente aparece en el cuadrado de ${2 * o.aparicion.radio} m centrado en (${o.aparicion.x}, ${o.aparicion.z})`);
  // N10: digital goods' receipts, signed with a key derived from the world's secret (none without MOTOR_SECRET: no goods)
  const recibos = crearRecibos(secret, dominios[0]?.trim() || "local");
  if (recibos) log(`[bienes] los recibos de este mundo los firma ${recibos.emisor}`); else log("[bienes] sin MOTOR_SECRET este mundo no da bienes digitales (no tiene con qué firmar sus recibos)");
  const leerActivo = (h: string, ext: string): Uint8Array | null => { const ruta = activos.buscar(h, ext); if (!ruta) return null; try { return readFileSync(ruta); } catch { return null; } }; // M6 h8: /a/<sha256>.<ext>'s own bytes, for the world's collision mesh
  const inst = new Instance({ seed: 42, capacity: maxPlayers + 24, k: 50, snapshotEvery: 2, reference: { ...REFERENCE, hash: refHash }, features: funciones, sign: signer(secret), log, onReport: (e, r) => sesiones.informe(e, r), storage: datos ?? undefined, identitySign, random: () => randomInt(0, 32) / 32, puede, credencial: roles.credencial, renovarPase: roles.renovar, activo: (h, ext) => activos.buscar(h, ext) !== null, medidas: (h, ext) => activos.medidas(h, ext), trazoPuntos: (h) => activos.trazoPuntos(h), aventura: lector, agentes, externos: { verificar: puerta.verificar }, recibos: recibos ?? undefined, sinVoz: () => !roles.voz, oye: (de, a) => roles.oye(inst.who(de), inst.who(a)), aparicion: o.aparicion ?? null, suelo: o.suelo ?? null, vuelo: o.vuelo ?? "nadie", construirMalla: construirMalla(leerActivo), condiciones: puertaCondiciones }); // U10: the world's voice setting (MOTOR_VOZ=no seeds it off; /voz); M6 h8: malla things build the world's mesh
  // condiciones/w4: the community's norms arrive by themselves (copy in aventura/condiciones-comunidad.json, then a download every few minutes); whoever arrives next is offered the newest
  const fuenteCondiciones = iniciarFuente({ dir: o.aventura ?? null, base: condiciones, fuente: fuenteElegida, log, intervaloMs: o.condicionesFuenteMs, poner: (c, motivo) => { puertaCondiciones.poner(c); if (motivo === "nueva") inst.ofrecerCondiciones(); } });
  const primeraFuente = !fuenteCondiciones.activa ? Promise.resolve() : fuenteCondiciones.conCopia ? (void fuenteCondiciones.actualizar(), Promise.resolve()) : fuenteCondiciones.actualizar(ESPERA_ARRANQUE_MS).then(() => {}); // with no copy yet the first listening waits a few seconds for the first answer
  // H9: uploads (PUT /a/<sha256>.<ext>) by whoever may build; the page shows its guest token (I1) to say who it is
  const subidas = new Subidas({
    dir: o.subidas ?? null, activos, log, topesMB: o.subir?.topesMB, totalMB: o.subir?.totalMB,
    quien: (token) => {
      const v = verificar(identitySign, token, today());
      if (!v) return null;
      const c = inst.conns.find((k) => (k.invitado ?? k.who?.id) === v.id); // connected now: its name and entity (H3: roles per identity; H3b: a numinia.com person is found by the guest token their page still holds)
      return { who: c?.who ?? { id: v.id, nombre: nombreDe(v.id) }, entity: c?.entity ?? -1 };
    },
    puede: (who, entity) => !(puertaCondiciones.activa && (entity >= 0 ? inst.puertaCerrada(entity) : !puertaCondiciones.abierta(who))) && puede(who, "construir"), // the same question every building intent asks (api.puede); c2: and the gate is open for them
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
  const coste = new CosteTick(FASES_TICK, 200); // B2: where each tick's time goes (phases, features)
  const counts = { aceptadas: 0, cerradas: 0, rechazadasLlenas: 0 };
  const cierres = cierresVacios(), cortadosPorSilencio = new Set<number>(); // MIS-233: how each connection ended (a page we cut for silence never answers our close frame: it ends as 1006, so it is remembered here)
  const tickMs = 1000 / TICK_HZ;
  let n = 0, lagMs = 0, start = 0, stopped = false, tickSumMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const metrics = () => buildMetrics({
    version, uptimeMs: performance.now() - born, tick: inst.sim.tick, tickHz: TICK_HZ, people: inst.conns.length,
    capacity: aforo(), ticks, bytes, lagMs, mem: process.memoryUsage(),
    lags, responses, runtime: runtime.window(), entorno: env, counts, cierres, bytesTotal: bytesOut, tickSumMs,
    coste, erroresDe: inst.features.erroresDe, piezasStats: inst.features.stats,
  });

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const reply = (res: ServerResponse, r: HttpReply) => {
    const type = r.type ?? "json";
    const ct = type === "html" ? "text/html; charset=utf-8" : type === "text" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
    res.writeHead(r.status ?? 200, { "content-type": ct, "cache-control": r.cache ?? "no-store", ...(r.cors ? { "access-control-allow-origin": "*" } : {}) });
    res.end(type === "json" ? JSON.stringify(r.body) : String(r.body));
  };
  const agentesHttp = crearAgentesHttp({ pase: cfgPase.pase, agentes: () => roles.agentes, log });
  const habitantesHttp = crearHabitantesHttp({ pase: cfgPase.pase, habitantes: () => hab, log });
  const funcionesHttp = crearFuncionesHttp({ pase: cfgPase.pase, enlace: () => enlaceFunciones, log });
  const appsHttp = crearAppsHttp({ pase: cfgPase.pase, admin: o.admin ?? process.env.MOTOR_ADMIN, ejecutor: () => ejecutor, log });
  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const [path, qs = ""] = (req.url ?? "/").split("?");
    const method = req.method ?? "GET";
    if (method === "GET" && path === "/health") {
      const personas = inst.conns.filter((c) => !c.who?.id.startsWith("ia-") && !c.enlace).length, total = inst.conns.length; // a darts visit from another world (enlace) is not a person here
      return json(res, 200, { ok: true, version, huella: hex(refHash), conectados: total, personas, agentes: total - personas });
    }
    // C4: what the Worlds room of numinia.com reads (no people's names, no positions); people only, not the AI inhabitants;
    // with a ficha (ADR-074) also the world's own name, description and cover (/a/<sha256>.<ext>)
    // STD personas/agentes (Pablo, 17-10): `conectados` stays people-only (numinia.com's room reads it as the room's
    // size); `agentes` and `total` are new. `agentesDe` says whose each agent is: a world inhabitant (habitante, P4,
    // never anyone's but the world's own) or one of numinia.com's organizations (ADR-080, a signed pass), by org id.
    if (method === "GET" && path === "/status") {
      const espacioBaseActivo = () => { for (const [k, v] of inst.features.allState()) if (k === "espacio-base:mundo") return (v as { activa?: boolean }).activa !== false; return false; };
      const agentesConectados = inst.conns.filter((c) => c.who?.id.startsWith("ia-"));
      const visitas = inst.visitasDeEnlace().length; // dardos enlazados: pages of other worlds playing the darts; not people walking this world
      const personas = inst.conns.length - agentesConectados.length - visitas;
      const agentesDe: { habitante: number; organizacion: Record<string, number> } = { habitante: 0, organizacion: {} };
      for (const c of agentesConectados) {
        const org = roles.organizacionDeAgente(c.who!.id);
        if (org) agentesDe.organizacion[org] = (agentesDe.organizacion[org] ?? 0) + 1; else agentesDe.habitante++;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
      return void res.end(JSON.stringify({
        uptime: Math.floor((performance.now() - born) / 1000), conectados: personas, agentes: agentesConectados.length,
        total: inst.conns.length, agentesDe, commitHash: motor.commit ?? undefined, version, ...(semver ? { semver } : {}), cerebro: cerebroEstado,
        ...(cfgPase.pase ? { mundoPase: cfgPase.pase.mundo, pases: roles.pases() } : {}), ...fichaPublica(),
        // H4: the loading screen draws the line mesh only for a world whose espacio base is on (its state is public anyway)
        ...(espacioBaseActivo() ? { espacioBase: true } : {}),
        // t_06071dee: this world has a LEEME-IA.md for AIs (GET /leeme-ia); absent = it has none
        ...(leerLeemeIA(o.aventura ?? null).texto !== null ? { leemeIA: true } : {}),
        // dardos enlazados (E1): where a page of this world sends its AR darts (the Alchemist Tower's board unless dardos.json says otherwise); null = nowhere
        ...(o.enlaceDardos !== undefined ? { dardosEnlace: o.enlaceDardos } : {}), ...(visitas ? { visitas } : {}),
        // E3: the world's own avatars (name, licence, credit): the picker of THIS world offers them; absent when it has none
        ...(avataresMundo.length ? { avatares: avataresMundo } : {}),
      }));
    }
    // t_06071dee: the world's own note for any AI that comes in (aventura/LEEME-IA.md; the MCP bridge hands it to the AI). Public, like /status.
    if (method === "GET" && path === "/leeme-ia") {
      const l = leerLeemeIA(o.aventura ?? null);
      if (l.texto === null) return json(res, 404, { error: l.problema ?? "este mundo no tiene aventura/LEEME-IA.md", pista: "el dueño la escribe en la carpeta del mundo (plantillas/taller/aventura/LEEME-IA.md es el modelo)" });
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
      return void res.end(l.texto);
    }
    if (method === "GET" && path === "/metrics") return json(res, 200, metrics());
    if (method === "GET" && path === "/sesiones") return json(res, 200, { schema: "numinia-engine/sesiones@1", carpeta: sesiones.dir, resumen: sesiones.resumen(), ahora: sesiones.ahora() });
    if (method === "GET" && path === "/metrics.prom") { // B2: OpenMetrics 1.0 when the scraper asks for it, Prometheus text 0.0.4 otherwise
      const om = quiereOpenMetrics(req.headers.accept);
      res.writeHead(200, { "content-type": om ? OPENMETRICS : PROM_TEXT, "cache-control": "no-store", vary: "Accept" });
      return void res.end(toPrometheus(metrics(), { coste, gc: runtime.gcHist, erroresDe: inst.features.erroresDe, guiones: ejecutor.cortes() }, om));
    }
    if ((method === "GET" || method === "HEAD") && path === "/manifiesto.json") { // M16: the zone's files, each with its sha256, size and class (manifiesto.ts)
      const cosas: Cosa[] = [];
      for (const [k, v] of inst.features.allState()) if (k.startsWith("objetos:") && k !== "objetos:siguiente" && v && typeof (v as Cosa).modelo === "string") cosas.push(v as Cosa);
      return void construirManifiesto("principal", cosas, activos, hashes).then((m) => {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-cache" });
        res.end(method === "HEAD" ? undefined : JSON.stringify(m));
      }, (e) => json(res, 500, { error: String((e as Error)?.message ?? e) }));
    }
    if ((method === "GET" || method === "HEAD") && path.startsWith("/a/") && activos.servir(path, res, method === "HEAD", req.headers.range, String(req.headers["accept-encoding"] ?? ""), String(req.headers.accept ?? ""), qs)) return; // H1: files by their sha256; ?px=N a picture's copy for that size
    if ((method === "PUT" || method === "OPTIONS") && path.startsWith("/a/")) return subidas.atender(method, path, req, res); // H9: uploads
    if (agentesHttp.atender(method, path, req, res)) return; // ADR-080: numinia.com's panel manages the outside agents (pass-authenticated)
    if (habitantesHttp.atender(method, path, req, res)) return; // the panel manages this world's own AI inhabitants (pass-authenticated)
    if (appsHttp.atender(method, path, req, res)) return; // M20: an admin edits/reloads an app's script (pass or administration code)
    if (method === "GET" && /^\/apps\/?$/.test(path)) return json(res, 200, listaDeApps(apps, ejecutor.estado())); // M19: what the world's apps are (properties, events, card, files); read-only, no disk paths
    if (funcionesHttp.atender(method, path, req, res)) return; // e1: the panel switches the world's functions (normas, dardos, pesca) (pass-authenticated)
    if (copia.atender(method, path, req, res)) return; // the world as a zip
    if (pagina?.servir(method, path, req, res)) return; // C1: the page (index.html, assets/) when the engine serves it
    if (method !== "GET" && method !== "POST") return json(res, 405, { error: "solo GET o POST" });
    // everything else may be a game feature's route (e.g. the page a QR opens)
    const answer = (body: string) => {
      const r = inst.features.http(method, path, Object.fromEntries(new URLSearchParams(qs)), body);
      if (r) return reply(res, r);
      json(res, 404, { error: `no existe ${method} ${path}`, hay: ["/health", "/status", "/metrics", "/metrics.prom", "/sesiones", "/agentes", "/habitantes", "/funciones", "/apps", "/manifiesto.json", "/leeme-ia", ...inst.features.routes(), "WebSocket en cualquier ruta (/ws)"] });
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
    if (inst.conns.length >= aforo()) { counts.rechazadasLlenas++; ws.close(CIERRE_LLENO, `lleno ${inst.conns.length}/${aforo()}`); return; }
    counts.aceptadas++;
    // dardos enlazados: `?enlace=dardos` = a page of another world that only plays the darts here (no avatar for anybody, darts only)
    const entity = inst.connect(wsTransport(ws), undefined, req.headers.host, esVisitaDeEnlace(req.url) ? FUNCIONES_DE_ENLACE : undefined); // ADR-080: the host an outside agent signs
    sockets.set(entity, ws);
    sesiones.abrir(entity);
    ws.on("close", (code) => { counts.cerradas++; cierres[cortadosPorSilencio.delete(entity) ? "silencio" : motivoDeCierre(code)]++; sockets.delete(entity); sesiones.cerrar(entity, { cierre: code }); inst.disconnect(entity); });
    ws.on("error", () => ws.terminate());
  });

  // t_9cb3f636: a page that sends heartbeats and then goes quiet has lost its connection without closing it: drop it now (its avatar
  // leaves for everyone) instead of waiting minutes for the network. Pages without heartbeats (AIs, bots, old pages) are never judged.
  const vigia = setInterval(() => { for (const e of inst.expirarSilencio(o.silencioMs)) { const ws = sockets.get(e); if (ws) { cortadosPorSilencio.add(e); try { ws.close(CIERRE_SILENCIO, "sin latido"); } catch { /* gone */ } setTimeout(() => ws.terminate(), 1000).unref(); } } }, 250);
  vigia.unref?.();

  // fixed-rate loop: schedule against the start time so timer drift never accumulates
  const loop = () => {
    if (stopped) return;
    const a = performance.now();
    lagMs = a - (start + n * tickMs);
    inst.tick();
    const took = performance.now() - a;
    ticks.record(took); lags.record(Math.max(0, lagMs)); responses.record(Math.max(0, lagMs) + took); tickSumMs += took;
    coste.record(took, inst.fasesMs, inst.features.costes);
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
    stopped = true; clearTimeout(timer); clearInterval(sampler); clearInterval(stats); clearInterval(vigia); fuenteCondiciones.parar(); ejecutor.parar();
    for (const c of wss.clients) c.terminate();
    wss.close(); http.close(); http.closeIdleConnections();
    await Promise.all([sesiones.vaciar(), datos?.flush(), optimizar.parar()]);
  };

  return Promise.all([primeraFuente, scriptsListos]).then(() => new Promise<RunningServer>((ok, ko) => {
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
        port, inst, sesiones, datos, fingerprint: hex(refHash), metrics, optimizar, apps: ejecutor,
        close: () => new Promise<void>((done) => {
          stopped = true; clearTimeout(timer); clearInterval(sampler); clearInterval(stats); clearInterval(vigia); fuenteCondiciones.parar(); runtime.close(); ejecutor.parar();
          for (const c of wss.clients) c.terminate();
          wss.close(); http.close(() => void Promise.all([sesiones.vaciar(), datos?.flush(), optimizar.parar()]).then(() => done()));
        }),
      });
    });
  }));
}
