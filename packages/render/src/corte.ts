// corte (U14): where a level plane cuts what stands in the zone — the walls, columns and doors of an architect's floor
// plan, for maps of worlds that say `mapa.corte` (features/entorno). Pure: no three.js, no DOM (tested in
// test/mapa-corte.test.ts). A picture from straight above cannot show a wall cut by the camera's near plane (vertical
// faces are edge-on: zero pixels), so the cut is computed from the triangles: each one that crosses the plane gives one
// segment. Cost: one pass over the triangles of the meshes the plane crosses, only when the map's picture is made.

/** The footprints a map cut at `corte` (m) still draws: only what stands wholly under the cut (`y1`, its top). A
 * building taller than the cut is drawn by its section, never as one giant box. corte 0 = all of them. */
export function bajoElCorte<T extends { y1?: number }>(hs: readonly T[], corte: number): T[] {
  return corte > 0 ? hs.filter((h) => (h.y1 ?? 0) <= corte) : hs.slice();
}

/** Segments (x0, z0, x1, z1 in metres, one after another) where the plane y = `corte` cuts a mesh's triangles, appended
 * to `out`. `pos` = x, y, z of each vertex in the mesh's own space, `idx` = three vertex numbers per triangle (null:
 * every three vertices make one), `m` = the mesh's world matrix (16 numbers, column-major like three's Matrix4). A
 * triangle lying in the plane gives nothing; one touching it at a single corner neither. Returns the segments added. */
export function cortarMalla(pos: ArrayLike<number>, idx: ArrayLike<number> | null, m: ArrayLike<number>, corte: number, out: number[]): number {
  const n = idx ? idx.length - (idx.length % 3) : Math.floor(pos.length / 9) * 3;
  const m0 = m[0], m1 = m[1], m2 = m[2], m4 = m[4], m5 = m[5], m6 = m[6], m8 = m[8], m9 = m[9], m10 = m[10], m12 = m[12], m13 = m[13], m14 = m[14];
  const yDe = (v: number) => m1 * pos[v * 3] + m5 * pos[v * 3 + 1] + m9 * pos[v * 3 + 2] + m13 - corte;
  let hechos = 0;
  // where the edge a→b meets the plane (da, db: heights over it, opposite signs)
  const punto = (a: number, b: number, da: number, db: number) => {
    const t = da / (da - db);
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const x = ax + (pos[b * 3] - ax) * t, y = ay + (pos[b * 3 + 1] - ay) * t, z = az + (pos[b * 3 + 2] - az) * t;
    out.push(m0 * x + m4 * y + m8 * z + m12, m2 * x + m6 * y + m10 * z + m14);
  };
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    const da = yDe(a), db = yDe(b), dc = yDe(c);
    // on the plane counts as above: a crossing triangle has exactly two edges with opposite signs
    const sa = da >= 0, sb = db >= 0, sc = dc >= 0;
    if (sa === sb && sb === sc) continue;
    if (sa !== sb && sa !== sc) { punto(a, b, da, db); punto(a, c, da, dc); }
    else if (sb !== sa && sb !== sc) { punto(b, a, db, da); punto(b, c, db, dc); }
    else { punto(c, a, dc, da); punto(c, b, dc, db); }
    const k = out.length;
    // a corner exactly on the plane makes both points the same: no segment
    if (out[k - 4] === out[k - 2] && out[k - 3] === out[k - 1]) { out.length = k - 4; continue; }
    hechos++;
  }
  return hechos;
}
