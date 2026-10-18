import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hist, median } from "../packages/server/src/hist.ts";
import { parseProcStat, parseSchedstat, Runtime } from "../packages/server/src/runtime.ts";
import { startServer } from "../packages/server/src/server.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("Hist: percentiles within 1.5 % of the exact ones, merge = record together, JSON round trip", () => {
  const xs = Array.from({ length: 10000 }, (_, i) => 0.5 + (i * i) / 100000); // 0.5 .. ~1000 ms, skewed like latencies
  const h = new Hist(), a = new Hist(), b = new Hist();
  xs.forEach((x, i) => { h.record(x); (i % 2 ? a : b).record(x); });
  const sorted = [...xs].sort((p, q) => p - q);
  for (const q of [0.5, 0.9, 0.99]) {
    const exact = sorted[Math.ceil(xs.length * q) - 1];
    assert.ok(Math.abs(h.at(q) - exact) / exact <= 0.015, `q${q}: ${h.at(q)} vs ${exact}`);
  }
  assert.equal(h.max, sorted.at(-1));
  a.merge(b);
  assert.deepEqual(a.summary(), h.summary());
  assert.deepEqual(Hist.from(JSON.parse(JSON.stringify(h))).summary(), h.summary());
  assert.deepEqual(new Hist().summary(), { n: 0, p50: 0, p90: 0, p99: 0, max: 0, mean: 0 });
  const odd = new Hist(); odd.record(NaN); odd.record(-1); odd.record(Infinity);
  assert.equal(odd.n, 0); // NaN, negatives and Infinity are refused
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), 0);
});

test("parseProcStat: busy and steal from the first line of /proc/stat, guest not counted twice", () => {
  const s = parseProcStat("cpu  100 0 50 800 20 5 5 20 30 0\ncpu0 1 2 3\n");
  assert.deepEqual(s, { total: 1000, busy: 180, steal: 20 }); // total = user..steal; busy = total - idle - iowait
  assert.equal(parseProcStat("nada"), null);
  assert.equal(parseProcStat("cpu  1 2 3"), null);
});

test("parseSchedstat (D3): the run-queue wait, in ms, from a thread's schedstat", () => {
  assert.equal(parseSchedstat("123456789 25000000 42\n"), 25); // ns on CPU · ns waiting · timeslices
  assert.equal(parseSchedstat("nada"), null);
  assert.equal(parseSchedstat("12"), null);
  assert.equal(parseSchedstat("1 -5 3"), null);
});

test("Runtime: a window with finite numbers after two samples", async () => {
  const r = new Runtime();
  const t = performance.now(); while (performance.now() - t < 30) { /* burn a little CPU */ }
  await sleep(30); r.sample();
  const w = r.window();
  for (const v of [w.cpuPct, w.cpuSegundos, w.utilizacionBucle, w.bucleMs.p99, w.gc.totalMs]) assert.ok(Number.isFinite(v) && v >= 0, JSON.stringify(w));
  assert.ok(w.utilizacionBucle <= 1);
  if (process.platform === "linux") { // D3: the main thread's wait for a CPU, a share of the wall clock
    assert.ok(w.esperaCpu && w.esperaCpu.pct >= 0 && w.esperaCpu.segundos >= 0, JSON.stringify(w.esperaCpu));
  } else assert.equal(w.esperaCpu, null);
  r.close();
});

