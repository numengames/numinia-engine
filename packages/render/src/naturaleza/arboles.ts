// arboles (naturaleza N2, redone in R2 for the 2026-10-19 art direction): Mediterranean-garden trees with a little bronze machinery.
// Procedural and seed-driven. A near tree is ONE indexed BufferGeometry with a per-vertex tone (dark underside → light tips = free fake
// ambient occlusion), a faceted crown made of several leaf clumps (octahedra + a jittered icosahedron), a leaning, tapered trunk, thin
// branches that carry the clumps, and — E50, «cada árbol lleva su pieza de máquina» (work/naturaleza/MUNDO-PROYECTADO.md) — on EVERY tree
// one machine piece chosen per instance: a bronze clamp, a riveted tin strap, or a thin neon vein climbing the bark (turquoise or coral,
// brighter at night); about 1 tree in 30 is a «tree-artwork» (a spiral trunk gripping a ring-portal or a lens) — a second shape of the SAME
// template, chosen in the shader. Zero extra draw calls, zero extra triangles: the band/tag are the old collar's triangles, the vein, rivets,
// joints and the C/D painted band are fragment patterns over the trunk's uv. No texture, no light, no shadow of its own, no normals (flat
// shading from screen derivatives). ALL colour comes from `paleta.ts` (art direction: work/naturaleza/DIRECCION-ARTE.md).
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
//  olivo (gnarled twisted trunk, silver-green crown) · arbusto (shrub) · sauce (R6.3 weeping willow of the Virelai: leaning trunk, a high dome and
//  five long hanging curtains that arch out from under it and fall almost to the ground; only near water, see esparcir.ts).
// DRAW CALLS: near LOD = ONE mesh (all species), far LOD = ONE mesh (a shared parametric silhouette: trunk + one blob, proportions per instance):
// 2 calls on tiers A/B, 1 on C/D. Hardware instancing on an InstancedBufferGeometry (custom per-instance attributes instead of an instanceMatrix,
// because the wind must read the pre-transform height of each vertex). Zero CPU per tree per frame: `actualizar(t)` writes one uniform; the
// near/far split is a throttled O(n) pass over typed arrays (see `repartir`).
import * as THREE from "three/webgpu";
import { uniform, float, vec2, vec3, vec4, attribute, instancedBufferAttribute, positionGeometry, normalFlat, transformNormalToView, normalize, sin, cos, pow, clamp, mix, length, max, min, abs, step, oneMinus, dot as dotN, smoothstep, varying, floor, fract, fwidth, uv as uvNodo } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import { crearAzar, hash2, valor2 } from "./semilla.ts";
import { NATURALEZA_POR_NIVEL } from "./niveles.ts";
import { CASA, VERDES, MAQUINA, ESTACIONES, MAQUINA_ARBOL, SETA_ARBOL, mezcla } from "./paleta.ts";
import { nodoRelleno, solDirU } from "./relleno.ts";
import { copaDeCartas, esquinaHaciaCamara, distanciaHojas, coberturaHojas, INDICES_CARTA, UV_CARTA, type Lobulo } from "./follaje.ts";

void crearAzar;
export type Especie = "encina" | "pino" | "cipres" | "olivo" | "arbusto" | "sauce";
export const ESPECIES: readonly Especie[] = ["encina", "pino", "cipres", "olivo", "arbusto", "sauce"];
/** One tree to plant: where (m), size factor, yaw (rad) and species. `variante` (0 | 1) is optional: from the position otherwise. */
export type PuntoArbol = { x: number; y: number; z: number; escala: number; giro: number; especie: Especie | string; variante?: 0 | 1 };
export type Lod = "cerca" | "lejos";

/** Triangle budgets (R2: the near tree was ~103 triangles; R7.4 adds the leaf cards: 231 on tiers A/B, 116 on C/D; the far silhouette stays 16). */
export const TRIS_MAX_CERCA = 240;
export const TRIS_MAX_LEJOS = 18;

// ---------------------------------------------------------------------------------------------------------------------
// colours: only from paleta.ts. Two sets per species (variante 0 = summer green, 1 = the season's second set: autumn amber / spring blossom)
// ---------------------------------------------------------------------------------------------------------------------
const C = (hex: number) => new THREE.Color(hex);
type Par = { oscuro: number; claro: number };
const HOJAS: Record<Especie, [Par, Par]> = {
  encina: [{ oscuro: VERDES.monteSombra, claro: mezcla(VERDES.musgo, VERDES.hierbaLuz, 0.3) }, { oscuro: ESTACIONES.otono.hoja, claro: ESTACIONES.otono.hojaLuz }],
  // E50 (paisajes de Pablo): the stone pine is an ochre umbrella with garnet gills, the olive a cluster of gold caps; second set: rust
  pino: [{ oscuro: SETA_ARBOL.lamina, claro: SETA_ARBOL.ocre }, { oscuro: SETA_ARBOL.laminaOxido, claro: SETA_ARBOL.oxido }],
  cipres: [{ oscuro: VERDES.monteSombra, claro: mezcla(VERDES.monte, VERDES.musgo, 0.4) }, { oscuro: VERDES.monteSombra, claro: mezcla(mezcla(VERDES.monte, VERDES.musgo, 0.4), CASA.ambarTostado, 0.2) }], // R5.4: the sunlit top a touch of moss warmer
  olivo: [{ oscuro: SETA_ARBOL.laminaOro, claro: SETA_ARBOL.oro }, { oscuro: SETA_ARBOL.lamina, claro: SETA_ARBOL.ocre }],
  arbusto: [{ oscuro: VERDES.monte, claro: mezcla(VERDES.hierba, VERDES.hierbaLuz, 0.3) }, { oscuro: VERDES.hierbaSombra, claro: mezcla(CASA.arena, CASA.verdemar, 0.3) }],
  // R6.3 willow: a cool green (monte toward verdín) under the dome, light sea-green tips on the curtains; autumn: the tips go straw-amber
  sauce: [{ oscuro: mezcla(VERDES.monteSombra, VERDES.verdin, 0.35), claro: mezcla(VERDES.hierba, CASA.verdemar, 0.3) }, { oscuro: mezcla(VERDES.monte, CASA.ambarTostado, 0.25), claro: mezcla(VERDES.hierba, CASA.ambar, 0.3) }],
};
/** Bark (dark end; the shader lightens it toward ceniza up the trunk): brown with bronze/copper in it, olive grey and gnarled. */
const TRONCOS: number[] = [mezcla(CASA.bronce, CASA.ceniza, 0.45), SETA_ARBOL.troncoTostado, mezcla(CASA.bronce, CASA.ceniza, 0.55), SETA_ARBOL.tronco, mezcla(CASA.bronce, CASA.ceniza, 0.3), mezcla(mezcla(CASA.bronce, VERDES.verdin, 0.15), CASA.ceniza, 0.4)];

/** Per-instance tone: the two leaf colours of a species moved by up to ±12 % toward a lighter or a darker palette neighbour (u in −1…1: R7.4 the regional drift). */
function tonos(esp: Especie, v: number, u: number): { oscuro: THREE.Color; claro: THREE.Color } {
  const seta = !!FORMA[esp].seta, h = HOJAS[esp][v], ref = u > 0 ? (seta ? CASA.arena : VERDES.hierbaLuz) : seta ? CASA.bronceOscuro : VERDES.monteSombra, t = 0.12 * Math.abs(u);
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
export const ALTURA: Record<Especie, number> = { encina: 4.8, pino: 7.0, cipres: 6.8, olivo: 4.1, arbusto: 1.5, sauce: 5.5 };

// ---------------------------------------------------------------------------------------------------------------------
// two near templates, ONE vertex layout per template.
//   detalle (tiers A, B; 103 triangles): leaning tapered 4-sided trunk in 2 segments (16) + 3 branches, 3-sided prisms (18), a collar band (8) + a tag (1),
//     5 leaf clumps = faceted octahedra (40; three sit on the branch tips, two fill the crown) + the crown, a jittered icosahedron (20).
//   simple (tiers C, D; 36 triangles): straight 4-sided trunk (8) + ONE clump (8) + the crown (20): irregular, no branches, no collar
//     (E50: the clamp / strap is PAINTED on the trunk's bark by the fragment; the neon vein is the same pattern as on A/B).
//   E50: every trunk ring and the band carry one seam vertex more (uv without a wrap); the triangle counts do not change.
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
  /** R6.3: a weeping crown (the willow): a high dome + hanging curtains instead of clumps; when set, `matas`/`copa` are ignored. */
  lloron?: Lloron;
  /** E50: mushroom / umbrella caps (Pablo's landscapes): the crown's upper ring narrows (`alto` × radius), its lower ring is the widest
   *  (`bajo` × radius) and drops to `cae` × ry under the centre, the underside is shallow (`pie` × ry); the clumps flatten into caps the
   *  same way (`mataPie` × ry under the ring). Same vertices, same order: every part stays a convex star, the shared winding holds. */
  seta?: { alto: number; bajo: number; cae: number; pie: number; mataPie: number };
};
/**
 * R6.3 willow (Salix babylonica, the willows along the Virelai in DISENO-LORE.md): the icosahedron is a dome set HIGH on the leaning trunk (its lower
 * ring is the widest girth, its bottom a flat underside); the five octahedra become hanging curtains around its rim. Each curtain's top vertex hides
 * inside the dome, its ring of 4 sits just past the dome's rim (outer vertex lowest, so the curtain arches out from under the dome — the whiplash of
 * the Art Nouveau sheets), and its bottom vertex hangs almost to the ground, swept sideways (`barre`) so the hem is a row of curling tips, not a
 * fringe of diamonds. dome: top y, upper ring [y, r], lower ring [y, r], underside y, offset from the trunk top (dx, dz).
 * cortinas: [azimuth, top y, radius, side corners' y, half width, half thickness, tip y, sideways sweep].
 */
