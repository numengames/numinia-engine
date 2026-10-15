// crowd: many animated figures at once, two ways, so we can measure the cost of each.
//  - "full":  every figure is a real skinned model with its own skeleton and mixer (what a near
//             avatar costs: several draw calls and CPU skinning work per figure).
//  - "vat":   the animation is baked once into a texture (vertex animation texture) and every
//             figure is an instance of ONE draw call; the GPU reads its pose from the texture.
// Known defect (accepted for the benchmark): VAT normals are the rest pose, not rotated per figure.
import * as THREE from "three/webgpu";
import { Fn, attribute, vertexIndex, textureLoad, ivec2, int, vec3, uniform, floor, fract, mod, mix, cos, sin } from "three/tsl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export type Gltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
export type Bake = {
  geometry: THREE.BufferGeometry; tex: THREE.DataTexture; frames: number; fps: number;
  verts: number; width: number; rows: number; tris: number; scale: number; minY: number; ms: number;
};

export const loadModel = (url: string): Promise<Gltf> => new GLTFLoader().loadAsync(url) as Promise<Gltf>;

/** Bake one clip into a float texture: row block per frame, one texel per vertex (model space, metres). */
export function bakeVat(gltf: Gltf, clipName = "Walking", fps = 30, targetHeight = 1.7): Bake {
  const t0 = performance.now();
  const root = gltf.scene;
  const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let verts = 0, tris = 0;
  for (const m of meshes) { verts += m.geometry.attributes.position.count; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const width = Math.min(2048, verts), rows = Math.ceil(verts / width);
  const data = new Float32Array(width * rows * frames * 4);
  const v = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / frames) * clip.duration);
    root.updateMatrixWorld(true);
    let base = 0;
    for (const m of meshes) {
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); // skinned + morphs, then to model space
        const k = base + i, o = (((k / width) | 0) + f * rows) * width * 4 + (k % width) * 4;
        data[o] = v.x; data[o + 1] = v.y; data[o + 2] = v.z; data[o + 3] = 1;
      }
      base += n;
    }
  }
  // normalise: feet on the floor, height = targetHeight
  let minY = Infinity, maxY = -Infinity;
  for (let k = 0; k < verts; k++) { const y = data[(((k / width) | 0) * width + (k % width)) * 4 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const scale = targetHeight / (maxY - minY);
  for (let o = 0; o < data.length; o += 4) { data[o] *= scale; data[o + 1] = (data[o + 1] - minY) * scale; data[o + 2] *= scale; }

  // static merged geometry: frame-0 positions, rest normals, material colour per vertex, one index
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const index: number[] = [];
  let base = 0;
  const nm = new THREE.Matrix3(), c = new THREE.Color();
  mixer.setTime(0); root.updateMatrixWorld(true);
  for (const m of meshes) {
    const g = m.geometry, n = g.attributes.position.count;
    nm.getNormalMatrix(m.matrixWorld);
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    c.copy(mat.color ?? new THREE.Color(0xffffff));
    for (let i = 0; i < n; i++) {
      const k = base + i, o = (((k / width) | 0) * width + (k % width)) * 4;
      pos.set([data[o], data[o + 1], data[o + 2]], k * 3);
      v.fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, i).applyMatrix3(nm).normalize();
      nor.set([v.x, v.y, v.z], k * 3);
      col.set([c.r, c.g, c.b], k * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
    else for (let i = 0; i < n; i++) index.push(i + base);
    base += n;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geometry.setIndex(index);
  const tex = new THREE.DataTexture(data, width, rows * frames, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  mixer.stopAllAction();
  return { geometry, tex, frames, fps, verts, width, rows, tris, scale, minY, ms: Math.round(performance.now() - t0) };
}

/** N figures in ONE draw call. Per instance: x, z, yaw, phase (0..1 of the clip). */
export function createVatCrowd(bake: Bake, count: number) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = bake.geometry.index;
  for (const name of ["position", "normal", "color"]) geo.setAttribute(name, bake.geometry.getAttribute(name));
  const inst = new Float32Array(Math.max(1, count) * 4);
  const aInst = new THREE.InstancedBufferAttribute(inst, 4);
  aInst.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aInst", aInst);
  geo.instanceCount = count;
  const uTime = uniform(0);
  const W = bake.width, R = bake.rows, F = bake.frames;
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  mat.positionNode = Fn(() => {
    const a = attribute("aInst", "vec4");
    const f = uTime.mul(bake.fps).add(a.w.mul(F));
    const fl = floor(f);
    const f0 = int(mod(fl, F)), f1 = int(mod(fl.add(1), F));
    const vi = int(vertexIndex);
    const colI = vi.mod(int(W)), rowI = vi.div(int(W));
    const p0 = textureLoad(bake.tex, ivec2(colI, rowI.add(f0.mul(int(R))))).xyz;
    const p1 = textureLoad(bake.tex, ivec2(colI, rowI.add(f1.mul(int(R))))).xyz;
    const p = mix(p0, p1, fract(f));
    const cy = cos(a.z), sy = sin(a.z);
    return vec3(p.x.mul(cy).add(p.z.mul(sy)).add(a.x), p.y, p.z.mul(cy).sub(p.x.mul(sy)).add(a.y));
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    /** write one figure's placement; call commit() once per frame after all writes */
    set(i: number, x: number, z: number, yaw: number, phase: number) { const o = i * 4; inst[o] = x; inst[o + 1] = z; inst[o + 2] = yaw; inst[o + 3] = phase; },
    commit(timeSec: number) { uTime.value = timeSec; aInst.needsUpdate = true; },
  };
}

/** N real skinned clones, each with its own mixer (the expensive, near-avatar path). */
export function createFullCrowd(gltf: Gltf, bake: Bake, count: number, clipName = "Walking") {
  const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
  const group = new THREE.Group();
  const figures: { obj: THREE.Object3D; mixer: THREE.AnimationMixer }[] = [];
  for (let i = 0; i < count; i++) {
    const obj = SkeletonUtils.clone(gltf.scene);
    obj.scale.setScalar(bake.scale);
    const mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(clip).play();
    group.add(obj);
    figures.push({ obj, mixer });
  }
  return {
    group,
    set(i: number, x: number, z: number, yaw: number, phase: number, timeSec: number) {
      const f = figures[i];
      f.obj.position.set(x, -bake.minY * bake.scale, z);
      f.obj.rotation.y = yaw;
      f.mixer.setTime((timeSec + phase * clip.duration) % clip.duration);
    },
  };
}

/** Deterministic walking layout: a sunflower spiral where everyone walks their own circle. */
export function placement(i: number, timeSec: number, speed = 1.4): { x: number; z: number; yaw: number; phase: number } {
  const r = 1.2 * Math.sqrt(i + 4);
  const dir = i % 2 === 0 ? 1 : -1;
  const theta = i * 2.399963 + dir * (speed / r) * timeSec;
  const x = r * Math.cos(theta), z = r * Math.sin(theta);
  const yaw = dir > 0 ? -theta : Math.PI - theta; // face along the circle
  return { x, z, yaw, phase: (i * 0.618034) % 1 };
}
