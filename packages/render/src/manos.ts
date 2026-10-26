// Hands in XR (VR and AR): what you see of yourself and how you reach for things. Two kinds of input, per slot:
//   · a controller (Quest Touch, Pico): a drawn hand holding a small controller; its fingers follow the buttons
//     (index = trigger, the other three = grip, thumb = touching A/B/X/Y or the stick), and a ray from its tip;
//   · a tracked hand (hand-tracking): its 25 joints as spheres joined by bones, and a ray; pinching = trigger.
// Reaching: near a thing that can be taken (the page says which), a halo shows it and the controller buzzes once;
// grip (or trigger, or a pinch) there = «agarrar». Far away, the ray points: trigger on a panel row, a thing or a
// person = «panel» / «apuntar»; on nothing = «gatillo» (the page uses what is in reach). render only reports: the
// page asks the server, which decides. No files are downloaded (no controller profiles from a CDN): primitives only.
import * as THREE from "three/webgpu";
import { crearSaltoManos } from "./salto-manos.ts"; // t_8d0bc2dd: both wrists flicked up = jump

export type Lado = "izq" | "der";
export type Panel = { malla: THREE.Mesh; fila(uv: THREE.Vector2): number; encima(n: number): void;
  /** A panel that acts by itself (the «Salir de VR» button): pressing on it calls this instead of telling the page. */
  pulsar?(n: number): void };
export type ManosHooks = {
  renderer: THREE.WebGPURenderer;
  /** Things that can be reached or pointed at: key + its group (render's placed things). */
  objetos: () => Iterable<[string, THREE.Object3D]>;
  /** Names over people (sprites) that can be pointed at: key + sprite. */
  etiquetas?: () => Iterable<[string, THREE.Object3D]>;
  /** Interactive 3D panels (dialogue rows), tested before anything else. */
  paneles?: () => Panel[];
  /** Says a short sentence to the wearer (the VR note): why a handover was refused. */
  nota?: (texto: string) => void;
};
/** A thing carried in one hand that can go to the other (the fishing rod, a quest item, a dart...). Every held thing
 * registers one with `llevable()`; the hands layer owns the gesture and the button, the piece owns its own state. */
export type Llevable = {
  /** What it is, in words for the wearer, with its article («la caña»). */
  que: string;
  /** The hand that holds it now, or null when it is not in a hand. */
  lado(): Lado | null;
  /** true when it may go now; else the reason (a sentence). Fishing: not during the bite or the fight. */
  puede(): true | string;
  /** Move it to that hand, keeping its state. The hands layer has checked both hands and buzzes them. */
  pasar(a: Lado): void;
  /** Optional world point of its grip, when it is not at the holding hand. */
  punto?(): { x: number; y: number; z: number } | null;
  /** The name under which the piece marks its own hand busy with `ocupar` (or `reglas`'s «reglas»): that busyness is not a refusal. */
  ocupante?: string;
};
export type ResCambio = { ok: true; que: string; a: Lado } | { ok: false; why: string };
export type EventoMano =
  | { tipo: "agarrar"; key: string; lado: Lado }
  | { tipo: "apuntar"; key: string; lado: Lado }
  | { tipo: "panel"; fila: number; lado: Lado }
  | { tipo: "gatillo"; lado: Lado }
  /** J4 mantener-pulsado: the trigger let go (cancels a hold started by "gatillo" if it was not done yet). */
  | { tipo: "gatillo_fin"; lado: Lado };

/** How far from a thing's surface a hand still takes it (m). */
export const ALCANCE_M = 0.22;
/** The free hand this near the holding hand (or the thing's grip point), with its grip or pinch pressed, takes the thing (m). */
export const CERCA_CAMBIO_M = 0.15;
/** The ray stops here (m). */
export const RAYO_M = 12;
const PIEL = 0xe3b896, MANDO = 0x2b2f36;

const JUNTAS = ["wrist",
  "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
  "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip",
  "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip",
  "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip",
  "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"] as const;
/** Bones: each joint to the next along its finger, and every metacarpal to the wrist. */
const HUESOS: [number, number][] = [];
for (const base of [1, 5, 10, 15, 20]) {
  HUESOS.push([0, base]);
  const n = base === 1 ? 4 : 5;
  for (let k = 0; k < n - 1; k++) HUESOS.push([base + k, base + k + 1]);
}