type Lloron = { top: number; alto: [number, number]; bajo: [number, number]; pie: number; dx: number; dz: number; cortinas: [number, number, number, number, number, number, number, number][] };
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
  // E50 «sombrilla» (paisaje-2, -4): a tall, thin, twisted pale trunk; three ribs splay under a wide domed cap, a tier of smaller caps on their tips
  pino: {
    tronco: { alto: 5.5, r0: 0.17, r1: 0.07, lx: 0.8, lz: 0.25, curva: 0.45, tors: 1.8, bulto: 0.06 },
    ramas: [[4.2, 0.3, 0.5, 1.5, 0.06], [4.7, 2.4, 0.45, 1.7, 0.055], [5.0, 4.4, 0.55, 1.3, 0.05]],
    matas: [[0, 0.12, 0, 1.1, 0.4, 1.0], [0, 0.12, 0, 1.2, 0.38, 1.1], [0, 0.1, 0, 0.95, 0.36, 0.9], [1.3, -0.2, -0.9, 1.0, 0.34, 0.95], [-1.2, -0.3, 0.9, 0.95, 0.32, 0.9]],
    copa: { cx: 0.8, cy: 6.15, cz: 0.25, rx: 2.3, ry: 0.8, rz: 2.1, top: 0.8 }, collar: 1.0, jag: 0.14,
    seta: { alto: 0.62, bajo: 1.08, cae: 0.18, pie: 0.32, mataPie: 0.28 },
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
  // E50 «racimo de setas» (paisaje-1, -3): a thin twisted pale main stem with the big cap, three side stems from low on it, each with its own
  // cap (overlapping tiers), and two shelf caps gripping the main stem (the clumps 3-4) — grown or made, you cannot tell
  olivo: {
    tronco: { alto: 3.0, r0: 0.2, r1: 0.1, lx: 0.35, lz: -0.2, curva: 0.3, tors: 2.6, bulto: 0.15 },
    ramas: [[0.5, 0.4, 1.2, 2.3, 0.09], [0.7, 2.5, 1.12, 1.8, 0.08], [0.9, 4.4, 1.05, 1.4, 0.07]],
    matas: [[0, 0.12, 0, 0.8, 0.4, 0.75], [0, 0.1, 0, 0.7, 0.36, 0.66], [0, 0.08, 0, 0.6, 0.32, 0.58], [0.2, -1.3, 0.25, 0.45, 0.18, 0.42], [-0.25, -2.2, -0.1, 0.38, 0.15, 0.36]],
    copa: { cx: 0.35, cy: 3.45, cz: -0.2, rx: 1.3, ry: 0.62, rz: 1.2, top: 0.82 }, collar: 0.45, jag: 0.12,
    seta: { alto: 0.6, bajo: 1.06, cae: 0.2, pie: 0.34, mataPie: 0.3 },
  },
  arbusto: {
    tronco: { alto: 0.18, r0: 0.07, r1: 0.05, lx: 0, lz: 0, curva: 0, tors: 0, bulto: 0 },
    ramas: [[0.1, 0.3, 0.12, 0.55, 0.04], [0.12, 2.4, 0.1, 0.6, 0.04], [0.1, 4.3, 0.14, 0.5, 0.04]],
    matas: [[0, 0.2, 0, 0.5, 0.4, 0.5], [0, 0.18, 0, 0.46, 0.38, 0.46], [0, 0.22, 0, 0.44, 0.36, 0.44], [0.5, 0.0, -0.3, 0.45, 0.3, 0.42], [-0.45, 0.05, 0.4, 0.42, 0.3, 0.4]],
    copa: { cx: 0, cy: 0.55, cz: 0, rx: 0.95, ry: 0.6, rz: 0.9, top: 1 }, collar: 0.05, jag: 0.2,
  },
  sauce: {
    tronco: { alto: 2.8, r0: 0.27, r1: 0.13, lx: 0.75, lz: 0.2, curva: 0.3, tors: 0.35, bulto: 0.2 },
    ramas: [[2.2, 0.7, 0.8, 1.4, 0.07], [2.4, 2.8, 0.75, 1.5, 0.065], [2.6, 4.7, 0.85, 1.3, 0.06]], // arching up into the dome
    matas: [[0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1]], // unused (lloron)
    copa: { cx: 0.8, cy: 4.4, cz: 0.2, rx: 2.2, ry: 1.0, rz: 2.1, top: 1 }, collar: 0.6, jag: 0.12,
    lloron: {
      top: 5.5, alto: [5.0, 1.45], bajo: [4.15, 2.25], pie: 3.4, dx: 0.12, dz: 0,
      // the curtains hang from the dome's rim (top vertex just inside it), widen straight down to a ring low on the tree and end in a short tip:
      // long sheets, not icicles. `barre` swings the ring one way and curls the tip back (the S of a whiplash).
      cortinas: [
        [0.35, 4.3, 1.75, 3.8, 1.02, 0.3, 0.4, 0.4], [1.6, 4.3, 1.8, 3.85, 0.98, 0.28, 0.75, -0.35], [2.85, 4.25, 1.75, 3.8, 1.02, 0.3, 0.35, 0.45],
        [4.1, 4.3, 1.8, 3.85, 0.98, 0.28, 0.85, -0.4], [5.3, 4.25, 1.75, 3.8, 1.02, 0.3, 0.5, 0.35],
      ],
    },
  },
};
export const LADOS_TRONCO = 4;
/**
 * R7.4 foliage crown (follaje.ts, Bruno Simon's Foliage.js, MIT): leaf cards per near tree on the detailed template (tiers A/B) and on the simple one
 * (tiers C/D: fewer, larger cards — SpeedTree's «fewer, bigger leaves» LOD). Every species carries the cards in the shared topology; the species
 * without them (`CON_CARTAS` false) keep their faceted crown and their cards collapse to a point (zero area, nothing rasterised). A species that
 * gets cards collapses its faceted crown instead. R7.4 converts ONE test species, the holm oak (the commonest round crown); R7.5 the rest.
 */
export const CARTAS_DETALLE = 64, CARTAS_SIMPLE = 40;
export const CON_CARTAS: Record<Especie, boolean> = { encina: true, pino: false, cipres: false, olivo: false, arbusto: false, sauce: false };
/** Triangles of the detailed near tree (tiers A/B) and of the simple one (tiers C/D). */
export const TRIANGULOS_DETALLE = 2 * LADOS_TRONCO * 2 + 3 * 6 + 8 + 1 + 5 * 8 + 20 + 2 * CARTAS_DETALLE;
export const TRIANGULOS_SIMPLE = 2 * LADOS_TRONCO + 8 + 20 + 2 * CARTAS_SIMPLE;
export const TRIANGULOS_ARBOL = TRIANGULOS_DETALLE;
export const triangulosCerca = (detalle: boolean) => (detalle ? TRIANGULOS_DETALLE : TRIANGULOS_SIMPLE);
/** parte: 0 bark, 1 leaf (faceted crown), 2 collar band, 3 tag, 4 leaf card (R7.4). */
export const PARTE = { corteza: 0, hoja: 1, collar: 2, etiqueta: 3, carta: 4 } as const;
/** E50: what each template vertex becomes on a tree-artwork (`obra` attribute, w = rol + 0.5 × glow): spiral trunk, arms, clasp, (tag hidden),
 *  ring segments (the clumps), lens / membrane (the crown's icosahedron), crest leaves (the cards). */
export const ROL_OBRA = { tronco: 0, rama: 1, banda: 2, etiqueta: 3, mata: 4, copa: 5, carta: 6 } as const;

export type GeometriaArbol = { geometria: THREE.BufferGeometry; triangulos: number; bytes: number };
const cacheArbol: Record<string, GeometriaArbol> = {};
/** The shared near template: 6 position sets (one per species), `tono` 0…1 (dark → light; on a card: its baked occlusion), `parte` (see PARTE), `mov` 0…1
 *  (sway weight, tips most); R7.4 cards also carry `esquina` (corner offset in the card's plane, m), `uv` (the leaf cluster) and `nesf` (Bruno's
 *  spherical normal, tree space). The card attributes are written by species 0 (encina), the only species with cards in R7.4. */
