// Lote4 (t_83d449d8 + t_df22a793): the builder's pure screen geometry — no DOM, no three.js, so node --test checks it.
// 1. The rubber band: Shift + drag on the empty world draws a rectangle; on release every thing whose projected
//    centre falls inside it joins the selection. 2. The two-finger gesture: the angle between the fingers turns the
//    selected thing (yaw), their distance scales it.
export type Pt = { x: number; y: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The rectangle between two corners, whichever way it was dragged. */
export const rectDesde = (a: Pt, b: Pt): Rect => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
/** A point inside the rectangle (borders included). */
export const dentroDe = (p: Pt, r: Rect): boolean => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
/** A press that moved this little is a click, not a band (same as the builder's CLIC_PX). */
export const esCaja = (a: Pt, b: Pt, minimo = 6): boolean => Math.abs(a.x - b.x) > minimo || Math.abs(a.y - b.y) > minimo;

/** The ids whose projected centre is inside the rectangle, in the order given. `centros` has `null` for what is
 * behind the camera (not on screen): never picked. */
export function idsEnRect(centros: Iterable<readonly [string, Pt | null]>, r: Rect): string[] {
  const out: string[] = [];
  for (const [id, p] of centros) if (p && dentroDe(p, r)) out.push(id);
  return out;
}
/** What the band leaves selected: Shift keeps what was selected and adds the band's; the band's own ids go last
 * (the last id is the primary: gizmo, inspector). */
export const unirSeleccion = (previa: readonly string[], banda: readonly string[]): string[] => [...previa.filter((id) => !banda.includes(id)), ...banda];

// ---- two fingers ----
export type DosDedos = { a: Pt; b: Pt };
const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
const angulo = (d: DosDedos) => (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
const distancia = (d: DosDedos) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
/** Fingers too close have no reliable angle or ratio: the gesture starts only from this far apart (CSS px). */
export const DEDOS_MIN_PX = 24;

/** From where the two fingers were when the gesture began to where they are now: how far they turned (degrees,
 * clockwise on the screen is positive, in [-180, 180]) and the ratio of their distances (>1 = spread). null when
 * they started too close. */
export function gestoDosDedos(inicio: DosDedos, ahora: DosDedos): { giro: number; factor: number } | null {
  const d0 = distancia(inicio);
  if (d0 < DEDOS_MIN_PX) return null;
  return { giro: envolver(angulo(ahora) - angulo(inicio)), factor: Math.max(0.05, distancia(ahora)) / d0 };
}
/** The thing's yaw and scale after the gesture. Seen from above, fingers turning clockwise on the screen turn the
 * thing clockwise too — and a positive `ry` is anticlockwise from above, so the yaw goes DOWN. Scales keep within the
 * server's limits [0.05, 50] and the wire's 0.01 step. */
export function aplicarGesto(antes: { ry: number; sx: number; sy: number; sz: number }, g: { giro: number; factor: number }): { ry: number; sx: number; sy: number; sz: number } {
  const e = (v: number) => Math.round(Math.min(50, Math.max(0.05, v * g.factor)) * 100) / 100;
  return { ry: Math.round(envolver(antes.ry - g.giro) * 10) / 10, sx: e(antes.sx), sy: e(antes.sy), sz: e(antes.sz) };
}
