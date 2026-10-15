// bots: N headless players over real WebSockets, so the plaza has life. They are ordinary clients that also
// MEASURE what a player would feel: connect time, time to the first snapshot, round-trip time (PING/PONG every
// second per bot), gap between snapshots, snapshot jitter (RFC 3550 §6.4.1 estimator) and skipped snapshots.
// Run: node packages/server/src/bots.ts --n 8 --url ws://127.0.0.1:8790   (also wss://host/ws)
// Options: --seed <first bot index, for several processes> · --stats <ms between "[bots]" lines, default 10000>
//   --calentamiento <s>   discard the first seconds from rtt/gap/jitter (the JIT and the connect burst)
//   --lote <n>            connect in parallel batches of n (default 25; a remote server is ~50 ms away)
//   --tormenta <ciclos> --retener <s>   join storm: connect everybody at once, hold, drop everybody, again
// Every stats period (and at SIGTERM, and at the end of a storm) it prints one `[json] {...}` line with
// the histograms; tools/swarm.sh and swarm.ts merge those lines across processes.
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { decodeSnapshot, decodeTime, encodePing, MSG, webSocketClient } from "../../net/src/index.ts";
import type { Transport } from "../../net/src/index.ts";
import { Bot } from "../../instance/src/index.ts";
import { TICK_HZ } from "../../sim/src/index.ts";
import { Hist } from "./hist.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg("n", "8")), url = arg("url", "ws://127.0.0.1:8790"), seed0 = Number(arg("seed", "0"));
const BATCH = Math.max(1, Number(arg("lote", "25"))), warmS = Number(arg("calentamiento", "0"));
const storm = Number(arg("tormenta", "0")), holdS = Number(arg("retener", "10"));
const TICK_MS = 1000 / TICK_HZ, SNAP_EVERY_TICKS = 2; // the server sends a snapshot every 2nd tick (server.ts: snapshotEvery)

class Probe { last = 0; lastTick = -1; J = 0; openedAt = 0; gotFirst = false; }
const stat = { connect: new Hist(), first: new Hist(), rtt: new Hist(), gap: new Hist(), snaps: 0, skipped: 0, late: 0 };
let warm = warmS <= 0, steadyAt = performance.now();
const gen = monitorEventLoopDelay({ resolution: 10 }); gen.enable();
let cpu0 = process.cpuUsage(), cpuAt = performance.now();
let failed = 0, dropped = 0, firstError = "", closing = false;

const probes: Probe[] = [];
const clients: ReturnType<typeof webSocketClient>[] = [];
const bots: Bot[] = [];

function onSnapshot(p: Probe, now: number, bytes: Uint8Array): void {
  const s = decodeSnapshot(bytes);
  if (!s) return;
  if (!p.gotFirst) { p.gotFirst = true; stat.first.record(now - p.openedAt); }
  if (warm && p.last) {
    const gap = now - p.last, dTick = s.tick - p.lastTick;
    stat.gap.record(gap); stat.snaps++;
    if (dTick > SNAP_EVERY_TICKS) stat.skipped++;
    if (gap > 2 * SNAP_EVERY_TICKS * TICK_MS) stat.late++;
    p.J += (Math.abs(gap - dTick * TICK_MS) - p.J) / 16; // RFC 3550: J += (|D| - J) / 16
  }
  p.last = now; p.lastTick = s.tick;
}

/** The bot talks through this wrapper, which looks at the clock when a snapshot or a pong arrives. */
function tap(t: ReturnType<typeof webSocketClient>, p: Probe): Transport {
  let inner: (b: Uint8Array) => void = () => {};
  t.onMessage((b) => {
    const now = performance.now();
    if (b[0] === MSG.SNAPSHOT) onSnapshot(p, now, b);
    else if (b[0] === MSG.PONG && warm) stat.rtt.record(((Math.round(now) >>> 0) - decodeTime(b)) >>> 0);
    inner(b);
  });
  return { get sentBytes() { return t.sentBytes; }, send: (b, r) => t.send(b, r), onMessage(f) { inner = f; } };
}