export function geometriaArbol(detalle = true): GeometriaArbol {
  const clave = detalle ? "d" : "s";
  if (cacheArbol[clave]) return cacheArbol[clave];
  const nSeg = detalle ? 2 : 1, nMatas = detalle ? 5 : 1, nCartas = detalle ? CARTAS_DETALLE : CARTAS_SIMPLE;
  // E50: trunk rings and the band carry ONE extra vertex each (the seam, a copy of the first at u = 1) so `uv` (u around, v up) runs without a wrap:
  // the neon vein, the painted band (C/D) and the tin rivets are drawn in the fragment from it. Same triangles.
  const LU = LADOS_TRONCO + 1;
  const vCopa = LU * (nSeg + 1) + (detalle ? 18 + 2 * LU + 3 : 0), vCartas = vCopa + nMatas * 6 + 12; // first vertex of the faceted crown / of the cards
  const nv = vCartas + nCartas * 4;
  const pos = ESPECIES.map(() => new Float32Array(nv * 3)), tono = new Float32Array(nv), parte = new Float32Array(nv), mov = new Float32Array(nv);
  const esquina = new Float32Array(nv * 2), uvs = new Float32Array(nv * 2), nesf = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) nesf[i * 3 + 1] = 1; // non-card vertices: a valid «up» (a zero vector would normalise to NaN and blacken the whole tree)
  const idx: number[] = [];
  let tagRef: V3 = [0, 0, 0];
  ESPECIES.forEach((esp, e) => {
    const f = FORMA[esp], P = pos[e], t = f.tronco;
    let v = 0, sem = 0; // E50: `sem` = seam vertices put so far: the jitter keeps hashing the pre-E50 vertex number (the same crowns, vertex for vertex)
    const hv = (v: number, k: number) => hash2(0x7e + k + e * 29, v - sem, 0x33) * 2 - 1; // deterministic per-vertex jitter −1…1
    const costura = () => { if (e === 0) tono[v - 1] = tono[v - 1 - LADOS_TRONCO]; sem++; }; // the seam copies its ring's first tone
    const put = (p: V3, to: number, pa: number, mo: number) => { P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2]; if (e === 0) { tono[v] = Math.min(1, Math.max(0, to + 0.1 * hv(v, 1))); parte[v] = pa; mov[v] = mo; } v++; };
    const qq = (y: number) => Math.min(1, Math.max(0, y / t.alto));
    // the trunk's axis: leans (quadratic), sways in a curve, olive: a spiral
    const cen = (y: number): V3 => { const q = qq(y), sp = Math.sin(q * Math.PI * 2); return [t.lx * q * q + t.curva * Math.sin(q * Math.PI) + 0.12 * t.tors * sp, y, t.lz * q * q + 0.6 * t.curva * Math.sin(q * Math.PI + 1) + 0.12 * t.tors * (Math.cos(q * Math.PI * 2) - 1)]; };
    const rad = (y: number) => { const q = qq(y); return (t.r0 + (t.r1 - t.r0) * q) * (1 + t.bulto * Math.sin(q * Math.PI)); };
    // trunk: rings at y = −0.05, mid, top (E50: u = k / 4 around, v = q up; the seam vertex closes the ring at u = 1)
    for (let s = 0; s <= nSeg; s++) {
      const y = s === 0 ? -0.05 : (t.alto * s) / nSeg, q = qq(y), r = rad(y), c = cen(y);
      for (let k = 0; k <= LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + t.tors * q; if (e === 0) uvs.set([k / LADOS_TRONCO, q], v * 2); put([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], q, 0, q * 0.3); if (k === LADOS_TRONCO) costura(); }
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
      for (const [j, y] of [y0, y0 + 0.13].entries()) { const c = cen(y); for (let k = 0; k <= LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + t.tors * q0; if (e === 0) uvs.set([k / LADOS_TRONCO, j], v * 2); put([c[0] + Math.cos(a) * rc, c[1], c[2] + Math.sin(a) * rc], 0.7, 2, q0 * 0.3); if (k === LADOS_TRONCO) costura(); } }
      const c = cen(y0), a0 = (0.5 / LADOS_TRONCO) * Math.PI * 2 + t.tors * q0;
      put([c[0] + Math.cos(a0) * (rc + 0.01), y0 + 0.02, c[2] + Math.sin(a0) * (rc + 0.01)], 0.8, 3, q0 * 0.3);
      put([c[0] + Math.cos(a0 + 0.3) * (rc + 0.01), y0 + 0.02, c[2] + Math.sin(a0 + 0.3) * (rc + 0.01)], 0.8, 3, q0 * 0.3);
      put([c[0] + Math.cos(a0 + 0.15) * (rc + 0.05), y0 - 0.2, c[2] + Math.sin(a0 + 0.15) * (rc + 0.05)], 0.8, 3, q0 * 0.3);
      if (e === 0) tagRef = [c[0], y0 - 0.06, c[2]];
    }
    // clumps: faceted octahedra with a jagged ring, light on top
    const cc = cen(t.alto), cen0: V3 = [f.copa.cx, f.copa.cy, f.copa.cz];
    const L = f.llama, W = f.lloron, x0W = cc[0] + (W?.dx ?? 0), z0W = cc[2] + (W?.dz ?? 0);
    if (W) {
      // R6.3 curtains (same vertex order as a clump: top, ring of 4, bottom). The ring is a rotated ellipse (radial thickness × tangential width), so the
      // handedness of the clump's ring is kept and the shared winding holds.
      W.cortinas.slice(0, nMatas).forEach(([az, yt, ra, ya, an, gr, yp, barre]) => {
        const X: V3 = [Math.cos(az), 0, Math.sin(az)], Z: V3 = [-Math.sin(az), 0, Math.cos(az)];
        const at = (r: number, s: number, y: number): V3 => [x0W + X[0] * r + Z[0] * s, y, z0W + X[2] * r + Z[2] * s];
        // ring (k = 0 outer, 1 side +, 2 inner, 3 side −): the two side corners sit high, right under the dome (the sheet's wide top), the outer one
        // hangs low beside the bottom vertex: the front reads as a wide sheet with a ragged two-tipped hem, never a diamond.
        put(at(ra * 0.75, 0, yt), 0.5, 1, 0.25);
        put(at(ra + gr, 0.5 * an + 0.6 * barre, yp + 0.3 + 0.06 * hv(v, 6)), 0.55, 1, 1);
        put(at(ra, an, ya), 0.55, 1, 0.4);
        put(at(ra - gr, 0.2 * barre, (ya + yp) / 2), 0.55, 1, 0.6);
        put(at(ra, -an, ya - 0.15), 0.55, 1, 0.4);
        put(at(ra - 0.05, -0.45 * an + 0.3 * barre, yp), 0.2, 1, 1);
      });
    } else if (L) {
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
      const S = f.seta, anillo = S ? -0.08 : 0.05, pieM = S ? S.mataPie : 0.7; // E50: a cap — the ring is the rim, the underside shallow
      put([c[0] + 0.1 * hv(v, 2), c[1] + ry * ((S ? 0.7 : 1) + 0.12 * hv(v, 3)), c[2] + 0.1 * hv(v, 4)], 1, 1, 0.95);
      for (let k = 0; k < 4; k++) { const a = giro + (k / 4) * Math.PI * 2, j = 1 + f.jag * (k % 2 ? -1 : 1) + 0.1 * hv(v, 5); put([c[0] + Math.cos(a) * rx * j, c[1] + ry * (anillo + 0.12 * hv(v, 6)), c[2] + Math.sin(a) * rz * j], 0.6, 1, 1); }
      put([c[0] + 0.08 * hv(v, 7), c[1] - ry * pieM, c[2] + 0.08 * hv(v, 8)], 0.26, 1, 0.9);
    });
    // crown: a jittered icosahedron (top, upper ring of 5, lower ring of 5 turned half a step, bottom)
    if (W) { // R6.3: the willow's dome, high on the trunk: lower ring = the widest girth, a flat underside
      const giro = 0.2;
      put([x0W + 0.08, W.top, z0W + 0.05], 1, 1, 0.6);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, r = W.alto[1] * (k % 2 ? 0.88 : 1); put([x0W + Math.cos(a) * r, W.alto[0] + 0.12 * hv(v, 13), z0W + Math.sin(a) * r], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, r = W.bajo[1] * (k % 2 ? 0.92 : 1.04); put([x0W + Math.cos(a) * r, W.bajo[0] + (k % 2 ? -0.12 : 0.1), z0W + Math.sin(a) * r], 0.42, 1, 0.5); }
      put([x0W, W.pie, z0W], 0.18, 1, 0.45);
    } else if (L) { // R5.4: the spindle's body: bottom at the foliage foot, lower ring = the widest girth, upper ring narrower, top = the tip
      const giro = 0.3, x0 = cc[0], z0 = cc[2];
      put([x0 + 0.02, L.punta, z0], 1, 1, 0.75);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, r = L.alto[1] * (k % 2 ? 0.9 : 1); put([x0 + Math.cos(a) * r, L.alto[0] + 0.12 * hv(v, 13), z0 + Math.sin(a) * r], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, r = L.bajo[1] * (k % 2 ? 0.9 : 1); put([x0 + Math.cos(a) * r, L.bajo[0] + 0.1 * hv(v, 15), z0 + Math.sin(a) * r], 0.42, 1, 0.5); }
      put([x0, L.pie, z0], 0.18, 1, 0.45);
    } else {
      const o = f.copa, giro = 0.3 + e * 0.9, j = (k: number) => 1 + 0.16 * hv(v, k), S = f.seta;
      // E50 cap: narrower upper ring, the lower ring the widest rim a little under the centre, a shallow underside (the gills: dark tone)
      const [qa, qb, yb, yp] = S ? [S.alto, S.bajo, S.cae, S.pie] : [1, 1, 0.447, 0.9];
      put([o.cx + 0.12 * o.rx * hv(v, 9), o.cy + o.ry * o.top * j(10), o.cz + 0.12 * o.rz * hv(v, 11)], 1, 1, 0.75);
      for (let k = 0; k < 5; k++) { const a = giro + (k / 5) * Math.PI * 2, q = 0.894 * qa * (1 + f.jag * hv(v, 12)); put([o.cx + Math.cos(a) * o.rx * q, o.cy + o.ry * 0.447 * (1 + 0.25 * hv(v, 13)), o.cz + Math.sin(a) * o.rz * q], 0.78, 1, 0.55); }
      for (let k = 0; k < 5; k++) { const a = giro + ((k + 0.5) / 5) * Math.PI * 2, q = 0.894 * qb * (1 + f.jag * (k % 2 ? 0.8 : -0.8) + 0.08 * hv(v, 14)); put([o.cx + Math.cos(a) * o.rx * q, o.cy - o.ry * yb * (1 + 0.25 * hv(v, 15)), o.cz + Math.sin(a) * o.rz * q], 0.42, 1, 0.5); }
      put([o.cx + 0.1 * o.rx * hv(v, 16), o.cy - o.ry * yp * j(17), o.cz + 0.1 * o.rz * hv(v, 18)], 0.18, 1, 0.45);
    }
    // R7.4 leaf cards (follaje.ts): lobes = the faceted crown's own ellipsoid + its clumps (the branch tips lead into leaf masses); a species without
    // cards parks its four corners on its crown centre (zero area). Vertex order per card: the corners of UV_CARTA.
    const centroCopa: V3 = [f.copa.cx, f.copa.cy, f.copa.cz];
    if (CON_CARTAS[esp]) {
      const lobulos: Lobulo[] = [{ c: centroCopa, r: [f.copa.rx, f.copa.ry, f.copa.rz], peso: 0.4 }];
      f.matas.slice(0, nMatas).forEach(([ox, oy, oz, rx, ry, rz], i) => { const o = i < 3 ? puntas[i] : cen0; lobulos.push({ c: [o[0] + ox, o[1] + oy, o[2] + oz], r: [rx, ry, rz], peso: 0.6 / nMatas }); });
      const copa = copaDeCartas(lobulos, nCartas, 0x7c4 + e * 31);
      for (const k of copa.cartas) for (let q = 0; q < 4; q++) {
        if (e === 0) { esquina.set(k.esquinas[q], v * 2); uvs.set(UV_CARTA[q], v * 2); nesf.set(k.normales[q], v * 3); }
        put(k.c, k.ao[q], PARTE.carta, k.mov);
      }
    } else for (let q = 0; q < nCartas * 4; q++) put(centroCopa, 0.5, PARTE.carta, 0.5);
  });
  // indices: winding is decided on species 0 (encina) and shared by all species (every part stays a convex star around its centre)
  const m = new Malla(); m.pos = Array.from(pos[0]); m.idx = idx;
  const P0 = (i: number): V3 => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
  const centro = (ids: number[]): V3 => { const s: V3 = [0, 0, 0]; for (const i of ids) { const p = P0(i); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return [s[0] / ids.length, s[1] / ids.length, s[2] / ids.length]; };
  let o = 0;
  for (let s = 0; s < nSeg; s++) {
    const a = o + s * LU, b = a + LU, ref = centro([...Array(LADOS_TRONCO).keys()].flatMap((i) => [a + i, b + i]));
    for (let k = 0; k < LADOS_TRONCO; k++) { const k2 = k + 1; m.tri(a + k, a + k2, b + k, ref); m.tri(a + k2, b + k2, b + k, ref); }
  }
  o += LU * (nSeg + 1);
  if (detalle) {
    for (let i = 0; i < 3; i++) {
      const a = o + i * 6, ref = centro([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
      for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; m.tri(a + k, a + k2, a + 3 + k, ref); m.tri(a + k2, a + 3 + k2, a + 3 + k, ref); }
    }
    o += 18;
    { // collar band: two rings of 4 (+ the seam vertex each, E50)
      const ref = centro([...Array(LADOS_TRONCO).keys()].flatMap((i) => [o + i, o + LU + i]));
      for (let k = 0; k < LADOS_TRONCO; k++) { const k2 = k + 1; m.tri(o + k, o + k2, o + LU + k, ref); m.tri(o + k2, o + LU + k2, o + LU + k, ref); }
      o += 2 * LU;
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
  o += 12;
  // R7.4 cards: two triangles each, counter-clockwise toward the camera they face (not decided by `Malla.tri`: they turn with the view)
  for (let k = 0; k < nCartas; k++) for (const i of INDICES_CARTA) idx.push(o + k * 4 + i);
  // a species with cards collapses its faceted crown (clumps + icosahedron) to its crown centre, AFTER the shared winding was decided on it
  ESPECIES.forEach((esp, e) => { if (!CON_CARTAS[esp]) return; const f = FORMA[esp]; for (let i = vCopa; i < vCartas; i++) pos[e].set([f.copa.cx, f.copa.cy, f.copa.cz], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos[0], 3));
  for (let e = 1; e < ESPECIES.length; e++) g.setAttribute(`pos${e}`, new THREE.BufferAttribute(pos[e], 3));
  g.setAttribute("tono", new THREE.BufferAttribute(tono, 1));
  g.setAttribute("parte", new THREE.BufferAttribute(parte, 1));
  g.setAttribute("mov", new THREE.BufferAttribute(mov, 1));
  g.setAttribute("esquina", new THREE.BufferAttribute(esquina, 2));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setAttribute("nesf", new THREE.BufferAttribute(nesf, 3));
  g.setAttribute("obra", new THREE.BufferAttribute(formaObra(detalle, nv, nSeg, nMatas, nCartas), 4));
  // E50: the shader reads tono, parte and mov packed as ONE vec3 (`tpm`): with `uv` and `obra` read too, the near draw would bind 17 vertex
  // attributes (6 positions, tono, parte, mov, esquina, uv, nesf, obra + 4 instance vec4s) — WebGPU's default limit is 16. Packed: 15.
  const tpm = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) tpm.set([tono[i], parte[i], mov[i]], i * 3);
  g.setAttribute("tpm", new THREE.BufferAttribute(tpm, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, 0), 8);
  return (cacheArbol[clave] = { geometria: g, triangulos: idx.length / 3, bytes: bytesDe(g) });
}
/**
 * E50 · the tree-artwork («árbol-obra», work/naturaleza/MUNDO-PROYECTADO.md): ONE sculpture shape for every species, baked as a second position per
 * vertex of the SAME near template (`obra`, w = rol + 0.5 × glow), so a rare tree switches form in the shader: no new mesh, no new triangle.
 * Read as: a trunk that twists as it rises (the olive's spiral, `tors`, pushed to a quarter turn per segment), three arms that grip a vertical ring
 * (the five leaf clumps become the ring's five faceted segments) around a lens or a portal membrane (the crown's icosahedron, as a sphere or flattened
 * to a disc), and a crest of the species' own leaves (its cards). Shapes from the relics of work/naturaleza/referencias/hoja1 (Glido de Turing: the
 * ring-portal; Disco de Janus / Ojo de Kairós: the lens), the spiral and the vein from hoja2. COPIED: the vertex order and handedness of our own
 * clumps, crown and branch prisms (so the winding decided on species 0 still faces out: each part is mapped by a rotation, never a mirror); the idea
 * of «one template, a second shape per instance» is three r186 `examples/jsm/generators/ForestGenerator.js`' per-instance variety (MIT), pushed to a
 * whole alternative silhouette like the morph targets of `webgl_morphtargets` (MIT).
 */
export const OBRA = { cy: 3.7, R: 1.2, alto: 2.62, r0: 0.34, r1: 0.16, giro: 2.6, lente: 0.78, portal: [0.66, 0.66, 0.06] as V3, grosor: 0.14, cartas: 0.55 } as const;
function formaObra(detalle: boolean, nv: number, nSeg: number, nMatas: number, nCartas: number): Float32Array {
  const out = new Float32Array(nv * 4), LU = LADOS_TRONCO + 1, { cy, R, alto, r0, r1 } = OBRA;
  let v = 0;
  const put = (p: V3, rol: number, brillo = 0) => { out.set([p[0], p[1], p[2], rol + 0.5 * brillo], v * 4); v++; };
  const qq = (y: number) => Math.min(1, Math.max(0, y / alto));
  const giroDe = (q: number) => q * (detalle ? OBRA.giro : OBRA.giro * 0.5); // C/D: one segment, half the twist (the quads stay outward)
  const eje = (y: number): V3 => { const q = qq(y); return [0.08 * Math.sin(q * Math.PI), y, 0.05 * Math.sin(q * Math.PI * 2)]; };
  const rad = (y: number) => r0 + (r1 - r0) * qq(y);
  // the spiral trunk: the same rings (seam included), turned by height
  for (let s = 0; s <= nSeg; s++) {
    const y = s === 0 ? -0.05 : (alto * s) / nSeg, q = qq(y), c = eje(y), r = rad(y);
    for (let k = 0; k <= LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + giroDe(q); put([c[0] + Math.cos(a) * r, y, c[2] + Math.sin(a) * r], ROL_OBRA.tronco); }
  }
  const enAnillo = (ang: number, rr = R, z = 0): V3 => [Math.cos(ang) * rr, cy + Math.sin(ang) * rr, z];
  if (detalle) {
    // three arms (the branch prisms, same frame formula as geometriaArbol): two grip the ring's sides, the third climbs in front of it
    const brazos: [V3, V3, number][] = [[[0.02, 2.2, 0.02], enAnillo(-0.62, R, 0.1), 0.1], [[-0.02, 2.3, -0.02], enAnillo(Math.PI + 0.62, R, -0.1), 0.1], [[0.05, 1.5, 0.12], [0.3, cy + R * 0.98, 0.32], 0.085]];
    brazos.forEach(([base, tip, br], i) => {
      const ax = norm(sub(tip, base)), tt: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(tt, ax)), w = cross(ax, u);
      for (const [p, r] of [[base, br], [tip, br * 0.4]] as [V3, number][]) for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i, d: V3 = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)];
        put([p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], ROL_OBRA.rama);
      }
    });
    // the clasp where the trunk meets the ring (the band's two rings + seam), and the tag goes under the ground
    const y0 = alto - 0.3, q0 = qq(y0), rc = rad(y0) * 1.38 + 0.02;
    for (const y of [y0, y0 + 0.13]) { const c = eje(y); for (let k = 0; k <= LADOS_TRONCO; k++) { const a = ((k + 0.5) / LADOS_TRONCO) * Math.PI * 2 + giroDe(q0); put([c[0] + Math.cos(a) * rc, y, c[2] + Math.sin(a) * rc], ROL_OBRA.banda); } }
    for (let k = 0; k < 3; k++) put([0, -60, 0], ROL_OBRA.etiqueta);
  }
  // the ring: each clump (top, ring of 4, bottom) becomes one faceted segment; top → one end, bottom → the other, its ring of 4 → the section.
  // Basis (e1 radial, t along the segment, e2 = e1 × t) is a rotation of the clump's (x, y, z): the winding stays outward.
  for (let i = 0; i < nMatas; i++) {
    const fi = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / 5, a = enAnillo(fi - Math.PI / 5 - 0.03), b = enAnillo(fi + Math.PI / 5 + 0.03);
    const t = norm(sub(a, b)), e1: V3 = [Math.cos(fi), Math.sin(fi), 0], e2 = cross(e1, t), m = enAnillo(fi, R * 0.9), th = OBRA.grosor, giro = 0.5 + i * 1.3;
    put(a, ROL_OBRA.mata);
    for (let k = 0; k < 4; k++) { const ak = giro + (k / 4) * Math.PI * 2, c = Math.cos(ak) * th, s2 = Math.sin(ak) * th; put([m[0] + e1[0] * c + e2[0] * s2, m[1] + e1[1] * c + e2[1] * s2, m[2] + e1[2] * c + e2[2] * s2], ROL_OBRA.mata); }
    put(b, ROL_OBRA.mata);
  }
  // the lens / membrane: the crown's icosahedron as unit directions, poles on the ring's axis (z); the shader scales it to a sphere or a disc.
  // (x, y, z) → (x, −z, y) is a quarter turn about x: a rotation. Poles glow full, the rings a quarter (the disc's rim fades into brass).
  const g0 = 0.3;
  put([0, 0, 1], ROL_OBRA.copa, 1);
  for (let k = 0; k < 5; k++) { const a = g0 + (k / 5) * Math.PI * 2; put([0.894 * Math.cos(a), -0.894 * Math.sin(a), 0.447], ROL_OBRA.copa, 0.25); }
  for (let k = 0; k < 5; k++) { const a = g0 + ((k + 0.5) / 5) * Math.PI * 2; put([0.894 * Math.cos(a), -0.894 * Math.sin(a), -0.447], ROL_OBRA.copa, 0.25); }
  put([0, 0, -1], ROL_OBRA.copa, 1);
  // the crest: the species' leaf cards (Bruno's crown builder, follaje.ts) on the ring's top, its sides and the trunk's middle
  const lob: Lobulo[] = [{ c: [0, cy + R + 0.35, 0], r: [0.75, 0.32, 0.45], peso: 0.45 }, { c: [R * 0.98, cy + 0.15, 0], r: [0.42, 0.5, 0.4], peso: 0.15 },
    { c: [-R * 0.98, cy + 0.35, 0], r: [0.4, 0.45, 0.38], peso: 0.15 }, { c: [0.15, 1.7, 0.1], r: [0.5, 0.45, 0.5], peso: 0.2 }];
  for (const k of copaDeCartas(lob, nCartas, 0x0b7a, 0.7).cartas) for (let q = 0; q < 4; q++) put(k.c, ROL_OBRA.carta);
  if (v !== nv) throw new Error(`formaObra: ${v} vertices for a ${nv}-vertex template`);
  return out;
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
  pino: [5.4, 0.13, 6.15, 2.3, 0.55, 0], // E50: thin trunk, a flat wide umbrella
  cipres: [0.9, 0.2, 3.53, 0.7, 2.95, -0.58],
  olivo: [3.0, 0.16, 3.2, 1.6, 0.75, 0], // E50: a thin stem under the cluster of caps
  arbusto: [0.12, 0.06, 0.55, 1.0, 0.6, 0],
  sauce: [2.7, 0.25, 4.0, 2.1, 1.6, 0.3], // R6.3: ring raised (widest high); the shader drops 3 of its 5 ring vertices into hanging tips (CUELGA_LEJOS)
};
/** R6.3: how far (in blob radii y) the far willow's three low ring vertices hang below the ring: the curtains' tips at about 1 m. */
export const CUELGA_LEJOS = 2.2;
/** R6.3: the far willow's top apex comes down this much (blob radii y): a low round dome, not a point. */
export const TOPE_LEJOS = 0.35;
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
const INCLINA = [0.05, 0.09, 0.04, 0.07, 0, 0.05];
/** R6.3: the willow's dome underside (m): leaf vertices below it lean with the dome but hang plumb (curtains do not shear with the trunk). */
const PIE_SAUCE = 3.4;

