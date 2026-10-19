// arboles (naturaleza N2, redone in R2 for the 2026-10-19 art direction): Mediterranean-garden trees with a little bronze machinery.
// Procedural and seed-driven. A near tree is ONE indexed BufferGeometry with a per-vertex tone (dark underside → light tips = free fake
// ambient occlusion), a faceted crown made of several leaf clumps (octahedra + a jittered icosahedron), a leaning, tapered trunk, thin
// branches that carry the clumps, and — on about 1 tree in 6 — a bronze or copper collar with a tiny brass tag (a few triangles that the
// shader drops under the ground when the per-instance flag is 0). No texture, no light, no shadow of its own, no normals (flat shading
// from screen derivatives). ALL colour comes from `paleta.ts` (art direction: work/naturaleza/DIRECCION-ARTE.md).
//
// COPIED / CHANGED (technique only, nothing unlicensed taken):
//  - shape reference: Numinia's 40/40/20 house mix and DISENO-LORE.md (big readable silhouettes, faceted clumps, soft vertex gradient) and the Quaternius / Kenney
//    CC0 low-poly nature packs as a look to aim at; our meshes are generated here, no asset is read. A jittered icosahedron / octahedron blob is the
//    classic low-poly crown (three.js IcosahedronGeometry vertex table, MIT).
//  - wind: the "sway grows with height, canopy most" idea of the Codrops «foliage with three.js TSL» tutorials and the GDC talk on Ghost of
//    Tsushima grass (technique only), as TSL (three/tsl) so it runs on WebGPU and on the WebGL2 fallback, driven by the engine's `vientoU` + one time uniform.
//  - seeded randomness: `crearAzar` / `hash2` (semilla.ts, mulberry32 + integer hash, public domain).
//
// R2 SPECIES (one vertex layout, five posed vertex sets picked per instance by `especie`, so the call count does not grow):
//  encina (holm oak: broad asymmetric dome) · pino (stone pine: tall bent trunk, flat irregular umbrella) · cipres (tall narrow flame) ·
//  olivo (gnarled twisted trunk, silver-green crown) · arbusto (shrub).
// DRAW CALLS: near LOD = ONE mesh (all species), far LOD = ONE mesh (a shared parametric silhouette: trunk + one blob, proportions per instance):
// 2 calls on tiers A/B, 1 on C/D. Hardware instancing on an InstancedBufferGeometry (custom per-instance attributes instead of an instanceMatrix,
// because the wind must read the pre-transform height of each vertex). Zero CPU per tree per frame: `actualizar(t)` writes one uniform; the
// near/far split is a throttled O(n) pass over typed arrays (see `repartir`).
import * as THREE from "three/webgpu";
import { uniform, float, vec2, vec3, attribute, instancedBufferAttribute, positionGeometry, normalFlat, transformNormalToView, normalize, sin, cos, pow, clamp, mix, length, max, step, oneMinus } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import { crearAzar, hash2 } from "./semilla.ts";
import { NATURALEZA_POR_NIVEL } from "./niveles.ts";
import { CASA, VERDES, MAQUINA, ESTACIONES, mezcla } from "./paleta.ts";
import { nodoRelleno } from "./relleno.ts";

void crearAzar;
export type Especie = "encina" | "pino" | "cipres" | "olivo" | "arbusto";
export const ESPECIES: readonly Especie[] = ["encina", "pino", "cipres", "olivo", "arbusto"];
/** One tree to plant: where (m), size factor, yaw (rad) and species. `variante` (0 | 1) is optional: from the position otherwise. */
export type PuntoArbol = { x: number; y: number; z: number; escala: number; giro: number; especie: Especie | string; variante?: 0 | 1 };
export type Lod = "cerca" | "lejos";

/** Triangle budgets (R2: the near tree is ~103 triangles; the far silhouette 16, so the trees' share of every tier still holds). */
export const TRIS_MAX_CERCA = 108;
export const TRIS_MAX_LEJOS = 18;

// ---------------------------------------------------------------------------------------------------------------------
// colours: only from paleta.ts. Two sets per species (variante 0 = summer green, 1 = the season's second set: autumn amber / spring blossom)
// ---------------------------------------------------------------------------------------------------------------------
const C = (hex: number) => new THREE.Color(hex);
type Par = { oscuro: number; claro: number };
const PLATA = mezcla(VERDES.musgo, CASA.arenaVelada, 0.3); // olive: silver-green
const HOJAS: Record<Especie, [Par, Par]> = {
  encina: [{ oscuro: VERDES.monteSombra, claro: mezcla(VERDES.musgo, VERDES.hierbaLuz, 0.3) }, { oscuro: ESTACIONES.otono.hoja, claro: ESTACIONES.otono.hojaLuz }],
  pino: [{ oscuro: VERDES.monteSombra, claro: mezcla(VERDES.monte, VERDES.musgo, 0.55) }, { oscuro: mezcla(VERDES.monteSombra, CASA.ambarTostado, 0.3), claro: mezcla(VERDES.musgo, CASA.ambar, 0.3) }],
  cipres: [{ oscuro: VERDES.monteSombra, claro: mezcla(VERDES.monte, VERDES.musgo, 0.4) }, { oscuro: VERDES.monteSombra, claro: mezcla(mezcla(VERDES.monte, VERDES.musgo, 0.4), CASA.ambarTostado, 0.2) }], // R5.4: the sunlit top a touch of moss warmer
  olivo: [{ oscuro: mezcla(VERDES.monte, CASA.arenaVelada, 0.2), claro: mezcla(PLATA, CASA.arenaVelada, 0.2) }, { oscuro: mezcla(VERDES.monte, CASA.ambarTostado, 0.3), claro: mezcla(PLATA, CASA.ambar, 0.25) }],
  arbusto: [{ oscuro: VERDES.monte, claro: mezcla(VERDES.hierba, VERDES.hierbaLuz, 0.3) }, { oscuro: VERDES.hierbaSombra, claro: mezcla(CASA.arena, CASA.verdemar, 0.3) }],
};
/** Bark (dark end; the shader lightens it toward ceniza up the trunk): brown with bronze/copper in it, olive grey and gnarled. */
const TRONCOS: number[] = [mezcla(CASA.bronce, CASA.ceniza, 0.45), mezcla(mezcla(CASA.bronce, MAQUINA.cobre, 0.35), CASA.ceniza, 0.2), mezcla(CASA.bronce, CASA.ceniza, 0.55), mezcla(CASA.bronce, CASA.ceniza, 0.7), mezcla(CASA.bronce, CASA.ceniza, 0.3)];

