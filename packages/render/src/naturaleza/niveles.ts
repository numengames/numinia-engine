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
  A: { arbolesCerca: 110, arbolesVisibles: 650, arbolesCercaM: 55, arbolesLejosM: 240, arbolesAletean: true },
  B: { arbolesCerca: 45, arbolesVisibles: 400, arbolesCercaM: 40, arbolesLejosM: 170, arbolesAletean: true },
  C: { arbolesCerca: 45, arbolesVisibles: 400, arbolesCercaM: 40, arbolesLejosM: 170, arbolesAletean: true },
  D: { arbolesCerca: 20, arbolesVisibles: 170, arbolesCercaM: 26, arbolesLejosM: 110, arbolesAletean: false },
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
  A: { radio: 38, tuftsMax: 14000, celda: 8, floresMax: 0.07, aleteo: true, presupuestoMs: 0.4 },
  B: { radio: 22, tuftsMax: 7000, celda: 8, floresMax: 0.06, aleteo: true, presupuestoMs: 0.4 },
  C: { radio: 22, tuftsMax: 7000, celda: 8, floresMax: 0.06, aleteo: true, presupuestoMs: 0.4 },
  D: { radio: 14, tuftsMax: 3000, celda: 7, floresMax: 0.05, aleteo: false, presupuestoMs: 0.3 },
};
