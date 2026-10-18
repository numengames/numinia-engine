// sim/terreno-malla.ts — N5: the seeded terrain of `naturaleza.json` as the world's collision mesh, so the avatar walks over the
// hills instead of floating at y = 0. REUSES M6 whole: the triangles go through the same 1/64 m quantisation (`bvh.ts`) and the same
// tree, and `groundHeight` / `blockedMesh` / `MAX_SLOPE_COS` do the walking; nothing new in `step`.
// ONE source of truth: every height comes from `alturaEn(semilla, x, z)` of packages/relieve (the function the page draws).
// Copied (design M6 + docs/NATURALEZA.md N5): a regular height grid turned into two triangles per cell, the diagonal alternating
// exactly like render/naturaleza/terreno.ts so a collision cell and a drawn cell with the same size are the same triangles.
// Changed: coarser than the drawing (2 m cells, ≤ 100 per side → ≤ 20 000 triangles), heights rounded ONCE per lattice vertex (so
// neighbours share the exact vertex: no crack to fall through), plus a wall around the border (a steep triangle blocks, M6 h6).
// World geometry, like `solids` and the GLB mesh: NOT part of the state fingerprint. Never called inside `step`.
import { alturaEn } from "../../relieve/src/relieve.ts";
import { buildBvh, TRI_STRIDE } from "./bvh.ts";
import type { Bvh } from "./bvh.ts";

/** The shared-state key the naturaleza feature publishes the world under (features/naturaleza/feature.ts: `naturaleza` + `:` + MUNDO).
 * A test pins it; the sim cannot import features/, so the string lives here. */
export const CLAVE_NATURALEZA = "naturaleza:mundo";
/** Collision cell (m): coarser than the drawing (72 cells on a 200 m world = 2.78 m on tier A, 7 m on tier D). */
export const CELDA_COLISION_M = 2;
/** Cells per side at most: 100 → 20 000 triangles + 800 of wall. A bigger world gets bigger cells (400 m → 4 m). */
export const CELDAS_COLISION_MAX = 100;
/** How high the border wall rises over the terrain edge, and how far below it goes (m): nobody jumps (1.5 m) or falls past it. */
export const MURO_ALTO_M = 8;
export const MURO_BAJO_M = 4;

/** What the shared state says about the world's nature, validated and clamped to the schema's ranges (esquema.ts). */
export type TerrenoMundo = { semilla: number; tamano: number; plaza: number; estanque: boolean };
export type TerrenoMalla = { bvh: Bvh; mundo: TerrenoMundo; celdas: number; triangulos: number; hmin: number; hmax: number; clave: string };

const ent = (v: unknown, min: number, max: number, def: number): number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : def;

/** The terrain a shared state asks for, or null (no naturaleza, switched off, or not there yet). `objetos` are `allState()` entries. */
export function terrenoDelEstado(objetos: Iterable<[string, Record<string, unknown>]>): TerrenoMundo | null {
  for (const [k, v] of objetos) {
    if (k !== CLAVE_NATURALEZA) continue;
    if (!v || v.activa === false) return null;
    return { semilla: ent(v.semilla, 0, 2147483647, 1234), tamano: ent(v.tamano, 100, 400, 200), plaza: ent(v.plaza, 4, 40, 12), estanque: v.estanque !== false };
  }
  return null;
}

export const claveTerreno = (m: TerrenoMundo): string => `${m.semilla}|${m.tamano}|${m.plaza}|${m.estanque ? 1 : 0}`;
/** Cells per side the collision mesh uses for a world of this side. */
export const celdasColision = (tamano: number): number => Math.min(CELDAS_COLISION_MAX, Math.max(1, Math.ceil(tamano / CELDA_COLISION_M)));

