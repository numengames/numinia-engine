// junta (MIS-200 lote 12): several pieces of geometry into ONE (one mesh = one draw call). Pure three, no GPU. Each piece brings
// its transform and, if wanted, a colour factor that goes into a vertex-colour attribute (so pieces of one material can still differ
// in tone/strength). The result is non-indexed with position + normal (+ color when any piece asked): enough for the plain
// materials of walls and holograms; textured pieces use fundir-quietos / the static batcher, which keep uvs.
import * as THREE from "three/webgpu";

export type Pieza = { geo: THREE.BufferGeometry; matriz: THREE.Matrix4; /** Multiplies the vertex colour (white = unchanged). */ factor?: number };

export function juntarPiezas(piezas: readonly Pieza[]): THREE.BufferGeometry {
  const conColor = piezas.some((p) => p.factor !== undefined);
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const N = new THREE.Matrix3(), V = new THREE.Vector3();
  for (const p of piezas) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const P = g.attributes.position, Nn = g.attributes.normal;
    N.getNormalMatrix(p.matriz);
    for (let i = 0; i < P.count; i++) {
      V.fromBufferAttribute(P, i).applyMatrix4(p.matriz); pos.push(V.x, V.y, V.z);
      if (Nn) { V.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); nor.push(V.x, V.y, V.z); } else nor.push(0, 1, 0);
      if (conColor) { const f = p.factor ?? 1; col.push(f, f, f); }
    }
    if (g !== p.geo) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  if (conColor) out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

/** Translation (+ optional rotation about X) as a matrix: the little transform most pieces need. */
export const en = (x: number, y: number, z: number, rx = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));
