// niveles (naturaleza; budgets N6): what the low-poly nature piece draws on each device tier (calidad.ts `Nivel`). Pure data (no three.js).
// Each story appends its own fields (trees: `arboles*`; grass: `hierba*`), so the pieces stay independent. Budgets come from
// the naturaleza brief: visible triangles ≤ 60 k A · 35 k B/C · 15 k D for ALL nature together; the trees' share is checked
// in test/naturaleza-arboles.test.ts (worst case: every near slot at 220 triangles + every far slot at 60).
import type { Nivel } from "../calidad.ts";

export type NaturalezaNivel = {
  /** Trees drawn with the full model (≤ 220 triangles each) at the same time, at most. */
  arbolesCerca: number;
  /** Trees drawn in all (near + far silhouettes, ≤ 60 triangles each) at the same time, at most. */
  arbolesVisibles: number;
  /** Trees closer than this (m) get the full model, if the cap above allows. */
  arbolesCercaM: number;
  /** Trees farther than this (m) are not drawn at all. */
  arbolesLejosM: number;
  /** Leaves flutter (a second, faster vertex term). Off on the oldest phones: fewer ALU per vertex. */
  arbolesAletean: boolean;
  /** N7: the near template has branches with leaf clumps (78 triangles, tiers A/B) instead of the simple crown (36, tiers C/D). */
  arbolesDetalle: boolean;
};

export const NATURALEZA_POR_NIVEL: Record<Nivel, NaturalezaNivel> = {
  // N7: near trees are 78 triangles with branches (A/B: 24 and 16 of them) or a 36-triangle irregular crown (C/D, one call); far silhouettes are 22 triangles (2 calls on A/B).
  // Far counts shrank (148 and 78, were 160 and 90) to pay for the branches inside the trees' share (A 5200, B 3000, C 2700, D 1200).
  A: { arbolesCerca: 24, arbolesVisibles: 172, arbolesCercaM: 30, arbolesLejosM: 150, arbolesAletean: true, arbolesDetalle: true },
  B: { arbolesCerca: 16, arbolesVisibles: 94, arbolesCercaM: 26, arbolesLejosM: 110, arbolesAletean: true, arbolesDetalle: true },
  C: { arbolesCerca: 66, arbolesVisibles: 66, arbolesCercaM: 70, arbolesLejosM: 70, arbolesAletean: true, arbolesDetalle: false },
  D: { arbolesCerca: 30, arbolesVisibles: 30, arbolesCercaM: 50, arbolesLejosM: 50, arbolesAletean: false, arbolesDetalle: false },
};

// ---- grass (N3, hierba.ts) ----
export type HierbaNivel = {
  /** Grass is drawn within this radius (m) of the camera; it thins out from 55 % of it and is gone at the edge. */
  radio: number;
  /** Most tufts alive at once (every slot of the ring, drawn or not). Each tuft is 3 triangles, so grass draws ≤ 3 × this. */
  tuftsMax: number;
  /** Side (m) of one placement cell: buffers are refilled one cell at a time as the camera crosses cell borders. */
  celda: number;
  /** Flower tufts (a second draw call, 5 triangles each) as a share of `tuftsMax`; 0 = no flowers. */
  floresMax: number;
  /** A fast small flutter on top of the gust wave (one more sin per vertex). Off on the oldest phones. */
  aleteo: boolean;
  /** CPU budget (ms) per frame for refilling cells. */
  presupuestoMs: number;
  /** N7: a second, dense ring of small cells around the camera (same draw call): the ground at the player's feet is never bare. Counts in `tuftsMax` are NOT shared:
   *  the tier sends `tuftsMax + cerca.tuftsMax` tufts in all. */
  cerca?: { radio: number; celda: number; tuftsMax: number };
};
export const HIERBA_POR_NIVEL: Record<Nivel, HierbaNivel> = {
  // N7: each tier's tufts are split into a coarse outer ring and a dense inner ring (A 1050 + 350 = 1400 as before, so the grass's share does not change):
  // density ≈ 0.6 tufts/m² outside, ≈ 2.9 within the inner radius (was a flat 0.77), thinning with distance. Flowers are tufts of the outer ring.
  A: { radio: 24, tuftsMax: 1030, celda: 8, floresMax: 0.1, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 7, celda: 3.5, tuftsMax: 340 } },
  B: { radio: 16, tuftsMax: 600, celda: 8, floresMax: 0.08, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 6, celda: 3, tuftsMax: 190 } },
  C: { radio: 14, tuftsMax: 450, celda: 8, floresMax: 0.08, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 5.5, celda: 3, tuftsMax: 140 } },
  D: { radio: 10, tuftsMax: 250, celda: 7, floresMax: 0.06, aleteo: false, presupuestoMs: 0.3, cerca: { radio: 4.5, celda: 3, tuftsMax: 80 } },
};

// ---- N4: the whole nature piece (naturaleza.ts) ----
/** N6: the whole-scene budget (Pablo: «her budget rules»: PC ≤ 100 calls · 50 k triangles; headset ≤ 80 · 35 k; mobile ≤ 60 · 25 k) leaves nature a small slice.
 *  This is the ONE source of the caps: `triangulos` / `llamadas` for ALL nature together (terrain + trees + grass + water + fauna), and `reparto`, the share of
 *  triangles each piece may use (test/naturaleza-n4.test.ts checks every piece against its share; limits.json `nature_*` repeats the totals). */
export const PRESUPUESTO_NATURALEZA: Record<Nivel, { triangulos: number; llamadas: number; reparto: { terreno: number; arboles: number; hierba: number; fauna: number } }> = {
  A: { triangulos: 15000, llamadas: 8, reparto: { terreno: 3600, arboles: 5200, hierba: 4500, fauna: 1700 } },
  B: { triangulos: 10000, llamadas: 7, reparto: { terreno: 1800, arboles: 3000, hierba: 2500, fauna: 1100 } },
  C: { triangulos: 8000, llamadas: 6, reparto: { terreno: 1400, arboles: 2700, hierba: 1900, fauna: 800 } },
  D: { triangulos: 4000, llamadas: 5, reparto: { terreno: 780, arboles: 1200, hierba: 1100, fauna: 400 } },
};
/** Most trees the scatter plants in the whole world per tier (memory + the O(n) near/far split): thinned evenly above it. */
export const ARBOLES_MAX_POR_NIVEL: Record<Nivel, number> = { A: 1100, B: 750, C: 750, D: 300 };

// ---- F1: the fauna (butterflies, fireflies, birds): who is in view per tier. The numbers live in relieve/fauna.ts (the server and the pages must
// agree on them, and relieve is the layer both can import); re-exported here so the render stories read every tier table from niveles.ts.
export { FAUNA_POR_NIVEL } from "../../../relieve/src/fauna.ts";
