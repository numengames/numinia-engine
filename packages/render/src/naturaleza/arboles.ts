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
import { uniform, float, vec2, vec3, attribute, instancedBufferAttribute, positionGeometry, sin, cos, pow, clamp, mix, length, max, step } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import { crearAzar, hash2 } from "./semilla.ts";
import { NATURALEZA_POR_NIVEL } from "./niveles.ts";

export type Especie = "roble" | "pino" | "abedul" | "arbusto";
export const ESPECIES: readonly Especie[] = ["roble", "pino", "abedul", "arbusto"];
/** One tree to plant: where (m), size factor, yaw (rad) and species. `variante` (0 | 1) is optional: from the position otherwise. */
export type PuntoArbol = { x: number; y: number; z: number; escala: number; giro: number; especie: Especie | string; variante?: 0 | 1 };
export type Lod = "cerca" | "lejos";

/** Triangle budgets of the brief. */
export const TRIS_MAX_CERCA = 220;
export const TRIS_MAX_LEJOS = 60;

// ---------------------------------------------------------------------------------------------------------------------
// palette (the brief's ~12 colours: trunk brown, leaf greens + autumn orange + pink blossom, birch white)
// ---------------------------------------------------------------------------------------------------------------------
const C = (hex: number) => new THREE.Color(hex);
const TRONCO = C(0x6b4a32), TRONCO_OSC = C(0x3f2b1e);
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

const T = (1 + Math.sqrt(5)) / 2;
const ICO: V3[] = ([[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]] as V3[]).map(norm);
const ICO_CARAS = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
const OCTA: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCTA_CARAS = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5];

/** A leaf blob: jittered icosahedron (20 faces) or octahedron (8), dark at its bottom, light on top, `leaf` flag for flutter. */
function mancha(m: Malla, c: V3, r: V3, jit: number, R: () => number, tipo: "ico" | "octa", h: Hojas, rama: number) {
  const verts = tipo === "ico" ? ICO : OCTA, caras = tipo === "ico" ? ICO_CARAS : OCTA_CARAS;
  const ids = verts.map((d) => {
    const j = 1 + jit * (R() * 2 - 1), b = 0.94 + 0.12 * R();
    const t = suave(0.1, 0.9, d[1] * 0.5 + 0.5);
    const col = h.oscuro.clone().lerp(h.claro, t);
    return m.vert([c[0] + d[0] * r[0] * j, c[1] + d[1] * r[1] * j, c[2] + d[2] * r[2] * j], col, rama, 1, b);
  });
  for (let i = 0; i < caras.length; i += 3) m.tri(ids[caras[i]], ids[caras[i + 1]], ids[caras[i + 2]], c);
}

/** A cone (pine tier): `n` sides plus a flat dark underside. */
function cono(m: Malla, base: V3, alto: number, radio: number, n: number, R: () => number, h: Hojas, lean: V3) {
  const ring: number[] = [], apex = m.vert([base[0] + lean[0], base[1] + alto, base[2] + lean[2]], h.claro, 0, 1);
  const centro = m.vert(base, h.oscuro, 0, 1), cap: number[] = [];
  const rot = R() * Math.PI;
  for (let k = 0; k < n; k++) {
    const an = rot + (k / n) * Math.PI * 2, rr = radio * (0.9 + 0.2 * R());
    const p: V3 = [base[0] + Math.cos(an) * rr, base[1] - 0.05 * R(), base[2] + Math.sin(an) * rr];
    ring.push(m.vert(p, h.oscuro.clone().lerp(h.claro, 0.18), 0, 1));
    cap.push(m.vert(p, h.oscuro, 0, 1, 0.8));
  }
  const mid: V3 = [base[0], base[1] + alto * 0.35, base[2]];
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    m.tri(ring[k], ring[k2], apex, mid);
    m.tri(cap[k], cap[k2], centro, [base[0], base[1] + alto, base[2]]);
  }
}

