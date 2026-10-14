// server: one instance process. WebSocket in front, the Instance (authority) behind, 20 Hz loop.
// Run: node packages/server/src/main.ts   (PORT=8790 HOST=127.0.0.1 by default)
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { hex } from "../../core/src/index.ts";
import { REFERENCE, referenceRecording, replayFingerprint, TICK_HZ } from "../../sim/src/index.ts";
import { Instance } from "../../instance/src/index.ts";
import type { Transport } from "../../net/src/index.ts";

const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_PLAYERS = 1000;

/** Server end of one WebSocket, behind the engine's Transport interface. */
export function wsTransport(ws: WebSocket): Transport {
  let cb: (b: Uint8Array) => void = () => {};
  const t = {
    sentBytes: 0,
    send(bytes: Uint8Array) { if (ws.readyState === 1) { ws.send(bytes); t.sentBytes += bytes.length; } },
    onMessage(f: (b: Uint8Array) => void) { cb = f; },
  };
  ws.on("message", (data, isBinary) => {
    if (!isBinary || !(data instanceof Buffer)) return; // text frames and fragments are ignored
    cb(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  });
  return t;
}

const t0 = performance.now();
const refHash = replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n));
const refMs = Math.round(performance.now() - t0);
const inst = new Instance({ seed: 42, capacity: MAX_PLAYERS + 24, k: 50, snapshotEvery: 2, reference: { ...REFERENCE, hash: refHash } });

const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: 1024, perMessageDeflate: false });
wss.on("connection", (ws) => {
  if (inst.conns.length >= MAX_PLAYERS) { ws.close(1013, "instance full"); return; }
  const entity = inst.connect(wsTransport(ws));
  ws.on("close", () => inst.disconnect(entity));
  ws.on("error", () => ws.terminate());
});

// fixed-rate loop: schedule against the start time so timer drift never accumulates
const tickMs = 1000 / TICK_HZ, start = performance.now();
let n = 0, worst = 0;
const times: number[] = [];
const loop = () => {
  const a = performance.now();
  inst.tick();
  const d = performance.now() - a;
  times.push(d); worst = Math.max(worst, d);
  n++;
  setTimeout(loop, Math.max(0, start + n * tickMs - performance.now()));
};
loop();

setInterval(() => {
  times.sort((x, y) => x - y);
  const p99 = times.length ? times[Math.floor(times.length * 0.99)] : 0;
  console.log(`[instancia] tick ${inst.sim.tick} · conectados ${inst.conns.length} · tick p99 ${p99.toFixed(2)} ms (peor ${worst.toFixed(2)})`);
  times.length = 0; worst = 0;
}, 30000).unref();

console.log(`[instancia] ws://${HOST}:${PORT} · 20 Hz · huella de referencia ${hex(refHash)} (${REFERENCE.ticks} ticks, ${refMs} ms)`);
