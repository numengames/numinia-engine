// B2: the server says WHY a tick is slow: cost per phase of the tick and per feature hook (p50/p99 in /metrics, fixed-bucket
// histograms in /metrics.prom), and the three measurement faults R4 found: the event-loop delay carried the 10 ms sampling
// resolution, numinia_gc_pause_seconds_total was a «counter» that went down, and names/units (bytes rounded through MB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import { FASES_TICK, Instance } from "../packages/instance/src/index.ts";
import { BUCKETS_LE, CosteTick, Histograma, OPENMETRICS, quiereOpenMetrics, toPrometheus, buildMetrics, TickWindow, ByteWindow } from "../packages/server/src/metrics.ts";
import { RESOLUCION_BUCLE_MS, Runtime, entorno } from "../packages/server/src/runtime.ts";
import { startServer } from "../packages/server/src/server.ts";

const espera = (ms: number) => { const a = performance.now(); while (performance.now() - a < ms) { /* busy: a slow feature */ } };

const lenta = defineFeature({ id: "lenta", version: 1, describe: "Tarda 2 ms en cada tick.", intents: { tocar: { describe: "Toca.", spoken: "tocar", fields: {} } } });
const rota = defineFeature({ id: "rota", version: 1, describe: "Lanza en cada tick.", intents: { tocar: { describe: "Toca.", spoken: "tocar", fields: {} } } });
const lentaServer = serverPart(lenta, (api) => { api.onTick(() => espera(2)); });
const rotaServer = serverPart(rota, (api) => { api.onTick(() => { throw new Error("adrede"); }); });

test("Histograma: fixed edges with 25 and 50 ms exact; an observation at an edge goes in that bucket (le = less or equal)", () => {
  assert.ok(BUCKETS_LE.includes("0.025") && BUCKETS_LE.includes("0.05"));
  const h = new Histograma();
  for (const ms of [0.05, 25, 25.001, 50, 2000]) h.observe(ms);
  const i25 = BUCKETS_LE.indexOf("0.025"), i50 = BUCKETS_LE.indexOf("0.05");
  assert.equal(h.counts[0], 1);             // 0.05 ms ≤ 0.1 ms
  assert.equal(h.counts[i25], 1);           // exactly 25 ms
  assert.equal(h.counts[i50], 2);           // 25.001 and 50
  assert.equal(h.counts[BUCKETS_LE.length], 1); // over 1 s: only +Inf
  assert.equal(h.count, 5);
  assert.ok(Math.abs(h.sumMs - 2100.051) < 1e-9);
});

