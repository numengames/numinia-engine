// metrics: what the server says about itself on GET /metrics. Pure bookkeeping, no I/O, no timers.
// Rolling windows: the last 200 tick durations (10 s at 20 Hz) and one byte sample per second (10 s).

import type { Entorno, RuntimeWindow } from "./runtime.ts";

// Additive fields (X3 measurement battery) keep the schema at @1: nothing that was there changed.
export const METRICS_SCHEMA = "numinia-engine/metrics@1";

/** Durations of the last `size` ticks, in ms. */
export class TickWindow {
  readonly size: number;
  readonly ms: Float64Array;
  count = 0;
  constructor(size = 200) { this.size = size; this.ms = new Float64Array(size); }
  record(ms: number): void { this.ms[this.count % this.size] = ms; this.count++; }
  /** p50 / p99 / worst over the window (zeros when empty). */
  summary(): { p50: number; p99: number; worst: number; samples: number } {
    const n = Math.min(this.count, this.size);
    if (n === 0) return { p50: 0, p99: 0, worst: 0, samples: 0 };
    const s = Array.from(this.ms.subarray(0, n)).sort((a, b) => a - b);
    const at = (q: number) => s[Math.min(n - 1, Math.floor(n * q))];
    return { p50: at(0.5), p99: at(0.99), worst: s[n - 1], samples: n };
  }
}

/** B2: fixed histogram bucket edges, in seconds and as printed (`le`). The same edges for ticks, phases, features and gc
 * pauses, so they can be compared and summed; 25 ms (half a tick, the tick budget) and 50 ms (one tick, the response
 * budget) are exact edges. Never change them in place: a scraper's history would mix two meanings. */
export const BUCKETS_LE = ["0.0001", "0.00025", "0.0005", "0.001", "0.0025", "0.005", "0.01", "0.025", "0.05", "0.1", "0.25", "1"] as const;
const BUCKETS_MS = BUCKETS_LE.map((x) => Number(x) * 1000);

/** B2: a cumulative histogram since start (never reset): counts per bucket, count and sum. Observing costs a few compares. */
export class Histograma {
  readonly counts = new Float64Array(BUCKETS_MS.length + 1); // last slot = over the biggest edge (+Inf only)
  count = 0;
  sumMs = 0;
  observe(ms: number): void {
    let i = 0;
    while (i < BUCKETS_MS.length && ms > BUCKETS_MS[i]) i++;
    this.counts[i]++; this.count++; this.sumMs += ms;
  }
}

type Trio = { p50: number; p99: number; peor: number };
/** What the features' registry hands over after each tick (feature/src/index.ts CosteGancho). */
type Gancho = { readonly pieza: string; readonly gancho: string; readonly ms: number; readonly errores: number };

/** B2: where a tick's time goes. Phases of Instance.tick() and each feature's hooks, over the same 200-tick window as
 * tickMs (p50/p99/worst for the JSON) and as cumulative histograms (for /metrics.prom). One record() per tick. */
export class CosteTick {
  readonly tick = new Histograma();
  readonly fases: { nombre: string; ventana: TickWindow; hist: Histograma }[];
  readonly ganchos = new Map<Gancho, { ventana: TickWindow; hist: Histograma }>();
  readonly piezas = new Map<string, { ventana: TickWindow; suma: number }>(); // per feature: sum of its hooks in one tick
  private readonly size: number;
  constructor(fases: readonly string[], size = 200) {
    this.size = size;
    this.fases = fases.map((nombre) => ({ nombre, ventana: new TickWindow(size), hist: new Histograma() }));
  }
  record(tickMs: number, fasesMs: ArrayLike<number>, ganchos: readonly Gancho[] = []): void {
    this.tick.observe(tickMs);
    for (let i = 0; i < this.fases.length; i++) { const f = this.fases[i], v = fasesMs[i] ?? 0; f.ventana.record(v); f.hist.observe(v); }
    for (const p of this.piezas.values()) p.suma = 0;
    for (const g of ganchos) {
      let w = this.ganchos.get(g);
      if (!w) this.ganchos.set(g, (w = { ventana: new TickWindow(this.size), hist: new Histograma() }));
      w.ventana.record(g.ms); w.hist.observe(g.ms);
      let p = this.piezas.get(g.pieza);
      if (!p) this.piezas.set(g.pieza, (p = { ventana: new TickWindow(this.size), suma: 0 }));
      p.suma += g.ms;
    }
    for (const p of this.piezas.values()) p.ventana.record(p.suma);
  }
}