type Inst = { a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute };
const instAttr = (n: number, k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };

/** Near LOD, all species: a = (x, y, z, escala) · b = (giro, fase, especie 0…4, tinte) · c = (dark leaf rgb, height m) · d = (light leaf rgb, E50 machine piece: PIEZA). */
/** The near template on the GPU: WebGPU allows 8 vertex buffers per draw by default and the template has 12 per-vertex attributes
 *  (+ 4 instance buffers = 16, so the pipeline failed and near trees were not drawn on WebGPU). The five other species' positions go
 *  into ONE interleaved buffer and the six small attributes into another: position + 2 + 4 instance = 7 buffers, same data, same
 *  shader (an interleaved attribute reads like a plain one). The CPU template (`geometriaArbol`) stays plain for tests and tools. */
export function entrelazarCerca(base: THREE.BufferGeometry, g: THREE.BufferGeometry): void {
  const n = base.getAttribute("position").count;
  const grupo = (claves: string[]) => {
    const tam = claves.map((k) => base.getAttribute(k).itemSize), paso = tam.reduce((a, b) => a + b, 0), datos = new Float32Array(n * paso);
    claves.forEach((k, j) => { const a = base.getAttribute(k).array as Float32Array, t = tam[j], o = tam.slice(0, j).reduce((x, y) => x + y, 0);
      for (let i = 0; i < n; i++) for (let c = 0; c < t; c++) datos[i * paso + o + c] = a[i * t + c]; });
    const buf = new THREE.InterleavedBuffer(datos, paso);
    claves.forEach((k, j) => g.setAttribute(k, new THREE.InterleavedBufferAttribute(buf, tam[j], tam.slice(0, j).reduce((x, y) => x + y, 0))));
  };
  g.setAttribute("position", base.getAttribute("position"));
  const especies = Object.keys(base.attributes).filter((k) => /^pos\d+$/.test(k)), resto = Object.keys(base.attributes).filter((k) => k !== "position" && !especies.includes(k));
  if (especies.length) grupo(especies);
  if (resto.length) grupo(resto);
}

