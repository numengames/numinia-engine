// UAL (Quaternius Universal Animation Library, CC0) → .vrma (VRMC_vrm_animation 1.0), run inside a browser page.
// Same idea as movimientos/conversion/convert.js (the Hyperfy build of the same originals): for every bone, the
// world-space change from the pack's own T-pose («A_TPose»), in the VRM 1.0 frame (+X = the avatar's left, +Y up,
// +Z forward), made local to its nearest humanoid parent. The VRMA skeleton's rest pose is all identity, so three-vrm's
// VRMAnimationLoaderPlugin (parentWorld · q · restWorld⁻¹) passes the rotations through untouched and they land on the
// avatar's normalized bones as they are. The hips track is the hips position in metres; three-vrm scales it by
// (avatar hips height / animation hips height) itself.
//
// window.convertir(fbxUrl, [{ name, clip }]) → { report, files: { name: base64 VRMA } }
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const FPS = 30;
// UAL (Unreal-style) bone → VRM 1.0 humanoid bone
const MAP = { pelvis: "hips", spine_01: "spine", spine_02: "chest", spine_03: "upperChest", neck_01: "neck", Head: "head" };
for (const [s, S] of [["l", "left"], ["r", "right"]]) {
  Object.assign(MAP, {
    [`clavicle_${s}`]: `${S}Shoulder`, [`upperarm_${s}`]: `${S}UpperArm`, [`lowerarm_${s}`]: `${S}LowerArm`, [`hand_${s}`]: `${S}Hand`,
    [`thigh_${s}`]: `${S}UpperLeg`, [`calf_${s}`]: `${S}LowerLeg`, [`foot_${s}`]: `${S}Foot`, [`ball_${s}`]: `${S}Toes`,
    [`thumb_01_${s}`]: `${S}ThumbMetacarpal`, [`thumb_02_${s}`]: `${S}ThumbProximal`, [`thumb_03_${s}`]: `${S}ThumbDistal`,
  });
  for (const [f, F] of [["index", "Index"], ["middle", "Middle"], ["ring", "Ring"], ["pinky", "Little"]]) {
    MAP[`${f}_01_${s}`] = `${S}${F}Proximal`; MAP[`${f}_02_${s}`] = `${S}${F}Intermediate`; MAP[`${f}_03_${s}`] = `${S}${F}Distal`;
  }
}

const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();
const findClip = (fbx, name) => fbx.animations.find((c) => c.name === name || c.name.endsWith(`|${name}`));
function poseAt(mixer, clip, t) {
  mixer.stopAllAction();
  const a = mixer.clipAction(clip);
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  mixer.setTime(Math.min(t, clip.duration));
}

// GLTFExporter plugin: writes the VRMC_vrm_animation extension with the node index of every humanoid bone
class VrmaPlugin {
  constructor(writer, bones) { this.writer = writer; this.bones = bones; this.name = "VRMC_vrm_animation"; }
  afterParse() {
    const humanBones = {};
    for (const [bone, obj] of Object.entries(this.bones)) humanBones[bone] = { node: this.writer.nodeMap.get(obj) };
    const json = this.writer.json;
    json.extensions ??= {};
    json.extensions.VRMC_vrm_animation = { specVersion: "1.0", humanoid: { humanBones } };
    this.writer.extensionsUsed.VRMC_vrm_animation = true;
  }
}

// UAL1 (free) has no wave, the one gesture every game has (../movimientos/LISTA.md, 9 of 9). `saludo: true` makes one
// from another clip: its body as it is, the right arm replaced by a wave written here (upper arm out and a little
// forward, forearm up with the palm to the front, swinging ±22° twice a second, eased in and out). Same frame as above:
// +X = the avatar's left (the right arm points to −X), +Y up, +Z forward; rotations local to the parent bone.
const RAD = Math.PI / 180;
const SALUDO_HUESOS = { upperarm_r: true, lowerarm_r: true };
const qe = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * RAD, y * RAD, z * RAD, "YZX"));
function brazoQueSaluda(t, dur) {
  const sube = Math.max(0, Math.min(1, t / 0.35, (dur - t) / 0.35)); // 0 → 1 over the first 0.35 s, back over the last
  const peso = sube * sube * (3 - 2 * sube);
  const vaiven = Math.sin(2 * Math.PI * 1.8 * t) * 22;
  return {
    peso, // how much of the wave over the source clip's own arm
    upperarm_r: qe(0, 20, 15),                // out to the side, 15° below the shoulder, 20° forward
    lowerarm_r: qe(-90, 0, -105 + vaiven),    // palm to the front, forearm up, swinging
  };
}

