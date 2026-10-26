// fundir-quietos (E2): a model that never moves inside (no clips: the event hall, a stall, a table) drawn with one mesh
// per look instead of one per piece. Done ONCE per file, when it loads; the file on disk is never touched, and the
// model keeps exactly its look (its own normals, uvs and materials — unlike hornear(), which flattens normals).
//   - pieces with the same material (and the same vertex layout, shadows and winding) become one geometry;
//   - plain opaque standard materials (no maps) that differ only in colour, roughness, metalness and glow (the
//     low-poly models of the templates: a stall in four colours, the neon decoration) become ONE node material that
//     reads those four from the vertices — fundir.ts (N15) does the colour half of this for animated models. Each
//     triangle gets exactly its old material's values, so it shades the same: a four-colour stall goes 4 -> 1;
//   - identical vertex materials are shared by every model fused this way (one material, one program).
// Each piece's place inside the model is baked into its vertices (positions, normals, tangents; a mirrored piece gets
// its triangles turned so it still faces out), like PlayCanvas' static batching does
// (work/biblioteca-motores/repos/playcanvas__engine/src/scene/batching/batch-manager.js, prepare() splits by material,
// vertex format, indexed, castShadow and scale sign; create() bakes the node transform into the streams when
// !dynamic). The whole thing still moves as one: the copy's group carries the thing's place, so the builder can move
// it, a hand can carry it, the gizmo and picking see one mesh per look. Anything this does not fuse (lines, points,
// sprites, skins, morphs, several materials on one mesh, draw ranges) makes it return null: the model is drawn as it
// was. Transparent pieces (sorted one by one) and pieces with their own draw order or data stay their own mesh.
// Pieces whose alpha test cuts every pixel are kept (picking and the model's size still see them) but not drawn.
import * as THREE from "three/webgpu";
import { attribute } from "three/tsl";
import type { Parte } from "./lotes.ts";

export type Quieto = {
  /** The fused model (clone it per copy with Object3D.clone: geometries and materials are shared). */
  escena: THREE.Object3D;
  /** Its meshes as lotes.ts parts (they sit at the model's origin), so 4+ still copies are still drawn instanced. */
  partes: Parte[];
  /** Meshes drawn before and after (one draw call each per pass). */
  antes: number;
  despues: number;
};

/** The vertex materials shared by every fused model: same look (all but colour, roughness, metalness, glow). */
const comunes = new Map<string, THREE.Material>();

/** What a plain material looks like but for the four values that can live in the vertices; null = it cannot. */
export function lookPlano(m: THREE.Material): string | null {
  const s = m as THREE.MeshStandardMaterial;
  if (s.type !== "MeshStandardMaterial" || (s as unknown as { isNodeMaterial?: boolean }).isNodeMaterial) return null;
  if (s.vertexColors || s.transparent || s.opacity !== 1 || s.alphaTest > 0 || s.alphaHash) return null;
  for (const v of Object.values(s)) if (v && (v as THREE.Texture).isTexture) return null; // any map: no
  const j = s.toJSON() as Record<string, unknown>;
  for (const k of ["uuid", "name", "color", "roughness", "metalness", "emissive", "emissiveIntensity", "metadata", "userData"]) delete j[k];
  return `plano:${JSON.stringify(j)}`;
}

/** The node material that draws a plain look with its four values from the vertices (see the header). */
function materialDeVertices(base: THREE.Material): THREE.Material {
  const n = new THREE.MeshStandardNodeMaterial();
  n.copy(base as unknown as THREE.MeshStandardNodeMaterial);
  n.color.setRGB(1, 1, 1); n.emissive.setRGB(0, 0, 0); n.emissiveIntensity = 1; n.roughness = 1; n.metalness = 0;
  n.vertexColors = true;
  n.roughnessNode = attribute("rugosidad", "float");
  n.metalnessNode = attribute("metalico", "float");
  n.emissiveNode = attribute("emisivo", "vec3");
  n.name = "quieto (en vertices)";
  n.userData = { colorEnVertices: true };
  return n;
}

