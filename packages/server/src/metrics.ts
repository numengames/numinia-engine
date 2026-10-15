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
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildMetrics(o: {
  version: string; uptimeMs: number; tick: number; tickHz: number; people: number; capacity: number;
  ticks: TickWindow; bytes: ByteWindow; lagMs: number; mem: { rss: number; heapUsed: number };
  lags: TickWindow; responses: TickWindow; runtime: RuntimeWindow; entorno: Entorno;
  counts: { aceptadas: number; cerradas: number; rechazadasLlenas: number }; bytesTotal: number; tickSumMs: number;
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
  };
}

/** The same numbers in the Prometheus text exposition format (GET /metrics.prom), with the names the
 * Prometheus conventions and prom-client use: base units (seconds, bytes), `_total` on counters. */
export function toPrometheus(m: Metrics): string {
  const out: string[] = [];
  const add = (name: string, type: "gauge" | "counter", help: string, rows: [string, number][]) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const [labels, v] of rows) out.push(`${name}${labels} ${Number.isFinite(v) ? v : 0}`);
  };
  const s = (ms: number) => ms / 1000;
  add("numinia_players", "gauge", "People connected to the instance now.", [["", m.conectados]]);
  add("numinia_connections_total", "counter", "WebSocket connections by outcome.", [
    ['{result="accepted"}', m.conexiones.aceptadas], ['{result="closed"}', m.conexiones.cerradas], ['{result="rejected_full"}', m.conexiones.rechazadasLlenas]]);
  add("numinia_ticks_total", "counter", "Simulation ticks run since start.", [["", m.tick]]);
  add("numinia_tick_duration_seconds_total", "counter", "Time spent inside ticks, summed.", [["", m.tickSumaS]]);
  for (const [k, v] of [["p50", m.tickMs.p50], ["p99", m.tickMs.p99], ["max", m.tickMs.peor]] as const)
    add(`numinia_tick_duration_${k}_seconds`, "gauge", `Tick duration, ${k}, last 200 ticks.`, [["", s(v)]]);
  add("numinia_tick_late_p99_seconds", "gauge", "How late ticks started against schedule, p99, last 200 ticks.", [["", s(m.retrasoVentanaMs.p99)]]);
  add("numinia_tick_response_p99_seconds", "gauge", "Lateness plus duration of a tick, p99, last 200 ticks (budget: one tick).", [["", s(m.respuestaTickMs.p99)]]);
  add("numinia_sent_bytes_total", "counter", "Bytes sent to clients over WebSockets.", [["", m.bytesEnviados]]);
  add("process_cpu_seconds_total", "counter", "Total user and system CPU time spent in seconds.", [["", m.proceso.cpuSegundos]]);
  add("process_resident_memory_bytes", "gauge", "Resident memory size in bytes.", [["", m.memoriaMB.rss * 1048576]]);
  add("nodejs_heap_size_used_bytes", "gauge", "Process heap size used from Node.js in bytes.", [["", m.memoriaMB.heap * 1048576]]);
  add("nodejs_eventloop_lag_p99_seconds", "gauge", "The 99th percentile of the recorded event loop delays.", [["", s(m.proceso.bucleMs.p99)]]);
  add("numinia_eventloop_utilization_ratio", "gauge", "Event loop utilisation, 0 (idle) to 1 (never idle), last ~10 s.", [["", m.proceso.utilizacionBucle]]);
  add("numinia_gc_pause_seconds_total", "counter", "Garbage-collection pause time in the last ~10 s window.", [["", s(m.proceso.gc.totalMs)]]);
  if (m.proceso.anfitrion) {
    add("numinia_host_cpu_busy_ratio", "gauge", "Host CPU busy (not idle, not waiting for IO), last ~10 s.", [["", m.proceso.anfitrion.cpuPct / 100]]);
    add("numinia_host_cpu_steal_ratio", "gauge", "Host CPU stolen by the hypervisor, last ~10 s.", [["", m.proceso.anfitrion.stealPct / 100]]);
  }
  return out.join("\n") + "\n";
}