/** Per-instance tone: the two leaf colours of a species moved by up to ±8 % toward a lighter or a darker palette neighbour (u in −1…1). */
function tonos(esp: Especie, v: number, u: number): { oscuro: THREE.Color; claro: THREE.Color } {
  const h = HOJAS[esp][v], ref = u > 0 ? (esp === "olivo" ? CASA.arenaVelada : VERDES.hierbaLuz) : VERDES.monteSombra, t = 0.08 * Math.abs(u);
  return { oscuro: C(mezcla(h.oscuro, ref, t)), claro: C(mezcla(h.claro, ref, t)) };
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Winding helper: a triangle wound to face away from `ref` (works for convex pieces: blobs, prisms). */
class Malla {
  pos: number[] = []; idx: number[] = [];
  tri(a: number, b: number, c: number, ref: V3) {
    const p = (i: number): V3 => [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
    const pa = p(a), pb = p(b), pc = p(c);
    const n = cross(sub(pb, pa), sub(pc, pa));
    const cen: V3 = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    if (dot(n, sub(cen, ref)) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
}

/** The metres of height each species is drawn to (the wind's weight is height / this). */
export const ALTURA: Record<Especie, number> = { encina: 4.8, pino: 7.0, cipres: 6.8, olivo: 3.9, arbusto: 1.5 };

// ---------------------------------------------------------------------------------------------------------------------
// two near templates, ONE vertex layout per template.
//   detalle (tiers A, B; 103 triangles): leaning tapered 4-sided trunk in 2 segments (16) + 3 branches, 3-sided prisms (18), a collar band (8) + a tag (1),
//     5 leaf clumps = faceted octahedra (40; three sit on the branch tips, two fill the crown) + the crown, a jittered icosahedron (20).
//   simple (tiers C, D; 36 triangles): straight 4-sided trunk (8) + ONE clump (8) + the crown (20): irregular, no branches, no collar.
// Every species is a different set of vertex positions of the SAME topology (attributes position, pos1..4).
// ---------------------------------------------------------------------------------------------------------------------
/** Branch: y on the trunk (m), azimuth, elevation (rad), length (m), base radius. */
type Rama = [number, number, number, number, number];
/** Clump: offset (m) from the branch tip (clumps 0-2) or from the crown centre (3-4), then radii x, y, z. */
type Mata = [number, number, number, number, number, number];
type Forma = {
  tronco: { alto: number; r0: number; r1: number; lx: number; lz: number; curva: number; tors: number; bulto: number };
  ramas: Rama[]; matas: Mata[];
  copa: { cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; top: number };
  collar: number; jag: number;
  /** R5.4: a crown that is ONE spindle (the cypress) instead of clumps on branch tips; when set, `matas`/`copa` are ignored. */
  llama?: Llama;
};
/**
 * R5.4 cypress (Cupressus sempervirens): the crown is a single flame. The icosahedron is the body: bottom point at `pie`, its lower ring at the
 * widest height (about 30 % of the tree), its upper ring higher and narrower, its top the tip. The five octahedra stop being clumps: they become
 * long thin shells sharing the axis whose rings sit at other heights and turned between the body's vertices, just inside the body's widest
 * extent — offset rings that read as vertical ridges and a rounded base, never as a stack of diamonds (no notch between them).
 * anillos: [ring y, ring radius, top y, bottom y, turn (rad)]; the first one rounds the base (the only shell the simple C/D template keeps).
 */
type Llama = { pie: number; punta: number; bajo: [number, number]; alto: [number, number]; anillos: [number, number, number, number, number][] };
const FORMA: Record<Especie, Forma> = {
  encina: {
    tronco: { alto: 2.3, r0: 0.34, r1: 0.17, lx: 0.3, lz: 0.1, curva: 0.12, tors: 0.4, bulto: 0.12 },
    ramas: [[1.4, 0.5, 0.6, 1.5, 0.1], [1.8, 2.6, 0.5, 1.7, 0.09], [2.0, 4.5, 0.65, 1.4, 0.08]],
    matas: [[0.1, 0.15, 0.1, 1.05, 0.78, 1.0], [-0.1, 0.2, 0, 1.0, 0.72, 0.95], [0, 0.2, 0.1, 0.9, 0.68, 0.85], [0.9, 0.55, -0.7, 0.95, 0.62, 0.88], [-0.8, 0.85, 0.5, 0.88, 0.6, 0.82]],
    copa: { cx: 0.15, cy: 3.55, cz: 0, rx: 1.5, ry: 1.05, rz: 1.4, top: 1 }, collar: 0.65, jag: 0.2,
  },
  pino: {
    tronco: { alto: 5.6, r0: 0.25, r1: 0.09, lx: 0.9, lz: 0.3, curva: 0.35, tors: 0.5, bulto: 0.05 },
    ramas: [[4.0, 0.3, 0.4, 1.8, 0.07], [4.6, 2.4, 0.35, 2.0, 0.07], [4.9, 4.4, 0.45, 1.6, 0.06]],
    matas: [[0.1, 0.1, 0, 1.6, 0.42, 1.5], [0, 0.1, 0.1, 1.5, 0.4, 1.4], [0, 0.15, 0, 1.3, 0.4, 1.2], [1.5, -0.25, -1.0, 1.2, 0.38, 1.1], [-1.3, -0.35, 0.9, 1.1, 0.36, 1.0]],
    copa: { cx: 0.6, cy: 6.1, cz: 0.1, rx: 1.9, ry: 0.55, rz: 1.7, top: 1 }, collar: 1.0, jag: 0.24,
  },
  cipres: {
    tronco: { alto: 1.0, r0: 0.2, r1: 0.14, lx: 0.1, lz: 0.05, curva: 0.04, tors: 0.2, bulto: 0 },
    ramas: [[0.5, 0.4, 1.3, 0.7, 0.05], [0.65, 2.5, 1.35, 0.7, 0.05], [0.8, 4.4, 1.35, 0.6, 0.045]], // hidden inside the spindle
    matas: [[0.05, 0.8, 0, 0.78, 1.0, 0.74], [-0.05, 1.7, 0.05, 0.68, 0.95, 0.64], [0.03, 2.6, 0, 0.52, 0.85, 0.5], [0.08, -2.0, 0.05, 0.88, 1.05, 0.82], [-0.08, -0.8, 0.04, 0.8, 1.0, 0.74]],
    copa: { cx: 0.1, cy: 4.9, cz: 0, rx: 0.45, ry: 1.75, rz: 0.43, top: 1.25 }, collar: 0.36, jag: 0.16,
    llama: {
      pie: 0.62, punta: 6.8, bajo: [1.95, 0.72], alto: [4.5, 0.46], // ~4.7 : 1, the narrow columnar cypress of the canon (DISENO-LORE.md)
      anillos: [[1.0, 0.62, 2.7, 0.56, 0.2], [2.6, 0.67, 4.4, 1.4, 0.9], [3.5, 0.58, 5.3, 2.2, 1.9], [4.6, 0.45, 6.3, 3.3, 2.6], [5.6, 0.26, 6.72, 4.4, 0.5]],
    },
  },
  olivo: {
    tronco: { alto: 1.5, r0: 0.4, r1: 0.2, lx: 0.5, lz: -0.3, curva: 0.35, tors: 2.2, bulto: 0.3 },
    ramas: [[0.9, 0.2, 0.8, 1.4, 0.14], [1.1, 2.3, 0.7, 1.5, 0.13], [1.3, 4.3, 0.9, 1.2, 0.11]],
    matas: [[0.1, 0.2, 0, 1.0, 0.55, 0.95], [0, 0.25, 0.1, 0.95, 0.5, 0.9], [-0.1, 0.2, 0, 0.85, 0.5, 0.8], [1.0, 0.25, -0.9, 0.8, 0.45, 0.75], [-1.0, 0.15, 0.9, 0.8, 0.45, 0.75]],
    copa: { cx: 0.3, cy: 2.9, cz: 0, rx: 1.45, ry: 0.8, rz: 1.35, top: 1 }, collar: 0.5, jag: 0.22,
  },
  arbusto: {
    tronco: { alto: 0.18, r0: 0.07, r1: 0.05, lx: 0, lz: 0, curva: 0, tors: 0, bulto: 0 },
    ramas: [[0.1, 0.3, 0.12, 0.55, 0.04], [0.12, 2.4, 0.1, 0.6, 0.04], [0.1, 4.3, 0.14, 0.5, 0.04]],
    matas: [[0, 0.2, 0, 0.5, 0.4, 0.5], [0, 0.18, 0, 0.46, 0.38, 0.46], [0, 0.22, 0, 0.44, 0.36, 0.44], [0.5, 0.0, -0.3, 0.45, 0.3, 0.42], [-0.45, 0.05, 0.4, 0.42, 0.3, 0.4]],
    copa: { cx: 0, cy: 0.55, cz: 0, rx: 0.95, ry: 0.6, rz: 0.9, top: 1 }, collar: 0.05, jag: 0.2,
  },
};
export const LADOS_TRONCO = 4;
/** Triangles of the detailed near tree (tiers A/B) and of the simple one (tiers C/D). */
export const TRIANGULOS_DETALLE = 2 * LADOS_TRONCO * 2 + 3 * 6 + 8 + 1 + 5 * 8 + 20;
export const TRIANGULOS_SIMPLE = 2 * LADOS_TRONCO + 8 + 20;
export const TRIANGULOS_ARBOL = TRIANGULOS_DETALLE;
export const triangulosCerca = (detalle: boolean) => (detalle ? TRIANGULOS_DETALLE : TRIANGULOS_SIMPLE);
/** parte: 0 bark, 1 leaf, 2 collar band, 3 tag. */
export const PARTE = { corteza: 0, hoja: 1, collar: 2, etiqueta: 3 } as const;

export type GeometriaArbol = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };
const cacheArbol: Record<string, GeometriaArbol> = {};
/** The shared near template: 5 position sets (one per species), `tono` 0…1 (dark → light), `parte` (see PARTE), `mov` 0…1 (sway weight, tips most). */
export function geometriaArbol(detalle = true): GeometriaArbol {
  const clave = detalle ? "d" : "s";
  if (cacheArbol[clave]) return cacheArbol[clave];
  const nSeg = detalle ? 2 : 1, nMatas = detalle ? 5 : 1;
  const nv = LADOS_TRONCO * (nSeg + 1) + (detalle ? 18 + 8 + 3 : 0) + nMatas * 6 + 12;
  const pos = ESPECIES.map(() => new Float32Array(nv * 3)), tono = new Float32Array(nv), parte = new Float32Array(nv), mov = new Float32Array(nv);
  const idx: number[] = [];
  let tagRef: V3 = [0, 0, 0];
  ESPECIES.forEach((esp, e) => {
    const f = FORMA[esp], P = pos[e], t = f.tronco;
    const hv = (v: number, k: number) => hash2(0x7e + k + e * 29, v, 0x33) * 2 - 1; // deterministic per-vertex jitter −1…1
    let v = 0;
    const put = (p: V3, to: number, pa: number, mo: number) => { P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2]; if (e === 0) { tono[v] = Math.min(1, Math.max(0, to + 0.1 * hv(v, 1))); parte[v] = pa; mov[v] = mo; } v++; };
    const qq = (y: number) => Math.min(1, Math.max(0, y / t.alto));
    // the trunk's axis: leans (quadratic), sways in a curve, olive: a spiral
    const cen = (y: number): V3 => { const q = qq(y), sp = Math.sin(q * Math.PI * 2); return [t.lx * q * q + t.curva * Math.sin(q * Math.PI) + 0.12 * t.tors * sp, y, t.lz * q * q + 0.6 * t.curva * Math.sin(q * Math.PI + 1) + 0.12 * t.tors * (Math.cos(q * Math.PI * 2) - 1)]; };
    const rad = (y: number) => { const q = qq(y); return (t.r0 + (t.r1 - t.r0) * q) * (1 + t.bulto * Math.sin(q * Math.PI)); };
    // trunk: rings at y = −0.05, mid, top
    for (let s = 0; s <= nSeg; s++) {
      const y = s === 0 ? -0.05 : (t.alto * s) / nSeg, q = qq(y), r = rad(y), c = cen(y);
      for (let k = 0; k < LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + t.tors * q; put([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], q, 0, q * 0.3); }
    }
    // branches (prisms)
    const puntas: V3[] = [];
    f.ramas.forEach(([by, az, el, largo, br], i) => {
      const base = cen(by), dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const tip: V3 = [base[0] + dir[0] * largo, base[1] + dir[1] * largo, base[2] + dir[2] * largo];
      puntas.push(tip);
      if (!detalle) return;
      const ax = norm(sub(tip, base)), tt: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(tt, ax)), w = cross(ax, u);
      for (const [p, r, mo] of [[base, br, 0.12], [tip, br * 0.4, 0.9]] as [V3, number, number][]) for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i, d: V3 = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)];
        put([p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], mo > 0.5 ? 0.8 : 0.3, 0, mo);
      }
    });
    // collar band (bronze / copper) and its tag: shown per instance, dropped under the ground by the shader otherwise
    if (detalle) {
      const y0 = f.collar, q0 = qq(y0), rc = rad(y0) * 1.38 + 0.02;
      for (const y of [y0, y0 + 0.13]) { const c = cen(y); for (let k = 0; k < LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + t.tors * q0; put([c[0] + Math.cos(a) * rc, c[1], c[2] + Math.sin(a) * rc], 0.7, 2, q0 * 0.3); } }
      const c = cen(y0), a0 = (0.5 / LADOS_TRONCO) * Math.PI * 2 + t.tors * q0;
      put([c[0] + Math.cos(a0) * (rc + 0.01), y0 + 0.02, c[2] + Math.sin(a0) * (rc + 0.01)], 0.8, 3, q0 * 0.3);
      put([c[0] + Math.cos(a0 + 0.3) * (rc + 0.01), y0 + 0.02, c[2] + Math.sin(a0 + 0.3) * (rc + 0.01)], 0.8, 3, q0 * 0.3);
      put([c[0] + Math.cos(a0 + 0.15) * (rc + 0.05), y0 - 0.2, c[2] + Math.sin(a0 + 0.15) * (rc + 0.05)], 0.8, 3, q0 * 0.3);
      if (e === 0) tagRef = [c[0], y0 - 0.06, c[2]];
    }
    // clumps: faceted octahedra with a jagged ring, light on top
    const cc = cen(t.alto), cen0: V3 = [f.copa.cx, f.copa.cy, f.copa.cz];
    const L = f.llama;
    if (L) {
      // R5.4 spindle: long thin shells on the axis (same vertex order as a clump: top, ring of 4, bottom); ring radii alternate a little so
      // every shell adds two soft ridges, and the shells are turned so their ridges fall between the body's.
      const ax = (y: number): V3 => [cc[0] + 0.03 * Math.sin(y * 1.3 + e), y, cc[2] + 0.03 * Math.cos(y * 1.1)];
      L.anillos.slice(0, nMatas).forEach(([ry, r, ty, by, gi], i) => {
        const a0 = ax(ry), at = ax(ty), ab = ax(by), soft = i === L.anillos.length - 1 ? 0.05 : 0; // the last shell's top: the soft, slightly bent tip
        put([at[0] + soft, ty, at[2] + 0.5 * soft], 1, 1, 0.95);
        for (let k = 0; k < 4; k++) { const a = gi + (k / 4) * Math.PI * 2, j = (k % 2 ? 1 - f.jag * 0.7 : 1) * (1 - 0.03 * Math.abs(hv(v, 5))); put([a0[0] + Math.cos(a) * r * j, ry + 0.06 * hv(v, 6), a0[2] + Math.sin(a) * r * j], 0.6, 1, 1); }
        put([ab[0], by, ab[2]], 0.26, 1, 0.9);
      });
    } else f.matas.slice(0, nMatas).forEach(([ox, oy, oz, rx, ry, rz], i) => {
      const o: V3 = i < 3 ? puntas[i] : cen0, c: V3 = [o[0] + ox, o[1] + oy, o[2] + oz], giro = 0.5 + i * 1.3 + e * 0.4;
      put([c[0] + 0.1 * hv(v, 2), c[1] + ry * (1 + 0.12 * hv(v, 3)), c[2] + 0.1 * hv(v, 4)], 1, 1, 0.95);
      for (let k = 0; k < 4; k++) { const a = giro + (k / 4) * Math.PI * 2, j = 1 + f.jag * (k % 2 ? -1 : 1) + 0.1 * hv(v, 5); put([c[0] + Math.cos(a) * rx * j, c[1] + ry * (0.05 + 0.12 * hv(v, 6)), c[2] + Math.sin(a) * rz * j], 0.6, 1, 1); }
      put([c[0] + 0.08 * hv(v, 7), c[1] - ry * 0.7, c[2] + 0.08 * hv(v, 8)], 0.26, 1, 0.9);
    });
    // crown: a jittered icosahedron (top, upper ring of 5, lower ring of 5 turned half a step, bottom)
    if (L) { // R5.4: the spindle's body: bottom at the foliage foot, lower ring = the widest girth, upper ring narrower, top = the tip
      const giro = 0.3, x0 = cc[0], z0 = cc[2];
      put([x0 + 0.02, L.punta, z0], 1, 1, 0.75);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, r = L.alto[1] * (k % 2 ? 0.9 : 1); put([x0 + Math.cos(a) * r, L.alto[0] + 0.12 * hv(v, 13), z0 + Math.sin(a) * r], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, r = L.bajo[1] * (k % 2 ? 0.9 : 1); put([x0 + Math.cos(a) * r, L.bajo[0] + 0.1 * hv(v, 15), z0 + Math.sin(a) * r], 0.42, 1, 0.5); }
      put([x0, L.pie, z0], 0.18, 1, 0.45);
    } else {
      const o = f.copa, giro = 0.3 + e * 0.9, j = (k: number) => 1 + 0.16 * hv(v, k);
      put([o.cx + 0.12 * o.rx * hv(v, 9), o.cy + o.ry * o.top * j(10), o.cz + 0.12 * o.rz * hv(v, 11)], 1, 1, 0.75);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, q = 0.894 * (1 + f.jag * hv(v, 12)); put([o.cx + Math.cos(a) * o.rx * q, o.cy + o.ry * 0.447 * (1 + 0.25 * hv(v, 13)), o.cz + Math.sin(a) * o.rz * q], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, q = 0.894 * (1 + f.jag * (k % 2 ? 0.8 : -0.8) + 0.08 * hv(v, 14)); put([o.cx + Math.cos(a) * o.rx * q, o.cy - o.ry * 0.447 * (1 + 0.25 * hv(v, 15)), o.cz + Math.sin(a) * o.rz * q], 0.42, 1, 0.5); }
      put([o.cx + 0.1 * o.rx * hv(v, 16), o.cy - o.ry * 0.9 * j(17), o.cz + 0.1 * o.rz * hv(v, 18)], 0.18, 1, 0.45);
    }
  });
  // indices: winding is decided on species 0 (encina) and shared by all species (every part stays a convex star around its centre)
  const m = new Malla(); m.pos = Array.from(pos[0]); m.idx = idx;
  const P0 = (i: number): V3 => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
  const centro = (ids: number[]): V3 => { const s: V3 = [0, 0, 0]; for (const i of ids) { const p = P0(i); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return [s[0] / ids.length, s[1] / ids.length, s[2] / ids.length]; };
  let o = 0;
  for (let s = 0; s < nSeg; s++) {
    const a = o + s * LADOS_TRONCO, b = a + LADOS_TRONCO, ref = centro([...Array(2 * LADOS_TRONCO).keys()].map((i) => a + i));
    for (let k = 0; k < LADOS_TRONCO; k++) { const k2 = (k + 1) % LADOS_TRONCO; m.tri(a + k, a + k2, b + k, ref); m.tri(a + k2, b + k2, b + k, ref); }
  }
  o += LADOS_TRONCO * (nSeg + 1);
  if (detalle) {
    for (let i = 0; i < 3; i++) {
      const a = o + i * 6, ref = centro([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
      for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; m.tri(a + k, a + k2, a + 3 + k, ref); m.tri(a + k2, a + 3 + k2, a + 3 + k, ref); }
    }
    o += 18;
    { // collar band: two rings of 4
      const ref = centro([...Array(8).keys()].map((i) => o + i));
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.tri(o + k, o + k2, o + 4 + k, ref); m.tri(o + k2, o + 4 + k2, o + 4 + k, ref); }
      o += 8;
    }
    m.tri(o, o + 1, o + 2, tagRef); o += 3;
  }
  for (let i = 0; i < nMatas; i++) {
    const a = o + i * 6, ref = centro([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.tri(a, a + 1 + k, a + 1 + k2, ref); m.tri(a + 5, a + 1 + k, a + 1 + k2, ref); }
  }
  o += nMatas * 6;
  {
    const ref = centro([...Array(12).keys()].map((i) => o + i)), top = o, u = (k: number) => o + 1 + (k % 5), l = (k: number) => o + 6 + (k % 5), bot = o + 11;
    for (let k = 0; k < 5; k++) { m.tri(top, u(k), u(k + 1), ref); m.tri(u(k), l(k), u(k + 1), ref); m.tri(l(k), l(k + 1), u(k + 1), ref); m.tri(bot, l(k), l(k + 1), ref); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos[0], 3));
  for (let e = 1; e < ESPECIES.length; e++) g.setAttribute(`pos${e}`, new THREE.BufferAttribute(pos[e], 3));
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
// far LOD: ONE parametric silhouette for every species (R2: a 3-sided trunk + ONE jittered pentagonal bipyramid, 16 triangles)
// ---------------------------------------------------------------------------------------------------------------------
/** Per species: [trunkH, trunkR, blob centre y, blob radius xz, blob radius y, ring shift]. The ring shift (R5.4) moves the blob's widest ring
 *  down (negative, in blob radii y) while its top and bottom stay put: the cypress's far silhouette becomes a flame, widest at ~30 % of its height. */
export const LEJOS: Record<Especie, number[]> = {
  encina: [2.3, 0.3, 3.7, 1.9, 1.4, 0],
  pino: [5.4, 0.2, 6.1, 2.1, 0.7, 0],
  cipres: [0.9, 0.2, 3.53, 0.7, 2.95, -0.58],
  olivo: [2.0, 0.34, 2.9, 1.8, 0.95, 0],
  arbusto: [0.12, 0.06, 0.55, 1.0, 0.6, 0],
};
const LADOS_TRONCO_LEJOS = 3, LADOS_COPA_LEJOS = 5;
export type GeometriaEspecie = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };

let geoLejos: GeometriaEspecie | null = null;
/** The shared far geometry: part 0 trunk (3-sided frustum), part 1 a bipyramid with an uneven ring (no two far trees read as the same diamond), unit size. */
export function geometriaLejos(): GeometriaEspecie {
  if (geoLejos) return geoLejos;
  const pos: number[] = [], col: number[] = [], parte: number[] = [], idx: number[] = [];
  const vert = (p: V3, c: V3, k: number) => { pos.push(...p); col.push(c[0], c[1], c[2]); parte.push(k); return pos.length / 3 - 1; };
  const tr = C(TRONCOS[0]), tc = C(mezcla(TRONCOS[0], CASA.ceniza, 0.5));
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const an = (k / LADOS_TRONCO_LEJOS) * Math.PI * 2; a.push(vert([Math.cos(an), 0, Math.sin(an)], [tr.r, tr.g, tr.b], 0)); b.push(vert([Math.cos(an) * 0.5, 1, Math.sin(an) * 0.5], [tc.r, tc.g, tc.b], 0)); }
  const m = new Malla(); // only for its `tri` winding helper
  m.pos = pos; m.idx = idx;
  for (let k = 0; k < LADOS_TRONCO_LEJOS; k++) { const k2 = (k + 1) % LADOS_TRONCO_LEJOS, ref: V3 = [0, 0.5, 0]; m.tri(a[k], a[k2], b[k], ref); m.tri(a[k2], b[k2], b[k], ref); }
  const RADIOS = [1.0, 0.78, 1.12, 0.86, 0.95];
  const ring: number[] = [], top = vert([0.14, 1.05, 0.06], [1.15, 1.15, 1.15], 1), bot = vert([0, -0.9, 0], [0.62, 0.62, 0.62], 1);
  for (let k = 0; k < LADOS_COPA_LEJOS; k++) { const an = ((k + 0.35) / LADOS_COPA_LEJOS) * Math.PI * 2; ring.push(vert([Math.cos(an) * RADIOS[k], 0.1 * (k % 2 ? 1 : -1), Math.sin(an) * RADIOS[k]], [0.85, 0.85, 0.85], 1)); }
  for (let k = 0; k < LADOS_COPA_LEJOS; k++) { const k2 = (k + 1) % LADOS_COPA_LEJOS; m.tri(ring[k], ring[k2], top, [0, 0, 0]); m.tri(ring[k], ring[k2], bot, [0, 0, 0]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("parte", new THREE.Float32BufferAttribute(parte, 1));
  g.setIndex(idx);
  return (geoLejos = { geometria: g, triangulos: idx.length / 3, bytes: bytesDe(g) });
}


// ---------------------------------------------------------------------------------------------------------------------
// materials: TSL vertex displacement (instance placement + lean + wind in one positionNode, no instanceMatrix)
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
/** Pick one of `vals` by the species index `sp` (0…n−1) with a chain of steps; works for floats and vec3 nodes. */
function porEsp<T>(sp: N, vals: T[]): T { let r = vals[0] as unknown as N; for (let i = 1; i < vals.length; i++) r = mix(r, vals[i] as unknown as N, step(i - 0.5, sp)) as N; return r as unknown as T; }
/** Lean of the trunk's top as a fraction of its height, per species (the stone pine and the olive lean the most, the shrub not at all). */
const INCLINA = [0.05, 0.09, 0.04, 0.07, 0];

type Inst = { a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute };
const instAttr = (n: number, k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };

/** Near LOD, all species: a = (x, y, z, escala) · b = (giro, fase, especie 0…4, tinte) · c = (dark leaf rgb, height m) · d = (light leaf rgb, collar flag 0 none / 1 bronze / 2 copper). */
type InstCerca = Inst & { c: THREE.InstancedBufferAttribute; d: THREE.InstancedBufferAttribute };
function materialCerca(c: Comunes, aletea: boolean, inst: InstCerca): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = "arbol-cerca";
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N; w: N };
  const ic = instancedBufferAttribute(inst.c) as unknown as { xyz: V3N; w: N }, id = instancedBufferAttribute(inst.d) as unknown as { xyz: V3N; w: N };
  const giro = ib.x, fase = ib.y, sp = ib.z, tinte = ib.w, esc = ia.w, H = ic.w, flag = id.w;
  const parte = attribute("parte", "float") as unknown as N, tono = attribute("tono", "float") as unknown as N;
  const mov = attribute("mov", "float") as unknown as N, q = (k: string) => attribute(k, "vec3") as unknown as V3N;
  const esHoja = step(0.5, parte).mul(oneMinus(step(1.5, parte))) as N, esMetal = step(1.5, parte) as N;
  let p0 = positionGeometry as unknown as V3N;
  for (let i = 1; i < ESPECIES.length; i++) p0 = mix(p0, q(`pos${i}`), step(i - 0.5, sp)) as unknown as V3N;
  // R5.4 cypress: ±8 % height per tree (from its phase), a lean that bows (none at the foot, most at the tip), sway and tone by height
  const esCip = step(1.5, sp).mul(oneMinus(step(2.5, sp))) as N;
  p0 = vec3(p0.x, p0.y.mul(esCip.mul(sin(fase.mul(3.7)).mul(0.08)).add(1)), p0.z) as unknown as V3N;
  const hRel = clamp(p0.y.div(H), 0, 1) as N;
  // lean: the trunk shears toward a per-tree azimuth (from its phase), by a per-species amount
  const inclina = vec2(sin(fase.mul(1.7)), cos(fase.mul(1.3))).mul(porEsp(sp, INCLINA.map((v) => float(v))).mul(tinte.mul(0.65).add(0.35))).mul(esCip.mul(hRel.mul(1.5).sub(1)).add(1)) as unknown as ReturnType<typeof vec2>;
  // a collar (and its tag) without its flag goes under the ground
  let local = p0.add(vec3(inclina.x.mul(p0.y), esMetal.mul(oneMinus(step(0.5, flag))).mul(-60), inclina.y.mul(p0.y))) as unknown as V3N;
  if (aletea) { // leaves flutter: a small, fast wobble, phased per vertex, on leaf vertices only
    const t = c.tiempo as unknown as N, fuerza = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N;
    const f1 = sin(t.mul(6.5).add(p0.x.mul(9)).add(p0.z.mul(7)).add(fase)) as N;
    const a = fuerza.mul(0.008).add(0.008).mul(esHoja) as N;
    local = local.add(vec3(f1, sin(t.mul(9.7).add(p0.y.mul(11)).add(p0.x.mul(5))), cos(t.mul(8.3).add(p0.x.mul(11)).add(p0.z.mul(3)))).mul(a)) as unknown as V3N;
  }
  // branches and leaf clumps sway on their own, more at the tips (`mov` 0 at a branch root … 1 at its tip), on top of the whole-tree lean
  const tt = c.tiempo as unknown as N, vel = (c.vientoU as unknown as V3N).xz.add(BRISA) as unknown as ReturnType<typeof vec2>, fz = length(vel) as N, dr = vel.div(fz) as unknown as ReturnType<typeof vec2>;
  const movE = mix(mov, hRel.mul(0.9), esCip) as N; // the cypress sways as one body: by height, not by clump
  const punta = movE.mul(movE).mul(fz.mul(0.05).add(0.09)).mul(esc) as N;
  const ph = tt.mul(1.9).add(fase).add(p0.x.mul(2.3).add(p0.z.mul(1.7)).mul(oneMinus(esCip))) as N; // … and in one phase (its shells do not drift apart)
  const bal = vec3(dr.x.mul(sin(ph)).sub(dr.y.mul(cos(ph.mul(0.7))).mul(0.4)), sin(ph.mul(1.3)).mul(0.25), dr.y.mul(sin(ph)).add(dr.x.mul(cos(ph.mul(0.7))).mul(0.4))).mul(punta) as unknown as V3N;
  mat.positionNode = girar(local, giro).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), movE.mul(0.7), fase)).add(bal);
  const col3 = (k: THREE.Color) => vec3(k.r, k.g, k.b) as unknown as V3N;
  const troncoO = porEsp(sp, TRONCOS.map((h) => col3(C(h)))), troncoC = mix(troncoO, col3(C(CASA.ceniza)), 0.5) as unknown as V3N;
  const tronco = mix(troncoO, troncoC, tono) as unknown as V3N;
  const tonoH = mix(tono.mul(0.7).add(0.3), hRel.mul(0.75).add(0.12).add(tono.mul(0.13)), esCip) as N; // cypress: dark foot → lighter, warmer sunlit top
  const hoja = mix(ic.xyz, id.xyz, tonoH).mul(1.4) as unknown as V3N; // the house greens are deep: lift them so the crowns read under the morning light
  const laton = mix(col3(C(MAQUINA.laton)), col3(C(MAQUINA.cobre)), step(1.5, flag)) as unknown as V3N;
  const metal = mix(laton, col3(C(mezcla(MAQUINA.laton, CASA.arena, 0.35))), step(2.5, parte)) as unknown as V3N;
  const ao = clamp(p0.y.div(H), 0, 1).mul(0.1).add(0.9) as N; // fake ambient occlusion: a little darker toward the ground
  mat.colorNode = mix(mix(tronco, hoja, esHoja), metal, esMetal).mul(ao).mul(tinte.mul(0.16).add(0.92)).mul(1.25);
  // faces still read flat, but a leaf's normal leans toward the sky (the sunless side of a crown no longer goes black): flat + up × (0.15 bark … 0.65 leaf)
  mat.normalNode = normalize((normalFlat as unknown as V3N).mul(0.75).add((transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(esHoja.mul(0.65).add(0.3)))); // 0.75 × flat so a face pointing straight down does not cancel to nothing (that read black)
  mat.emissiveNode = nodoRelleno(); // R5.1: the shade fill (relleno.ts): the sunless side of trunks and branches reads sea-green, not black
  return mat;
}


