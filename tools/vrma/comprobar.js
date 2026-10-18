// Check a .vrma on a real VRM with three-vrm, the way the engine plays it: WebGPURenderer (its WebGL2 backend in
// headless browsers), MToonNodeMaterial, VRMAnimationLoaderPlugin + createVRMAnimationClip. Measures hips, head and
// the lowest point of the skinned mesh (feet on the ground?) and renders a pose for a picture.
// window.comprobar(vrmUrl, [vrmaUrl], times) → { avatar, clips: { url: [{ t, hips, head, lowest }] } }
// window.pose(i, t) draws clip i at time t (the driver takes the screenshot).
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"; // E3: the house files are meshopt-packed (tools/aligerar-activos.ts)
import { MToonMaterialLoaderPlugin, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";

let renderer, scene, camera, vrm, mixer, actions = [];
const W = 240, H = 320;
async function setup() {
  renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: !location.search.includes("webgpu") });
  await renderer.init();
  renderer.setSize(W, H);
  document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(6, 12, 4); scene.add(sun);
  const grid = new THREE.GridHelper(4, 8, 0x6f7f68, 0x8d9c86); scene.add(grid);
  camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 50);
}
const lowest = () => {
  let min = Infinity;
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); min = Math.min(min, b.min.y); } });
  return +min.toFixed(3);
};
const y = (bone) => +(vrm.humanoid.getRawBoneNode(bone)?.getWorldPosition(new THREE.Vector3()).y ?? NaN).toFixed(3);

window.comprobar = async (vrmUrl, vrmaUrls, times) => {
  if (!renderer) await setup();
  if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((p) => new VRMLoaderPlugin(p, { mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(p, { materialType: MToonNodeMaterial }) }));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));
  const t0 = performance.now();
  const gltf = await loader.loadAsync(vrmUrl);
  const loadMs = Math.round(performance.now() - t0);
  vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  vrm.update(0);
  const materials = new Set(); let tris = 0;
  vrm.scene.traverse((o) => { if (o.isMesh) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m.type)); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  const avatar = { loadMs, metaVersion: vrm.meta.metaVersion, materials: [...materials], triangles: tris, hips: y("hips"), head: y("head"), lowest: lowest(),
    bones: Object.keys(vrm.humanoid.humanBones).length };
  mixer = new THREE.AnimationMixer(vrm.scene);
  actions = [];
  const clips = {};
  for (const url of vrmaUrls) {
    const g = await loader.loadAsync(url);
    const anim = g.userData.vrmAnimations?.[0];
    if (!anim) { clips[url] = { error: "no VRMC_vrm_animation in the file" }; continue; }
    const clip = createVRMAnimationClip(anim, vrm);
    const action = mixer.clipAction(clip);
    actions.push(action);
    const samples = [];
    for (const t of times) {
      mixer.stopAllAction(); action.reset().play(); mixer.setTime(Math.min(t, clip.duration));
      vrm.update(0);
      samples.push({ t, hips: y("hips"), head: y("head"), lowest: lowest() });
    }
    clips[url] = { duration: +clip.duration.toFixed(3), tracks: clip.tracks.length, samples };
  }
  return { avatar, clips };
};

window.pose = (i, t, yaw = 0.6) => {
  mixer.stopAllAction();
  if (i >= 0) { actions[i].reset().play(); mixer.setTime(t); }
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  const head = vrm.humanoid.getRawBoneNode("head").getWorldPosition(new THREE.Vector3());
  const h = Math.max(head.y + 0.25, 0.8);
  camera.position.set(Math.sin(yaw) * h * 2.2, h * 0.55, Math.cos(yaw) * h * 2.2);
  camera.lookAt(0, h * 0.48, 0);
  renderer.render(scene, camera);
  return true;
};
window.ready2 = true;
