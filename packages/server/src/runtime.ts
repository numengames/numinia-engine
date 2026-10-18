// runtime: what the process and its machine say about themselves once per second (the USE method:
// utilisation, saturation, errors for each resource). Node's own instruments, no dependencies:
//   - event loop utilisation and delay (perf_hooks), garbage-collection pauses (PerformanceObserver 'gc'),
//   - process CPU (process.cpuUsage), host CPU busy and STEAL from /proc/stat (Linux only; null elsewhere).
// Steal is the time a virtual machine wanted the CPU and the hypervisor gave it to someone else: a
// measurement taken with steal above ~2 % measures the neighbours, not the engine.
//   - D3: how long the MAIN thread was ready to run but waited for a CPU (/proc/thread-self/schedstat, Linux only).
// Steal only sees the hypervisor; on a shared machine (a desktop running other jobs on the same core, a busy VPS) the
// other processes take the core without any steal. Wait above ~2 % of the wall clock (like steal) = slow ticks are the
// machine's, not the engine's (D3: every startup "stall" measured on the desktop was this, never the engine's code).
import { readFileSync } from "node:fs";
import os from "node:os";
import { monitorEventLoopDelay, performance, PerformanceObserver } from "node:perf_hooks";

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

/** /proc/<pid>/task/<tid>/schedstat: `ns on the CPU · ns waiting on a run queue · timeslices`. Only the wait is kept,
 * in ms. null if the text is not that. */
export function parseSchedstat(text: string): number | null {
  const f = text.trim().split(/\s+/).map(Number);
  if (f.length < 2 || !Number.isFinite(f[0]) || !Number.isFinite(f[1]) || f[1] < 0) return null;
  return f[1] / 1e6;
}

// sample() runs on the main JS thread, so thread-self is the thread that runs the ticks (not GC or compiler helpers)
const readEspera = (): number | null => { try { return parseSchedstat(readFileSync("/proc/thread-self/schedstat", "utf8")); } catch { return null; } };

type Sample = {
  at: number; cpuMs: number; elu: ReturnType<typeof performance.eventLoopUtilization>;
  stat: Stat | null; gcN: number; gcMs: number; esperaMs: number | null;
};

export type RuntimeWindow = {
  cpuPct: number;              // this process, % of ONE core (user + system)
  cpuSegundos: number;         // this process, CPU seconds since start (cumulative, for rate())
  utilizacionBucle: number;    // event loop utilisation 0..1 (1 = never idle)
  bucleMs: { p50: number; p99: number; peor: number };
  gc: { pausas: number; totalMs: number; peorMs: number };
  anfitrion: { cpuPct: number; stealPct: number; carga1m: number } | null;
  /** D3: the main thread was ready but another process had the core (% of the wall clock, last ~10 s; seconds since
   * start, for rate()). null where the kernel does not say (not Linux). */
  esperaCpu: { pct: number; segundos: number } | null;
};

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

export class Runtime {
  private samples: Sample[] = [];
  private delay = monitorEventLoopDelay({ resolution: 10 });
  private prevDelay = { p50: 0, p99: 0, peor: 0 };
  private gcN = 0; private gcMs = 0; private gcPeak = 0; private gcPeakPrev = 0;
  private obs: PerformanceObserver;
  private readonly size: number;
  private cpuSecondsTotal = 0;

  constructor(windowSamples = 11) {
    this.size = windowSamples;
    this.delay.enable();
    this.obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { this.gcN++; this.gcMs += e.duration; if (e.duration > this.gcPeak) this.gcPeak = e.duration; }
    });
    try { this.obs.observe({ entryTypes: ["gc"] }); } catch { /* gc entries unavailable: counters stay 0 */ }
    this.sample();
  }

  /** Call once per second. */
  sample(now = performance.now()): void {
    const c = process.cpuUsage();
    this.cpuSecondsTotal = (c.user + c.system) / 1e6;
    this.samples.push({ at: now, cpuMs: (c.user + c.system) / 1000, elu: performance.eventLoopUtilization(), stat: readStat(), gcN: this.gcN, gcMs: this.gcMs, esperaMs: readEspera() });
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
      gc: { pausas: b.gcN - a.gcN, totalMs: r2(b.gcMs - a.gcMs), peorMs: r2(Math.max(this.gcPeak, this.gcPeakPrev)) },
      anfitrion: host,
      esperaCpu: a.esperaMs !== null && b.esperaMs !== null
        ? { pct: wall > 0 ? r2((100 * (b.esperaMs - a.esperaMs)) / wall) : 0, segundos: Math.round(b.esperaMs) / 1000 }
        : null,
    };
  }

  close(): void { this.delay.disable(); this.obs.disconnect(); }
}
