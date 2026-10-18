// runtime: what the process and its machine say about themselves once per second (the USE method:
// utilisation, saturation, errors for each resource). Node's own instruments, no dependencies:
//   - event loop utilisation and delay (perf_hooks), garbage-collection pauses (PerformanceObserver 'gc'),
//   - process CPU (process.cpuUsage), host CPU busy and STEAL from /proc/stat (Linux only; null elsewhere).
// Steal is the time a virtual machine wanted the CPU and the hypervisor gave it to someone else: a
// measurement taken with steal above ~2 % measures the neighbours, not the engine.
import { readFileSync } from "node:fs";
import os from "node:os";
import { constants, monitorEventLoopDelay, performance, PerformanceObserver } from "node:perf_hooks";
import { Histograma } from "./metrics.ts";

export type Stat = { total: number; busy: number; steal: number };

/** First line of /proc/stat: `cpu user nice system idle iowait irq softirq steal guest guest_nice`.
 * guest time is already inside user, so it is not added again. null if the text is not that. */
export function parseProcStat(text: string): Stat | null {
  const f = text.split("\n")[0]?.trim().split(/\s+/);
  if (!f || f[0] !== "cpu") return null;
  const [user, nice, system, idle, iowait, irq, softirq, steal] = f.slice(1, 9).map(Number);
  const v = [user, nice, system, idle, iowait, irq, softirq, steal];
  if (v.length < 8 || v.some((x) => !Number.isFinite(x))) return null;
  const total = v.reduce((a, b) => a + b, 0);
  return { total, busy: total - idle - iowait, steal };
}

const readStat = (): Stat | null => { try { return parseProcStat(readFileSync("/proc/stat", "utf8")); } catch { return null; } };

type Sample = {
  at: number; cpuMs: number; elu: ReturnType<typeof performance.eventLoopUtilization>;
  stat: Stat | null; gcN: number; gcMs: number;
};

export type RuntimeWindow = {
  cpuPct: number;              // this process, % of ONE core (user + system)
  cpuSegundos: number;         // this process, CPU seconds since start (cumulative, for rate())
  utilizacionBucle: number;    // event loop utilisation 0..1 (1 = never idle)
  bucleMs: { p50: number; p99: number; peor: number };   // AS SAMPLED: every sample includes the resolution (+10 ms, see bucleRealMs)
  /** B2: bucleMs minus the sampling resolution (Node: interval-based samples include it), floored at 0: the real delay. */
  bucleRealMs: { p50: number; p99: number; peor: number };
  bucleResolucionMs: number;
  gc: { pausas: number; totalMs: number; peorMs: number };   // last ~10 s window (goes up AND down)
  /** B2: since start, never goes down (a real counter): pauses and their summed ms, total and per kind of collection. */
  gcAcumulado: { pausas: number; ms: number; porTipo: Record<GcTipo, { pausas: number; ms: number }> };
  anfitrion: { cpuPct: number; stealPct: number; carga1m: number } | null;
};

