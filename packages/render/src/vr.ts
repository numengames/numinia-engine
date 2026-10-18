// VR session (J6 + J10): immersive-vr, a rig that follows the avatar, stick = movement intentions (left), snap turn in
// fixed steps (right stick), comfort vignette, your hands (manos.ts: a hand holding each controller, or your tracked
// hands), a panel with what you are doing, a dialogue panel you answer with the ray, and short notes in front of you.
// render only reports intentions (`axes()` in -1..1, world frame) and choices; the sim and the server decide.
// Only offered where WebXR VR exists (Quest, Pico, desktop headsets); phones and iPhone never see the button.
// Buttons (xr-standard): A or X jump · B back (closes the dialogue) · Y brings the panel in front of you / hides it ·
// trigger uses what the ray points at · grip takes what the hand touches · right stick: turn (sideways), and up/down
// moves through a dialogue's answers (A or the trigger chooses).
import * as THREE from "three/webgpu";
import type { Panel } from "./manos.ts";
import { empujaFuera } from "./vr-paredes.ts";
/** The hands (manos.ts) as the view hands them over: loaded on entering (`cargar`), then mounted. */
export type ManosXR = { cargar(): Promise<unknown>; montar(p: THREE.Object3D | null): void; update(c: THREE.Camera | null): void; andar?(): [number, number] | null };

export const SNAP_DEG = 30;
export const DEADZONE = 0.2;
/** How long a note stays in front of you (ms). */
export const NOTA_MS = 3500;
/** t_ab71cff0: the stick's intention is only trusted this long after the last XR frame (a hidden session has none). */
export const INTENCION_CADUCA_MS = 1000;
/** «Salir de VR»: the second press must come within this long of the first (ms). */
export const SALIR_CONFIRMA_MS = 3000;

type XRLike = { isSessionSupported(mode: string): Promise<boolean>; requestSession(mode: string, init?: object): Promise<any> };
const xrOf = (): XRLike | null => (typeof navigator !== "undefined" && (navigator as unknown as { xr?: XRLike }).xr) || null;

/** True only when this device can run an immersive-vr session. Never throws. */
export async function vrSupported(): Promise<boolean> {
  const xr = xrOf();
  if (!xr) return false;
  try { return await xr.isSessionSupported("immersive-vr"); } catch { return false; }
}

export type VRState = "off" | "on";
export type VRHooks = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  manos?: ManosXR;
  onChange?: (state: VRState) => void;
};
/** A conversation as the dialogue panel shows it. */
export type DialogoVR = { nombre: string; texto: string; opciones: string[] };

/** Stick value after dead zone, rescaled so it starts at 0. */
export function deadzone(v: number): number {
  const a = Math.abs(v);
  return a < DEADZONE ? 0 : Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

/** MVL1: the comfort vignette's steps, cycled by the wrist/panel «Ajustes» button — never a free dial in VR
 * (a slider needs a ray dragged steadily, which room-scale users rarely have); three named stops are enough. */
export const NIVELES_CONFORT = [0.3, 0.6, 1] as const;
export const NOMBRES_CONFORT = ["bajo", "medio", "alto"] as const;
/** The next comfort value after the current one, wrapping back to the first (pure: no THREE, no DOM). */
export function siguienteConfort(actual: number): number {
  const i = NIVELES_CONFORT.findIndex((v) => Math.abs(v - actual) < 1e-6);
  return NIVELES_CONFORT[(i < 0 ? 0 : i + 1) % NIVELES_CONFORT.length];
}
/** The comfort value's name for the panel («bajo/medio/alto»), the nearest step if it was set to anything else. */
export function nombreConfort(v: number): string {
  let mejor = 0, dist = Infinity;
  NIVELES_CONFORT.forEach((n, i) => { const d = Math.abs(n - v); if (d < dist) { dist = d; mejor = i; } });
  return NOMBRES_CONFORT[mejor];
}

/** Words into lines of at most `max` characters (no word is cut unless it alone is longer). */
export function envolver(texto: string, max: number): string[] {
  const out: string[] = [];
  let l = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    if (!l) l = w;
    else if (l.length + 1 + w.length <= max) l += " " + w;
    else { out.push(l); l = w; }
    while (l.length > max) { out.push(l.slice(0, max)); l = l.slice(max); }
  }
  if (l) out.push(l);
  return out;
}

