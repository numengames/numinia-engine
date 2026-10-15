// avatares-vrm (J1): the heavy half of the avatars, loaded only when the first avatar is needed (a dynamic import
// from avatares.ts, so neither three-vrm nor the glTF loader is in the start bundle). One parsed VRM per file,
// cloned per player; one AnimationClip per file × animation, shared by every clone of that file.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as clonarEsqueleto } from "three/addons/utils/SkeletonUtils.js";
import { VRMHumanoid, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { MToonMaterialLoaderPlugin, VRM, VRMHumanBones } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationHumanoidTracks } from "@pixiv/three-vrm-animation";
import type { VRMAnimation } from "@pixiv/three-vrm-animation";
import { TRIANGULOS_MAX } from "./avatares-politica.ts";

/** A VRM file parsed once: never drawn itself, only cloned. */
export type Plantilla = { vrm: VRM; cadera: number; triangulos: number; clips: Map<string, THREE.AnimationClip> };
/** One player's copy: its own bones and normalized rig, shared geometry, materials and clips. */
export type Copia = { raiz: THREE.Group; humanoid: VRMHumanoid; mixer: THREE.AnimationMixer; plantilla: Plantilla };

// No MToon. three-vrm's MToonNodeMaterial works on both WebGPURenderer backends (checked with tools/vrma/convertir.mjs),
// but it pulls ~30 kB gz of TSL out of three/webgpu INTO THE START BUNDLE (that module is shared with the page, and
// a module is never split between chunks). The file's own fallback material (KHR_materials_unlit, its albedo texture)
// becomes a Lambert material instead: lit like the rest of the plaza, cheaper than PBR on phones, nothing new to load.
const sinMToon = (parser: { loadMesh: (i: number) => Promise<unknown> }) => ({
  beforeRoot: async () => {}, afterRoot: async () => {}, getMaterialType: () => null, extendMaterialParams: async () => {},
  loadMesh: (i: number) => parser.loadMesh(i), // GLTFLoader takes the first plugin answer, even a promise of null
}) as unknown as MToonMaterialLoaderPlugin;
/** The face shapes (visemes, blinks: 16 in the house avatars) are not used yet: dropped, so the shader and the GPU
 * memory shrink (voice and expressions will bring them back). */
function sinFormas(escena: THREE.Object3D): void {
  escena.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.morphTargetInfluences) return;
    m.geometry.morphAttributes = {};
    m.morphTargetInfluences = undefined;
    m.morphTargetDictionary = undefined;
  });
}
function aLambert(escena: THREE.Object3D): void {
  const hechos = new Map<THREE.Material, THREE.Material>();
  escena.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const cambiar = (viejo: THREE.Material) => {
      let nuevo = hechos.get(viejo);
      if (!nuevo) {
        const b = viejo as THREE.MeshBasicMaterial;
        nuevo = new THREE.MeshLambertMaterial({ map: b.map ?? null, color: b.color ?? 0xffffff, transparent: b.transparent, opacity: b.opacity, alphaTest: b.alphaTest, side: b.side, name: b.name });
        hechos.set(viejo, nuevo);
        viejo.dispose();
      }
      return nuevo;
    };
    m.material = Array.isArray(m.material) ? m.material.map(cambiar) : cambiar(m.material);
  });
}

export function crearCargador() {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p, { mtoonMaterialPlugin: sinMToon(p as unknown as { loadMesh: (i: number) => Promise<unknown> }) }));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));
  return {
    async modelo(url: string): Promise<Plantilla> {
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) throw new Error(`${url} no es un VRM`);
      let triangulos = 0;
      vrm.scene.traverse((o) => { const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null; if (g) triangulos += (g.index ? g.index.count : g.attributes.position.count) / 3; });
      if (triangulos > TRIANGULOS_MAX) throw new Error(`${url}: ${triangulos} triángulos > ${TRIANGULOS_MAX}; se queda en cápsula`);
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      sinFormas(vrm.scene);
      aLambert(vrm.scene);
      const cadera = vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 1;
      return { vrm, cadera, triangulos, clips: new Map() };
    },
    async animacion(url: string): Promise<VRMAnimation> {
      const gltf = await loader.loadAsync(url);
      const a = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
      if (!a) throw new Error(`${url} no trae VRMC_vrm_animation`);
      return a;
    },
  };
}

/** The clip of `anim` for this file (made once; track names point at the normalized bones every clone has). */
export function clipDe(p: Plantilla, nombre: string, anim: VRMAnimation): THREE.AnimationClip {
  let c = p.clips.get(nombre);
  if (!c) {
    const { translation, rotation } = createVRMAnimationHumanoidTracks(anim, p.vrm.humanoid, p.vrm.meta.metaVersion);
    c = new THREE.AnimationClip(nombre, anim.duration, [...translation.values(), ...rotation.values()]);
    p.clips.set(nombre, c);
  }
  return c;
}

/**
 * Clone a parsed VRM for one player. three-vrm has no clone: SkeletonUtils.clone copies the bones (sharing geometry
 * and materials), then a new VRMHumanoid is built over the copied bones, with its own normalized rig. Built at the
 * origin with no rotation, like the loader builds the original; VRM 0.x models face −Z and get turned round after.
 */
export function copiar(p: Plantilla): Copia {
  const fuente = p.vrm.scene;
  const escena = clonarEsqueleto(fuente) as THREE.Object3D;
  const par = new Map<THREE.Object3D, THREE.Object3D>();
  const emparejar = (a: THREE.Object3D, b: THREE.Object3D) => { par.set(a, b); a.children.forEach((c, i) => emparejar(c, b.children[i])); };
  emparejar(fuente, escena);
  par.get(p.vrm.humanoid.normalizedHumanBonesRoot)?.removeFromParent(); // the original's rig, copied as dead nodes
  escena.position.set(0, 0, 0); escena.rotation.set(0, 0, 0); escena.scale.set(1, 1, 1);
  escena.updateMatrixWorld(true);
  const huesos: VRMHumanBones = {} as VRMHumanBones;
  for (const [nombre, hueso] of Object.entries(p.vrm.humanoid.humanBones)) {
    const n = hueso && par.get(hueso.node);
    if (n) (huesos as Record<string, { node: THREE.Object3D }>)[nombre] = { node: n };
  }
  const humanoid = new VRMHumanoid(huesos);
  escena.add(humanoid.normalizedHumanBonesRoot);
  if (p.vrm.meta.metaVersion === "0") escena.rotation.y = Math.PI;
  // skinned bounds: three would compute them once from bones that may not be posed yet (and cull the avatar by
  // mistake); the bind-pose sphere with room for arms and hips moving is enough to cull the ones behind you
  escena.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.boundingSphere = m.geometry.boundingSphere!.clone();
    m.boundingSphere.radius *= 1.5;
  });
  const raiz = new THREE.Group();
  raiz.add(escena);
  return { raiz, humanoid, mixer: new THREE.AnimationMixer(escena), plantilla: p };
}

/** Free what only this copy owns (its skeleton's bone data); geometry, materials and clips belong to the file. */
export function soltar(c: Copia): void {
  c.mixer.stopAllAction();
  c.mixer.uncacheRoot(c.mixer.getRoot());
  c.raiz.removeFromParent();
  c.raiz.traverse((o) => { const s = (o as THREE.SkinnedMesh).skeleton; if (s) s.dispose(); });
}
