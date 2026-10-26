// sim/bvh.ts — M6 (stories 3 and 4): an integer BVH over the static triangles of a world (GLB floors and walls) and
// a ray against it. Same bits in Node and in the browser: integers only, float64 used only as an exact integer
// container (every product that decides something stays under 2^53 for edges ≤ ~100 m and rays ≤ ~200 m; beyond
// that the IEEE rounding is still identical on every JS engine, so the answer stays deterministic, only less exact).
// Copied and transformed (design DISENO-M6 §3.1): the tree is three-mesh-bvh's (MIT) centre split with a median
// fallback and leaves of ≤ BVH_LEAF triangles, flattened into one Int32Array; the ray is Möller–Trumbore in integers.
// World geometry, like `solids`: NOT part of the state fingerprint (both sides build it from the same shared GLB).
import { fnv1a, fxMul, FX_ONE } from "../../core/src/index.ts";

/** One triangle coordinate unit = 1/64 m (the `Transform` step) = BVH_UNIT in Q16.16. */
export const BVH_UNIT = FX_ONE / 64; // 1024
/** Triangles are 9 ints each: x0 y0 z0 x1 y1 z1 x2 y2 z2, in 1/64 m. */
export const TRI_STRIDE = 9;
/** Nodes are 8 ints each: minx miny minz maxx maxy maxz a n. n > 0: leaf, `a` = first entry of `idx`, `n` triangles.
 * n = 0: inner node, left child = this + 1, right child = `a`. Bounds in 1/64 m. */
export const NODE_STRIDE = 8;
export const BVH_LEAF = 8;
export const BVH_MAX_DEPTH = 48;
/** Most triangles one tree takes (the median fallback packs centroid and index into one float64 key). */
export const BVH_TRIS_MAX = 1 << 20;

export type Bvh = { tris: Int32Array; nodes: Int32Array; idx: Int32Array; count: number; nodeCount: number };
/** A hit: distance `t` and point (Q16.16, metres), unit normal facing the ray (Q16.16), triangle number. */
export type Hit = { t: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; tri: number };

/** Triangles (1/64 m) from vertex positions in metres (x y z …) and optional triangle indices (as a GLB gives them).
 * Rounds each coordinate to the nearest 1/64 m; the server and the page quantize the same floats the same way. */
export function quantizeTriangles(xyz: ArrayLike<number>, indices?: ArrayLike<number> | null): Int32Array {
  const n = indices ? (indices.length / 3) | 0 : (xyz.length / 9) | 0;
  const out = new Int32Array(n * TRI_STRIDE);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const v = indices ? indices[t * 3 + k] : t * 3 + k;
      out[t * TRI_STRIDE + k * 3] = Math.round(xyz[v * 3] * 64) | 0;
      out[t * TRI_STRIDE + k * 3 + 1] = Math.round(xyz[v * 3 + 1] * 64) | 0;
      out[t * TRI_STRIDE + k * 3 + 2] = Math.round(xyz[v * 3 + 2] * 64) | 0;
    }
  }
  return out;
}

