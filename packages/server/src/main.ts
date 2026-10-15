// server entry point. Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
// One port: WebSocket (any path; Caddy passes /ws) · GET /health · GET /metrics · the features' routes.
// Composition root: one of the few files allowed to import features/ (tools/layers.json, "_composition").
import { startServer } from "./server.ts";
import funciones from "../../../features/servidor.ts";
import { conMundo } from "../../../features/mundo.ts";
import { leerMundo } from "./mundo.ts";

const srv = await startServer({
  port: Number(process.env.PORT ?? 8790),
  host: process.env.HOST ?? "127.0.0.1",
  statsMs: Number(process.env.STATS_MS ?? 30000),
  // SIN_FUNCIONES=1: the bare engine · MUNDO_DIR: a world's own environment and elements (entorno.json, elementos.json; H4)
  features: process.env.SIN_FUNCIONES === "1" ? [] : process.env.MUNDO_DIR ? conMundo(funciones, leerMundo(process.env.MUNDO_DIR)) : funciones,
  sesiones: process.env.SESIONES_DIR ?? "informes/sesiones",     // T1: how each player entered (installed: /var/lib/numinia-motor/sesiones)
  datos: process.env.DATOS_DIR ?? ".run/datos",                   // S4: what features keep across restarts (installed: /var/lib/numinia-motor/datos)
  construir: process.env.MOTOR_CONSTRUIR === "todos" ? "todos" : "nadie", // H1: open building to everyone (home plaza) or nobody (default); H3 = roles
  subidas: process.env.ACTIVOS_DIR ?? `${process.env.DATOS_DIR ?? ".run/datos"}/activos`, // H9: uploaded files by sha256, next to the saved world (installed: /var/lib/numinia-motor/datos/activos); activos/ is always served
  aventura: process.env.AVENTURA_DIR === "" ? null : (process.env.AVENTURA_DIR ?? "aventuras/ejemplo"), // J5: quests, people, things (AVENTURA_DIR= for none)
  // /mundo: a world uploaded as a zip is swapped in, then the process leaves; under systemd (INVOCATION_ID) it is started
  // again with the new world. By hand (tools/plaza.sh, npm run server) it stays stopped and the log says to restart it.
  admin: process.env.MOTOR_ADMIN,
  reiniciar: () => { if (process.env.INVOCATION_ID) process.exit(0); else console.log("[mundo] mundo cambiado y servidor parado: arráncalo otra vez para usarlo"); },
});

// systemd (and tools/plaza.sh) stop the server with SIGTERM: close every connection first so each session
// that reported gets its closing line written (T1), then leave; never wait more than 2 s.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    setTimeout(() => process.exit(0), 2000).unref();
    void srv.close().then(() => process.exit(0));
  });
}
