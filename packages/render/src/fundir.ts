// fundir (N15): an animated model (clips, skins, parts hanging from bones) drawn with as few draw calls as it has
// different looks, not one per piece. Done ONCE per file, when it loads, on a copy of it; the file on disk is never
// touched. Every piece of the model becomes part of one SkinnedMesh per material, all sharing one skeleton:
//   - a piece that hangs from a node (a bone or any node the clips move) is skinned to that node with weight 1;
//   - a skinned piece keeps its own bones and weights (two skins of the same bones end up as one);
//   - a piece with morph targets (a face) carries them, and the other pieces of its mesh get zero deltas;
//   - when the materials differ only in colour (flat-coloured low-poly models, like the house robot), they become ONE
//     material with the colour in the vertices: the robot goes from 19 draw calls to 1, shadows from 19 to 1.
// The nodes stay where they were (each piece's mesh is swapped for a plain node with its name, place and children),
// so the clips move the same nodes they moved before; morph tracks are pointed at the fused meshes. Anything this
// does not know how to fuse stays as it was (lines, points, sprites, several materials on one mesh, two faces that
// would have to share one set of morph weights, different vertex attributes): it costs what it cost before.
import * as THREE from "three/webgpu";

export type Fundido = {
  /** The model with its pieces fused (clone it per copy with SkeletonUtils.clone; play `clips` on the copy). */
  escena: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Meshes drawn before and after (one draw call each per pass). */
  antes: number;
  despues: number;
};

type Pieza = {
  malla: THREE.Mesh;
  /** Each vertex's joints (into the joint list) and weights, 4 each. */
  juntas: (v: number) => [number[], number[]];
  /** The vertex (and normal / morph delta) transform into the rest space where the fused geometry lives. */
  m: THREE.Matrix4;
  dueno: THREE.Object3D | null; // the owner of its morph weights (null: no morph targets)
};

const ATRIBUTOS_PROPIOS = new Set(["position", "normal", "skinIndex", "skinWeight", "color"]);
const firmaAtributos = (g: THREE.BufferGeometry) => Object.keys(g.attributes).filter((k) => !ATRIBUTOS_PROPIOS.has(k)).sort().map((k) => `${k}:${g.attributes[k].itemSize}`).join(",") + (g.attributes.normal ? "|n" : "|-") + (g.attributes.color ? `|c${g.attributes.color.itemSize}` : "");

/** Two materials that look the same but for their colour (and only colour): plain standard materials with no maps. */
function soloColor(m: THREE.Material): string | null {
  const s = m as THREE.MeshStandardMaterial;
  if (s.type !== "MeshStandardMaterial" && s.type !== "MeshLambertMaterial" && s.type !== "MeshPhongMaterial" && s.type !== "MeshBasicMaterial") return null;
  if (s.vertexColors || s.transparent || s.alphaTest > 0 || s.opacity !== 1) return null;
  for (const v of Object.values(s)) if (v && (v as THREE.Texture).isTexture) return null; // any map: no
  const j = s.toJSON() as Record<string, unknown>;
  for (const k of ["uuid", "name", "color", "metadata", "userData"]) delete j[k];
  return JSON.stringify(j);
}

/**
 * Fuse `escena` (already a private copy: it is changed in place) and rewrite `clips` for it. null when there is
 * nothing to win (the model already draws with as many meshes as it would after fusing).
 */
