// hacer-bloque: writes activos/casa/bloque.glb, the house block (1 m cube sitting on the ground, warm stone).
// Own work, CC0. Deterministic: same bytes every run, so its sha256 (features/objetos/biblioteca.json) never moves.
// Run: node tools/hacer-bloque.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const faces = [ // normal, u, v with u × v = normal: corners c ± u/2 ± v/2 come out counter-clockwise seen from outside
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const pos = [], nor = [], idx = [];
for (const [n, u, v] of faces) {
  const c = [n[0] * 0.5, 0.5 + n[1] * 0.5, n[2] * 0.5], base = pos.length / 3;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < 3; k++) pos.push(c[k] + (a * u[k] + b * v[k]) / 2);
    nor.push(...n);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const P = new Float32Array(pos), N = new Float32Array(nor), I = new Uint16Array(idx);
const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(I.buffer)]);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const gltf = {
  asset: { version: "2.0", generator: "numinia-engine tools/hacer-bloque.mjs", copyright: "CC0 1.0 (Numen Games, own work)" },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "bloque" }],
  meshes: [{ name: "bloque", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "piedra", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.64, 0.38, 1], metallicFactor: 0, roughnessFactor: 0.85 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: P.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength, byteLength: N.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength + N.byteLength, byteLength: I.byteLength, target: 34963 },
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
mkdirSync(new URL("../activos/casa/", import.meta.url), { recursive: true });
writeFileSync(new URL("../activos/casa/bloque.glb", import.meta.url), glb);
console.log(`activos/casa/bloque.glb · ${glb.length} bytes · sha256 ${createHash("sha256").update(glb).digest("hex")}`);
