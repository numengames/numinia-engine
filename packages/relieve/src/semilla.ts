// semilla (naturaleza N1): the seeded randomness behind the nature pieces. Pure (no three.js, no DOM, no Math.random, no
// clock): the same integer seed gives the same numbers on every device, server and page, so a landscape is a function of
// `(semilla, x, z)` and never has to be stored or sent.
//
// COPIED (technique only, all public domain / CC0 / freely described):
//  - mulberry32 PRNG (Tommy Ettinger, public domain) → `crearAzar`.
//  - the integer lattice hash is a small multiply-xorshift mix in the family of "lowbias32" (Chris Wellons, public domain,
//    nullprogram.com/blog/2018/07/31/) → `hash2`.
//  - 2D simplex noise: Stefan Gustavson, «Simplex noise demystified» (2005, public domain) → `simplex2`.
//  - fbm / ridged recipes: Inigo Quilez, iquilezles.org/articles/fbm and /morenoise; Red Blob Games «Making maps with
//    noise» (redblobgames.com/maps/terrain-from-noise).
// CHANGED: all of it is keyed by an integer seed (no permutation tables to build or ship), gradients come from the hash,
// and results are normalised to known ranges (value noise 0…1, simplex −1…1) so callers can rely on bounds.

/** A fresh random stream in 0…1 from an integer seed (mulberry32). Same seed, same sequence. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer mix of (seed, ix, iz). */
function mezcla(semilla: number, ix: number, iz: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(semilla | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A deterministic number in 0…1 for an integer lattice point. */
export function hash2(semilla: number, ix: number, iz: number): number {
  return mezcla(semilla, ix, iz) / 4294967296;
}

const quintica = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in 0…1 (quintic interpolation of lattice hashes). */
export function valor2(semilla: number, x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = quintica(x - ix), fz = quintica(z - iz);
  const a = hash2(semilla, ix, iz), b = hash2(semilla, ix + 1, iz), c = hash2(semilla, ix, iz + 1), d = hash2(semilla, ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
// 12 unit-ish gradient directions
const GX = [1, -1, 1, -1, 1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GZ = [1, 1, -1, -1, 0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

/** 2D simplex noise, about −1…1 (scaled so the reachable range is within ±1). */
export function simplex2(semilla: number, x: number, z: number): number {
  const s = (x + z) * F2, i = Math.floor(x + s), j = Math.floor(z + s), t = (i + j) * G2;
  const x0 = x - (i - t), z0 = z - (j - t);
  const i1 = x0 > z0 ? 1 : 0, j1 = x0 > z0 ? 0 : 1;
  const x1 = x0 - i1 + G2, z1 = z0 - j1 + G2, x2 = x0 - 1 + 2 * G2, z2 = z0 - 1 + 2 * G2;
  const esquina = (ex: number, ez: number, ci: number, cj: number) => {
    const q = 0.5 - ex * ex - ez * ez;
    if (q <= 0) return 0;
    const g = mezcla(semilla, ci, cj) % 12, q2 = q * q;
    return q2 * q2 * (GX[g] * ex + GZ[g] * ez);
  };
  const r = esquina(x0, z0, i, j) + esquina(x1, z1, i + i1, j + j1) + esquina(x2, z2, i + 1, j + 1);
  return Math.max(-1, Math.min(1, r * 70));
}

/** Fractal sum of simplex octaves, normalised to about −1…1. */
export function fbm(semilla: number, x: number, z: number, octavas = 4, lacunaridad = 2, ganancia = 0.5): number {
  let suma = 0, amp = 1, f = 1, tope = 0;
  for (let o = 0; o < octavas; o++) {
    suma += amp * simplex2((semilla + o * 1013) | 0, x * f + o * 17.3, z * f - o * 9.1);
    tope += amp; amp *= ganancia; f *= lacunaridad;
  }
  return suma / tope;
}

/** Ridged noise 0…1: sharp crests where the simplex field crosses zero (Quilez «morenoise»), squared for narrow ridges. */
export function cresta2(semilla: number, x: number, z: number, octavas = 3): number {
  let suma = 0, amp = 1, f = 1, tope = 0;
  for (let o = 0; o < octavas; o++) {
    const r = 1 - Math.abs(simplex2((semilla + o * 733) | 0, x * f - o * 5.7, z * f + o * 12.9));
    suma += amp * r * r; tope += amp; amp *= 0.5; f *= 2;
  }
  return suma / tope;
}
