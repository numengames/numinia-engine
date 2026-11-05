// server entry point. Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
// One port: WebSocket (any path; Caddy passes /ws) · GET /health /status · GET /metrics · /mundo · the features'
// routes · the page itself when WWW_DIR is set (the container image does; a bare install leaves it to Caddy).
// Composition root: one of the few files allowed to import features/ (tools/layers.json, "_composition").
//
// C2 — the world folder: MOTOR_MUNDO=<folder> (the image: /mundo; the installer: /var/lib/numinia-motor; tools/plaza.sh:
// .run) holds the whole world — datos/, aventura/ (seeded once from aventuras/ejemplo), entorno/, sesiones/, mundo.json.
// M19: apps/ holds the world's apps (one folder each: app.json, main.ts, assets/; APPS_DIR overrides, APPS_DIR= for none).
// The old variables still win when set (DATOS_DIR, ACTIVOS_DIR, SESIONES_DIR, AVENTURA_DIR, MUNDO_DIR = the folder of
// entorno.json/elementos.json). Without MOTOR_MUNDO: .run/datos, informes/sesiones, aventuras/ejemplo, as before.
// C3 — keys: MOTOR_SECRET or JWT_SECRET; MOTOR_ADMIN or ADMIN_CODE (the fleet's key file); else, with a world folder,
// made once into <mundo>/claves.env (600). Never printed.
// ADR-080 — outside agents (aventura/agentes/, agente@1) sign the world's name: MOTOR_DOMINIO=<public host>[,<other>]
// (e.g. motor.ejemplo.com); unset = the host each connection asks for (fine on a PC).
import { join } from "node:path";
import { startServer } from "./server.ts";
import { libroDeEntorno } from "./eventos.ts";
import funciones from "../../../features/servidor.ts";
import { aparicionDelMundo, conMundo, enlaceDardosDelMundo, sueloDelMundo, temaDelMundo, vueloDelMundo } from "../../../features/mundo.ts";
import { leerMundo, escribirMundo } from "./mundo.ts";
import { carpetaMundo, claveDeEnlace, claves, EJEMPLO, escribirManifiesto, plantillaPorNombre, sembrar } from "./mundo-carpeta.ts";
import { infoMotor } from "./version.ts";
import { configPase } from "./pase.ts";
import { puertaDeEntorno } from "./condiciones.ts";
import { intervaloDeEntorno } from "./condiciones-fuente.ts"; // condiciones/w4
import { pensadorDeCable } from "./cable-ia.ts";
import { abrirEnlace } from "./enlace-espejo.ts";
import { crearEmbedHttp, verificarCredencial } from "./embed-espejo.ts";
import type { ParteConEspejo } from "../../../features/espejo/server.ts";
import { vistaPublica } from "../../../features/espejo/esquema.ts";

const env = process.env;
const log = (l: string) => console.log(l);
// H3b: numinia.com's world pass. A key that is set but wrong stops the start here, with what to fix (fail closed).
const cfgPase = configPase(env);
if (!cfgPase.ok) { console.error(`[pase] no arranco: ${cfgPase.error}`); process.exit(1); }
const c = env.MOTOR_MUNDO ? carpetaMundo(env.MOTOR_MUNDO) : null;
// MOTOR_PLANTILLA: which template a NEW world is born from (plantillas/<name>; unset = taller). A world that exists is never re-born.
const plantilla = plantillaPorNombre(env.MOTOR_PLANTILLA);
if (!plantilla.ok) { console.error(`[mundo] no arranco: ${plantilla.error}`); process.exit(1); }
if (c) {
  sembrar(c, log, EJEMPLO, plantilla.ruta, plantilla.nombre);
  escribirManifiesto(c, infoMotor());
  log(`[mundo] carpeta del mundo: ${c.raiz} (datos/, aventura/, entorno/, sesiones/)`);
}
const k = claves(env, c, log);
const datos = env.DATOS_DIR || c?.datos || ".run/datos";
const entorno = env.MUNDO_DIR || c?.entorno || null;
const libro = libroDeEntorno(env, datos, log); // MIS-248: the book of world facts, off unless MOTOR_EVENTOS=si (the pieces that write to it come in the next cards)
const leerEntorno = entorno ? leerMundo(entorno) : null; // the world's entorno/ folder (entorno.json, elementos.json; H4)

