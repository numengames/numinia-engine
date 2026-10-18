// Test terrain for the BVH tests: the same triangles in Node and in the browser (integers only, no Math.sin).
// A grid of `cells` × `cells` squares, `size` metres wide, with a gentle integer relief; two triangles per square
// → 2·cells² triangles (cells 158 ≈ 50k). Coordinates in 1/64 m, 9 ints per triangle.
import { TRI_STRIDE } from "../packages/sim/src/bvh.ts";
export { buildBvh, bvhFingerprint, rayBvh } from "../packages/sim/src/bvh.ts"; // the browser bundle entry

export function terrainTriangles(cells: number, size: number): Int32Array {
  const out = new Int32Array(cells * cells * 2 * TRI_STRIDE);
  const stepU = Math.round((size * 64) / cells);          // one cell in 1/64 m
  const half = Math.round((size * 64) / 2);
  const h = (i: number, j: number): number => ((i * 7 + j * 13) % 11) * 8 - 40 + (((i * j) % 5) * 6); // relief, 1/64 m
  let o = 0;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const x0 = i * stepU - half, x1 = x0 + stepU, z0 = j * stepU - half, z1 = z0 + stepU;
    const a = [x0, h(i, j), z0], b = [x1, h(i + 1, j), z0], c = [x1, h(i + 1, j + 1), z1], d = [x0, h(i, j + 1), z1];
    for (const v of [a, b, c, a, c, d]) { out[o++] = v[0]; out[o++] = v[1]; out[o++] = v[2]; }
  }
  return out;
}
