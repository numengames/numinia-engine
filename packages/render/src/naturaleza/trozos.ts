// trozos (E02 · RT1 «trozos y relevo de detalle»): the terrain lattice cut into ~64 m chunks with TWO detail rings, drawn in
// ONE draw call. Pure (no three.js): the terrain (terreno.ts) owns the mesh; this owns which triangles go into its index.
//
// Why ONE draw call (E01: the nature's calls are already at the cap A 8 · B 7 · C 6 · D 5): every chunk keeps its triangles
// as two INDEX RANGES (fine = the lattice's own split, coarse = every second vertex) over the SAME shared vertex buffer. When
// the camera moves, the chosen ranges are copied one after another into the mesh's index buffer and the draw range is set to
// their sum. Same vertex buffer, same material, same single `drawIndexed`: chunks cost no draw call, only an index upload
// (≤ 2 bytes × 3 per triangle) when the choice changes. A `BatchedMesh` (three r186, multi-draw) was the other candidate: one
// call per page on WebGL2, but WebGPU r186 issues one `drawIndexed` per instance, and it would need its own material path
// (batching nodes); index ranges cost nothing on either backend. starwild.io does the same on the far side (one call per page
// of chunks, `multiDraw`: work/starwild/INGENIERIA-INVERSA.md §3.4) — the idea, not the code.
//
// Seams and popping (copied idea: F. Strugar, «Continuous Distance-Dependent Level of Detail for Rendering Heightmaps»
// (CDLOD), JGT 2009, https://github.com/fstrugar/CDLOD — vertices morph toward the coarse level by camera distance BEFORE the
// switch; starwild's «detail handover» does it with a dither instead): every lattice vertex carries the value the COARSE
// surface has at its place (height, colour, normal: `gruesoEn`). The vertex shader blends toward it with `factorRelevo(d)`,
// which reaches exactly 1 at 0.95 × the detail radius. A chunk is fine only while some point of it is closer than the radius,
// so every vertex of a fine chunk that touches a coarse chunk is already fully morphed: the fine side lies exactly on the
// coarse side's edges (no crack) and the switch fine → coarse changes nothing on screen (no pop).
//
// Why the coarse split can alternate its diagonals: the fine lattice (terreno.ts) splits cell (i, j) along a–d when i + j is
// even and along b–c when odd, so every 2 × 2 block that starts on even (i, j) has BOTH diagonals through its centre. Either
// coarse diagonal therefore contains whole fine triangles, and the fully morphed fine block equals the coarse block.
// The coarse cell uses the same parity rule as the fine one (less regular look).

/** Per-tier settings: chunk side (m, rounded to an even number of lattice cells) and the detail radius (m). */
export type OpcionesTrozos = { lado: number; radioDetalle: number };
/** E02 default: 64 m chunks (catalogue RT1), fine ring = chunks closer than 64 m. */
export const TROZOS_DEFECTO: OpcionesTrozos = { lado: 64, radioDetalle: 64 };
/** The handover band, as fractions of the detail radius: morph starts at 0.6 R and is complete (exactly 1) at 0.95 R. */
export const RELEVO: readonly [number, number] = [0.6, 0.95];

/** Lattice cells per chunk for a lattice step `paso` (m): the even count closest to `lado` metres (≥ 2). */
export function celdasPorTrozo(paso: number, lado: number): number {
  return Math.max(2, 2 * Math.round(lado / paso / 2));
}