type Pieza = { malla: THREE.Mesh; m: THREE.Matrix4; espejo: boolean };

/** All attributes as plain float32 (glTF may hand them interleaved, quantized or normalized: baking needs floats). */
function plano(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    out[i * k] = a.getX(i);
    if (k > 1) out[i * k + 1] = a.getY(i);
    if (k > 2) out[i * k + 2] = a.getZ(i);
    if (k > 3) out[i * k + 3] = a.getW(i);
  }
  return new THREE.BufferAttribute(out, k);
}

/** The attributes a group keeps: all of them, except (colour in the vertices) its own colours and uvs nobody samples. */
const propios = (g: THREE.BufferGeometry, colores: boolean) => Object.keys(g.attributes).filter((k) => !(colores && (k === "color" || k === "rugosidad" || k === "metalico" || k === "emisivo" || /^uv\d*$/.test(k))));
const firma = (g: THREE.BufferGeometry, colores: boolean) => propios(g, colores).sort().map((k) => `${k}:${g.attributes[k].itemSize}`).join(",");

/** Why a mesh cannot be fused (null: it can). */
function noSePuede(m: THREE.Mesh): string | null {
  const g = m.geometry;
  if ((m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) return "especial";
  if (Array.isArray(m.material)) return "varios materiales";
  if (!g?.attributes.position) return "sin posiciones";
  if (Object.keys(g.morphAttributes).length || m.morphTargetInfluences?.length) return "formas";
  if (g.drawRange && (g.drawRange.start > 0 || g.drawRange.count !== Infinity) || g.groups.length > 1) return "rango";
  return null;
}
/** A mesh that is kept as it is (its own mesh, its place baked into its matrix), not merged with others. */
function aparte(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.Material;
  if (mat.transparent || mat.opacity < 1) return true; // its pieces are sorted one by one: keep them apart
  return m.renderOrder !== 0 || m.layers.mask !== 1 || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || Object.keys(m.userData).some((k) => k !== "name"); // GLTFLoader leaves its name there
}
/** A piece nobody ever sees: every pixel is cut by its alpha test (opacity · map alpha · vertex alpha <= opacity <
 * alphaTest), in the frame and in the shadow map. The event hall has eight such boxes (16 draw calls for nothing). */
const invisible = (m: THREE.Mesh): boolean => { const mat = m.material as THREE.Material; return mat.alphaTest > 0 && mat.opacity < mat.alphaTest; };

/**
 * Fuse a model that does not animate. `escena` is the parsed file's scene (read, never changed). null when there is
 * nothing to win or it cannot be done safely (see the header).
 */
export function fundirQuieto(escena: THREE.Object3D): Quieto | null {
  escena.updateMatrixWorld(true);
  const raizInv = escena.parent ? escena.parent.matrixWorld.clone().invert() : new THREE.Matrix4(); // a copy carries the root's own transform too
  const piezas: Pieza[] = [], sueltas: Pieza[] = [], ocultas: Pieza[] = [];
  let raro = false;
  escena.traverseVisible((o) => {
    if (raro) return;
    if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) { raro = true; return; }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (noSePuede(m)) { raro = true; return; }
    const rel = new THREE.Matrix4().multiplyMatrices(raizInv, m.matrixWorld);
    (invisible(m) ? ocultas : aparte(m) ? sueltas : piezas).push({ malla: m, m: rel, espejo: rel.determinant() < 0 });
  });
  const antes = piezas.length + sueltas.length + ocultas.length;
  if (raro || antes < 2) return null;

  // looks: colour-only materials that appear with more than one colour become one vertex-colour look
  const looks = new Map<THREE.Material, string>();
  for (const p of piezas) { const mat = p.malla.material as THREE.Material; if (!looks.has(mat)) looks.set(mat, lookPlano(mat) ?? `mat:${mat.uuid}`); }
  const porLook = new Map<string, Set<THREE.Material>>();
  for (const [mat, l] of looks) { const s = porLook.get(l) ?? new Set(); s.add(mat); porLook.set(l, s); }
  const enVertices = (mat: THREE.Material) => { const l = looks.get(mat)!; return !l.startsWith("mat:") && porLook.get(l)!.size > 1; };

  type Grupo = { piezas: Pieza[]; colores: boolean; mat: THREE.Material; sombra: boolean; recibe: boolean; sinSombra?: boolean; oculto?: boolean };
  const grupos = new Map<string, Grupo>();
  for (const p of piezas) {
    const mat = p.malla.material as THREE.Material, colores = enVertices(mat);
    const clave = `${colores ? looks.get(mat) : `mat:${mat.uuid}`}#${firma(p.malla.geometry, colores)}#${p.malla.castShadow ? 1 : 0}${p.malla.receiveShadow ? 1 : 0}${p.malla.userData.sinSombra ? "x" : ""}`; // «sinSombra» (glTF extras) keeps meshes apart: the fused one carries it on
    let g = grupos.get(clave);
    if (!g) grupos.set(clave, (g = { piezas: [], colores, mat, sombra: p.malla.castShadow, recibe: p.malla.receiveShadow, sinSombra: !!p.malla.userData.sinSombra }));
    g.piezas.push(p);
  }
  const despues = grupos.size + sueltas.length;
  if (despues >= antes) return null;

  const raiz = new THREE.Group();
  raiz.name = escena.name || "fundido";
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  const todos = [...grupos.values()];
  if (ocultas.length) todos.push({ piezas: ocultas, colores: false, mat: ocultas[0].malla.material as THREE.Material, sombra: false, recibe: false, oculto: true });
  for (const g of todos) {
    const nombres = g.oculto ? ["position"] : propios(g.piezas[0].malla.geometry, g.colores); // never drawn: its shape is enough
    let total = 0, indices = 0;
    for (const p of g.piezas) { const gp = p.malla.geometry; total += gp.attributes.position.count; indices += gp.index ? gp.index.count : gp.attributes.position.count; }
    const salida: Record<string, Float32Array> = {};
    const tam: Record<string, number> = {};
    for (const k of nombres) { tam[k] = g.piezas[0].malla.geometry.attributes[k].itemSize; salida[k] = new Float32Array(total * tam[k]); }
    const color = g.colores ? new Float32Array(total * 3) : null, rug = g.colores ? new Float32Array(total) : null, met = g.colores ? new Float32Array(total) : null, emi = g.colores ? new Float32Array(total * 3) : null;
    const idx = total > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let base = 0, ii = 0;
    for (const p of g.piezas) {
      const gp = p.malla.geometry, n = gp.attributes.position.count;
      nm.getNormalMatrix(p.m);
      for (const k of nombres) {
        const a = plano(gp.attributes[k] as THREE.BufferAttribute), arr = a.array as Float32Array, it = tam[k];
        if (k === "position") for (let i = 0; i < n; i++) { v.fromArray(arr, i * 3).applyMatrix4(p.m); v.toArray(arr, i * 3); }
        else if (k === "normal") for (let i = 0; i < n; i++) { v.fromArray(arr, i * 3).applyMatrix3(nm).normalize(); v.toArray(arr, i * 3); }
        else if (k === "tangent") for (let i = 0; i < n; i++) { v.fromArray(arr, i * it).transformDirection(p.m); arr[i * it] = v.x; arr[i * it + 1] = v.y; arr[i * it + 2] = v.z; if (p.espejo && it > 3) arr[i * it + 3] *= -1; }
        salida[k].set(arr, base * it);
      }
      if (color && rug && met && emi) {
        const s = p.malla.material as THREE.MeshStandardMaterial, c = s.color, e = s.emissive.clone().multiplyScalar(s.emissiveIntensity);
        for (let i = base; i < base + n; i++) { color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b; rug[i] = s.roughness; met[i] = s.metalness; emi[i * 3] = e.r; emi[i * 3 + 1] = e.g; emi[i * 3 + 2] = e.b; }
      }
      const src = gp.index, m = src ? src.count : n;
      for (let t = 0; t < m; t += 3) {
        const a = src ? src.getX(t) : t, b = src ? src.getX(t + 1) : t + 1, c = src ? src.getX(t + 2) : t + 2;
        idx[ii++] = base + a;
        if (p.espejo) { idx[ii++] = base + c; idx[ii++] = base + b; } else { idx[ii++] = base + b; idx[ii++] = base + c; } // a mirrored piece: keep it facing out
      }
      base += n;
    }
    const geo = new THREE.BufferGeometry();
    for (const k of nombres) geo.setAttribute(k, new THREE.BufferAttribute(salida[k], tam[k]));
    if (color && rug && met && emi) {
      geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
      geo.setAttribute("rugosidad", new THREE.BufferAttribute(rug, 1));
      geo.setAttribute("metalico", new THREE.BufferAttribute(met, 1));
      geo.setAttribute("emisivo", new THREE.BufferAttribute(emi, 3));
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    let mat = g.mat;
    if (g.colores) {
      const clave = looks.get(g.mat)!;
      let comun = comunes.get(clave);
      if (!comun) { comun = materialDeVertices(g.mat); comunes.set(clave, comun); }
      mat = comun;
    }
    const malla = new THREE.Mesh(geo, mat);
    malla.name = g.piezas.length > 1 ? `${g.piezas[0].malla.name}+${g.piezas.length - 1}` : g.piezas[0].malla.name;
    malla.castShadow = g.sombra; malla.receiveShadow = g.recibe;
    if (g.sinSombra) malla.userData.sinSombra = true;
    if (g.oculto) { malla.visible = false; malla.name = "invisibles"; }
    if (g.colores) {
      malla.userData.fundido = { colores: true }; // index.ts pintar(): painted, one colour (as N15)
      // the big map (cenital.ts) reads a thing's colour from its material: give it the colour most of it wears
      const tris = new Map<string, number>(); // triangles per colour
      for (const p of g.piezas) { const gp = p.malla.geometry, c = `#${((p.malla.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)).getHexString()}`; tris.set(c, (tris.get(c) ?? 0) + (gp.index ? gp.index.count : gp.attributes.position.count) / 3); }
      malla.userData.colorMapa = [...tris].sort((x, y) => y[1] - x[1])[0][0];
    }
    raiz.add(malla);
  }
  const partes: Parte[] = raiz.children.filter((c) => c.visible).map((c) => { const m = c as THREE.Mesh; return { geo: m.geometry, mat: m.material as THREE.Material, sombra: m.castShadow, ...(m.userData.sinSombra ? { sinSombra: true } : {}) }; });
  for (const p of sueltas) {
    const m = new THREE.Mesh(p.malla.geometry, p.malla.material);
    m.name = p.malla.name; m.castShadow = p.malla.castShadow; m.receiveShadow = p.malla.receiveShadow;
    m.renderOrder = p.malla.renderOrder; m.layers.mask = p.malla.layers.mask; m.onBeforeRender = p.malla.onBeforeRender; m.userData = { ...p.malla.userData };
    p.m.decompose(m.position, m.quaternion, m.scale); m.matrixAutoUpdate = false; m.matrix.copy(p.m); // exact, even sheared
    raiz.add(m);
    partes.push({ geo: m.geometry, mat: m.material as THREE.Material, sombra: m.castShadow, rel: p.m.clone(), ...(m.userData.sinSombra ? { sinSombra: true } : {}) });
  }
  return { escena: raiz, partes, antes, despues };
}

/** One fusion per file, kept for every copy (index.ts). Models with clips go to fundir.ts (N15), not here. */
export function crearQuietos() {
  const hechos = new Map<string, Quieto | null>();
  return function quietoDe(model: string, escena: THREE.Object3D, clips: readonly unknown[]): Quieto | null {
    if (hechos.has(model)) return hechos.get(model)!;
    let q: Quieto | null = null;
    if (!clips.length) { try { q = fundirQuieto(escena); } catch (err) { console.warn(`[objetos] no pude fundir ${model}:`, err); q = null; } }
    hechos.set(model, q);
    return q;
  };
}
