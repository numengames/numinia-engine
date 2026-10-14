// bots: N headless players over real WebSockets, so the plaza has life. They are ordinary clients.
// Run: node packages/server/src/bots.ts --n 8 --url ws://127.0.0.1:8790   (also wss://host/ws)
// Options: --seed <first bot index, for several processes> · --stats <ms between "[bots] vivos" lines>
// Connects in parallel batches of 25 (a remote server is ~50 ms away; one by one would take minutes).
import { webSocketClient } from "../../net/src/index.ts";
import { Bot } from "../../instance/src/index.ts";
import { TICK_HZ } from "../../sim/src/index.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg("n", "8")), url = arg("url", "ws://127.0.0.1:8790"), seed0 = Number(arg("seed", "0"));
const BATCH = 25;

const bots: Bot[] = [];
let failed = 0, dropped = 0, firstError = "";
const t0 = performance.now();
for (let i = 0; i < n; i += BATCH) {
  await Promise.all(Array.from({ length: Math.min(BATCH, n - i) }, async (_, j) => {
    const t = webSocketClient(url);
    try { await t.opened; } catch (e) { failed++; firstError ||= (e as Error).message; return; }
    bots.push(new Bot(t, 0x5eed + (seed0 + i + j) * 7919));
    t.closed.then(() => { dropped++; });
  }));
}
setInterval(() => { for (const b of bots) b.think(); }, 1000 / TICK_HZ);
console.log(`[bots] ${bots.length} conectados a ${url} en ${Math.round(performance.now() - t0)} ms${failed ? ` · ${failed} fallaron (${firstError})` : ""}`);
setInterval(() => {
  const seen = bots.length ? bots.reduce((s, b) => s + b.seen, 0) / bots.length : 0;
  console.log(`[bots] vivos ${bots.length - dropped} de ${n} · ven ${seen.toFixed(1)} de media`);
}, Number(arg("stats", "10000"))).unref();