/** Build the tree. `tris` are kept by reference (do not change them afterwards). */
export function buildBvh(tris: Int32Array): Bvh {
  const n = (tris.length / TRI_STRIDE) | 0;
  if (n > BVH_TRIS_MAX) throw new Error(`bvh: ${n} triangles, at most ${BVH_TRIS_MAX}`);
  const bmin = new Int32Array(n * 3), bmax = new Int32Array(n * 3), cen = new Int32Array(n * 3);
  for (let t = 0; t < n; t++) {
    const o = t * TRI_STRIDE;
    for (let a = 0; a < 3; a++) {
      const p = tris[o + a], q = tris[o + 3 + a], r = tris[o + 6 + a];
      bmin[t * 3 + a] = p < q ? (p < r ? p : r) : q < r ? q : r;
      bmax[t * 3 + a] = p > q ? (p > r ? p : r) : q > r ? q : r;
      cen[t * 3 + a] = p + q + r; // three times the centroid: no division
    }
  }
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const nodes = new Int32Array(Math.max(1, 2 * n) * NODE_STRIDE);
  let nodeCount = 0;

  const build = (start: number, end: number, depth: number): number => {
    const node = nodeCount++, o = node * NODE_STRIDE;
    let x0 = 0x7fffffff, y0 = 0x7fffffff, z0 = 0x7fffffff, x1 = -0x80000000, y1 = -0x80000000, z1 = -0x80000000;
    let cx0 = 0x7fffffff, cy0 = 0x7fffffff, cz0 = 0x7fffffff, cx1 = -0x80000000, cy1 = -0x80000000, cz1 = -0x80000000;
    for (let i = start; i < end; i++) {
      const t = idx[i] * 3;
      if (bmin[t] < x0) x0 = bmin[t]; if (bmax[t] > x1) x1 = bmax[t];
      if (bmin[t + 1] < y0) y0 = bmin[t + 1]; if (bmax[t + 1] > y1) y1 = bmax[t + 1];
      if (bmin[t + 2] < z0) z0 = bmin[t + 2]; if (bmax[t + 2] > z1) z1 = bmax[t + 2];
      if (cen[t] < cx0) cx0 = cen[t]; if (cen[t] > cx1) cx1 = cen[t];
      if (cen[t + 1] < cy0) cy0 = cen[t + 1]; if (cen[t + 1] > cy1) cy1 = cen[t + 1];
      if (cen[t + 2] < cz0) cz0 = cen[t + 2]; if (cen[t + 2] > cz1) cz1 = cen[t + 2];
    }
    nodes[o] = x0; nodes[o + 1] = y0; nodes[o + 2] = z0; nodes[o + 3] = x1; nodes[o + 4] = y1; nodes[o + 5] = z1;
    const count = end - start;
    if (count <= BVH_LEAF || depth >= BVH_MAX_DEPTH) { nodes[o + 6] = start; nodes[o + 7] = count; return node; }
    // split the longest centroid extent at its centre (three-mesh-bvh CENTER); every centroid equal → halve
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const lo = axis === 0 ? cx0 : axis === 1 ? cy0 : cz0, hi = axis === 0 ? cx1 : axis === 1 ? cy1 : cz1;
    let mid: number;
    if (hi === lo) mid = (start + end) >> 1;
    else {
      const split = Math.floor((lo + hi) / 2);
      let i = start, j = end - 1;
      while (i <= j) {
        if (cen[idx[i] * 3 + axis] < split) i++;
        else { const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; j--; }
      }
      mid = i;
      if (mid === start || mid === end) { // one side empty: median by (centroid, triangle number), a total order
        const keys = new Float64Array(count);
        for (let k = 0; k < count; k++) keys[k] = cen[idx[start + k] * 3 + axis] * BVH_TRIS_MAX + idx[start + k];
        keys.sort();
        for (let k = 0; k < count; k++) { const c = Math.floor(keys[k] / BVH_TRIS_MAX); idx[start + k] = keys[k] - c * BVH_TRIS_MAX; }
        mid = (start + end) >> 1;
      }
    }
    nodes[o + 7] = 0;
    build(start, mid, depth + 1);
    nodes[o + 6] = build(mid, end, depth + 1);
    return node;
  };
  if (n > 0) build(0, n, 0);
  else { nodeCount = 1; nodes[6] = 0; nodes[7] = 0; }
  return { tris, nodes: nodes.subarray(0, nodeCount * NODE_STRIDE), idx, count: n, nodeCount };
}

/** FNV-1a over the flat tree (nodes, then the triangle order): equal on every machine for the same triangles. */
export function bvhFingerprint(b: Bvh): number {
  const h = fnv1a(new Uint8Array(b.nodes.buffer, b.nodes.byteOffset, b.nodes.byteLength));
  return fnv1a(new Uint8Array(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength), h);
}

/** Triangle's own AABB (Q16.16 metres), from its three vertices (1/64 m ints). */
export function triAabb(b: Bvh, tri: number): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } {
  const q = tri * TRI_STRIDE, tris = b.tris;
  let x0 = tris[q], x1 = tris[q], y0 = tris[q + 1], y1 = tris[q + 1], z0 = tris[q + 2], z1 = tris[q + 2];
  for (let v = 1; v < 3; v++) {
    const vx = tris[q + v * 3], vy = tris[q + v * 3 + 1], vz = tris[q + v * 3 + 2];
    if (vx < x0) x0 = vx; if (vx > x1) x1 = vx;
    if (vy < y0) y0 = vy; if (vy > y1) y1 = vy;
    if (vz < z0) z0 = vz; if (vz > z1) z1 = vz;
  }
  return { x0: x0 * BVH_UNIT, y0: y0 * BVH_UNIT, z0: z0 * BVH_UNIT, x1: x1 * BVH_UNIT, y1: y1 * BVH_UNIT, z1: z1 * BVH_UNIT };
}

