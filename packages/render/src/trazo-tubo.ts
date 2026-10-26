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

// ---- J18b story 4 (second slice): the SAME tube, grown live under the hand ------------------------------------------------------
// §3.2 «En vivo»: buffers allocated once for the worst stroke (600 points), then every new control point (or every frame's tail) rewrites only the
// last two rings — O(1) per call, never the whole stroke (Open Brush's lesson). The rings, the frames (parallel transport) and the tangents are
// computed exactly as `tuboDe` does, so once the hand lets go the tube under it is the tube the world will draw (the test compares them ring by
// ring). Layout, so that ONE draw call covers everything and a stroke of any length is a contiguous index range:
//   vertices: [ring 0 … ring cap-1 : lados each][cap A : 1 + lados][cap B : 1 + lados][tip : 6]
//   indices : [tip : 8 triangles][cap A][cap B][segment 0→1][segment 1→2] …   (draw from 0 with the tip, from `INDICES_PUNTA` without it)
/** The index count of the little tip marker (an octahedron: 8 triangles) that rides in the same buffer. */
export const INDICES_PUNTA = 24;
export type CambiosTubo = { vertices: [number, number][]; indices: [number, number] | null };

export function crearTuboVivo(grosor: number, capacidad = 600, lejos = false) {
  const lados = ladosDe(grosor, lejos), cap = Math.max(2, Math.floor(capacidad));
  const vAnillos = cap * lados, vTapaA = vAnillos, vTapaB = vTapaA + lados + 1, vPunta = vTapaB + lados + 1, vertices = vPunta + 6;
  const iTapaA = INDICES_PUNTA, iTapaB = iTapaA + lados * 3, iSeg = iTapaB + lados * 3;
  const pos = new Float32Array(vertices * 3), nor = new Float32Array(vertices * 3), idx = new Uint16Array(iSeg + (cap - 1) * lados * 6);
  const pts: { p: V; r: number }[] = [], marcos: { nm: V; bn: V }[] = [];
  let cola: { p: V; r: number } | null = null, anillos = 0, sucio: [number, number][] = [], idxSucio: [number, number] | null = null, punta: V | null = null, radioPunta = 0.008;
  // the fixed triangles: the tip's octahedron (vertices vPunta…+5 = +x −x +y −y +z −z), the two caps; segments are added as the rings grow
  const oct: [number, number, number][] = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  oct.forEach((t, i) => { idx[i * 3] = vPunta + t[0]; idx[i * 3 + 1] = vPunta + t[1]; idx[i * 3 + 2] = vPunta + t[2]; });
  for (let k = 0; k < lados; k++) {
    const a1 = vTapaA + 1 + k, b1 = vTapaA + 1 + ((k + 1) % lados); idx[iTapaA + k * 3] = vTapaA; idx[iTapaA + k * 3 + 1] = b1; idx[iTapaA + k * 3 + 2] = a1; // (the start cap faces backwards, as in tuboDe)
    const a2 = vTapaB + 1 + k, b2 = vTapaB + 1 + ((k + 1) % lados); idx[iTapaB + k * 3] = vTapaB; idx[iTapaB + k * 3 + 1] = a2; idx[iTapaB + k * 3 + 2] = b2;
  }
  const marca = (a: number, b: number): void => { const l = sucio[sucio.length - 1]; if (l && a <= l[1] && b >= l[0]) { l[0] = Math.min(l[0], a); l[1] = Math.max(l[1], b); } else sucio.push([a, b]); };
  const tangente = (i: number, todos: { p: V }[]): V => norm(sub(todos[Math.min(todos.length - 1, i + 1)]!.p, todos[Math.max(0, i - 1)]!.p));
  /** Write ring `i` with tangent `tg`: its frame is the previous ring's (final) one carried over, as in `tuboDe`. */
  function anillo(i: number, p: V, r: number, tg: V): { nm: V; bn: V } {
    let nm: V;
    if (i === 0) { nm = Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; nm = norm(cruz(cruz(tg, nm), tg)); }
    else {
      nm = marcos[i - 1]!.nm; const d = nm[0] * tg[0] + nm[1] * tg[1] + nm[2] * tg[2];
      const c = norm([nm[0] - d * tg[0], nm[1] - d * tg[1], nm[2] - d * tg[2]]);
      nm = largo(c) < 0.5 ? norm(cruz(cruz(tg, nm), tg)) : c;
    }
    const bn = norm(cruz(tg, nm)), m = { nm, bn };
    for (let k = 0; k < lados; k++) {
      const ang = (k / lados) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang), v = (i * lados + k) * 3;
      const nx = nm[0] * c + bn[0] * s, ny = nm[1] * c + bn[1] * s, nz = nm[2] * c + bn[2] * s;
      pos[v] = p[0] + nx * r; pos[v + 1] = p[1] + ny * r; pos[v + 2] = p[2] + nz * r; nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz;
    }
    marca(i * lados, (i + 1) * lados);
    marcos[i] = m;
    return m;
  }
  function tapa(desde: number, p: V, r: number, m: { nm: V; bn: V }, tg: V, sentido: 1 | -1): void {
    const w = (v: number, x: number, y: number, z: number): void => { pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; nor[v * 3] = tg[0] * sentido; nor[v * 3 + 1] = tg[1] * sentido; nor[v * 3 + 2] = tg[2] * sentido; };
    w(desde, p[0], p[1], p[2]);
    for (let k = 0; k < lados; k++) {
      const ang = (k / lados) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      w(desde + 1 + k, p[0] + (m.nm[0] * c + m.bn[0] * s) * r, p[1] + (m.nm[1] * c + m.bn[1] * s) * r, p[2] + (m.nm[2] * c + m.bn[2] * s) * r);
    }
    marca(desde, desde + lados + 1);
  }
  /** Rings 0…m−1 for the points so far (+ the tail, if any); only the last two are rewritten: the rest are final. */
  function refrescar(): void {
    const todos = cola ? [...pts, cola] : pts, m = todos.length;
    if (m < 2) { anillos = m; return; }
    for (let i = Math.max(0, m - 2); i < m; i++) {
      const q = todos[i]!, tg = tangente(i, todos);
      const mk = anillo(i, q.p, q.r, tg);
      if (i === 0) tapa(vTapaA, q.p, q.r, mk, tg, -1);
      if (i === m - 1) tapa(vTapaB, q.p, q.r, mk, tg, 1);
    }
    // segments: ring i → i+1 for every i < m−1 (only the new ones are written; the rest are already there)
    for (let i = anillos > 1 ? anillos - 1 : 0; i < m - 1; i++) {
      for (let k = 0; k < lados; k++) {
        const a = i * lados + k, b = i * lados + ((k + 1) % lados), c = a + lados, d = b + lados, o = iSeg + (i * lados + k) * 6;
        idx[o] = a; idx[o + 1] = c; idx[o + 2] = b; idx[o + 3] = b; idx[o + 4] = c; idx[o + 5] = d;
      }
      const ini = iSeg + i * lados * 6, fin = ini + lados * 6;
      idxSucio = idxSucio ? [Math.min(idxSucio[0], ini), Math.max(idxSucio[1], fin)] : [ini, fin];
    }
    anillos = m;
  }
  function ponerPunta(): void {
    if (!punta) return;
    const [x, y, z] = punta, r = radioPunta, d: V[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
    d.forEach((q, i) => { const v = (vPunta + i) * 3; pos[v] = x + q[0]; pos[v + 1] = y + q[1]; pos[v + 2] = z + q[2]; const n = norm(q); nor[v] = n[0]; nor[v + 1] = n[1]; nor[v + 2] = n[2]; });
    marca(vPunta, vPunta + 6);
  }
  return {
    lados, capacidad: cap, posiciones: pos, normales: nor, indices: idx, vertices,
    get puntos(): number { return pts.length; },
    get lleno(): boolean { return pts.length >= cap; },
    /** A control point of the stroke (world metres, pressure 0–1). Coincident points are skipped, as in `tuboDe`. */
    anadir(q: readonly number[]): boolean {
      if (pts.length >= cap) return false;
      const p = punto(q), ult = pts[pts.length - 1];
      cola = null;
      if (ult && largo(sub(p, ult.p)) < 1e-6) { refrescar(); return false; }
      pts.push({ p, r: (grosor / 2) * factorPresion(q[3] ?? 1) });
      refrescar(); return true;
    },
    /** Where the hand is right now, beyond the last control point (not kept): the tube reaches the hand between control points. null: no tail. */
    seguir(q: readonly number[] | null): void {
      const ult = pts[pts.length - 1];
      cola = null;
      if (q && ult) { const p = punto(q); if (largo(sub(p, ult.p)) >= 1e-6) cola = { p, r: (grosor / 2) * factorPresion(q[3] ?? 1) }; }
      refrescar();
    },
    /** The little marker at the brush tip (null: none). It rides in the same buffer, so it costs no draw call of its own. */
    marcar(q: readonly number[] | null, radio = 0.008): void { punta = q ? punto(q) : null; radioPunta = radio; ponerPunta(); },
    /** Rings drawn now (the points, plus the tail). */
    get anillos(): number { return anillos; },
    /** Triangles drawn now, without the tip: nothing before there are two rings. */
    get triangulos(): number { return anillos < 2 ? 0 : trianguloDe(anillos, lados); },
    /** What to draw: from index 0 with the tip marker, from INDICES_PUNTA without it; `cuenta` 0 = nothing. */
    dibujo(conPunta: boolean): { inicio: number; cuenta: number } {
      const tubo = anillos < 2 ? 0 : (iSeg - INDICES_PUNTA) + (anillos - 1) * lados * 6;
      return conPunta && punta ? { inicio: 0, cuenta: INDICES_PUNTA + tubo } : { inicio: INDICES_PUNTA, cuenta: tubo };
    },
    /** What changed in the buffers since the last call (vertex ranges, index range), to upload only that. */
    cambios(): CambiosTubo { const c = { vertices: sucio, indices: idxSucio }; sucio = []; idxSucio = null; return c; },
    reiniciar(): void { pts.length = 0; marcos.length = 0; cola = null; anillos = 0; punta = null; sucio = []; idxSucio = null; },
  };
}
export type TuboVivo = ReturnType<typeof crearTuboVivo>;
