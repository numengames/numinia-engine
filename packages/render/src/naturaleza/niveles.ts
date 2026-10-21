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
// N1 «aparece antes» (Pablo, videos 2026-10-20: the grass showed up when he was already on top of it): the outer ring reached only 24 m on A (16 B · 14 C · 10 D) and
// the shader thins it from 70 % of that, so 30 m ahead of a walker the ground was bare (tools/naturaleza-alcance.ts: 0 tufts/m² at 30–38 m on every tier). The outer
// ring now reaches A 48 m · B 36 m · C 26 m, so the fade starts after 33 m on A and the grass stands before the player arrives; tufts rise with the area (density at the fade start ≈ 0.33/m², was 0.55); reach where
// the live density is still ≥ 0.1 tuft/m² ahead: A 20 → 40 m · B 12 → 32 m · C 12 → 20 m · D 8 m. Same single draw call and the same per-frame refill budget (`presupuestoMs`). D keeps 10 m: the oldest phones pay for it in
// heat first, and a world can still ask for more through its tier table. The fog is untouched (Pablo likes it): it veils ~16 % at 44 m, the edge itself melts by shrinking (no pop).
export const HIERBA_POR_NIVEL: Record<Nivel, HierbaNivel> = {
  // N7: each tier's tufts are split into a coarse outer ring and a dense inner ring (A 1050 + 350 = 1400 as before, so the grass's share does not change):
  // density ≈ 0.6 tufts/m² outside, ≈ 2.9 within the inner radius (was a flat 0.77), thinning with distance. Flowers are tufts of the outer ring.
  A: { radio: 48, tuftsMax: 2400, celda: 8, floresMax: 0.1, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 7, celda: 3.5, tuftsMax: 340 } },
  B: { radio: 36, tuftsMax: 1300, celda: 8, floresMax: 0.08, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 6, celda: 3, tuftsMax: 190 } },
  C: { radio: 26, tuftsMax: 800, celda: 8, floresMax: 0.08, aleteo: true, presupuestoMs: 0.4, cerca: { radio: 5.5, celda: 3, tuftsMax: 140 } },
  D: { radio: 10, tuftsMax: 250, celda: 7, floresMax: 0.06, aleteo: false, presupuestoMs: 0.3, cerca: { radio: 4.5, celda: 3, tuftsMax: 80 } },
};

// ---- N4: the whole nature piece (naturaleza.ts) ----
/** This is the ONE source of the caps: `triangulos` / `llamadas` for ALL nature together (terrain + trees + grass + water + fauna), and `reparto`, the share of
 *  triangles each piece may use (test/naturaleza-n4.test.ts checks every piece against its share; limits.json `nature_*` repeats the totals).
 *  R7.1 (D-057, Pablo 2026-10-19): the triangle caps rise to A 100 k · B 60 k · C 35 k · D 12 k (on the Quest what limits is draw calls and repainted
 *  pixels, not opaque triangles: work/naturaleza/investigacion/04-presupuestos-estandar.md); the draw calls stay as they were (N6: 8 · 7 · 6 · 5).
 *  The shares (`reparto`) are NOT raised here: each R7 story that spends the new room raises its own share, and the sum of shares stays ≤ `triangulos`. */
export const PRESUPUESTO_NATURALEZA: Record<Nivel, { triangulos: number; llamadas: number; reparto: { terreno: number; arboles: number; hierba: number; fauna: number } }> = {
  A: { triangulos: 100000, llamadas: 8, reparto: { terreno: 4000, arboles: 8000, hierba: 8500, fauna: 1600 } }, // N1 aparece-antes: grass share 4250 → 8500 (outer ring 24 → 48 m); R6.5: +400 terrain for the baked flora (flora.ts), paid by 30 outer grass tufts and the trees'/fauna's unused slack
  B: { triangulos: 60000, llamadas: 7, reparto: { terreno: 2100, arboles: 5000, hierba: 4600, fauna: 1100 } }, // N1 aparece-antes: grass share 2500 → 4600 (outer ring 16 → 36 m)
  C: { triangulos: 35000, llamadas: 6, reparto: { terreno: 1650, arboles: 7700, hierba: 3000, fauna: 800 } }, // N1 aparece-antes: grass share 1900 → 3000 (outer ring 14 → 26 m)
  D: { triangulos: 12000, llamadas: 5, reparto: { terreno: 890, arboles: 3500, hierba: 1100, fauna: 400 } }, // R6.5 flora + R6.6 ring at (18,0) on D too: worst 654 grid + 110 Residuos + 120 flora = 884
};
/** Most trees the scatter plants in the whole world per tier (memory + the O(n) near/far split): thinned evenly above it. */
export const ARBOLES_MAX_POR_NIVEL: Record<Nivel, number> = { A: 1100, B: 750, C: 750, D: 300 };

// ---- F1: the fauna (butterflies, fireflies, birds): who is in view per tier. The numbers live in relieve/fauna.ts (the server and the pages must
// agree on them, and relieve is the layer both can import); re-exported here so the render stories read every tier table from niveles.ts.
export { FAUNA_POR_NIVEL } from "../../../relieve/src/fauna.ts";

// ---- E02 (trozos.ts, RT1): the terrain cut into ~64 m chunks with two detail rings, in the SAME one draw call (index ranges + CDLOD-style morph).
// Chunk side is rounded to an even number of lattice cells (A 10 = 58.8 m · B 8 = 66.7 m · C 6 = 60 m · D 6 = 75 m); a chunk is fine while some point
// of it is closer than `radioDetalle`, coarse (every second vertex: a quarter of the triangles) beyond. Off unless the page asks (HNaturaleza.trozos):
// measured in work/saber-3d/queries/e02-trozos.md. The caps above do not move: chunks never draw more than the single mesh.
// Fine ring 128 m, not the catalogue's 64 m: the coarse surface is off by p95 1.1–1.7 m (max ~4 m), and at 64 m it flattened the hills'
// silhouettes on the horizon (2.2–3 % of pixels changed on the 2 km map); at 128 m 0.2–0.4 % for +2–4 % triangles and the same GPU ms.
export const TROZOS_POR_NIVEL: Record<Nivel, { lado: number; radioDetalle: number }> = {
  A: { lado: 64, radioDetalle: 128 }, B: { lado: 64, radioDetalle: 128 }, C: { lado: 64, radioDetalle: 128 }, D: { lado: 64, radioDetalle: 128 },
};