/** Triangle's unit normal (Q16.16), always facing up (ny >= 0: a vertical wall keeps ny = 0 either way). Used to
 * decide floor/ramp vs wall (M6 h6: a triangle steeper than MAX_SLOPE_COS is a wall, whichever way it winds). */
export function triNormal(b: Bvh, tri: number): { nx: number; ny: number; nz: number } {
  const q = tri * TRI_STRIDE, tris = b.tris;
  const e1x = tris[q + 3] - tris[q], e1y = tris[q + 4] - tris[q + 1], e1z = tris[q + 5] - tris[q + 2];
  const e2x = tris[q + 6] - tris[q], e2y = tris[q + 7] - tris[q + 1], e2z = tris[q + 8] - tris[q + 2];
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const len = isqrt(nx * nx + ny * ny + nz * nz) || 1;
  return { nx: Math.trunc((nx * FX_ONE) / len) | 0, ny: Math.trunc((ny * FX_ONE) / len) | 0, nz: Math.trunc((nz * FX_ONE) / len) | 0 };
}

const BOX_STACK = new Int32Array(2 * BVH_MAX_DEPTH + 4);
/** Triangles (indices) whose own AABB overlaps the box [x0,y0,z0]-[x1,y1,z1] (Q16.16 metres). Exact per triangle,
 * not just the node's box: a candidate node is only a hint. M6 h5: the body-vs-mesh query (box-triangle). */
export function boxBvh(b: Bvh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const out: number[] = [];
  if (b.count === 0) return out;
  const nodes = b.nodes, idx = b.idx;
  let sp = 0;
  BOX_STACK[sp++] = 0;
  while (sp > 0) {
    const node = BOX_STACK[--sp], o = node * NODE_STRIDE;
    const bx0 = (nodes[o] - 1) * BVH_UNIT, by0 = (nodes[o + 1] - 1) * BVH_UNIT, bz0 = (nodes[o + 2] - 1) * BVH_UNIT;
    const bx1 = (nodes[o + 3] + 1) * BVH_UNIT, by1 = (nodes[o + 4] + 1) * BVH_UNIT, bz1 = (nodes[o + 5] + 1) * BVH_UNIT;
    if (x1 <= bx0 || x0 >= bx1 || y1 <= by0 || y0 >= by1 || z1 <= bz0 || z0 >= bz1) continue;
    const n = nodes[o + 7];
    if (n === 0) { BOX_STACK[sp++] = nodes[o + 6]; BOX_STACK[sp++] = node + 1; continue; }
    const first = nodes[o + 6];
    for (let k = 0; k < n; k++) {
      const tri = idx[first + k];
      const t = triAabb(b, tri);
      if (x1 <= t.x0 || x0 >= t.x1 || y1 <= t.y0 || y0 >= t.y1 || z1 <= t.z0 || z0 >= t.z1) continue;
      out.push(tri);
    }
  }
  return out;
}

/** Integer square root (floor) of an exact integer n < 2^53. Math.sqrt is correctly rounded by IEEE 754, so the seed
 * is the same everywhere; the two loops make it the exact floor anyway. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

const STACK = new Int32Array(2 * BVH_MAX_DEPTH + 4);

/**
 * The nearest triangle along the ray from (ox, oy, oz) in direction (dx, dy, dz), up to `max` metres away — all in
 * Q16.16 metres, `d` of length FX_ONE for `t` to be metres (any length works: `t` scales with it). Returns null when
 * nothing is hit. Deterministic: the same ints in on every machine give the same hit out.
 */
