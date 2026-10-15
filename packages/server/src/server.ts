// server: one instance process. HTTP + WebSocket on one port, the Instance (authority) behind, 20 Hz loop.
//   WebSocket upgrade on any path (Caddy passes /ws) · GET /health · GET /metrics (JSON, see metrics.ts)
//   GET /sesiones (T1: how each connected player entered; like /metrics, never published by Caddy)
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { signer } from "./secret.ts";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { hex } from "../../core/src/index.ts";
import { REFERENCE, referenceRecording, replayFingerprint, TICK_HZ } from "../../sim/src/index.ts";
import { Instance } from "../../instance/src/index.ts";
import type { Transport } from "../../net/src/index.ts";
import type { HttpReply, ServerPart } from "../../feature/src/index.ts";
import { buildMetrics, ByteWindow, TickWindow, toPrometheus } from "./metrics.ts";
import { entorno, Runtime } from "./runtime.ts";
import { KEEP_DAYS, Sesiones } from "./sesiones.ts";
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
  log?: (line: string) => void;
};

/** Largest POST body a feature route accepts. */
export const MAX_BODY = 4096;

export type RunningServer = {
  port: number;
  inst: Instance;
  sesiones: Sesiones;
  fingerprint: string;
  metrics(): Metrics;
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
    cb(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  });
  return t;
}

export function engineVersion(): string {
  if (process.env.ENGINE_BUILD) return process.env.ENGINE_BUILD;
  if (existsSync("../VERSION")) return readFileSync("../VERSION", "utf8").trim();
  return "dev";
}

export function startServer(o: ServerOptions): Promise<RunningServer> {
  const log = o.log ?? ((l: string) => console.log(l));
  const maxPlayers = o.maxPlayers ?? 1000;
  const version = o.version ?? engineVersion();
  const born = performance.now();

  const t0 = performance.now();
  const refHash = replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n));
  const refMs = Math.round(performance.now() - t0);
  const sesiones = new Sesiones({ dir: o.sesiones ?? null, log });
  const inst = new Instance({ seed: 42, capacity: maxPlayers + 24, k: 50, snapshotEvery: 2, reference: { ...REFERENCE, hash: refHash }, features: o.features, sign: signer(o.secret ?? process.env.MOTOR_SECRET), log, onReport: (e, r) => sesiones.informe(e, r) });

  const ticks = new TickWindow(200), lags = new TickWindow(200), responses = new TickWindow(200), bytes = new ByteWindow(11);
  const runtime = new Runtime(), env = entorno();
  const counts = { aceptadas: 0, cerradas: 0, rechazadasLlenas: 0 };
  const tickMs = 1000 / TICK_HZ;
  let n = 0, lagMs = 0, start = 0, stopped = false, tickSumMs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const metrics = () => buildMetrics({
    version, uptimeMs: performance.now() - born, tick: inst.sim.tick, tickHz: TICK_HZ, people: inst.conns.length,
    capacity: maxPlayers, ticks, bytes, lagMs, mem: process.memoryUsage(),
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
  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const [path, qs = ""] = (req.url ?? "/").split("?");
    const method = req.method ?? "GET";
    if (method === "GET" && path === "/health") return json(res, 200, { ok: true, version, huella: hex(refHash), conectados: inst.conns.length });
    if (method === "GET" && path === "/metrics") return json(res, 200, metrics());
    if (method === "GET" && path === "/sesiones") return json(res, 200, { schema: "numinia-engine/sesiones@1", carpeta: sesiones.dir, resumen: sesiones.resumen(), ahora: sesiones.ahora() });
    if (method === "GET" && path === "/metrics.prom") { res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" }); return void res.end(toPrometheus(metrics())); }
    if (method !== "GET" && method !== "POST") return json(res, 405, { error: "solo GET o POST" });
    // everything else may be a game feature's route (e.g. the page a QR opens)
    const answer = (body: string) => {
      const r = inst.features.http(method, path, Object.fromEntries(new URLSearchParams(qs)), body);
      if (r) return reply(res, r);
      json(res, 404, { error: `no existe ${method} ${path}`, hay: ["/health", "/metrics", "/metrics.prom", "/sesiones", ...inst.features.routes(), "WebSocket en cualquier ruta (/ws)"] });
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

  const wss = new WebSocketServer({ server: http, maxPayload: 1024, perMessageDeflate: false });
  wss.on("connection", (ws) => {
    if (inst.conns.length >= maxPlayers) { counts.rechazadasLlenas++; ws.close(1013, "instance full"); return; }
    counts.aceptadas++;
    const entity = inst.connect(wsTransport(ws));
    sesiones.abrir(entity);
    ws.on("close", (code) => { counts.cerradas++; sesiones.cerrar(entity, { cierre: code }); inst.disconnect(entity); });
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
  const sampler = setInterval(() => { bytes.sample(performance.now(), bytesOut, inst.conns.length); runtime.sample(); void sesiones.vaciar(); }, o.sampleMs ?? 1000);
  sampler.unref();
  const stats = setInterval(() => {
    const m = metrics();
    log(`[instancia] tick ${m.tick} · conectados ${m.conectados} · tick p99 ${m.tickMs.p99.toFixed(2)} ms (peor ${m.tickMs.peor.toFixed(2)}) · ${m.kbitPorPersona.toFixed(1)} kbit/s por persona`);
  }, o.statsMs ?? 30000);
  stats.unref();

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
        port, inst, sesiones, fingerprint: hex(refHash), metrics,
        close: () => new Promise<void>((done) => {
          stopped = true; clearTimeout(timer); clearInterval(sampler); clearInterval(stats); runtime.close();
          for (const c of wss.clients) c.terminate();
          wss.close(); http.close(() => void sesiones.vaciar().then(() => done()));
        }),
      });
    });
  });
}
