// dados-formas — the four solids the 3D dice learn in story 2 (t_95245cf0): d4 (tetrahedron), d8 (octahedron), d10 (pentagonal
// trapezohedron) and d12 (dodecahedron). Pure data, no three.js, no DOM: the fall (dados-caida.ts) and the page (dados-3d.ts) read
// the SAME tables, so the face that ends up on top is the face the numeral says, whatever the solid. Every solid is centred at the
// origin with circumradius 0.5 (a die of diameter 1 at unit scale); its faces are listed in order around the face, with the outward
// unit normal, the value written on each (opposite faces add `suma`; the d4 writes its value on each VERTEX and is read at the top
// one, as a real d4 is), the distance from the centre to the face plane (`apotema`: where it sits when it lies on a face) and the
// numeral's place on each face (centre, side, and the direction its top points to). d6 and d20 keep their own tables in dados-caida.ts.
export type Vec = readonly [number, number, number];
export type Forma = {
  caras: 4 | 8 | 10 | 12;
  vertices: readonly Vec[];
  poligonos: readonly (readonly number[])[];   // vertex indices, in order around each face
  normales: readonly Vec[];                    // outward, unit, one per polygon
  valores: readonly number[];                  // d8/d10/d12: the value written on each polygon; d4: the value at each VERTEX
  porVertice: boolean;                         // true = read at the top vertex (d4), false = read on the face that looks up
  suma: number | null;                         // opposite faces add this (9, 11, 13); null for the d4
  apotema: number;                             // centre → face plane, at unit scale
  radio: number;                               // centre → vertex (0.5)
  cifras: readonly { centro: Vec; lado: number; arriba: Vec; poligono: number; valor: number }[]; // where each numeral goes
};

const PHI = (1 + Math.sqrt(5)) / 2;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const largo = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => { const l = largo(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The vertices of a polygon in order around `n` (they arrive in any order). */
function ordenar(vs: readonly Vec[], idx: readonly number[], n: Vec): number[] {
  const c = mul(idx.reduce<Vec>((s, i) => add(s, vs[i]), [0, 0, 0]), 1 / idx.length);
  const u = unit(sub(vs[idx[0]], c)), w = cross(n, u);
  return [...idx].sort((i, j) => Math.atan2(dot(sub(vs[i], c), w), dot(sub(vs[i], c), u)) - Math.atan2(dot(sub(vs[j], c), w), dot(sub(vs[j], c), u)));
}
/** Area centroid of a planar polygon (fan from its first vertex). */
function centroide(vs: readonly Vec[], poly: readonly number[]): Vec {
  let A = 0, c: Vec = [0, 0, 0];
  for (let i = 1; i < poly.length - 1; i++) {
    const a = vs[poly[0]], b = vs[poly[i]], d = vs[poly[i + 1]], area = largo(cross(sub(b, a), sub(d, a))) / 2;
    c = add(c, mul(add(add(a, b), d), area / 3)); A += area;
  }
  return mul(c, 1 / A);
}

function construir(caras: 4 | 8 | 10 | 12, bruto: readonly Vec[], grupos: readonly (readonly number[])[], suma: number | null, porVertice = false): Forma {
  const R = Math.max(...bruto.map(largo));
  const vertices = bruto.map((v) => mul(v, 0.5 / R));
  const poligonos: number[][] = [], normales: Vec[] = [];
  for (const g of grupos) {
    const c0 = mul(g.reduce<Vec>((s, i) => add(s, vertices[i]), [0, 0, 0]), 1 / g.length);
    // the first three vertices that are not in line give the plane; the centroid tells which way is out
    let n: Vec = [0, 0, 0];
    for (let i = 2; i < g.length && largo(n) < 1e-9; i++) n = cross(sub(vertices[g[1]], vertices[g[0]]), sub(vertices[g[i]], vertices[g[0]]));
    n = unit(n); if (dot(n, c0) < 0) n = mul(n, -1);
    poligonos.push(ordenar(vertices, g, n)); normales.push(n);
  }
  const apotema = dot(normales[0], vertices[poligonos[0][0]]);
  const valores = new Array<number>(porVertice ? vertices.length : poligonos.length).fill(0);
  if (porVertice) valores.forEach((_, i) => { valores[i] = i + 1; });
  else {
    let sig = 1;
    for (let i = 0; i < poligonos.length; i++) {
      if (valores[i]) continue;
      const op = normales.findIndex((m, j) => j !== i && dot(m, normales[i]) < -0.999999);
      valores[i] = sig; valores[op] = suma! - sig; sig++;
    }
  }
  // numerals: a d4 writes the vertex's number near that vertex on each of its three faces; the others one numeral at the face's centre,
  // its top pointing to the vertex farthest from it (the kite's tip, a triangle's corner)
  const cifras: Forma["cifras"][number][] = [];
  poligonos.forEach((poly, p) => {
    const c = centroide(vertices, poly), n = normales[p];
    let r2 = Infinity;
    poly.forEach((a, k) => { const b = poly[(k + 1) % poly.length], e = sub(vertices[b], vertices[a]); r2 = Math.min(r2, largo(cross(sub(c, vertices[a]), e)) / largo(e)); });
    if (porVertice) {
      for (const i of poly) { const d = sub(vertices[i], c), arriba = unit(sub(d, mul(n, dot(d, n)))); cifras.push({ centro: add(c, mul(d, 0.52)), lado: r2 * 0.95, arriba, poligono: p, valor: valores[i] }); }
    } else {
      let lejos = poly[0]; for (const i of poly) if (largo(sub(vertices[i], c)) > largo(sub(vertices[lejos], c)) + 1e-9) lejos = i;
      const d = sub(vertices[lejos], c);
      cifras.push({ centro: c, lado: r2 * 1.5, arriba: unit(sub(d, mul(n, dot(d, n)))), poligono: p, valor: valores[p] });
    }
  });
  return { caras, vertices, poligonos, normales, valores, porVertice, suma, apotema, radio: 0.5, cifras };
}

// ---- d4: four vertices of a cube; faces = the triples (the face opposite each vertex) ----
const D4 = construir(4, [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]], null, true);

// ---- d8: the octahedron; one face per choice of a sign on each axis ----
const D8 = (() => {
  const v: Vec[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], g: number[][] = [];
  for (const sx of [0, 1]) for (const sy of [2, 3]) for (const sz of [4, 5]) g.push([sx, sy, sz]);
  return construir(8, v, g, 9);
})();

// ---- d12: the dodecahedron; its faces are looked up as the five vertices farthest along each of the twelve face directions (0, ±φ, ±1) and its cyclic turns ----
const D12 = (() => {
  const q = 1 / PHI, v: Vec[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a * q, b * PHI]); v.push([a * q, b * PHI, 0]); v.push([b * PHI, 0, a * q]); }
  const dirs: Vec[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) { dirs.push([0, a * PHI, b], [b, 0, a * PHI], [a * PHI, b, 0]); }
  const g = dirs.map((d) => { const u = unit(d), m = Math.max(...v.map((p) => dot(p, u))); return v.flatMap((p, i) => (dot(p, u) > m - 1e-9 ? [i] : [])); });
  return construir(12, v, g, 13);
})();

