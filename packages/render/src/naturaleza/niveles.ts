// niveles (naturaleza): what the low-poly nature piece draws on each device tier (calidad.ts `Nivel`). Pure data (no three.js).
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
};

export const NATURALEZA_POR_NIVEL: Record<Nivel, NaturalezaNivel> = {
  // N4 retune: terrain + trees + grass share ONE budget (see PRESUPUESTO_NATURALEZA below); the first values were N2's alone.
  A: { arbolesCerca: 55, arbolesVisibles: 340, arbolesCercaM: 45, arbolesLejosM: 220, arbolesAletean: true },
  B: { arbolesCerca: 28, arbolesVisibles: 245, arbolesCercaM: 34, arbolesLejosM: 150, arbolesAletean: true },
  C: { arbolesCerca: 28, arbolesVisibles: 245, arbolesCercaM: 34, arbolesLejosM: 150, arbolesAletean: true },
  D: { arbolesCerca: 12, arbolesVisibles: 100, arbolesCercaM: 22, arbolesLejosM: 100, arbolesAletean: false },
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
};
export const HIERBA_POR_NIVEL: Record<Nivel, HierbaNivel> = {
  // N4 retune (was 14000 / 7000 / 7000 / 3000 tufts): the grass gives room to the terrain and the trees. D has no flowers (one draw call less).
  A: { radio: 38, tuftsMax: 5600, celda: 8, floresMax: 0.08, aleteo: true, presupuestoMs: 0.4 },
  B: { radio: 22, tuftsMax: 3200, celda: 8, floresMax: 0.05, aleteo: true, presupuestoMs: 0.4 },
  C: { radio: 22, tuftsMax: 3200, celda: 8, floresMax: 0.05, aleteo: true, presupuestoMs: 0.4 },
  D: { radio: 14, tuftsMax: 1700, celda: 7, floresMax: 0, aleteo: false, presupuestoMs: 0.3 },
};

// ---- N4: the whole nature piece (naturaleza.ts) ----
/** The brief's hard limits for ALL nature together: triangles sent (terrain + trees + grass) and draw calls (water included). */
export const PRESUPUESTO_NATURALEZA: Record<Nivel, { triangulos: number; llamadas: number }> = {
  A: { triangulos: 60000, llamadas: 12 }, B: { triangulos: 35000, llamadas: 10 }, C: { triangulos: 35000, llamadas: 10 }, D: { triangulos: 15000, llamadas: 8 },
};
/** Most trees the scatter plants in the whole world per tier (memory + the O(n) near/far split): thinned evenly above it. */
export const ARBOLES_MAX_POR_NIVEL: Record<Nivel, number> = { A: 1100, B: 750, C: 750, D: 300 };
