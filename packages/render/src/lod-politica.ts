// lod-politica (J14): the decision behind "dibujo barato de personas", pure (no three.js, no DOM) so tests
// run it without a GPU. index.ts applies it: a baked (non-animated) model keeps its per-material draw calls
// up close ("cerca") but farther than LOD_LEJOS_M it swaps to a single merged, vertex-coloured mesh — one
// draw call per figure instead of the baked count (the house robot: 3 -> 1). Hysteresis stops it flipping
// back and forth at the edge of the band (someone pacing right at the threshold).

/** Farther than this from the camera, a baked figure switches to its one-piece LOD (device-D tier: ANIMATE_WITHIN_M
 * is 40 for animation; this is shorter because the one-piece swap is a visual step-down, not just a freeze). */
export const LOD_LEJOS_M = 22;
/** Band around LOD_LEJOS_M where the current state wins (no flicker): switches at LEJOS_M ± this. */
export const LOD_HISTERESIS_M = 4;

export type EstadoLOD = "cerca" | "lejos";

/**
 * Which representation a baked figure should use right now. `actual` is undefined the first time (decided
 * purely by distance then); afterwards the band around `lejosM` keeps whatever it already had.
 */
export function decidirLOD(distanciaM: number, actual: EstadoLOD | undefined, lejosM = LOD_LEJOS_M, histeresisM = LOD_HISTERESIS_M): EstadoLOD {
  if (actual === undefined) return distanciaM > lejosM ? "lejos" : "cerca";
  if (actual === "cerca") return distanciaM > lejosM + histeresisM ? "lejos" : "cerca";
  return distanciaM < lejosM - histeresisM ? "cerca" : "lejos";
}