// the features once, so the composition root can find the espejo's seam afterwards (mundo-hermes)
const partes = env.SIN_FUNCIONES === "1" ? [] : leerEntorno ? conMundo(funciones, leerEntorno, log, entorno ? escribirMundo(entorno, log) : undefined, { decir: pensadorDeCable(env, log) }) : funciones;

// found by id, NOT by `conEspejo`: the seam is filled when the instance starts (inside startServer), so before that it has no verbs yet
const parteEspejo = partes.find((p) => p.feature.id === "espejo") as ParteConEspejo | undefined; // mundo-hermes: the espejo's seam — also what /status tells the page
let claveEmbed = ""; // M7: the link key, once known (embed mode needs it to check credentials; no key = no embed)
const embed = parteEspejo ? crearEmbedHttp({ enlace: parteEspejo.enlace, clave: () => claveEmbed, activo: () => !!claveEmbed && parteEspejo.enlace.config?.()?.embed.activa === true, log: (l) => console.log(l) }) : undefined;
const srv = await startServer({
  ...(embed ? { embed: { atender: embed.atender, activo: () => !!claveEmbed && parteEspejo?.enlace.config?.()?.embed.activa === true } } : {}),
  espejo: () => { const cfg = parteEspejo?.enlace.config?.() ?? null; return cfg ? vistaPublica(cfg) : null; },
  port: Number(env.PORT ?? 8790),
  host: env.HOST ?? "127.0.0.1",
  statsMs: Number(env.STATS_MS ?? 30000),
  // SIN_FUNCIONES=1: the bare engine · the world's own environment and elements (entorno.json, elementos.json; H4)
  features: partes,
  aparicion: leerEntorno ? aparicionDelMundo(leerEntorno, log) : null,  // where people appear (entorno.json `aparicion`; a tower's floor)
  enlaceDardos: leerEntorno ? enlaceDardosDelMundo(leerEntorno, log) : undefined, // dardos enlazados (E1): where this world's AR darts go (dardos.json `enlace`); told to the page in /status
  suelo: leerEntorno ? sueloDelMundo(leerEntorno, log) : null,          // D-045: under `sueloMinimo` you come back to your last safe spot
  temaHud: leerEntorno ? temaDelMundo(leerEntorno, log) : null,            // mundo-hermes: entorno.json `tema` (black-and-white: the page's HUD); told in /status
  vuelo: leerEntorno ? vueloDelMundo(leerEntorno, log) : null,          // H2: who may fly (entorno.json `vuelo`: nadie · constructores · todos)
  sesiones: env.SESIONES_DIR || c?.sesiones || "informes/sesiones", // T1: how each player entered
  libro,                                                              // MIS-248: counters of the book go to /metrics.prom
  datos,                                                              // S4: what features keep across restarts
  construir: env.MOTOR_CONSTRUIR === "todos" ? "todos" : "nadie",     // H1: who may build in a NEW world (then its stored roles: /construir)
  condicionesFuente: env.MOTOR_CONDICIONES_FUENTE, condicionesFuenteMs: intervaloDeEntorno(env.MOTOR_CONDICIONES_FUENTE_MIN), // condiciones/w4: where the community's norms are pulled from (https URL, else the file's `comunidad.fuente`), every N minutes (≥ 5)
  condicionesPuerta: puertaDeEntorno(env.MOTOR_CONDICIONES_PUERTA), // condiciones/c2: the gate of the conditions of entry (si|no; unset = the file, else off)
  voz: env.MOTOR_VOZ !== "no",                                        // U10: microphones on in a NEW world (then its stored setting: /voz)
  subidas: env.ACTIVOS_DIR || `${datos}/activos`,                     // H9: uploaded files by sha256, next to the saved world; activos/ is always served
  aventura: env.AVENTURA_DIR === "" ? null : (env.AVENTURA_DIR ?? c?.aventura ?? "aventuras/ejemplo"), // J5: quests, people, things (AVENTURA_DIR= for none)
  apps: env.APPS_DIR === "" ? null : (env.APPS_DIR ?? (c ? join(c.raiz, "apps") : null)), // M19: the world's apps (one folder each); APPS_DIR= for none
  entorno, mundo: c?.raiz ?? null,
  secret: k.secreto, admin: k.admin, dondeCodigo: k.dondeCodigo,
  pase: cfgPase.pase,                                                 // H3b: MOTOR_PASE_CLAVE / MOTOR_PASE_MUNDO / MOTOR_PASE_ORG (none = passes ignored)
  www: env.WWW_DIR || null,                                           // C1: the built page served by the engine itself
  // /mundo: a world uploaded as a zip is swapped in, then the process leaves; under systemd (INVOCATION_ID) or in a
  // container (MOTOR_REINICIO=salir: exit 75, its restart policy — compose.yml «on-failure» — starts it again) it comes
  // back with the new world. By hand (tools/plaza.sh, npm run server) it stays stopped and the log says to restart it.
  reiniciar: () => { if (env.INVOCATION_ID) process.exit(0); else if (env.MOTOR_REINICIO === "salir") process.exit(75); else console.log("[mundo] mundo cambiado y servidor parado: arráncalo otra vez para usarlo"); },
});