async function connectAll(count: number, offset: number): Promise<void> {
  for (let i = 0; i < count; i += BATCH) {
    await Promise.all(Array.from({ length: Math.min(BATCH, count - i) }, async (_, j) => {
      const t0 = performance.now(), t = webSocketClient(url);
      try { await t.opened; } catch (e) { failed++; firstError ||= (e as Error).message; return; }
      const p = new Probe(); p.openedAt = performance.now();
      stat.connect.record(p.openedAt - t0);
      probes.push(p); clients.push(t); bots.push(new Bot(tap(t, p), 0x5eed + (seed0 + offset + i + j) * 7919));
      t.closed.then(() => { if (!closing) dropped++; });
    }));
  }
}

function emit(): void {
  const jitter = new Hist(); for (const p of probes) if (p.J > 0) jitter.record(p.J);
  const wall = performance.now() - cpuAt, c = process.cpuUsage(cpu0);
  console.log("[json] " + JSON.stringify({
    schema: "numinia-engine/bots@1", pid: process.pid, pedidos: n, conectados: bots.length, fallaron: failed, primerError: firstError, caidos: dropped,
    steadySecs: Math.round((performance.now() - steadyAt) / 100) / 10, snapshots: stat.snaps, saltados: stat.skipped, tardios: stat.late,
    h: { connect: stat.connect.toJSON(), first: stat.first.toJSON(), rtt: stat.rtt.toJSON(), gap: stat.gap.toJSON(), jitter: jitter.toJSON() },
    gen: { bucleP99Ms: Math.round(gen.percentile(99) / 1e4) / 100, bucleMaxMs: Math.round(gen.max / 1e4) / 100, cpuPct: Math.round(((c.user + c.system) / 1000 / Math.max(1, wall)) * 10000) / 100 },
  }));
}

if (warmS > 0) setTimeout(() => {
  warm = true; steadyAt = performance.now(); stat.rtt = new Hist(); stat.gap = new Hist(); stat.snaps = stat.skipped = stat.late = 0;
  for (const p of probes) { p.J = 0; p.last = 0; }
  gen.reset(); cpu0 = process.cpuUsage(); cpuAt = performance.now();
}, warmS * 1000);

let t0 = performance.now();
let step = 0;
setInterval(() => {
  step++;
  bots.forEach((b, i) => { b.think(); if ((step + i) % TICK_HZ === 0) clients[i].send(encodePing(Math.round(performance.now()) >>> 0)); }); // one ping per bot per second
}, TICK_MS);

process.on("SIGTERM", () => { emit(); process.exit(0); });
setInterval(() => {
  const seen = bots.length ? bots.reduce((s, b) => s + b.seen, 0) / bots.length : 0;
  console.log(`[bots] vivos ${bots.length - dropped} de ${n} · ven ${seen.toFixed(1)} de media`);
  emit();
}, Number(arg("stats", "10000"))).unref();

if (storm > 0) {
  for (let c = 1; c <= storm; c++) {
    t0 = performance.now();
    await connectAll(n, 0);
    console.log(`[bots] tormenta ${c}/${storm}: ${bots.length} conectados en ${Math.round(performance.now() - t0)} ms${failed ? ` · ${failed} fallaron (${firstError})` : ""}`);
    await new Promise((r) => setTimeout(r, holdS * 1000));
    if (c === storm) break;
    closing = true; for (const t of clients) t.close();
    await new Promise((r) => setTimeout(r, 1500));
    clients.length = bots.length = probes.length = 0; closing = false;
  }
  emit(); process.exit(0);
} else {
  await connectAll(n, 0);
  console.log(`[bots] ${bots.length} conectados a ${url} en ${Math.round(performance.now() - t0)} ms${failed ? ` · ${failed} fallaron (${firstError})` : ""}`);
}
