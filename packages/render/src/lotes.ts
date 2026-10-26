// lotes (N12): copies of the same model drawn together. Each group of copies («lote»: same baked model, same colour)
// has one InstancedMesh per material of the model, all sharing one matrix buffer: 200 benches cost the bench's 1-3
// draw calls instead of 200-600. A part may sit somewhere inside the model (`rel`, a whole glTF copied as it is): its
// instances are the copy's matrix times that. The copies keep their own meshes (picking, the gizmo, hands, the map, footprints all
// read those); index.ts hides them only while the frame is drawn and shows the lote instead (dibujo-politica.ts).
import * as THREE from "three/webgpu";

/** `sinSombra`: the model said this part never casts a shadow (glTF extras → `userData.sinSombra`, which entorno.ts marcarSombras honours): whatever draws the part in its place must say the same. */
export type Parte = { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean; rel?: THREE.Matrix4; sinSombra?: boolean };
type Lote = { partes: Parte[]; mallas: THREE.InstancedMesh[]; matrices: THREE.InstancedBufferAttribute[]; cap: number; n: number; usado: boolean; mats: THREE.Material[] };

export function crearLotes(padre: THREE.Object3D) {
  const raiz = new THREE.Group();
  raiz.name = "lotes"; raiz.visible = false; // shown only while the frame is drawn (index.ts)
  padre.add(raiz);
  const lotes = new Map<string, Lote>();
  let escrituras = 0;
  const tmp = new THREE.Matrix4();

  /** The material a lote draws with: the model's own, or a copy painted in `color` (as index.ts `pintar` does). */
  function materialDe(mat: THREE.Material, color: string): THREE.Material {
    if (!color) return mat;
    const nuevo = mat.clone() as THREE.MeshStandardMaterial;
    if (nuevo.color) nuevo.color.set(color);
    if (nuevo.userData.colorEnVertices) nuevo.vertexColors = false; // E2: its colours live in the vertices; painted, one colour
    if ("map" in nuevo) nuevo.map = null;
    return nuevo;
  }
  function soltarMallas(l: Lote): void {
    for (const m of l.mallas) { m.removeFromParent(); m.dispose(); }
    l.mallas = []; l.matrices = []; l.cap = 0;
  }
  function crecer(l: Lote, n: number): void {
    const cap = Math.max(8, 1 << Math.ceil(Math.log2(n)));
    soltarMallas(l);
    const nueva = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const comun = nueva(); // parts without `rel` (a baked model) all move with the same copies: one buffer
    l.matrices = [];
    l.mallas = l.partes.map((p, i) => {
      const m = new THREE.InstancedMesh(p.geo, l.mats[i], cap);
      m.instanceMatrix = p.rel ? nueva() : comun;
      if (!l.matrices.includes(m.instanceMatrix)) l.matrices.push(m.instanceMatrix);
      m.castShadow = p.sombra && !p.sinSombra; if (p.sinSombra) m.userData.sinSombra = true; m.count = 0; m.visible = false;
      m.name = "lote"; m.userData.lote = true;
      raiz.add(m);
      return m;
    });
    l.cap = cap; l.n = -1; // forces the first upload
  }

  return {
    raiz,
    /** Start of a frame: no lote has copies yet. */
    empezar(): void { for (const l of lotes.values()) l.usado = false; },
    /** Draw these copies (their world matrices) as one lote this frame. `clave` = model + colour. */
    dibujar(clave: string, partes: Parte[], color: string, matrices: readonly THREE.Matrix4[]): void {
      let l = lotes.get(clave);
      if (l && l.partes !== partes) { soltarMallas(l); for (const m of l.mats) if (!l.partes.some((p) => p.mat === m)) m.dispose(); l = undefined; lotes.delete(clave); }
      if (!l) { l = { partes, mallas: [], matrices: [], cap: 0, n: 0, usado: false, mats: partes.map((p) => materialDe(p.mat, color)) }; lotes.set(clave, l); }
      const n = matrices.length;
      l.usado = true;
      if (n > l.cap) crecer(l, n);
      let cambio = n !== l.n;
      const cambiadas = new Set<THREE.InstancedBufferAttribute>();
      for (let k = 0; k < l.mallas.length; k++) {
        const attr = l.mallas[k].instanceMatrix, rel = partes[k].rel;
        if (!rel && cambiadas.has(attr)) continue; // the shared buffer: written once
        const a = attr.array as Float32Array;
        let esta = false;
        for (let i = 0; i < n; i++) {
          const e = rel ? tmp.multiplyMatrices(matrices[i], rel).elements : matrices[i].elements, o = i * 16;
          for (let j = 0; j < 16; j++) { const x = Math.fround(e[j]); if (a[o + j] !== x) { a[o + j] = x; esta = true; } } // the buffer holds float32
        }
        if (esta || n !== l.n) { cambiadas.add(attr); cambio = true; }
      }
      if (!cambio) { for (const m of l.mallas) m.visible = n > 0; return; }
      l.n = n; escrituras++;
      for (const attr of cambiadas) { attr.needsUpdate = true; attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 16); }
      for (const m of l.mallas) { m.count = n; m.visible = n > 0; m.boundingSphere = null; m.boundingBox = null; if (n > 0) m.computeBoundingSphere(); }
    },
    /** End of a frame's filling: lotes nobody used this frame draw nothing. */
    terminar(): void { for (const l of lotes.values()) if (!l.usado) for (const m of l.mallas) m.visible = false; },
    /** A model left the world for good (no copy uses it): free its lotes. */
    olvidar(prefijo: string): void {
      for (const [k, l] of lotes) if (k.startsWith(prefijo)) { soltarMallas(l); for (const m of l.mats) if (!l.partes.some((p) => p.mat === m)) m.dispose(); lotes.delete(k); }
    },
    /** For checks: lotes drawn last frame, copies in them, instanced meshes, matrix uploads so far. */
    estado(): { lotes: number; copias: number; mallas: number; escrituras: number } {
      let n = 0, copias = 0, mallas = 0;
      for (const l of lotes.values()) if (l.usado && l.n > 0) { n++; copias += l.n; mallas += l.mallas.length; }
      return { lotes: n, copias, mallas, escrituras };
    },
  };
}
