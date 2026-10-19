// arboles (naturaleza N2): low-poly trees with little branches that sway in the wind. Procedural and seed-driven; every tree
// is ONE merged indexed BufferGeometry with vertex colours (faceted trunk prism, thin tapered branch prisms carrying leaf
// blobs, dark-at-the-bottom → light-on-top gradient on every blob = free fake ambient occlusion). No texture, no light, no
// shadow of its own. Flat shading comes from screen derivatives, so the geometry carries no normals.
//
// COPIED / CHANGED (technique only, nothing unlicensed taken):
//  - shape reference: the Quaternius / Kenney CC0 low-poly nature packs (round broadleaf, stacked-cone pine, slim birch,
//    bush) as a look to aim at; our meshes are generated from the seed, no asset is read. Icosahedron / octahedron blob
//    with jittered vertices is the classic low-poly crown (three.js IcosahedronGeometry vertex table, MIT).
//  - wind: the "sway grows with height, canopy most" idea of the Codrops «grass / foliage with three.js TSL» tutorials and
//    the GDC talk on Ghost of Tsushima grass (technique only), written as TSL (three/tsl) so it runs on WebGPU and on the
//    WebGL2 fallback, driven by the engine's wind uniform `vientoU` (entorno.ts) + one time uniform.
//  - seeded randomness: `crearAzar` / `hash2` (semilla.ts, mulberry32 + integer hash, public domain).
//
// DRAW CALLS: each species is built with TWO variants of the SAME topology; the shader morphs between their vertex sets
// (attribute `posB`/`colB`) by a per-instance 0/1, so a species is ONE draw call with both variants (5 and 6 are fall /
// blossom colours). Near LOD = one mesh per species (4); far LOD = ONE mesh for all species (a shared parametric silhouette
// — 5-sided trunk + two 8-sided bipyramids — whose proportions and colour are per-instance attributes): 5 draw calls total,
// whatever the species mix. Merging the species into one geometry would make every instance pay for every species' vertices.
// Instances use hardware instancing on an InstancedBufferGeometry (custom per-instance attributes instead of an
// instanceMatrix, because the wind must read the pre-transform height of each vertex). Zero CPU per tree per frame:
// `actualizar(t)` writes one uniform; the near/far split is a throttled O(n) pass over typed arrays (see `repartir`).
import * as THREE from "three/webgpu";
import { uniform, float, vec2, vec3, attribute, instancedBufferAttribute, positionGeometry, normalFlat, transformNormalToView, normalize, sin, cos, pow, clamp, mix, length, max, step, oneMinus } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import { crearAzar, hash2 } from "./semilla.ts";
import { NATURALEZA_POR_NIVEL } from "./niveles.ts";

export type Especie = "roble" | "pino" | "abedul" | "arbusto";
export const ESPECIES: readonly Especie[] = ["roble", "pino", "abedul", "arbusto"];
/** One tree to plant: where (m), size factor, yaw (rad) and species. `variante` (0 | 1) is optional: from the position otherwise. */
export type PuntoArbol = { x: number; y: number; z: number; escala: number; giro: number; especie: Especie | string; variante?: 0 | 1 };
export type Lod = "cerca" | "lejos";

/** Triangle budgets of the brief. */
export const TRIS_MAX_CERCA = 80;
export const TRIS_MAX_LEJOS = 26;

