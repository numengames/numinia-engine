// terreno (naturaleza N1): seeded relief with five zones, as a pure height/zone function plus ONE mesh (one draw call).
//
// `alturaEn(semilla, x, z)` and `zonaEn(semilla, x, z)` are pure: the same seed gives the same hills on a phone, on the
// server (collision, spawn scatter) and in a test. `crearTerreno(h)` samples them on a grid (cells per side by device tier,
// calidad.ts levels) and builds a single non-indexed BufferGeometry: flat normals (faceted look), a colour per vertex that
// blends the zones softly and darkens in the valleys (free fake ambient occlusion), no texture, no light of its own.
//
// COPIED (ideas and technique, no assets, no code): Red Blob Games «Making maps with noise» (elevation + moisture-like masks
// choose the biome), Inigo Quilez «fbm» and «morenoise» (ridged detail on a mask), his smooth-max trick to lift basins.
// Flat shading + per-vertex colours in a tight palette is the common low-poly look (Zelda BotW / Kenney / Quaternius style).
// CHANGED: everything is a function of an integer seed (semilla.ts); a `plaza` disc is forced flat (the spawn stays
// walkable); a pond basin is carved at a seed-chosen place with a sand belt around it; the outer border fades to the fog
// colour and drops into a skirt so there is no visible edge.
import * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import { hash2, valor2, simplex2 } from "./semilla.ts";
import { CASA, VERDES, ESTACIONES, mezcla } from "./paleta.ts";
import type { Estacion } from "./paleta.ts";

import { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe, campo, sstep } from "../../../relieve/src/relieve.ts";
import type { Zona, OpcionesRelieve } from "../../../relieve/src/relieve.ts";
export { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe };
export type { Zona, OpcionesRelieve };
const TAMANO = 200, PLAZA = 12, AGUA = NIVEL_AGUA;

/** Grid cells per side by device tier (A desktop · B Quest · C mid phone · D old phone). Triangles = 2·n² + skirt (8·n). */
export const CELDAS_TERRENO: Record<Nivel, number> = { A: 40, B: 28, C: 24, D: 16 };

export type OpcionesTerreno = {
  semilla: number;
  /** Device tier (calidad.ts); picks the grid resolution. Default "A". */
  nivel?: Nivel;
  /** World side in metres (default 200). */
  tamano?: number;
  /** Radius (m) kept almost flat at the origin (default 12). */
  plaza?: number;
  /** Colour (hex) the outer border fades to; use the scene's fog colour (default 0xbcd6ee). */
  niebla?: number;
  /** Add the mesh to this parent (scene or group); dispose() removes it. */
  escena?: THREE.Object3D;
  /** N4: no pond (see OpcionesRelieve.sinEstanque). */
  sinEstanque?: boolean;
  /** N4: colours (hex) over the house palette, per zone: the world's palette (verano / otoño / primavera) changes the meadow only. */
  colores?: Partial<Record<Zona, number>>;
  /** N4: draw the mesh with shadows from the sun (tier A only: the caller decides). */
  recibeSombra?: boolean;
  /** N6: paint the pond into the terrain mesh as a flat disc of `LADOS_AGUA_PLANA` triangles (colour hex) instead of a separate water mesh: one draw call less (tier D). */
  aguaPlana?: number;
};
/** Triangles of the painted pond (a fan). */
export const LADOS_AGUA_PLANA = 14;
export type Terreno = {
  malla: THREE.Mesh;
  alturaEn: (x: number, z: number) => number;
  zonaEn: (x: number, z: number) => Zona;
  estanque: { x: number; z: number; radio: number; nivel: number };
  /** Triangles and vertices of the mesh (draw calls: 1). */
  triangulos: number; vertices: number;
  dispose: () => void;
};

/** Number of triangles of a terrain with `n` cells per side: the grid plus a four-sided skirt. */
export const triangulosDeTerreno = (n: number, aguaPlana = false) => 2 * n * n + 8 * n + (aguaPlana ? LADOS_AGUA_PLANA : 0);