/** Smoothstep 0…1 of the morph by horizontal distance `d` (m) for a detail radius `radio`: the CPU twin of the shader. */
export function factorRelevo(d: number, radio: number): number {
  const a = RELEVO[0] * radio, b = RELEVO[1] * radio, t = Math.min(1, Math.max(0, (d - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export type Trozo = { i0: number; j0: number; i1: number; j1: number; x0: number; z0: number; x1: number; z1: number; fino: Uint32Array; grueso: Uint32Array };

/** Fine triangles of the cells [i0, i1) × [j0, j1) of an n-cell lattice (nv = n + 1 per row): the same split and winding as terreno.ts. */
export function indicesFinos(n: number, i0: number, j0: number, i1: number, j1: number): Uint32Array {
  const nv = n + 1, out = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
  let t = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const ka = j * nv + i, kb = ka + 1, kc = ka + nv, kd = kc + 1;
    if ((i + j) & 1) { out[t++] = ka; out[t++] = kc; out[t++] = kb; out[t++] = kb; out[t++] = kc; out[t++] = kd; }
    else { out[t++] = ka; out[t++] = kc; out[t++] = kd; out[t++] = ka; out[t++] = kd; out[t++] = kb; }
  }
  return out;
}
/** Coarse triangles of the same cells: 2 × 2 blocks (i0, j0, i1, j1 even), corners on even lattice vertices, diagonal by block parity. */
export function indicesGruesos(n: number, i0: number, j0: number, i1: number, j1: number): Uint32Array {
  const nv = n + 1, out = new Uint32Array(((i1 - i0) / 2) * ((j1 - j0) / 2) * 6);
  let t = 0;
  for (let j = j0; j < j1; j += 2) for (let i = i0; i < i1; i += 2) {
    const ka = j * nv + i, kb = ka + 2, kc = ka + 2 * nv, kd = kc + 2;
    if (((i >> 1) + (j >> 1)) & 1) { out[t++] = ka; out[t++] = kc; out[t++] = kb; out[t++] = kb; out[t++] = kc; out[t++] = kd; }
    else { out[t++] = ka; out[t++] = kc; out[t++] = kd; out[t++] = ka; out[t++] = kd; out[t++] = kb; }
  }
  return out;
}

/**
 * The value the COARSE surface takes at every lattice vertex, for a per-vertex field A with `comp` components (height: 1,
 * colour/normal: 3). Even vertices keep theirs; edge midpoints take the mean of the two ends; block centres the mean of the
 * coarse diagonal they lie on. n must be even.
 */
export function gruesoEn(A: ArrayLike<number>, n: number, comp: number): Float32Array {
  const nv = n + 1, out = new Float32Array(nv * nv * comp);
  const v = (i: number, j: number, q: number) => A[(j * nv + i) * comp + q];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
    const k = (j * nv + i) * comp, oi = i & 1, oj = j & 1;
    for (let q = 0; q < comp; q++) {
      let r: number;
      if (!oi && !oj) r = v(i, j, q);
      else if (oi && !oj) r = (v(i - 1, j, q) + v(i + 1, j, q)) / 2;
      else if (!oi && oj) r = (v(i, j - 1, q) + v(i, j + 1, q)) / 2;
      else { // block centre: on the diagonal of its coarse cell (I, J) = ((i−1)/2, (j−1)/2)
        const I = (i - 1) >> 1, J = (j - 1) >> 1;
        r = (I + J) & 1 ? (v(i + 1, j - 1, q) + v(i - 1, j + 1, q)) / 2 : (v(i - 1, j - 1, q) + v(i + 1, j + 1, q)) / 2;
      }
      out[k + q] = r;
    }
  }
  return out;
}

/** Height of the coarse surface at a world point (lattice heights H, n cells, side tam centred on 0): what loose props are shifted by. */
export function alturaGruesaEn(H: ArrayLike<number>, n: number, tam: number, x: number, z: number): number {
  const nv = n + 1, mitad = tam / 2, paso2 = (tam / n) * 2, m = n / 2;
  const fi = Math.min(m - 1e-6, Math.max(0, (x + mitad) / paso2)), fj = Math.min(m - 1e-6, Math.max(0, (z + mitad) / paso2)), I = Math.floor(fi), J = Math.floor(fj), u = fi - I, v = fj - J;
  const a = H[2 * J * nv + 2 * I], b = H[2 * J * nv + 2 * I + 2], c = H[(2 * J + 2) * nv + 2 * I], d = H[(2 * J + 2) * nv + 2 * I + 2];
  if ((I + J) & 1) return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  return u <= v ? a + v * (c - a) + u * (d - c) : a + u * (b - a) + v * (d - b);
}

export type Rejilla = { n: number; tam: number; opciones?: OpcionesTrozos };
/** Cut an n-cell lattice (side `tam`, centred on 0) into chunks of k cells (the last row/column may be shorter; always even). */
export function partir(r: Rejilla): { k: number; lado: number; trozos: Trozo[] } {
  const o = r.opciones ?? TROZOS_DEFECTO, paso = r.tam / r.n, mitad = r.tam / 2, k = celdasPorTrozo(paso, o.lado), trozos: Trozo[] = [];
  if (r.n & 1) throw new Error(`trozos: the lattice needs an even number of cells (n = ${r.n})`);
  for (let j0 = 0; j0 < r.n; j0 += k) for (let i0 = 0; i0 < r.n; i0 += k) {
    const i1 = Math.min(r.n, i0 + k), j1 = Math.min(r.n, j0 + k);
    trozos.push({ i0, j0, i1, j1, x0: -mitad + i0 * paso, z0: -mitad + j0 * paso, x1: -mitad + i1 * paso, z1: -mitad + j1 * paso, fino: indicesFinos(r.n, i0, j0, i1, j1), grueso: indicesGruesos(r.n, i0, j0, i1, j1) });
  }
  return { k, lado: k * paso, trozos };
}

/** Horizontal distance from (x, z) to a chunk's box (0 inside). */
export const distanciaATrozo = (t: Trozo, x: number, z: number) => Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1));