type Fuente = { handedness: string; hand?: unknown; targetRayMode?: string; gamepad?: { buttons: { value: number; pressed: boolean; touched: boolean }[]; hapticActuators?: { pulse?(v: number, ms: number): unknown }[] } };
type Ranura = {
  i: number; fuente: Fuente | null; lado: Lado | null; esMano: boolean;
  ctrl: THREE.Group; grip: THREE.Group; hand: THREE.Group & { joints?: Record<string, THREE.Object3D & { jointRadius?: number }> };
  rayo: THREE.Mesh; punto: THREE.Mesh; manoMando: ReturnType<typeof crearManoMando>; esqueleto: ReturnType<typeof crearEsqueleto>;
  ancla: THREE.Object3D; halo: THREE.Mesh; candidato: string | null; apuntado: { tipo: "panel" | "cosa"; key: string; fila: number; panel?: Panel } | null;
  /** A tracked hand pinching in empty air since this time (ms), or 0: held past ANDAR_MS it walks. */
  pellizcoAire: number;
  /** A tracked hand pinching right now (select held), for features that read the pinch as a held button. */
  pellizco: boolean;
};
/** A pinch held this long in empty air (nothing to take, nothing pointed) walks where that hand points. */
export const ANDAR_MS = 250;

/** Pieces into one geometry (position + normal), each with its own transform: one draw call for all of them. */
function juntar(piezas: [THREE.BufferGeometry, THREE.Matrix4][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const [geo, m] of piezas) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const en = (x: number, y: number, z: number, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));

/** A drawn hand holding a small controller, in grip space, in 3 draw calls (controller, palm, the ten finger bones as
 * one instanced mesh). Fingers bend with `dedos(indice, resto, pulgar)` (0..1). */
function crearManoMando(mat: THREE.Material, matMando: THREE.Material) {
  const g = new THREE.Group();
  // the controller: a handle along the grip's -Z axis tilted down, a ring over the hand, the face with the buttons
  g.add(new THREE.Mesh(juntar([
    [new THREE.CylinderGeometry(0.017, 0.02, 0.11, 10), en(0, -0.01, 0.02, Math.PI / 2 - 0.35)],
    [new THREE.TorusGeometry(0.038, 0.006, 6, 18), en(0, 0.03, -0.045, 0.5)],
    [new THREE.CylinderGeometry(0.024, 0.024, 0.012, 14), en(0, 0.035, -0.02, 0.35)],
  ]), matMando));
  // the hand: the back of the palm outside (+X for a right hand; the left one is mirrored by the caller)
  const palma = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.08), mat);
  palma.position.set(0.035, 0, 0.015); palma.rotation.x = -0.35;
  g.add(palma);
  // finger bones: invisible joints that bend; their segments are drawn by one instanced mesh
  const seg = new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.024);
  const huesos = new THREE.InstancedMesh(seg, mat, 10);
  huesos.frustumCulled = false;
  huesos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  g.add(huesos);
  const segmentos: THREE.Object3D[] = [];
  type Dedo = { base: THREE.Group; medio: THREE.Group };
  const dedo = (x: number, y: number, z: number, largo = 1): Dedo => {
    const base = new THREE.Group(); base.position.set(x, y, z);
    const a = new THREE.Object3D(); a.scale.setScalar(largo); base.add(a);
    const medio = new THREE.Group(); medio.position.set(0, 0, -0.045 * largo); base.add(medio);
    const b = new THREE.Object3D(); medio.add(b);
    g.add(base); segmentos.push(a, b);
    return { base, medio };
  };
  // index (trigger) high and in front; middle, ring and little finger wrap the handle (grip)
  const indice = dedo(0.03, 0.022, -0.035);
  const resto = [dedo(0.03, -0.004, -0.03), dedo(0.03, -0.026, -0.022, 0.92), dedo(0.028, -0.046, -0.012, 0.8)];
  const pulgar = dedo(0.0, 0.04, 0.01, 0.9);
  const doblar = (d: Dedo, v: number) => { d.base.rotation.y = 0.15 + v * 1.25; d.medio.rotation.y = 0.2 + v * 1.35; }; // towards -X: across the handle
  const M = new THREE.Matrix4(), inv = new THREE.Matrix4();
  let antes = "";
  function dedos(i: number, r: number, p: number): void {
    const firma = `${i.toFixed(2)} ${r.toFixed(2)} ${p}`;
    if (firma === antes) return; // nothing moved: no upload
    antes = firma;
    doblar(indice, i);
    for (const d of resto) doblar(d, 0.35 + r * 0.65);
    pulgar.base.rotation.x = -0.6 - p * 0.5; pulgar.base.rotation.y = -0.3 - p * 0.35; pulgar.medio.rotation.x = -0.25 - p * 0.4;
    g.updateMatrixWorld(true);
    inv.copy(g.matrixWorld).invert();
    segmentos.forEach((s, k) => huesos.setMatrixAt(k, M.multiplyMatrices(inv, s.matrixWorld)));
    huesos.instanceMatrix.needsUpdate = true;
  }
  dedos(0, 0, 0);
  return { grupo: g, dedos };
}