/** R1: the season whose meadow colour is nearest to a legacy hex (naturaleza.ts still passes pre-palette hexes for spring/autumn): terrain and grass only ever wear ESTACIONES colours. */
export function estacionDe(hex?: number): (typeof ESTACIONES)[Estacion] {
  if (hex === undefined) return ESTACIONES.verano;
  let mejor: Estacion = "verano", d0 = Infinity;
  for (const k of Object.keys(ESTACIONES) as Estacion[]) {
    const c = ESTACIONES[k].hierba, d = ((c >> 16) - (hex >> 16)) ** 2 + (((c >> 8) & 255) - ((hex >> 8) & 255)) ** 2 + ((c & 255) - (hex & 255)) ** 2;
    if (d < d0) { d0 = d; mejor = k; }
  }
  return ESTACIONES[mejor];
}
const lim = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * R1: the colour (hex) of the ground at a lattice vertex, ONLY from paleta.ts and mezcla(): muted Mediterranean greens, dry patches by noise,
 * warm sand, ash/bronze rock with a touch of moss, sea-green shallows to deep turquoise. Pure.
 * `w` = zone weights (ZONAS order), `valle` 0…1 (1 = hollow), `conv` = height above the neighbours' mean per metre (>0 ridge, <0 hollow), `pend` = slope.
 * Warmer toward the light on ridges and sunlit rises, cooler and darker in hollows; stream bed and rock ledges are colour only (the mesh keeps alturaEn).
 */
export function colorTerreno(s: number, x: number, z: number, h: number, w: ArrayLike<number>, valle: number, conv: number, pend: number, est: (typeof ESTACIONES)[Estacion], plaza = PLAZA): number {
  const ruido = valor2(s + 37, x * 0.03, z * 0.03), fino = valor2(s + 23, x * 0.11, z * 0.11), mancha = valor2(s + 51, x * 0.045, z * 0.045);
  const seco = sstep(0.42, 0.7, ruido), sol = lim(conv * 4 + 0.5), hondo = lim(valle * 0.9 - conv * 3);
  // meadow: green ↔ dry by noise; lush patches darker; ridges toward the light green; hollows toward the shade green
  let prado = mezcla(est.hierba, est.hierbaLuz, 0.12 + 0.6 * seco + 0.3 * (fino - 0.5));
  prado = mezcla(prado, VERDES.hierbaSombra, lim((1 - seco) * mancha * 0.38 + hondo * 0.5));
  prado = mezcla(prado, est.hierbaLuz, lim((sol - 0.5) * 0.9 + lim((h - 1) / 9) * 0.22));
  prado = mezcla(prado, CASA.arenaVelada, seco * 0.22);
  // dry stream bed: a winding pale strip of pebbles, away from the plaza and the pond (colour only)
  const r = Math.hypot(x, z), lecho = (1 - sstep(0.018, 0.05, Math.abs(simplex2(s + 91, x * 0.02 + 1.3 * simplex2(s + 92, z * 0.011, x * 0.011), z * 0.02)))) * sstep(plaza * 1.8, plaza * 3, r) * sstep(AGUA + 0.3, AGUA + 1.2, h) * w[0];
  prado = mezcla(prado, mezcla(CASA.arenaVelada, CASA.ceniza, fino * 0.8), lecho * 0.85);
  // forest floor: dark mountain green with moss on rises, deep shade in hollows
  let bosque = mezcla(VERDES.monte, VERDES.musgo, lim(mancha * 0.55 + (sol - 0.5) * 0.7));
  bosque = mezcla(bosque, VERDES.monteSombra, lim(0.18 + hondo * 0.6));
  // sand: warm, two tones
  const arena = mezcla(mezcla(CASA.arenaVelada, CASA.arena, 0.2 + 0.5 * fino), VERDES.hierbaLuz, 0.22 + seco * 0.15 + hondo * 0.1);
  // rock: ash with bronze strata (ledges follow the height and steepen with the slope), sunlit rises toward sand-light, a touch of moss
  const estrato = 0.5 + 0.5 * Math.sin(h * 2.3 + simplex2(s + 71, x * 0.05, z * 0.05) * 2);
  let roca = mezcla(CASA.ceniza, CASA.bronce, lim(0.12 + 0.3 * estrato * lim(pend * 0.8) + hondo * 0.45));
  roca = mezcla(roca, CASA.arenaVelada, lim((sol - 0.45) * 0.55));
  roca = mezcla(roca, VERDES.musgo, sstep(0.66, 0.85, mancha) * (1 - lim(pend * 0.9)) * 0.5);
  // shore above the water: damp sand with moss
  const orilla = mezcla(mezcla(CASA.arenaVelada, VERDES.musgo, 0.22 + 0.3 * fino), VERDES.hierbaSombra, hondo * 0.3);
  const zonas = [prado, bosque, arena, roca, orilla];
  // linear blend of the five zone colours by weight, done as a chain of mezcla (stays inside the palette hull)
  let c = zonas[0], acum = wc[0];
  for (let q = 1; q < 5; q++) { acum += wc[q]; if (wc[q] > 0) c = mezcla(c, zonas[q], wc[q] / Math.max(acum, 1e-6)); }
  // underwater: sea-green shallows, turquoise, deep turquoise with depth (the pond's bed shows through the water)
  const prof = AGUA - h;
  if (prof > -0.1) {
  // the zone weights give the pond a wide sand belt; as colour only half of it stays pale sand, the rest reads as dry meadow (the weights and alturaEn stay as they are)
  const wc = [w[0] + w[2] * 0.55, w[1], w[2] * 0.45, w[3], w[4]];
    const fondo = mezcla(mezcla(CASA.arenaVelada, CASA.verdemar, sstep(0, 0.35, prof)), mezcla(mezcla(CASA.turquesa, CASA.ceniza, 0.3), mezcla(CASA.turquesaProfundo, CASA.bronce, 0.35), sstep(0.9, 1.9, prof)), sstep(0.35, 1.4, prof));
    c = mezcla(c, fondo, sstep(-0.1, 0.2, prof));
  }
  return c;
}

/** Build the terrain: ONE mesh, flat-shaded, vertex colours, no texture. */
export function crearTerreno(o: OpcionesTerreno): Terreno {
  const nivel = o.nivel ?? "A", n = CELDAS_TERRENO[nivel], tam = o.tamano ?? TAMANO, op: OpcionesRelieve = { tamano: tam, plaza: o.plaza ?? PLAZA, sinEstanque: o.sinEstanque };
  const s = o.semilla, mitad = tam / 2, paso = tam / n;
  const nv = n + 1;
  // sample heights and zone weights once per lattice vertex, then colour in a second pass (slope and curvature need the neighbours)
  const H = new Float32Array(nv * nv), W = new Float32Array(nv * nv * 5), V0 = new Float32Array(nv * nv), C = new Float32Array(nv * nv * 3);
  const est = estacionDe(o.colores?.prado), niebla = new THREE.Color(o.niebla ?? 0xbcd6ee), nieblaHex = niebla.getHex();
  const borde = tam * 0.14, tmpC = new THREE.Color();
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const c = campo(s, -mitad + i * paso, -mitad + j * paso, op), k = j * nv + i;
    H[k] = c.h; V0[k] = c.valle;
    for (let q = 0; q < 5; q++) W[k * 5 + q] = c.w[q];
  }
  const Hh = (i: number, j: number) => H[Math.min(nv - 1, Math.max(0, j)) * nv + Math.min(nv - 1, Math.max(0, i))];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const x = -mitad + i * paso, z = -mitad + j * paso, k = j * nv + i, h = H[k];
    const media = (Hh(i - 1, j) + Hh(i + 1, j) + Hh(i, j - 1) + Hh(i, j + 1)) / 4;
    const pend = Math.hypot(Hh(i + 1, j) - Hh(i - 1, j), Hh(i, j + 1) - Hh(i, j - 1)) / (2 * paso);
    const hex = colorTerreno(s, x, z, h, W.subarray(k * 5, k * 5 + 5), V0[k], (h - media) / paso, pend, est, op.plaza ?? PLAZA);
    const f = sstep(mitad - borde, mitad, Math.max(Math.abs(x), Math.abs(z))); // 0 inside … 1 at the border
    tmpC.setHex(f > 0 ? mezcla(hex, nieblaHex, f) : hex);
    C[k * 3] = tmpC.r; C[k * 3 + 1] = tmpC.g; C[k * 3 + 2] = tmpC.b;
  }
  const e = estanqueDe(s, tam), plana = o.aguaPlana !== undefined && !o.sinEstanque, tris = triangulosDeTerreno(n, plana), nvt = tris * 3;
  const pos = new Float32Array(nvt * 3), col = new Float32Array(nvt * 3);
  let p = 0;
  const caida = 10; // skirt drop (m) below the border height
  const tri = (a: number[], b: number[], c: number[], ia: number, ib: number, ic: number, fog: boolean) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const u = fog ? 0.5 : hash2(s, (a[0] * 7) | 0, (a[2] * 7) | 0); // a faint per-face tint so the facets read: toward sand-light or toward dark bronze, never a flat scale
    const idx = [ia, ib, ic], pts = [a, b, c];
    for (let q = 0; q < 3; q++) {
      pos[p * 3] = pts[q][0]; pos[p * 3 + 1] = pts[q][1]; pos[p * 3 + 2] = pts[q][2];
      if (idx[q] < 0) { col[p * 3] = niebla.r; col[p * 3 + 1] = niebla.g; col[p * 3 + 2] = niebla.b; }
      else {
        const v = idx[q] * 3; tmpC.setRGB(C[v], C[v + 1], C[v + 2]);
        if (u > 0.55 || u < 0.45) tmpC.setHex(u > 0.5 ? mezcla(tmpC.getHex(), CASA.arena, (u - 0.5) * 0.28) : mezcla(tmpC.getHex(), CASA.bronceOscuro, (0.5 - u) * 0.28));
        col[p * 3] = tmpC.r; col[p * 3 + 1] = tmpC.g; col[p * 3 + 2] = tmpC.b;
      }
      p++;
    }
  };
  const V = (i: number, j: number) => [-mitad + i * paso, H[j * nv + i], -mitad + j * paso];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
    const ka = j * nv + i, kb = ka + 1, kc = ka + nv, kd = kc + 1;
    // winding so the normal points up (+y); the diagonal alternates for a less regular facet pattern
    if ((i + j) & 1) { tri(a, c, b, ka, kc, kb, false); tri(b, c, d, kb, kc, kd, false); }
    else { tri(a, c, d, ka, kc, kd, false); tri(a, d, b, ka, kd, kb, false); }
  }
  // skirt: a wall of fog colour under each border edge, so the border never shows a hole when seen from the side
  const pared = (a: number[], b: number[]) => {
    const a2 = [a[0], a[1] - caida, a[2]], b2 = [b[0], b[1] - caida, b[2]];
    tri(a, a2, b, -1, -1, -1, true); tri(b, a2, b2, -1, -1, -1, true);
  };
  for (let i = 0; i < n; i++) {
    pared(V(i + 1, 0), V(i, 0)); // north (z = −mitad): outward −z
    pared(V(i, n), V(i + 1, n)); // south
    pared(V(0, i), V(0, i + 1)); // west
    pared(V(n, i + 1), V(n, i)); // east
  }
  if (plana) { // N6: the pond as a flat blue fan at the water level, slightly lighter at the rim (no animation, no extra draw call)
    const r = e.radio * 1.2, y = AGUA + 0.02, c0 = new THREE.Color(mezcla(CASA.verdemar, CASA.turquesa, 0.5)), c1 = new THREE.Color(mezcla(CASA.verdemar, CASA.turquesa, 0.28)); // palette water, the hex the caller passes only switches the painted pond on
    for (let k = 0; k < LADOS_AGUA_PLANA; k++) {
      const a0 = (k / LADOS_AGUA_PLANA) * Math.PI * 2, a1 = ((k + 1) / LADOS_AGUA_PLANA) * Math.PI * 2;
      const q = [[e.x, y, e.z], [e.x + Math.cos(a1) * r, y, e.z + Math.sin(a1) * r], [e.x + Math.cos(a0) * r, y, e.z + Math.sin(a0) * r]];
      for (let v = 0; v < 3; v++) {
        pos[p * 3] = q[v][0]; pos[p * 3 + 1] = q[v][1]; pos[p * 3 + 2] = q[v][2];
        const c = v === 0 ? c0 : c1; col[p * 3] = c.r; col[p * 3 + 1] = c.g; col[p * 3 + 2] = c.b; p++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  // F4 audit: no normal buffer (a third of the terrain's bytes): the faces are flat, so the material takes them from screen derivatives
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.name = "terreno-naturaleza";
  const malla = new THREE.Mesh(g, mat);
  malla.name = "terreno-naturaleza";
  malla.userData.sinSombra = true; malla.receiveShadow = !!o.recibeSombra;
  malla.matrixAutoUpdate = false; malla.updateMatrix(); // never moves: no per-frame matrix work
  o.escena?.add(malla);
  return {
    malla, estanque: { ...e, nivel: AGUA }, triangulos: tris, vertices: nvt,
    alturaEn: (x, z) => alturaEn(s, x, z, op), zonaEn: (x, z) => zonaEn(s, x, z, op),
    dispose: () => { malla.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}
