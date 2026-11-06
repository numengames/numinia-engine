// N2-H1: a glTF material with KHR_materials_transmission froze the engine's picture 12-14 s after loading (three's
// shared viewport texture destroyed in a submit). The one loader setup every model goes through (gltf.ts) now turns it
// into plain translucency and says so once per file. A cube with a glass material, read through the real GLTFLoader.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepararGltf } from "../packages/render/src/gltf.ts";
import { opacidadEquivalente, OPACIDAD_MIN } from "../packages/render/src/transmision.ts";

function glb(json: unknown, bin: Uint8Array): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + j.length + jp + 8 + bin.length + bp;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8);
  return out;
}
const CUBO = {
  pos: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  idx: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3],
};
/** A 2 m cube with one material; `material` is the glTF material object (with its extensions). */
function cuboGlb(material: Record<string, unknown>, usadas: string[]): ArrayBuffer {
  const pos = new Uint8Array(new Float32Array(CUBO.pos).buffer), idx = new Uint8Array(new Uint16Array(CUBO.idx).buffer);
  const bin = new Uint8Array(pos.length + idx.length); bin.set(pos); bin.set(idx, pos.length);
  const bytes = glb({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "cubo" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [material],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] }, { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: idx.length }],
    buffers: [{ byteLength: bin.length }],
    ...(usadas.length ? { extensionsUsed: usadas } : {}),
  }, bin);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
const CRISTAL = (t: number, alfa = 1) => ({
  name: "Cristal", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.9, 1, alfa], metallicFactor: 0, roughnessFactor: 0.05 },
  extensions: { KHR_materials_transmission: { transmissionFactor: t }, KHR_materials_volume: { thicknessFactor: 0.2 } },
});
const USADAS = ["KHR_materials_transmission", "KHR_materials_volume"];

async function leer(bytes: ArrayBuffer, avisos: string[]) {
  const aviso = console.warn;
  console.warn = (...a: unknown[]) => { avisos.push(a.join(" ")); };
  try {
    const gltf = await (await prepararGltf(new GLTFLoader())).parseAsync(bytes, "");
    return gltf.scene.getObjectByName("cubo") as THREE.Mesh;
  } finally { console.warn = aviso; }
}

test("n2-h1: a cube whose material has KHR_materials_transmission loads as plain translucency (no transmission left for three to draw)", async () => {
  const avisos: string[] = [];
  const malla = await leer(cuboGlb(CRISTAL(0.9), USADAS), avisos);
  const m = malla.material as THREE.MeshPhysicalMaterial;
  assert.equal(m.transmission, 0, "transmission is what makes three allocate the viewport texture");
  assert.equal(m.transmissionMap, null);
  assert.equal(m.thickness, 0);
  assert.equal(m.transparent, true);
  assert.equal(m.depthWrite, false, "glass does not hide what is behind it");
  assert.ok(m.opacity >= OPACIDAD_MIN && m.opacity < 0.5, `opacity ${m.opacity}`);
  assert.equal(m.opacity, opacidadEquivalente(0.9));
  assert.equal(avisos.length, 1, "one warning per file");
  assert.match(avisos[0], /KHR_materials_transmission/);
  assert.match(avisos[0], /Cristal/);
});

test("n2-h1: a glass that is also tinted by its base colour alpha keeps the lower of both; a pure-alpha glass is untouched", async () => {
  const avisos: string[] = [];
  const medio = await leer(cuboGlb({ ...CRISTAL(0.5, 0.6), alphaMode: "BLEND" }, USADAS), avisos);
  const m = medio.material as THREE.MeshPhysicalMaterial;
  assert.equal(m.transmission, 0);
  assert.ok(m.opacity < 0.6 && m.opacity >= OPACIDAD_MIN, `opacity ${m.opacity}`);

  const solo: string[] = [];
  const alfa = await leer(cuboGlb({ name: "Cristal", alphaMode: "BLEND", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.9, 1, 0.15] } }, []), solo);
  const a = alfa.material as THREE.MeshStandardMaterial;
  assert.equal(a.opacity, 0.15);
  assert.equal(a.transparent, true);
  assert.deepEqual(solo, [], "no transmission, no warning");
});

test("n2-h1: an ordinary opaque material is not touched and nothing is said", async () => {
  const avisos: string[] = [];
  const malla = await leer(cuboGlb({ name: "Pared", pbrMetallicRoughness: { baseColorFactor: [0.7, 0.7, 0.7, 1] } }, []), avisos);
  const m = malla.material as THREE.MeshStandardMaterial;
  assert.equal(m.opacity, 1);
  assert.equal(m.transparent, false);
  assert.equal(m.depthWrite, true);
  assert.deepEqual(avisos, []);
});

test("n2-h1: opacidadEquivalente is monotone, bounded and survives bad numbers", () => {
  assert.equal(opacidadEquivalente(0), 1);
  assert.equal(opacidadEquivalente(1), OPACIDAD_MIN);
  assert.equal(opacidadEquivalente(0, 0.4), 0.4);
  let antes = 2;
  for (let t = 0; t <= 1.0001; t += 0.1) { const o = opacidadEquivalente(t); assert.ok(o <= antes && o >= OPACIDAD_MIN && o <= 1); antes = o; }
  assert.equal(opacidadEquivalente(7), OPACIDAD_MIN);
  assert.equal(opacidadEquivalente(-3), 1);
  assert.equal(opacidadEquivalente(NaN, NaN), 1);
  assert.ok(opacidadEquivalente(1, 0.1) <= 0.1, "never more opaque than the base");
});
