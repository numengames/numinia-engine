// render: draws what it is given. Knows nothing about the network or the simulation.
// Three.js WebGPURenderer: WebGPU where the browser has it, its own WebGL2 backend elsewhere.
import * as THREE from "three/webgpu";
import { createAR, arSupported } from "./ar.ts";
export { arSupported } from "./ar.ts";
export type { ARState } from "./ar.ts";
import { createVR, vrSupported } from "./vr.ts";
export { vrSupported } from "./vr.ts";
export type { VRState } from "./vr.ts";
import { createPower, readCaps, checkCost } from "./power.ts";
export { createPower, readCaps, checkCost } from "./power.ts";
export { limitesGraficos } from "./capacidades.ts"; // N2: max texture size for the capabilities
export type { FrameCost } from "./power.ts";
export { leerAparato, leerBateria, medidorDeCuadros } from "./sesion.ts";

export type Backend = "WebGPU" | "WebGL2";
export type Placed = { id: number; x: number; z: number };
/** H1: a thing in the world (same shape as the feature plug's PlacedObject; render does not import it). Degrees, YXZ. */
export type Thing = { model: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; animate: boolean };
const LOADS_AT_ONCE = 4;   // H1: model files downloading at the same time; the nearest first
const ANIMATE_WITHIN_M = 40; // H1: farther than this, a model's animation stands still (cold phones)

