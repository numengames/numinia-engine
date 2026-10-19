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
import { uniform, float, vec2, vec3, attribute, instancedBufferAttribute, positionGeometry, sin, cos, pow, clamp, mix, length, max, step, oneMinus } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import { crearAzar, hash2 } from "./semilla.ts";
import { NATURALEZA_POR_NIVEL } from "./niveles.ts";

export type Especie = "roble" | "pino" | "abedul" | "arbusto";
export const ESPECIES: readonly Especie[] = ["roble", "pino", "abedul", "arbusto"];
/** One tree to plant: where (m), size factor, yaw (rad) and species. `variante` (0 | 1) is optional: from the position otherwise. */
export type PuntoArbol = { x: number; y: number; z: number; escala: number; giro: number; especie: Especie | string; variante?: 0 | 1 };
export type Lod = "cerca" | "lejos";

/** Triangle budgets of the brief. */
export const TRIS_MAX_CERCA = 40;
export const TRIS_MAX_LEJOS = 26;

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

const LADOS_COPA = 5;   // a leaf blob is a pentagonal bipyramid: 10 triangles, 7 vertices (apex, ring of 5, apex)

/** The metres of height each species is drawn to (the wind's weight is height / this). */
export const ALTURA: Record<Especie, number> = { roble: 4.7, pino: 6.8, abedul: 5.4, arbusto: 1.5 };

// ---------------------------------------------------------------------------------------------------------------------
// N6: ONE template for every species. A tree is a 5-sided trunk (10 triangles) + three leaf blobs (pentagonal bipyramids, 10 each) = 40
// triangles and 31 vertices; each species is a different set of vertex positions of the SAME topology (attributes position, pos1, pos2,
// pos3), picked per instance by `especie` in the vertex shader. So all four species are ONE draw call, and no instance pays for
// vertices it does not use (the cost of merging species into one big geometry). Leaf colours (dark/light) are per-instance
// attributes, which also carries the autumn / blossom variants (they used to be a second vertex set).
// ---------------------------------------------------------------------------------------------------------------------
/** Per species: trunk [height, base radius, top radius, lean x, lean z] and three leaf blobs [cx, cy, cz, rx, ry, rz, ring, top, bottom]:
 *  the ring sits at cy + ring·ry, the apexes at cy + top·ry and cy − bottom·ry (an acorn-like dome for broadleaves, a cone for the pine). */
const FORMA: Record<Especie, { tronco: number[]; hojas: number[][] }> = {
  roble: { tronco: [2.6, 0.3, 0.12, 0.05, 0.03], hojas: [[0, 3.2, 0, 1.75, 1.45, 1.75, 0.0, 1.0, 0.32], [1.15, 2.55, 0.35, 1.2, 1.0, 1.2, 0.0, 0.95, 0.32], [-1.0, 2.5, -0.6, 1.15, 0.95, 1.15, 0.0, 0.95, 0.32]] },
  pino: { tronco: [6.6, 0.2, 0.04, 0.03, 0.02], hojas: [[0, 2.1, 0, 1.55, 1.9, 1.55, -0.55, 1.0, 0.45], [0, 3.9, 0, 1.1, 1.6, 1.1, -0.55, 1.0, 0.45], [0, 5.4, 0, 0.68, 1.4, 0.68, -0.5, 1.0, 0.4]] },
  abedul: { tronco: [3.8, 0.12, 0.08, 0.08, 0.05], hojas: [[0, 4.1, 0, 1.0, 1.5, 1.0, -0.05, 1.0, 0.35], [0.6, 3.2, 0.2, 0.8, 1.05, 0.8, -0.05, 1.0, 0.35], [-0.55, 3.0, -0.4, 0.78, 1.0, 0.78, -0.05, 1.0, 0.35]] },
  arbusto: { tronco: [0.12, 0.06, 0.04, 0, 0], hojas: [[0, 0.62, 0, 0.9, 0.72, 0.9, 0, 0.95, 0.3], [0.65, 0.45, 0.2, 0.62, 0.5, 0.62, 0, 0.95, 0.3], [-0.58, 0.45, -0.25, 0.6, 0.48, 0.6, 0, 0.95, 0.3]] },
};
export const LADOS_TRONCO = 5;
export const TRIANGULOS_ARBOL = 2 * LADOS_TRONCO + 3 * 2 * LADOS_COPA;

