// hacer-terreno (M6b): writes activos/terreno/loma.glb, a 20×20 m heightmap grid with one gentle hill (loma),
// vertex-coloured by height band (green low, brown mid, pale grey the peak: "malla pintada por capas"). Placed
// in the world with colision: "malla" it becomes a collider through the M6 pipeline already merged
// (packages/server/src/colision-glb.ts + colision-mundo.ts): no sim change needed, the heightmap IS the source of
// the triangles M6 already walks, climbs and slides on (groundHeight / blockedMesh, slope ≤ 50°).
// Own work, CC0. Deterministic: same bytes every run, so its sha256 never moves.
// Run: node tools/hacer-terreno.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const N = 20;              // quads per side (21×21 vertices)
const HALF = 10;           // metres, half-extent (-10..10)
const AMPL = 2;             // hill height, metres
const SIGMA = 5;            // hill width, metres (gentle: max slope ≈ 14°, well under M6's 50° limit)
const STEP = (2 * HALF) / N;

const h = (x, z) => AMPL * Math.exp(-(x * x + z * z) / (2 * SIGMA * SIGMA));
const EPS = 0.01;
function normalAt(x, z) {
  const dhdx = (h(x + EPS, z) - h(x - EPS, z)) / (2 * EPS);
  const dhdz = (h(x, z + EPS) - h(x, z - EPS)) / (2 * EPS);
  const n = [-dhdx, 1, -dhdz], len = Math.hypot(...n);
  return n.map((v) => v / len);
}
/** Three bands by height (M6b: "malla pintada por capas"). */
function colorAt(y) {
  if (y < 0.4) return [0.3, 0.55, 0.25];     // grass
  if (y < 1.2) return [0.55, 0.42, 0.28];    // dirt
  return [0.85, 0.85, 0.82];                 // pale rock/snow near the top
}

const pos = [], nor = [], col = [], idx = [];
const rowOf = (j) => j * (N + 1);
for (let j = 0; j <= N; j++) {
  const z = -HALF + j * STEP;
  for (let i = 0; i <= N; i++) {
    const x = -HALF + i * STEP, y = h(x, z);
    pos.push(x, y, z);
    nor.push(...normalAt(x, z));
    col.push(...colorAt(y));
  }
}
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const a = rowOf(j) + i, b = a + 1, c = rowOf(j + 1) + i, d = c + 1;
    idx.push(a, c, b, b, c, d); // wound so the normal points +y (ccw seen from above)
  }
}

const P = new Float32Array(pos), NO = new Float32Array(nor), C = new Float32Array(col), I = new Uint16Array(idx);
const parts = [Buffer.from(P.buffer), Buffer.from(NO.buffer), Buffer.from(C.buffer), Buffer.from(I.buffer)];
const bin = Buffer.concat(parts);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);

const bbMinY = 0, bbMaxY = AMPL;
const gltf = {
  asset: { version: "2.0", generator: "numinia-engine tools/hacer-terreno.mjs", copyright: "CC0 1.0 (Numen Games, own work)" },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "loma" }],
  meshes: [{ name: "loma", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: "terreno", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.95 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: P.length / 3, type: "VEC3", min: [-HALF, bbMinY, -HALF], max: [HALF, bbMaxY, HALF] },
    { bufferView: 1, componentType: 5126, count: NO.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5126, count: C.length / 3, type: "VEC3" },
    { bufferView: 3, componentType: 5123, count: I.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: P.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength, byteLength: NO.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength + NO.byteLength, byteLength: C.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength + NO.byteLength + C.byteLength, byteLength: I.byteLength, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};
const json = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
jh.writeUInt32LE(jsonPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, jsonPadded, bh, binPadded]);
mkdirSync(new URL("../activos/terreno/", import.meta.url), { recursive: true });
writeFileSync(new URL("../activos/terreno/loma.glb", import.meta.url), glb);
console.log(`activos/terreno/loma.glb · ${glb.length} bytes · sha256 ${createHash("sha256").update(glb).digest("hex")}`);