// ---------------------------------------------------------------------------------------------------------------------
// palette (the brief's ~12 colours: trunk brown, leaf greens + autumn orange + pink blossom, birch white)
// ---------------------------------------------------------------------------------------------------------------------
const C = (hex: number) => new THREE.Color(hex);
const TRONCO = C(0xa07850), TRONCO_OSC = C(0x74502f); // N7: lighter bark (the N6 trunks read black under flat shading)
const ABEDUL = C(0xe9e4d6), ABEDUL_OSC = C(0x34302c);
type Hojas = { oscuro: THREE.Color; claro: THREE.Color; medio: number };
const HOJAS: Record<Especie, [Hojas, Hojas]> = {
  roble: [{ oscuro: C(0x2f6b3a), claro: C(0x8fc24e), medio: 0x56933f }, { oscuro: C(0x8e3f22), claro: C(0xf0b24a), medio: 0xcf7a2a }],
  pino: [{ oscuro: C(0x1f4a3a), claro: C(0x4f9460), medio: 0x2f6a4a }, { oscuro: C(0x24455a), claro: C(0x5f9a8a), medio: 0x3b6b60 }],
  abedul: [{ oscuro: C(0x4f7f35), claro: C(0xbfd75a), medio: 0x9cbf4a }, { oscuro: C(0x9a6a22), claro: C(0xf2d65a), medio: 0xd8c04a }],
  arbusto: [{ oscuro: C(0x3a7438), claro: C(0x9ccc58), medio: 0x5f9a40 }, { oscuro: C(0xb5607e), claro: C(0xf7d0dc), medio: 0xe29ab4 }],
};

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A mesh under construction: positions, colours, per-vertex motion weights (branch stiffness, leaf flag), indices. */
class Malla {
  pos: number[] = []; col: number[] = []; mov: number[] = []; idx: number[] = [];
  vert(p: V3, c: THREE.Color, rama: number, hoja: number, k = 1): number {
    this.pos.push(p[0], p[1], p[2]); this.col.push(c.r * k, c.g * k, c.b * k); this.mov.push(rama, hoja);
    return this.pos.length / 3 - 1;
  }
  /** A triangle wound to face away from `ref` (works for convex pieces: blobs, prisms, cones). */
  tri(a: number, b: number, c: number, ref: V3) {
    const p = (i: number): V3 => [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
    const pa = p(a), pb = p(b), pc = p(c);
    const n = cross(sub(pb, pa), sub(pc, pa));
    const cen: V3 = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    if (dot(n, sub(cen, ref)) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
}

/** A tapered prism from a to b (open ends), `n` sides, colour a→b. Two triangles per side. */
function prisma(m: Malla, a: V3, b: V3, r0: number, r1: number, n: number, c0: THREE.Color, c1: THREE.Color, rama: number, giro = 0) {
  const ax = norm(sub(b, a)), t: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(t, ax)), w = cross(ax, u);
  const ia: number[] = [], ib: number[] = [];
  for (let k = 0; k < n; k++) {
    const an = giro + (k / n) * Math.PI * 2, d: V3 = [u[0] * Math.cos(an) + w[0] * Math.sin(an), u[1] * Math.cos(an) + w[1] * Math.sin(an), u[2] * Math.cos(an) + w[2] * Math.sin(an)];
    ia.push(m.vert([a[0] + d[0] * r0, a[1] + d[1] * r0, a[2] + d[2] * r0], c0, rama, 0));
    ib.push(m.vert([b[0] + d[0] * r1, b[1] + d[1] * r1, b[2] + d[2] * r1], c1, rama, 0));
  }
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, ref = lerp3(a, b, 0.5);
    m.tri(ia[k], ia[k2], ib[k], ref); m.tri(ia[k2], ib[k2], ib[k], ref);
  }
}

/** The metres of height each species is drawn to (the wind's weight is height / this). */
export const ALTURA: Record<Especie, number> = { roble: 4.7, pino: 6.8, abedul: 5.4, arbusto: 1.5 };

// ---------------------------------------------------------------------------------------------------------------------
// N7: two near templates, ONE vertex layout. A tree is a posed set of parts; every species is a different set of vertex positions of the
// SAME topology (attributes position, pos1..3, picked per instance by `especie` in the vertex shader), so all four species are ONE draw call.
//   detalle (tiers A, B; 78 triangles): bent 4-sided trunk in 2 segments (16) + 3 branches, 3-sided prisms (18) each carrying a faceted leaf clump,
//     an octahedron (3 × 8) + the crown, a jittered icosahedron (20). Branch/leaf vertices carry a sway weight `mov` (0 at the root … 1 at the tip).
//   simple (tiers C, D; 36 triangles): straight 4-sided trunk (8) + crown icosahedron (20) + ONE clump (8): irregular, no branches.
// COPIED / CHANGED: the icosahedron-with-jittered-vertices crown is the classic low-poly blob (three.js IcosahedronGeometry vertex table, MIT);
// a pine is the same parts re-posed as stacked, jagged cones; layering a few cones for a conifer is the Quaternius/Kenney pack look (shape only).
// ---------------------------------------------------------------------------------------------------------------------
type Rama = {
  /** Where on the trunk (m), azimuth, elevation (rad) and length (m) of the branch, its base radius, the clump's radii and offset from the tip. */
  y: number; az: number; elev: number; largo: number; r: number; hr: [number, number, number]; dy: number;
  /** Clump shape: apex heights (× ry) and the ring's height; `eje` puts the clump on the trunk's axis (pine tiers); `jag` alternates the ring radius (jagged edge). */
  top: number; ring: number; bot: number; jag: number; eje?: boolean;
};
type Copa = { cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; top: number; bot: number; yu: number; yl: number; ru: number; rl: number; jag: number };
type Forma = { tronco: { alto: number; r0: number; r1: number; lx: number; lz: number; curva: number }; ramas: Rama[]; copa: Copa; copaSimple?: Partial<Copa> };
const COPA0 = { top: 1, bot: 1, yu: 0.447, yl: -0.447, ru: 0.894, rl: 0.894, jag: 0.18 };
const R = (y: number, az: number, elev: number, largo: number, r: number, hr: [number, number, number], dy = 0, o: Partial<Rama> = {}): Rama => ({ y, az, elev, largo, r, hr, dy, top: 1, ring: 0, bot: 0.75, jag: 0.2, ...o });
const FORMA: Record<Especie, Forma> = {
  roble: {
    tronco: { alto: 2.5, r0: 0.3, r1: 0.14, lx: 0.12, lz: 0.05, curva: 0.1 },
    ramas: [R(1.5, 0.5, 0.55, 1.5, 0.09, [0.72, 0.55, 0.7]), R(1.9, 2.5, 0.45, 1.6, 0.08, [0.66, 0.5, 0.66]), R(2.1, 4.4, 0.6, 1.4, 0.07, [0.6, 0.5, 0.58])],
    copa: { cx: 0.1, cy: 3.55, cz: 0, rx: 1.75, ry: 1.35, rz: 1.62, ...COPA0, jag: 0.22 },
  },
  pino: {
    tronco: { alto: 6.3, r0: 0.22, r1: 0.04, lx: 0.03, lz: 0.02, curva: 0.04 },
    ramas: [R(1.4, 0.4, -0.3, 0.5, 0.07, [1.55, 1.0, 1.5], 0.6, { ring: -0.35, bot: 0.55, jag: 0.24, eje: true }), R(2.7, 2.6, -0.3, 0.5, 0.06, [1.15, 0.95, 1.1], 0.6, { ring: -0.35, bot: 0.55, jag: 0.24, eje: true }), R(3.9, 4.5, -0.3, 0.4, 0.05, [0.8, 0.85, 0.78], 0.6, { ring: -0.35, bot: 0.55, jag: 0.24, eje: true })],
    copa: { cx: 0, cy: 5.3, cz: 0, rx: 0.78, ry: 1.3, rz: 0.75, top: 1, bot: 0.8, yu: 0.0, yl: -0.7, ru: 0.45, rl: 1.0, jag: 0.22 },
    copaSimple: { cy: 4.1, ry: 2.6, rx: 1.15, rz: 1.1 },
  },
  abedul: {
    tronco: { alto: 4.0, r0: 0.13, r1: 0.06, lx: 0.25, lz: 0.1, curva: 0.18 },
    ramas: [R(2.2, 1.0, 0.7, 1.1, 0.045, [0.52, 0.46, 0.5], -0.05), R(2.8, 3.6, 0.6, 1.0, 0.04, [0.46, 0.4, 0.46]), R(3.3, 5.4, 0.8, 0.9, 0.035, [0.42, 0.4, 0.42])],
    copa: { cx: 0.25, cy: 4.4, cz: 0.1, rx: 0.95, ry: 1.35, rz: 0.9, ...COPA0, jag: 0.2 },
  },
  arbusto: {
    tronco: { alto: 0.18, r0: 0.07, r1: 0.05, lx: 0, lz: 0, curva: 0 },
    ramas: [R(0.1, 0.3, 0.12, 0.55, 0.04, [0.5, 0.4, 0.5], 0.2, { bot: 0.6 }), R(0.12, 2.4, 0.1, 0.6, 0.04, [0.46, 0.38, 0.46], 0.18, { bot: 0.6 }), R(0.1, 4.3, 0.14, 0.5, 0.04, [0.44, 0.36, 0.44], 0.22, { bot: 0.6 })],
    copa: { cx: 0, cy: 0.55, cz: 0, rx: 0.95, ry: 0.6, rz: 0.9, ...COPA0, bot: 0.55 },
  },
};
export const LADOS_TRONCO = 4;
/** Triangles of the detailed near tree (tiers A/B) and of the simple one (tiers C/D). */
export const TRIANGULOS_DETALLE = 2 * LADOS_TRONCO * 2 + 3 * 6 + 3 * 8 + 20;
export const TRIANGULOS_SIMPLE = 2 * LADOS_TRONCO + 8 + 20;
export const TRIANGULOS_ARBOL = TRIANGULOS_DETALLE;
export const triangulosCerca = (detalle: boolean) => (detalle ? TRIANGULOS_DETALLE : TRIANGULOS_SIMPLE);

export type GeometriaArbol = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };
const cacheArbol: Record<string, GeometriaArbol> = {};
/** The shared near template: 4 position sets (one per species), `tono` 0…1 (dark → light), `parte` 0 bark / 1 leaf, `mov` 0…1 (sway weight, tips most). */
export function geometriaArbol(detalle = true): GeometriaArbol {
  const clave = detalle ? "d" : "s";
  if (cacheArbol[clave]) return cacheArbol[clave];
  const nRamas = detalle ? 3 : 1, nSeg = detalle ? 2 : 1;
  const nv = LADOS_TRONCO * (nSeg + 1) + (detalle ? 3 * 6 : 0) + nRamas * 6 + 12;
  const pos = ESPECIES.map(() => new Float32Array(nv * 3)), tono = new Float32Array(nv), parte = new Float32Array(nv), mov = new Float32Array(nv);
  const idx: number[] = [];
  const hv = (v: number, k: number) => hash2(0x7e + k, v, 0x33) * 2 - 1; // deterministic per-vertex jitter −1…1
  ESPECIES.forEach((esp, e) => {
    const f = FORMA[esp], P = pos[e], t = f.tronco;
    let v = 0;
    const put = (p: V3, to: number, pa: number, mo: number) => { P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2]; if (e === 0) { tono[v] = Math.min(1, Math.max(0, to + 0.1 * hv(v, 1))); parte[v] = pa; mov[v] = mo; } v++; };
    const cen = (y: number): V3 => { const q = y / t.alto; return [t.lx * q * q + t.curva * Math.sin(q * Math.PI), y, t.lz * q * q + 0.6 * t.curva * Math.sin(q * Math.PI + 1)]; };
    // trunk: rings at y = −0.05, mid, top
    for (let s = 0; s <= nSeg; s++) {
      const y = s === 0 ? -0.05 : (t.alto * s) / nSeg, q = Math.max(0, y) / t.alto, r = t.r0 + (t.r1 - t.r0) * q, c = cen(y);
      for (let k = 0; k < LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2; put([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], q, 0, q * 0.3); }
    }
    // branches (prisms) – detailed template only
    const puntas: V3[] = [];
    f.ramas.forEach((b, i) => {
      const base = cen(b.y), dir: V3 = [Math.cos(b.az) * Math.cos(b.elev), Math.sin(b.elev), Math.sin(b.az) * Math.cos(b.elev)];
      const tip: V3 = [base[0] + dir[0] * b.largo, base[1] + dir[1] * b.largo, base[2] + dir[2] * b.largo];
      puntas.push(tip);
      if (!detalle) return;
      const ax = norm(sub(tip, base)), tt: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(tt, ax)), w = cross(ax, u);
      for (const [p, r, mo] of [[base, b.r, 0.12], [tip, b.r * 0.4, 0.9]] as [V3, number, number][]) for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i, d: V3 = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)];
        put([p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], mo > 0.5 ? 0.8 : 0.3, 0, mo);
      }
    });
    // clumps: faceted octahedra with a jagged ring, light on top
    f.ramas.slice(0, nRamas).forEach((b, i) => {
      const tip = puntas[i], c: V3 = b.eje ? [cen(b.y)[0], b.y + b.dy, cen(b.y)[2]] : [tip[0], tip[1] + b.dy, tip[2]], [rx, ry, rz] = b.hr, giro = 0.5 + i * 1.3;
      put([c[0] + 0.1 * hv(v, 2), c[1] + ry * b.top * (1 + 0.1 * hv(v, 3)), c[2] + 0.1 * hv(v, 4)], 1, 1, 0.95);
      for (let k = 0; k < 4; k++) { const a = giro + (k / 4) * Math.PI * 2, j = 1 + b.jag * (k % 2 ? -1 : 1) + 0.1 * hv(v, 5); put([c[0] + Math.cos(a) * rx * j, c[1] + ry * (b.ring + 0.12 * hv(v, 6)), c[2] + Math.sin(a) * rz * j], 0.6, 1, 1); }
      put([c[0] + 0.08 * hv(v, 7), c[1] - ry * b.bot, c[2] + 0.08 * hv(v, 8)], 0.28, 1, 0.9);
    });
    // crown: a jittered icosahedron (top, upper ring of 5, lower ring of 5 turned half a step, bottom)
    {
      const o = { ...f.copa, ...(detalle ? {} : f.copaSimple) }, giro = 0.3 + e * 0.9;
      const j = (k: number) => 1 + 0.16 * hv(v, k);
      put([o.cx + 0.12 * o.rx * hv(v, 9), o.cy + o.ry * o.top * j(10), o.cz + 0.12 * o.rz * hv(v, 11)], 1, 1, 0.75);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, q = o.ru * (1 + o.jag * hv(v, 12)); put([o.cx + Math.cos(a) * o.rx * q, o.cy + o.ry * o.yu * (1 + 0.25 * hv(v, 13)), o.cz + Math.sin(a) * o.rz * q], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, q = o.rl * (1 + o.jag * (k % 2 ? 0.8 : -0.8) + 0.08 * hv(v, 14)); put([o.cx + Math.cos(a) * o.rx * q, o.cy + o.ry * o.yl * (1 + 0.25 * hv(v, 15)), o.cz + Math.sin(a) * o.rz * q], 0.45, 1, 0.5); }
      put([o.cx + 0.1 * o.rx * hv(v, 16), o.cy - o.ry * o.bot * j(17), o.cz + 0.1 * o.rz * hv(v, 18)], 0.2, 1, 0.45);
    }
  });
  // indices: winding is decided on species 0 (roble) and shared by all species (every part stays a convex star around its centre)
  const m = new Malla(); m.pos = Array.from(pos[0]); m.idx = idx;
  const P0 = (i: number): V3 => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
  const centro = (ids: number[]): V3 => { const s: V3 = [0, 0, 0]; for (const i of ids) { const p = P0(i); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return [s[0] / ids.length, s[1] / ids.length, s[2] / ids.length]; };
  let o = 0;
  for (let s = 0; s < nSeg; s++) {
    const a = o + s * LADOS_TRONCO, b = a + LADOS_TRONCO, ref = centro([...Array(2 * LADOS_TRONCO).keys()].map((i) => a + i));
    for (let k = 0; k < LADOS_TRONCO; k++) { const k2 = (k + 1) % LADOS_TRONCO; m.tri(a + k, a + k2, b + k, ref); m.tri(a + k2, b + k2, b + k, ref); }
  }
  o += LADOS_TRONCO * (nSeg + 1);
  if (detalle) for (let i = 0; i < 3; i++) {
    const a = o + i * 6, ref = centro([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
    for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; m.tri(a + k, a + k2, a + 3 + k, ref); m.tri(a + k2, a + 3 + k2, a + 3 + k, ref); }
    if (i === 2) o += 18;
  }
  for (let i = 0; i < nRamas; i++) {
    const a = o + i * 6, ref = centro([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.tri(a, a + 1 + k, a + 1 + k2, ref); m.tri(a + 5, a + 1 + k, a + 1 + k2, ref); }
  }
  o += nRamas * 6;
  {
    const ref = centro([...Array(12).keys()].map((i) => o + i)), top = o, u = (k: number) => o + 1 + (k % 5), l = (k: number) => o + 6 + (k % 5), bot = o + 11;
    for (let k = 0; k < 5; k++) { m.tri(top, u(k), u(k + 1), ref); m.tri(u(k), l(k), u(k + 1), ref); m.tri(l(k), l(k + 1), u(k + 1), ref); m.tri(bot, l(k), l(k + 1), ref); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos[0], 3));
  for (let e = 1; e < 4; e++) g.setAttribute(`pos${e}`, new THREE.BufferAttribute(pos[e], 3));
  g.setAttribute("tono", new THREE.BufferAttribute(tono, 1));
  g.setAttribute("parte", new THREE.BufferAttribute(parte, 1));
  g.setAttribute("mov", new THREE.BufferAttribute(mov, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, 0), 8);
  return (cacheArbol[clave] = { geometria: g, triangulos: idx.length / 3, bytes: bytesDe(g) });
}
/** The near template (every species draws the same one). Kept as a function for the old per-species callers. */
export const geometriaCerca = (_esp: Especie, detalle = true): GeometriaArbol => geometriaArbol(detalle);

const bytesDe = (g: THREE.BufferGeometry) => Object.values(g.attributes).reduce((s, at) => s + at.array.byteLength, 0) + (g.index ? g.index.array.byteLength : 0);

// ---------------------------------------------------------------------------------------------------------------------
// far LOD: ONE parametric silhouette for every species (N7: trunk + two jittered OCTAHEDRA instead of two pentagonal bipyramids, 22 triangles)
// ---------------------------------------------------------------------------------------------------------------------
/** Per species and variant: [trunkH, trunkR, blob1 centre y, blob1 radius xz, blob1 radius y, blob2 centre y, blob2 radius xz, blob2 radius y]. */
const LEJOS: Record<Especie, [number[], number[]]> = {
  roble: [[2.5, 0.25, 3.3, 1.55, 1.3, 2.7, 1.25, 1.0], [2.5, 0.25, 3.3, 1.6, 1.25, 2.7, 1.3, 1.0]],
  pino: [[1.6, 0.16, 3.0, 1.45, 2.2, 5.4, 0.8, 1.9], [1.6, 0.16, 3.1, 1.4, 2.3, 5.5, 0.75, 1.8]],
  abedul: [[3.5, 0.1, 4.2, 1.1, 1.4, 3.1, 0.95, 1.0], [3.5, 0.1, 4.2, 1.15, 1.4, 3.1, 0.95, 1.0]],
  arbusto: [[0.12, 0.06, 0.6, 1.0, 0.7, 0.5, 0.8, 0.55], [0.12, 0.06, 0.6, 1.05, 0.7, 0.5, 0.8, 0.55]],
};
const LADOS_LEJOS = 4, LADOS_TRONCO_LEJOS = 3;
export type GeometriaEspecie = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };

let geoLejos: GeometriaEspecie | null = null;
/** The shared far geometry: part 0 trunk (3-sided frustum), parts 1 and 2 octahedra with an uneven ring (no two far trees read as the same diamond), unit size. */
export function geometriaLejos(): GeometriaEspecie {
  if (geoLejos) return geoLejos;
  const pos: number[] = [], col: number[] = [], parte: number[] = [], idx: number[] = [];
  const vert = (p: V3, c: V3, k: number) => { pos.push(...p); col.push(c[0], c[1], c[2]); parte.push(k); return pos.length / 3 - 1; };
  const tr = [TRONCO_OSC.r, TRONCO_OSC.g, TRONCO_OSC.b] as V3, tc = [TRONCO.r, TRONCO.g, TRONCO.b] as V3;
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const an = (k / LADOS_TRONCO_LEJOS) * Math.PI * 2; a.push(vert([Math.cos(an), 0, Math.sin(an)], tr, 0)); b.push(vert([Math.cos(an) * 0.5, 1, Math.sin(an) * 0.5], tc, 0)); }
  const m = new Malla(); // only for its `tri` winding helper
  m.pos = pos; m.idx = idx;
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const k2 = (k + 1) % LADOS_TRONCO_LEJOS, ref: V3 = [0, 0.5, 0]; m.tri(a[k], a[k2], b[k], ref); m.tri(a[k2], b[k2], b[k], ref); }
  const RADIOS = [[1.0, 0.78, 1.12, 0.86], [0.84, 1.1, 0.8, 1.06]];
  for (const p of [1, 2]) {
    const ring: number[] = [], top = vert([0.12 * (p === 1 ? 1 : -1), 1.05, 0.06], [1.15, 1.15, 1.15], p), bot = vert([0, -0.9, 0], [0.5, 0.5, 0.5], p);
    for (let k = 0; k < LADOS_LEJOS; k++) { const an = ((k + 0.35 * p) / LADOS_LEJOS) * Math.PI * 2; ring.push(vert([Math.cos(an) * RADIOS[p - 1][k], 0.08 * (k % 2 ? 1 : -1), Math.sin(an) * RADIOS[p - 1][k]], [0.85, 0.85, 0.85], p)); }
    for (let k = 0; k < LADOS_LEJOS; k++) { const k2 = (k + 1) % LADOS_LEJOS; m.tri(ring[k], ring[k2], top, [0, 0, 0]); m.tri(ring[k], ring[k2], bot, [0, 0, 0]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("parte", new THREE.Float32BufferAttribute(parte, 1));
  g.setIndex(idx);
  return (geoLejos = { geometria: g, triangulos: idx.length / 3, bytes: bytesDe(g) });
}


// ---------------------------------------------------------------------------------------------------------------------
// materials: TSL vertex displacement (instance placement + wind in one positionNode, no instanceMatrix)
// ---------------------------------------------------------------------------------------------------------------------
type N = ReturnType<typeof float>;
type V3N = ReturnType<typeof vec3>;
type Viento = { value: THREE.Vector3 };
type Comunes = { tiempo: { value: number }; vientoU: Viento };
// the gentle breeze that always blows (m/s): with the wind at 0 the canopy still breathes a little
const BRISA = vec2(0.35, 0.2);

/** The wind's push on a vertex at `hAlto` (0…1 of the tree's height): a world-space offset in metres. Canopy most, trunk barely. */
function empuje(c: Comunes, hAlto: N, alturaM: N, rama: N, fase: N): V3N {
  const vel = (c.vientoU as unknown as V3N).xz.add(BRISA) as unknown as ReturnType<typeof vec2>;
  const fuerza = length(vel) as N;
  const dir = vel.div(fuerza) as unknown as ReturnType<typeof vec2>;
  const lado = vec2(dir.y.negate(), dir.x);
  const t = c.tiempo as unknown as N;
  const peso = pow(clamp(hAlto, 0, 1), 2).mul(rama.mul(0.5).add(1)) as N;                         // quadratic in height, branches a bit more
  const rafaga = sin(t.mul(0.8).add(fase)).mul(0.6).add(sin(t.mul(1.9).add(fase.mul(1.7))).mul(0.4)) as N; // −1…1, slow gusts
  const amp = fuerza.mul(0.012).add(0.004).mul(alturaM).mul(peso) as N;                           // metres at this vertex
  const xz = dir.mul(amp.mul(rafaga.mul(0.4).add(0.6))).add(lado.mul(sin(t.mul(1.3).add(fase.mul(2.3))).mul(amp).mul(0.25)));
  return vec3(xz.x, amp.mul(amp).mul(-0.3), xz.y) as unknown as V3N; // the sag keeps a bough's length roughly
}

const girar = (p: V3N, giro: N): V3N => {
  const c = cos(giro), s = sin(giro);
  return vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s))) as unknown as V3N;
};