const rango = (R: () => number) => (a: number, b: number) => a + (b - a) * R();
const dirEl = (az: number, el: number): V3 => [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
const mas = (a: V3, d: V3, l: number): V3 => [a[0] + d[0] * l, a[1] + d[1] * l, a[2] + d[2] * l];

/** The metres of height each species is drawn to (the wind's weight is height / this). */
export const ALTURA: Record<Especie, number> = { roble: 4.7, pino: 6.8, abedul: 5.4, arbusto: 1.5 };

/** One species, one variant. The same code path draws the same NUMBER of random values and primitives for both variants. */
function construir(esp: Especie, v: 0 | 1): Malla {
  const m = new Malla(), R = crearAzar(0x6e61 + ESPECIES.indexOf(esp) * 131 + v * 17), rr = rango(R), h = HOJAS[esp][v];
  if (esp === "roble") {
    const lx = rr(-0.12, 0.12), lz = rr(-0.12, 0.12), tope: V3 = [lx, 2.5, lz];
    prisma(m, [0, -0.05, 0], tope, rr(0.27, 0.33), 0.12, 6, TRONCO_OSC, TRONCO, 0, R());
    for (let i = 0; i < 4; i++) {
      const az = (i / 4) * Math.PI * 2 + rr(-0.45, 0.45), s = lerp3([0, 0, 0], tope, rr(0.5, 0.78)), d = dirEl(az, rr(0.6, 0.95)), e = mas(s, d, rr(0.9, 1.35));
      prisma(m, s, e, 0.075, 0.03, 4, TRONCO, TRONCO, 0.5);
      const rb = rr(0.52, 0.68); mancha(m, [e[0], e[1] + 0.12, e[2]], [rb, rb * 0.85, rb], 0.14, R, "octa", h, 0.5);
    }
    const rc = rr(1.4, 1.65); mancha(m, [lx, rr(3.2, 3.5), lz], [rc, rc * 0.85, rc], 0.12, R, "ico", h, 0.2);
    const a0 = R() * 6.28;
    for (let i = 0; i < 2; i++) { const az = a0 + i * Math.PI * rr(0.8, 1.2), rs = rr(1.05, 1.25); mancha(m, [Math.cos(az) * 1.1, rr(2.6, 2.9), Math.sin(az) * 1.1], [rs, rs * 0.85, rs], 0.14, R, "ico", h, 0.2); }
  } else if (esp === "pino") {
    const lx = rr(-0.08, 0.08), lz = rr(-0.08, 0.08);
    prisma(m, [0, -0.05, 0], [lx, 6.6, lz], rr(0.17, 0.22), 0.04, 6, TRONCO_OSC, TRONCO, 0);
    for (let i = 0; i < 3; i++) {
      const az = (i / 3) * Math.PI * 2 + rr(-0.5, 0.5), s: V3 = [lx * 0.1, rr(0.55, 1.15), lz * 0.1], e = mas(s, dirEl(az, rr(0.25, 0.5)), rr(0.5, 0.7));
      prisma(m, s, e, 0.05, 0.022, 4, TRONCO, TRONCO, 0.5);
      const rb = rr(0.2, 0.26); mancha(m, [e[0], e[1] + 0.03, e[2]], [rb, rb * 0.5, rb], 0.1, R, "octa", h, 0.5);
    }
    const bases = [1.35, 2.3, 3.3, 4.3, 5.2], altos = [1.9, 1.8, 1.6, 1.5, 1.55], radios = [1.55, 1.3, 1.05, 0.8, 0.55];
    for (let i = 0; i < 5; i++) cono(m, [lx * (bases[i] / 6.6), bases[i], lz * (bases[i] / 6.6)], altos[i] * rr(0.92, 1.08), radios[i] * rr(0.92, 1.08), 7, R, h, [rr(-0.08, 0.08), 0, rr(-0.08, 0.08)]);
  } else if (esp === "abedul") {
    const pts: V3[] = [[0, -0.05, 0]];
    for (let i = 1; i <= 3; i++) pts.push([rr(-0.14, 0.14) * i * 0.5, (i / 3) * 3.7, rr(-0.14, 0.14) * i * 0.5]);
    for (let i = 0; i < 3; i++) prisma(m, pts[i], pts[i + 1], 0.12 - i * 0.025, 0.1 - i * 0.025, 5, ABEDUL_OSC, ABEDUL, 0, i);
    for (let i = 0; i < 5; i++) {
      const az = (i / 5) * Math.PI * 2 + rr(-0.4, 0.4), s = lerp3(pts[1], pts[3], rr(0.2, 0.95)), e = mas(s, dirEl(az, rr(0.8, 1.15)), rr(0.65, 1.0));
      prisma(m, s, e, 0.05, 0.02, 4, ABEDUL, TRONCO, 0.5);
      mancha(m, [e[0], e[1] + 0.2, e[2]], [rr(0.38, 0.48), rr(0.6, 0.75), rr(0.38, 0.48)], 0.12, R, "octa", h, 0.5);
    }
    mancha(m, [pts[3][0], rr(4.0, 4.3), pts[3][2]], [rr(1.05, 1.2), rr(1.3, 1.5), rr(1.05, 1.2)], 0.12, R, "ico", h, 0.2);
    const az = R() * 6.28; mancha(m, [pts[3][0] + Math.cos(az) * 0.5, 3.1, pts[3][2] + Math.sin(az) * 0.5], [0.9, 1.0, 0.9], 0.12, R, "ico", h, 0.2);
  } else {
    for (let i = 0; i < 4; i++) {
      const az = (i / 4) * Math.PI * 2 + rr(-0.4, 0.4), s: V3 = [0, 0.05, 0], e = mas(s, dirEl(az, rr(0.45, 0.8)), rr(0.5, 0.75));
      prisma(m, s, e, 0.04, 0.02, 4, TRONCO_OSC, TRONCO, 0.5);
      const rb = rr(0.55, 0.7); mancha(m, [e[0], e[1] + 0.05, e[2]], [rb, rb * 0.8, rb], 0.14, R, "ico", h, 0.5);
    }
    const rb = rr(0.75, 0.85); mancha(m, [0, 0.6, 0], [rb, rb * 0.85, rb], 0.12, R, "ico", h, 0.3);
  }
  // fake ambient occlusion on the whole tree: a little darker toward the ground
  const H = ALTURA[esp];
  for (let i = 0; i < m.pos.length / 3; i++) {
    const k = 0.8 + 0.2 * Math.min(1, Math.max(0, m.pos[i * 3 + 1] / H));
    m.col[i * 3] *= k; m.col[i * 3 + 1] *= k; m.col[i * 3 + 2] *= k;
  }
  return m;
}

export type GeometriaEspecie = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };
const cacheGeo = new Map<string, GeometriaEspecie>();

