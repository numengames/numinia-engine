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
import { aparicionDelMundo, conMundo, enlaceDardosDelMundo, sueloDelMundo, vueloDelMundo } from "../../../features/mundo.ts";
import { leerMundo, escribirMundo } from "./mundo.ts";
import { carpetaMundo, claves, escribirManifiesto, sembrar } from "./mundo-carpeta.ts";
import { infoMotor } from "./version.ts";
import { configPase } from "./pase.ts";
import { puertaDeEntorno } from "./condiciones.ts";
import { intervaloDeEntorno } from "./condiciones-fuente.ts"; // condiciones/w4
import { pensadorDeCable } from "./cable-ia.ts";

const env = process.env;
const log = (l: string) => console.log(l);
// H3b: numinia.com's world pass. A key that is set but wrong stops the start here, with what to fix (fail closed).
const cfgPase = configPase(env);
if (!cfgPase.ok) { console.error(`[pase] no arranco: ${cfgPase.error}`); process.exit(1); }
const c = env.MOTOR_MUNDO ? carpetaMundo(env.MOTOR_MUNDO) : null;
if (c) {
  sembrar(c, log);
  escribirManifiesto(c, infoMotor());
  log(`[mundo] carpeta del mundo: ${c.raiz} (datos/, aventura/, entorno/, sesiones/)`);
}
const k = claves(env, c, log);
const datos = env.DATOS_DIR || c?.datos || ".run/datos";
const entorno = env.MUNDO_DIR || c?.entorno || null;
libroDeEntorno(env, datos, log); // MIS-248: the book of world facts, off unless MOTOR_EVENTOS=si (the pieces that write to it come in the next cards)
const leerEntorno = entorno ? leerMundo(entorno) : null; // the world's entorno/ folder (entorno.json, elementos.json; H4)

const srv = await startServer({
  port: Number(env.PORT ?? 8790),
  host: env.HOST ?? "127.0.0.1",
  statsMs: Number(env.STATS_MS ?? 30000),
  // SIN_FUNCIONES=1: the bare engine · the world's own environment and elements (entorno.json, elementos.json; H4)
  features: env.SIN_FUNCIONES === "1" ? [] : leerEntorno ? conMundo(funciones, leerEntorno, log, entorno ? escribirMundo(entorno, log) : undefined, { decir: pensadorDeCable(env, log) }) : funciones,
  aparicion: leerEntorno ? aparicionDelMundo(leerEntorno, log) : null,  // where people appear (entorno.json `aparicion`; a tower's floor)
  enlaceDardos: leerEntorno ? enlaceDardosDelMundo(leerEntorno, log) : undefined, // dardos enlazados (E1): where this world's AR darts go (dardos.json `enlace`); told to the page in /status
  suelo: leerEntorno ? sueloDelMundo(leerEntorno, log) : null,          // D-045: under `sueloMinimo` you come back to your last safe spot
  vuelo: leerEntorno ? vueloDelMundo(leerEntorno, log) : null,          // H2: who may fly (entorno.json `vuelo`: nadie · constructores · todos)
  sesiones: env.SESIONES_DIR || c?.sesiones || "informes/sesiones", // T1: how each player entered
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

// systemd, the container (docker stop) and tools/plaza.sh stop the server with SIGTERM: close every connection first
// so each session that reported gets its closing line written (T1) and the features' data is flushed, then leave;
// never wait more than 2 s (a container gets 10 s before SIGKILL).
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    setTimeout(() => process.exit(0), 2000).unref();
    void srv.close().then(() => process.exit(0));
  });
}
