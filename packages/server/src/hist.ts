// hist: a log-bucket histogram with 1 % relative precision (the idea behind HdrHistogram), small enough to
// merge across the bot processes of a swarm. Values are milliseconds. Percentiles answer with the upper
// edge of the bucket, never above the largest value recorded, so they err on the safe (slow) side by <= 1 %.

const LOW = 0.01;             // ms: everything at or below this lands in bucket 0
const RATIO = 1.01;           // each bucket is 1 % wider than the previous one
const LN = Math.log(RATIO);
const SIZE = 1700;            // 0.01 ms * 1.01^1699 ~ 2.2e4 s: more than any run

export type HistJSON = { n: number; sum: number; max: number; b: [number, number][] };
export type HistSummary = { n: number; p50: number; p90: number; p99: number; max: number; mean: number };

export class Hist {
  readonly counts = new Uint32Array(SIZE);
  n = 0; sum = 0; max = 0;

  record(v: number): void {
    if (!Number.isFinite(v) || v < 0) return;
    const i = v <= LOW ? 0 : Math.min(SIZE - 1, 1 + Math.floor(Math.log(v / LOW) / LN));
    this.counts[i]++; this.n++; this.sum += v;
    if (v > this.max) this.max = v;
  }

  merge(o: Hist): void {
    for (let i = 0; i < SIZE; i++) this.counts[i] += o.counts[i];
    this.n += o.n; this.sum += o.sum; if (o.max > this.max) this.max = o.max;
  }

  /** Value at quantile q in [0, 1] (0 when empty). */
  at(q: number): number {
    if (this.n === 0) return 0;
    const target = Math.max(1, Math.ceil(this.n * q));
    let seen = 0;
    for (let i = 0; i < SIZE; i++) {
      seen += this.counts[i];
      if (seen >= target) return Math.min(this.max, LOW * RATIO ** i);
    }
    return this.max;
  }

  summary(): HistSummary {
    const r = (x: number) => Math.round(x * 100) / 100;
    return { n: this.n, p50: r(this.at(0.5)), p90: r(this.at(0.9)), p99: r(this.at(0.99)), max: r(this.max), mean: r(this.n ? this.sum / this.n : 0) };
  }

  toJSON(): HistJSON {
    const b: [number, number][] = [];
    for (let i = 0; i < SIZE; i++) if (this.counts[i]) b.push([i, this.counts[i]]);
    return { n: this.n, sum: this.sum, max: this.max, b };
  }

  static from(j: HistJSON | undefined): Hist {
    const h = new Hist();
    if (!j) return h;
    for (const [i, c] of j.b) if (i >= 0 && i < SIZE) h.counts[i] = c;
    h.n = j.n; h.sum = j.sum; h.max = j.max;
    return h;
  }
}

export const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