/** A tracked hand: one instanced sphere per joint and one instanced bone between joints (two draw calls). */
function crearEsqueleto(mat: THREE.Material) {
  const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, JUNTAS.length);
  const huesos = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), mat, HUESOS.length);
  for (const m of [bolas, huesos]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), D = new THREE.Vector3(), C = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const pos: THREE.Vector3[] = JUNTAS.map(() => new THREE.Vector3()), rad: number[] = JUNTAS.map(() => 0.008);
  let vistas = 0;
  /** Reads the joints (hand space = the parent's space); returns how many were tracked. */
  function actualizar(joints: Record<string, THREE.Object3D & { jointRadius?: number }> | undefined): number {
    vistas = 0;
    if (!joints) { bolas.count = huesos.count = 0; return 0; }
    const ok: boolean[] = [];
    JUNTAS.forEach((n, k) => {
      const j = joints[n];
      ok[k] = !!j && j.visible;
      if (!ok[k]) return;
      pos[k].copy(j!.position); rad[k] = Math.max(0.005, (j!.jointRadius ?? 0.008) * 0.9);
      M.compose(pos[k], Q.identity(), S.setScalar(rad[k]));
      bolas.setMatrixAt(vistas++, M);
    });
    bolas.count = vistas; bolas.instanceMatrix.needsUpdate = true;
    let h = 0;
    for (const [a, b] of HUESOS) {
      if (!ok[a] || !ok[b]) continue;
      D.subVectors(pos[b], pos[a]); const l = D.length();
      if (l < 1e-4) continue;
      C.addVectors(pos[a], pos[b]).multiplyScalar(0.5);
      Q.setFromUnitVectors(Y, D.divideScalar(l));
      const r = Math.min(rad[a], rad[b]) * 0.8;
      M.compose(C, Q, S.set(r, l, r));
      huesos.setMatrixAt(h++, M);
    }
    huesos.count = h; huesos.instanceMatrix.needsUpdate = true;
    return vistas;
  }
  return { bolas, huesos, actualizar, get vistas() { return vistas; }, punta: (n: (typeof JUNTAS)[number]) => pos[JUNTAS.indexOf(n)] };
}