export function rayBvh(b: Bvh, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): Hit | null {
  if (b.count === 0 || max <= 0 || (dx === 0 && dy === 0 && dz === 0)) return null;
  const nodes = b.nodes, idx = b.idx, tris = b.tris;
  // slab test against node boxes: parameters as t in Q16.16 metres (float64 here only for culling, one unit padded)
  const ix = dx !== 0 ? FX_ONE / dx : 0, iy = dy !== 0 ? FX_ONE / dy : 0, iz = dz !== 0 ? FX_ONE / dz : 0;
  let best = max, hitTri = -1;
  let sp = 0;
  STACK[sp++] = 0;
  while (sp > 0) {
    const node = STACK[--sp], o = node * NODE_STRIDE;
    // box in Q16.16, one unit of padding each side
    const bx0 = (nodes[o] - 1) * BVH_UNIT, by0 = (nodes[o + 1] - 1) * BVH_UNIT, bz0 = (nodes[o + 2] - 1) * BVH_UNIT;
    const bx1 = (nodes[o + 3] + 1) * BVH_UNIT, by1 = (nodes[o + 4] + 1) * BVH_UNIT, bz1 = (nodes[o + 5] + 1) * BVH_UNIT;
    let t0 = 0, t1 = best;
    if (dx !== 0) { const a = (bx0 - ox) * ix, c = (bx1 - ox) * ix; const lo = a < c ? a : c, hi = a < c ? c : a; if (lo > t0) t0 = lo; if (hi < t1) t1 = hi; }
    else if (ox < bx0 || ox > bx1) continue;
    if (dy !== 0) { const a = (by0 - oy) * iy, c = (by1 - oy) * iy; const lo = a < c ? a : c, hi = a < c ? c : a; if (lo > t0) t0 = lo; if (hi < t1) t1 = hi; }
    else if (oy < by0 || oy > by1) continue;
    if (dz !== 0) { const a = (bz0 - oz) * iz, c = (bz1 - oz) * iz; const lo = a < c ? a : c, hi = a < c ? c : a; if (lo > t0) t0 = lo; if (hi < t1) t1 = hi; }
    else if (oz < bz0 || oz > bz1) continue;
    if (t0 > t1) continue;
    const n = nodes[o + 7];
    if (n === 0) { STACK[sp++] = nodes[o + 6]; STACK[sp++] = node + 1; continue; } // left first (nearer in build order is not known: both are tested against `best`)
    const first = nodes[o + 6];
    for (let k = 0; k < n; k++) {
      const tri = idx[first + k], q = tri * TRI_STRIDE;
      // Möller–Trumbore. Edges in 1/64 m; s = origin − v0 in Q16.16 (1024 × finer), so u, v come out × 1024.
      const e1x = tris[q + 3] - tris[q], e1y = tris[q + 4] - tris[q + 1], e1z = tris[q + 5] - tris[q + 2];
      const e2x = tris[q + 6] - tris[q], e2y = tris[q + 7] - tris[q + 1], e2z = tris[q + 8] - tris[q + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      let det = e1x * px + e1y * py + e1z * pz;
      if (det === 0) continue; // parallel
      const sx = ox - tris[q] * BVH_UNIT, sy = oy - tris[q + 1] * BVH_UNIT, sz = oz - tris[q + 2] * BVH_UNIT;
      let u = sx * px + sy * py + sz * pz;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      let v = dx * qx + dy * qy + dz * qz;
      let num = e2x * qx + e2y * qy + e2z * qz; // τ·det, τ = how many `d` to the plane (both s and d are Q16.16)
      if (det < 0) { det = -det; u = -u; v = -v; num = -num; }
      const lim = det * BVH_UNIT; // u and v carry s's extra 1024
      if (u < 0 || v < 0 || u + v > lim || num < 0) continue;
      // t in Q16.16 metres (for |d| = FX_ONE) = τ·FX_ONE. One IEEE division (correctly rounded everywhere), then an
      // exact power-of-two scale: the same float on every engine, exact to 2^-33 m for rays of 2^20 units.
      const t = (num / det) * FX_ONE;
      if (t >= best) continue; // not nearer than what we have (or beyond max)
      best = Math.floor(t); hitTri = tri;
    }
  }
  if (hitTri < 0) return null;
  const q = hitTri * TRI_STRIDE;
  const e1x = tris[q + 3] - tris[q], e1y = tris[q + 4] - tris[q + 1], e1z = tris[q + 5] - tris[q + 2];
  const e2x = tris[q + 6] - tris[q], e2y = tris[q + 7] - tris[q + 1], e2z = tris[q + 8] - tris[q + 2];
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; } // face the ray
  const len = isqrt(nx * nx + ny * ny + nz * nz) || 1;
  return {
    t: best,
    x: ox + fxMul(dx, best), y: oy + fxMul(dy, best), z: oz + fxMul(dz, best),
    nx: Math.trunc((nx * FX_ONE) / len) | 0, ny: Math.trunc((ny * FX_ONE) / len) | 0, nz: Math.trunc((nz * FX_ONE) / len) | 0,
    tri: hitTri,
  };
}

/** Two meshes in one tree (a world with a `malla` GLB AND naturaleza): the triangles of both, rebuilt. null + null = null. */
export function combinarMallas(a: Bvh | null, b: Bvh | null): Bvh | null {
  if (!a || a.count === 0) return b && b.count ? b : null;
  if (!b || b.count === 0) return a;
  const tris = new Int32Array(a.tris.length + b.tris.length);
  tris.set(a.tris, 0); tris.set(b.tris, a.tris.length);
  return buildBvh(tris);
}
