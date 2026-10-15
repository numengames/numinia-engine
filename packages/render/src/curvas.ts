// curvas (H8): values over a particle's life (size, colour, alpha) and the fire's flicker. Pure: the GPU evaluates the
// same 4-key piecewise-linear formula (particulas.ts), tests evaluate it here. The flicker is a sum of slow sines (≤ 2.1
// Hz), so the light never flashes more than 3 times per second (WCAG 2.3.1; V7's limiter, test/particulas.test.ts).

/** Keys [t, value], t in 0..1 (normalised age). Any number of keys; the GPU gets 4 (resampled). */
export type Curva = [number, number][];
export type CurvaColor = [number, number, number, number][]; // [t, r, g, b], 0..1
export type Curva4 = { t: [number, number, number, number]; v: [number, number, number, number] };

/** Plain piecewise-linear evaluation of a curve (any number of keys). */
export function evaluar(c: Curva, a: number): number {
  if (!c.length) return 1;
  if (a <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (a <= c[i][0]) { const [t0, v0] = c[i - 1], [t1, v1] = c[i]; return v0 + ((v1 - v0) * (a - t0)) / Math.max(1e-6, t1 - t0); }
  }
  return c[c.length - 1][1];
}

/** Exactly 4 keys, sorted, t in [0, 1]: fewer keys are padded, more are resampled at their own quartiles. */
export function curva4(c: Curva): Curva4 {
  const s = [...c].map(([t, v]) => [Math.min(1, Math.max(0, t)), v] as [number, number]).sort((a, b) => a[0] - b[0]);
  if (!s.length) s.push([0, 1]);
  let k: [number, number][];
  if (s.length <= 4) { k = s.slice(); while (k.length < 4) k.push([1, k[k.length - 1][1]]); if (k[3][0] < 1 && s.length < 4) k[3] = [1, k[3][1]]; }
  else k = [0, 1 / 3, 2 / 3, 1].map((t) => [t, evaluar(s, t)] as [number, number]);
  return { t: [k[0][0], k[1][0], k[2][0], k[3][0]], v: [k[0][1], k[1][1], k[2][1], k[3][1]] };
}

/** The GPU's formula: v0 + Σ (v[i+1] - v[i]) · clamp((a - t[i]) / (t[i+1] - t[i])). Branchless; same result as evaluar. */
export function evaluar4(c: Curva4, a: number): number {
  let v = c.v[0];
  for (let i = 0; i < 3; i++) {
    const d = Math.max(1e-4, c.t[i + 1] - c.t[i]);
    v += (c.v[i + 1] - c.v[i]) * Math.min(1, Math.max(0, (a - c.t[i]) / d));
  }
  return v;
}

/** A colour curve split into three 4-key curves (r, g, b). */
export function color4(c: CurvaColor): [Curva4, Curva4, Curva4] {
  return [1, 2, 3].map((j) => curva4(c.map((k) => [k[0], k[j]] as [number, number]))) as [Curva4, Curva4, Curva4];
}

/** The fire light's intensity factor at time t (s): ~1 ± 0.25, smooth; components ≤ 2.1 Hz. */
export function parpadeo(t: number, semilla = 0): number {
  const f = (hz: number, fase: number) => Math.sin(2 * Math.PI * hz * t + fase + semilla * 1.7);
  return 1 + 0.12 * f(1.3, 0) + 0.08 * f(2.1, 1.1) + 0.05 * f(0.7, 2.3);
}

/** Most local maxima (flashes) of `fn` in any 1-second window over `segundos` (sampled at `hz`). */
export function destellosPorSegundo(fn: (t: number) => number, segundos: number, hz = 1000): number {
  const picos: number[] = [];
  let a = fn(0), b = fn(1 / hz);
  for (let i = 2; i <= segundos * hz; i++) {
    const c = fn(i / hz);
    if (b > a && b >= c) picos.push((i - 1) / hz);
    a = b; b = c;
  }
  let max = 0;
  for (let i = 0, j = 0; i < picos.length; i++) { while (picos[i] - picos[j] >= 1) j++; max = Math.max(max, i - j + 1); }
  return max;
}
