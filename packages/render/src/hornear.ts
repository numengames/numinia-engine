// hornear (E5): a model that does not animate (the people of the world, the things of a quest: pnj@1 / cosa@1) baked
// ONCE per file into one mesh per material, in the pose it comes in. Pure: three.js only, no DOM (tested in
// test/hornear.test.ts); index.ts keeps the cache and the instances.
//
// WHY positions are copied to plain floats FIRST. The server's optimizer (packages/server/src/optimizar.ts) writes
// the positions of every model as 16-bit NORMALIZED integers (KHR_mesh_quantization): each number is -1..1 and the
// node above the mesh carries the scale and the shift that give it back its metres. The glTF loader hands that
// attribute over as it is (Int16Array, normalized). Baking the node's matrix INTO such an attribute
// (BufferGeometry.applyMatrix4 -> BufferAttribute.setXYZ) writes metres into a slot that only holds -1..1:
// anything farther than 1 m from the model's origin wraps around in the Int16Array (modulo 2 m: 1.98 m comes out as
// -0.02 m, under the floor). A 1.98 m cook with his feet at y 0 lost his head, and Pietro of the TRG26 adventure was left a stub. Models inside ±1 m (a figure with the
// origin at the waist) were never touched, which is why they looked right. fundir-quietos.ts (E2) already copies
// to floats (plano()); hornear() did not.
import * as THREE from "three/webgpu";

/** `sinSombra`: every mesh baked into this part said «never cast a shadow» (glTF extras `sinSombra`). Meshes that say so and meshes that do not stay in separate parts. */
export type Horneada = { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean; sinSombra?: boolean };
export type Merge = (gs: THREE.BufferGeometry[]) => THREE.BufferGeometry | null;

/** A copy of an attribute as plain float32, whatever the file stored: normalized or not, 8 or 16 bits, interleaved. */
export function aFlotante(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    out[i * k] = a.getX(i);
    if (k > 1) out[i * k + 1] = a.getY(i);
    if (k > 2) out[i * k + 2] = a.getZ(i);
    if (k > 3) out[i * k + 3] = a.getW(i);
  }
  return new THREE.BufferAttribute(out, k);
}

/**
 * The scene of a parsed file as one geometry per material, placed relative to the scene's root (the copy carries the
 * root's own transform). null when it cannot be done: a mesh with several materials, no meshes, or `merge` refuses.
 * The file's scene is read, never changed.
 */
export function hornearEscena(raiz: THREE.Object3D, merge: Merge): Horneada[] | null {
  raiz.updateMatrixWorld(true);
  const inv = raiz.matrixWorld.clone().invert(), rel = new THREE.Matrix4(), v = new THREE.Vector3();
  const porMat = new Map<string, { mat: THREE.Material; gs: THREE.BufferGeometry[]; sombra: boolean; sinSombra: boolean }>();
  const ids = new Map<THREE.Material, number>();
  let mal = false;
  raiz.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || mal) return;
    if (Array.isArray(m.material)) { mal = true; return; }
    const src = m.geometry, pos = src.attributes.position;
    if (!pos) return;
    const geo = new THREE.BufferGeometry();
    const p = aFlotante(pos); // floats: the matrix below is in metres, a quantized attribute only holds -1..1
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh && src.attributes.skinIndex) for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(pos, i); sk.applyBoneTransform(i, v); p.setXYZ(i, v.x, v.y, v.z); }
    geo.setAttribute("position", p);
    if (src.attributes.uv) geo.setAttribute("uv", aFlotante(src.attributes.uv)); // one type for every piece, so they merge
    if (src.index) geo.setIndex(src.index.clone());
    geo.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
    const g2 = geo.index ? geo.toNonIndexed() : geo;
    g2.computeVertexNormals();
    const sin = !!m.userData.sinSombra, mat = m.material as THREE.Material;
    if (!ids.has(mat)) ids.set(mat, ids.size);
    const k = `${ids.get(mat)}${sin ? "x" : ""}`;
    const e = porMat.get(k) ?? { mat, gs: [], sombra: false, sinSombra: sin };
    e.gs.push(g2); e.sombra ||= m.castShadow; porMat.set(k, e);
  });
  if (mal || !porMat.size) return null;
  const out: Horneada[] = [];
  for (const e of porMat.values()) {
    if (e.gs.some((x) => !!x.attributes.uv) && !e.gs.every((x) => !!x.attributes.uv)) for (const x of e.gs) x.deleteAttribute("uv"); // all or none
    const geo = e.gs.length === 1 ? e.gs[0] : merge(e.gs);
    if (!geo) return null;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    out.push({ geo, mat: e.mat, sombra: e.sombra && !e.sinSombra, ...(e.sinSombra ? { sinSombra: true } : {}) });
  }
  return out;
}
