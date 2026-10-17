// AR session (J8 + J8b): immersive-ar. You look at a table or the floor, a ring shows where, and a tap (phone) or the
// trigger (Quest 3, Pico 4) puts THE PLAZA THERE, in miniature and live: the pillars, the people of the world, the
// quest things and every player moving (yours in orange). Tap/trigger again moves it. On a headset: your hands and
// controllers are drawn (manos.ts), the left stick walks your own avatar on the table, the right stick turns the
// plaza (sideways) and makes it bigger or smaller (up/down); A or X jumps. Anchors keep it still when the device has
// them. Without hit-test (some headsets) it goes at table height in front of you. Phones: the session ends by itself
// after AR_MAX_MS (they must stay cool); headsets after AR_MAX_VISOR_MS. iPhone has no WebXR AR: no button there.
// A minigame can take the session instead of the miniature (`jugar(juego)`, e.g. the dartboard on your real wall:
// dardos-ar.ts): it gets the surface under the gaze every frame (walls included: the hit pose's y axis is the
// surface's normal), every press and release with its ray (a tap on a phone, the trigger or a pinch on a headset),
// and its own group to draw in; the miniature stays hidden. Such a session lasts AR_JUEGO_MS on a phone.
import * as THREE from "three/webgpu";
/** The hands (manos.ts) as the view hands them over: loaded on entering (`cargar`), then mounted. */
export type ManosXR = { cargar(): Promise<unknown>; montar(p: THREE.Object3D | null): void; update(c: THREE.Camera | null): void };

export const AR_MAX_MS = 90_000;
export const AR_MAX_VISOR_MS = 20 * 60_000;
/** A minigame in AR on a phone (a turn of darts takes a while): longer than the miniature, still bounded. */
export const AR_JUEGO_MS = 5 * 60_000;
/** A ray in the session's reference space (metres), from a tap, the trigger or a pinch. */
export type RayoAR = { origen: THREE.Vector3; dir: THREE.Vector3 };
/** A minigame that takes an AR session (see the header). Every hook gets the XR camera. */
export type JuegoAR = {
  readonly root: THREE.Object3D;
  /** Every frame: the surface under the gaze (pose matrix; its y axis = the surface's normal), or null. */
  superficie(hit: THREE.Matrix4 | null, cam: THREE.Camera, sinHitTest: boolean): void;
  pulsar(rayo: RayoAR | null, cam: THREE.Camera): void;
  soltar(rayo: RayoAR | null, cam: THREE.Camera): void;
  update(dt: number, cam: THREE.Camera): void;
  /** The session ended (any reason). */
  fin(): void;
};
/** The miniature's scale at first: 1 m of plaza = 2 cm on your table (the plaza's 40 m radius = 0.8 m). */
export const ESCALA_MAQUETA = 1 / 50;
const ESCALA_MIN = 1 / 400, ESCALA_MAX = 1 / 8;
/** Avatars on the table are drawn this much bigger than true size, so a person is not a speck. */
const AUMENTO_GENTE = 2.2;
const GENTE_MAX = 400;

type XRLike = { isSessionSupported(mode: string): Promise<boolean>; requestSession(mode: string, init?: object): Promise<any> };
const xrOf = (): XRLike | null => (typeof navigator !== "undefined" && (navigator as unknown as { xr?: XRLike }).xr) || null;

/** True only when this device can run an immersive-ar session. Never throws. */
export async function arSupported(): Promise<boolean> {
  const xr = xrOf();
  if (!xr) return false;
  try { return await xr.isSessionSupported("immersive-ar"); } catch { return false; }
}

export type ARState = "off" | "searching" | "ready" | "placed" | "mezclada";
/** What the miniature shows, read every frame (render's own lists: no copies kept). */
export type Maqueta = {
  yo: () => { x: number; z: number; y?: number } | null;
  otros: () => Iterable<{ x: number; z: number; y?: number }>;
  hitos: () => Iterable<THREE.Mesh>;
  cosas: () => Iterable<[string, { x: number; y: number; z: number }]>;
};
export type ARHooks = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  /** Everything of the normal world: hidden (and background/fog removed) while the camera feed is the world. */
  world: THREE.Object3D;
  domOverlayRoot?: HTMLElement;
  maxMs?: number;
  manos?: ManosXR;
  maqueta?: Maqueta;
  onChange?: (state: ARState) => void;
};

