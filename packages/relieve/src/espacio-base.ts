// espacio-base (H1): the PURE relief of the «espacio base» — the place every character is born in, whatever the seed.
// A flat plateau around the spawn, then a ring of variety by compass sector: mountain with crests, plain, or a cleft.
// Numbers only: no three.js, no DOM, no clock, no Math.random → client and server get the same height for the same seed.
//
// COPIED/CHANGED: design from Pablo's approved prototype (work/naturaleza/espacio-base/malla.py `mundo(seed)`): value-noise fBm,
// sectors by a sum of cosines of the angle (s>0 mountain, s≈0 plain, s<-0.35 cleft), a mask that keeps the plateau flat to 26 m
// and rises smoothly to ~96 m. CHANGED: numpy's random lattice is replaced by `hash2`/`valor2` of semilla.ts (integer-keyed,
// non-periodic) and the sector shape is bounded so EVERY seed has a mountain, so the ring is never empty (see `relieveDe`).
import { hash2, valor2 } from "./semilla.ts";

/** H7: the seed every world with no `semilla` of its own is born with, so all empty worlds share one landscape (Pablo, 20-10). The ONE place the number lives:
 * the server's schema (features/espaciobase), the page's defaults (render/espacio-base) and the collision mesh (sim/terreno-malla) all import it. A world changes it in its espacio-base.json. */
export const SEMILLA_BASE_DEFECTO = 42;

/** Radius (m) of the dead-flat plateau around the spawn: the height is exactly 0 for every distance ≤ this. */
export const RADIO_MESETA = 26;
/** Distance (m) at which the mask reaches full strength. */
export const RADIO_PLENO = 96;

/** A seed is an integer or a stable string. Strings go through our own FNV-1a + avalanche (never JS engine hashing). */
export type SemillaBase = number | string;

/** Integer (int32) from a seed. Numbers: floor to int32. Strings: FNV-1a over UTF-16 code units, then a final avalanche. */
export function semillaEntera(semilla: SemillaBase): number {
  if (typeof semilla === "number") return Number.isFinite(semilla) ? Math.floor(semilla) | 0 : 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h | 0;
}

const AM = [1, 0.8, 0.6];
const sstep = (a: number, b: number, x: number) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

type Mundo = { s: number; ph0: number; ph1: number; ph2: number; a: number; b: number; c: number; d: number; e: number };
const cacheMundos = new Map<number, Mundo>();
function mundoDe(n: number): Mundo {
  let m = cacheMundos.get(n);
  if (m) return m;
  m = {
    s: n,
    ph0: hash2(n, 9101, 1) * 6.283185307179586, ph1: hash2(n, 9102, 1) * 6.283185307179586, ph2: hash2(n, 9103, 1) * 6.283185307179586,
    a: (n + 0x1f3) | 0, b: (n + 0x2f7) | 0, c: (n + 0x3fd) | 0, d: (n + 0x4e1) | 0, e: (n + 0x5c3) | 0,
  };
  if (cacheMundos.size > 64) cacheMundos.clear();
  cacheMundos.set(n, m);
  return m;
}

/** Sector value −1…1 (before shaping) at an angle: the sum of cosines of the prototype, scaled by its maximum 2.4 → 1. */
function sector(m: Mundo, th: number): number {
  return (AM[0] * Math.cos(th + m.ph0) + AM[1] * Math.cos(2 * th + m.ph1) + AM[2] * Math.cos(3 * th + m.ph2)) / 1.6;
}

/**
 * Terrain height (m) of the espacio base at a world point. Pure and deterministic.
 * Exactly 0 for every distance ≤ RADIO_MESETA (the spawn is always on flat ground); then rises smoothly; ≈ −10 … +75.
 */
export function alturaBase(semilla: SemillaBase, x: number, z: number): number {
  const d = Math.hypot(x, z);
  if (d <= RADIO_MESETA) return 0;
  const m = mundoDe(semillaEntera(semilla));
  const th = Math.atan2(z, x);
  const s = sector(m, th);
  const fb = (valor2(m.a, x * 0.011, z * 0.011) + valor2(m.b, (x + 31) * 0.02, (z - 17) * 0.02) * 0.35 + valor2(m.c, (x + 62) * 0.036, (z - 34) * 0.036) * 0.1) / 1.45;
  const u = 2 * fb - 1;
  const rid = 1 - Math.sqrt(u * u + 0.05) + 0.2236; // crest: |u| with the kink rounded (slope stays bounded), 0…1
  const sp = s < 0 ? 0 : s > 1 ? 1 : s;
  const mont = Math.pow(sp, 1.2) * (12 + 34 * Math.pow(rid, 1.5)) * (0.4 + 0.6 * Math.min(1, d / 200));
  const hend = -Math.min(1, Math.max(0, -s - 0.35)) * (5 + 5 * valor2(m.d, x * 0.05, z * 0.05));
  const rol = (valor2(m.d, x * 0.03 + 5, z * 0.03 + 9) - 0.5) * 3;
  const masc = sstep(RADIO_MESETA, RADIO_PLENO, d);
  return masc * (mont + hend + rol) + 0;
}

/** Where a character is born: the centre of the flat plateau, on the ground. Same for every seed (the plateau is flat for all). */
export function spawnBase(_semilla?: SemillaBase): { x: number; y: number; z: number } {
  return { x: 0, y: 0, z: 0 };
}
