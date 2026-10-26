// fijados (MIS-200 t_e41c0a12): the things the builder pinned («fijado» = nobody moves or deletes them until released) never move, so
// their parts can be baked into the WORLD and merged by material across models: a hall of 40 different fixed props that costs 40-120
// draw calls costs one per material per cell. Static batching, like PlayCanvas' (batch-manager.js: split by material, vertex format,
// shadow flag and winding, bake the node transform into the streams).
//   - what merges: baked parts (`Parte`, lotes.ts) of a loaded, still, unpainted, pinned copy. «Same material» = same look (claveMaterial: type,
//     colours, numbers, textures by their image) or the very same object when it carries node graphs (fundir-quietos shares those); and the
//     same vertex layout and shadow flag.
//   - cells: parts are grouped by a square cell of CELDA_M metres so the frustum and the fog still cull the far ones (one world-sized mesh
//     would always be drawn whole).
//   - the copies keep their own meshes (picking, the map, collision, the gizmo all read those); index.ts hides them only while the frame
//     is drawn and shows the merged cells instead, exactly as lotes.ts does for instanced copies.
//   - rebuilt only when the set or a matrix changes (`actualizar` compares); unpinning, moving or deleting a copy rebuilds its cells.
// Pure three, no GPU: the plan and the geometry are tested without a renderer (test/fijados.test.ts).
import * as THREE from "three/webgpu";
import type { Parte } from "./lotes.ts";

/** Side of a cell, metres. */
export const CELDA_M = 40;

export type Fijado = { id: string; partes: readonly Parte[]; matriz: THREE.Matrix4; /** The copy's centre, to pick its cell. */ x: number; z: number };
export type Trozo = { id: string; parte: Parte; matriz: THREE.Matrix4 };
export type Grupo = { clave: string; celda: string; mat: THREE.Material; sombra: boolean; trozos: Trozo[] };


/** What a material looks like, so two glTF files that each made their own copy of «the same grey plastic» still merge. A material with node
 * graphs (fundir-quietos' shared vertex materials, anything with a `*Node`) is its own key: those are already shared by identity. */
const MAPAS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap", "bumpMap", "displacementMap", "lightMap", "envMap"] as const;
const firmas = new WeakMap<THREE.Material, string>();
export function claveMaterial(m: THREE.Material): string {
  let k = firmas.get(m);
  if (k !== undefined) return k;
  const x = m as unknown as Record<string, unknown>;
  const conNodos = Object.keys(x).some((n) => n.endsWith("Node") && x[n] != null);
  if (conNodos || m.userData?.colorEnVertices || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || (m as { customProgramCacheKey?: unknown }).customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) k = m.uuid;
  else {
    const num = (n: string) => { const v = x[n]; return typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v == null ? "" : String(v); };
    const col = (n: string) => { const v = x[n] as THREE.Color | undefined; return v?.isColor ? v.getHexString() : ""; };
    const tex = (n: string) => { const t = x[n] as THREE.Texture | null | undefined; return t ? `${t.source?.uuid ?? t.uuid}/${t.wrapS}${t.wrapT}${t.flipY ? "f" : ""}/${t.repeat?.x},${t.repeat?.y}/${t.offset?.x},${t.offset?.y}/${t.channel}` : ""; };
    k = [m.type, col("color"), col("emissive"), ...["roughness", "metalness", "emissiveIntensity", "opacity", "alphaTest", "envMapIntensity", "aoMapIntensity", "bumpScale"].map(num),
      m.transparent ? "t" : "o", m.side, m.depthWrite ? "w" : "-", m.depthTest ? "d" : "-", m.blending, m.vertexColors ? "v" : "-", x.flatShading ? "F" : "-", x.wireframe ? "W" : "-", ...MAPAS.map(tex),
      x.normalScale ? `${(x.normalScale as THREE.Vector2).x},${(x.normalScale as THREE.Vector2).y}` : ""].join("|");
  }
  firmas.set(m, k);
  return k;
}

