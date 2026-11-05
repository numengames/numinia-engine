// rotulos-apilar (mundo-hermes): how the flat plates over mirrored things keep clear of each other and of their figure. Pure (no three.js, no DOM),
// so it is tested on its own. The page projects each plate to the screen (NDC: x and y in -1..1) and hands the rectangles here.
//   · `levantarSobre`: how many steps up a plate must go so that its bottom edge is above the TOP of its own figure on the screen (a camera that
//     looks down from behind a person sees a plate «above the head» in the world drawn over the body: no distance rule can fix that, only the screen)
//   · `apilar`: the plates nearest first; each goes up by whole plate heights until it touches no plate already placed; a plate that would need
//     more than `niveles` steps is hidden (declutter by distance: the far ones give way to the near ones)

/** A plate on the screen: `cx` centre x, `cy` bottom y, `w` width, `h` height (all NDC), `d` the distance to the viewer (m), `clave` its key. */
export type Placa = { clave: string; cx: number; cy: number; w: number; h: number; d: number };
/** Level of each plate: 0 = where it is, n = n plate heights up, -1 = hidden. */
export type Niveles = Map<string, number>;

export const NIVELES_MAX = 4;
/** The gap left between stacked plates (NDC, fraction of the screen's height/2). */
export const HUECO_NDC = 0.012;

const choca = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Stack plates (any order in; nearest first is decided here). Never mutates its input. Deterministic: ties by key. */
export function apilar(placas: readonly Placa[], niveles = NIVELES_MAX): Niveles {
  const fuera: Niveles = new Map(), puestas: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const p of [...placas].sort((a, b) => a.d - b.d || (a.clave < b.clave ? -1 : 1))) {
    let n = 0;
    for (; n <= niveles; n++) {
      const y0 = p.cy + n * (p.h + HUECO_NDC), r = { x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0, y1: y0 + p.h };
      if (!puestas.some((q) => choca(r, q))) { puestas.push(r); break; }
    }
    fuera.set(p.clave, n > niveles ? -1 : n);
  }
  return fuera;
}

/** Steps (of `paso`, any unit) a plate must rise so its bottom is at least `margen` above `techoFigura` (both on the same axis, e.g. NDC y). 0 when it is clear already.
 *  `maxPasos` caps it (a figure whose top never clears: the plate stays at the cap). */
export function levantarSobre(fondoPlaca: number, techoFigura: number, margen: number, pasoNdc: number, maxPasos = 40): number {
  const falta = techoFigura + margen - fondoPlaca;
  return falta <= 0 || !(pasoNdc > 0) ? 0 : Math.min(maxPasos, Math.ceil(falta / pasoNdc));
}

/** Screen-space size of a flat plate (px wide): never smaller than the minimum (still readable far away) nor larger than the maximum (never a wall over the figures). */
export const PLACA_MIN_PX = 90, PLACA_MAX_PX = 220;
/** Beyond this distance (m) a flat plate is not drawn; from `PLACA_DESVANECE_M` it fades out linearly. */
export const PLACA_VER_M = 40, PLACA_DESVANECE_M = 32;

/** The scale factor (1 = the plate's natural width `anchoM`) that makes the plate `anchoM * e * focalPx / dist` pixels wide, clamped to [minPx, maxPx].
 *  `focalPx` = projection[0] * viewportWidth / 2. Returns 1 for a distance or focal length that is not positive (nothing sensible to clamp). Pure. */
export function escalaPlacaPx(anchoM: number, dist: number, focalPx: number, minPx = PLACA_MIN_PX, maxPx = PLACA_MAX_PX): number {
  if (!(anchoM > 0) || !(dist > 0) || !(focalPx > 0)) return 1;
  const natural = (anchoM * focalPx) / dist, lo = Math.min(minPx, maxPx), hi = Math.max(minPx, maxPx);
  return Math.min(hi, Math.max(lo, natural)) / natural;
}

/** Opacity of a flat plate by distance: 1 up to `desde`, then linearly to 0 at `hasta` (0 = do not draw). Pure. */
export function opacidadPlaca(dist: number, desde = PLACA_DESVANECE_M, hasta = PLACA_VER_M): number {
  if (!(dist < hasta)) return 0;
  if (dist <= desde) return 1;
  return (hasta - dist) / (hasta - desde);
}
