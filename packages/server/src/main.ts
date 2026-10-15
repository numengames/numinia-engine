// server entry point. Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
// One port: WebSocket (any path; Caddy passes /ws) · GET /health · GET /metrics · the features' routes.
// Composition root: one of the few files allowed to import features/ (tools/layers.json, "_composition").
import { startServer } from "./server.ts";
import funciones from "../../../features/servidor.ts";

await startServer({
  port: Number(process.env.PORT ?? 8790),
  host: process.env.HOST ?? "127.0.0.1",
  statsMs: Number(process.env.STATS_MS ?? 30000),
  features: process.env.SIN_FUNCIONES === "1" ? [] : funciones, // SIN_FUNCIONES=1: the bare engine
});
