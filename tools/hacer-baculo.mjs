// hacer-baculo: writes activos/casa/baculo.glb, the Director's staff (features/baculo). A low-poly golden staff, 1.3 m
// tall, standing on its foot (origin at the centre of the base): an eight-sided shaft, three collars, a diamond-shaped
// head and a small finial. ONE mesh, ONE flat colour (the house's Ámbar, STD-023 «legendaria» #EFA517), flat shading,
// under 300 triangles (the test counts them). Own work, CC0. Deterministic: same bytes every run, so its sha256
// (features/objetos/biblioteca.json, features/baculo/client.ts) never moves.
// Run: node tools/hacer-baculo.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const pos = [], nor = [], idx = [];
const r4 = (v) => Math.round(v * 1e4) / 1e4; // fixed decimals: the same floats on every machine
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => r4(x / l)); };
/** One flat triangle (counter-clockwise seen from outside): its own three vertices and its face normal. */
function tri(a, b, c) {
  const n = unit(cruz(sub(b, a), sub(c, a))), base = pos.length / 3;
  for (const p of [a, b, c]) { pos.push(r4(p[0]), r4(p[1]), r4(p[2])); nor.push(...n); }
  idx.push(base, base + 1, base + 2);
}
const anillo = (r, y, lados, giro = 0) => Array.from({ length: lados }, (_, i) => { const t = giro + (2 * Math.PI * i) / lados; return [r * Math.cos(t), y, r * Math.sin(t)]; });
/** A prism of `lados` sides between two heights (radius r0 at the foot, r1 at the top), capped both ends. */
function prisma(r0, r1, y0, y1, lados) {
  const a = anillo(r0, y0, lados), b = anillo(r1, y1, lados);
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    tri(a[i], b[i], b[j]); tri(a[i], b[j], a[j]);
  }
  for (let i = 1; i < lados - 1; i++) { tri(b[0], b[i + 1], b[i]); tri(a[0], a[i], a[i + 1]); }
}
/** A bipyramid (a diamond): `lados` sides, widest at y, `abajo` below and `arriba` above. */
function diamante(r, y, abajo, arriba, lados, giro = 0) {
  const e = anillo(r, y, lados, giro);
  for (let i = 0; i < lados; i++) { const j = (i + 1) % lados; tri(e[j], e[i], [0, y + arriba, 0]); tri(e[i], e[j], [0, y - abajo, 0]); }
}

prisma(0.012, 0.022, 0, 0.05, 8);          // the foot's tip
prisma(0.022, 0.022, 0.05, 1.05, 8);       // the shaft
prisma(0.045, 0.045, 0.28, 0.32, 8);       // grip collar
prisma(0.045, 0.045, 0.62, 0.66, 8);       // middle collar
prisma(0.05, 0.05, 1.03, 1.08, 8);         // the collar under the head
diamante(0.085, 1.2, 0.12, 0.14, 8, Math.PI / 8); // the head
diamante(0.022, 1.36, 0.02, 0.07, 4);      // the finial

const P = new Float32Array(pos), N = new Float32Array(nor), I = new Uint16Array(idx);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
const vistas = [], bins = [];
let off = 0;
for (const [arr, target] of [[P, 34962], [N, 34962], [I, 34963]]) {
  const b = Buffer.from(arr.buffer), pad = Buffer.alloc((4 - (b.length % 4)) % 4);
  vistas.push({ buffer: 0, byteOffset: off, byteLength: b.length, target });
  bins.push(b, pad); off += b.length + pad.length;
}
const bin = Buffer.concat(bins);
const gltf = {
  asset: { version: "2.0", generator: "numinia-engine tools/hacer-baculo.mjs", copyright: "CC0 1.0 (Numen Games, own work)" },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "baculo" }],
  meshes: [{ name: "baculo", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "ambar", pbrMetallicRoughness: { baseColorFactor: [0.937, 0.647, 0.09, 1], metallicFactor: 0, roughnessFactor: 0.8 }, emissiveFactor: [0.25, 0.17, 0.02] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: P.length / 3, type: "VEC3", min: min.map(Math.fround), max: max.map(Math.fround) },
    { bufferView: 1, componentType: 5126, count: N.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: I.length, type: "SCALAR" },
  ],
  bufferViews: vistas, buffers: [{ byteLength: bin.length }],
};
const json = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
jh.writeUInt32LE(jsonPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, jsonPadded, bh, bin]);
mkdirSync(new URL("../activos/casa/", import.meta.url), { recursive: true });
writeFileSync(new URL("../activos/casa/baculo.glb", import.meta.url), glb);
console.log(`activos/casa/baculo.glb · ${glb.length} bytes · ${I.length / 3} triangles · sha256 ${createHash("sha256").update(glb).digest("hex")}`);
