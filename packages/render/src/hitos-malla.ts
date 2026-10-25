// hitos-malla (MIS-200): the plaza's landmark pillars (index.ts: 24 boxes 1×3×1) drawn as ONE InstancedMesh with a colour per
// instance, instead of 24 draw calls per eye (Pico 4: 145 calls per frame, no multiview). Same idea as lotes.ts: the 24
// original meshes stay in the world as invisible-while-drawing proxies, so the top-down map (cenital.ts, `userData.mapa`), the
// AR miniature (ar.ts), picking, the environment's `hitos: false` and the nature's hide (naturaleza/hitos.ts) keep reading
// them; only while the frame is drawn the visible ones are hidden and the instanced mesh stands in for them.
import * as THREE from "three/webgpu";

export function crearHitosMalla(hitos: readonly THREE.Mesh[], geometria: THREE.BufferGeometry, padre: THREE.Object3D) {
  const malla = new THREE.InstancedMesh(geometria, new THREE.MeshStandardMaterial({ color: 0xffffff }), Math.max(1, hitos.length));
  malla.name = "hitos"; malla.frustumCulled = false; malla.count = 0; malla.visible = false; // NOT `userData.mapa`: the map reads the proxies
  malla.userData.hitosMalla = true;
  padre.add(malla);
  const M = new THREE.Matrix4(), inv = new THREE.Matrix4();
  const puestos: THREE.Mesh[] = [];
  let firma = "";
  return {
    malla,
    /** Start of a frame: hide the visible pillars, show the instanced mesh with one instance per hidden pillar. */
    antes(): void {
      puestos.length = 0;
      let f = "";
      for (const p of hitos) if (p.visible) { puestos.push(p); f += `${p.position.x},${p.position.y},${p.position.z},${(p.material as THREE.MeshStandardMaterial).color.getHex()};`; }
      if (f !== firma) { // only when the set, a place or a colour changed: the upload is skipped otherwise
        firma = f;
        padre.updateWorldMatrix(true, false); inv.copy(padre.matrixWorld).invert(); // the mesh sits under `padre`: instance = padre⁻¹ · pillar
        for (let i = 0; i < puestos.length; i++) {
          const p = puestos[i];
          p.updateWorldMatrix(true, false);
          malla.setMatrixAt(i, M.multiplyMatrices(inv, p.matrixWorld));
          malla.setColorAt(i, (p.material as THREE.MeshStandardMaterial).color);
        }
        malla.instanceMatrix.needsUpdate = true;
        if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
      }
      malla.count = puestos.length;
      malla.visible = puestos.length > 0;
      for (const p of puestos) p.visible = false; // visible was true, so no accessor holds it: a plain write
    },
    /** End of the frame: every pillar as it was. */
    despues(): void {
      for (const p of puestos) p.visible = true;
      puestos.length = 0;
      malla.visible = false;
    },
    /** What the last `antes` drew (for the draw-call counter). */
    instancias: () => malla.count,
  };
}