export function createAR(h: ARHooks) {
  const root = new THREE.Group();
  root.visible = false;
  h.scene.add(root);
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  root.add(reticle);
  root.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
  const luz = new THREE.DirectionalLight(0xffffff, 1.2); luz.position.set(1, 3, 2); root.add(luz);

  // ---- the miniature: a base (where it stands, from the hit or the anchor) → a plate that turns and scales ----
  const base = new THREE.Group(); base.matrixAutoUpdate = false; base.visible = false; root.add(base);
  const plato = new THREE.Group(); base.add(plato);
  let escala = ESCALA_MAQUETA, giro = 0;
  const aplicarPlato = () => { plato.scale.setScalar(escala); plato.rotation.y = giro; };
  aplicarPlato();
  const suelo = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 0.8, 48).translate(0, -0.4, 0), new THREE.MeshStandardMaterial({ color: 0xa7b89c, roughness: 0.9 }));
  const borde = new THREE.Mesh(new THREE.TorusGeometry(42, 0.6, 6, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f7f68 }));
  plato.add(suelo, borde);
  const pilarGeo = new THREE.BoxGeometry(1, 3, 1).translate(0, 1.5, 0);
  const pilares = new THREE.InstancedMesh(pilarGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), 64);
  pilares.count = 0; pilares.frustumCulled = false; plato.add(pilares);
  const genteGeo = new THREE.CapsuleGeometry(0.35, 1.0, 3, 8).translate(0, 0.85, 0);
  const gente = new THREE.InstancedMesh(genteGeo, new THREE.MeshStandardMaterial({ color: 0x6d7f99 }), GENTE_MAX);
  gente.count = 0; gente.frustumCulled = false; gente.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plato.add(gente);
  const yoMalla = new THREE.Mesh(genteGeo, new THREE.MeshStandardMaterial({ color: 0xe07a3f, emissive: 0x5a2000 })); yoMalla.visible = false; plato.add(yoMalla);
  const cosaGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(0, 0.35, 0), personaGeo = new THREE.ConeGeometry(0.45, 1.9, 8).translate(0, 0.95, 0);
  const cosas = new THREE.InstancedMesh(cosaGeo, new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x3a2400 }), 128);
  const personas = new THREE.InstancedMesh(personaGeo, new THREE.MeshStandardMaterial({ color: 0x3fb6a8 }), 64);
  for (const m of [cosas, personas]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plato.add(m); }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), C = new THREE.Color();
  let pilaresListos = false;
  function dibujarMaqueta(): void {
    const mq = h.maqueta;
    if (!mq || !base.visible) return;
    if (!pilaresListos) { // the pillars do not move: once
      let n = 0;
      for (const p of mq.hitos()) {
        if (!p.visible || n >= 64) continue;
        M.compose(V.set(p.position.x, 0, p.position.z), Q.identity(), S.set(1, 1, 1));
        pilares.setMatrixAt(n, M); pilares.setColorAt(n, C.copy((p.material as THREE.MeshStandardMaterial).color)); n++;
      }
      pilares.count = n; pilares.instanceMatrix.needsUpdate = true; if (pilares.instanceColor) pilares.instanceColor.needsUpdate = true;
      pilaresListos = true;
    }
    S.setScalar(AUMENTO_GENTE);
    let n = 0;
    for (const o of mq.otros()) { if (n >= GENTE_MAX) break; M.compose(V.set(o.x, o.y ?? 0, o.z), Q.identity(), S); gente.setMatrixAt(n++, M); }
    gente.count = n; gente.instanceMatrix.needsUpdate = true;
    const yo = mq.yo();
    yoMalla.visible = !!yo;
    if (yo) { yoMalla.position.set(yo.x, yo.y ?? 0, yo.z); yoMalla.scale.setScalar(AUMENTO_GENTE * 1.1); }
    let nc = 0, np = 0;
    for (const [k, t] of mq.cosas()) {
      if (k.startsWith("~")) continue; // the builder's previews
      if (k.startsWith("pnj:")) { if (np < 64) { M.compose(V.set(t.x, 0, t.z), Q.identity(), S); personas.setMatrixAt(np++, M); } }
      else if (nc < 128) { M.compose(V.set(t.x, t.y, t.z), Q.identity(), S.setScalar(k.startsWith("misiones:") ? 1.6 : 1)); cosas.setMatrixAt(nc++, M); S.setScalar(AUMENTO_GENTE); }
    }
    cosas.count = nc; personas.count = np; cosas.instanceMatrix.needsUpdate = personas.instanceMatrix.needsUpdate = true;
  }

  let state: ARState = "off";
  let session: any = null, source: any = null, anchor: any = null, timer: ReturnType<typeof setTimeout> | undefined;
  let savedBg: THREE.Scene["background"] = null, savedFog: THREE.Scene["fog"] = null;
  // The AR rule ("the room shows through: hide the world so it doesn't collide with it") must come from the
  // session ITSELF (environmentBlendMode), not from which button opened it. A device can serve an immersive-vr
  // session (vr.ts's own `enter()`) as alpha-blend passthrough — ar.ts never ran, so `session` above stays null,
  // but the room is still mixed in. `sincronizarExterna` below watches the renderer's actual session every frame
  // and reconciles world/state the same way, whoever asked for that session.
  let extSession: any = null, extHidden = false;
  let extSavedBg: THREE.Scene["background"] = null, extSavedFog: THREE.Scene["fog"] = null;
  const esMezclada = (s: any): boolean => !!s && s.environmentBlendMode !== undefined && s.environmentBlendMode !== "opaque";
  function sincronizarExterna(): void {
    const s = h.renderer.xr.getSession() as any;
    if (!s || s === session) { // our own AR session (handled by enter/exit above) or no session at all
      if (extHidden) { h.scene.background = extSavedBg; h.scene.fog = extSavedFog; h.world.visible = true; extHidden = false; if (state === "mezclada") set("off"); }
      extSession = null;
      return;
    }
    if (s === extSession) return; // already reconciled for this session
    extSession = s;
    if (!esMezclada(s)) return; // a plain opaque session (normal VR): nothing of ours to do
    extSavedBg = h.scene.background; extSavedFog = h.scene.fog;
    h.scene.background = null; h.scene.fog = null; h.world.visible = false; extHidden = true;
    set("mezclada");
    s.addEventListener("end", () => {
      if (extSession !== s) return;
      if (extHidden) { h.scene.background = extSavedBg; h.scene.fog = extSavedFog; h.world.visible = true; extHidden = false; }
      extSession = null;
      if (state === "mezclada") set("off");
    });
  }
  let hitMatrix: THREE.Matrix4 | null = null, lastHit: any = null, sinHitTest = false, visor = false, limiteMs = AR_MAX_MS;
  let moveX = 0, moveZ = 0, jumpWanted = false, empezo = 0;
  const held = { left: false, right: false };
  const set = (s: ARState) => { if (s !== state) { state = s; h.onChange?.(s); } };

  const delante = new THREE.Matrix4();
  /** No hit-test: 0.9 m in front of the eyes and 0.55 m below them (a table), level. */
  function puntoDelante(): THREE.Matrix4 | null {
    const cam = h.renderer.xr.getCamera();
    const ojo = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), d = new THREE.Vector3();
    cam.getWorldDirection(d); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, -1); d.normalize();
    const p = ojo.addScaledVector(d, 0.9); p.y -= 0.55;
    return delante.compose(p, Q.setFromAxisAngle(V.set(0, 1, 0), Math.atan2(-d.x, -d.z)), S.set(1, 1, 1));
  }
  const place = () => {
    const m = hitMatrix ?? (sinHitTest ? puntoDelante() : null);
    if (!m) return;
    base.matrix.copy(m); base.visible = true; pilaresListos = false; set("placed");
    anchor = null;
    // an anchor keeps the plaza still while the device refines its idea of the floor; optional
    try { lastHit?.createAnchor?.()?.then((a: any) => { anchor = a; }).catch(() => {}); } catch { /* no anchors here */ }
  };

  // ---- a minigame instead of the miniature (jugar) ----
  let juego: JuegoAR | null = null;
  const rayoDe = (ev: any): RayoAR | null => {
    try {
      const ref = h.renderer.xr.getReferenceSpace?.();
      const p = ev?.frame && ref ? ev.frame.getPose(ev.inputSource.targetRaySpace, ref) : null;
      if (!p) return null;
      const m = new THREE.Matrix4().fromArray(p.transform.matrix);
      return { origen: new THREE.Vector3().setFromMatrixPosition(m), dir: new THREE.Vector3(0, 0, -1).transformDirection(m) };
    } catch { return null; }
  };
  const pulsado = (ev: any) => { juego?.pulsar(rayoDe(ev), h.renderer.xr.getCamera()); };
  const soltado = (ev: any) => { juego?.soltar(rayoDe(ev), h.renderer.xr.getCamera()); };

  let lastError = ""; // why the last enter() failed (T1 report)
  /** Enter AR with a minigame instead of the miniature (true if the session started). */
  async function jugar(j: JuegoAR, maxMs = h.maxMs ?? AR_JUEGO_MS): Promise<boolean> {
    if (session) return false;
    juego = j;
    const ok = await enter(maxMs);
    if (!ok) juego = null;
    return ok;
  }
  async function enter(maxMs?: number): Promise<boolean> {
    const xr = xrOf();
    if (!xr || session) return false;
    if (maxMs === undefined) juego = null; // the plain button: the miniature
    const init: Record<string, unknown> = { optionalFeatures: ["hit-test", "anchors", "local-floor", "hand-tracking"] };
    if (h.domOverlayRoot) { (init.optionalFeatures as string[]).push("dom-overlay"); init.domOverlay = { root: h.domOverlayRoot }; }
    try { session = await xr.requestSession("immersive-ar", init); } catch (e) { lastError = String((e as Error)?.message ?? e).slice(0, 160); session = null; return false; }
    h.renderer.xr.enabled = true;
    h.renderer.xr.setReferenceSpaceType("local");
    await h.renderer.xr.setSession(session);
    savedBg = h.scene.background; savedFog = h.scene.fog;
    h.scene.background = null; h.scene.fog = null; h.world.visible = false; root.visible = true;
    await h.manos?.cargar().catch(() => {}); // after requestSession (it needs the click's activation); prefetched by the view
    h.manos?.montar(root);
    try {
      const viewer = await session.requestReferenceSpace("viewer");
      // a minigame wants walls too: ask for every plane (and meshes/points where the device has them)
      source = await session.requestHitTestSource(juego ? { space: viewer, entityTypes: ["plane", "point"] } : { space: viewer });
      sinHitTest = false;
    } catch { source = null; sinHitTest = true; } // no hit-test here: the plaza goes in front of you
    if (juego) { root.add(juego.root); session.addEventListener("selectstart", pulsado); session.addEventListener("selectend", soltado); }
    else session.addEventListener("select", place); // a tap, the trigger or a pinch: put the plaza where the ring is (again = move it)
    session.addEventListener("end", () => {
      clearTimeout(timer);
      session = null; source = null; anchor = null; hitMatrix = null; lastHit = null; moveX = moveZ = 0;
      h.scene.background = savedBg; h.scene.fog = savedFog; h.world.visible = true; root.visible = false;
      reticle.visible = false; base.visible = false; h.renderer.xr.enabled = false;
      h.manos?.montar(null);
      if (juego) { root.remove(juego.root); const j = juego; juego = null; j.fin(); }
      set("off");
    });
    empezo = performance.now(); visor = false; limiteMs = maxMs ?? h.maxMs ?? AR_MAX_MS;
    timer = setTimeout(() => { void exit(); }, limiteMs);
    set(sinHitTest ? "ready" : "searching");
    return true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting. */
  function update(dtSeconds = 1 / 60): void {
    sincronizarExterna(); // mixed reality must come from the session, regardless of whether this module started it
    const frame = h.renderer.xr.getFrame?.();
    const ref = h.renderer.xr.getReferenceSpace?.();
    if (!session || !frame || !ref) return;
    // a headset (tracked controllers or hands) may stay longer than a phone
    if (!visor && [...(session.inputSources ?? [])].some((s: { targetRayMode?: string }) => s.targetRayMode === "tracked-pointer")) {
      visor = true;
      if (h.maxMs === undefined && !juego) { clearTimeout(timer); limiteMs = AR_MAX_VISOR_MS; timer = setTimeout(() => { void exit(); }, Math.max(1000, limiteMs - (performance.now() - empezo))); }
    }
    if (anchor) {
      const p = frame.getPose(anchor.anchorSpace, ref);
      if (p) base.matrix.fromArray(p.transform.matrix);
    }
    const hits = source ? frame.getHitTestResults(source) : [];
    const pose = hits.length ? hits[0].getPose(ref) : null;
    if (pose) {
      lastHit = hits[0];
      hitMatrix = (hitMatrix ?? new THREE.Matrix4()).fromArray(pose.transform.matrix);
      reticle.matrix.copy(hitMatrix); reticle.visible = true;
      if (state === "searching") set("ready");
    } else { reticle.visible = false; hitMatrix = null; lastHit = null; }
    if (juego) { // the minigame draws its own reticle and board; no miniature, no sticks
      reticle.visible = false;
      const cam = h.renderer.xr.getCamera();
      juego.superficie(hitMatrix, cam, sinHitTest); juego.update(dtSeconds, cam);
      h.manos?.update(cam);
      return;
    }
    // sticks (headsets): left walks your avatar on the table, right turns (sideways) and scales (up/down) the plaza
    let lx = 0, ly = 0, rx = 0, ry = 0;
    for (const src of session.inputSources ?? []) {
      const a = src.gamepad?.axes;
      if (!a || src.hand) continue;
      const sx = a.length > 3 ? a[2] : a[0], sy = a.length > 3 ? a[3] : a[1];
      const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
      if (src.handedness === "left") { lx = dz(sx ?? 0); ly = dz(sy ?? 0); }
      else if (src.handedness === "right") { rx = dz(sx ?? 0); ry = dz(sy ?? 0); }
      if (src.handedness === "left" || src.handedness === "right") {
        const down = !!src.gamepad.buttons?.[4]?.pressed;
        if (down && !held[src.handedness as "left" | "right"] && state === "placed") jumpWanted = true;
        held[src.handedness as "left" | "right"] = down;
      }
    }
    if (state === "placed") {
      if (rx) { giro -= rx * dtSeconds * 1.6; aplicarPlato(); }
      if (ry) { escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala * Math.exp(-ry * dtSeconds * 0.6))); aplicarPlato(); }
      // the stick pushes where you look, turned into the plaza's own frame
      const cam = h.renderer.xr.getCamera(), d = new THREE.Vector3();
      cam.getWorldDirection(d);
      base.updateMatrixWorld();
      const q = plato.getWorldQuaternion(new THREE.Quaternion()).invert();
      d.applyQuaternion(q); d.y = 0;
      const l = Math.hypot(d.x, d.z) || 1, fx = d.x / l, fz = d.z / l;
      moveX = fx * -ly + -fz * lx; moveZ = fz * -ly + fx * lx;
      const m = Math.hypot(moveX, moveZ); if (m > 1) { moveX /= m; moveZ /= m; }
    } else moveX = moveZ = 0;
    dibujarMaqueta();
    h.manos?.update(h.renderer.xr.getCamera());
  }

  return {
    enter: () => enter(), exit, update, jugar,
    get state() { return state; },
    /** True while a minigame (not the miniature) has the session. */
    get jugando() { return !!juego && !!session; },
    /** True whenever the room shows through (mixed reality), by this module's own session or someone else's. */
    activo(): boolean { return state !== "off"; },
    get placed() { return base.visible; },
    get lastError() { return lastError; },
    /** Movement intention for your avatar, plaza frame, each -1..1 (only while the plaza stands on your table). */
    axes(): [number, number] { return [moveX, moveZ]; },
    /** True once per press of A or X since the last call. */
    takeJump(): boolean { const j = jumpWanted; jumpWanted = false; return j; },
    /** For checks: what the miniature draws and how. */
    maqueta() { return { escala, giroGrados: Math.round((giro * 180) / Math.PI), pilares: pilares.count, gente: gente.count, yo: yoMalla.visible, cosas: cosas.count, personas: personas.count, sinHitTest, visor, limiteMs }; },
  };
}