/** The layout a merge needs equal: attribute names and sizes, and whether it is indexed. */
export const disposicion = (g: THREE.BufferGeometry): string =>
  Object.keys(g.attributes).sort().map((n) => `${n}${g.attributes[n].itemSize}${(g.attributes[n] as THREE.BufferAttribute).normalized ? "n" : ""}`).join(",") + (g.index ? "|i" : "|-");

/** Can a part be merged? Only a plain mesh part with positions; an instanced/skinned/morph model never gets here (it has no `partes`). */
export const sePuede = (p: Parte): boolean => !!p.geo.attributes.position && !Array.isArray(p.mat) && !p.geo.morphAttributes.position;

/** Can ALL of a copy's parts be merged? A copy is merged whole or not at all (its own meshes are hidden while the cells draw). */
export const fusionable = (partes: readonly Parte[]): boolean => partes.length > 0 && partes.every(sePuede);

/** Group the parts of these pinned copies by material (+ shadow flag + vertex layout) and cell. Pure: no geometry is built. */
export function planFijados(fijados: readonly Fijado[], celdaM = CELDA_M): Grupo[] {
  const grupos = new Map<string, Grupo>();
  const tmp = new THREE.Matrix4();
  for (const f of fijados) {
    const celda = `${Math.floor(f.x / celdaM)},${Math.floor(f.z / celdaM)}`;
    for (const p of f.partes) {
      if (!sePuede(p)) continue;
      const clave = `${celda}|${claveMaterial(p.mat)}|${p.sombra ? "s" : "-"}|${disposicion(p.geo)}`;
      let g = grupos.get(clave);
      if (!g) grupos.set(clave, (g = { clave, celda, mat: p.mat, sombra: p.sombra, trozos: [] }));
      g.trozos.push({ id: f.id, parte: p, matriz: p.rel ? tmp.multiplyMatrices(f.matriz, p.rel).clone() : f.matriz.clone() });
    }
  }
  return [...grupos.values()];
}

/** The merged geometry of one group, in world space. A mirrored piece (negative determinant) gets its triangles turned so it still faces out. */
export function geometriaDeGrupo(g: Grupo): THREE.BufferGeometry {
  const nombres = Object.keys(g.trozos[0].parte.geo.attributes);
  const indexado = !!g.trozos[0].parte.geo.index;
  let nV = 0, nI = 0;
  for (const t of g.trozos) { nV += t.parte.geo.attributes.position.count; nI += t.parte.geo.index?.count ?? 0; }
  const out = new THREE.BufferGeometry();
  const arrays = new Map<string, { a: Float32Array; size: number }>();
  for (const n of nombres) { const size = g.trozos[0].parte.geo.attributes[n].itemSize; arrays.set(n, { a: new Float32Array(nV * size), size }); }
  const idx = indexado ? new Uint32Array(nI) : null;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), v4 = new THREE.Vector4();
  let vo = 0, io = 0;
  for (const t of g.trozos) {
    const geo = t.parte.geo, n = geo.attributes.position.count;
    nm.getNormalMatrix(t.matriz);
    const espejo = t.matriz.determinant() < 0;
    for (const nombre of nombres) {
      const src = geo.attributes[nombre], dst = arrays.get(nombre)!;
      for (let i = 0; i < n; i++) {
        const o = (vo + i) * dst.size;
        if (nombre === "position") { v.fromBufferAttribute(src, i).applyMatrix4(t.matriz); dst.a[o] = v.x; dst.a[o + 1] = v.y; dst.a[o + 2] = v.z; }
        else if (nombre === "normal") { v.fromBufferAttribute(src, i).applyMatrix3(nm).normalize(); dst.a[o] = v.x; dst.a[o + 1] = v.y; dst.a[o + 2] = v.z; }
        else if (nombre === "tangent") { v4.fromBufferAttribute(src, i); v.set(v4.x, v4.y, v4.z).transformDirection(t.matriz); dst.a[o] = v.x; dst.a[o + 1] = v.y; dst.a[o + 2] = v.z; dst.a[o + 3] = espejo ? -v4.w : v4.w; }
        else for (let k = 0; k < dst.size; k++) dst.a[o + k] = [src.getX, src.getY, src.getZ, src.getW][k].call(src, i);
      }
    }
    if (idx && geo.index) {
      const m = geo.index.count;
      for (let i = 0; i < m; i += 3) {
        const a = geo.index.getX(i) + vo, b = geo.index.getX(i + 1) + vo, c = geo.index.getX(i + 2) + vo;
        idx[io + i] = a; idx[io + i + 1] = espejo ? c : b; idx[io + i + 2] = espejo ? b : c;
      }
      io += m;
    }
    vo += n;
  }
  for (const [nombre, { a, size }] of arrays) out.setAttribute(nombre, new THREE.BufferAttribute(a, size));
  if (idx) out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