test("Instance + features: every phase of the tick and every feature's onTick are timed; a feature that throws is counted", () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [lentaServer, rotaServer], log: (l) => log.push(l) });
  inst.join(0); inst.join(1);
  const c = new CosteTick(FASES_TICK, 200);
  for (let t = 0; t < 10; t++) { const a = performance.now(); inst.tick(); c.record(performance.now() - a, inst.fasesMs, inst.features.costes); }
  assert.equal(inst.fasesMs.length, 6);
  const slot = inst.features.costes.find((g) => g.pieza === "lenta" && g.gancho === "tick")!;
  assert.ok(slot.ms >= 2, `lenta onTick ${slot.ms} ms`);
  assert.ok(inst.fasesMs[FASES_TICK.indexOf("piezas")] >= 2, "the features phase holds the slow hook");
  assert.equal(inst.features.costes.find((g) => g.pieza === "rota")!.errores, 10);
  assert.equal(inst.features.erroresDe.get("rota"), 10);
  assert.equal(log.filter((l) => l.includes("'rota' falló")).length, 1, "the log still says it once");

  const m = buildMetrics({
    version: "p", uptimeMs: 1, tick: 10, tickHz: 20, people: 2, capacity: 8, ticks: new TickWindow(), bytes: new ByteWindow(), lagMs: 0,
    mem: { rss: 123456789, heapUsed: 23456789 }, lags: new TickWindow(), responses: new TickWindow(), runtime: new Runtime().window(),
    entorno: entorno(), counts: { aceptadas: 0, cerradas: 0, rechazadasLlenas: 0 }, bytesTotal: 0, tickSumMs: 0,
    coste: c, erroresDe: inst.features.erroresDe, piezasStats: inst.features.stats,
  });
  assert.deepEqual(Object.keys(m.fasesTickMs), [...FASES_TICK]);
  assert.ok(m.fasesTickMs.piezas.p50 >= 2);
  assert.deepEqual(Object.keys(m.piezas)[0], "lenta", "most expensive first");
  assert.ok(m.piezas.lenta.tickMs!.p99 >= 2 && m.piezas.lenta.totalMs.p50 >= 2);
  assert.equal(m.piezas.rota.errores, 10);
  assert.equal(m.memoriaBytes.rss, 123456789, "exact bytes, not MB × 1048576");

  const prom = toPrometheus(m, { coste: c, erroresDe: inst.features.erroresDe });
  assert.match(prom, /process_resident_memory_bytes 123456789\n/);
  assert.match(prom, /numinia_feature_errors_total\{feature="rota"\} 10\n/);
  assert.match(prom, /# TYPE numinia_feature_hook_seconds histogram/);
  assert.match(prom, /numinia_feature_hook_seconds_bucket\{feature="lenta",hook="tick",le="0.001"\} 0\n/); // each one took ≥ 2 ms
  assert.match(prom, /numinia_feature_hook_seconds_bucket\{feature="lenta",hook="tick",le="\+Inf"\} 10\n/);
  assert.match(prom, /numinia_feature_hook_seconds_count\{feature="lenta",hook="tick"\} 10\n/);
  assert.match(prom, /numinia_tick_phase_seconds_bucket\{phase="simulacion",le="\+Inf"\} 10\n/);
  assert.match(prom, /numinia_tick_seconds_count 10\n/);
  // buckets are cumulative and never go down
  const b = [...prom.matchAll(/numinia_tick_seconds_bucket\{le="[^"]+"\} (\d+)/g)].map((x) => Number(x[1]));
  assert.equal(b.length, BUCKETS_LE.length + 1);
  for (let i = 1; i < b.length; i++) assert.ok(b[i] >= b[i - 1]);
});

test("OpenMetrics on demand: counter families without _total, samples with it, ends in # EOF; default stays 0.0.4", () => {
  assert.equal(quiereOpenMetrics("application/openmetrics-text; version=1.0.0,text/plain;q=0.5"), true);
  assert.equal(quiereOpenMetrics("text/plain"), false);
  assert.equal(quiereOpenMetrics(undefined), false);
  const c = new CosteTick(FASES_TICK); c.record(1, new Float64Array(6));
  const m = buildMetrics({
    version: "p", uptimeMs: 1, tick: 1, tickHz: 20, people: 0, capacity: 8, ticks: new TickWindow(), bytes: new ByteWindow(), lagMs: 0,
    mem: { rss: 1, heapUsed: 1 }, lags: new TickWindow(), responses: new TickWindow(), runtime: new Runtime().window(),
    entorno: entorno(), counts: { aceptadas: 3, cerradas: 1, rechazadasLlenas: 0 }, bytesTotal: 0, tickSumMs: 0, coste: c,
  });
  const om = toPrometheus(m, { coste: c }, true);
  assert.ok(om.endsWith("# EOF\n"));
  assert.match(om, /# TYPE numinia_connections counter\nnuminia_connections_total\{result="accepted"\} 3/);
  assert.match(om, /# TYPE numinia_gc_pause_seconds counter\nnuminia_gc_pause_seconds_total /);
  const plain = toPrometheus(m, { coste: c });
  assert.ok(!plain.includes("# EOF"));
  assert.match(plain, /# TYPE numinia_connections_total counter/);
  // no two families share a name (a histogram next to a counter of the same family would be invalid OpenMetrics)
  const fams = [...om.matchAll(/^# TYPE (\S+) /gm)].map((x) => x[1]);
  assert.equal(new Set(fams).size, fams.length, fams.join(","));
});

test("Runtime: the real loop delay is the sampled one minus the resolution; the gc total never goes down", async () => {
  const r = new Runtime();
  let garbage: unknown[] = [];
  const totales: number[] = [];
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 2e5; i++) garbage.push({ i, s: "x" + i });
    garbage = [];
    await new Promise((res) => setTimeout(res, 60));
    r.sample();
    const w = r.window();
    totales.push(w.gcAcumulado.ms);
    assert.equal(w.bucleResolucionMs, RESOLUCION_BUCLE_MS);
    for (const q of ["p50", "p99", "peor"] as const) {
      assert.ok(w.bucleRealMs[q] >= 0);
      assert.ok(Math.abs(w.bucleRealMs[q] - Math.max(0, w.bucleMs[q] - RESOLUCION_BUCLE_MS)) <= 0.011, `${q} ${w.bucleMs[q]} → ${w.bucleRealMs[q]}`);
    }
    const porTipo = Object.values(w.gcAcumulado.porTipo).reduce((n, t) => n + t.pausas, 0);
    assert.equal(porTipo, w.gcAcumulado.pausas, "every pause has a kind");
  }
  for (let i = 1; i < totales.length; i++) assert.ok(totales[i] >= totales[i - 1], totales.join(" "));
  assert.ok(totales[totales.length - 1] > 0, "allocating 1.2 M objects made the gc run");
  r.close();
});

test("server: /metrics has the phases and the features; /metrics.prom speaks OpenMetrics when asked", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", version: "prueba", statsMs: 60000, sampleMs: 50, features: [lentaServer], log: () => {} });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    await new Promise((res) => setTimeout(res, 400)); // ~8 ticks
    const m = await (await fetch(`${base}/metrics`)).json();
    assert.equal(m.schema, "numinia-engine/metrics@1", "additive: still @1");
    assert.deepEqual(Object.keys(m.fasesTickMs), [...FASES_TICK]);
    assert.ok(m.piezas.lenta.tickMs.p50 >= 2, JSON.stringify(m.piezas));
    assert.ok("bucleRealMs" in m.proceso && "gcAcumulado" in m.proceso);
    const r = await fetch(`${base}/metrics.prom`, { headers: { accept: "application/openmetrics-text; version=1.0.0" } });
    assert.equal(r.headers.get("content-type"), OPENMETRICS);
    const om = await r.text();
    assert.ok(om.endsWith("# EOF\n"));
    assert.match(om, /numinia_feature_hook_seconds_count\{feature="lenta",hook="tick"\} \d+/);
    assert.match(om, /nodejs_gc_duration_seconds_bucket\{kind="minor",le="\+Inf"\} \d+/);
    const p = await fetch(`${base}/metrics.prom`);
    assert.match(p.headers.get("content-type") ?? "", /^text\/plain; version=0\.0\.4/);
  } finally { await srv.close(); }
});