// The other four gestures an AI makes (asentir, negar, pensar, señalar) are written the same way, over the idle body
// (UAL1 free has none of them; ../movimientos/PLAN.md, «los cinco gestos de la IA»). `gesto` names one; each returns a
// weight (eased in and out over 0.3 s so the loop is seamless) and, per UAL bone, a rotation to blend in:
//   abs = replace the source clip's own rotation (like the wave's arm), mul = turn on top of it (a head that nods).
// Same frame as above: +X = the avatar's left, +Y up, +Z forward; X turns a head DOWN (nod), Y turns it to the left, Z tilts it.
const envolvente = (t, dur) => { const s = Math.max(0, Math.min(1, t / 0.3, (dur - t) / 0.3)); return s * s * (3 - 2 * s); };
const GESTOS_ESCRITOS = {
  // two nods: head down 16° and back, neck a third of it
  asentir: (t, dur) => { const a = Math.sin(2 * Math.PI * 1.7 * t) * 0.5 + 0.5; return { peso: envolvente(t, dur), mul: { Head: qe(16 * a, 0, 0), neck_01: qe(6 * a, 0, 0) } }; },
  // «no»: the head turns ±24° about three times a second, neck helping
  negar: (t, dur) => { const s = Math.sin(2 * Math.PI * 1.9 * t); return { peso: envolvente(t, dur), mul: { Head: qe(0, 24 * s, 0), neck_01: qe(0, 8 * s, 0) } }; },
  // «hmm»: the right forearm up, the hand at the chin, the head a little down and to the side, a slow sway of the head
  pensar: (t, dur) => ({ peso: envolvente(t, dur),
    abs: { upperarm_r: qe(0, 0, 55), lowerarm_r: qe(-100, 0, -135) },
    mul: { Head: qe(8, 6 * Math.sin(2 * Math.PI * 0.4 * t), 5), neck_01: qe(4, 0, 0) } }),
  // the right arm straight out to the front, a little up, held (a finger-point), the head following it
  senalar: (t, dur) => ({ peso: envolvente(t, dur),
    abs: { upperarm_r: qe(0, 80, 40), lowerarm_r: qe(0, 0, -8) },
    mul: { Head: qe(0, -8, 0) } }),
};