/** Triangles (1/64 m ints, `bvh.ts` TRI_STRIDE each) of the terrain plus its border wall, and the height range (m). */
export function triangulosDeTerreno(m: TerrenoMundo, altura: (x: number, z: number) => number = (x, z) => alturaEn(m.semilla, x, z, { tamano: m.tamano, plaza: m.plaza, sinEstanque: !m.estanque })): { tris: Int32Array; celdas: number; hmin: number; hmax: number } {
  const n = celdasColision(m.tamano), nv = n + 1, mitad = m.tamano / 2, paso = m.tamano / n;
  const X = new Int32Array(nv), H = new Int32Array(nv * nv);
  for (let i = 0; i < nv; i++) X[i] = Math.round((-mitad + i * paso) * 64);
  let hmin = Infinity, hmax = -Infinity;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const h = Math.round(altura(-mitad + i * paso, -mitad + j * paso) * 64) | 0; // quantised ONCE per vertex: shared by the 6 triangles around it
    H[j * nv + i] = h;
    if (h < hmin) hmin = h; if (h > hmax) hmax = h;
  }
  const tris = new Int32Array((2 * n * n + 8 * n) * TRI_STRIDE);
  let o = 0;
  const put = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    tris[o++] = ax; tris[o++] = ay; tris[o++] = az; tris[o++] = bx; tris[o++] = by; tris[o++] = bz; tris[o++] = cx; tris[o++] = cy; tris[o++] = cz;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
    if ((i + j) & 1) { // same diagonal rule as the drawn terrain
      put(X[i], H[a], X[j], X[i], H[c], X[j + 1], X[i + 1], H[b], X[j]);
      put(X[i + 1], H[b], X[j], X[i], H[c], X[j + 1], X[i + 1], H[d], X[j + 1]);
    } else {
      put(X[i], H[a], X[j], X[i], H[c], X[j + 1], X[i + 1], H[d], X[j + 1]);
      put(X[i], H[a], X[j], X[i + 1], H[d], X[j + 1], X[i + 1], H[b], X[j]);
    }
  }
  // the border wall: a vertical quad (2 triangles) per edge cell, from MURO_BAJO under to MURO_ALTO over the terrain edge height
  const alto = MURO_ALTO_M * 64, bajo = MURO_BAJO_M * 64;
  const pared = (x0: number, z0: number, h0: number, x1: number, z1: number, h1: number) => {
    put(x0, h0 - bajo, z0, x0, h0 + alto, z0, x1, h1 - bajo, z1);
    put(x1, h1 - bajo, z1, x0, h0 + alto, z0, x1, h1 + alto, z1);
  };
  for (let i = 0; i < n; i++) {
    pared(X[i], X[0], H[i], X[i + 1], X[0], H[i + 1]);                                  // north (z = −mitad)
    pared(X[i], X[n], H[n * nv + i], X[i + 1], X[n], H[n * nv + i + 1]);                // south
    pared(X[0], X[i], H[i * nv], X[0], X[i + 1], H[(i + 1) * nv]);                      // west
    pared(X[n], X[i], H[i * nv + n], X[n], X[i + 1], H[(i + 1) * nv + n]);              // east
  }
  return { tris, celdas: n, hmin: hmin / 64, hmax: hmax / 64 };
}

/** The collision mesh of a world's terrain: triangles quantised as the BVH needs, tree built. Pure, deterministic, a few ms. */
export function terrenoMalla(m: TerrenoMundo): TerrenoMalla {
  const t = triangulosDeTerreno(m);
  return { bvh: buildBvh(t.tris), mundo: m, celdas: t.celdas, triangulos: t.tris.length / TRI_STRIDE, hmin: t.hmin, hmax: t.hmax, clave: claveTerreno(m) };
}

/** D-045: when naturaleza is on and the world gives no `sueloMinimo`, the void starts this far under the lowest ground (m). */
export const SUELO_BAJO_TERRENO_M = 8;
export const sueloMinimoTerreno = (hmin: number): number => Math.floor(hmin) - SUELO_BAJO_TERRENO_M;

/** Two meshes in one tree (a world with a `malla` GLB AND naturaleza): the triangles of both, rebuilt. null + null = null. */
export function combinarMallas(a: Bvh | null, b: Bvh | null): Bvh | null {
  if (!a || a.count === 0) return b && b.count ? b : null;
  if (!b || b.count === 0) return a;
  const tris = new Int32Array(a.tris.length + b.tris.length);
  tris.set(a.tris, 0); tris.set(b.tris, a.tris.length);
  return buildBvh(tris);
}
