import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../packages/server/src/server.ts";
import { ByteWindow, METRICS_SCHEMA, TickWindow } from "../packages/server/src/metrics.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("TickWindow: p50/p99/worst over the last N ticks only", () => {
  const w = new TickWindow(100);
  assert.deepEqual(w.summary(), { p50: 0, p99: 0, worst: 0, samples: 0 });
  for (let i = 0; i < 100; i++) w.record(50);      // old, slow ticks fall out of the window
  for (let i = 1; i <= 100; i++) w.record(i / 10);
  const s = w.summary();
  assert.equal(s.samples, 100);
  assert.equal(s.p50, 5.1);
  assert.equal(s.p99, 10);
  assert.equal(s.worst, 10);
});

test("ByteWindow: kbit/s per person from per-second samples", () => {
  const b = new ByteWindow(11);
  assert.equal(b.kbitPerPerson(), 0);
  for (let s = 0; s <= 10; s++) b.sample(s * 1000, s * 4 * 3125, 4); // 4 people × 3125 B/s = 25 kbit/s each
  assert.equal(b.kbitPerPerson(), 25);
  b.sample(11000, 0, 0); b.sample(12000, 0, 0);    // window slides: still finite
  assert.ok(Number.isFinite(b.kbitPerPerson()));
});

test("server: /health, /metrics and a real WebSocket client on the same port", async () => {
  const lines: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", version: "prueba", statsMs: 60000, sampleMs: 50, log: (l) => lines.push(l) });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const h = await (await fetch(`${base}/health`)).json();
    assert.deepEqual(h, { ok: true, version: "prueba", huella: "fa94375e", conectados: 0 });

    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`);
    const s = new ClientSession(t);
    await t.opened;
    const t0 = performance.now();
    while (s.stats.snapshots < 4 && performance.now() - t0 < 5000) { s.tick(10, 0); await sleep(25); }
    assert.ok(s.stats.snapshots >= 4, `only ${s.stats.snapshots} snapshots`);
    await sleep(60); // at least one more byte sample (every 50 ms here) with someone connected

    const r = await fetch(`${base}/metrics`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    const m = await r.json();
    assert.equal(m.schema, METRICS_SCHEMA);
    assert.equal(m.version, "prueba");
    assert.equal(m.conectados, 1);
    assert.equal(m.tickHz, 20);
    assert.equal(m.presupuestoTickMs, 25);
    assert.equal(m.dilatacion, 1);
    assert.ok(m.tick >= 6 && m.tickMs.muestras >= 6, JSON.stringify(m.tickMs));
    assert.ok(m.tickMs.p99 >= m.tickMs.p50 && m.tickMs.peor >= m.tickMs.p99);
    assert.ok(m.kbitPorPersona > 0 && m.kbitPorPersona < 70, `kbit ${m.kbitPorPersona}`);
    assert.ok(m.memoriaMB.rss > 0 && m.memoriaMB.heap > 0);

    const nf = await fetch(`${base}/nada`);
    assert.equal(nf.status, 404);
    assert.ok((await nf.json()).hay.includes("/metrics"));
    t.close();
    assert.ok(lines.some((l) => l.includes("huella de referencia fa94375e")));
  } finally { await srv.close(); }
});