type InstCerca = Inst & { c: THREE.InstancedBufferAttribute; d: THREE.InstancedBufferAttribute };
/** E50: the machine piece of a tree (instance d.w). Every tree but a shrub wears exactly one. */
export const PIEZA = { ninguna: 0, bronce: 1, hojalata: 2, neonTurquesa: 3, neonCoral: 4, obraPortal: 5, obraLente: 6 } as const;
/** E50: 0 by day … 1 at night, from the scene's hemisphere colour (entorno.ts lerps it to 0x33456e as the clock sun sets): the neon and the
 *  artwork's glow grow at night. One shared uniform, written by `actualizar` (one luminance per frame). */
export const nocheArbolesU = uniform(0);
/** Linear luminance of the day sky-ambient (0xbcd6ee) and of the night one (0x33456e): the night factor runs between them. */
const LUM_DIA = 0.62, LUM_NOCHE = 0.061;
export const nocheDeHemi = (c: { r: number; g: number; b: number }) => Math.min(1, Math.max(0, (LUM_DIA - (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b)) / (LUM_DIA - LUM_NOCHE)));
/** E50 emissive strength (×albedo of the vein / the glowing surface) by day and at night. Tuned on photos e50-*. */
export const BRILLO_NEON = { dia: 0.9, noche: 3.4 } as const, BRILLO_OBRA = { dia: 0.45, noche: 1.6 } as const;
/** E50 vein: turns of the helix over the trunk's height, its half width (in u, 0…1 around the trunk ≈ 1.5 cm on a 1.5 m girth). */
export const VENA = { vueltas: 1.15, ancho: 0.011 } as const;
/** E50 fragment codes packed in the colour varying's w (integer part; fraction = phase / glow): no new varying. */
const COD = { tronco: 0, banda: 5, brillo: 7, espiral: 8 } as const;
/**
 * E50 fragment patterns of the machine pieces, from ONE packed varying (rgb = the vertex colour, w = code + fraction, see COD) and the template's
 * `uv` (u around the trunk / band, v up). Everything is masks of steps (no branch): every tree fragment pays a few ALU ops, nothing else.
 *  - neon vein (codes 3/4, on the trunk): a helix line `fract(u − v·turns + phase)` with a small wobble, anti-aliased by its screen derivative and
 *    energy-conserving when thinner than a pixel (Ben Golus, «The Best Darn Grid Shader (Yet)», 2023, technique: the line widens to ~1 px and its
 *    intensity drops by the same factor, so a far vein fades instead of turning into a neon wash). Emissive grows at night and pulses up the trunk.
 *  - bronze clamp (5): two rings with a dark joint between them and a verdigris lip at the bottom edge.
 *  - tin strap (6): a row of rivets (two per facet) and rolled, lighter edges.
 *  - painted band (codes 1/2 on the trunk, tiers C/D only, where the template has no band): the cheapest readable clamp/strap, in the bark's colour.
 *  - glow (7): the artwork's lens / membrane and the vein's chip light themselves (× glow fraction), more at night.
 */