/** The merged near-LOD geometry of a species: both variants (position/colour sets A and B), indexed, with motion weights. */
export function geometriaCerca(esp: Especie): GeometriaEspecie {
  const hit = cacheGeo.get(esp); if (hit) return hit;
  const a = construir(esp, 0), b = construir(esp, 1);
  if (a.pos.length !== b.pos.length || a.idx.length !== b.idx.length) throw new Error(`arboles: the two variants of ${esp} must share one topology`);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute("posB", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(a.col, 3));
  g.setAttribute("colB", new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute("mov", new THREE.Float32BufferAttribute(a.mov, 2));
  g.setIndex(a.idx);
  const rad = Math.max(2, ...Array.from({ length: a.pos.length / 3 }, (_, i) => Math.hypot(a.pos[i * 3], a.pos[i * 3 + 1], a.pos[i * 3 + 2])));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, ALTURA[esp] / 2, 0), rad);
  const out = { geometria: g, triangulos: a.idx.length / 3, bytes: bytesDe(g) };
  cacheGeo.set(esp, out); return out;
}

const bytesDe = (g: THREE.BufferGeometry) => Object.values(g.attributes).reduce((s, at) => s + at.array.byteLength, 0) + (g.index ? g.index.array.byteLength : 0);

// ---------------------------------------------------------------------------------------------------------------------
// far LOD: ONE parametric silhouette for every species
// ---------------------------------------------------------------------------------------------------------------------
/** Per species and variant: [trunkH, trunkR, blob1 centre y, blob1 radius xz, blob1 radius y, blob2 centre y, blob2 radius xz, blob2 radius y]. */
const LEJOS: Record<Especie, [number[], number[]]> = {
  roble: [[2.5, 0.25, 3.3, 1.55, 1.3, 2.7, 1.25, 1.0], [2.5, 0.25, 3.3, 1.6, 1.25, 2.7, 1.3, 1.0]],
  pino: [[1.6, 0.16, 3.0, 1.45, 2.2, 5.4, 0.8, 1.9], [1.6, 0.16, 3.1, 1.4, 2.3, 5.5, 0.75, 1.8]],
  abedul: [[3.5, 0.1, 4.2, 1.1, 1.4, 3.1, 0.95, 1.0], [3.5, 0.1, 4.2, 1.15, 1.4, 3.1, 0.95, 1.0]],
  arbusto: [[0.12, 0.06, 0.6, 1.0, 0.7, 0.5, 0.8, 0.55], [0.12, 0.06, 0.6, 1.05, 0.7, 0.5, 0.8, 0.55]],
};
const LADOS_LEJOS = 8;