export function fundirAnimado(escena: THREE.Object3D, clips: THREE.AnimationClip[]): Fundido | null {
  escena.updateMatrixWorld(true);
  const mallas: THREE.Mesh[] = [];
  escena.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) mallas.push(o as THREE.Mesh); });
  const antes = mallas.length;
  if (antes < 2) return null;

  // joints: (node, its inverse rest matrix); the same node may come twice with different inverses (two skins)
  const juntas: { nodo: THREE.Object3D; inv: THREE.Matrix4 }[] = [];
  const juntaDe = (nodo: THREE.Object3D, inv: THREE.Matrix4): number => {
    const i = juntas.findIndex((j) => j.nodo === nodo && j.inv.equals(inv));
    if (i >= 0) return i;
    juntas.push({ nodo, inv: inv.clone() });
    return juntas.length - 1;
  };
  // the owner of a mesh's morph weights: the glTF mesh, i.e. the group of its sibling primitives with the same targets
  const duenoDe = (m: THREE.Mesh): THREE.Object3D | null => {
    if (!m.morphTargetInfluences?.length) return null;
    const p = m.parent, d = JSON.stringify(m.morphTargetDictionary ?? {});
    const hermanos = p ? p.children.filter((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).morphTargetInfluences?.length) : [];
    return p && hermanos.length > 1 && hermanos.every((c) => JSON.stringify((c as THREE.Mesh).morphTargetDictionary ?? {}) === d) ? p : m;
  };

  const piezas: Pieza[] = [];
  for (const m of mallas) {
    if (Array.isArray(m.material) || (m as THREE.InstancedMesh).isInstancedMesh || (m as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) continue;
    const g = m.geometry;
    if (!g.attributes.position || (g.drawRange && (g.drawRange.start > 0 || g.drawRange.count !== Infinity)) || g.groups.length > 1) continue;
    const morph = Object.keys(g.morphAttributes).length > 0;
    if (morph && (!g.morphTargetsRelative || !m.morphTargetInfluences?.length)) continue;
    if (morph && Object.keys(g.morphAttributes).some((k) => k !== "position" && k !== "normal")) continue;
    const sk = m as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) {
      if (!g.attributes.skinIndex || !g.attributes.skinWeight || sk.bindMode !== "attached") continue;
      // skinned: v_world = Σ w · J.matrixWorld · boneInverse · bindMatrix · v — keep each bone's own inverse
      const mapa = sk.skeleton.bones.map((b, i) => juntaDe(b, sk.skeleton.boneInverses[i]));
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      piezas.push({ malla: m, m: sk.bindMatrix.clone(), dueno: duenoDe(m),
        juntas: (v) => [[0, 1, 2, 3].map((c) => mapa[si.getComponent(v, c)] ?? 0), [0, 1, 2, 3].map((c) => sw.getComponent(v, c))] });
    } else {
      // hanging from a node: skinned with weight 1 to itself (its node stays, and it moves when anything above moves)
      const inv = m.matrixWorld.clone().invert();
      const j = juntaDe(m, inv);
      piezas.push({ malla: m, m: m.matrixWorld.clone(), dueno: duenoDe(m), juntas: () => [[j, 0, 0, 0], [1, 0, 0, 0]] });
    }
  }
  if (piezas.length < 2) return null;

  // groups: same vertex attributes, same material (or, colour-only materials, one look), at most one morph owner
  const looks = new Map<THREE.Material, string>();
  for (const p of piezas) { const mat = p.malla.material as THREE.Material; if (!looks.has(mat)) looks.set(mat, soloColor(mat) ?? `mat:${mat.uuid}`); }
  const colorEnVertices = (k: string) => !k.startsWith("mat:") && [...looks.values()].filter((x) => x === k).length > 1;
  type Grupo = { clave: string; piezas: Pieza[]; dueno: THREE.Object3D | null; colores: boolean };
  const grupos: Grupo[] = [];
  const conDueno = piezas.filter((p) => p.dueno), sinDueno = piezas.filter((p) => !p.dueno);
  const claveDe = (p: Pieza) => { const mat = p.malla.material as THREE.Material, l = looks.get(mat)!; return `${firmaAtributos(p.malla.geometry)}#${colorEnVertices(l) ? l : `mat:${mat.uuid}`}`; };
  for (const p of conDueno) { // one group per (look, owner): two faces never share weights
    const clave = claveDe(p);
    let g = grupos.find((x) => x.clave === clave && x.dueno === p.dueno);
    if (!g) grupos.push((g = { clave, piezas: [], dueno: p.dueno, colores: false }));
    g.piezas.push(p);
  }
  for (const p of sinDueno) { // the rest join the first group of their look (zero morph deltas cost nothing to see)
    const clave = claveDe(p);
    let g = grupos.find((x) => x.clave === clave);
    if (!g) grupos.push((g = { clave, piezas: [], dueno: null, colores: false }));
    g.piezas.push(p);
  }
  for (const g of grupos) g.colores = colorEnVertices(g.clave.split("#").slice(1).join("#")) && new Set(g.piezas.map((p) => p.malla.material)).size > 1;
  const despues = antes - piezas.length + grupos.length;
  if (despues >= antes) return null;

  // the skeleton every fused mesh shares: placeholders replace the meshes that are joints
  const sustituto = new Map<THREE.Object3D, THREE.Object3D>();
  for (const p of piezas) {
    const m = p.malla, n = new THREE.Object3D();
    n.name = m.name; n.position.copy(m.position); n.quaternion.copy(m.quaternion); n.scale.copy(m.scale);
    n.matrixAutoUpdate = m.matrixAutoUpdate; n.matrix.copy(m.matrix); n.matrixWorld.copy(m.matrixWorld); n.userData = { ...m.userData };
    for (const c of [...m.children]) n.add(c);
    sustituto.set(m, n);
  }
  for (const [m, n] of sustituto) { const padre = m.parent!; const i = padre.children.indexOf(m); padre.children[i] = n; n.parent = padre; m.parent = null; }
  const huesos = juntas.map((j) => sustituto.get(j.nodo) ?? j.nodo);
  const inversas = juntas.map((j) => j.inv);
  const raizInv = escena.matrixWorld.clone().invert();

  const nombres: { malla: THREE.SkinnedMesh; dueno: THREE.Object3D | null }[] = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  grupos.forEach((g, gi) => {
    const geo0 = g.piezas[0].malla.geometry;
    const extra = Object.keys(geo0.attributes).filter((k) => !ATRIBUTOS_PROPIOS.has(k));
    const conNormal = !!geo0.attributes.normal, conColor = !!geo0.attributes.color || g.colores;
    const nMorph = g.dueno ? (g.piezas.find((p) => p.dueno)!.malla.morphTargetInfluences!.length) : 0;
    const morphN = g.piezas.some((p) => p.malla.geometry.morphAttributes.normal) && conNormal;
    let total = 0, totalIdx = 0;
    for (const p of g.piezas) { const n = p.malla.geometry.attributes.position.count; total += n; totalIdx += p.malla.geometry.index ? p.malla.geometry.index.count : n; }
    const colTam = g.colores ? 3 : geo0.attributes.color?.itemSize ?? 3; // colour-only materials have no vertex colours of their own
    const pos = new Float32Array(total * 3), nor = conNormal ? new Float32Array(total * 3) : null, col = conColor ? new Float32Array(total * colTam) : null;
    const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
    const ex = extra.map((k) => ({ k, n: geo0.attributes[k].itemSize, a: new Float32Array(total * geo0.attributes[k].itemSize) }));
    const mp = Array.from({ length: nMorph }, () => new Float32Array(total * 3)), mn = morphN ? Array.from({ length: nMorph }, () => new Float32Array(total * 3)) : [];
    const idx = total > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
    let o = 0, oi = 0;
    for (const p of g.piezas) {
      const geo = p.malla.geometry, P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, n = P.count;
      nm.getNormalMatrix(p.m);
      const color = (p.malla.material as THREE.MeshStandardMaterial).color;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], (o + i) * 3);
        if (nor) { if (N) v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0); nor.set([v.x, v.y, v.z], (o + i) * 3); }
        if (col) for (let c = 0; c < colTam; c++) {
          col[(o + i) * colTam + c] = g.colores ? (color ? [color.r, color.g, color.b][c] : 1) : C ? C.getComponent(i, c) : 1;
        }
        const [js, ws] = p.juntas(i);
        si.set(js, (o + i) * 4); sw.set(ws, (o + i) * 4);
        for (const e of ex) { const A = geo.attributes[e.k]; for (let c = 0; c < e.n; c++) e.a[(o + i) * e.n + c] = A.getComponent(i, c); }
      }
      if (p.dueno && p.dueno === g.dueno) for (let t = 0; t < nMorph; t++) {
        const dp = geo.morphAttributes.position?.[t], dn = geo.morphAttributes.normal?.[t];
        for (let i = 0; i < n; i++) {
          // a delta is a vector: the matrix without its translation (transformDirection would normalize it)
          if (dp) { const e = p.m.elements, x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i); mp[t].set([e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z], (o + i) * 3); }
          if (dn && morphN) { v.fromBufferAttribute(dn, i).applyMatrix3(nm); mn[t].set([v.x, v.y, v.z], (o + i) * 3); }
        }
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[oi + i] = geo.index.getX(i) + o;
      else for (let i = 0; i < n; i++) idx[oi + i] = i + o;
      oi += geo.index ? geo.index.count : n; o += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (nor) geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, colTam));
    for (const e of ex) geo.setAttribute(e.k, new THREE.BufferAttribute(e.a, e.n));
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    if (nMorph) {
      const dic = g.piezas.find((p) => p.dueno)!.malla.morphTargetDictionary ?? {};
      const nombreDe = (t: number) => Object.keys(dic).find((k) => dic[k] === t) ?? String(t);
      geo.morphAttributes.position = mp.map((a, t) => { const b = new THREE.BufferAttribute(a, 3); b.name = nombreDe(t); return b; });
      if (morphN) geo.morphAttributes.normal = mn.map((a, t) => { const b = new THREE.BufferAttribute(a, 3); b.name = nombreDe(t); return b; });
      geo.morphTargetsRelative = true;
    }
    let mat = g.piezas[0].malla.material as THREE.Material;
    if (g.colores) { mat = mat.clone(); (mat as THREE.MeshStandardMaterial).color?.setRGB(1, 1, 1); mat.vertexColors = true; mat.name = `${mat.name || "material"} (colores)`; }
    const malla = new THREE.SkinnedMesh(geo, mat);
    malla.name = `fundido_${gi}`;
    malla.castShadow = g.piezas.some((p) => p.malla.castShadow);
    malla.receiveShadow = g.piezas.some((p) => p.malla.receiveShadow);
    malla.renderOrder = g.piezas[0].malla.renderOrder;
    malla.userData.fundido = { piezas: g.piezas.map((p) => p.malla.name), colores: g.colores };
    if (g.dueno) {
      const de = g.piezas.find((p) => p.dueno)!.malla;
      malla.morphTargetInfluences = [...de.morphTargetInfluences!];
      malla.morphTargetDictionary = { ...(de.morphTargetDictionary ?? {}) };
    }
    escena.add(malla);
    malla.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos, inversas), new THREE.Matrix4());
    // culling: the rest pose round the model's root, a little bigger (an animation reaches out of it)
    geo.computeBoundingSphere();
    const esfera = geo.boundingSphere!.clone().applyMatrix4(raizInv);
    esfera.radius *= 1.25;
    malla.boundingSphere = esfera;
    nombres.push({ malla, dueno: g.dueno });
  });

  // clips: what moved a face's morph weights now moves the fused mesh that carries that face
  const mallasDe = new Map<string, THREE.Object3D | null>(); // old mesh name -> its morph owner
  for (const p of piezas) if (p.dueno) mallasDe.set(p.malla.name, p.dueno);
  const nuevos = clips.map((c) => {
    const pistas: THREE.KeyframeTrack[] = [];
    const hechas = new Set<string>();
    for (const t of c.tracks) {
      const r = THREE.PropertyBinding.parseTrackName(t.name);
      const dueno = r.propertyName === "morphTargetInfluences" ? mallasDe.get(r.nodeName) : undefined;
      if (dueno === undefined) { pistas.push(t); continue; }
      for (const f of nombres) {
        if (f.dueno !== dueno) continue;
        const nombre = `${f.malla.name}.morphTargetInfluences${r.propertyIndex !== undefined ? `[${r.propertyIndex}]` : ""}`;
        if (hechas.has(nombre)) continue;
        hechas.add(nombre);
        const u = t.clone(); u.name = nombre; pistas.push(u);
      }
    }
    return new THREE.AnimationClip(c.name, c.duration, pistas, c.blendMode);
  });
  return { escena, clips: nuevos, antes, despues };
}
