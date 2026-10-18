// M6 h8: server wiring that turns `malla` objects into sim.mesh — bring a .glb's bytes, transform its triangles to
// world space (transformarPuntos: the same rotation cajaEnMundo gives a box), buildBvh + setMesh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirMalla } from "../packages/server/src/colision-mundo.ts";
import { rayBvh } from "../packages/sim/src/index.ts";
import { fx, fxToFloat, FX_ONE } from "../packages/core/src/index.ts";

// ---- a tiny .glb writer (same recipe as test/colision-glb.test.ts, so this test owns every byte it reads) ----
function glb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const total = 12 + 8 + j.length + jp + (bin ? 8 + bin.length + bp : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  if (bin) { const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8); }
  return out;
}
/** Two triangles (a quad on y=0, 1 × 1 m, model space), float positions, u16 indices. */
function quadGlb(): Uint8Array {
  const pos = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], idx = [0, 1, 2, 0, 2, 3];
  const posBytes = new Uint8Array(new Float32Array(pos).buffer), idxBytes = new Uint8Array(new Uint16Array(idx).buffer);
  const posPad = (4 - (posBytes.length % 4)) % 4;
  const bin = new Uint8Array(posBytes.length + posPad + idxBytes.length); bin.set(posBytes); bin.set(idxBytes, posBytes.length + posPad);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes.length }, { buffer: 0, byteOffset: posBytes.length + posPad, byteLength: idxBytes.length }],
    buffers: [{ byteLength: bin.length }],
  };
  return glb(json, bin);
}
const HASH = "a".repeat(64), OTRO = "b".repeat(64);
const cosa = (over: Record<string, unknown> = {}) => ({ colision: "malla", modelo: HASH, ext: "glb", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, ...over });

test("h8: a malla thing's .glb becomes a sim.mesh, moved to its place/turn/scale", async () => {
  const quad = quadGlb();
  const build = construirMalla((h, ext) => (h === HASH && ext === "glb" ? quad : null));
  const bvh = await build([["objetos:o1", cosa({ x: 10, y: 5, z: 0 })]]);
  assert.ok(bvh && bvh.count === 2, JSON.stringify(bvh));
  // the quad sits on y=0 in model space; moved to y=5, a ray straight down from y=20 at (10.5, _, 0.5) hits it at y=5
  const hit = rayBvh(bvh!, fx(10.5), fx(20), fx(0.5), 0, -FX_ONE, 0, fx(30));
  assert.ok(hit, "esperaba un impacto");
  assert.equal(Math.round(fxToFloat(hit!.y) * 1000) / 1000, 5);
});

test("h8: no malla thing, or none readable (wrong hash, not a glb, not sha256) → null (no mesh, like before M6)", async () => {
  const build = construirMalla(() => null);
  assert.equal(await build([["objetos:o1", { colision: "caja" }]]), null); // caja, not malla
  assert.equal(await build([]), null);
  const build2 = construirMalla((h) => (h === HASH ? quadGlb() : null));
  assert.equal(await build2([["objetos:o1", cosa({ modelo: OTRO })]]), null); // that hash is not on this server
  assert.equal(await build2([["objetos:o1", cosa({ modelo: "no-es-un-sha256" })]]), null);
  const draco = glb({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], extensionsRequired: ["KHR_draco_mesh_compression"] }, null);
  const build3 = construirMalla(() => draco);
  assert.equal(await build3([["objetos:o1", cosa()]]), null);
});

test("h8: two malla things concatenate into one BVH, each in its own place", async () => {
  const quad = quadGlb();
  const build = construirMalla((h) => (h === HASH ? quad : null));
  const bvh = await build([["objetos:o1", cosa({ x: 0 })], ["objetos:o2", cosa({ x: 100 })]]);
  assert.ok(bvh && bvh.count === 4, JSON.stringify(bvh));
  const a = rayBvh(bvh!, fx(0.5), fx(10), fx(0.5), 0, -FX_ONE, 0, fx(20));
  const b = rayBvh(bvh!, fx(100.5), fx(10), fx(0.5), 0, -FX_ONE, 0, fx(20));
  assert.ok(a && b, "esperaba impacto en los dos sitios");
  assert.equal(fxToFloat(a!.y), 0); assert.equal(fxToFloat(b!.y), 0);
});
