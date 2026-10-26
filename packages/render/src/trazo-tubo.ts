// J18b story 2 (MIS-222 t_1b395abe, MENU-MUNECA-Y-PINTURA-VR.md §3.2): a `trazo@1` brush stroke → a tube. Pure numbers, no three.js:
// the same generator will draw the stroke live under the hand (story 4) and from a world's file (here), like Open Brush's
// `Stroke.Recreate`. A tube follows the points by parallel transport (no twisting in curves), a round section of 6 sides (8 when
// the brush is thick), flat caps. The pressure (0–1) swells the width ±40 %. P points → P·sides vertices and (P−1)·sides·2 + 2·sides
// triangles, so 600 points × 8 sides = 9 600 triangles: that is what limits.json says (`stroke_triangles_max`).

/** The eight colours a stroke's `color` 0–7 points at: the Nocturno palette of apps/plaza/tema.css and vr-pintura.ts (PRI-008: flat, no texture). */
export const PALETA_TRAZO = ["#F9EBDC", "#D33440", "#EFA517", "#8FC46B", "#A6DAD5", "#017C8D", "#C4B5A6", "#3A332D"] as const;
/** A tube side count: 6 for a fine brush, 8 from this width (m). */
export const GROSOR_GRUESO_M = 0.02;
/** The most triangles one stroke can have (600 points, 8 sides). */
export const TRIANGULOS_TRAZO_MAX = (600 - 1) * 8 * 2 + 2 * 8;

export type TuboEntrada = { color: number; grosor: number; puntos: readonly (readonly number[])[] };
export type Tubo = { posiciones: Float32Array; normales: Float32Array; indices: Uint16Array; vertices: number; triangulos: number; lados: number };

/** Sides of the section for a brush this wide; `lejos` (a stroke far away) drops to 4 (story 2's cheaper far copy). */
export const ladosDe = (grosor: number, lejos = false): number => (lejos ? 4 : grosor >= GROSOR_GRUESO_M ? 8 : 6);
/** The width factor the pressure gives: 0 → 0.6, 1 → 1.4 (±40 %). */
export const factorPresion = (p: number): number => 0.6 + 0.8 * Math.min(1, Math.max(0, p));
/** Triangles a stroke of `puntos` points and `lados` sides has (the rings joined, plus the two caps). */
export const trianguloDe = (puntos: number, lados: number): number => (puntos < 2 ? 0 : (puntos - 1) * lados * 2 + 2 * lados);

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const largo = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => { const l = largo(a); return l < 1e-9 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]; };
const punto = (q: readonly number[]): V => [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0];

/** Build the tube. Points that coincide are skipped (a still hand repeats a point: a zero-length segment has no direction). Fewer than 2
 * distinct points → an empty tube (nothing drawn, nothing thrown). */
export function tuboDe(t: TuboEntrada, opt: { lejos?: boolean } = {}): Tubo {
  const lados = ladosDe(t.grosor, opt.lejos);
  const pts: { p: V; r: number }[] = [];
  for (const q of t.puntos) {
    const p = punto(q), ult = pts[pts.length - 1];
    if (ult && largo(sub(p, ult.p)) < 1e-6) continue;
    pts.push({ p, r: (t.grosor / 2) * factorPresion(q[3] ?? 1) });
  }
  const n = pts.length;
  if (n < 2) return { posiciones: new Float32Array(0), normales: new Float32Array(0), indices: new Uint16Array(0), vertices: 0, triangulos: 0, lados };
  const vertices = n * lados + 2 * (lados + 1);
  const pos = new Float32Array(vertices * 3), nor = new Float32Array(vertices * 3), idx = new Uint16Array(trianguloDe(n, lados) * 3);
  // tangent at each point = the average of the two segments around it
  const tan: V[] = pts.map((_, i) => norm(sub(pts[Math.min(n - 1, i + 1)]!.p, pts[Math.max(0, i - 1)]!.p)));
  // the first normal: any axis not parallel to the first tangent; then each next normal is the previous one carried over (parallel transport)
  let nm: V = Math.abs(tan[0]![1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  nm = norm(cruz(cruz(tan[0]!, nm), tan[0]!));
  const marcos: { nm: V; bn: V }[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { // remove from the carried normal whatever lies along the new tangent
      const tg = tan[i]!, d = nm[0] * tg[0] + nm[1] * tg[1] + nm[2] * tg[2];
      const c = norm([nm[0] - d * tg[0], nm[1] - d * tg[1], nm[2] - d * tg[2]]);
      nm = largo(c) < 0.5 ? norm(cruz(cruz(tg, nm), tg)) : c;
    }
    marcos.push({ nm, bn: norm(cruz(tan[i]!, nm)) });
  }
  let v = 0;
  for (let i = 0; i < n; i++) {
    const { p, r } = pts[i]!, { nm: a, bn: b } = marcos[i]!;
    for (let k = 0; k < lados; k++, v++) {
      const ang = (k / lados) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const nx = a[0] * c + b[0] * s, ny = a[1] * c + b[1] * s, nz = a[2] * c + b[2] * s;
      pos.set([p[0] + nx * r, p[1] + ny * r, p[2] + nz * r], v * 3); nor.set([nx, ny, nz], v * 3);
    }
  }
  let f = 0;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < lados; k++) {
    const a = i * lados + k, b = i * lados + ((k + 1) % lados), c = a + lados, d = b + lados;
    idx[f++] = a; idx[f++] = c; idx[f++] = b; idx[f++] = b; idx[f++] = c; idx[f++] = d;
  }
  // flat caps: a centre and a ring of its own (its own normals: along the tangent)
  for (const [i, sentido] of [[0, -1], [n - 1, 1]] as const) {
    const { p, r } = pts[i]!, { nm: a, bn: b } = marcos[i]!, tg = tan[i]!, centro = v;
    pos.set(p, v * 3); nor.set([tg[0] * sentido, tg[1] * sentido, tg[2] * sentido], v * 3); v++;
    for (let k = 0; k < lados; k++, v++) {
      const ang = (k / lados) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      pos.set([p[0] + (a[0] * c + b[0] * s) * r, p[1] + (a[1] * c + b[1] * s) * r, p[2] + (a[2] * c + b[2] * s) * r], v * 3);
      nor.set([tg[0] * sentido, tg[1] * sentido, tg[2] * sentido], v * 3);
    }
    for (let k = 0; k < lados; k++) {
      const a1 = centro + 1 + k, b1 = centro + 1 + ((k + 1) % lados);
      if (sentido > 0) { idx[f++] = centro; idx[f++] = a1; idx[f++] = b1; } else { idx[f++] = centro; idx[f++] = b1; idx[f++] = a1; }
    }
  }
  return { posiciones: pos, normales: nor, indices: idx, vertices, triangulos: f / 3, lados };
}
