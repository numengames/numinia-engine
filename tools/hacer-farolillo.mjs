// hacer-farolillo: writes activos/casa/farolillo.glb, the Farolillo de Bruno (N10/N18: the example quest's good, the
// first thing a player can hold in a hand or wear). A small brass lantern, 0.30 m tall, sitting on the ground (origin at
// the centre of its base), with a warm glass that glows (emissive) and a handle on top. Own work, CC0. Deterministic:
// same bytes every run, so its sha256 (features/objetos/biblioteca.json, aventuras/ejemplo's quest) never moves.
// Run: node tools/hacer-farolillo.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** One primitive per material: positions, normals, indices. */
const prims = [{ pos: [], nor: [], idx: [] }, { pos: [], nor: [], idx: [] }];
const LATON = 0, CRISTAL = 1;
const r4 = (v) => Math.round(v * 1e4) / 1e4; // fixed decimals: the same floats on every machine

function caja(m, cx, y0, cz, sx, sy, sz) {
  const p = prims[m];
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const h = [sx / 2, sy / 2, sz / 2], c = [cx, y0 + sy / 2, cz];
  for (const [n, u, v] of faces) {
    const base = p.pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let k = 0; k < 3; k++) p.pos.push(r4(c[k] + n[k] * h[k] + (a * u[k] * h[k]) + (b * v[k] * h[k])));
      p.nor.push(...n);
    }
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
/** A four-sided roof: square base of half-side `a` at y0, apex at y1. */
function tejado(m, y0, y1, a) {
  const p = prims[m];
  const lados = [[[a, -a], [a, a]], [[a, a], [-a, a]], [[-a, a], [-a, -a]], [[-a, -a], [a, -a]]];
  for (const [[x0, z0], [x1, z1]] of lados) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = Math.hypot(mx, mz), alto = y1 - y0;
    const nl = Math.hypot(alto, l), n = [r4((mx / l) * alto / nl), r4(l / nl), r4((mz / l) * alto / nl)];
    const base = p.pos.length / 3;
    p.pos.push(r4(x0), r4(y0), r4(z0), r4(x1), r4(y0), r4(z1), 0, r4(y1), 0);
    p.nor.push(...n, ...n, ...n);
    // counter-clockwise seen from outside
    p.idx.push(base, base + 2, base + 1);
  }
}
/** The handle: half a torus standing in the x-y plane, centre (0, yc), radius R, tube r. */
function asa(m, yc, R, r, segU = 10, segV = 6) {
  const p = prims[m], base = p.pos.length / 3;
  for (let i = 0; i <= segU; i++) {
    const u = (Math.PI * i) / segU, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= segV; j++) {
      const v = (2 * Math.PI * j) / segV, cv = Math.cos(v), sv = Math.sin(v);
      const nx = cu * cv, ny = su * cv, nz = sv;
      p.pos.push(r4((R + r * cv) * cu), r4(yc + (R + r * cv) * su), r4(r * sv));
      p.nor.push(r4(nx), r4(ny), r4(nz));
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const a = base + i * (segV + 1) + j, b = a + segV + 1;
    p.idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
}

caja(LATON, 0, 0, 0, 0.16, 0.025, 0.16);                       // the foot
caja(CRISTAL, 0, 0.025, 0, 0.12, 0.15, 0.12);                  // the glass, glowing
for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) caja(LATON, x * 0.062, 0.025, z * 0.062, 0.02, 0.15, 0.02); // four posts
caja(LATON, 0, 0.175, 0, 0.17, 0.018, 0.17);                   // the roof's rim
tejado(LATON, 0.193, 0.245, 0.08);                             // the roof
caja(LATON, 0, 0.24, 0, 0.026, 0.02, 0.026);                   // the knob
asa(LATON, 0.255, 0.045, 0.006);                               // the handle (top at 0.306 m)

const partes = [], vistas = [], accesores = [];
let off = 0;
const bins = [];
for (const p of prims) {
  const P = new Float32Array(p.pos), N = new Float32Array(p.nor), I = new Uint16Array(p.idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
  for (const [arr, target] of [[P, 34962], [N, 34962], [I, 34963]]) {
    const b = Buffer.from(arr.buffer), pad = Buffer.alloc((4 - (b.length % 4)) % 4);
    vistas.push({ buffer: 0, byteOffset: off, byteLength: b.length, target });
    bins.push(b, pad); off += b.length + pad.length;
  }
  const v0 = vistas.length - 3;
  accesores.push(
    { bufferView: v0, componentType: 5126, count: P.length / 3, type: "VEC3", min: min.map(Math.fround), max: max.map(Math.fround) },
    { bufferView: v0 + 1, componentType: 5126, count: N.length / 3, type: "VEC3" },
    { bufferView: v0 + 2, componentType: 5123, count: I.length, type: "SCALAR" },
  );
  const a0 = accesores.length - 3;
  partes.push({ attributes: { POSITION: a0, NORMAL: a0 + 1 }, indices: a0 + 2, material: partes.length });
}
const bin = Buffer.concat(bins);
const gltf = {
  asset: { version: "2.0", generator: "numinia-engine tools/hacer-farolillo.mjs", copyright: "CC0 1.0 (Numen Games, own work)" },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "farolillo" }],
  meshes: [{ name: "farolillo", primitives: partes }],
  materials: [
    { name: "laton", pbrMetallicRoughness: { baseColorFactor: [0.78, 0.56, 0.25, 1], metallicFactor: 0.55, roughnessFactor: 0.45 } },
    { name: "cristal", pbrMetallicRoughness: { baseColorFactor: [1, 0.86, 0.55, 1], metallicFactor: 0, roughnessFactor: 0.3 }, emissiveFactor: [1, 0.68, 0.28] },
  ],
  accessors: accesores, bufferViews: vistas, buffers: [{ byteLength: bin.length }],
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
writeFileSync(new URL("../activos/casa/farolillo.glb", import.meta.url), glb);
console.log(`activos/casa/farolillo.glb · ${glb.length} bytes · sha256 ${createHash("sha256").update(glb).digest("hex")}`);
