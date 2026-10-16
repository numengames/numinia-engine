// render: draws what it is given. Knows nothing about the network or the simulation.
// Three.js WebGPURenderer: WebGPU where the browser has it, its own WebGL2 backend elsewhere.
import * as THREE from "three/webgpu";
import { createAR, arSupported } from "./ar.ts";
export { arSupported } from "./ar.ts";
export type { ARState } from "./ar.ts";
import { createVR, vrSupported } from "./vr.ts";
export { vrSupported } from "./vr.ts";
export type { VRState, DialogoVR } from "./vr.ts";
import type { Manos, EventoMano } from "./manos.ts";
export type { EventoMano, Lado } from "./manos.ts";
import { createPower, readCaps, checkCost } from "./power.ts";
export { createPower, readCaps, checkCost } from "./power.ts";
export { limitesGraficos } from "./capacidades.ts"; // N2: max texture size for the capabilities
export type { FrameCost } from "./power.ts";
export { leerAparato, leerBateria, medidorDeCuadros } from "./sesion.ts";
import { createCamara } from "./camara.ts";
export { haciaMundo, TECLAS_CAMARA, CAMARA } from "./camara.ts";
export type { Camara, ModoCamara } from "./camara.ts";
import { crearEditor } from "./gizmo.ts";
import { cargarImagen, cargarVideo, cargarSonido, sePuedeReproducir } from "./medios.ts";
import type { Medio } from "./medios.ts";
export { sePuedeReproducir } from "./medios.ts";
export type { Donde, Eje, Herramienta, Fase, Paso, Editor } from "./gizmo.ts";
import { createAvatares } from "./avatares.ts";
import { sueloBajo } from "./avatares-politica.ts";
export type { CatalogoAvatares } from "./avatares.ts";
import type { CatalogoAvatares } from "./avatares.ts";
import { createNombres } from "./nombres.ts";
export { NOMBRE_VISIBLE_M, NOMBRES_DIBUJADOS, BOCADILLO_VISIBLE_M } from "./nombres.ts";
import { crearCenital } from "./cenital.ts";
export type { Huella, ImagenCenital } from "./cenital.ts";
import { crearEntorno } from "./entorno.ts";
import { vistaElementos } from "./elementos-vista.ts";
import { vistaPesca } from "./pesca-vista.ts";
export type { EntornoDatos } from "./entorno.ts";
export type { Calidad, Nivel } from "./calidad.ts";

export type Backend = "WebGPU" | "WebGL2";
/** Someone to draw. J2 (optional, additive): `y` = height of the feet in metres (0 = on the plaza), `speed` =
 * horizontal speed in m/s (≈4 walking, ≈8 running) for whoever animates avatars. */
export type Placed = { id: number; x: number; z: number; y?: number; speed?: number };
/** H1: a thing in the world (same shape as the feature plug's PlacedObject; render does not import it). Degrees, YXZ.
 * `color` (optional «#rrggbb»): the model painted in that colour (quest things: two blocks that differ). */
export type Thing = { model: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; animate: boolean; color?: string;
  /** U10 (optional): modelo (.glb, the default), imagen / video (a plane), sonido (a sphere: radius = sx); file extension; hidden while playing; volume 0-1. */
  kind?: "modelo" | "imagen" | "video" | "sonido"; ext?: string; hidden?: boolean; volume?: number;
  /** U11 (optional): who hears it (burbuja: inside the bubble; zona, todos: everyone, at the same volume) and a video's bubble radius (m). */
  reach?: "burbuja" | "zona" | "todos"; radius?: number };
/** J10: where a thing you carry goes: a hand in XR («izq»/«der»), or beside you on a flat screen («yo»). */
export type Llevar = "izq" | "der" | "yo";
/** J10: the biggest side of a thing held in a hand (m). */
export const EN_MANO_M = 0.16;
const LOADS_AT_ONCE = 4;   // H1: model files downloading at the same time; the nearest first
const ANIMATE_WITHIN_M = 40; // H1: farther than this, a model's animation stands still (cold phones)

