// metrics: what the server says about itself on GET /metrics. Pure bookkeeping, no I/O, no timers.
// Rolling windows: the last 200 tick durations (10 s at 20 Hz) and one byte sample per second (10 s).

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
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function buildMetrics(o: {
  version: string; uptimeMs: number; tick: number; tickHz: number; people: number; capacity: number;
  ticks: TickWindow; bytes: ByteWindow; lagMs: number; mem: { rss: number; heapUsed: number };
}): Metrics {
  const t = o.ticks.summary();
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
  };
}