export type EstadisticasTrozos = { trozos: number; finos: number; gruesos: number; triangulos: number; triangulosMalla: number; cambios: number; ladoM: number; celdas: number };
export type Trozos = {
  /** Choose each chunk's ring for a camera at (x, z) and rewrite the index when the choice changed. Returns true if it changed. */
  actualizar(x: number, z: number): boolean;
  /** Indices to draw (the mesh's draw range count) and the first index that changes between choices. */
  readonly cuenta: number; readonly inicio: number;
  readonly trozos: readonly Trozo[];
  /** Fine (true) or coarse per chunk, as last chosen. */
  readonly finos: readonly boolean[];
  estadisticas(): EstadisticasTrozos;
};

/**
 * Drive one index buffer: `indice` holds the constant `sueltos` (loose triangles: skirt, painted pond, baked Residuos/flora) at
 * the start, then the chosen chunk ranges. `indice` must be at least sueltos + every chunk's fine range long (the worst case).
 */
export function crearTrozos(r: Rejilla, indice: Uint16Array | Uint32Array, sueltos: ArrayLike<number>): Trozos {
  const { k, lado, trozos } = partir(r), radio = (r.opciones ?? TROZOS_DEFECTO).radioDetalle, inicio = sueltos.length;
  const maximo = inicio + trozos.reduce((s, t) => s + t.fino.length, 0);
  if (indice.length < maximo) throw new Error(`trozos: index too short (${indice.length} < ${maximo})`);
  for (let q = 0; q < inicio; q++) indice[q] = sueltos[q];
  const finos = trozos.map(() => true);
  let cuenta = 0, cambios = 0, primera = true;
  const escribir = () => {
    let p = inicio;
    for (let q = 0; q < trozos.length; q++) { const s = finos[q] ? trozos[q].fino : trozos[q].grueso; indice.set(s, p); p += s.length; }
    cuenta = p;
  };
  escribir();
  return {
    actualizar(x, z) {
      let cambia = primera; primera = false;
      for (let q = 0; q < trozos.length; q++) { const f = distanciaATrozo(trozos[q], x, z) < radio; if (f !== finos[q]) { finos[q] = f; cambia = true; } }
      if (cambia) { escribir(); cambios++; }
      return cambia;
    },
    get cuenta() { return cuenta; }, inicio, trozos, finos,
    estadisticas() {
      const nf = finos.filter(Boolean).length;
      return { trozos: trozos.length, finos: nf, gruesos: trozos.length - nf, triangulos: cuenta / 3, triangulosMalla: maximo / 3, cambios, ladoM: Math.round(lado * 10) / 10, celdas: k };
    },
  };
}