type Inst = { a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute };
const instAttr = (n: number, k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };

/** Near LOD, all species: a = (x, y, z, escala) · b = (giro, fase, especie 0…3, tinte) · c = (dark leaf rgb, height m) · d = (light leaf rgb, 0). */
type InstCerca = Inst & { c: THREE.InstancedBufferAttribute; d: THREE.InstancedBufferAttribute };
const TRONCO_N = [TRONCO_OSC, TRONCO], ABEDUL_N = [ABEDUL_OSC, ABEDUL];
function materialCerca(c: Comunes, aletea: boolean, inst: InstCerca): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = "arbol-cerca";
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N; w: N };
  const ic = instancedBufferAttribute(inst.c) as unknown as { xyz: V3N; w: N }, id = instancedBufferAttribute(inst.d) as unknown as { xyz: V3N };
  const giro = ib.x, fase = ib.y, sp = ib.z, tinte = ib.w, esc = ia.w, H = ic.w;
  const parte = attribute("parte", "float") as unknown as N, tono = attribute("tono", "float") as unknown as N;
  const mov = attribute("mov", "float") as unknown as N, q = (k: string) => attribute(k, "vec3") as unknown as V3N;
  const e01 = mix(positionGeometry as unknown as V3N, q("pos1"), step(0.5, sp)), e23 = mix(q("pos2"), q("pos3"), step(2.5, sp));
  const p0 = mix(e01, e23, step(1.5, sp)) as unknown as V3N;
  let local = p0;
  if (aletea) { // leaves flutter: a small, fast wobble, phased per vertex, on leaf vertices only
    const t = c.tiempo as unknown as N, fuerza = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N;
    const f1 = sin(t.mul(6.5).add(p0.x.mul(9)).add(p0.z.mul(7)).add(fase)) as N;
    const a = fuerza.mul(0.008).add(0.008).mul(parte) as N;
    local = p0.add(vec3(f1, sin(t.mul(9.7).add(p0.y.mul(11)).add(p0.x.mul(5))), cos(t.mul(8.3).add(p0.x.mul(11)).add(p0.z.mul(3)))).mul(a)) as unknown as V3N;
  }
  // N7: branches and leaf clumps sway on their own, more at the tips (`mov` 0 at a branch root … 1 at its tip), on top of the whole-tree lean
  const tt = c.tiempo as unknown as N, vel = (c.vientoU as unknown as V3N).xz.add(BRISA) as unknown as ReturnType<typeof vec2>, fz = length(vel) as N, dr = vel.div(fz) as unknown as ReturnType<typeof vec2>;
  const punta = mov.mul(mov).mul(fz.mul(0.05).add(0.09)).mul(esc) as N;
  const ph = tt.mul(1.9).add(fase).add(p0.x.mul(2.3)).add(p0.z.mul(1.7)) as N;
  const bal = vec3(dr.x.mul(sin(ph)).sub(dr.y.mul(cos(ph.mul(0.7))).mul(0.4)), sin(ph.mul(1.3)).mul(0.25), dr.y.mul(sin(ph)).add(dr.x.mul(cos(ph.mul(0.7))).mul(0.4))).mul(punta) as unknown as V3N;
  mat.positionNode = girar(local, giro).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), mov.mul(0.7), fase)).add(bal);
  const col3 = (k: THREE.Color) => vec3(k.r, k.g, k.b) as unknown as V3N;
  const birch = step(1.5, sp).mul(oneMinus(step(2.5, sp))) as N;
  const tronco = mix(mix(col3(TRONCO_N[0]), col3(TRONCO_N[1]), tono), mix(col3(ABEDUL_N[0]), col3(ABEDUL_N[1]), tono), birch) as unknown as V3N;
  const hoja = mix(ic.xyz, id.xyz, tono.mul(0.7).add(0.3)) as unknown as V3N;
  const ao = clamp(p0.y.div(H), 0, 1).mul(0.1).add(0.9) as N; // fake ambient occlusion: a little darker toward the ground
  mat.colorNode = mix(tronco, hoja, parte).mul(ao).mul(tinte.mul(0.24).add(0.88)).mul(1.25); // N7: ×1.25, the sunless side of a crown read black
  // N7: faces still read flat, but a leaf's normal leans toward the sky (the sunless side of a crown no longer goes black): flat + up × (0.15 bark … 0.65 leaf)
  mat.normalNode = normalize((normalFlat as unknown as V3N).add((transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(parte.mul(0.5).add(0.15))));
  return mat;
}