function detallesFragmento(base: V3N, w: N, t: N, pintaBanda: boolean): { color: V3N; emisivo: V3N } {
  const MA = MAQUINA_ARBOL, col3 = (h: number | string) => { const k = C(h as never); return vec3(k.r, k.g, k.b) as unknown as V3N; };
  const k = floor(w) as N, f = clamp(fract(w).sub(0.05).div(0.9), 0, 1) as N;
  const esK = (n: number) => step(n - 0.5, k).mul(step(k, n + 0.5)) as N;
  const uvF = uvNodo() as unknown as { x: N; y: N }, u = uvF.x, v = uvF.y;
  const noche = nocheArbolesU as unknown as N;
  // the vein
  const esVena = esK(PIEZA.neonTurquesa).add(esK(PIEZA.neonCoral)) as N;
  const s = u.sub(v.mul(VENA.vueltas)).add(f).add(sin(v.mul(19).add(f.mul(6.283))).mul(0.035)) as N;
  const d = abs(fract(s.add(0.5)).sub(0.5)) as N, anchoE = max(float(VENA.ancho), fwidth(s).mul(0.75)) as N;
  const linea = oneMinus(smoothstep(anchoE.mul(0.45), anchoE, d)).mul(float(VENA.ancho).div(anchoE)).mul(esVena) as N;
  const pulso = mix(float(1), sin(t.mul(2.2).sub(v.mul(9)).add(f.mul(6.283))).mul(0.4).add(0.6), noche) as N;
  const neon = mix(col3(MA.neonTurquesa), col3(MA.neonCoral), esK(PIEZA.neonCoral)) as unknown as V3N;
  let color = mix(base, neon, linea.mul(0.9)) as unknown as V3N;
  // the bronze clamp: joint and verdigris
  const bronce = esK(COD.banda) as N, lata = esK(COD.banda + 1) as N;
  const junta = smoothstep(0.36, 0.42, v).mul(oneMinus(smoothstep(0.58, 0.64, v))) as N, lip = oneMinus(smoothstep(0.0, 0.2, v)) as N;
  color = mix(mix(color, color.mul(0.45), junta.mul(bronce)), col3(MA.verdin), lip.mul(bronce).mul(0.55)) as unknown as V3N;
  // the tin strap: rivets and rolled edges
  // two rows of rivets (three per facet), as on a riveted boiler strap; cells in metres (facet ≈ 0.34 m wide, strap ≈ 0.25 m tall)
  const riv = oneMinus(smoothstep(0.011, 0.017, length(vec2(fract(u.mul(12)).sub(0.5).mul(0.113), fract(v.mul(2)).sub(0.5).mul(0.125))))) as N;
  const borde = max(oneMinus(smoothstep(0.0, 0.12, v)), smoothstep(0.88, 1.0, v)) as N;
  color = mix(mix(color, color.mul(1.18), borde.mul(lata)), col3(MA.remache), riv.mul(lata)) as unknown as V3N;
  if (pintaBanda) { // C/D: the clamp / strap painted on the bark (a band at 20–29 % of the trunk; bronze shows its joint)
    const pinta = esK(PIEZA.bronce).add(esK(PIEZA.hojalata)) as N, aa = fwidth(v).mul(0.7) as N;
    const m = smoothstep(float(0.2).sub(aa), float(0.2).add(aa), v).mul(oneMinus(smoothstep(float(0.29).sub(aa), float(0.29).add(aa), v))) as N;
    const gap = smoothstep(0.237, 0.243, v).mul(oneMinus(smoothstep(0.247, 0.253, v))).mul(esK(PIEZA.bronce)) as N;
    const metal = mix(col3(MA.bronce), col3(MA.hojalata), esK(PIEZA.hojalata)) as unknown as V3N;
    color = mix(color, metal.mul(oneMinus(gap.mul(0.55))).mul(1.25), m.mul(pinta)) as unknown as V3N;
  }
  // the portal artwork's trunk: a brass inlay that spirals up with the twist (half a turn more than the bark's), wide enough to read from afar
  const sE = u.sub(v.mul(0.6)) as N, dE = abs(fract(sE.mul(2).add(0.5)).sub(0.5)) as N, aaE = fwidth(sE.mul(2)).mul(0.7) as N;
  const espiral = oneMinus(smoothstep(float(0.11).sub(aaE), float(0.11).add(aaE), dE)).mul(esK(COD.espiral)) as N;
  color = mix(color, col3(MA.laton).mul(1.15), espiral) as unknown as V3N;
  const brillo = esK(COD.brillo).mul(f) as N;
  const emisivo = neon.mul(linea.mul(pulso).mul(mix(float(BRILLO_NEON.dia), float(BRILLO_NEON.noche), noche))).add(base.mul(brillo.mul(mix(float(BRILLO_OBRA.dia), float(BRILLO_OBRA.noche), noche)))) as unknown as V3N;
  return { color, emisivo };
}