let geoLejos: GeometriaEspecie | null = null;
/** The shared far geometry: part 0 trunk (5-sided cone frustum), parts 1 and 2 bipyramids, all in unit size. */
export function geometriaLejos(): GeometriaEspecie {
  if (geoLejos) return geoLejos;
  const pos: number[] = [], col: number[] = [], parte: number[] = [], idx: number[] = [];
  const vert = (p: V3, c: V3, k: number) => { pos.push(...p); col.push(c[0], c[1], c[2]); parte.push(k); return pos.length / 3 - 1; };
  const tr = [TRONCO_OSC.r, TRONCO_OSC.g, TRONCO_OSC.b] as V3, tc = [TRONCO.r, TRONCO.g, TRONCO.b] as V3;
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < 5; k++) { const an = (k / 5) * Math.PI * 2; a.push(vert([Math.cos(an), 0, Math.sin(an)], tr, 0)); b.push(vert([Math.cos(an) * 0.5, 1, Math.sin(an) * 0.5], tc, 0)); }
  const m = new Malla(); // only for its `tri` winding helper
  m.pos = pos;
  for (let k = 0; k < 5; k++) { const k2 = (k + 1) % 5, ref: V3 = [0, 0.5, 0]; m.idx = idx; m.tri(a[k], a[k2], b[k], ref); m.tri(a[k2], b[k2], b[k], ref); }
  for (const p of [1, 2]) {
    const ring: number[] = [], top = vert([0, 1, 0], [1.15, 1.15, 1.15], p), bot = vert([0, -1, 0], [0.55, 0.55, 0.55], p);
    for (let k = 0; k < LADOS_LEJOS; k++) { const an = ((k + 0.5 * (p - 1)) / LADOS_LEJOS) * Math.PI * 2; ring.push(vert([Math.cos(an), 0, Math.sin(an)], [0.85, 0.85, 0.85], p)); }
    for (let k = 0; k < LADOS_LEJOS; k++) { const k2 = (k + 1) % LADOS_LEJOS; m.idx = idx; m.tri(ring[k], ring[k2], top, [0, 0, 0]); m.tri(ring[k], ring[k2], bot, [0, 0, 0]); }
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

/** a = (x, y, z, escala) · b = (giro, fase, variante 0|1, tinte 0…1). */
function materialCerca(esp: Especie, c: Comunes, aletea: boolean, inst: Inst): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = `arbol-${esp}`;
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N; w: N };
  const giro = ib.x, fase = ib.y, vari = ib.z, tinte = ib.w, esc = ia.w;
  const mov = attribute("mov", "vec2") as unknown as ReturnType<typeof vec2>;
  const p0 = mix(positionGeometry as unknown as V3N, attribute("posB", "vec3") as unknown as V3N, vari) as unknown as V3N;
  let local = p0;
  if (aletea) { // leaves flutter: a small, fast wobble, phased per vertex, on leaf vertices only
    const t = c.tiempo as unknown as N, fuerza = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N;
    const f1 = sin(t.mul(6.5).add(p0.x.mul(9)).add(p0.z.mul(7)).add(fase)) as N;
    const a = fuerza.mul(0.008).add(0.008).mul(mov.y) as N;
    local = p0.add(vec3(f1, sin(t.mul(9.7).add(p0.y.mul(11)).add(p0.x.mul(5))), cos(t.mul(8.3).add(p0.x.mul(11)).add(p0.z.mul(3)))).mul(a)) as unknown as V3N;
  }
  const H = ALTURA[esp];
  mat.positionNode = girar(local, giro).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), mov.x, fase));
  mat.colorNode = mix(attribute("color", "vec3") as unknown as V3N, attribute("colB", "vec3") as unknown as V3N, vari).mul(tinte.mul(0.24).add(0.88));
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
  mat.colorNode = mix(vc, vc.mul(ie), s1).mul(ib.z.mul(0.24).add(0.88));
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------------
// the grove
// ---------------------------------------------------------------------------------------------------------------------
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

