// server entry point. Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
// One port: WebSocket (any path; Caddy passes /ws) · GET /health · GET /metrics. The logic is in server.ts.
import { startServer } from "./server.ts";

await startServer({
  port: Number(process.env.PORT ?? 8790),
  host: process.env.HOST ?? "127.0.0.1",
  statsMs: Number(process.env.STATS_MS ?? 30000),
});