// ---- d10: the pentagonal trapezohedron: two apexes (T, B), a ring of five at +a, another of five at −a, turned 36° ----
const D10 = (() => {
  // the kite [T, U0, L0, U1] is flat only if the apex height h fits a: with h = 1 the plane through U0, U1, L0 meets the axis there
  const c72 = Math.cos(Math.PI * 2 / 5), s72 = Math.sin(Math.PI * 2 / 5), c36 = Math.cos(Math.PI / 5), s36 = Math.sin(Math.PI / 5);
  const plano = (a: number): number => {
    const A: Vec = [1, a, 0], B: Vec = [c72, a, s72], C: Vec = [c36, -a, s36], n = cross(sub(B, A), sub(C, A));
    return a + n[0] / n[1];                                  // the height where the plane crosses the axis (x = z = 0)
  };
  let lo = 0.01, hi = 0.5;                                    // plano(a) grows with a: bisect for plano(a) = 1
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (plano(m) > 1) hi = m; else lo = m; }
  const a = (lo + hi) / 2, v: Vec[] = [[0, 1, 0], [0, -1, 0]];
  for (let j = 0; j < 5; j++) v.push([Math.cos(j * Math.PI * 2 / 5), a, Math.sin(j * Math.PI * 2 / 5)]);        // U_j: 2 + j
  for (let j = 0; j < 5; j++) v.push([Math.cos((j + 0.5) * Math.PI * 2 / 5), -a, Math.sin((j + 0.5) * Math.PI * 2 / 5)]); // L_j: 7 + j
  const U = (j: number) => 2 + (((j % 5) + 5) % 5), L = (j: number) => 7 + (((j % 5) + 5) % 5), g: number[][] = [];
  for (let j = 0; j < 5; j++) g.push([0, U(j), L(j), U(j + 1)]);                  // the five that look up
  for (let j = 0; j < 5; j++) g.push([1, L(j + 2), U(j + 3), L(j + 3)]);          // their opposites, the five that look down
  return construir(10, v, g, 11);
})();

export const FORMAS = { 4: D4, 8: D8, 10: D10, 12: D12 } as const;
export type CarasForma = keyof typeof FORMAS;
export const esForma = (caras: number): caras is CarasForma => caras === 4 || caras === 8 || caras === 10 || caras === 12;