/** Far LOD: a = (x, y, z, escala) · b = (giro, fase, tinte, especie) · c = (trunkH, trunkR, blob y, blob r xz) · d = (blob r y, ring shift, 0, 0) · e = leaf colour (r, g, b, 0). */
type InstLejos = Inst & { c: THREE.InstancedBufferAttribute; d: THREE.InstancedBufferAttribute; e: THREE.InstancedBufferAttribute };
function materialLejos(c: Comunes, inst: InstLejos): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = "arbol-lejos";
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N; w: N };
  const ic = instancedBufferAttribute(inst.c) as unknown as { x: N; y: N; z: N; w: N }, id = instancedBufferAttribute(inst.d) as unknown as { x: N; y: N };
  const ie = instancedBufferAttribute(inst.e) as unknown as V3N;
  const q = positionGeometry as unknown as V3N, parte = attribute("parte", "float") as unknown as N;
  const qy = q.y.add(id.y.mul(oneMinus(q.y.mul(q.y)))) as N; // R5.4: the ring moves by the per-species shift, the apexes (|y| ≈ 1) barely
  const tronco = vec3(q.x.mul(ic.y), q.y.mul(ic.x), q.z.mul(ic.y)), copa = vec3(q.x.mul(ic.w), ic.z.add(qy.mul(id.x)), q.z.mul(ic.w));
  const s1 = step(0.5, parte) as N;
  const p0 = mix(tronco, copa, s1) as unknown as V3N;
  const H = ic.z.add(id.x) as N, esc = ia.w;
  const inclina = vec2(sin(ib.y.mul(1.7)), cos(ib.y.mul(1.3))).mul(porEsp(ib.w, INCLINA.map((v) => float(v))).mul(ib.z.mul(0.65).add(0.35))) as unknown as ReturnType<typeof vec2>;
  const local = p0.add(vec3(inclina.x.mul(p0.y), 0, inclina.y.mul(p0.y))) as unknown as V3N;
  mat.positionNode = girar(local, ib.x).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), float(0), ib.y));
  const vc = attribute("color", "vec3") as unknown as V3N;
  mat.colorNode = mix(vc, vc.mul(ie), s1).mul(ib.z.mul(0.16).add(0.92)).mul(1.25);
  mat.normalNode = normalize((normalFlat as unknown as V3N).mul(0.75).add((transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(s1.mul(0.65).add(0.3)))); // the sunless side leans toward the sky
  mat.emissiveNode = nodoRelleno(); // R5.1: the shade fill (relleno.ts)
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
export type EstadisticasArboles = { cerca: number[]; lejos: number; arboles: number; triangulos: number; llamadas: number; bytesGeometria: number; bytesInstancias: number; collares?: number };

const REPARTO_S = 0.25;      // the near/far split runs at most this often (s) …
const REPARTO_M = 1.5;       // … and only if the camera moved this far (m) since the last one
const CAJAS = 64;
const COLOR_LEJOS = ESPECIES.map((e) => [0, 1].map((v) => { const c = C(mezcla(HOJAS[e][v].oscuro, HOJAS[e][v].claro, 0.65)); return [c.r * 1.4, c.g * 1.4, c.b * 1.4]; }));
const FLOATS = 10; // per tree: x, y, z, scale, yaw, phase, variant, tint, species, collar flag
/** Share of the trees that wear a collar; about 1 in 6. */
export const COLLAR_PROB = 1 / 6;

export function crearArboles(h: HArboles, puntos: readonly PuntoArbol[]) {
  const cfg = NATURALEZA_POR_NIVEL[h.nivel];
  const tiempo = uniform(0), comunes: Comunes = { tiempo: tiempo as unknown as { value: number }, vientoU: h.vientoU };
  // ---- the trees as one typed array, with a per-tree phase, variant, tint, size (±8 %) and collar that depend only on the position ----
  const total = puntos.length, datos = new Float32Array(total * FLOATS), cuentaEsp = ESPECIES.map(() => 0);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  puntos.forEach((p, i) => {
    const e0 = ESPECIES.indexOf(p.especie as Especie), e = e0 < 0 ? 0 : e0;
    const ix = Math.round(p.x * 16), iz = Math.round(p.z * 16), v = p.variante ?? (hash2(0x61, ix, iz) < 0.8 ? 0 : 1), o = i * FLOATS;
    const collar = e === 4 ? 0 : hash2(0x64, ix, iz) < COLLAR_PROB ? (hash2(0x66, ix, iz) < 0.3 ? 2 : 1) : 0;
    datos.set([p.x, p.y, p.z, p.escala * (1 + 0.08 * (hash2(0x65, ix, iz) * 2 - 1)), p.giro, hash2(0x62, ix, iz) * 6.2832, v, hash2(0x63, ix, iz), e, collar], o); cuentaEsp[e]++;
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
    return { inst, g, mesh, cuenta: 0, cap: capCerca, porEspecie: ESPECIES.map(() => 0), collares: 0 };
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
    cerca.cuenta = 0; cerca.porEspecie.fill(0); cerca.collares = 0;
    if (lejos) lejos.cuenta = 0;
    const A = cerca.inst.a.array as Float32Array, B = cerca.inst.b.array as Float32Array, Cc = cerca.inst.c.array as Float32Array, D = cerca.inst.d.array as Float32Array;
    for (let o = 0, i = 0; o < total; o++, i += FLOATS) {
      const r = dist[o], e = datos[i + 8], v = datos[i + 6];
      if (r < rN && cerca.cuenta < cerca.cap) {
        const k = cerca.cuenta++, hj = tonos(ESPECIES[e], v, datos[i + 7] * 2 - 1);
        cerca.porEspecie[e]++; if (datos[i + 9] > 0) cerca.collares++;
        A[k * 4] = datos[i]; A[k * 4 + 1] = datos[i + 1]; A[k * 4 + 2] = datos[i + 2]; A[k * 4 + 3] = datos[i + 3];
        B[k * 4] = datos[i + 4]; B[k * 4 + 1] = datos[i + 5]; B[k * 4 + 2] = e; B[k * 4 + 3] = datos[i + 7];
        Cc[k * 4] = hj.oscuro.r; Cc[k * 4 + 1] = hj.oscuro.g; Cc[k * 4 + 2] = hj.oscuro.b; Cc[k * 4 + 3] = ALTURA[ESPECIES[e]];
        D[k * 4] = hj.claro.r; D[k * 4 + 1] = hj.claro.g; D[k * 4 + 2] = hj.claro.b; D[k * 4 + 3] = datos[i + 9];
      } else if (lejos && r < rV && lejos.cuenta < capLejos) {
        const k = lejos.cuenta++, p = LEJOS[ESPECIES[e]], col = COLOR_LEJOS[e][v];
        const ia = lejos.inst.a.array as Float32Array, ib = lejos.inst.b.array as Float32Array, ic = lejos.inst.c.array as Float32Array, id = lejos.inst.d.array as Float32Array, ie = lejos.inst.e.array as Float32Array;
        ia[k * 4] = datos[i]; ia[k * 4 + 1] = datos[i + 1]; ia[k * 4 + 2] = datos[i + 2]; ia[k * 4 + 3] = datos[i + 3];
        ib[k * 4] = datos[i + 4]; ib[k * 4 + 1] = datos[i + 5]; ib[k * 4 + 2] = datos[i + 7]; ib[k * 4 + 3] = e;
        ic[k * 4] = p[0]; ic[k * 4 + 1] = p[1]; ic[k * 4 + 2] = p[2]; ic[k * 4 + 3] = p[3];
        id[k * 4] = p[4]; id[k * 4 + 1] = p[5];
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
    return { cerca: cerca.porEspecie.slice(), lejos: lejos?.cuenta ?? 0, arboles: cercaUltimo + lejosUltimo, triangulos: tris, llamadas: mallas.filter((m) => m.visible).length, bytesGeometria, bytesInstancias: bi, collares: cerca.collares };
  }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); grupo.removeFromParent(); }

  return { grupo, mallas, actualizar, repartir, estadisticas, dispose, tiempo: comunes.tiempo };
}
export type Arboles = ReturnType<typeof crearArboles>;
