// E5: a still person (pnj@1) or quest thing is baked once per file (packages/render/src/hornear.ts). The server's
// optimizer stores positions as 16-bit NORMALIZED integers (-1..1, the node above the mesh gives the metres back);
// baking the node's matrix into such an attribute wrapped everything beyond 1 m from the origin (modulo 2 m: 1.98 m
// came out as -0.02 m, under the floor), so a 1.98 m cook with his feet at y 0 lost his head and Pietro (feet at 0,
// 1.5 m) was a stub. The baked figure must be the
// figure that is in the file: same box, whatever way the file stored its numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { aFlotante, hornearEscena } from "../packages/render/src/hornear.ts";
import { optimizarGlb } from "../packages/server/src/optimizar.ts";

const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs as never) as unknown as THREE.BufferGeometry | null;

type Malla = { pos: number[]; nor: number[]; idx: number[] };
/** A box from (x, y, z) (its lowest corner) of size w × h × d. */
function caja(x: number, y: number, z: number, w: number, h: number, d: number): Malla {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const caras: [number[], number[][]][] = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [[0, -1, 0], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ];
  for (const [n, vs] of caras) {
    const b = pos.length / 3;
    for (const [i, j, k] of vs) { pos.push(x + i * w, y + j * h, z + k * d); nor.push(...n); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { pos, nor, idx };
}
/** A ball (a head) of radius r round (cx, cy, cz). */
function bola(cx: number, cy: number, cz: number, r: number, n = 14): Malla {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
    const t = (a / n) * Math.PI, f = (b / n) * 2 * Math.PI, nx = Math.sin(t) * Math.cos(f), ny = Math.cos(t), nz = Math.sin(t) * Math.sin(f);
    pos.push(cx + r * nx, cy + r * ny, cz + r * nz); nor.push(nx, ny, nz);
    if (a < n && b < n) { const k = a * (n + 1) + b; idx.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
  }
  return { pos, nor, idx };
}
const juntar = (ms: Malla[]): Malla => {
  const o: Malla = { pos: [], nor: [], idx: [] };
  for (const m of ms) { const b = o.pos.length / 3; o.pos.push(...m.pos); o.nor.push(...m.nor); o.idx.push(...m.idx.map((i) => i + b)); }
  return o;
};

/** A cook as the world's builder makes him: float positions, ONE mesh with two materials (clothes, skin), `bajar`
 * metres under the feet line (0: feet at y 0, origin at the feet; 0.99: origin at the waist). 1.98 m with the hat. */
async function cocinero(bajar: number): Promise<Uint8Array> {
  const doc = new Document(), buf = doc.createBuffer(), y = (v: number) => v - bajar;
  const ropa = juntar([caja(-0.22, y(0), -0.1, 0.17, 0.82, 0.22), caja(0.05, y(0), -0.1, 0.17, 0.82, 0.22), caja(-0.25, y(0.82), -0.15, 0.5, 0.62, 0.3), caja(-0.45, y(0.85), -0.075, 0.12, 0.55, 0.15), caja(0.33, y(0.85), -0.075, 0.12, 0.55, 0.15), caja(-0.16, y(1.74), -0.16, 0.32, 0.24, 0.32)]); // hat up to 1.98
  const piel = bola(0, y(1.58), 0, 0.17);
  const prim = (m: Malla, nombre: string, c: number[]) => doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(m.pos)).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(m.nor)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(m.idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial(nombre).setBaseColorFactor(c as [number, number, number, number]));
  const malla = doc.createMesh("cocinero").addPrimitive(prim(ropa, "ropa", [0.1, 0.4, 0.8, 1])).addPrimitive(prim(piel, "piel", [0.9, 0.7, 0.55, 1]));
  doc.createScene("escena").addChild(doc.createNode("cocinero").setMesh(malla));
  return new NodeIO().writeBinary(doc);
}

async function leer(glb: Uint8Array): Promise<THREE.Group> {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder as never);
  const g = await new Promise<{ scene: THREE.Group }>((ok, mal) => l.parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, "", ok as never, mal));
  return g.scene;
}
const caja3 = (hs: { geo: THREE.BufferGeometry }[]) => { const b = new THREE.Box3(); for (const h of hs) b.union(h.geo.boundingBox!); return b; };
const casi = (a: number, b: number, tol: number, que: string) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a.toFixed(4)} vs ${b.toFixed(4)} (±${tol})`);

test("hornear: the server's optimized copy of a 1.98 m cook with his feet at y 0 bakes to the same 1.98 m (E5)", async () => {
  const original = await cocinero(0);
  const r = await optimizarGlb(original);
  assert.ok(r.bytes, `the optimizer must produce the copy the page loads (${r.motivo})`);
  const escena = await leer(r.bytes!);
  const pos = ((escena.getObjectByProperty("isMesh", true) as THREE.Mesh).geometry.attributes.position);
  assert.equal(pos.array.constructor, Int16Array, "the page really receives 16-bit normalized positions"); // else this test proves nothing
  assert.equal(pos.normalized, true);

  const cocido = hornearEscena(escena, merge)!;
  const referencia = hornearEscena(await leer(original), merge)!; // float file: the numbers as they were authored
  assert.ok(cocido && referencia);
  assert.equal(cocido.length, 2, "one mesh per material");
  const b = caja3(cocido), r0 = caja3(referencia);
  casi(r0.max.y, 1.98, 1e-4, "the authored cook is 1.98 m tall");
  casi(b.max.y, 1.98, 0.003, "the head and the hat are drawn: top");
  casi(b.min.y, 0, 0.003, "feet on the floor: bottom");
  for (const [i, h] of cocido.entries()) { // and per material (the skin ball is the head: it must sit at 1.58 ± 0.17)
    casi(h.geo.boundingBox!.min.y, referencia[i].geo.boundingBox!.min.y, 0.003, `material ${i} bottom`);
    casi(h.geo.boundingBox!.max.y, referencia[i].geo.boundingBox!.max.y, 0.003, `material ${i} top`);
  }
  assert.equal(cocido[0].geo.attributes.position.array.constructor, Float32Array, "the baked parts are plain floats (hornearPieza, lotes)");
});

test("hornear: a cook with his origin at the waist (±0.99 m, the world-side workaround) bakes to the same place as before", async () => {
  // These worlds raise posicion.y by 0.99 × scale. The fix must not move them: inside ±1 m nothing was ever lost.
  const original = await cocinero(0.99);
  const r = await optimizarGlb(original);
  assert.ok(r.bytes, r.motivo);
  const cocido = hornearEscena(await leer(r.bytes!), merge)!, referencia = hornearEscena(await leer(original), merge)!;
  const b = caja3(cocido), r0 = caja3(referencia);
  for (const eje of ["x", "y", "z"] as const) { casi(b.min[eje], r0.min[eje], 0.003, `min ${eje}`); casi(b.max[eje], r0.max[eje], 0.003, `max ${eje}`); }
  casi(b.min.y, -0.99, 0.003, "feet 0.99 m under the origin"); casi(b.max.y, 0.99, 0.003, "hat 0.99 m over it");
});

test("hornear: a quantized attribute under a node scale, as the glTF loader leaves it, keeps every metre (pure)", () => {
  // 16-bit normalized -1..1 under a node that scales by 1.5 and shifts up 1.5: the numbers go from y 0 to y 3 m
  const g = new THREE.BufferGeometry();
  const q = new Int16Array([-32767, -32767, -32767, 32767, -32767, -32767, 0, 32767, 32767]);
  g.setAttribute("position", new THREE.BufferAttribute(q, 3, true));
  const mat = new THREE.MeshStandardMaterial();
  const raiz = new THREE.Group(), nodo = new THREE.Mesh(g, mat);
  nodo.scale.setScalar(1.5); nodo.position.set(0, 1.5, 0); raiz.add(nodo);
  const [h] = hornearEscena(raiz, merge)!;
  casi(h.geo.boundingBox!.min.y, 0, 1e-4, "bottom"); casi(h.geo.boundingBox!.max.y, 3, 1e-4, "top (before the fix: 3 m came out as 1 m)");
  casi(h.geo.boundingBox!.max.x, 1.5, 1e-4, "width"); casi(h.geo.boundingBox!.max.z, 1.5, 1e-4, "depth");
});

test("hornear: pieces of one material stored in different ways (quantized + float, 16-bit uvs + float uvs) still merge into one", () => {
  const mat = new THREE.MeshStandardMaterial();
  const cuantizada = new THREE.BufferGeometry(); // a quantized piece with 14-bit uvs
  cuantizada.setAttribute("position", new THREE.BufferAttribute(new Int16Array([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true));
  cuantizada.setAttribute("uv", new THREE.BufferAttribute(new Uint16Array([0, 0, 65535, 0, 0, 65535]), 2, true));
  const flotante = new THREE.BufferGeometry();
  flotante.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 1, 2, 0, 1, 0, 2, 1], 3));
  flotante.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  const raiz = new THREE.Group(); raiz.add(new THREE.Mesh(cuantizada, mat), new THREE.Mesh(flotante, mat));
  const hs = hornearEscena(raiz, merge);
  assert.ok(hs && hs.length === 1, "merged, not given up");
  assert.equal(hs![0].geo.attributes.position.count, 6);
  casi(hs![0].geo.boundingBox!.max.x, 2, 1e-4, "the float piece is where it was"); casi(hs![0].geo.boundingBox!.min.x, -1, 1e-4, "the quantized piece keeps its metre");
});

test("aFlotante: interleaved and normalized attributes become plain floats with their real values", () => {
  const n = aFlotante(new THREE.BufferAttribute(new Int16Array([32767, 0, -32767]), 3, true));
  assert.ok(n.array instanceof Float32Array && !n.normalized);
  assert.deepEqual([...n.array].map((x) => Math.round(x * 1e4) / 1e4), [1, 0, -1]);
  const inter = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array([1, 2, 3, 9, 4, 5, 6, 9]), 4), 3, 0);
  assert.deepEqual([...aFlotante(inter).array], [1, 2, 3, 4, 5, 6]);
});

test("hornear: meshes that say sinSombra (glTF extras) stay apart from those that do not, even on one material", () => {
  const mat = new THREE.MeshStandardMaterial();
  const tri = (dx: number) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([dx, 0, 0, dx + 1, 0, 0, dx, 1, 0], 3)); return g; };
  const a = new THREE.Mesh(tri(0), mat), b = new THREE.Mesh(tri(2), mat), c = new THREE.Mesh(tri(4), mat);
  b.userData.sinSombra = true; a.castShadow = true; c.castShadow = true;
  const raiz = new THREE.Group(); raiz.add(a, b, c);
  const hs = hornearEscena(raiz, merge)!;
  assert.equal(hs.length, 2, "one part that casts, one that never does");
  const sin = hs.find((h) => h.sinSombra)!, con = hs.find((h) => !h.sinSombra)!;
  assert.equal(sin.geo.attributes.position.count, 3);
  assert.equal(con.geo.attributes.position.count, 6);
  assert.equal(sin.sombra, false);
  assert.equal(con.sombra, true);
});