// mundo-hermes: the local link of the espejo. Only when the world's espejo.json is on (no file = no socket); 127.0.0.1 only, key from enlace.env.
let enlaceEspejo: Awaited<ReturnType<typeof abrirEnlace>> | null = null;
const cfgEspejo = parteEspejo?.enlace.config() ?? null;
if (parteEspejo && cfgEspejo) {
  const clave = claveDeEnlace(env, c, log);
  if (!clave) log("[enlace] el espejo está encendido pero no hay dónde guardar la clave del enlace (use MOTOR_MUNDO o MOTOR_ENLACE_CLAVE): el enlace no se abre");
  else {
    claveEmbed = clave; parteEspejo.enlace.verificarEmbed((cred) => verificarCredencial(clave, cred));
    try { enlaceEspejo = await abrirEnlace({ enlace: parteEspejo.enlace, clave, puerto: Number(env.MOTOR_ENLACE_PUERTO || cfgEspejo.fuente.puerto), log }); }
    catch (err) { log(`[enlace] no he podido abrir el enlace: ${(err as Error).message}`); }
  }
}

// systemd, the container (docker stop) and tools/plaza.sh stop the server with SIGTERM: close every connection first
// so each session that reported gets its closing line written (T1) and the features' data is flushed, then leave;
// never wait more than 2 s (a container gets 10 s before SIGKILL).
const salir = () => {
  setTimeout(() => process.exit(0), 2000).unref();
  void Promise.all([enlaceEspejo?.close(), srv.close()]).then(() => process.exit(0));
};
for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, salir);
// M9: MOTOR_SALIR_SI_STDIN_CIERRA=1 (Hermes starts the engine with a pipe on stdin): when the pipe ends (Hermes died or closed it) leave the same way as on
// SIGTERM, so the engine is never orphaned. Off unless it is exactly "1": stdin is not even read then.
if (env.MOTOR_SALIR_SI_STDIN_CIERRA === "1") {
  let yaSale = false;
  const alCerrar = () => { if (yaSale) return; yaSale = true; log("[motor] stdin cerrado: salgo (MOTOR_SALIR_SI_STDIN_CIERRA=1)"); salir(); };
  process.stdin.on("end", alCerrar).on("close", alCerrar).on("error", alCerrar).resume();
}
