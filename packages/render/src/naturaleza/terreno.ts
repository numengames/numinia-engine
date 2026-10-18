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
import { hash2 } from "./semilla.ts";

import { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe, campo, sstep } from "../../../relieve/src/relieve.ts";
import type { Zona, OpcionesRelieve } from "../../../relieve/src/relieve.ts";
export { ZONAS, PALETA_TERRENO, NIVEL_AGUA, alturaEn, zonaEn, estanqueDe };
export type { Zona, OpcionesRelieve };
const TAMANO = 200, PLAZA = 12, AGUA = NIVEL_AGUA;

/** Grid cells per side by device tier (A desktop · B Quest · C mid phone · D old phone). Triangles = 2·n² + skirt (8·n). */
export const CELDAS_TERRENO: Record<Nivel, number> = { A: 72, B: 48, C: 40, D: 28 };

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
};
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
export const triangulosDeTerreno = (n: number) => 2 * n * n + 8 * n;

/** Build the terrain: ONE mesh, flat-shaded, vertex colours, no texture. */
export function crearTerreno(o: OpcionesTerreno): Terreno {
  const nivel = o.nivel ?? "A", n = CELDAS_TERRENO[nivel], tam = o.tamano ?? TAMANO, op: OpcionesRelieve = { tamano: tam, plaza: o.plaza ?? PLAZA, sinEstanque: o.sinEstanque };
  const s = o.semilla, mitad = tam / 2, paso = tam / n;
  const nv = n + 1;
  // sample heights, colours once per lattice vertex
  const H = new Float32Array(nv * nv), C = new Float32Array(nv * nv * 3);
  const cz = (Object.keys(PALETA_TERRENO) as Zona[]).map((k) => new THREE.Color(o.colores?.[k] ?? PALETA_TERRENO[k]));
  const orden = ZONAS.map((k) => cz[(Object.keys(PALETA_TERRENO) as Zona[]).indexOf(k)]);
  const niebla = new THREE.Color(o.niebla ?? 0xbcd6ee);
  const borde = tam * 0.14;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const x = -mitad + i * paso, z = -mitad + j * paso, c = campo(s, x, z, op);
    const k = j * nv + i;
    H[k] = c.h;
    let r = 0, g = 0, b = 0;
    for (let q = 0; q < 5; q++) { r += orden[q].r * c.w[q]; g += orden[q].g * c.w[q]; b += orden[q].b * c.w[q]; }
    const sombra = 1 - 0.3 * c.valle + (hash2(s, i, j) - 0.5) * 0.06; // darker in valleys, a little grain
    r *= sombra; g *= sombra; b *= sombra;
    const f = sstep(mitad - borde, mitad, Math.max(Math.abs(x), Math.abs(z))); // 0 inside … 1 at the border
    C[k * 3] = r + (niebla.r - r) * f; C[k * 3 + 1] = g + (niebla.g - g) * f; C[k * 3 + 2] = b + (niebla.b - b) * f;
  }
  const tris = triangulosDeTerreno(n), nvt = tris * 3;
  const pos = new Float32Array(nvt * 3), col = new Float32Array(nvt * 3), nor = new Float32Array(nvt * 3);
  let p = 0;
  const caida = 10; // skirt drop (m) below the border height
  const tri = (a: number[], b: number[], c: number[], ia: number, ib: number, ic: number, fog: boolean) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const tinte = fog ? 1 : 0.94 + hash2(s, (a[0] * 7) | 0, (a[2] * 7) | 0) * 0.12; // a faint per-face tint so the facets read
    const idx = [ia, ib, ic], pts = [a, b, c];
    for (let q = 0; q < 3; q++) {
      pos[p * 3] = pts[q][0]; pos[p * 3 + 1] = pts[q][1]; pos[p * 3 + 2] = pts[q][2];
      nor[p * 3] = nx; nor[p * 3 + 1] = ny; nor[p * 3 + 2] = nz;
      if (idx[q] < 0) { col[p * 3] = niebla.r; col[p * 3 + 1] = niebla.g; col[p * 3 + 2] = niebla.b; }
      else { col[p * 3] = C[idx[q] * 3] * tinte; col[p * 3 + 1] = C[idx[q] * 3 + 1] * tinte; col[p * 3 + 2] = C[idx[q] * 3 + 2] * tinte; }
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
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.name = "terreno-naturaleza";
  const malla = new THREE.Mesh(g, mat);
  malla.name = "terreno-naturaleza";
  malla.userData.sinSombra = true; malla.receiveShadow = !!o.recibeSombra;
  malla.matrixAutoUpdate = false; malla.updateMatrix(); // never moves: no per-frame matrix work
  o.escena?.add(malla);
  const e = estanqueDe(s, tam);
  return {
    malla, estanque: { ...e, nivel: AGUA }, triangulos: tris, vertices: nvt,
    alturaEn: (x, z) => alturaEn(s, x, z, op), zonaEn: (x, z) => zonaEn(s, x, z, op),
    dispose: () => { malla.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}