const igual = (a: THREE.Matrix4, b: THREE.Matrix4): boolean => { for (let i = 0; i < 16; i++) if (a.elements[i] !== b.elements[i]) return false; return true; };

export function crearFijados(padre: THREE.Object3D) {
  const raiz = new THREE.Group();
  raiz.name = "fijados"; raiz.visible = false; // shown only while the frame is drawn (index.ts)
  padre.add(raiz);
  let anterior: { id: string; partes: readonly Parte[]; matriz: THREE.Matrix4 }[] = [];
  let mallas: THREE.Mesh[] = [];
  let ocultables = new Map<THREE.Mesh, { x: number; y: number; z: number; r: number }>();
  const porId = new Map<string, number>(); // the copies the cells draw -> how many parts each gave
  let reconstrucciones = 0;

  function soltar(): void { for (const m of mallas) { m.removeFromParent(); m.geometry.dispose(); } mallas = []; ocultables = new Map(); porId.clear(); }

  return {
    raiz,
    /** Offer this frame's pinned copies. Rebuilds the merged cells only if the set (or a matrix, or a part list) changed since last time. */
    actualizar(fijados: readonly Fijado[]): boolean {
      let igualQue = fijados.length === anterior.length;
      for (let i = 0; igualQue && i < fijados.length; i++) {
        const a = anterior[i], f = fijados[i];
        igualQue = a.id === f.id && a.partes === f.partes && igual(a.matriz, f.matriz);
      }
      if (igualQue) return false;
      anterior = fijados.map((f) => ({ id: f.id, partes: f.partes, matriz: f.matriz.clone() }));
      soltar();
      reconstrucciones++;
      for (const g of planFijados(fijados.filter((f) => fusionable(f.partes)))) {
        const m = new THREE.Mesh(geometriaDeGrupo(g), g.mat);
        m.castShadow = g.sombra; m.receiveShadow = true; m.matrixAutoUpdate = false;
        m.name = "fijados"; m.userData.fijados = true;
        const s = m.geometry.boundingSphere!;
        ocultables.set(m, { x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius });
        raiz.add(m); mallas.push(m);
        for (const t of g.trozos) porId.set(t.id, (porId.get(t.id) ?? 0) + 1);
      }
      return true;
    },
    /** Is this copy drawn by the merged cells (so index.ts hides its own meshes during the frame)? */
    cubre(id: string): boolean { return porId.has(id); },
    /** Per frame: draw each cell unless `tapada(centro x, y, z, radio)` (the fog hides it entirely). Returns how many cells are drawn. */
    antes(tapada: (x: number, y: number, z: number, r: number) => boolean): number {
      let n = 0;
      for (const [m, s] of ocultables) { m.visible = !tapada(s.x, s.y, s.z, s.r); if (m.visible) n++; }
      return n;
    },
    stats: () => ({ celdas: mallas.length, copias: porId.size, reconstrucciones }),
    destruir: soltar,
  };
}