export function crearArboles(h: HArboles, puntos: readonly PuntoArbol[]) {
  const cfg = NATURALEZA_POR_NIVEL[h.nivel];
  const tiempo = uniform(0), comunes: Comunes = { tiempo: tiempo as unknown as { value: number }, vientoU: h.vientoU };
  // ---- bucket the points by species, with a per-tree phase, variant and tint that depend only on the position ----
  const lista: number[][] = ESPECIES.map(() => []);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of puntos) {
    const e = ESPECIES.indexOf(p.especie as Especie);
    const ix = Math.round(p.x * 16), iz = Math.round(p.z * 16);
    const v = p.variante ?? (hash2(0x61, ix, iz) < 0.8 ? 0 : 1);
    lista[e < 0 ? 0 : e].push(p.x, p.y, p.z, p.escala, p.giro, hash2(0x62, ix, iz) * 6.2832, v, hash2(0x63, ix, iz));
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const datos = lista.map((l) => Float32Array.from(l)), n = datos.map((d) => d.length / 8), total = n.reduce((a, b) => a + b, 0);
  const capCerca = Math.min(cfg.arbolesCerca, total), capLejos = Math.min(cfg.arbolesVisibles, total);
  const esfera = total ? new THREE.Sphere(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2 + 3, (minZ + maxZ) / 2), Math.hypot(maxX - minX, maxY - minY + 8, maxZ - minZ) / 2 + 4) : new THREE.Sphere();

  const grupo = new THREE.Group(); grupo.name = "arboles"; grupo.userData.sinSombra = true;
  const mallas: THREE.Mesh[] = [], geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const cerca = ESPECIES.map((esp, e) => {
    const capE = Math.min(n[e], capCerca), inst: Inst = { a: instAttr(capE, 4), b: instAttr(capE, 4) };
    const base = geometriaCerca(esp).geometria, g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index); g.instanceCount = 0; g.boundingSphere = esfera.clone();
    const mat = materialCerca(esp, comunes, cfg.arbolesAletean, inst), mesh = new THREE.Mesh(g, mat);
    mesh.name = `arboles-${esp}-cerca`; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.sinSombra = true;
    grupo.add(mesh); mallas.push(mesh); geos.push(g); mats.push(mat);
    return { inst, g, mesh, cuenta: 0, cap: capE };
  });
  const lejos = (() => {
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
  function repartir(cx: number, cy: number, cz: number) {
    const rc = cfg.arbolesCercaM, rl = cfg.arbolesLejosM;
    histCerca.fill(0); histTodo.fill(0);
    let o = 0;
    for (let e = 0; e < 4; e++) {
      const d = datos[e];
      for (let i = 0; i < d.length; i += 8, o++) {
        const dx = d[i] - cx, dy = d[i + 1] - cy, dz = d[i + 2] - cz, r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dist[o] = r;
        if (r < rl) { histTodo[(r / rl * CAJAS) | 0]++; if (r < rc) histCerca[(r / rc * CAJAS) | 0]++; }
      }
    }
    const rN = corte(histCerca, capCerca, rc), rV = corte(histTodo, capLejos, rl);
    for (const c of cerca) c.cuenta = 0;
    lejos.cuenta = 0;
    o = 0;
    for (let e = 0; e < 4; e++) {
      const d = datos[e], c = cerca[e], A = c.inst.a.array as Float32Array, B = c.inst.b.array as Float32Array;
      for (let i = 0; i < d.length; i += 8, o++) {
        const r = dist[o];
        if (r < rN && c.cuenta < c.cap) {
          const k = c.cuenta++;
          A[k * 4] = d[i]; A[k * 4 + 1] = d[i + 1]; A[k * 4 + 2] = d[i + 2]; A[k * 4 + 3] = d[i + 3];
          B[k * 4] = d[i + 4]; B[k * 4 + 1] = d[i + 5]; B[k * 4 + 2] = d[i + 6]; B[k * 4 + 3] = d[i + 7];
        } else if (r < rV && lejos.cuenta < capLejos) {
          const k = lejos.cuenta++, p = LEJOS_PARAM(e, d[i + 6]), col = COLOR_LEJOS[e][d[i + 6]];
          const ia = lejos.inst.a.array as Float32Array, ib = lejos.inst.b.array as Float32Array, ic = lejos.inst.c.array as Float32Array, id = lejos.inst.d.array as Float32Array, ie = lejos.inst.e.array as Float32Array;
          ia[k * 4] = d[i]; ia[k * 4 + 1] = d[i + 1]; ia[k * 4 + 2] = d[i + 2]; ia[k * 4 + 3] = d[i + 3];
          ib[k * 4] = d[i + 4]; ib[k * 4 + 1] = d[i + 5]; ib[k * 4 + 2] = d[i + 7];
          ic[k * 4] = p[0]; ic[k * 4 + 1] = p[1]; ic[k * 4 + 2] = p[2]; ic[k * 4 + 3] = p[3];
          id[k * 4] = p[4]; id[k * 4 + 1] = p[5]; id[k * 4 + 2] = p[6]; id[k * 4 + 3] = p[7];
          ie[k * 3] = col[0]; ie[k * 3 + 1] = col[1]; ie[k * 3 + 2] = col[2];
        }
      }
    }
    for (const c of cerca) { c.g.instanceCount = c.cuenta; c.mesh.visible = c.cuenta > 0; c.inst.a.needsUpdate = c.inst.b.needsUpdate = true; }
    lejos.g.instanceCount = lejos.cuenta; lejos.mesh.visible = lejos.cuenta > 0;
    for (const a of Object.values(lejos.inst)) a.needsUpdate = true;
    cercaUltimo = cerca.reduce((s, c) => s + c.cuenta, 0); lejosUltimo = lejos.cuenta;
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

  const bytesGeometria = ESPECIES.reduce((s, e) => s + geometriaCerca(e).bytes, 0) + geometriaLejos().bytes;
  function estadisticas(): EstadisticasArboles {
    const tris = cerca.reduce((s, c, e) => s + c.cuenta * geometriaCerca(ESPECIES[e]).triangulos, 0) + lejos.cuenta * geometriaLejos().triangulos;
    const bi = cerca.reduce((s, c) => s + c.inst.a.array.byteLength + c.inst.b.array.byteLength, 0) + Object.values(lejos.inst).reduce((s, a) => s + a.array.byteLength, 0);
    return { cerca: cerca.map((c) => c.cuenta), lejos: lejos.cuenta, arboles: cercaUltimo + lejosUltimo, triangulos: tris, llamadas: mallas.filter((m) => m.visible).length, bytesGeometria, bytesInstancias: bi };
  }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); grupo.removeFromParent(); }

  return { grupo, mallas, actualizar, repartir, estadisticas, dispose, tiempo: comunes.tiempo };
}
export type Arboles = ReturnType<typeof crearArboles>;