/** A canvas on a plane (text panels). */
function lienzo(w: number, hgt: number, ancho: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = hgt;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, (ancho * hgt) / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  malla.renderOrder = 20;
  return { c, g, tex, malla };
}

export function createVR(h: VRHooks) {
  const rig = new THREE.Group(); // the player's floor: follows the avatar, turns in snaps
  rig.visible = false;
  h.scene.add(rig);

  // comfort vignette: a dark ring stuck to the eyes, only visible while moving/turning
  const vc = document.createElement("canvas"); vc.width = vc.height = 128;
  const g = vc.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  );
  vignette.position.set(0, 0, -0.15);
  vignette.renderOrder = 999;
  vignette.frustumCulled = false;

  // the panel: what you are doing (the followed quest) and how the session goes. Y brings it in front of you.
  const P = lienzo(640, 400, 0.72);
  const panel = P.malla;
  panel.position.set(-0.55, 1.35, -1.0);
  panel.rotation.y = 0.45;
  rig.add(panel);
  let panelText = "", panelDelante = false, pagina: "mision" | "mandos" | "ajustes" = "mandos";
  function setPanel(lines: string[]): void {
    const t = lines.join("\n");
    if (t === panelText) return; // nothing changed: no texture upload
    panelText = t;
    const pg = P.g;
    pg.clearRect(0, 0, 640, 400);
    pg.fillStyle = "rgba(20,30,40,0.88)"; pg.fillRect(0, 0, 640, 400);
    let y = 48;
    lines.slice(0, 8).forEach((l, i) => {
      pg.fillStyle = i === 0 ? "#ffd27a" : l.startsWith("✓") ? "#9fd8a0" : "#ffffff";
      pg.font = i === 0 ? "bold 32px sans-serif" : "26px sans-serif";
      for (const s of envolver(l, i === 0 ? 34 : 42).slice(0, 2)) { if (y < 392) pg.fillText(s, 22, y); y += i === 0 ? 40 : 34; }
      y += 4;
    });
    P.tex.needsUpdate = true;
  }

  // «Salir de VR» (motor-vr t_ad0fe9c3, Pablo: «tendría que poder salir hacia afuera con un botón»): a button under
  // the panel, pointed at with the ray of a controller or a hand and pressed (trigger / pinch) twice — the first
  // press asks, the second within SALIR_CONFIRMA_MS leaves — so a stray pinch never throws you out of the world.
  const S = lienzo(384, 88, 0.3);
  const salirMalla = S.malla;
  salirMalla.position.set(0, -0.31, 0.005);
  panel.add(salirMalla);
  let salirEncimaEn = 0, salirPideHasta = 0, salirPintado = "";
  function pintarSalir(): void {
    const ahora = performance.now(), encimaYa = ahora - salirEncimaEn < 120, pide = ahora < salirPideHasta;
    const firma = `${encimaYa}|${pide}`;
    if (firma === salirPintado) return;
    salirPintado = firma;
    const sg = S.g;
    sg.clearRect(0, 0, 384, 88);
    sg.fillStyle = pide ? "#e07a5f" : encimaYa ? "#ffd27a" : "rgba(20,30,40,0.9)"; sg.fillRect(0, 0, 384, 88);
    sg.strokeStyle = "#ffd27a"; sg.lineWidth = 4; sg.strokeRect(2, 2, 380, 84);
    sg.fillStyle = pide || encimaYa ? "#1a2430" : "#ffffff"; sg.font = "bold 34px sans-serif"; sg.textAlign = "center";
    sg.fillText(pide ? "¿Salir? Pulsa otra vez" : "Salir de VR", 192, 56);
    sg.textAlign = "start";
    S.tex.needsUpdate = true;
  }
  pintarSalir();
  const panelSalir: Panel = {
    malla: salirMalla,
    fila() { return 1; },
    encima() { salirEncimaEn = performance.now(); pintarSalir(); },
    pulsar() {
      if (performance.now() < salirPideHasta) { salirPideHasta = 0; pintarSalir(); void exit(); return; }
      salirPideHasta = performance.now() + SALIR_CONFIRMA_MS; pintarSalir();
    },
  };
  // MVL1 (Pablo: «no he visto los ajustes dentro del visor»): the panel's third page («Y» cycles mandos → misión →
  // ajustes → hidden) shows the comfort vignette's current step and a button under it, same spot as «Salir de VR»
  // would sit on other pages, pointed at and pressed to cycle bajo/medio/alto — a wrist-reachable VR-native entry
  // into a real engine setting, without a server round trip (the comfort vignette is pure client preference,
  // the same as `comfort` below): no slider, since dragging a ray steadily is hard room-scale (§4 FISICAS-CAMARA-
  // AJUSTES-MAPA.md, 16:9 panel's «Controles» tab is the flat-screen twin of this one value).
  const AJ = lienzo(384, 88, 0.3);
  const ajusteMalla = AJ.malla;
  ajusteMalla.position.set(0, -0.31, 0.005);
  panel.add(ajusteMalla);
  ajusteMalla.visible = false;
  let ajusteEncimaEn = 0, ajustePintado = "";
  function pintarAjuste(): void {
    if (pagina !== "ajustes") return;
    const encimaYa = performance.now() - ajusteEncimaEn < 120;
    const firma = `${encimaYa}|${comfort}`;
    if (firma === ajustePintado) return;
    ajustePintado = firma;
    const ag = AJ.g;
    ag.clearRect(0, 0, 384, 88);
    ag.fillStyle = encimaYa ? "#ffd27a" : "rgba(20,30,40,0.9)"; ag.fillRect(0, 0, 384, 88);
    ag.strokeStyle = "#ffd27a"; ag.lineWidth = 4; ag.strokeRect(2, 2, 380, 84);
    ag.fillStyle = encimaYa ? "#1a2430" : "#ffffff"; ag.font = "bold 30px sans-serif"; ag.textAlign = "center";
    ag.fillText(`Confort: ${nombreConfort(comfort)} (pulsa)`, 192, 56);
    ag.textAlign = "start";
    AJ.tex.needsUpdate = true;
  }
  const panelAjuste: Panel = {
    malla: ajusteMalla,
    fila() { return 1; },
    encima() { ajusteEncimaEn = performance.now(); pintarAjuste(); },
    pulsar() { comfort = siguienteConfort(comfort); ajustePintado = ""; pintarAjuste(); },
  };
  // the dialogue panel: who talks, what they say, and up to four answers you point at (or move to with the stick)
  const D = lienzo(1024, 680, 1.15);
  const dialogoMalla = D.malla;
  dialogoMalla.visible = false;
  rig.add(dialogoMalla);
  let dialogo: DialogoVR | null = null, encima = 0, dibujado = "";
  const FILA0 = 420, FILA_H = 62; // canvas px where the answers start, and each answer's height
  function pintarDialogo(): void {
    const d = dialogo;
    if (!d) return;
    const firma = JSON.stringify([d, encima]);
    if (firma === dibujado) return;
    dibujado = firma;
    const dg = D.g;
    dg.clearRect(0, 0, 1024, 680);
    dg.fillStyle = "rgba(20,30,40,0.92)"; dg.fillRect(0, 0, 1024, 680);
    dg.fillStyle = "#ffd27a"; dg.font = "bold 40px sans-serif"; dg.fillText(d.nombre.slice(0, 40), 32, 60);
    dg.fillStyle = "#ffffff"; dg.font = "32px sans-serif";
    envolver(d.texto, 56).slice(0, 8).forEach((l, i) => dg.fillText(l, 32, 112 + i * 40));
    d.opciones.slice(0, 4).forEach((o, i) => {
      const y = FILA0 + i * FILA_H, sel = encima === i + 1;
      dg.fillStyle = sel ? "#ffd27a" : "rgba(255,255,255,0.12)"; dg.fillRect(24, y, 976, FILA_H - 8);
      dg.fillStyle = sel ? "#1a2430" : "#ffffff"; dg.font = "bold 30px sans-serif";
      dg.fillText(`${i + 1}. ${o}`.slice(0, 60), 40, y + 38);
    });
    dg.fillStyle = "rgba(255,255,255,0.6)"; dg.font = "24px sans-serif";
    dg.fillText("Apunta y aprieta el gatillo · B: salir", 32, 664);
    D.tex.needsUpdate = true;
  }
  const panelDialogo: Panel = {
    malla: dialogoMalla,
    fila(uv) { const y = (1 - uv.y) * 680, n = Math.floor((y - FILA0) / FILA_H) + 1; return dialogo && n >= 1 && n <= dialogo.opciones.length && y >= FILA0 ? n : 0; },
    encima(n) { if (n !== encima) { encima = n; pintarDialogo(); } },
  };
  const delante = (m: THREE.Object3D, dist: number, abajo: number) => { // put a panel in front of the eyes, facing them
    const cam = h.renderer.xr.getCamera();
    const ojo = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), dir = new THREE.Vector3();
    cam.getWorldDirection(dir); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const p = ojo.clone().addScaledVector(dir, dist); p.y -= abajo;
    rig.worldToLocal(p); m.position.copy(p);
    const mira = ojo.clone(); mira.y -= abajo; rig.worldToLocal(mira);
    m.lookAt(rig.localToWorld(mira.clone()));
  };

  // a note in front of you for a few seconds (quest steps done, «get closer», …)
  const N = lienzo(768, 112, 0.62);
  const nota = N.malla; nota.visible = false; nota.position.set(0, -0.22, -0.9); (nota.material as THREE.MeshBasicMaterial).depthTest = false;
  let notaHasta = 0, notaTexto = "";

  // N1c: room-scale walking (the player's real steps) moves the head INSIDE the rig via the headset's own
  // tracking — the sim never sees it (only the stick feeds `step()`), so until now a real step walked the
  // eye straight through a column or wall. `empuje` is the correction accumulated so far, applied on top
  // of the sim's `self` position every frame (that position keeps getting reset by the stick/server each
  // tick, so the push must be re-added, not stored on self).
  let cajas: Float32Array | null = null;
  let empujeX = 0, empujeZ = 0, chocaHasta = 0;
  const cabeza = new THREE.Vector3();

  let state: VRState = "off";
  let session: any = null;
  let comfort = 0.8; // 0 = off, 1 = strongest
  let moveX = 0, moveZ = 0, turnLatched = false, yawSteps = 0, strength = 0, navLatched = false;
  let ultimoFotograma = 0; // performance.now() of the last update(): axes() goes stale after INTENCION_CADUCA_MS
  // J2: A (right) or X (left) = jump, like Hyperfy2's A; a press waits here until the page's next tick takes it
  let jumpWanted = false;
  const held = { left: [false, false, false], right: [false, false, false] }; // [A/X, B/Y, -] last frame
  const dir = new THREE.Vector3();
  const set = (s: VRState) => { if (s !== state) { state = s; h.onChange?.(s); } };
  const oyentes = { elegir: new Set<(n: number) => void>(), atras: new Set<() => void>() };

  let lastError = ""; // why the last enter() failed (T1 report)
  async function enter(): Promise<boolean> {
    const xr = xrOf();
    if (!xr || session) return false;
    try { session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] }); } catch (e) { lastError = String((e as Error)?.message ?? e).slice(0, 160); session = null; return false; }
    h.renderer.xr.enabled = true;
    h.renderer.xr.setReferenceSpaceType("local-floor");
    await h.renderer.xr.setSession(session);
    await h.manos?.cargar().catch(() => {}); // after requestSession (it needs the click's activation); prefetched by the view
    rig.add(h.camera);
    h.camera.add(vignette, nota);
    h.manos?.montar(rig);
    rig.visible = true;
    pagina = "mandos"; panel.visible = true; panelDelante = false; // the first thing you see: how the controllers work
    ajusteMalla.visible = false; salirMalla.visible = true;
    session.addEventListener("end", () => {
      session = null; moveX = moveZ = 0; strength = 0;
      h.camera.remove(vignette, nota); rig.remove(h.camera); rig.visible = false;
      h.manos?.montar(null);
      h.renderer.xr.enabled = false;
      set("off");
    });
    // t_ab71cff0: a controller that falls asleep (Quest hands over to tracked hands) or a session that stops being
    // visible must not leave its last push behind as the intention; the next frame recomputes it from what is there
    session.addEventListener("inputsourceschange", () => { moveX = moveZ = 0; });
    session.addEventListener("visibilitychange", () => { moveX = moveZ = 0; });
    set("on");
    return true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting; `self` is where the avatar is (metres; J2: the floor rises with its jumps). */
  function update(self: { x: number; z: number; y?: number } | null, dtSeconds: number): void {
    if (!session) return;
    ultimoFotograma = performance.now();
    if (self) rig.position.set(self.x + empujeX, self.y ?? 0, self.z + empujeZ);
    let lx = 0, ly = 0, rx = 0, ry = 0;
    const visible = (session.visibilityState ?? "visible") === "visible"; // blurred/hidden: the system owns the input
    for (const src of visible ? session.inputSources ?? [] : []) {
      const a = src.gamepad?.axes;
      if (!a || src.hand || a.length < 2) continue; // a tracked hand has no stick: it must not zero the controller's
      const sx = a.length > 3 ? a[2] : a[0], sy = a.length > 3 ? a[3] : a[1];
      if (src.handedness === "left") { lx = deadzone(sx ?? 0); ly = deadzone(sy ?? 0); }
      else if (src.handedness === "right") { rx = deadzone(sx ?? 0); ry = deadzone(sy ?? 0); }
      if ((src.handedness === "left" || src.handedness === "right") && !src.hand) { // xr-standard: buttons[4] = A/X, [5] = B/Y
        const hs = held[src.handedness as "left" | "right"], b = src.gamepad.buttons ?? [];
        const ax = !!b[4]?.pressed, by = !!b[5]?.pressed;
        if (ax && !hs[0]) {
          if (dialogo && encima) for (const f of oyentes.elegir) f(encima); // A/X chooses the answer you are on
          else jumpWanted = true;
        }
        if (by && !hs[1]) {
          if (src.handedness === "right") for (const f of oyentes.atras) f();             // B: back
          else if (!panel.visible || !panelDelante) { panel.visible = true; panelDelante = true; pagina = "mision"; delante(panel, 0.8, 0.2); } // Y: the quest in front…
          else if (pagina === "mision") pagina = "mandos";                                  // …then the controls…
          else if (pagina === "mandos") { pagina = "ajustes"; ajustePintado = ""; pintarAjuste(); } // …then ajustes (MVL1)…
          else panel.visible = false;                                                         // …then away
          ajusteMalla.visible = pagina === "ajustes" && panel.visible;
          salirMalla.visible = pagina !== "ajustes" && panel.visible;
        }
        hs[0] = ax; hs[1] = by;
      }
    }
    // a dialogue open: the right stick up/down moves through its answers (not a turn)
    if (dialogo && Math.abs(ry) > 0.6) {
      if (!navLatched) { navLatched = true; const n = dialogo.opciones.length; encima = Math.max(1, Math.min(n, (encima || 0) + (ry > 0 ? 1 : -1))); pintarDialogo(); }
    } else if (Math.abs(ry) <= 0.6) navLatched = false;
    // snap turn: one step per push, re-armed when the stick returns to the middle
    let turned = false;
    if (Math.abs(rx) > 0.6) {
      if (!turnLatched) { turnLatched = true; yawSteps += rx > 0 ? -1 : 1; rig.rotation.y = yawSteps * (SNAP_DEG * Math.PI) / 180; turned = true; }
    } else turnLatched = false;
    // movement in the direction the head looks (flattened), stick up = forward.
    // The XR camera (h.renderer.xr.getCamera()) is only refreshed by three.js's own updateCamera()
    // call inside renderer.render(), which runs AFTER this update() this frame: reading it here would
    // use last frame's rig rotation, so right after a snap turn (rig.rotation.y just changed above)
    // the move direction would lag — and since snap turn is a single instant step, a player who turns
    // then immediately pushes the stick can walk a step or more in the stale (pre-turn) direction.
    // Force both updates now, with THIS frame's rig rotation already applied, before reading direction.
    rig.updateMatrixWorld(true);
    h.renderer.xr.updateCamera(h.camera);
    const xrCam = h.renderer.xr.getCamera();
    // N1c: the real head position now (room-scale walking moved it inside the rig, outside the sim's
    // knowledge) — push it back out of any solid it stepped into, on top of this frame's rig position.
    if (self && cajas) {
      cabeza.setFromMatrixPosition(xrCam.matrixWorld);
      const [dx, dz] = empujaFuera(cabeza.x, cabeza.z, self.y ?? 0, cajas);
      if (dx || dz) {
        empujeX += dx; empujeZ += dz;
        rig.position.x += dx; rig.position.z += dz;
        rig.updateMatrixWorld(true);
        h.renderer.xr.updateCamera(h.camera); // re-read the pose from the now-pushed rig before using it below
        chocaHasta = performance.now() + 220; // the dark pulse that tells you the wall stopped you
      }
    }
    xrCam.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / len, fz = dir.z / len;
    moveX = fx * -ly + -fz * lx;
    moveZ = fz * -ly + fx * lx;
    const conMano = visible && !lx && !ly ? h.manos?.andar?.() : null; // tracked hands: pinch and hold in the air = walk where that hand points
    if (conMano) { moveX = conMano[0] * 0.7; moveZ = conMano[1] * 0.7; } // walking pace (the edge, 0.9, runs)
    const m = Math.hypot(moveX, moveZ);
    if (m > 1) { moveX /= m; moveZ /= m; }
    // vignette fades in fast while moving or turning, out slowly; a wall push forces it fully dark for an
    // instant regardless of the comfort setting (safety feedback, not a comfort option)
    const want = (m > 0 || turned ? 1 : 0) * comfort;
    strength += (want - strength) * Math.min(1, dtSeconds * (want > strength ? 12 : 3));
    if (performance.now() < chocaHasta) strength = 1;
    (vignette.material as THREE.MeshBasicMaterial).opacity = strength;
    if (nota.visible && performance.now() > notaHasta) nota.visible = false;
    h.manos?.update(h.renderer.xr.getCamera());
    if (panel.visible) { pintarSalir(); pintarAjuste(); } // the highlight fades once the ray leaves; «¿Salir?» goes back after SALIR_CONFIRMA_MS
  }

  return {
    enter, exit, update, setPanel,
    get state() { return state; },
    get lastError() { return lastError; },
    get active() { return state === "on"; },
    /** N1c: the world's solid boxes in metres (same array `view.solidos()` converts, e.g. `cajasM` in
     * index.ts): room-scale walking into one now pushes the head back out instead of passing through. */
    paredes(b: Float32Array | null): void { cajas = b && b.length ? b : null; },
    /** Movement intention in the world frame, each -1..1. Zero when no XR frame ran lately: a real Quest stops the
     * session's frames while it is hidden (headset off the head), and the page's tick must not keep the last push. */
    axes(): [number, number] { return performance.now() - ultimoFotograma > INTENCION_CADUCA_MS ? [0, 0] : [moveX, moveZ]; },
    /** J2: true once per press of A or X since the last call (the page asks on each tick). */
    takeJump(): boolean { const j = jumpWanted; jumpWanted = false; return j; },
    get comfort() { return comfort; },
    set comfort(v: number) { comfort = Math.max(0, Math.min(1, v)); },
    get yawDegrees() { return yawSteps * SNAP_DEG; },
    get vignetteOpacity() { return strength; },
    /** What the panel shows now: the quest or the controls (Y goes quest → controls → hidden). */
    get pagina() { return pagina; },
    /** The rig (your floor in the world): where held things and hands live. */
    rig,
    /** Show a conversation in front of you (null closes it). Answers arrive through onElegir. */
    dialogo(d: DialogoVR | null): void {
      const abria = !dialogo;
      dialogo = d; dibujado = "";
      if (!d) { dialogoMalla.visible = false; encima = 0; return; }
      if (encima > d.opciones.length) encima = 0;
      pintarDialogo();
      if (abria && session) delante(dialogoMalla, 1.15, 0.12);
      dialogoMalla.visible = !!session;
    },
    /** The panel the hands may point at (manos.ts asks for it). */
    paneles(): Panel[] { const out: Panel[] = dialogo && dialogoMalla.visible ? [panelDialogo] : []; if (panel.visible) out.push(pagina === "ajustes" ? panelAjuste : panelSalir); return out; },
    /** For checks: where the «Salir de VR» button sits in the world (null while the panel is hidden), and whether it asks. */
    salirMundo(): { x: number; y: number; z: number; pide: boolean } | null {
      if (!session || !panel.visible) return null;
      salirMalla.updateMatrixWorld(true);
      const q = new THREE.Vector3().setFromMatrixPosition(salirMalla.matrixWorld);
      return { x: q.x, y: q.y, z: q.z, pide: performance.now() < salirPideHasta };
    },
    onElegir(fn: (n: number) => void): () => void { oyentes.elegir.add(fn); return () => oyentes.elegir.delete(fn); },
    onAtras(fn: () => void): () => void { oyentes.atras.add(fn); return () => oyentes.atras.delete(fn); },
    /** A short note in front of you for NOTA_MS. */
    nota(texto: string): void {
      if (!texto) return;
      notaTexto = texto; notaHasta = performance.now() + NOTA_MS;
      const ng = N.g;
      ng.clearRect(0, 0, 768, 112);
      ng.fillStyle = "rgba(20,30,40,0.9)"; ng.fillRect(0, 0, 768, 112);
      ng.fillStyle = "#ffd27a"; ng.font = "bold 30px sans-serif";
      envolver(texto, 44).slice(0, 2).forEach((l, i) => ng.fillText(l, 20, 46 + i * 40));
      N.tex.needsUpdate = true;
      nota.visible = !!session;
    },
    /** For checks: the dialogue's answer under the ray or the stick, the note shown, where the answer n sits in the world. */
    estadoPaneles() { return { dialogo: !!dialogo && dialogoMalla.visible, encima, nota: nota.visible ? notaTexto : "", panel: panel.visible, panelTexto: panelText }; },
    filaMundo(n: number): { x: number; y: number; z: number } | null {
      if (!dialogo || !dialogoMalla.visible || n < 1 || n > dialogo.opciones.length) return null;
      const w = 1.15, hgt = (w * 680) / 1024, py = FILA0 + (n - 1) * FILA_H + (FILA_H - 8) / 2;
      dialogoMalla.updateMatrixWorld();
      const p = new THREE.Vector3(0, hgt / 2 - (py / 680) * hgt, 0.001).applyMatrix4(dialogoMalla.matrixWorld);
      return { x: p.x, y: p.y, z: p.z };
    },
  };
}