export async function createView(parent: HTMLElement, opts: { forceWebGL?: boolean; arMaxMs?: number; battery?: boolean; maxFps?: number; assetUrl?: (model: string) => string; avatares?: { catalogo?: CatalogoAvatares; yo?: () => number } } = {}) {
  const power = createPower(readCaps(), { battery: opts.battery, maxFps: opts.maxFps });
  // XR on a WebGPU backend needs the session's "webgpu" feature (XRGPUBinding); Quest Browser 152 has neither (measured
  // 16-10 over USB): there a WebGPU page can never enter VR or AR. Devices that can do XR but not XR-on-WebGPU draw
  // with WebGL2 from the start (the backend cannot change later).
  const xrSinGpu = typeof (globalThis as { XRGPUBinding?: unknown }).XRGPUBinding === "undefined" && (await vrSupported() || await arSupported());
  const renderer = new THREE.WebGPURenderer({ antialias: !power.mobile, forceWebGL: !!opts.forceWebGL || xrSinGpu, powerPreference: power.mobile ? "low-power" : "high-performance" });
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
  const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.6);
  scene.add(hemi);
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
  const hitos: THREE.Mesh[] = []; // H4: the environment may hide them (hitos: false)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: palette[i % 4] }));
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    world.add(p); hitos.push(p);
  }
  // J5: what the top-down map draws (cenital.ts): ground and grid as its background, the pillars as landmarks
  ground.userData.mapa = grid.userData.mapa = "suelo";
  for (const o of world.children) if (o !== ground && o !== grid) o.userData.mapa = true;

  const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 12);
  const selfMat = new THREE.MeshStandardMaterial({ color: 0xe07a3f });
  const otherMat = new THREE.MeshStandardMaterial({ color: 0x6d7f99 });
  const selfMesh = new THREE.Mesh(bodyGeo, selfMat);
  selfMesh.visible = false;
  world.add(selfMesh);
  const others = new Map<number, THREE.Mesh>();
  // N1: the camera (mouse, keys, touch, gamepad; play and build modes) — packages/render/src/camara.ts
  const cam = createCamara(camera, renderer.domElement, { enXR: () => renderer.xr.isPresenting });
  const feet = { x: 0, y: 0, z: 0 };

  // J10: your hands in XR (manos.ts, loaded when you enter XR: not in the start bundle). What they may reach are the
  // placed things (never while AR shows the real room). Until it arrives, `manos` keeps the page's rules and listeners.
  // three gives a session's inputs only to controller slots that already exist: make both now (cheap, core three).
  for (const i of [0, 1]) { renderer.xr.getController(i); renderer.xr.getControllerGrip(i); renderer.xr.getHand(i); }
  let manosReal: Manos | null = null, manosCarga: Promise<Manos> | null = null;
  const reglasManos: Parameters<Manos["reglas"]>[0] = {}, oyentesManos = new Set<(e: EventoMano) => void>();
  const cargarManos = () => (manosCarga ??= import("./manos.ts").then(({ createManos }) => {
    const m = createManos({
      renderer,
      *objetos() { if (ar.state !== "off") return; for (const [k, s] of things) yield [k, s.group] as [string, THREE.Object3D]; },
      *etiquetas() { if (ar.state !== "off") return; for (const [k, s] of tags) yield [k, s] as [string, THREE.Object3D]; },
      paneles: () => vr.paneles(),
    });
    m.reglas(reglasManos);
    m.on((e) => { for (const f of oyentesManos) f(e); });
    return (manosReal = m);
  }));
  const manos = {
    cargar: cargarManos,
    montar: (p: THREE.Object3D | null) => manosReal?.montar(p),
    update: (c: THREE.Camera | null) => manosReal?.update(c),
    reglas(o: Parameters<Manos["reglas"]>[0]) { Object.assign(reglasManos, o); manosReal?.reglas(o); },
    on(fn: (e: EventoMano) => void) { oyentesManos.add(fn); return () => oyentesManos.delete(fn); },
    ancla: (l: "izq" | "der") => manosReal?.ancla(l) ?? null,
    andar: () => manosReal?.andar() ?? null,
    vibrar: (l: "izq" | "der", v?: number, ms?: number) => manosReal?.vibrar(l, v, ms),
    estado: () => manosReal?.estado() ?? { izq: null, der: null },
  };
  const ar = createAR({ renderer, scene, world, domOverlayRoot: document.getElementById("hud") ?? undefined, maxMs: opts.arMaxMs, manos,
    maqueta: { // J8b: the live plaza in miniature on your table
      yo: () => selfXZ,
      *otros() { for (const m of others.values()) yield { x: m.position.x, z: m.position.z, y: m.position.y - 0.85 }; },
      hitos: () => hitos,
      *cosas() { for (const [k, s] of things) yield [k, s.want] as [string, { x: number; y: number; z: number }]; },
    } });

  const vr = createVR({ renderer, scene, camera, manos });
  // where XR exists, the hands' code is fetched a few seconds after start, so entering VR/AR does not wait for it
  void Promise.all([vrSupported(), arSupported()]).then(([v, a]) => { if (v || a) setTimeout(() => { void cargarManos().catch(() => {}); }, 3000); });
  const cenital = crearCenital(renderer, scene, world, backend); // J5: the zone from above (big map) and its footprints
  let selfXZ: { x: number; z: number; y?: number } | null = null;
  // J1: you and the nearest players as VRM humanoids (avatares.ts); the capsules above stay as their anchors
  // N1b: the solid boxes in metres (view.solidos): the camera does not go through them, avatars stand on them
  let cajasM: ArrayLike<number> = [], cajasFx: Int32Array | null = null;
  const avs = createAvatares({ world, mobile: power.mobile, xr: () => renderer.xr.isPresenting, catalogo: opts.avatares?.catalogo, yo: opts.avatares?.yo, compilar: (o) => renderer.compileAsync(o, camera, scene),
    suelo: (x, z, y) => sueloBajo(x, z, y, cajasM) });
  // H4 + H12: sky, sun, light, fog, wind and ground come from data (features/entorno), quality from the device tier
  const entorno = crearEntorno({ renderer, scene, world, camera, hemi, sun, ground, grid, hitos, aparato: { mobile: power.mobile, deviceMemoryGB: readCaps().deviceMemoryGB, saveData: readCaps().saveData }, foco: () => selfXZ,
    fichero: (f) => { const i = f.lastIndexOf("."); return (opts.assetUrl ?? ((m: string) => `/a/${m}.glb`))(f.slice(0, i)).replace(/\.glb$/, f.slice(i)); } });
  const elementos = vistaElementos({ renderer, scene, world, camera, entorno }); // H4/H8: water, fire, smoke, dust (lazy)

  // feature decorations (J7): a text label over an avatar and a short bounce; both expire on their own
  type Target = number | "self";
  const labels = new Map<Target, { mesh: THREE.Mesh; until: number }>();
  const bounces = new Map<Target, number>(); // target -> until (ms)
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.4);
  const meshOf = (t: Target): THREE.Mesh | undefined => (t === "self" ? (selfMesh.visible ? selfMesh : undefined) : others.get(t));
  const nombres = createNombres({ world, camera, avatarOf: meshOf }); // J3: names over heads and speech bubbles
  // pesca v1: rods, lines and floats of whoever fishes near (lazy: packages/render/src/pesca.ts). "self" hides in first person, so the rod uses the capsule's place anyway
  const pesca = vistaPesca({ world, posicionDe: (t) => (t === "self" ? selfMesh.position : others.get(t)?.position) ?? null });
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
  // J5: waypoints («Marcar destino» on the map): the same column, kept until dropped; busy() ignores them (cool phones)
  const waypoints = new Map<number, { group: THREE.Group; until: number }>();
  let waypointSeq = 0;
  function updateDecorations(now: number): void {
    for (const w of waypoints.values()) w.group.children[1].quaternion.copy(camera.quaternion);
    for (let i = beacons.length - 1; i >= 0; i--) {
      const b = beacons[i];
      if (now > b.until) { dropBeacon(b); beacons.splice(i, 1); } else b.group.children[1].quaternion.copy(camera.quaternion);
    }
    for (const [t, d] of labels) {
      const m = meshOf(t);
      if (!m || now > d.until) { dropLabel(t); continue; }
      d.mesh.position.set(m.position.x, nombres.above(t, m), m.position.z); // over the name and the bubble, if any (J3)
      d.mesh.quaternion.copy(camera.quaternion); // always faces whoever looks
    }
    nombres.update(now);
  }

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- H1: things placed in the world (features/objetos): a model by its sha256, loaded once per file and cloned,
  // the nearest first, never more than LOADS_AT_ONCE downloads at a time ----
  type Gltf = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  type Slot = { group: THREE.Group; want: Thing; model: string; loaded: boolean; failed: boolean; mixer?: THREE.AnimationMixer; medio?: Medio; color?: string; horneado?: boolean };
  let verOcultos = false; // U10: while building, hidden spheres of sound are drawn
  const fichero = (t: Thing) => `${t.model}.${t.kind && t.kind !== "modelo" ? t.ext ?? "glb" : "glb"}`; // what a slot draws
  /** A thing painted in its `color` (materials cloned once per copy; "" puts the model's own back). */
  function pintar(s: Slot): void {
    const c = s.want.color ?? "";
    if (!s.loaded || s.color === c) return;
    s.color = c;
    s.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const propio = (m.userData.propio ??= m.material) as THREE.Material;
      if (!c) { m.material = propio; return; }
      const nuevo = (Array.isArray(propio) ? propio[0] : propio).clone() as THREE.MeshStandardMaterial;
      if (nuevo.color) nuevo.color.set(c);
      if ("map" in nuevo) nuevo.map = null;
      m.material = nuevo;
    });
  }
  // J10: things you carry: in a hand in XR, beside you on a flat screen; back to their place when let go
  const llevados = new Map<string, Llevar>();
  const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();
  function soltarLlevado(k: string): void {
    const s = things.get(k);
    llevados.delete(k);
    if (!s) return;
    if (s.group.parent !== world) world.add(s.group);
    placeGroup(s);
  }
  function colocarLlevados(): void {
    let i = 0;
    for (const [k, donde] of llevados) {
      const s = things.get(k);
      if (!s) continue;
      const ancla = donde !== "yo" && renderer.xr.isPresenting ? manos.ancla(donde) : null;
      if (ancla) {
        if (s.group.parent !== ancla) {
          ancla.add(s.group);
          s.group.position.set(0, 0, 0); s.group.rotation.set(0, 0, 0); s.group.scale.set(s.want.sx, s.want.sy, s.want.sz);
          s.group.updateMatrixWorld(true);
          tmpBox.setFromObject(s.group); const lado = Math.max(...tmpBox.getSize(tmpV).toArray()) || 1;
          const anclaEscala = ancla.getWorldScale(tmpV).x || 1;
          s.group.scale.multiplyScalar(Math.min(1, EN_MANO_M / lado) / anclaEscala);
          tmpBox.setFromObject(s.group); tmpBox.getCenter(tmpV); s.group.position.copy(ancla.worldToLocal(tmpV)).negate(); // centred in the hand
        }
        continue;
      }
      // flat screen (or that hand is not here): beside your avatar at hand height, one each side
      if (s.group.parent !== world) { world.add(s.group); s.group.rotation.set(0, 0, 0); s.group.scale.set(s.want.sx * 0.6, s.want.sy * 0.6, s.want.sz * 0.6); }
      if (!selfXZ) continue;
      const lado = i++ % 2 === 0 ? 1 : -1, yaw = cam.yaw();
      s.group.position.set(selfXZ.x + Math.cos(yaw) * 0.55 * lado, (selfXZ.y ?? 0) + 0.9, selfXZ.z - Math.sin(yaw) * 0.55 * lado);
    }
  }
  const assetUrl = opts.assetUrl ?? ((m: string) => `/a/${m}.glb`);
  // the glTF loader (~26 kB gz) arrives only when the first thing does: a world without things never downloads it
  type Merge = (gs: THREE.BufferGeometry[]) => THREE.BufferGeometry | null;
  type Tools = { load: (url: string) => Promise<Gltf>; clone: (o: THREE.Object3D) => THREE.Object3D; merge: Merge };
  let tools: Promise<Tools> | null = null;
  const getTools = () => (tools ??= Promise.all([import("three/addons/loaders/GLTFLoader.js"), import("three/addons/utils/SkeletonUtils.js"), import("three/addons/utils/BufferGeometryUtils.js")])
    .then(([g, u, b]) => { const l = new g.GLTFLoader(); return { load: (url: string) => l.loadAsync(url) as unknown as Promise<Gltf>, clone: (o: THREE.Object3D) => u.clone(o as never) as unknown as THREE.Object3D, merge: (gs) => b.mergeGeometries(gs as never) as unknown as THREE.BufferGeometry | null }; }));
  // A model that does not animate (people of the world, quest things) is baked ONCE per file into one mesh per
  // material, in the pose it comes in: the house robot goes from 19 draw calls to 3. Copies share the geometry.
  const horneados = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean }[] | null>();
  function hornear(model: string, raiz: THREE.Object3D, merge: Merge): { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean }[] | null {
    if (horneados.has(model)) return horneados.get(model)!;
    let out: { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean }[] | null = null;
    try {
      raiz.updateMatrixWorld(true);
      const inv = raiz.matrixWorld.clone().invert(), rel = new THREE.Matrix4(), v = new THREE.Vector3();
      const porMat = new Map<THREE.Material, { gs: THREE.BufferGeometry[]; sombra: boolean }>();
      let mal = false;
      raiz.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || mal) return;
        if (Array.isArray(m.material)) { mal = true; return; }
        const src = m.geometry, pos = src.attributes.position;
        if (!pos) return;
        const geo = new THREE.BufferGeometry();
        const p = pos.clone() as THREE.BufferAttribute;
        const sk = m as THREE.SkinnedMesh;
        if (sk.isSkinnedMesh && src.attributes.skinIndex) for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(pos, i); sk.applyBoneTransform(i, v); p.setXYZ(i, v.x, v.y, v.z); }
        geo.setAttribute("position", p);
        if (src.attributes.uv) geo.setAttribute("uv", src.attributes.uv.clone());
        if (src.index) geo.setIndex(src.index.clone());
        geo.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
        const g2 = geo.index ? geo.toNonIndexed() : geo;
        g2.computeVertexNormals();
        const e = porMat.get(m.material) ?? { gs: [], sombra: false };
        e.gs.push(g2); e.sombra ||= m.castShadow; porMat.set(m.material, e);
      });
      if (!mal && porMat.size) {
        out = [];
        for (const [mat, e] of porMat) {
          if (e.gs.some((x) => !!x.attributes.uv) && !e.gs.every((x) => !!x.attributes.uv)) for (const x of e.gs) x.deleteAttribute("uv"); // all or none
          const geo = e.gs.length === 1 ? e.gs[0] : merge(e.gs);
          if (!geo) { out = null; break; }
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          out.push({ geo, mat, sombra: e.sombra });
        }
      }
    } catch (err) { console.warn(`[objetos] no pude hornear ${model}:`, err); out = null; }
    horneados.set(model, out);
    return out;
  }
  const files = new Map<string, Promise<{ g: Gltf; clone: Tools["clone"]; merge: Merge }>>(); // model -> its parsed file, shared by every copy
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
      if (s.want.kind && s.want.kind !== "modelo") { cargarMedio(best, s); continue; }
      let file = files.get(model);
      if (!file) { file = getTools().then(async (t) => ({ g: await t.load(assetUrl(model.replace(/\.glb$/, ""))), clone: t.clone, merge: t.merge })); files.set(model, file); }
      loading++;
      file.then(({ g, clone, merge }) => {
        const now = things.get(best);
        if (!now || now.model !== model || now.loaded) return; // removed or changed while it downloaded
        const quieto = !now.want.animate ? hornear(model, g.scene, merge) : null;
        let copy: THREE.Object3D;
        if (quieto) { copy = new THREE.Group(); for (const q of quieto) { const m = new THREE.Mesh(q.geo, q.mat); m.castShadow = q.sombra; copy.add(m); } }
        else copy = clone(g.scene);
        now.horneado = !!quieto;
        now.group.add(copy);
        if (now.want.animate && g.animations.length) { now.mixer = new THREE.AnimationMixer(copy); now.mixer.clipAction(g.animations[0]).play(); }
        now.loaded = true; now.color = undefined; pintar(now);
        if (llevados.has(best) && now.group.parent !== world) { const d = llevados.get(best)!; soltarLlevado(best); llevados.set(best, d); } // re-fit in the hand
      }).catch((e) => {
        const now = things.get(best);
        if (now && now.model === model) now.failed = true;
        files.delete(model); // a later placement may try again
        console.warn(`[objetos] no se pudo cargar ${assetUrl(model.replace(/\.glb$/, ""))}: ${(e as Error)?.message ?? e}`);
      }).finally(() => { loading--; pumpLoads(); });
    }
  }
  /** U10: an image, a video or a sphere of sound instead of a .glb (medios.ts). */
  function cargarMedio(key: string, s: Slot): void {
    const t = s.want, url = assetUrl(t.model).replace(/\.glb$/, `.${t.ext ?? "glb"}`), model = s.model;
    if ((t.kind === "video" || t.kind === "sonido") && !sePuedeReproducir(t.ext ?? "")) { s.failed = true; console.warn(`[medios] este navegador no reproduce .${t.ext}`); return; }
    const p = t.kind === "imagen" ? cargarImagen(url) : t.kind === "video" ? cargarVideo(url, () => verOcultos) : Promise.resolve(cargarSonido(url, () => verOcultos));
    loading++;
    p.then((m) => {
      const now = things.get(key);
      if (!now || now.model !== model || now.loaded) { m.soltar(); return; }
      now.group.add(m.obj); now.medio = m; now.loaded = true;
    }).catch((e) => {
      const now = things.get(key);
      if (now && now.model === model) now.failed = true;
      console.warn(`[medios] no se pudo cargar ${url}: ${(e as Error)?.message ?? e}`);
    }).finally(() => { loading--; pumpLoads(); });
  }
  let mediosSonando = false;
  function updateThings(dt: number): void {
    animatingNear = false; mediosSonando = false;
    const r2 = ANIMATE_WITHIN_M ** 2;
    const oyente = selfXZ ? { x: selfXZ.x, y: (selfXZ.y ?? 0) + 1.5, z: selfXZ.z } : null;
    for (const s of things.values()) {
      if (s.medio) { s.medio.actualizar(s.group, oyente, { hidden: !!s.want.hidden, volume: s.want.volume ?? 1, reach: s.want.reach ?? "burbuja", radius: s.want.radius ?? 8 }); if (s.want.kind === "video" && s.medio.sonando()) mediosSonando = true; }
      if (!s.mixer) continue;
      if (distance2(s) <= r2) { s.mixer.update(dt); animatingNear = true; }
    }
  }
  // M22: the builder's hands (pick, the point under the pointer, the selection's outline, the lazy gizmo): gizmo.ts.
  // While a thing is held its server echoes only update `want` (editor.retiene), so it never jumps back mid-drag.
  const editor = crearEditor({
    scene, camera, canvas: renderer.domElement,
    *grupos() { for (const [k, s] of things) yield [k, s.group] as [string, THREE.Object3D]; },
    grupo: (k) => things.get(k)?.group,
    reponer: (k) => { const s = things.get(k); if (s) placeGroup(s); },
  });

  // ---- J5: names that stay over things (people of the world). Sprites: they face the camera by themselves, so
  // nothing runs per frame; the fog fades the far ones. pickThing tells which thing (or name) is under a screen point.
  const tags = new Map<string, THREE.Sprite>();
  function dropTag(key: string): void {
    const s = tags.get(key);
    if (!s) return;
    world.remove(s); s.material.map?.dispose(); s.material.dispose(); tags.delete(key);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

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
    /** H4 + H12: the environment (aplicar, estado, calidad, capacidades) — packages/render/src/entorno.ts. */
    entorno,
    /** H4/H8: water, fire, smoke and dust (poner, contar) — packages/render/src/elementos.ts, loaded with the first one. */
    elementos,
    /** pesca v1: fishing spots, floats and my own phase (sitios, flotadores, estado, contar) — packages/render/src/pesca.ts, loaded with the first spot. */
    pesca,
    /** Place everyone for this frame (J2: at their height). */
    sync(self: { x: number; z: number; y?: number; speed?: number } | null, list: Placed[]): void {
      selfXZ = self;
      if (self) { selfMesh.visible = true; selfMesh.position.set(self.x, (self.y ?? 0) + 0.85, self.z); }
      const seen = new Set<number>();
      for (const o of list) {
        seen.add(o.id);
        let m = others.get(o.id);
        if (!m) { m = new THREE.Mesh(bodyGeo, otherMat); world.add(m); others.set(o.id, m); }
        m.position.set(o.x, (o.y ?? 0) + 0.85, o.z);
      }
      for (const [id, m] of others) if (!seen.has(id)) { world.remove(m); others.delete(id); }
      const now = performance.now();
      for (const [t, until] of bounces) {
        const m = meshOf(t);
        if (!m || now > until) bounces.delete(t);
        else m.position.y += Math.abs(Math.sin(now / 90)) * 0.35;
      }
      // J1: VRMs follow the capsules (hops and jumps included); yours hides in first person (camera branch: view.cam)
      avs.sync(self ? selfMesh : null, others, !!(this as unknown as { cam?: { primeraPersona?: () => boolean } }).cam?.primeraPersona?.(), now);
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
    beaconCount(): number { return beacons.length + waypoints.size; },
    /** H9: the point of the ground (y = 0) under a point of the screen (CSS pixels, like a drop's clientX/Y), or null
     * when that ray never meets the ground (the sky) or meets it too far away. */
    sueloBajo(clientX: number, clientY: number): { x: number; z: number } | null {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return p && p.distanceTo(camera.position) <= 150 ? { x: p.x, z: p.z } : null;
    },
    /** J5: a name that stays over a thing (`key` as in place), or `null` to take it away. */
    tag(key: string, t: { text: string; x: number; y: number; z: number } | null): void {
      dropTag(key);
      if (!t) return;
      const c = document.createElement("canvas"); c.width = 512; c.height = 96;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(20,30,40,0.78)"; g.fillRect(0, 0, 512, 96);
      g.fillStyle = "#ffffff"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(t.text.slice(0, 26), 256, 50);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      s.name = `nombre:${key}`; s.scale.set(2.9, 0.54, 1); s.position.set(t.x, t.y, t.z); s.renderOrder = 10;
      world.add(s); tags.set(key, s);
    },
    /** J5: names over things alive right now (for checks). */
    tagCount(): number { return tags.size; },
    /** J4: the key of the placed thing (or of the thing whose name it is) under a screen point, nearest first; null if none. */
    pickThing(clientX: number, clientY: number): string | null {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects([...[...things.values()].map((s) => s.group), ...tags.values()], true)) {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.name.startsWith("objeto:")) return o.name.slice(7);
          if (o.name.startsWith("nombre:")) return o.name.slice(7);
        }
      }
      return null;
    },
    /** J5: a waypoint: a beacon that stays until `dropWaypoint(id)` and never keeps the page drawing. Returns its id. */
    waypoint(x: number, z: number, text: string): number { this.beacon(x, z, text, Infinity); waypoints.set(++waypointSeq, beacons.pop()!); return waypointSeq; },
    dropWaypoint(id: number): void { const w = waypoints.get(id); if (w) { dropBeacon(w); waypoints.delete(id); } },
    /** J5: the zone seen from above (the big map's picture), the footprints of what stands in it (the minimap's
     * landmarks) and a number that changes when they do. Cost and the two ways (gpu, huellas): cenital.ts. */
    cenital: (o?: { px?: number; incluir?: { x: number; z: number }; modo?: "gpu" | "huellas" }) => cenital.generar(o),
    huellas: () => cenital.huellas(),
    cenitalVersion: () => cenital.version(),
    /** H1: put a thing in the world, move it, change its model, or take it away (`null`). */
    place(key: string, t: Thing | null): void {
      const s = things.get(key);
      if (!t) { if (s) { s.mixer?.stopAllAction(); s.medio?.soltar(); s.group.parent?.remove(s.group); things.delete(key); waiting.delete(key); llevados.delete(key); } return; }
      if (!s) {
        const group = new THREE.Group(); group.name = `objeto:${key}`; world.add(group);
        const ns: Slot = { group, want: t, model: fichero(t), loaded: false, failed: false };
        things.set(key, ns); placeGroup(ns); waiting.add(key); pumpLoads(); return;
      }
      s.want = t; if (!editor.retiene(key, t) && !llevados.has(key)) placeGroup(s);
      pintar(s);
      if (s.model !== fichero(t) || (s.horneado && t.animate)) { s.mixer?.stopAllAction(); s.mixer = undefined; s.medio?.soltar(); s.medio = undefined; s.group.clear(); s.model = fichero(t); s.loaded = false; s.failed = false; waiting.add(key); pumpLoads(); } // a baked copy cannot move: load it whole
      else if (!t.animate && s.mixer) { s.mixer.stopAllAction(); s.mixer = undefined; }
    },
    /** H1: things placed, how many have their model drawn, and how many failed to load (for checks). `~` keys = the page's previews, not counted. */
    objects(): { placed: number; loaded: number; failed: number } {
      let placed = 0, loaded = 0, failed = 0;
      for (const [k, s] of things) { if (k.startsWith("~")) continue; placed++; if (s.loaded) loaded++; if (s.failed) failed++; }
      return { placed, loaded, failed };
    },
    /** J10: carry a placed thing (`key` as in place): in a hand in XR, beside you on a flat screen; `null` puts it back. */
    llevar(key: string, donde: Llevar | null): void {
      if (!donde) { if (llevados.has(key)) soltarLlevado(key); return; }
      if (llevados.get(key) === donde) return;
      if (llevados.has(key)) soltarLlevado(key);
      llevados.set(key, donde);
    },
    /** J10: what you carry and where (for checks). */
    llevando(): Record<string, Llevar> { return Object.fromEntries(llevados); },
    /** J10: your hands in XR (manos.ts): rules, events, state. */
    manos,
    /** M22: the builder's hands (packages/render/src/gizmo.ts): select, the point under the pointer, gizmo, hold. */
    editor,
    /** M22: the key of the placed thing under a screen point (client px), or null. */
    pick: editor.pick,
    /** M22: the point under a screen point on the ground (y = 0) or on other things (not `ignorar`), or null. */
    puntoBajo: editor.puntoBajo,
    /** Who has a label right now (for checks). */
    labels(): Target[] { return [...labels.keys()]; },
    /** J1: VRM avatars (for checks): files loaded, clips, who wears which avatar and which clip plays. */
    avatares(): ReturnType<typeof avs.stats> { return avs.stats(); },
    /** J3: the name over an avatar (`null` takes it away); drawn for the nearest 32 within 24 m, never over yourself. */
    nameTag(t: Target, text: string | null): void { nombres.nameTag(t, text); },
    /** J3: a speech bubble over an avatar for `ms` (wrapped, up to 6 lines); the latest replaces the one before. */
    bubble(t: Target, text: string, ms: number): void { nombres.bubble(t, text, ms); },
    /** J3: where names, bubbles and labels sit — world y of the top of the drawn avatar. Default: the capsule's top
     * (centre y + 0.85); VRM avatars (J1) pass their head bone's height. */
    setHeadTop(fn: (t: Target, avatar: THREE.Object3D) => number): void { nombres.setTop(fn); },
    /** J3: names and bubbles the page holds, and whether each is drawn now (for checks). */
    nameTags() { return nombres.nameTags(); },
    bubbles() { return nombres.bubbles(); },
    /** True while a label, a bounce or a near animation is alive: the power policy must keep drawing. */
    /** U10: draw hidden spheres of sound (while building) or not (while playing). */
    verOcultos(si: boolean): void { verOcultos = si; },
    busy(): boolean { return mediosSonando || labels.size > 0 || bounces.size > 0 || beacons.length > 0 || animatingNear || loading > 0 || cam.ocupada() || editor.activo() || avs.busy() || nombres.busy() || entorno.ocupado() || elementos.ocupado() || pesca.ocupado(); },
    /** Apply the power policy's current pixel ratio (call after `power.reportCost` returns true or battery changes). */
    applyPixelRatio(): void { renderer.setPixelRatio(power.pixelRatio()); renderer.setSize(innerWidth, innerHeight); },
    /** What the last draw cost: draw calls and triangles (three's own counters; no screen needed). */
    lastFrame(): { calls: number; triangles: number } {
      const r = (renderer as unknown as { info: { render: { drawCalls: number; triangles: number } } }).info.render;
      return { calls: r.drawCalls, triangles: r.triangles };
    },
    /** N1: the camera — orbit, zoom, first person, build mode. See camara.ts. */
    cam,
    /** N1b: the world's solid boxes as the simulation holds them (Q16.16, `session.solidos()`): the camera does not go
     * through them and an avatar on a stair or a roof walks instead of «jumping». Cheap every frame (converted on change). */
    solidos(fx: Int32Array | null | undefined): void {
      if (!fx || fx === cajasFx) return;
      cajasFx = fx;
      const m = new Float32Array(fx.length);
      for (let i = 0; i < fx.length; i++) m[i] = fx[i] / 65536;
      cajasM = m;
      cam.paredes(fx);
    },
    /** Move the camera (N1), then draw. */
    draw(dtSeconds: number): void {
      updateDecorations(performance.now());
      updateThings(dtSeconds);
      selfMat.visible = renderer.xr.isPresenting || !cam.primeraPersona(); // N1: in first person your body is not drawn
      editor.frame();
      entorno.actualizar(); elementos.actualizar(dtSeconds); pesca.actualizar(dtSeconds);
      if (renderer.xr.isPresenting) { ar.update(dtSeconds); vr.update(selfXZ, dtSeconds); colocarLlevados(); renderer.render(scene, camera); return; }
      if (selfXZ) { feet.x = selfXZ.x; feet.y = selfXZ.y ?? 0; feet.z = selfXZ.z; } // N1b: the height too (jumps, floors)
      cam.update(dtSeconds, selfXZ ? feet : null);
      colocarLlevados();
      renderer.render(scene, camera);
    },
    loop(fn: (timeMs: number) => void): void { renderer.setAnimationLoop(fn); },
    get drawn(): number { return others.size + (selfMesh.visible ? 1 : 0); },
  };
}