/** B2: Node's gc entry `detail.kind` (perf_hooks constants NODE_PERFORMANCE_GC_*) as label values (prom-client's names). */
export const GC_TIPOS = ["minor", "minor_mark_sweep", "major", "incremental", "weakcb"] as const;
export type GcTipo = (typeof GC_TIPOS)[number];
const GC_KIND: Record<number, GcTipo> = {
  [constants.NODE_PERFORMANCE_GC_MINOR]: "minor", [constants.NODE_PERFORMANCE_GC_MINOR_MARK_SWEEP ?? 2]: "minor_mark_sweep",
  [constants.NODE_PERFORMANCE_GC_MAJOR]: "major", [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental", [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weakcb",
};
/** The event-loop delay monitor's sampling period. Every sample includes it (Node docs, monitorEventLoopDelay), so
 * bucleRealMs subtracts it. 10 ms = 100 wake-ups a second; 1 ms would be 1.000 for the same answer. */
export const RESOLUCION_BUCLE_MS = 10;

export type Entorno = {
  node: string; plataforma: string; kernel: string; cpuModelo: string; nucleos: number; memoriaTotalMB: number;
};

export function entorno(): Entorno {
  return {
    node: process.version, plataforma: `${os.platform()}-${os.arch()}`, kernel: os.release(),
    cpuModelo: os.cpus()[0]?.model?.trim() ?? "desconocido", nucleos: os.availableParallelism(),
    memoriaTotalMB: Math.round(os.totalmem() / 1048576),
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const real = (ms: number) => r2(Math.max(0, ms - RESOLUCION_BUCLE_MS));

export class Runtime {
  private samples: Sample[] = [];
  private delay = monitorEventLoopDelay({ resolution: RESOLUCION_BUCLE_MS });
  /** B2: gc pause durations by kind since start (fixed buckets, never reset: /metrics.prom nodejs_gc_duration_seconds). */
  readonly gcHist: Record<GcTipo, Histograma> = Object.fromEntries(GC_TIPOS.map((k) => [k, new Histograma()])) as Record<GcTipo, Histograma>;
  private prevDelay = { p50: 0, p99: 0, peor: 0 };
  private gcN = 0; private gcMs = 0; private gcPeak = 0; private gcPeakPrev = 0;
  private obs: PerformanceObserver;
  private readonly size: number;
  private cpuSecondsTotal = 0;

  constructor(windowSamples = 11) {
    this.size = windowSamples;
    this.delay.enable();
    this.obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        this.gcN++; this.gcMs += e.duration; if (e.duration > this.gcPeak) this.gcPeak = e.duration;
        const kind = (e as { detail?: { kind?: number } }).detail?.kind;
        this.gcHist[GC_KIND[kind ?? -1] ?? "major"].observe(e.duration);
      }
    });
    try { this.obs.observe({ entryTypes: ["gc"] }); } catch { /* gc entries unavailable: counters stay 0 */ }
    this.sample();
  }

  /** Call once per second. */
  sample(now = performance.now()): void {
    const c = process.cpuUsage();
    this.cpuSecondsTotal = (c.user + c.system) / 1e6;
    this.samples.push({ at: now, cpuMs: (c.user + c.system) / 1000, elu: performance.eventLoopUtilization(), stat: readStat(), gcN: this.gcN, gcMs: this.gcMs });
    if (this.samples.length > this.size) this.samples.shift();
    // the delay histogram covers ~10 s: when it is nearly fresh, the previous one answers
    if (this.delay.count >= 100 * 10) {
      this.prevDelay = { p50: this.delay.percentile(50) / 1e6, p99: this.delay.percentile(99) / 1e6, peor: this.delay.max / 1e6 };
      this.delay.reset();
      this.gcPeakPrev = this.gcPeak; this.gcPeak = 0;
    }
  }

  window(): RuntimeWindow {
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    const wall = b.at - a.at;
    const cur = this.delay.count >= 100 ? { p50: this.delay.percentile(50) / 1e6, p99: this.delay.percentile(99) / 1e6, peor: this.delay.max / 1e6 } : this.prevDelay;
    const host = a.stat && b.stat && b.stat.total > a.stat.total
      ? { cpuPct: r2((100 * (b.stat.busy - a.stat.busy)) / (b.stat.total - a.stat.total)), stealPct: r2((100 * (b.stat.steal - a.stat.steal)) / (b.stat.total - a.stat.total)), carga1m: r2(os.loadavg()[0]) }
      : null;
    return {
      cpuPct: wall > 0 ? r2((100 * (b.cpuMs - a.cpuMs)) / wall) : 0,
      cpuSegundos: r2(this.cpuSecondsTotal),
      utilizacionBucle: r2(performance.eventLoopUtilization(b.elu, a.elu).utilization),
      bucleMs: { p50: r2(cur.p50), p99: r2(cur.p99), peor: r2(cur.peor) },
      bucleRealMs: { p50: real(cur.p50), p99: real(cur.p99), peor: real(cur.peor) },
      bucleResolucionMs: RESOLUCION_BUCLE_MS,
      gc: { pausas: b.gcN - a.gcN, totalMs: r2(b.gcMs - a.gcMs), peorMs: r2(Math.max(this.gcPeak, this.gcPeakPrev)) },
      gcAcumulado: {
        pausas: this.gcN, ms: r2(this.gcMs),
        porTipo: Object.fromEntries(GC_TIPOS.map((k) => [k, { pausas: this.gcHist[k].count, ms: r2(this.gcHist[k].sumMs) }])) as Record<GcTipo, { pausas: number; ms: number }>,
      },
      anfitrion: host,
    };
  }

  close(): void { this.delay.disable(); this.obs.disconnect(); }
}