function materialCerca(c: Comunes, aletea: boolean, inst: InstCerca, detalleTpl = true): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  mat.name = "arbol-cerca";
  const ia = instancedBufferAttribute(inst.a) as unknown as { xyz: V3N; w: N }, ib = instancedBufferAttribute(inst.b) as unknown as { x: N; y: N; z: N; w: N };
  const ic = instancedBufferAttribute(inst.c) as unknown as { xyz: V3N; w: N }, id = instancedBufferAttribute(inst.d) as unknown as { xyz: V3N; w: N };
  const giro = ib.x, fase = ib.y, sp = ib.z, tinte = ib.w, esc = ia.w, H = ic.w, flag = id.w;
  const tpm = attribute("tpm", "vec3") as unknown as { x: N; y: N; z: N }; // E50: (tono, parte, mov) in one attribute (see geometriaArbol)
  const parte = tpm.y, tono = tpm.x, mov = tpm.z, q = (k: string) => attribute(k, "vec3") as unknown as V3N;
  // E50: the machine piece (PIEZA) and the tree-artwork. `es(k)` = the flag is k; every mask is a step product (no branch, mobile-friendly).
  const es = (k: number) => step(k - 0.5, flag).mul(step(flag, k + 0.5)) as N;
  const esObra = step(PIEZA.obraPortal - 0.5, flag) as N, esLente = es(PIEZA.obraLente), esTin = es(PIEZA.hojalata), esNeon = es(PIEZA.neonTurquesa).add(es(PIEZA.neonCoral)) as N;
  const ob = attribute("obra", "vec4") as unknown as { xyz: V3N; w: N; x: N; y: N; z: N }, rol = floor(ob.w) as N, brilloV = fract(ob.w).mul(2) as N;
  const esRol = (k: number) => step(k - 0.5, rol).mul(step(rol, k + 0.5)) as N;
  const uvA = attribute("uv", "vec2") as unknown as { x: N; y: N };
  const esHoja0 = step(0.5, parte).mul(oneMinus(step(1.5, parte))) as N, esMetal = step(1.5, parte).mul(oneMinus(step(3.5, parte))) as N;
  const esBanda = step(1.5, parte).mul(oneMinus(step(2.5, parte))) as N, esTag = step(2.5, parte).mul(oneMinus(step(3.5, parte))) as N;
  const esHoja = esHoja0.mul(oneMinus(esObra)) as N; // on an artwork the faceted crown is brass and glass, not leaves
  // R7.4: a leaf card of a species that wears cards (the others' cards are parked at a point: their expansion stays 0, nothing is drawn); E50: an artwork wears its crest
  const esCarta = step(3.5, parte).mul(max(porEsp(sp, ESPECIES.map((e) => float(CON_CARTAS[e] ? 1 : 0))), esObra)) as N;
  let p0 = positionGeometry as unknown as V3N;
  for (let i = 1; i < ESPECIES.length; i++) p0 = mix(p0, q(`pos${i}`), step(i - 0.5, sp)) as unknown as V3N;
  // R5.4 cypress: ±8 % height per tree (from its phase), a lean that bows (none at the foot, most at the tip), sway and tone by height
  const esCip = step(1.5, sp).mul(oneMinus(step(2.5, sp))).mul(oneMinus(esObra)) as N;
  p0 = vec3(p0.x, p0.y.mul(esCip.mul(sin(fase.mul(3.7)).mul(0.08)).add(1)), p0.z) as unknown as V3N;
  // E50 tin strap: the band's upper ring rises (a taller strap than the bronze clamp)
  p0 = p0.add(vec3(0, uvA.y.mul(esBanda).mul(esTin).mul(0.12), 0)) as unknown as V3N;
  // E50 artwork: the second shape. The icosahedron's unit directions become a lens (sphere) or a portal membrane (a disc in the ring)
  const escCopa = mix(vec3(...OBRA.portal), vec3(OBRA.lente, OBRA.lente, OBRA.lente), esLente) as unknown as V3N;
  const pCopa = vec3(0, OBRA.cy, 0).add(ob.xyz.mul(escCopa)) as unknown as V3N;
  p0 = mix(p0, mix(ob.xyz, pCopa, esRol(ROL_OBRA.copa)), esObra) as unknown as V3N;
  const hRel = clamp(p0.y.div(H), 0, 1) as N;
  const esSau = step(4.5, sp) as N, sauHoja = esSau.mul(esHoja) as N; // R6.3 willow
  // lean: the trunk shears toward a per-tree azimuth (from its phase), by a per-species amount
  const inclina = vec2(sin(fase.mul(1.7)), cos(fase.mul(1.3))).mul(porEsp(sp, INCLINA.map((v) => float(v))).mul(tinte.mul(0.65).add(0.35))).mul(esCip.mul(hRel.mul(1.5).sub(1)).add(1)) as unknown as ReturnType<typeof vec2>;
  // E50: the band shows on bronze and tin, the tag on every piece but none (on neon it is the vein's glowing chip); the rest goes under the ground
  const tieneBanda = es(PIEZA.bronce).add(esTin) as N, tieneTag = step(0.5, flag).mul(oneMinus(esObra)) as N;
  const oculto = esBanda.mul(oneMinus(tieneBanda)).add(esTag.mul(oneMinus(tieneTag))).mul(oneMinus(esObra)) as N;
  const yInc = mix(p0.y, max(p0.y, float(PIE_SAUCE)), sauHoja) as N; // willow curtains: shifted with the dome, never sheared
  let local = p0.add(vec3(inclina.x.mul(yInc), oculto.mul(-60), inclina.y.mul(yInc))) as unknown as V3N;
  if (aletea) { // leaves flutter: a small, fast wobble, phased per vertex, on leaf vertices only
    const t = c.tiempo as unknown as N, fuerza = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N;
    const f1 = sin(t.mul(6.5).add(p0.x.mul(9)).add(p0.z.mul(7)).add(fase)) as N;
    const a = fuerza.mul(0.008).add(0.008).mul(esHoja) as N;
    local = local.add(vec3(f1, sin(t.mul(9.7).add(p0.y.mul(11)).add(p0.x.mul(5))), cos(t.mul(8.3).add(p0.x.mul(11)).add(p0.z.mul(3)))).mul(a)) as unknown as V3N;
  }
  // branches and leaf clumps sway on their own, more at the tips (`mov` 0 at a branch root … 1 at its tip), on top of the whole-tree lean
  const tt = c.tiempo as unknown as N, vel = (c.vientoU as unknown as V3N).xz.add(BRISA) as unknown as ReturnType<typeof vec2>, fz = length(vel) as N, dr = vel.div(fz) as unknown as ReturnType<typeof vec2>;
  const cuelga = clamp(float(0.66).sub(hRel).mul(1.7), 0, 1) as N; // R6.3: 0 at the willow's dome … 1 at a curtain's tip
  const movE = mix(mix(mov, hRel.mul(0.9), esCip), max(mov.mul(0.6), cuelga), sauHoja) as N; // the cypress sways as one body; the willow's curtains swing most at their tips
  const punta = movE.mul(movE).mul(fz.mul(0.05).add(0.09)).mul(esc) as N;
  const ph = tt.mul(1.9).add(fase).add(p0.x.mul(2.3).add(p0.z.mul(1.7)).mul(oneMinus(esCip))) as N; // … and in one phase (its shells do not drift apart)
  const bal = vec3(dr.x.mul(sin(ph)).sub(dr.y.mul(cos(ph.mul(0.7))).mul(0.4)), sin(ph.mul(1.3)).mul(0.25), dr.y.mul(sin(ph)).add(dr.x.mul(cos(ph.mul(0.7))).mul(0.4))).mul(punta) as unknown as V3N;
  // R7.4: a card's corners open along the camera's right/up around its swaying centre (follaje.ts `esquinaHaciaCamara`)
  const abre = esquinaHaciaCamara(attribute("esquina", "vec2") as unknown as ReturnType<typeof vec2>).mul(esc.mul(esCarta).mul(mix(float(1), float(OBRA.cartas), esObra)));
  const mueve = mix(float(1), esRol(ROL_OBRA.carta), esObra) as N; // an artwork does not sway (bronze and glass); its leaves do
  mat.positionNode = girar(local, giro).mul(esc).add(ia.xyz).add(empuje(c, p0.y.div(H), esc.mul(H), movE.mul(0.7), fase).add(bal).mul(mueve)).add(abre);
  const col3 = (k: THREE.Color) => vec3(k.r, k.g, k.b) as unknown as V3N;
  const troncoO = porEsp(sp, TRONCOS.map((h) => col3(C(h)))), troncoC = mix(troncoO, col3(C(CASA.ceniza)), 0.5) as unknown as V3N;
  const tronco = mix(troncoO, troncoC, tono) as unknown as V3N;
  const tonoW = max(clamp(hRel.sub(0.72).mul(3.6), 0, 1), cuelga.mul(cuelga).mul(0.95)).mul(0.85).add(0.1) as N; // willow: dark under the dome → light dome top and light curtain tips
  // E50 caps (pino, olivo): the underside (bottom vertex, rim) falls to the garnet gills, the dome to the ochre/gold top
  const esSeta = porEsp(sp, ESPECIES.map((e) => float(FORMA[e].seta ? 1 : 0))).mul(oneMinus(esObra)) as N;
  const tonoH = mix(mix(mix(tono.mul(0.7).add(0.3), hRel.mul(0.75).add(0.12).add(tono.mul(0.13)), esCip), tonoW, esSau), smoothstep(0.25, 0.85, tono), esSeta) as N; // cypress: dark foot → lighter, warmer sunlit top
  const hoja = mix(ic.xyz, id.xyz, tonoH).mul(mix(float(1.4), float(1.05), esSeta)) as unknown as V3N; // the house greens are deep: lift them so the crowns read under the morning light (the warm caps need no lift)
  // E50 metals (paleta.ts MAQUINA_ARBOL): the clamp is bronze (a coppery one on a quarter of the trees, the old collar's copper), the strap tin;
  // the tag is a brass plate, a tin rivet plate, or — on a neon tree — the vein's chip in its own colour
  const MA = MAQUINA_ARBOL;
  const bronce = mix(col3(C(MA.bronce)), col3(C(MAQUINA.cobre)), step(0.75, tinte)) as unknown as V3N;
  const neonV = mix(col3(C(MA.neonTurquesa)), col3(C(MA.neonCoral)), es(PIEZA.neonCoral)) as unknown as V3N;
  const banda = mix(bronce, col3(C(MA.hojalata)), esTin) as unknown as V3N;
  const tag = mix(mix(col3(C(MA.placa)), col3(C(MA.remache)), esTin), neonV, esNeon) as unknown as V3N;
  const metalN = mix(banda, tag, esTag) as unknown as V3N;
  // the artwork: bark that turns to bronze as it rises, brass arms toward their tips, a bronze clasp, a brass ring, a lens that glows turquoise or a
  // membrane that glows amber (the Glido de Turing's light), its leaves the species' own
  const latonO = col3(C(MA.laton)), brilloCol = mix(col3(C(MA.ambar)), col3(C(MA.lente)), esLente) as unknown as V3N;
  const obraCol = mix(mix(mix(mix(col3(C(MA.corteza)), latonO, hRel.mul(0.55)), mix(col3(C(MA.corteza)), latonO, mov.mul(0.8).add(0.2)), esRol(ROL_OBRA.rama)), col3(C(MA.bronce)), esRol(ROL_OBRA.banda)),
    mix(latonO, brilloCol, max(brilloV, esLente.mul(esRol(ROL_OBRA.copa)))), esRol(ROL_OBRA.mata).add(esRol(ROL_OBRA.copa))) as unknown as V3N;
  const metal = metalN;
  const ao = clamp(p0.y.div(H), 0, 1).mul(0.1).add(0.9) as N; // fake ambient occlusion: a little darker toward the ground
  // R7.4 card colour (per vertex): Bruno's two tones by N·L on the spherical normal (Foliage.js `mix(colorA, colorB, smoothstep(0, 1, n·l))`) and
  // ForestGenerator's `deep → bright` by the baked occlusion (`tono` on a card: dark inside/below … lit rim/top), both from the instance's palette pair
  const nW = normalize(girar(attribute("nesf", "vec3") as unknown as V3N, giro)) as unknown as V3N;
  const luz = smoothstep(0, 1, dotN(nW, solDirU as unknown as V3N)) as N;
  const hojaCarta = mix(ic.xyz, id.xyz, clamp(luz.mul(0.5).add(tono.mul(0.5)).add(0.05), 0, 1)).mul(tono.mul(0.35).add(0.75)).mul(1.3) as unknown as V3N;
  // WebGPU allows 16 inter-stage variables: the whole colour is per-vertex data, so it crosses as ONE varying (read in the fragment it pulled
  // every attribute it touches across one by one: 6 species positions, 4 instance vec4s, tono, parte… = more than 16, the pipeline failed)
  // E50: the obra's colours replace the tree's (its cards keep the leaf colour); `ao`/tint/lift as before
  const colArbol = mix(mix(mix(tronco, hoja, esHoja), metal, esMetal.mul(oneMinus(esObra))), obraCol, oneMinus(esCarta).mul(esObra)) as unknown as V3N;
  const colV = mix(colArbol, hojaCarta, esCarta).mul(ao).mul(tinte.mul(0.16).add(0.92)).mul(1.25) as unknown as V3N;
  // E50 fragment code (see COD): trunk (bark of a plain tree, or of the lens artwork) = piece + phase; band = 5 + tin; glowing surface = 7 + glow.
  // The integer part says which fragment pattern runs; offsets 0.05…0.95 keep `floor` safe under interpolation (every vertex of a triangle shares it).
  const fasePieza = fract(fase.mul(0.159155)) as N; // the tree's own phase, 0…1
  const esTronco = oneMinus(step(0.5, parte)).mul(esRol(ROL_OBRA.tronco)) as N; // the trunk's rings (rol 0 in every tree; branches are rol 1)
  const codTronco = mix(flag, mix(float(COD.espiral), float(PIEZA.neonTurquesa), esLente), esObra) as N; // artwork trunk: brass spiral (portal) or the vein (lens)
  const codBanda = float(COD.banda).add(esTin.mul(oneMinus(esObra))) as N;
  const esBrillo = mix(esTag.mul(esNeon), esRol(ROL_OBRA.copa), esObra) as N;
  const brilloF = mix(float(1), max(brilloV, esLente), esObra) as N; // the lens glows whole, the membrane from its centre
  const w = esTronco.mul(codTronco.add(0.05).add(fasePieza.mul(0.9))).add(esBanda.mul(min(tieneBanda.add(esObra), 1)).mul(codBanda.add(0.5))).add(esBrillo.mul(float(COD.brillo).add(0.05).add(brilloF.mul(0.9)))) as N;
  const cv = varying(vec4(colV, w)) as unknown as { rgb: V3N; w: N };
  const fx = detallesFragmento(cv.rgb, cv.w, c.tiempo as unknown as N, !detalleTpl);
  mat.colorNode = fx.color;
  // R7.4 leaf flutter (Foliage.js: the alpha rotates in its card by the wind's strength; vertices do not move): a small turn, phased per card
  const fzU = length((c.vientoU as unknown as V3N).xz.add(BRISA)) as N, tU = c.tiempo as unknown as N;
  const giroV = aletea ? sin(tU.mul(2.7).add(fase).add(p0.x.mul(3.1)).add(p0.z.mul(2.3)).add(p0.y.mul(1.7))).mul(fzU.mul(0.05).add(0.12)).add(sin(tU.mul(0.9).add(p0.x.mul(1.3))).mul(0.15)) as N : float(0);
  // the per-vertex scalars the fragment needs, packed in one varying: leaf mask, card mask, the spherical normal's height, the card's flutter turn
  const marca = varying(vec4(esHoja, esCarta, nW.y, giroV)) as unknown as { x: N; y: N; z: N; w: N };
  const giroHoja = aletea ? marca.w : float(0), esHojaF = marca.x, esCartaF = marca.y;
  mat.alphaToCoverage = true; // three wires it only where the target has samples; `coberturaHojas` falls back to an alpha test elsewhere
  mat.opacityNode = coberturaHojas(mix(float(-1), distanciaHojas(giroHoja), esCartaF) as N);
  // faces still read flat, but a leaf's normal leans toward the sky (the sunless side of a crown no longer goes black): flat + up × (0.15 bark … 0.65 leaf)
  const nFacetas = (normalFlat as unknown as V3N).mul(0.75).add((transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(esHojaF.mul(0.65).add(0.3))); // 0.75 × flat so a face pointing straight down does not cancel to nothing (that read black)
  const nCarta = varying(transformNormalToView(nW)) as unknown as V3N; // R7.4: Bruno's spherical normal: the crown lights as one soft volume
  mat.normalNode = normalize(mix(nFacetas, nCarta, esCartaF));
  const arribaFacetas = clamp(dotN(normalFlat as unknown as V3N, transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(0.5).add(0.5), 0, 1);
  mat.emissiveNode = nodoRelleno(mix(arribaFacetas, marca.z.mul(0.5).add(0.5), esCartaF) as N).add(fx.emisivo); // R5.1: the shade fill (relleno.ts): the sunless side of trunks and branches reads sea-green, not black; E50: + neon / glow
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
  const s1 = step(0.5, parte) as N;
  // R6.3 willow: the ring's three low vertices (y < 0) hang down into curtain tips (a little inward), the bottom apex rises under the ring
  const esSau = step(4.5, ib.w) as N, anillo = s1.mul(oneMinus(step(0.5, abs(q.y)))) as N, cuelga = esSau.mul(anillo).mul(step(q.y, 0)) as N;
  const qy = q.y.add(id.y.mul(oneMinus(q.y.mul(q.y)))).sub(cuelga.mul(CUELGA_LEJOS)).add(esSau.mul(s1).mul(step(q.y, -0.5)).mul(0.6)).sub(esSau.mul(s1).mul(step(0.5, q.y)).mul(TOPE_LEJOS)) as N; // R5.4: the ring moves by the per-species shift, the apexes (|y| ≈ 1) barely
  const rx = ic.w.mul(oneMinus(cuelga.mul(0.1))) as N;
  const tronco = vec3(q.x.mul(ic.y), q.y.mul(ic.x), q.z.mul(ic.y)), copa = vec3(q.x.mul(rx), ic.z.add(qy.mul(id.x)), q.z.mul(rx));
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
export type EstadisticasArboles = { cerca: number[]; lejos: number; arboles: number; triangulos: number; llamadas: number; bytesGeometria: number; bytesInstancias: number; collares?: number; piezas?: number[] };

const REPARTO_S = 0.25;      // the near/far split runs at most this often (s) …
const REPARTO_M = 1.5;       // … and only if the camera moved this far (m) since the last one
const CAJAS = 64;
const COLOR_LEJOS = ESPECIES.map((e) => [0, 1].map((v) => { const c = C(mezcla(HOJAS[e][v].oscuro, HOJAS[e][v].claro, e === "sauce" ? 0.45 : 0.65)); return [c.r * 1.4, c.g * 1.4, c.b * 1.4]; }));
const FLOATS = 11; // per tree: x, y, z, scale, yaw, phase, variant, tint, species, machine piece (E50, PIEZA), regional tone (−1…1)
/** R7.4: per-instance regional colour drift, baked from a low-frequency noise of the position (ForestGenerator r186 `region`, MIT: «so the vertex-bound
 *  shader taps no noise»); a quarter of it stays per-tree, so neighbours still differ a little. */
export function tonoRegional(x: number, z: number, azar: number): number {
  const r = Math.max(-1, Math.min(1, (valor2(0x7a, x * 0.03, z * 0.03) * 2 - 1) * 1.6));
  return 0.75 * r + 0.25 * (azar * 2 - 1);
}
/** E50: share of the trees (not shrubs) that are a tree-artwork, about 1 in 30. */
export const OBRA_PROB = 1 / 30;
/**
 * E50: the machine piece every tree wears (MUNDO-PROYECTADO.md: «cada árbol lleva su pieza de máquina»), from its position only. Pieces cluster by
 * district (a low-frequency value noise, like `tonoRegional`): the solarpunk garden ties its trees with bronze, the steampunk moor straps them with
 * tin, the cyberpunk shore runs a neon vein up the bark — about 40 / 40 / 20 over the land, with a minority of the other two in every district
 * (Pablo: «todo está muy mezclado»). Willows stand by the water: mostly neon. Neon is turquoise, a third coral. Shrubs wear nothing.
 */
export function piezaDeArbol(x: number, z: number, especie: Especie | string): number {
  if (especie === "arbusto") return PIEZA.ninguna;
  const ix = Math.round(x * 16), iz = Math.round(z * 16);
  if (hash2(0x67, ix, iz) < OBRA_PROB) return hash2(0x68, ix, iz) < 0.5 ? PIEZA.obraPortal : PIEZA.obraLente;
  const r = Math.min(1, Math.max(0, (valor2(0x5e, x * 0.025, z * 0.025) - 0.5) * 2.2 + 0.5)), h = hash2(0x64, ix, iz);
  const [pb, pt] = especie === "sauce" ? [0.15, 0.15] : r < 0.42 ? [0.72, 0.14] : r < 0.8 ? [0.14, 0.72] : [0.16, 0.16];
  const neon = hash2(0x66, ix, iz) < 0.67 ? PIEZA.neonTurquesa : PIEZA.neonCoral;
  return h < pb ? PIEZA.bronce : h < pb + pt ? PIEZA.hojalata : neon;
}

export function crearArboles(h: HArboles, puntos: readonly PuntoArbol[]) {
  const cfg = NATURALEZA_POR_NIVEL[h.nivel];
  const tiempo = uniform(0), comunes: Comunes = { tiempo: tiempo as unknown as { value: number }, vientoU: h.vientoU };
  // ---- the trees as one typed array, with a per-tree phase, variant, tint, size (±8 %) and collar that depend only on the position ----
  const total = puntos.length, datos = new Float32Array(total * FLOATS), cuentaEsp = ESPECIES.map(() => 0);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  puntos.forEach((p, i) => {
    const e0 = ESPECIES.indexOf(p.especie as Especie), e = e0 < 0 ? 0 : e0;
    const ix = Math.round(p.x * 16), iz = Math.round(p.z * 16), v = p.variante ?? (hash2(0x61, ix, iz) < 0.8 ? 0 : 1), o = i * FLOATS;
    const collar = piezaDeArbol(p.x, p.z, ESPECIES[e]); // E50: the machine piece (PIEZA)
    datos.set([p.x, p.y, p.z, p.escala * (1 + 0.08 * (hash2(0x65, ix, iz) * 2 - 1)), p.giro, hash2(0x62, ix, iz) * 6.2832, v, hash2(0x63, ix, iz), e, collar, tonoRegional(p.x, p.z, hash2(0x63, ix, iz))], o); cuentaEsp[e]++;
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
    entrelazarCerca(base, g);
    g.setIndex(base.index); g.instanceCount = 0; g.boundingSphere = esfera.clone();
    const mat = materialCerca(comunes, cfg.arbolesAletean, inst, cfg.arbolesDetalle), mesh = new THREE.Mesh(g, mat);
    mesh.name = "arboles-cerca"; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.sinSombra = true;
    grupo.add(mesh); mallas.push(mesh); geos.push(g); mats.push(mat);
    return { inst, g, mesh, cuenta: 0, cap: capCerca, porEspecie: ESPECIES.map(() => 0), collares: 0, piezas: [0, 0, 0, 0, 0, 0, 0] };
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
    cerca.cuenta = 0; cerca.porEspecie.fill(0); cerca.collares = 0; cerca.piezas.fill(0);
    if (lejos) lejos.cuenta = 0;
    const A = cerca.inst.a.array as Float32Array, B = cerca.inst.b.array as Float32Array, Cc = cerca.inst.c.array as Float32Array, D = cerca.inst.d.array as Float32Array;
    for (let o = 0, i = 0; o < total; o++, i += FLOATS) {
      const r = dist[o], e = datos[i + 8], v = datos[i + 6];
      if (r < rN && cerca.cuenta < cerca.cap) {
        const k = cerca.cuenta++, hj = tonos(ESPECIES[e], v, datos[i + 10]);
        cerca.porEspecie[e]++; if (datos[i + 9] > 0) cerca.collares++; cerca.piezas[datos[i + 9]]++;
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
  let raizVista: THREE.Object3D | null = null, hemi: THREE.HemisphereLight | null = null;
  function actualizar(t: number, desde?: THREE.Vector3) {
    tiempo.value = t;
    // E50: the night factor from the scene's own hemisphere (entorno's, a direct child of the scene), found once per scene
    let raiz: THREE.Object3D = grupo; while (raiz.parent) raiz = raiz.parent;
    if (raiz !== raizVista) { raizVista = raiz; hemi = null; for (const o of raiz.children) if (!hemi && (o as THREE.HemisphereLight).isHemisphereLight) hemi = o as THREE.HemisphereLight; }
    if (hemi) nocheArbolesU.value = nocheDeHemi(hemi.color);
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
    return { cerca: cerca.porEspecie.slice(), lejos: lejos?.cuenta ?? 0, arboles: cercaUltimo + lejosUltimo, triangulos: tris, llamadas: mallas.filter((m) => m.visible).length, bytesGeometria, bytesInstancias: bi, collares: cerca.collares, piezas: cerca.piezas.slice() };
  }
  function dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); grupo.removeFromParent(); }

  return { grupo, mallas, actualizar, repartir, estadisticas, dispose, tiempo: comunes.tiempo };
}
export type Arboles = ReturnType<typeof crearArboles>;