/** Far LOD: a = (x, y, z, escala) · b = (giro, fase, tinte, 0) · c = (trunkH, trunkR, c1y, r1xz) · d = (r1y, c2y, r2xz, r2y) · e = leaf colour (r, g, b, 0). */
type InstLejos = Inst & { c: THREE.InstancedBufferAttribute; d: THREE.InstancedBufferAttribute; e: THREE.InstancedBufferAttribute };
function materialLejos(c: Comunes, inst: InstLejos): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = "arbol-lejos";
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N };
  const ic = instancedBufferAttribute(inst.c) as unknown as { x: N; y: N; z: N; w: N }, id = instancedBufferAttribute(inst.d) as unknown as { x: N; y: N; z: N; w: N };
  const ie = instancedBufferAttribute(inst.e) as unknown as V3N;
  const q = positionGeometry as unknown as V3N, parte = attribute("parte", "float") as unknown as N;
  const tronco = vec3(q.x.mul(ic.y), q.y.mul(ic.x), q.z.mul(ic.y)), b1 = vec3(q.x.mul(ic.w), ic.z.add(q.y.mul(id.x)), q.z.mul(ic.w)), b2 = vec3(q.x.mul(id.z), id.y.add(q.y.mul(id.w)), q.z.mul(id.z));
  const s1 = step(0.5, parte) as N, s2 = step(1.5, parte) as N;
  const p0 = mix(mix(tronco, b1, s1), b2, s2) as unknown as V3N;
  const H = max(ic.z.add(id.x), id.y.add(id.w)) as N, esc = ia.w;
  mat.positionNode = girar(p0, ib.x).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), float(0), ib.y));
  const vc = attribute("color", "vec3") as unknown as V3N;
  mat.colorNode = mix(vc, vc.mul(ie), s1).mul(ib.z.mul(0.24).add(0.88)).mul(1.25);
  mat.normalNode = normalize((normalFlat as unknown as V3N).add((transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(s1.mul(0.5).add(0.15)))); // N7: as the near trees, the sunless side leans toward the sky
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------------
// the grove
// -------------------------------------------------------------------------------------------------
export type HArboles = {
  /** The engine's wind (entorno.ts `vientoU`): m/s on the ground plane. */
  vientoU: Viento;
  nivel: Nivel;
  /** The camera the near/far split is measured from (else pass a position to `actualizar`). */
  camara?: THREE.Object3D;
};
export type EstadisticasArboles = { cerca: number[]; lejos: number; arboles: number; triangulos: number; llamadas: number; bytesGeometria: number; bytesInstancias: number };

const REPARTO_S = 0.25;      // the near/far split runs at most this often (s) …
const REPARTO_M = 1.5;       // … and only if the camera moved this far (m) since the last one
const CAJAS = 64;
const LEJOS_PARAM = (e: number, v: number) => LEJOS[ESPECIES[e]][v];
const COLOR_LEJOS = ESPECIES.map((e) => [0, 1].map((v) => { const c = new THREE.Color(HOJAS[e][v].medio); return [c.r, c.g, c.b]; }));
const FLOATS = 9; // per tree: x, y, z, scale, yaw, phase, variant, tint, species

export function crearArboles(h: HArboles, puntos: readonly PuntoArbol[]) {
  const cfg = NATURALEZA_POR_NIVEL[h.nivel];
  const tiempo = uniform(0), comunes: Comunes = { tiempo: tiempo as unknown as { value: number }, vientoU: h.vientoU };
  // ---- the trees as one typed array, with a per-tree phase, variant and tint that depend only on the position ----
  const total = puntos.length, datos = new Float32Array(total * FLOATS), cuentaEsp = [0, 0, 0, 0];
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  puntos.forEach((p, i) => {
    const e0 = ESPECIES.indexOf(p.especie as Especie), e = e0 < 0 ? 0 : e0;
    const ix = Math.round(p.x * 16), iz = Math.round(p.z * 16), v = p.variante ?? (hash2(0x61, ix, iz) < 0.8 ? 0 : 1), o = i * FLOATS;
    datos.set([p.x, p.y, p.z, p.escala, p.giro, hash2(0x62, ix, iz) * 6.2832, v, hash2(0x63, ix, iz), e], o); cuentaEsp[e]++;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  });
  const capCerca = Math.min(cfg.arbolesCerca, total), capLejos = Math.min(Math.max(0, cfg.arbolesVisibles - cfg.arbolesCerca), total);
  const conLejos = capLejos > 0;   // tiers A/B draw a second, cheap silhouette mesh; C/D draw only the near template (one call)
  const esfera = total ? new THREE.Sphere(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2 + 3, (minZ + maxZ) / 2), Math.hypot(maxX - minX, maxY - minY + 8, maxZ - minZ) / 2 + 4) : new THREE.Sphere();

  const grupo = new THREE.Group(); grupo.name = "arboles"; grupo.userData.sinSombra = true;
  const mallas: THREE.Mesh[] = [], geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const cerca = (() => {
    const inst: InstCerca = { a: instAttr(capCerca, 4), b: instAttr(capCerca, 4), c: instAttr(capCerca, 4), d: instAttr(capCerca, 4) };
    const base = geometriaArbol(cfg.arbolesDetalle).geometria, g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index); g.instanceCount = 0; g.boundingSphere = esfera.clone();
    const mat = materialCerca(comunes, cfg.arbolesAletean, inst), mesh = new THREE.Mesh(g, mat);
    mesh.name = "arboles-cerca"; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.sinSombra = true;
    grupo.add(mesh); mallas.push(mesh); geos.push(g); mats.push(mat);
    return { inst, g, mesh, cuenta: 0, cap: capCerca, porEspecie: [0, 0, 0, 0] };
  })();
  const lejos = (() => {
    if (!conLejos) return null;
    const base = geometriaLejos().geometria, g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index); g.instanceCount = 0; g.boundingSphere = esfera.clone();
    const inst: InstLejos = { a: instAttr(capLejos, 4), b: instAttr(capLejos, 4), c: instAttr(capLejos, 4), d: instAttr(capLejos, 4), e: instAttr(capLejos, 3) };
    const mat = materialLejos(comunes, inst), mesh = new THREE.Mesh(g, mat);
    mesh.name = "arboles-lejos"; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.sinSombra = true;
    grupo.add(mesh); mallas.push(mesh); geos.push(g); mats.push(mat);
    return { inst, g, mesh, cuenta: 0 };
  })();

  // ---- the near/far split: O(n) over typed arrays, two histograms to honour the tier's caps, no sort, no allocation ----
  const dist = new Float32Array(total), histCerca = new Int32Array(CAJAS), histTodo = new Int32Array(CAJAS);
  const corte = (hist: Int32Array, tope: number, radio: number) => { // largest radius (≤ `radio`) with at most `tope` trees inside
    let acum = 0; for (let k = 0; k < CAJAS; k++) { if (acum + hist[k] > tope) return (k / CAJAS) * radio; acum += hist[k]; }
    return radio;
  };
  let cercaUltimo = 0, lejosUltimo = 0;
  const rl0 = conLejos ? cfg.arbolesLejosM : cfg.arbolesCercaM;
  function repartir(cx: number, cy: number, cz: number) {
    const rc = cfg.arbolesCercaM, rl = rl0;
    histCerca.fill(0); histTodo.fill(0);
    for (let o = 0, i = 0; o < total; o++, i += FLOATS) {
      const dx = datos[i] - cx, dy = datos[i + 1] - cy, dz = datos[i + 2] - cz, r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dist[o] = r;
      if (r < rl) { histTodo[(r / rl * CAJAS) | 0]++; if (r < rc) histCerca[(r / rc * CAJAS) | 0]++; }
    }
    const rN = corte(histCerca, capCerca, rc), rV = conLejos ? corte(histTodo, capCerca + capLejos, rl) : rN;
    cerca.cuenta = 0; cerca.porEspecie.fill(0);
    if (lejos) lejos.cuenta = 0;
    const A = cerca.inst.a.array as Float32Array, B = cerca.inst.b.array as Float32Array, Cc = cerca.inst.c.array as Float32Array, D = cerca.inst.d.array as Float32Array;
    for (let o = 0, i = 0; o < total; o++, i += FLOATS) {
      const r = dist[o], e = datos[i + 8], v = datos[i + 6];
      if (r < rN && cerca.cuenta < cerca.cap) {
        const k = cerca.cuenta++, hj = HOJAS[ESPECIES[e]][v];
        cerca.porEspecie[e]++;
        A[k * 4] = datos[i]; A[k * 4 + 1] = datos[i + 1]; A[k * 4 + 2] = datos[i + 2]; A[k * 4 + 3] = datos[i + 3];
        B[k * 4] = datos[i + 4]; B[k * 4 + 1] = datos[i + 5]; B[k * 4 + 2] = e; B[k * 4 + 3] = datos[i + 7];
        Cc[k * 4] = hj.oscuro.r; Cc[k * 4 + 1] = hj.oscuro.g; Cc[k * 4 + 2] = hj.oscuro.b; Cc[k * 4 + 3] = ALTURA[ESPECIES[e]];
        D[k * 4] = hj.claro.r; D[k * 4 + 1] = hj.claro.g; D[k * 4 + 2] = hj.claro.b;
      } else if (lejos && r < rV && lejos.cuenta < capLejos) {
        const k = lejos.cuenta++, p = LEJOS_PARAM(e, v), col = COLOR_LEJOS[e][v];
        const ia = lejos.inst.a.array as Float32Array, ib = lejos.inst.b.array as Float32Array, ic = lejos.inst.c.array as Float32Array, id = lejos.inst.d.array as Float32Array, ie = lejos.inst.e.array as Float32Array;
        ia[k * 4] = datos[i]; ia[k * 4 + 1] = datos[i + 1]; ia[k * 4 + 2] = datos[i + 2]; ia[k * 4 + 3] = datos[i + 3];
        ib[k * 4] = datos[i + 4]; ib[k * 4 + 1] = datos[i + 5]; ib[k * 4 + 2] = datos[i + 7];
        ic[k * 4] = p[0]; ic[k * 4 + 1] = p[1]; ic[k * 4 + 2] = p[2]; ic[k * 4 + 3] = p[3];
        id[k * 4] = p[4]; id[k * 4 + 1] = p[5]; id[k * 4 + 2] = p[6]; id[k * 4 + 3] = p[7];
        ie[k * 3] = col[0]; ie[k * 3 + 1] = col[1]; ie[k * 3 + 2] = col[2];
      }
    }
    cerca.g.instanceCount = cerca.cuenta; cerca.mesh.visible = cerca.cuenta > 0;
    for (const a of Object.values(cerca.inst)) a.needsUpdate = true;
    if (lejos) { lejos.g.instanceCount = lejos.cuenta; lejos.mesh.visible = lejos.cuenta > 0; for (const a of Object.values(lejos.inst)) a.needsUpdate = true; }
    cercaUltimo = cerca.cuenta; lejosUltimo = lejos?.cuenta ?? 0;
  }

  let ultimoT = -Infinity; const ultimaPos = new THREE.Vector3(Infinity, 0, 0), tmp = new THREE.Vector3();
  /** Advance the shader clock (one uniform) and, at most every 250 ms and if the camera moved, redo the near/far split. */
  function actualizar(t: number, desde?: THREE.Vector3) {
    tiempo.value = t;
    const pos = desde ?? (h.camara ? h.camara.getWorldPosition(tmp) : null);
    if (!pos || !total) return;
    if (t - ultimoT < REPARTO_S && ultimoT !== -Infinity) return;
    if (pos.distanceToSquared(ultimaPos) < REPARTO_M * REPARTO_M) return;
    ultimoT = t; ultimaPos.copy(pos); repartir(pos.x, pos.y, pos.z);
  }

  const bytesGeometria = geometriaArbol(cfg.arbolesDetalle).bytes + (conLejos ? geometriaLejos().bytes : 0);
  function estadisticas(): EstadisticasArboles {
    const tris = cerca.cuenta * geometriaArbol(cfg.arbolesDetalle).triangulos + (lejos?.cuenta ?? 0) * geometriaLejos().triangulos;
    const bi = Object.values(cerca.inst).reduce((s, a) => s + a.array.byteLength, 0) + (lejos ? Object.values(lejos.inst).reduce((s, a) => s + a.array.byteLength, 0) : 0);
    return { cerca: cerca.porEspecie.slice(), lejos: lejos?.cuenta ?? 0, arboles: cercaUltimo + lejosUltimo, triangulos: tris, llamadas: mallas.filter((m) => m.visible).length, bytesGeometria, bytesInstancias: bi };
  }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); grupo.removeFromParent(); }

  return { grupo, mallas, actualizar, repartir, estadisticas, dispose, tiempo: comunes.tiempo };
}
export type Arboles = ReturnType<typeof crearArboles>;