test("server: the extra /metrics numbers and /metrics.prom in Prometheus text format", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", version: "prueba", statsMs: 60000, sampleMs: 40, log: () => {} });
  try {
    await sleep(200);
    const base = `http://127.0.0.1:${srv.port}`;
    const m = await (await fetch(`${base}/metrics`)).json();
    for (const k of ["retrasoVentanaMs", "respuestaTickMs"]) assert.ok(m[k].p99 >= m[k].p50 && m[k].peor >= m[k].p99, k);
    assert.ok(m.respuestaTickMs.p99 >= m.tickMs.p99 - 0.01, "response = lateness + duration, never below the duration");
    assert.deepEqual(Object.keys(m.conexiones).sort(), ["aceptadas", "cerradas", "rechazadasLlenas"]);
    assert.ok(m.entorno.cpuModelo.length > 0 && m.entorno.nucleos >= 1);
    assert.ok(m.proceso.utilizacionBucle >= 0 && m.proceso.utilizacionBucle <= 1 && m.proceso.cpuSegundos > 0);

    const r = await fetch(`${base}/metrics.prom`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /^text\/plain; version=0\.0\.4/);
    const lines = (await r.text()).trimEnd().split("\n");
    const types = new Map<string, string>();
    for (const l of lines) {
      if (l.startsWith("# HELP ")) continue;
      const t = l.match(/^# TYPE ([a-z_:][a-z0-9_:]*) (gauge|counter)$/);
      if (t) { types.set(t[1], t[2]); continue; }
      const s = l.match(/^([a-z_:][a-z0-9_:]*)(\{[a-z_]+="[a-z_]+"(,[a-z_]+="[a-z_]+")*\})? (-?[0-9.]+(e[+-]?[0-9]+)?)$/);
      assert.ok(s, `not a valid sample line: ${l}`);
      assert.ok(types.has(s[1]), `${s[1]} has no # TYPE before it`);
    }
    for (const [name, type] of types) assert.equal(type === "counter", name.endsWith("_total"), `${name}: counters end in _total and only they do`);
    assert.ok(types.has("process_cpu_seconds_total") && types.has("nodejs_eventloop_lag_p99_seconds"));
    if (process.platform === "linux") assert.ok(types.has("numinia_mainthread_cpu_wait_seconds_total") && types.has("numinia_mainthread_cpu_wait_ratio"), "D3: CPU wait exported");
    assert.ok(!lines.some((l) => /NaN|undefined|Infinity/.test(l)));
  } finally { await srv.close(); }
});

test("swarm: a real run against a real server writes a report with server and client numbers", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", version: "prueba", statsMs: 60000, sampleMs: 100, log: () => {} });
  const out = mkdtempSync(join(tmpdir(), "informe-"));
  try {
    const args = ["packages/server/src/swarm.ts", "--url", `ws://127.0.0.1:${srv.port}`, "--metrics", `http://127.0.0.1:${srv.port}/metrics`,
      "--n", "20", "--secs", "3", "--calentamiento", "1", "--cada", "1", "--salida", out, "--etiqueta", "prueba", "--procs", "1"];
    const code = await new Promise<number | null>((ok) => { const k = spawn(process.execPath, args, { stdio: "ignore" }); k.once("close", ok); });
    assert.equal(code, 0);
    const json = readdirSync(out).filter((f) => f.endsWith(".json"));
    assert.equal(json.length, 1);
    const rep = JSON.parse(readFileSync(join(out, json[0]), "utf8"));
    assert.equal(rep.schema, "numinia-engine/informe@1");
    assert.equal(rep.etiqueta, "prueba");
    assert.ok(rep.servidor.entorno.cpuModelo && rep.generador.cpuModelo);
    const r = rep.resultados[0];
    assert.equal(r.clientes.conectados, 20);
    assert.equal(r.clientes.fallaron, 0);
    assert.ok(r.clientes.rtt.n > 0 && r.clientes.huecoSnapshots.n > 0, JSON.stringify(r.clientes.rtt));
    assert.ok(r.clientes.primerSnapshot.n === 20 && r.clientes.connect.n === 20);
    assert.ok(r.servidor.ventanas >= 1 && r.servidor.conectadosMax === 20, JSON.stringify(r.servidor));
    assert.ok(r.servidor.tickP99Ms > 0 && r.servidor.respuestaP99Ms >= r.servidor.tickP99Ms - 0.01);
    assert.equal(typeof r.veredicto.pasa, "boolean");
    assert.ok(Array.isArray(r.veredicto.motivos) && Array.isArray(r.veredicto.avisos));
    assert.ok(readdirSync(out).some((f) => f.endsWith(".md")));
  } finally { await srv.close(); rmSync(out, { recursive: true, force: true }); }
});