/** The shared template: 4 position sets (one per species), `tono` 0…1 (dark → light along the part) and `parte` 0 trunk / 1 leaf. */
export type GeometriaArbol = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };
let cacheArbol: GeometriaArbol | null = null;
export function geometriaArbol(): GeometriaArbol {
  if (cacheArbol) return cacheArbol;
  const porCopa = LADOS_COPA + 2, nv = 2 * LADOS_TRONCO + 3 * porCopa, pos = ESPECIES.map(() => new Float32Array(nv * 3)), tono = new Float32Array(nv), parte = new Float32Array(nv), idx: number[] = [];
  ESPECIES.forEach((esp, e) => {
    const R = crearAzar(0x6e61 + e * 131), f = FORMA[esp], [alto, r0, r1, lx, lz] = f.tronco, P = pos[e];
    let v = 0;
    const put = (x: number, y: number, z: number, t: number, p: number) => { P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; tono[v] = t; parte[v] = p; v++; };
    for (let k = 0; k < LADOS_TRONCO; k++) { const a = (k / LADOS_TRONCO) * Math.PI * 2; put(Math.cos(a) * r0, -0.05, Math.sin(a) * r0, 0, 0); }
    for (let k = 0; k < LADOS_TRONCO; k++) { const a = (k / LADOS_TRONCO) * Math.PI * 2; put(lx + Math.cos(a) * r1, alto, lz + Math.sin(a) * r1, 1, 0); }
    for (const [cx, cy, cz, rx, ry, rz, ring, top, bot] of f.hojas) {
      const giro = R() * Math.PI * 2, j = () => 1 + 0.14 * (R() * 2 - 1);
      put(cx, cy + ry * top * j(), cz, 1, 1);                                         // top apex: the light end
      for (let k = 0; k < LADOS_COPA; k++) { const a = giro + (k / LADOS_COPA) * Math.PI * 2, q = j(); put(cx + Math.cos(a) * rx * q, cy + ry * (ring + 0.12 * (R() * 2 - 1)), cz + Math.sin(a) * rz * q, 0.5 + 0.1 * (R() * 2 - 1), 1); }
      put(cx, cy - ry * bot * j(), cz, 0.3, 1);                                         // bottom apex: the dark end (fake ambient occlusion)
    }
  });
  const m = new Malla(); m.pos = Array.from(pos[0]); m.idx = idx; // winding helper: outward from an inner point of the part, the same indices for every species
  for (let k = 0; k < LADOS_TRONCO; k++) { const k2 = (k + 1) % LADOS_TRONCO, ref: V3 = [0, 1, 0]; m.tri(k, k2, LADOS_TRONCO + k, ref); m.tri(k2, LADOS_TRONCO + k2, LADOS_TRONCO + k, ref); }
  FORMA.roble.hojas.forEach((c, b) => {
    const o = 2 * LADOS_TRONCO + b * porCopa, top = o, bot = o + porCopa - 1, ref: V3 = [c[0], c[1], c[2]];
    for (let k = 0; k < LADOS_COPA; k++) { const a = o + 1 + k, a2 = o + 1 + ((k + 1) % LADOS_COPA); m.tri(top, a, a2, ref); m.tri(bot, a, a2, ref); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos[0], 3));
  for (let e = 1; e < 4; e++) g.setAttribute(`pos${e}`, new THREE.BufferAttribute(pos[e], 3));
  g.setAttribute("tono", new THREE.BufferAttribute(tono, 1));
  g.setAttribute("parte", new THREE.BufferAttribute(parte, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, 0), 8);
  return (cacheArbol = { geometria: g, triangulos: idx.length / 3, bytes: bytesDe(g) });
}
/** The triangles of one tree (every species draws the same template). Kept as a function for the old per-species callers. */
export const geometriaCerca = (_esp: Especie): GeometriaArbol => geometriaArbol();


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
const LADOS_LEJOS = 5, LADOS_TRONCO_LEJOS = 3;
export type GeometriaEspecie = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };

let geoLejos: GeometriaEspecie | null = null;
/** The shared far geometry: part 0 trunk (5-sided cone frustum), parts 1 and 2 bipyramids, all in unit size. */
export function geometriaLejos(): GeometriaEspecie {
  if (geoLejos) return geoLejos;
  const pos: number[] = [], col: number[] = [], parte: number[] = [], idx: number[] = [];
  const vert = (p: V3, c: V3, k: number) => { pos.push(...p); col.push(c[0], c[1], c[2]); parte.push(k); return pos.length / 3 - 1; };
  const tr = [TRONCO_OSC.r, TRONCO_OSC.g, TRONCO_OSC.b] as V3, tc = [TRONCO.r, TRONCO.g, TRONCO.b] as V3;
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const an = (k / LADOS_TRONCO_LEJOS) * Math.PI * 2; a.push(vert([Math.cos(an), 0, Math.sin(an)], tr, 0)); b.push(vert([Math.cos(an) * 0.5, 1, Math.sin(an) * 0.5], tc, 0)); }
  const m = new Malla(); // only for its `tri` winding helper
  m.pos = pos;
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const k2 = (k + 1) % LADOS_TRONCO_LEJOS, ref: V3 = [0, 0.5, 0]; m.idx = idx; m.tri(a[k], a[k2], b[k], ref); m.tri(a[k2], b[k2], b[k], ref); }
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
  const q = (k: string) => attribute(k, "vec3") as unknown as V3N;
  const e01 = mix(positionGeometry as unknown as V3N, q("pos1"), step(0.5, sp)), e23 = mix(q("pos2"), q("pos3"), step(2.5, sp));
  const p0 = mix(e01, e23, step(1.5, sp)) as unknown as V3N;
  let local = p0;
  if (aletea) { // leaves flutter: a small, fast wobble, phased per vertex, on leaf vertices only
    const t = c.tiempo as unknown as N, fuerza = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N;
    const f1 = sin(t.mul(6.5).add(p0.x.mul(9)).add(p0.z.mul(7)).add(fase)) as N;
    const a = fuerza.mul(0.008).add(0.008).mul(parte) as N;
    local = p0.add(vec3(f1, sin(t.mul(9.7).add(p0.y.mul(11)).add(p0.x.mul(5))), cos(t.mul(8.3).add(p0.x.mul(11)).add(p0.z.mul(3)))).mul(a)) as unknown as V3N;
  }
  mat.positionNode = girar(local, giro).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), parte.mul(0.5), fase));
  const col3 = (k: THREE.Color) => vec3(k.r, k.g, k.b) as unknown as V3N;
  const birch = step(1.5, sp).mul(oneMinus(step(2.5, sp))) as N;
  const tronco = mix(mix(col3(TRONCO_N[0]), col3(TRONCO_N[1]), tono), mix(col3(ABEDUL_N[0]), col3(ABEDUL_N[1]), tono), birch) as unknown as V3N;
  const hoja = mix(ic.xyz, id.xyz, tono) as unknown as V3N;
  const ao = clamp(p0.y.div(H), 0, 1).mul(0.14).add(0.86) as N; // fake ambient occlusion: a little darker toward the ground
  mat.colorNode = mix(tronco, hoja, parte).mul(ao).mul(tinte.mul(0.24).add(0.88));
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
    const base = geometriaArbol().geometria, g = new THREE.InstancedBufferGeometry();
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

  const bytesGeometria = geometriaArbol().bytes + (conLejos ? geometriaLejos().bytes : 0);
  function estadisticas(): EstadisticasArboles {
    const tris = cerca.cuenta * geometriaArbol().triangulos + (lejos?.cuenta ?? 0) * geometriaLejos().triangulos;
    const bi = Object.values(cerca.inst).reduce((s, a) => s + a.array.byteLength, 0) + (lejos ? Object.values(lejos.inst).reduce((s, a) => s + a.array.byteLength, 0) : 0);
    return { cerca: cerca.porEspecie.slice(), lejos: lejos?.cuenta ?? 0, arboles: cercaUltimo + lejosUltimo, triangulos: tris, llamadas: mallas.filter((m) => m.visible).length, bytesGeometria, bytesInstancias: bi };
  }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); grupo.removeFromParent(); }

  return { grupo, mallas, actualizar, repartir, estadisticas, dispose, tiempo: comunes.tiempo };
}
export type Arboles = ReturnType<typeof crearArboles>;
