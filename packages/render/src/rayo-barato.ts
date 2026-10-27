// Hand-ray picking that costs the same whatever the model weighs.
//
// The builder's hands (apps/plaza/constructor-xr.ts, `cuadro`, 60 times a second, once per hand) ask the editor
// «what is under this ray?» every tick — to select, and again while a thing is held to find where it lands. three's
// Raycaster tests EVERY triangle of every mesh whose bounding sphere the ray crosses, on the CPU, with no spatial index:
// a 130 k-triangle statue costs ~4 ms on a desktop and 15–25 ms on a Quest, a skinned model costs far more (each vertex is
// skinned on the CPU first). Quest 3S session 26-oct: fps 10–19 while moving the statue (×3.4) and the walkman (×10) with
// the hands, and for 26 s after teleporting to a spot with a ×10 skinned robot — the hand rays hit them every tick.
// So a heavy mesh (more than TRIS_RAYO_MAX triangles, or skinned) answers with its bounding box instead of its triangles:
// the same box the selection outline already draws. Light meshes keep the exact test.
import * as THREE from "three/webgpu";

/** Above this many triangles a mesh is hit by its box, not by its triangles. */
export const TRIS_RAYO_MAX = 20_000;

const trisPorGeometria = new WeakMap<THREE.BufferGeometry, number>();
/** Triangles of a geometry (indexed or not), counted once. */
export function triangulosDe(g: THREE.BufferGeometry): number {
  let n = trisPorGeometria.get(g);
  if (n === undefined) { n = Math.floor((g.index ? g.index.count : g.getAttribute("position")?.count ?? 0) / 3); trisPorGeometria.set(g, n); }
  return n;
}

/** Whether a mesh is too heavy (or too slow to skin) to test triangle by triangle on every tick. */
export const esCaro = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return false;
  return (m as THREE.SkinnedMesh).isSkinnedMesh === true || triangulosDe(m.geometry) > TRIS_RAYO_MAX;
};

const inv = new THREE.Matrix4(), local = new THREE.Ray(), punto = new THREE.Vector3(), mundo = new THREE.Vector3();

/** The ray against the mesh's own box (own axes, so a turned or scaled mesh keeps its shape); pushes at most one hit. */
function golpeCaja(m: THREE.Mesh, ray: THREE.Raycaster, out: THREE.Intersection[]): void {
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const caja = g.boundingBox;
  if (!caja || caja.isEmpty()) return;
  inv.copy(m.matrixWorld).invert();
  local.copy(ray.ray).applyMatrix4(inv);
  if (!local.intersectBox(caja, punto)) return;
  mundo.copy(punto).applyMatrix4(m.matrixWorld);
  const distance = ray.ray.origin.distanceTo(mundo);
  if (distance < ray.near || distance > ray.far) return;
  out.push({ distance, point: mundo.clone(), object: m });
}

/** `raycaster.intersectObjects(objetos, true)` with heavy meshes answered by their box. Sorted by distance, nearest first. */
export function intersectarBarato(ray: THREE.Raycaster, objetos: THREE.Object3D[]): THREE.Intersection[] {
  const out: THREE.Intersection[] = [];
  const visitar = (o: THREE.Object3D): void => {
    if (o.layers.test(ray.layers)) { if (esCaro(o)) golpeCaja(o, ray, out); else o.raycast(ray, out); }
    for (const h of o.children) visitar(h);
  };
  for (const o of objetos) visitar(o);
  return out.sort((a, b) => a.distance - b.distance);
}