/** One sample per second of (time, total bytes sent, people connected). */
export class ByteWindow {
  readonly size: number;
  readonly samples: { at: number; bytes: number; people: number }[] = [];
  constructor(size = 11) { this.size = size; }
  sample(at: number, bytes: number, people: number): void {
    this.samples.push({ at, bytes, people });
    if (this.samples.length > this.size) this.samples.shift();
  }
  /** Average kbit/s sent to each connected person over the window (0 with < 2 samples or nobody). */
  kbitPerPerson(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    const secs = (b.at - a.at) / 1000;
    const people = this.samples.reduce((n, s) => n + s.people, 0) / this.samples.length;
    if (secs <= 0 || people <= 0) return 0;
    return ((b.bytes - a.bytes) * 8) / 1000 / secs / people;
  }
}

export type Metrics = {
  schema: string;
  version: string;
  uptimeS: number;
  tick: number;
  tickHz: number;
  conectados: number;
  capacidad: number;
  tickMs: { p50: number; p99: number; peor: number; muestras: number };
  presupuestoTickMs: number;
  retrasoMs: number;
  kbitPorPersona: number;
  memoriaMB: { rss: number; heap: number };
  /** Simulated seconds per real second. Always 1 until time dilation (backlog S3) exists. */
  dilatacion: number;
  /** Lateness of each tick start against its schedule, last 200 ticks. */
  retrasoVentanaMs: { p50: number; p99: number; peor: number };
  /** Lateness + duration: when the tick's answer was ready, counted from when it was due. Must stay under one tick (50 ms). */
  respuestaTickMs: { p50: number; p99: number; peor: number };
  proceso: RuntimeWindow;
  conexiones: { aceptadas: number; cerradas: number; rechazadasLlenas: number };
  bytesEnviados: number;
  tickSumaS: number;
  entorno: Entorno;
  /** B2: memoriaMB in exact bytes (what /metrics.prom says in bytes; memoriaMB is rounded). */
  memoriaBytes: { rss: number; heap: number };
  /** B2: each phase of the tick, ms, last 200 ticks (FASES_TICK order: entradas, solidos, simulacion, seguro, piezas, instantaneas). */
  fasesTickMs: Record<string, Trio>;
  /** B2: per feature, most expensive first (p99 of the sum of its hooks in one tick): its hooks' cost per tick, ms, last
   * 200 ticks (tickMs = onTick, intentMs = its on() handlers, vueltaMs = onVuelta, cercaMs = sending things near people)
   * and its errors since start. Only features that run something inside the tick appear; ids are code ids, never people. */
  piezas: Record<string, { totalMs: Trio; tickMs?: Trio; intentMs?: Trio; vueltaMs?: Trio; cercaMs?: Trio; errores: number }>;
  /** B2: the features' intents since start: accepted (queued), dropped by the rate limit, malformed; and all their errors. */
  piezasTotales: { intents: number; descartados: number; malos: number; errores: number };
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000; // features cost microseconds: one more decimal

export function buildMetrics(o: {
  version: string; uptimeMs: number; tick: number; tickHz: number; people: number; capacity: number;
  ticks: TickWindow; bytes: ByteWindow; lagMs: number; mem: { rss: number; heapUsed: number };
  lags: TickWindow; responses: TickWindow; runtime: RuntimeWindow; entorno: Entorno;
  counts: { aceptadas: number; cerradas: number; rechazadasLlenas: number }; bytesTotal: number; tickSumMs: number;
  coste?: CosteTick; erroresDe?: ReadonlyMap<string, number>; piezasStats?: { received: number; dropped: number; bad: number; errors: number };
}): Metrics {
  const t = o.ticks.summary(), l = o.lags.summary(), q = o.responses.summary();
  const trio = (x: { p50: number; p99: number; worst: number }) => ({ p50: r2(x.p50), p99: r2(x.p99), peor: r2(x.worst) });
  return {
    schema: METRICS_SCHEMA,
    version: o.version,
    uptimeS: Math.round(o.uptimeMs / 1000),
    tick: o.tick,
    tickHz: o.tickHz,
    conectados: o.people,
    capacidad: o.capacity,
    tickMs: { p50: r2(t.p50), p99: r2(t.p99), peor: r2(t.worst), muestras: t.samples },
    presupuestoTickMs: r2(1000 / o.tickHz / 2),
    retrasoMs: r2(Math.max(0, o.lagMs)),
    kbitPorPersona: r2(o.bytes.kbitPerPerson()),
    memoriaMB: { rss: r2(o.mem.rss / 1048576), heap: r2(o.mem.heapUsed / 1048576) },
    dilatacion: 1,
    retrasoVentanaMs: trio(l),
    respuestaTickMs: trio(q),
    proceso: o.runtime,
    conexiones: { ...o.counts },
    bytesEnviados: o.bytesTotal,
    tickSumaS: r2(o.tickSumMs) / 1000,
    entorno: o.entorno,
    memoriaBytes: { rss: o.mem.rss, heap: o.mem.heapUsed },
    fasesTickMs: Object.fromEntries((o.coste?.fases ?? []).map((f) => { const x = f.ventana.summary(); return [f.nombre, { p50: r3(x.p50), p99: r3(x.p99), peor: r3(x.worst) }]; })),
    piezas: piezasDe(o.coste, o.erroresDe),
    piezasTotales: {
      intents: (o.piezasStats?.received ?? 0) - (o.piezasStats?.dropped ?? 0), descartados: o.piezasStats?.dropped ?? 0,
      malos: o.piezasStats?.bad ?? 0, errores: o.piezasStats?.errors ?? 0,
    },
  };
}

function piezasDe(c: CosteTick | undefined, errores: ReadonlyMap<string, number> = new Map()): Metrics["piezas"] {
  const trio = (x: { p50: number; p99: number; worst: number }): Trio => ({ p50: r3(x.p50), p99: r3(x.p99), peor: r3(x.worst) });
  const out: [string, Metrics["piezas"][string], number][] = [];
  for (const [id, p] of c?.piezas ?? []) {
    const s = p.ventana.summary(), e: Metrics["piezas"][string] = { totalMs: trio(s), errores: errores.get(id) ?? 0 };
    for (const [g, w] of c!.ganchos) if (g.pieza === id) e[`${g.gancho}Ms` as "tickMs"] = trio(w.ventana.summary());
    out.push([id, e, s.p99]);
  }
  for (const [id, n] of errores) if (!c?.piezas.has(id)) out.push([id, { totalMs: { p50: 0, p99: 0, peor: 0 }, errores: n }, 0]);
  out.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
  return Object.fromEntries(out.map(([id, e]) => [id, e]));
}

/** The histograms and counters /metrics.prom adds to the JSON numbers (B2). */
export type Histogramas = { coste?: CosteTick; gc?: Record<string, Histograma>; erroresDe?: ReadonlyMap<string, number> };

/** Content type of each exposition format. Default: Prometheus text 0.0.4; a scraper that sends
 * `Accept: application/openmetrics-text` gets OpenMetrics 1.0.0 (same samples, counter families without `_total`, `# EOF`). */
export const PROM_TEXT = "text/plain; version=0.0.4; charset=utf-8";
export const OPENMETRICS = "application/openmetrics-text; version=1.0.0; charset=utf-8";
export const quiereOpenMetrics = (accept: string | undefined): boolean => /application\/openmetrics-text/i.test(accept ?? "");

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/** The same numbers in the Prometheus text exposition format (GET /metrics.prom), with the names the
 * Prometheus conventions and prom-client use: base units (seconds, bytes), `_total` on counters.
 * B2: fixed-bucket histograms (tick, phase, feature hook, gc by kind) and real counters; nothing that was there was
 * renamed. `numinia_gc_pause_seconds_total` is now cumulative (it was the last 10 s and went down). */
export function toPrometheus(m: Metrics, h: Histogramas = {}, openMetrics = false): string {
  const out: string[] = [];
  const add = (name: string, type: "gauge" | "counter", help: string, rows: [string, number][]) => {
    const family = openMetrics && type === "counter" ? name.replace(/_total$/, "") : name;
    out.push(`# HELP ${family} ${help}`, `# TYPE ${family} ${type}`);
    for (const [labels, v] of rows) out.push(`${name}${labels} ${Number.isFinite(v) ? v : 0}`);
  };
  const hist = (name: string, help: string, rows: [Record<string, string>, Histograma][]) => {
    if (!rows.length) return;
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} histogram`);
    for (const [labels, x] of rows) {
      const l = Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(",");
      let acc = 0;
      for (let i = 0; i < BUCKETS_LE.length; i++) { acc += x.counts[i]; out.push(`${name}_bucket{${l}${l ? "," : ""}le="${BUCKETS_LE[i]}"} ${acc}`); }
      out.push(`${name}_bucket{${l}${l ? "," : ""}le="+Inf"} ${x.count}`, `${name}_sum${l ? `{${l}}` : ""} ${x.sumMs / 1000}`, `${name}_count${l ? `{${l}}` : ""} ${x.count}`);
    }
  };
  const s = (ms: number) => ms / 1000;
  add("numinia_players", "gauge", "Connections in the instance now: people and AI agents.", [["", m.conectados]]);
  add("numinia_connections_total", "counter", "WebSocket connections by outcome.", [
    ['{result="accepted"}', m.conexiones.aceptadas], ['{result="closed"}', m.conexiones.cerradas], ['{result="rejected_full"}', m.conexiones.rechazadasLlenas]]);
  add("numinia_ticks_total", "counter", "Simulation ticks run since start.", [["", m.tick]]);
  add("numinia_tick_duration_seconds_total", "counter", "Time spent inside ticks, summed.", [["", m.tickSumaS]]);
  for (const [k, v] of [["p50", m.tickMs.p50], ["p99", m.tickMs.p99], ["max", m.tickMs.peor]] as const)
    add(`numinia_tick_duration_${k}_seconds`, "gauge", `Tick duration, ${k}, last 200 ticks (precomputed: not aggregatable; numinia_tick_seconds is).`, [["", s(v)]]);
  add("numinia_tick_late_p99_seconds", "gauge", "How late ticks started against schedule, p99, last 200 ticks.", [["", s(m.retrasoVentanaMs.p99)]]);
  add("numinia_tick_response_p99_seconds", "gauge", "Lateness plus duration of a tick, p99, last 200 ticks (budget: one tick).", [["", s(m.respuestaTickMs.p99)]]);
  add("numinia_sent_bytes_total", "counter", "Bytes sent to clients over WebSockets.", [["", m.bytesEnviados]]);
  add("process_cpu_seconds_total", "counter", "Total user and system CPU time spent in seconds.", [["", m.proceso.cpuSegundos]]);
  add("process_resident_memory_bytes", "gauge", "Resident memory size in bytes.", [["", m.memoriaBytes.rss]]);
  add("nodejs_heap_size_used_bytes", "gauge", "Process heap size used from Node.js in bytes.", [["", m.memoriaBytes.heap]]);
  add("nodejs_eventloop_lag_p99_seconds", "gauge", `The 99th percentile of the recorded event loop delays, AS SAMPLED: includes the ${m.proceso.bucleResolucionMs} ms sampling resolution (real delay: numinia_eventloop_delay_p99_seconds).`, [["", s(m.proceso.bucleMs.p99)]]);
  add("numinia_eventloop_delay_p99_seconds", "gauge", "Event loop delay, p99, last ~10 s, minus the sampling resolution (the real delay).", [["", s(m.proceso.bucleRealMs.p99)]]);
  add("numinia_eventloop_delay_max_seconds", "gauge", "Event loop delay, worst, last ~10 s, minus the sampling resolution.", [["", s(m.proceso.bucleRealMs.peor)]]);
  add("numinia_eventloop_utilization_ratio", "gauge", "Event loop utilisation, 0 (idle) to 1 (never idle), last ~10 s.", [["", m.proceso.utilizacionBucle]]);
  add("numinia_gc_pause_seconds_total", "counter", "Garbage-collection pause time since start (monotonic; before B2 it was the last ~10 s).", [["", s(m.proceso.gcAcumulado.ms)]]);
  add("numinia_gc_pauses_total", "counter", "Garbage-collection pauses since start.", [["", m.proceso.gcAcumulado.pausas]]);
  add("numinia_gc_pause_window_seconds", "gauge", "Garbage-collection pause time in the last ~10 s window.", [["", s(m.proceso.gc.totalMs)]]);
  if (m.proceso.anfitrion) {
    add("numinia_host_cpu_busy_ratio", "gauge", "Host CPU busy (not idle, not waiting for IO), last ~10 s.", [["", m.proceso.anfitrion.cpuPct / 100]]);
    add("numinia_host_cpu_steal_ratio", "gauge", "Host CPU stolen by the hypervisor, last ~10 s.", [["", m.proceso.anfitrion.stealPct / 100]]);
  }
  add("numinia_feature_intents_total", "counter", "Feature intents from players since start: accepted (queued), dropped (rate limit), bad (malformed).", [
    ['{result="accepted"}', m.piezasTotales.intents], ['{result="dropped"}', m.piezasTotales.descartados], ['{result="bad"}', m.piezasTotales.malos]]);
  const errs = [...(h.erroresDe ?? [])].sort((a, b) => a[0].localeCompare(b[0]));
  add("numinia_feature_errors_total", "counter", "Errors thrown by a feature's code since start (all hooks).", errs.map(([f, n]) => [`{feature="${esc(f)}"}`, n] as [string, number]));
  if (h.coste) {
    hist("numinia_tick_seconds", "Tick duration (all of Instance.tick), since start.", [[{}, h.coste.tick]]);
    hist("numinia_tick_phase_seconds", "Duration of each phase of the tick, since start.", h.coste.fases.map((f) => [{ phase: f.nombre }, f.hist]));
    hist("numinia_feature_hook_seconds", "What one feature's hook cost in one tick (intent handlers, onTick, onVuelta, near), since start.",
      [...h.coste.ganchos].map(([g, w]) => [{ feature: g.pieza, hook: g.gancho }, w.hist]));
  }
  if (h.gc) hist("nodejs_gc_duration_seconds", "Garbage collection duration by kind, since start.", Object.entries(h.gc).map(([kind, x]) => [{ kind }, x]));
  if (openMetrics) out.push("# EOF");
  return out.join("\n") + "\n";
}