export function createManos(h: ManosHooks) {
  const raiz = new THREE.Group();
  raiz.name = "manos";
  const piel = new THREE.MeshStandardMaterial({ color: PIEL, roughness: 0.75, side: THREE.DoubleSide });
  const plastico = new THREE.MeshStandardMaterial({ color: MANDO, roughness: 0.5 });
  const rayoMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.75, depthWrite: false });
  const rayoGeo = new THREE.BoxGeometry(0.003, 0.003, 1).translate(0, 0, -0.5);
  const puntoGeo = new THREE.SphereGeometry(0.012, 10, 8);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.18, depthWrite: false });
  const haloGeo = new THREE.SphereGeometry(1, 20, 14);
  const oyentes = new Set<(e: EventoMano) => void>();
  const emitir = (e: EventoMano) => { for (const f of oyentes) { try { f(e); } catch (err) { console.warn("[manos]", err); } } };
  let agarrable: (key: string) => boolean = () => false;
  let apuntable: (key: string) => boolean = () => false;
  /** A hand busy holding a tool of a feature (the fishing rod, a dart): no ray, no taking things, no pinch-walking with it.
   *  Several features may hold different hands: each registers under its own name (`reglas({ocupada})` is the name "reglas"). */
  const ocupantes = new Map<string, (lado: Lado) => boolean>();
  const ocupada = (lado: Lado): boolean => { for (const f of ocupantes.values()) if (f(lado)) return true; return false; };
  /** Is the hand held by anyone but these names (the handover's own mark, the piece's own mark)? */
  const ocupadaSalvo = (lado: Lado, ...nombres: string[]): boolean => { for (const [n, f] of ocupantes) if (!nombres.includes(n) && f(lado)) return true; return false; };
  // ---- hand to hand: the free hand next to a held thing, with its grip (or pinch) pressed, takes it ----
  const llevables = new Map<string, Llevable>();
  const cercaCambio = new Set<Lado>(); // free hands within reach of a held thing: their pinch is for the handover, not for «using»
  const gripAntes: Record<Lado, boolean> = { izq: false, der: false };
  ocupantes.set("cambio", (l) => cercaCambio.has(l));

  const ranuras: Ranura[] = [0, 1].map((i) => {
    const ctrl = h.renderer.xr.getController(i), grip = h.renderer.xr.getControllerGrip(i), hand = h.renderer.xr.getHand(i) as Ranura["hand"];
    const rayo = new THREE.Mesh(rayoGeo, rayoMat); rayo.visible = false; rayo.frustumCulled = false;
    const punto = new THREE.Mesh(puntoGeo, rayoMat); punto.visible = false;
    ctrl.add(rayo);
    const manoMando = crearManoMando(piel, plastico); manoMando.grupo.visible = false; grip.add(manoMando.grupo);
    const esqueleto = crearEsqueleto(piel); hand.add(esqueleto.bolas, esqueleto.huesos);
    const ancla = new THREE.Object3D(); ancla.name = `ancla-${i}`;
    const halo = new THREE.Mesh(haloGeo, haloMat); halo.visible = false; halo.renderOrder = 5;
    raiz.add(ctrl, grip, hand, punto, ancla, halo);
    const r: Ranura = { i, fuente: null, lado: null, esMano: false, ctrl, grip, hand, rayo, punto, manoMando, esqueleto, ancla, halo, candidato: null, apuntado: null, pellizcoAire: 0, pellizco: false };
    ctrl.addEventListener("connected", (e: { data?: Fuente }) => {
      const f = e.data ?? null;
      r.fuente = f; r.esMano = !!f?.hand; r.lado = f?.handedness === "left" ? "izq" : f?.handedness === "right" ? "der" : null;
      manoMando.grupo.scale.x = r.lado === "izq" ? -1 : 1; // the left hand is the right one mirrored
    });
    ctrl.addEventListener("disconnected", () => { r.fuente = null; r.lado = null; r.candidato = null; r.apuntado = null; r.pellizcoAire = 0; r.pellizco = false; });
    ctrl.addEventListener("selectstart", () => { r.pellizco = true; if (r.esMano && !r.candidato && !r.apuntado && !(r.lado && ocupada(r.lado))) r.pellizcoAire = performance.now(); pulsar(r, "gatillo"); });
    ctrl.addEventListener("selectend", () => { r.pellizcoAire = 0; r.pellizco = false; if (r.lado) emitir({ tipo: "gatillo_fin", lado: r.lado }); });
    ctrl.addEventListener("squeezestart", () => pulsar(r, "agarre"));
    return r;
  });

  function vibrar(r: Ranura, v = 0.35, ms = 25): void { if (r.esMano) return; /* a tracked hand has no motor: no pulse */ try { void r.fuente?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* no haptics here */ } }
  function pulsar(r: Ranura, como: "gatillo" | "agarre"): void {
    if (!r.lado || !raiz.parent) return;
    if (r.candidato) { emitir({ tipo: "agarrar", key: r.candidato, lado: r.lado }); vibrar(r, 0.6, 40); return; }
    if (como === "agarre" || ocupada(r.lado)) return; // N4: the hand holding the rod reels with its trigger, it does not use things
    const a = r.apuntado;
    if (a?.tipo === "panel" && a.panel?.pulsar) { a.panel.pulsar(a.fila); vibrar(r, 0.5, 40); }
    else if (a?.tipo === "panel") emitir({ tipo: "panel", fila: a.fila, lado: r.lado });
    else if (a?.tipo === "cosa") emitir({ tipo: "apuntar", key: a.key, lado: r.lado });
    else emitir({ tipo: "gatillo", lado: r.lado });
  }

  const caja = new THREE.Box3(), esfera = new THREE.Sphere(), P = new THREE.Vector3(), O = new THREE.Vector3(), Dir = new THREE.Vector3(), Pr = new THREE.Vector3(), Qw = new THREE.Quaternion();
  const ray = new THREE.Raycaster(); ray.far = RAYO_M;
  const uv = new THREE.Vector2();

  /** Where a hand takes things: the controller's grip, or the point between thumb and index tips. In raiz space. */
  function puntoDeAgarre(r: Ranura): boolean {
    if (r.esMano) {
      const j = r.hand.joints;
      const a = j?.["index-finger-tip"], b = j?.["thumb-tip"], w = j?.wrist;
      if (!a?.visible || !b?.visible) return false;
      r.ancla.position.addVectors(a.position, b.position).multiplyScalar(0.5);
      if (w?.visible) r.ancla.quaternion.copy(w.quaternion);
      return true;
    }
    if (!r.grip.visible) return false;
    r.ancla.position.copy(r.grip.position); r.ancla.quaternion.copy(r.grip.quaternion);
    return true;
  }

  const Pa = new THREE.Vector3(), Pb = new THREE.Vector3();
  const mundoDe = (r: Ranura, v: THREE.Vector3): boolean => { if (!puntoDeAgarre(r)) return false; r.ancla.updateMatrixWorld(); r.ancla.getWorldPosition(v); return true; };
  const otra = (l: Lado): Lado => (l === "izq" ? "der" : "izq");
  /** Hand `de` gives what `reg` carries to the other hand, if both hands and the piece allow it. Gesture and button both come here. */
  function pasarA(reg: Llevable, de: Lado): ResCambio {
    const a = otra(de);
    const hacia = ranuras.find((x) => x.lado === a && x.fuente);
    if (!hacia) return { ok: false, why: "No hay otra mano para pasarlo" };
    if (ocupadaSalvo(de, "cambio", reg.ocupante ?? "")) return { ok: false, why: "Esa mano tiene el reloj o está ocupada" };
    if (ocupadaSalvo(a, "cambio")) return { ok: false, why: "La otra mano está ocupada" };
    const p = reg.puede();
    if (p !== true) return { ok: false, why: p };
    reg.pasar(a);
    vibrar(ranuras.find((x) => x.lado === de && x.fuente) ?? hacia, 0.5, 60); vibrar(hacia, 0.5, 60);
    return { ok: true, que: reg.que, a };
  }
  /** Every frame, after the hands moved: a free hand close to a held thing, its grip going down = the thing changes hands. */
  function vigilarCambio(): void {
    cercaCambio.clear();
    const hay = [...llevables.values()].some((x) => x.lado());
    for (const r of ranuras) {
      if (!r.lado || !r.fuente) continue;
      const pulsado = r.esMano ? r.pellizco : (r.fuente.gamepad?.buttons[1]?.value ?? 0) > 0.6;
      const baja = pulsado && !gripAntes[r.lado]; gripAntes[r.lado] = pulsado;
      if (!hay || r.candidato || ocupadaSalvo(r.lado, "cambio") || !mundoDe(r, Pa)) continue;
      for (const reg of llevables.values()) {
        const de = reg.lado();
        if (!de || de === r.lado) continue;
        const donante = ranuras.find((x) => x.lado === de && x.fuente);
        const pt = reg.punto?.();
        const cerca = (donante && mundoDe(donante, Pb) && Pa.distanceTo(Pb) <= CERCA_CAMBIO_M) || (!!pt && Pa.distanceTo(Pb.set(pt.x, pt.y, pt.z)) <= CERCA_CAMBIO_M);
        if (!cerca) continue;
        cercaCambio.add(r.lado);
        if (baja) { const res = pasarA(reg, de); if (!res.ok) h.nota?.(res.why); }
        break;
      }
    }
  }

  // ---- t_8d0bc2dd: jump with the hands — both wrists flicked up at once (salto-manos.ts holds the maths) ----
  const salto = crearSaltoManos();
  let saltoPedido = false;
  const Pw = new THREE.Vector3();
  /** A TRACKED hand's wrist height in the rig's frame (the avatar's jumps and walking add nothing), or null: not here, a controller
   *  (it has A/X, and a controller swung about while walking must not jump), not drawn, or busy with something. */
  function alturaMuneca(lado: Lado): number | null {
    const r = ranuras.find((x) => x.lado === lado && x.fuente);
    if (!r || !r.esMano || ocupada(lado)) return null;
    const o = r.hand.joints?.wrist;
    if (!o?.visible || !r.hand.visible) return null;
    o.updateWorldMatrix(true, false); o.getWorldPosition(Pw);
    return raiz.worldToLocal(Pw).y;
  }
  function vigilarSalto(ahora: number): void {
    if (salto.muestra(ahora, alturaMuneca("izq"), alturaMuneca("der"))) saltoPedido = true;
  }

  function actualizarRanura(r: Ranura, camara: THREE.Camera | null): void {
    if (!r.fuente) { // loaded after the inputs connected (entering XR before the prefetch): take the one three gave this slot
      const xr = h.renderer.xr as unknown as { _controllerInputSources?: (Fuente | null)[] };
      const f = xr._controllerInputSources?.[r.i];
      if (f) r.ctrl.dispatchEvent({ type: "connected", data: f } as never);
    }
    const conectado = !!r.fuente && !!r.lado;
    r.manoMando.grupo.visible = conectado && !r.esMano;
    const vistas = conectado && r.esMano ? r.esqueleto.actualizar(r.hand.joints) : r.esqueleto.actualizar(undefined);
    r.hand.visible = vistas > 0;
    if (conectado && !r.esMano) {
      const b = r.fuente!.gamepad?.buttons ?? [];
      const pulgar = [3, 4, 5].some((k) => b[k]?.touched || b[k]?.pressed) ? 1 : 0;
      r.manoMando.dedos(b[0]?.value ?? 0, b[1]?.value ?? 0, pulgar);
    }
    // reach: the nearest thing that can be taken, within ALCANCE_M of its bounding sphere
    const antes = r.candidato;
    r.candidato = null;
    const tiene = conectado && puntoDeAgarre(r) && !ocupada(r.lado!);
    r.ancla.updateMatrixWorld();
    if (tiene) {
      r.ancla.getWorldPosition(P);
      let mejor = Infinity;
      for (const [k, g] of h.objetos()) {
        if (!agarrable(k) || !g.visible || g.parent?.name?.startsWith("ancla-")) continue;
        caja.setFromObject(g); if (caja.isEmpty()) continue;
        caja.getBoundingSphere(esfera);
        const d = P.distanceTo(esfera.center) - esfera.radius;
        if (d < ALCANCE_M && d < mejor) { mejor = d; r.candidato = k; r.halo.position.copy(esfera.center); r.halo.scale.setScalar(esfera.radius * 1.15 + 0.03); }
      }
    }
    if (r.candidato && r.candidato !== antes) vibrar(r);
    if (r.halo.parent && r.candidato) { r.halo.parent.worldToLocal(r.halo.position); r.halo.scale.divideScalar(r.halo.parent.getWorldScale(O).x || 1); }
    r.halo.visible = !!r.candidato;
    // the ray: panels first, then things and names; it stops where it hits
    const filaAntes = r.apuntado?.tipo === "panel" ? r.apuntado.fila : 0; // the row aimed last frame (0: none)
    r.apuntado = null;
    const rayoVivo = conectado && r.ctrl.visible && !r.candidato && !ocupada(r.lado!);
    r.rayo.visible = rayoVivo; r.punto.visible = false;
    if (!rayoVivo) return;
    r.ctrl.updateMatrixWorld();
    r.ctrl.getWorldPosition(O); Dir.set(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(Qw));
    ray.set(O, Dir);
    if (camara) ray.camera = camara;
    let dist = RAYO_M;
    for (const p of h.paneles?.() ?? []) {
      if (!p.malla.visible) continue;
      const hit = ray.intersectObject(p.malla, false)[0];
      if (hit && hit.distance < dist && hit.uv) { uv.copy(hit.uv); const n = p.fila(uv); dist = hit.distance; r.apuntado = { tipo: "panel", key: "", fila: n, panel: p }; p.encima(n); if (n && n !== filaAntes) vibrar(r, 0.25, 15); /* MIS-200 t_4038a8cd: a new row under the ray ticks once */ }
    }
    if (!r.apuntado) {
      const lista: THREE.Object3D[] = [], claves = new Map<THREE.Object3D, string>();
      for (const [k, g] of h.objetos()) if (apuntable(k) && g.visible) { lista.push(g); claves.set(g, k); }
      for (const [k, s] of h.etiquetas?.() ?? []) if (apuntable(k) && s.visible) { lista.push(s); claves.set(s, k); }
      for (const hit of ray.intersectObjects(lista, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !claves.has(o)) o = o.parent;
        if (o) { dist = hit.distance; r.apuntado = { tipo: "cosa", key: claves.get(o)!, fila: 0 }; break; }
      }
    }
    const escalaMundo = r.ctrl.getWorldScale(O).z || 1;
    r.rayo.scale.z = dist / escalaMundo;
    if (r.apuntado) {
      r.punto.visible = true;
      r.punto.position.copy(ray.ray.at(dist, P));
      raiz.worldToLocal(r.punto.position);
    }
  }

  return {
    raiz,
    /** Put the hands under `padre` (VR: the rig; AR: its root) or take them away (null). */
    montar(padre: THREE.Object3D | null): void { if (padre) padre.add(raiz); else raiz.parent?.remove(raiz); },
    /** What a hand may take (quest things that the current step needs) and what the ray may use. */
    reglas(o: { agarrable?: (key: string) => boolean; apuntable?: (key: string) => boolean; ocupada?: (lado: Lado) => boolean }): void { if (o.agarrable) agarrable = o.agarrable; if (o.apuntable) apuntable = o.apuntable; if (o.ocupada) ocupantes.set("reglas", o.ocupada); },
    /** A feature that holds a hand (see `ocupada`): `fn(lado)` is asked live. Returns how to let go of the registration. */
    ocupar(nombre: string, fn: (lado: Lado) => boolean): () => void { ocupantes.set(nombre, fn); return () => { if (ocupantes.get(nombre) === fn) ocupantes.delete(nombre); }; },
    /** Hand to hand: a piece that carries something in a hand registers it here; the free hand's grip next to it (CERCA_CAMBIO_M), or `cambiarMano()`, moves it. Returns how to unregister. */
    llevable(nombre: string, l: Llevable): () => void { llevables.set(nombre, l); return () => { if (llevables.get(nombre) === l) llevables.delete(nombre); }; },
    /** What is carried now: name, words, hand. */
    llevando(): { nombre: string; que: string; lado: Lado }[] { const out: { nombre: string; que: string; lado: Lado }[] = []; for (const [nombre, l] of llevables) { const lado = l.lado(); if (lado) out.push({ nombre, que: l.que, lado }); } return out; },
    /** The button path of the same handover (the Bolsa row «Cambiar de mano»): the first thing carried goes to the other hand. */
    cambiarMano(): ResCambio {
      for (const reg of llevables.values()) { const de = reg.lado(); if (de) return pasarA(reg, de); }
      return { ok: false, why: "No llevas nada en la mano" };
    },
    /** Is this hand held by any feature but `excepto` (a feature asks before it takes a hand for itself)? */
    ocupadaPorOtros(lado: Lado, excepto: string): boolean { for (const [n, f] of ocupantes) if (n !== excepto && f(lado)) return true; return false; },
    /** What a hand reaches (a quest thing it would take) and what its ray points at ("panel:n" or a thing's key), now. */
    sondeo(lado: Lado): { candidato: string | null; apunta: string | null } | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      return r ? { candidato: r.candidato, apunta: r.apuntado ? (r.apuntado.tipo === "panel" ? `panel:${r.apuntado.fila}` : r.apuntado.key) : null } : null;
    },
    /** Every frame while presenting. `camara` = the XR camera (sprites need it to be hit). */
    update(camara: THREE.Camera | null, ahora = performance.now()): void { if (!raiz.parent) return; raiz.updateMatrixWorld(); for (const r of ranuras) actualizarRanura(r, camara); vigilarCambio(); vigilarSalto(ahora); },
    /** t_8d0bc2dd: true once per jump gesture (both wrists flicked up together) since the last call; the VR layer asks each frame. */
    takeSalto(): boolean { const s = saltoPedido; saltoPedido = false; return s; },
    /** Forget the jump gesture's history (leaving VR, a panel opening). */
    reiniciarSalto(): void { salto.reiniciar(); saltoPedido = false; },
    on(fn: (e: EventoMano) => void): () => void { oyentes.add(fn); return () => oyentes.delete(fn); },
    /** Where a thing held in this hand goes (grip or pinch point), or null if that hand is not here. */
    ancla(lado: Lado): THREE.Object3D | null { const r = ranuras.find((x) => x.lado === lado && x.fuente); return r ? r.ancla : null; },
    /** Rediseño v2 (the wrist watch): that hand's wrist in world space — a tracked hand's wrist joint, or the controller's
     * grip — written into `pos`/`rot`; false when that hand is not here. */
    muneca(lado: Lado, pos: THREE.Vector3, rot: THREE.Quaternion): { esMano: boolean } | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r) return null;
      const o = r.esMano ? r.hand.joints?.wrist : r.grip;
      if (!o?.visible || (r.esMano && !r.hand.visible)) return null;
      o.updateWorldMatrix(true, false); o.getWorldPosition(pos); o.getWorldQuaternion(rot);
      return { esMano: r.esMano };
    },
    /** What presses buttons by touch: a tracked hand's index fingertip, or the tip of a controller (its ray's origin),
     * in world space into `pos`; false when that hand is not here. */
    punta(lado: Lado, pos: THREE.Vector3): boolean {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r) return false;
      const o = r.esMano ? r.hand.joints?.["index-finger-tip"] : r.ctrl;
      if (!o?.visible) return false;
      o.updateWorldMatrix(true, false); o.getWorldPosition(pos);
      return true;
    },
    /** This hand's ray right now (world space, plain numbers — not a page's job to hold onto a THREE.Vector3), or
     * null if that hand is not here. For a feature that needs its own aim at the exact moment a button changed
     * (dardos-vr.ts: the throw, read on `gatillo_fin`), not through the generic reach/point pipeline above (which
     * only reports keys it was given rules for). */
    rayo(lado: Lado): { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r || !r.ctrl.visible) return null;
      r.ctrl.updateMatrixWorld();
      const o = r.ctrl.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(new THREE.Quaternion()));
      return { origen: { x: o.x, y: o.y, z: o.z }, dir: { x: d.x, y: d.y, z: d.z } };
    },
    /** Walking with tracked hands: the flattened direction (world, unit) of a hand pinching in empty air for ANDAR_MS,
     *  never the `excluida` hand (the one holding the open wrist menu). */
    andar(excluida?: Lado | null): [number, number] | null {
      const ahora = performance.now();
      for (const r of ranuras) {
        // t_41d8e44c (design §2.3): `excluida` = the hand that carries the open wrist menu: its pinch is the menu's, never a step
        if (!r.esMano || !r.pellizcoAire || ahora - r.pellizcoAire < ANDAR_MS || !r.ctrl.visible || (r.lado && (r.lado === excluida || ocupada(r.lado)))) continue;
        Dir.set(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(Qw));
        const l = Math.hypot(Dir.x, Dir.z);
        if (l > 0.2) return [Dir.x / l, Dir.z / l];
      }
      return null;
    },
    /** Rowing (t_ee0ca4a3, remo.ts): where each tracked hand pinching in empty air is now (world space, plain numbers), at once
     *  (no ANDAR_MS wait), never the `excluida` hand nor one that holds something. vr.ts turns it into «metres in front of the head». */
    remar(excluida?: Lado | null): { lado: Lado; x: number; y: number; z: number }[] {
      const out: { lado: Lado; x: number; y: number; z: number }[] = [];
      for (const r of ranuras) {
        if (!r.esMano || !r.pellizcoAire || !r.ctrl.visible || !r.lado || r.lado === excluida || ocupada(r.lado)) continue;
        r.ctrl.getWorldPosition(Pr);
        out.push({ lado: r.lado, x: Pr.x, y: Pr.y, z: Pr.z });
      }
      return out;
    },
    /** t_bf8947cf: where that hand's controller points, flattened (world, unit) — «según el mando» locomotion.
     * null while that side has no controller connected (a tracked hand has no stick to read anyway). */
    dirMando(lado: Lado): [number, number] | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente && !x.esMano);
      if (!r) return null;
      Dir.set(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(Qw));
      const l = Math.hypot(Dir.x, Dir.z);
      return l > 0.2 ? [Dir.x / l, Dir.z / l] : null;
    },
    /** v6: where that hand points now (world, unit, 3D): a controller's ray or a tracked hand's pinch ray, drawn or not (a hand
     * holding a dart has no ray drawn, yet the dart must point where it points). null while that side is not here. */
    dirRayo(lado: Lado): [number, number, number] | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r) return null;
      r.ctrl.updateWorldMatrix(true, false);
      Dir.set(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(Qw));
      return [Dir.x, Dir.y, Dir.z];
    },
    /** What a hand's buttons say now: trigger (or a tracked hand's pinch, 0/1), grip, and whether it is a tracked hand. */
    entrada(lado: Lado): { gatillo: number; agarre: number; mano: boolean } | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r) return null;
      if (r.esMano) return { gatillo: r.pellizco ? 1 : 0, agarre: 0, mano: true };
      const b = r.fuente!.gamepad?.buttons ?? [];
      return { gatillo: b[0]?.value ?? 0, agarre: b[1]?.value ?? 0, mano: false };
    },
    vibrar(lado: Lado, v = 0.5, ms = 60): void { const r = ranuras.find((x) => x.lado === lado); if (r) vibrar(r, v, ms); },
    /** M22b-3: this hand's ray now (world space), or null when it is not drawn (no controller, or holding something close). For
     * features that pick their own things along it (the builder) instead of waiting for `apuntado`'s own list. */
    rayoDe(lado: Lado): { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null {
      const r = ranuras.find((x) => x.lado === lado && x.fuente);
      if (!r || !r.rayo.visible) return null;
      r.ctrl.getWorldPosition(O); Dir.set(0, 0, -1).applyQuaternion(r.ctrl.getWorldQuaternion(Qw));
      return { origen: { x: O.x, y: O.y, z: O.z }, dir: { x: Dir.x, y: Dir.y, z: Dir.z } };
    },
    /** For checks: per hand, what is connected and drawn, how bent the fingers are, what it reaches and points at. */
    estado() {
      const out: Record<Lado, { tipo: "mando" | "mano"; dibujada: boolean; articulaciones: number; indice: number; resto: number; candidato: string | null; apunta: string | null; rayo: boolean } | null> = { izq: null, der: null };
      for (const r of ranuras) {
        if (!r.lado || !r.fuente) continue;
        const b = r.fuente.gamepad?.buttons ?? [];
        out[r.lado] = {
          tipo: r.esMano ? "mano" : "mando", dibujada: r.esMano ? r.esqueleto.vistas > 0 : r.manoMando.grupo.visible, articulaciones: r.esqueleto.vistas,
          indice: r.esMano ? 0 : b[0]?.value ?? 0, resto: r.esMano ? 0 : b[1]?.value ?? 0,
          candidato: r.candidato, apunta: r.apuntado ? (r.apuntado.tipo === "panel" ? `panel:${r.apuntado.fila}` : r.apuntado.key) : null, rayo: r.rayo.visible,
        };
      }
      return out;
    },
  };
}
export type Manos = ReturnType<typeof createManos>;