export async function createView(parent: HTMLElement, opts: { forceWebGL?: boolean; arMaxMs?: number; battery?: boolean; maxFps?: number; assetUrl?: (model: string) => string } = {}) {
  const power = createPower(readCaps(), { battery: opts.battery, maxFps: opts.maxFps });
  const renderer = new THREE.WebGPURenderer({ antialias: !power.mobile, forceWebGL: !!opts.forceWebGL, powerPreference: power.mobile ? "low-power" : "high-performance" });
  await renderer.init();
  const backend: Backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
  renderer.setPixelRatio(power.pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  scene.fog = new THREE.Fog(0xc9d8e4, 40, 140);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 7, 10);

  const world = new THREE.Group(); // the normal world; hidden while AR shows the real one
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0xa7b89c }));
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);
  const grid = new THREE.GridHelper(200, 100, 0x6f7f68, 0x8d9c86);
  grid.position.y = 0.01;
  world.add(grid);

  // landmarks so movement is visible: fixed positions, no randomness
  const pillarGeo = new THREE.BoxGeometry(1, 3, 1);
  const palette = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: palette[i % 4] }));
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    world.add(p);
  }

  const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 12);
  const selfMat = new THREE.MeshStandardMaterial({ color: 0xe07a3f });
  const otherMat = new THREE.MeshStandardMaterial({ color: 0x6d7f99 });
  const selfMesh = new THREE.Mesh(bodyGeo, selfMat);
  selfMesh.visible = false;
  world.add(selfMesh);
  const others = new Map<number, THREE.Mesh>();
  const target = new THREE.Vector3();
  const wanted = new THREE.Vector3();

  const ar = createAR({ renderer, scene, world, domOverlayRoot: document.getElementById("hud") ?? undefined, maxMs: opts.arMaxMs });

  const vr = createVR({ renderer, scene, camera });
  let selfXZ: { x: number; z: number } | null = null;

  // feature decorations (J7): a text label over an avatar and a short bounce; both expire on their own
  type Target = number | "self";
  const labels = new Map<Target, { mesh: THREE.Mesh; until: number }>();
  const bounces = new Map<Target, number>(); // target -> until (ms)
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.4);
  const meshOf = (t: Target): THREE.Mesh | undefined => (t === "self" ? (selfMesh.visible ? selfMesh : undefined) : others.get(t));
  function dropLabel(t: Target): void {
    const d = labels.get(t);
    if (!d) return;
    world.remove(d.mesh);
    const mat = d.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose(); mat.dispose();
    labels.delete(t);
  }
  // beacons (R1): a column of light with a text at a world point; expires on its own
  const beacons: { group: THREE.Group; until: number }[] = [];
  const beaconGeo = new THREE.CylinderGeometry(0.6, 0.6, 40, 16, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  function dropBeacon(b: { group: THREE.Group }): void {
    world.remove(b.group);
    for (const ch of b.group.children) { const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial; if (m !== beaconMat) { m.map?.dispose(); m.dispose(); } }
  }
  function updateDecorations(now: number): void {
    for (let i = beacons.length - 1; i >= 0; i--) {
      const b = beacons[i];
      if (now > b.until) { dropBeacon(b); beacons.splice(i, 1); } else b.group.children[1].quaternion.copy(camera.quaternion);
    }
    for (const [t, d] of labels) {
      const m = meshOf(t);
      if (!m || now > d.until) { dropLabel(t); continue; }
      d.mesh.position.set(m.position.x, m.position.y + 1.25, m.position.z);
      d.mesh.quaternion.copy(camera.quaternion); // always faces whoever looks
    }
  }

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- H1: things placed in the world (features/objetos): a model by its sha256, loaded once per file and cloned,
  // the nearest first, never more than LOADS_AT_ONCE downloads at a time ----
  type Gltf = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  type Slot = { group: THREE.Group; want: Thing; model: string; loaded: boolean; failed: boolean; mixer?: THREE.AnimationMixer };
  const assetUrl = opts.assetUrl ?? ((m: string) => `/a/${m}.glb`);
  // the glTF loader (~26 kB gz) arrives only when the first thing does: a world without things never downloads it
  type Tools = { load: (url: string) => Promise<Gltf>; clone: (o: THREE.Object3D) => THREE.Object3D };
  let tools: Promise<Tools> | null = null;
  const getTools = () => (tools ??= Promise.all([import("three/addons/loaders/GLTFLoader.js"), import("three/addons/utils/SkeletonUtils.js")])
    .then(([g, u]) => { const l = new g.GLTFLoader(); return { load: (url: string) => l.loadAsync(url) as unknown as Promise<Gltf>, clone: (o: THREE.Object3D) => u.clone(o as never) as unknown as THREE.Object3D }; }));
  const files = new Map<string, Promise<{ g: Gltf; clone: Tools["clone"] }>>(); // model -> its parsed file, shared by every copy
  const things = new Map<string, Slot>();
  const waiting = new Set<string>();
  let loading = 0, animatingNear = false;
  const RAD = Math.PI / 180;
  const distance2 = (s: Slot) => (selfXZ ? (s.want.x - selfXZ.x) ** 2 + (s.want.z - selfXZ.z) ** 2 : 0);
  function placeGroup(s: Slot): void {
    const w = s.want;
    s.group.position.set(w.x, w.y, w.z);
    s.group.rotation.set(w.rx * RAD, w.ry * RAD, w.rz * RAD, "YXZ");
    s.group.scale.set(w.sx, w.sy, w.sz);
  }
  function pumpLoads(): void {
    while (loading < LOADS_AT_ONCE && waiting.size) {
      let best = "", bestD = Infinity;
      for (const k of waiting) { const s = things.get(k); const d = s ? distance2(s) : Infinity; if (d < bestD) { bestD = d; best = k; } }
      waiting.delete(best);
      const s = things.get(best);
      if (!s) continue;
      const model = s.model;
      let file = files.get(model);
      if (!file) { file = getTools().then(async (t) => ({ g: await t.load(assetUrl(model)), clone: t.clone })); files.set(model, file); }
      loading++;
      file.then(({ g, clone }) => {
        const now = things.get(best);
        if (!now || now.model !== model || now.loaded) return; // removed or changed while it downloaded
        const copy = clone(g.scene);
        now.group.add(copy);
        if (now.want.animate && g.animations.length) { now.mixer = new THREE.AnimationMixer(copy); now.mixer.clipAction(g.animations[0]).play(); }
        now.loaded = true;
      }).catch((e) => {
        const now = things.get(best);
        if (now && now.model === model) now.failed = true;
        files.delete(model); // a later placement may try again
        console.warn(`[objetos] no se pudo cargar ${assetUrl(model)}: ${(e as Error)?.message ?? e}`);
      }).finally(() => { loading--; pumpLoads(); });
    }
  }
  function updateThings(dt: number): void {
    animatingNear = false;
    const r2 = ANIMATE_WITHIN_M ** 2;
    for (const s of things.values()) {
      if (!s.mixer) continue;
      if (distance2(s) <= r2) { s.mixer.update(dt); animatingNear = true; }
    }
  }

  return {
    backend,
    power,
    renderer,
    /** T1: the graphics chip as the browser names it ("" when it hides it). */
    async gpu(): Promise<string> {
      try {
        const b = renderer.backend as unknown as { device?: { adapterInfo?: Record<string, string> }; gl?: WebGL2RenderingContext };
        if (backend === "WebGPU") {
          const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: Record<string, string> } | null> } };
          const info = b.device?.adapterInfo ?? (await nav.gpu?.requestAdapter())?.info;
          return info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(" ").slice(0, 120) : "";
        }
        const gl = b.gl;
        if (!gl) return "";
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "").slice(0, 120);
      } catch { return ""; }
    },
    /** T1: refresh rate of the XR session (Hz); 0 outside XR or when the browser does not say. */
    xrHz(): number {
      const s = renderer.xr.getSession() as unknown as { frameRate?: number } | null;
      return renderer.xr.isPresenting && s?.frameRate ? s.frameRate : 0;
    },
    ar,
    arSupported,
    vr,
    vrSupported,
    /** Place everyone for this frame. */
    sync(self: { x: number; z: number } | null, list: Placed[]): void {
      selfXZ = self;
      if (self) { selfMesh.visible = true; selfMesh.position.set(self.x, 0.85, self.z); }
      const seen = new Set<number>();
      for (const o of list) {
        seen.add(o.id);
        let m = others.get(o.id);
        if (!m) { m = new THREE.Mesh(bodyGeo, otherMat); world.add(m); others.set(o.id, m); }
        m.position.set(o.x, 0.85, o.z);
      }
      for (const [id, m] of others) if (!seen.has(id)) { world.remove(m); others.delete(id); }
      const now = performance.now();
      for (const [t, until] of bounces) {
        const m = meshOf(t);
        if (!m || now > until) bounces.delete(t);
        else m.position.y += Math.abs(Math.sin(now / 90)) * 0.35;
      }
    },
    /** A short text over an avatar (`"self"` = your own) for `ms` milliseconds. Replaces the previous one. */
    label(t: Target, text: string, ms: number): void {
      dropLabel(t);
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(20,30,40,0.85)"; g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#ffd27a"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text.slice(0, 18), 128, 34);
      const mesh = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      mesh.renderOrder = 10;
      world.add(mesh);
      labels.set(t, { mesh, until: performance.now() + ms });
    },
    /** Make an avatar hop for `ms` milliseconds. */
    bounce(t: Target, ms: number): void { bounces.set(t, performance.now() + ms); },
    /** A column of light with a text at a world point for `ms` milliseconds. */
    beacon(x: number, z: number, text: string, ms: number): void {
      const group = new THREE.Group();
      const col = new THREE.Mesh(beaconGeo, beaconMat); col.position.y = 20;
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(20,30,40,0.85)"; g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#ffd27a"; g.font = "bold 26px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text.slice(0, 22), 128, 34);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      tag.position.y = 3; tag.renderOrder = 10;
      group.add(col, tag); group.position.set(x, 0, z);
      world.add(group);
      beacons.push({ group, until: performance.now() + ms });
    },
    /** Beacons alive right now (for checks). */
    beaconCount(): number { return beacons.length; },
    /** H1: put a thing in the world, move it, change its model, or take it away (`null`). */
    place(key: string, t: Thing | null): void {
      const s = things.get(key);
      if (!t) { if (s) { s.mixer?.stopAllAction(); world.remove(s.group); things.delete(key); waiting.delete(key); } return; }
      if (!s) {
        const group = new THREE.Group(); group.name = `objeto:${key}`; world.add(group);
        const ns: Slot = { group, want: t, model: t.model, loaded: false, failed: false };
        things.set(key, ns); placeGroup(ns); waiting.add(key); pumpLoads(); return;
      }
      s.want = t; placeGroup(s);
      if (s.model !== t.model) { s.mixer?.stopAllAction(); s.mixer = undefined; s.group.clear(); s.model = t.model; s.loaded = false; s.failed = false; waiting.add(key); pumpLoads(); }
      else if (!t.animate && s.mixer) { s.mixer.stopAllAction(); s.mixer = undefined; }
    },
    /** H1: things placed, how many have their model drawn, and how many failed to load (for checks). */
    objects(): { placed: number; loaded: number; failed: number } {
      let loaded = 0, failed = 0;
      for (const s of things.values()) { if (s.loaded) loaded++; if (s.failed) failed++; }
      return { placed: things.size, loaded, failed };
    },
    /** Who has a label right now (for checks). */
    labels(): Target[] { return [...labels.keys()]; },
    /** True while a label, a bounce or a near animation is alive: the power policy must keep drawing. */
    busy(): boolean { return labels.size > 0 || bounces.size > 0 || beacons.length > 0 || animatingNear || loading > 0; },
    /** Apply the power policy's current pixel ratio (call after `power.reportCost` returns true or battery changes). */
    applyPixelRatio(): void { renderer.setPixelRatio(power.pixelRatio()); renderer.setSize(innerWidth, innerHeight); },
    /** What the last draw cost: draw calls and triangles (three's own counters; no screen needed). */
    lastFrame(): { calls: number; triangles: number } {
      const r = (renderer as unknown as { info: { render: { drawCalls: number; triangles: number } } }).info.render;
      return { calls: r.drawCalls, triangles: r.triangles };
    },
    /** Follow camera, then draw. */
    draw(dtSeconds: number): void {
      updateDecorations(performance.now());
      updateThings(dtSeconds);
      if (renderer.xr.isPresenting) { ar.update(); vr.update(selfXZ, dtSeconds); renderer.render(scene, camera); return; }
      target.copy(selfMesh.position);
      wanted.set(target.x, target.y + 6, target.z + 9);
      camera.position.lerp(wanted, 1 - Math.exp(-dtSeconds * 8));
      camera.lookAt(target.x, target.y + 0.8, target.z);
      renderer.render(scene, camera);
    },
    loop(fn: (timeMs: number) => void): void { renderer.setAnimationLoop(fn); },
    get drawn(): number { return others.size + (selfMesh.visible ? 1 : 0); },
  };
}
