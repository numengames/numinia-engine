// core: deterministic primitives. No DOM, no Node APIs, no floats in decisions.

// ---- Fixed point Q16.16 stored in a JS number holding an int32 ----
export const FX_ONE = 65536;
export const fx = (n: number): number => Math.round(n * FX_ONE) | 0;
export const fxToFloat = (a: number): number => a / FX_ONE; // presentation only
export const fxAdd = (a: number, b: number): number => (a + b) | 0;
export const fxSub = (a: number, b: number): number => (a - b) | 0;
// Exact floor(a*b / 2^16) for int32 a, b. a*b can reach 2^62 (not exact in float64), so split a:
// (a>>16)*b < 2^46 and (a&0xffff)*b < 2^47 are both exact; dividing by 2^16 is exact. Wraps like int32.
export function fxMul(a: number, b: number): number {
  return ((a >> 16) * b + Math.floor(((a & 0xffff) * b) / FX_ONE)) | 0;
}
export function fxDiv(a: number, b: number): number {
  if (b === 0) return a >= 0 ? 0x7fffffff : -0x80000000;
  return Math.trunc((a * FX_ONE) / b) | 0; // a*65536 < 2^47: exact in float64
}
export function fxSqrt(a: number): number {
  if (a <= 0) return 0;
  // integer sqrt of a<<16 by Newton on exact integers (< 2^48)
  const n = a * FX_ONE;
  let x = Math.floor(Math.sqrt(n)); // seed only; corrected below to the exact floor
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x | 0;
}
export const fxClamp = (a: number, lo: number, hi: number): number => (a < lo ? lo : a > hi ? hi : a);

// ---- Seeded PRNG (mulberry32): state is one uint32, lives in the simulation state ----
export function rngNext(state: Uint32Array): number {
  let t = (state[0] = (state[0] + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
export const rngInt = (state: Uint32Array, n: number): number => rngNext(state) % n;

// ---- Hash (FNV-1a 32) over raw bytes: the state fingerprint ----
export function fnv1a(bytes: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
  return h >>> 0;
}
export const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

// ---- Result: validation never throws ----
export type Issue = { path: string; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };
