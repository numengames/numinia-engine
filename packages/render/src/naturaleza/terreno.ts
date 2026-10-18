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
import { fbm, cresta2, valor2, simplex2, hash2 } from "./semilla.ts";

export type Zona = "prado" | "bosque" | "arena" | "roca" | "orilla";
export const ZONAS: readonly Zona[] = ["prado", "bosque", "arena", "roca", "orilla"];

/** The house palette for the ground (sRGB hex). Meadow warm light green fading to a deeper forest green, sand, violet-grey rock. */
export const PALETA_TERRENO: Record<Zona, number> = { prado: 0x9bc25a, bosque: 0x4f8a3c, arena: 0xe6d3a1, roca: 0x8a8594, orilla: 0xb8a878 };

/** Grid cells per side by device tier (A desktop · B Quest · C mid phone · D old phone). Triangles = 2·n² + skirt (8·n). */
export const CELDAS_TERRENO: Record<Nivel, number> = { A: 96, B: 64, C: 48, D: 32 };

export type OpcionesRelieve = {
  /** World side in metres the pond is placed against (default 200). */
  tamano?: number;
  /** Radius (m) of the almost flat disc around the origin, the spawn (default 12). */
  plaza?: number;
};
const TAMANO = 200, PLAZA = 12, AGUA = -0.2;
/** Height (m) of the pond's water surface; the basin is carved below it. */
export const NIVEL_AGUA = AGUA;

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Smooth maximum (Quilez polynomial): lifts `a` to at least about `b` without a kink. */
const maxSuave = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

/** Where the pond is for a seed: centre (m) and radius (m). Pure. */
export function estanqueDe(semilla: number, tamano = TAMANO): { x: number; z: number; radio: number } {
  const ang = hash2(semilla, 7001, 3) * Math.PI * 2, d = tamano * (0.26 + hash2(semilla, 7002, 3) * 0.08);
  return { x: Math.cos(ang) * d, z: Math.sin(ang) * d, radio: tamano * (0.075 + hash2(semilla, 7003, 3) * 0.025) };
}

const W = [0, 0, 0, 0, 0]; // scratch for zone weights (order of ZONAS)

/** Height and soft zone weights at a point. Weights sum to 1 and follow the order of ZONAS. */
function campo(semilla: number, x: number, z: number, op?: OpcionesRelieve, conPesos = true): { h: number; w: number[]; valle: number } {
  const tam = op?.tamano ?? TAMANO, plaza = op?.plaza ?? PLAZA;
  const r = Math.hypot(x, z);
  // rolling hills: low simplex fbm, lifted so the world sits above the pond water
  const colinas = fbm(semilla, x * 0.016, z * 0.016, 4) * 7.5 + 2.2;
  // rocky ridges: a ridged field, only where a slow mask says «mountain»
  const wpRoca = sstep(plaza * 1.5, plaza * 3.5, r);
  const mascara = sstep(0.5, 0.74, valor2(semilla + 77, x * 0.0085 + 3.1, z * 0.0085 - 1.7));
  const cr = cresta2(semilla + 5, x * 0.028, z * 0.028, 3);
  const cima = mascara * Math.pow(cr, 2.2) * 24;
  let h = maxSuave(colinas, 0.5, 1.2) + cima + fbm(semilla + 9, x * 0.09, z * 0.09, 2) * 0.35;
  // the plaza stays flat at 0 and the world rises gently around it
  const wp = sstep(plaza, plaza * 3.2, r);
  h *= wp * (1 - 0.85 * sstep(tam * 0.34, tam * 0.5, Math.max(Math.abs(x), Math.abs(z)))); // the border settles low: a calm edge under the fog
  // pond basin with a gentle approach
  const e = estanqueDe(semilla, tam);
  const dpr = Math.hypot(x - e.x, z - e.z) / e.radio + simplex2(semilla + 31, x * 0.07, z * 0.07) * 0.1;
  // the bank: a bowl under the water, then a gentle slope rising with the distance; the land never stands above it (smooth min)
  const banco = AGUA - 1.45 + 1.4 * sstep(0, 1.05, dpr) + Math.max(0, dpr - 1.05) * 1.3;
  h = -maxSuave(-h, -banco, 1.0);
  if (!conPesos) return { h, w: W, valle: 0 };
  // ---- zones (soft weights, priority: orilla > arena > roca > bosque > prado) ----
  const rocoso = sstep(0.6, 2.2, cima * wpRoca);
  const bosq = sstep(0.12, 0.34, fbm(semilla + 211, x * 0.014 + 40, z * 0.014 - 25, 3)) * sstep(plaza * 1.4, plaza * 3.5, r);
  const wo = 1 - sstep(1.12, 1.4, dpr);
  const wa = (1 - sstep(1.5, 1.95, dpr)) * (1 - wo);
  const wr = rocoso * (1 - wo - wa);
  const wb = bosq * (1 - wo - wa - wr);
  const wprado = 1 - wo - wa - wr - wb;
  W[0] = wprado; W[1] = wb; W[2] = wa; W[3] = wr; W[4] = wo;
  return { h, w: W, valle: 1 - sstep(-1.3, 0.9, h) };
}

/** Terrain height (m) at a world point. Pure and deterministic; ≈ −1.6 … +12. Within the plaza radius it is 0. */
export function alturaEn(semilla: number, x: number, z: number, op?: OpcionesRelieve): number {
  return campo(semilla, x, z, op, false).h;
}

/** The zone at a world point (the heaviest of the soft weights). Pure and deterministic. */
export function zonaEn(semilla: number, x: number, z: number, op?: OpcionesRelieve): Zona {
  const w = campo(semilla, x, z, op).w;
  let k = 0;
  for (let i = 1; i < 5; i++) if (w[i] > w[k]) k = i;
  return ZONAS[k];
}

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
  const nivel = o.nivel ?? "A", n = CELDAS_TERRENO[nivel], tam = o.tamano ?? TAMANO, op: OpcionesRelieve = { tamano: tam, plaza: o.plaza ?? PLAZA };
  const s = o.semilla, mitad = tam / 2, paso = tam / n;
  const nv = n + 1;
  // sample heights, colours once per lattice vertex
  const H = new Float32Array(nv * nv), C = new Float32Array(nv * nv * 3);
  const cz = (Object.keys(PALETA_TERRENO) as Zona[]).map((k) => new THREE.Color(PALETA_TERRENO[k]));
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
  malla.matrixAutoUpdate = false; malla.updateMatrix(); // never moves: no per-frame matrix work
  o.escena?.add(malla);
  const e = estanqueDe(s, tam);
  return {
    malla, estanque: { ...e, nivel: AGUA }, triangulos: tris, vertices: nvt,
    alturaEn: (x, z) => alturaEn(s, x, z, op), zonaEn: (x, z) => zonaEn(s, x, z, op),
    dispose: () => { malla.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}
