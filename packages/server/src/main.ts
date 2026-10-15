// server entry point. Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
// One port: WebSocket (any path; Caddy passes /ws) · GET /health · GET /metrics · the features' routes.
// Composition root: one of the few files allowed to import features/ (tools/layers.json, "_composition").
import { startServer } from "./server.ts";
import funciones from "../../../features/servidor.ts";

const srv = await startServer({
  port: Number(process.env.PORT ?? 8790),
  host: process.env.HOST ?? "127.0.0.1",
  statsMs: Number(process.env.STATS_MS ?? 30000),
  features: process.env.SIN_FUNCIONES === "1" ? [] : funciones, // SIN_FUNCIONES=1: the bare engine
  sesiones: process.env.SESIONES_DIR ?? "informes/sesiones",     // T1: how each player entered (installed: /var/lib/numinia-motor/sesiones)
  datos: process.env.DATOS_DIR ?? ".run/datos",                   // S4: what features keep across restarts (installed: /var/lib/numinia-motor/datos)
});

// systemd (and tools/plaza.sh) stop the server with SIGTERM: close every connection first so each session
// that reported gets its closing line written (T1), then leave; never wait more than 2 s.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    setTimeout(() => process.exit(0), 2000).unref();
    void srv.close().then(() => process.exit(0));
  });
}