window.convertir = async (fbxUrl, wanted) => {
  const fbx = new FBXLoader().parse(await (await fetch(fbxUrl)).arrayBuffer(), "");
  const report = { clipsInFile: fbx.animations.length, missingBones: [], clips: {} };
  const bones = {};
  for (const name of Object.keys(MAP)) { const n = fbx.getObjectByName(name); if (n) bones[name] = n; else report.missingBones.push(name); }
  const parentOf = {};
  for (const [name, node] of Object.entries(bones)) {
    let p = node.parent;
    while (p && !(p.name in bones)) p = p.parent;
    parentOf[name] = p ? p.name : null;
  }
  const rootBone = fbx.getObjectByName("root");
  const mixer = new THREE.AnimationMixer(fbx);

  // rest = «A_TPose», frame 0
  const tpose = findClip(fbx, "A_TPose");
  if (!tpose) throw new Error("no A_TPose clip in the FBX");
  poseAt(mixer, tpose, 0); fbx.updateMatrixWorld(true);
  const restQ = {}, restP = {};
  for (const [name, node] of Object.entries(bones)) { restQ[name] = node.getWorldQuaternion(q()); restP[name] = node.getWorldPosition(v()); }
  // facing: left = hand_l − hand_r, up = head − pelvis, forward = left × up
  const left = restP.hand_l.clone().sub(restP.hand_r).normalize();
  const up = restP.Head.clone().sub(restP.pelvis);
  up.sub(left.clone().multiplyScalar(up.dot(left))).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
  const R = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd)).invert(); // rig → +X left, +Y up, +Z forward
  const Rinv = R.clone().invert();
  const origin = rootBone ? rootBone.getWorldPosition(v()) : new THREE.Vector3(restP.pelvis.x, 0, restP.pelvis.z);
  const canon = (p) => p.clone().sub(origin).applyQuaternion(R);
  const hipRest = canon(restP.pelvis);
  // the FBX may be in centimetres: the converted file is in metres (the hips height says which)
  const unit = hipRest.y > 10 ? 0.01 : 1;
  const hipHeight = hipRest.y * unit;
  report.rest = { hipHeight: +hipHeight.toFixed(4), unit, facing: fwd.toArray().map((n) => +n.toFixed(3)) };

  const files = {};
  for (const { name, clip: clipName, saludo, gesto, hasta } of wanted) {
    const fuente = findClip(fbx, clipName);
    const clip = fuente && hasta ? Object.assign(fuente.clone(), { duration: Math.min(hasta, fuente.duration) }) : fuente;
    if (!clip) { report.clips[name] = { error: `no clip ${clipName} in the file` }; continue; }
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(frames);
    const rot = Object.fromEntries(Object.keys(bones).map((n) => [n, new Float32Array(frames * 4)]));
    const hips = new Float32Array(frames * 3);
    const D = {};
    // natural ground speed of an in-place loop: a toe touching the ground slides backwards at the speed the body
    // would move forwards (metres per second, and per metre of hips height to scale per avatar)
    const toes = [];
    for (let i = 0; i < frames; i++) {
      const t = Math.min(i / FPS, clip.duration);
      times[i] = t;
      poseAt(mixer, clip, t); fbx.updateMatrixWorld(true);
      for (const [n, node] of Object.entries(bones)) D[n] = R.clone().multiply(node.getWorldQuaternion(q())).multiply(restQ[n].clone().invert()).multiply(Rinv);
      for (const n of Object.keys(bones)) {
        const p = parentOf[n];
        const local = p ? D[p].clone().invert().multiply(D[n]) : D[n].clone();
        const arr = rot[n];
        if (saludo && n in SALUDO_HUESOS) { const b = brazoQueSaluda(t, clip.duration); local.slerp(b[n], b.peso); }
        if (gesto) {
          const g = GESTOS_ESCRITOS[gesto](t, clip.duration);
          if (g.abs?.[n]) local.slerp(g.abs[n], g.peso);
          if (g.mul?.[n]) local.premultiply(new THREE.Quaternion().slerp(g.mul[n], g.peso)); // identity → the rotation, by the weight
        }
        if (i > 0) { const prev = new THREE.Quaternion().fromArray(arr, (i - 1) * 4); if (prev.dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w); }
        local.toArray(arr, i * 4);
      }
      const hp = canon(bones.pelvis.getWorldPosition(v())).multiplyScalar(unit);
      hp.x -= hipRest.x * unit; hp.z -= hipRest.z * unit;
      hp.toArray(hips, i * 3);
      toes.push([canon(bones.ball_l.getWorldPosition(v())).multiplyScalar(unit), canon(bones.ball_r.getWorldPosition(v())).multiplyScalar(unit)]);
    }
    const minFootY = Math.min(...toes.flat().map((p) => p.y));
    let slide = 0, slideFrames = 0;
    for (let i = 1; i < toes.length; i++) for (const s of [0, 1]) {
      const a = toes[i - 1][s], b = toes[i][s];
      if (a.y < minFootY + 0.04 && b.y < minFootY + 0.04) { slide += (a.z - b.z) * FPS; slideFrames++; } // touching the ground in both frames
    }
    // export: a scene of plain nodes named by humanoid bone, identity rotations, offsets from the T-pose (metres)
    const scene = new THREE.Scene();
    const out = {}, byBone = {};
    for (const n of Object.keys(bones)) { const o = new THREE.Object3D(); o.name = MAP[n]; out[n] = o; byBone[MAP[n]] = o; }
    for (const n of Object.keys(bones)) {
      const p = parentOf[n];
      const rel = n === "pelvis" ? new THREE.Vector3(0, hipRest.y, 0) : restP[n].clone().sub(restP[p]).applyQuaternion(R);
      out[n].position.copy(rel.multiplyScalar(unit));
      (p ? out[p] : scene).add(out[n]);
    }
    const tracks = Object.keys(bones).map((n) => new THREE.QuaternionKeyframeTrack(`${MAP[n]}.quaternion`, times, rot[n]));
    tracks.push(new THREE.VectorKeyframeTrack("hips.position", times, hips));
    const outClip = new THREE.AnimationClip(name, clip.duration, tracks);
    const exporter = new GLTFExporter();
    exporter.register((writer) => new VrmaPlugin(writer, byBone));
    const glb = new Uint8Array(await exporter.parseAsync(scene, { binary: true, animations: [outClip], onlyVisible: false }));
    let bin = "";
    for (let k = 0; k < glb.length; k += 0x8000) bin += String.fromCharCode(...glb.subarray(k, k + 0x8000));
    files[name] = btoa(bin);
    const speed = slideFrames ? Math.max(0, slide / slideFrames) : 0;
    report.clips[name] = {
      from: saludo ? `${clipName} + saludo` : gesto ? `${clipName} + ${gesto}` : clipName, duration: +clip.duration.toFixed(3), frames, tracks: tracks.length, bytes: glb.length,
      speedMs: +speed.toFixed(3), speedPerHipHeight: +(speed / hipHeight).toFixed(3), minToeY: +minFootY.toFixed(3),
    };
  }
  return { report, files };
};
window.ready = true;
