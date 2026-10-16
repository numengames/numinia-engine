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
/** The hands (manos.ts) as the view hands them over: loaded on entering (`cargar`), then mounted. */
export type ManosXR = { cargar(): Promise<unknown>; montar(p: THREE.Object3D | null): void; update(c: THREE.Camera | null): void };

export const SNAP_DEG = 30;
export const DEADZONE = 0.2;
/** How long a note stays in front of you (ms). */
export const NOTA_MS = 3500;

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
  let panelText = "", panelDelante = false;
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

  let state: VRState = "off";
  let session: any = null;
  let comfort = 0.8; // 0 = off, 1 = strongest
  let moveX = 0, moveZ = 0, turnLatched = false, yawSteps = 0, strength = 0, navLatched = false;
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
    session.addEventListener("end", () => {
      session = null; moveX = moveZ = 0; strength = 0;
      h.camera.remove(vignette, nota); rig.remove(h.camera); rig.visible = false;
      h.manos?.montar(null);
      h.renderer.xr.enabled = false;
      set("off");
    });
    set("on");
    return true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting; `self` is where the avatar is (metres; J2: the floor rises with its jumps). */
  function update(self: { x: number; z: number; y?: number } | null, dtSeconds: number): void {
    if (!session) return;
    if (self) rig.position.set(self.x, self.y ?? 0, self.z);
    let lx = 0, ly = 0, rx = 0, ry = 0;
    for (const src of session.inputSources ?? []) {
      const a = src.gamepad?.axes;
      if (!a) continue;
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
          else if (panel.visible && panelDelante) { panel.visible = false; }               // Y: hide the panel…
          else { panel.visible = true; panelDelante = true; delante(panel, 0.8, 0.2); }   // …or bring it in front
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
    // movement in the direction the head looks (flattened), stick up = forward
    h.renderer.xr.getCamera().getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / len, fz = dir.z / len;
    moveX = fx * -ly + -fz * lx;
    moveZ = fz * -ly + fx * lx;
    const m = Math.hypot(moveX, moveZ);
    if (m > 1) { moveX /= m; moveZ /= m; }
    // vignette fades in fast while moving or turning, out slowly
    const want = (m > 0 || turned ? 1 : 0) * comfort;
    strength += (want - strength) * Math.min(1, dtSeconds * (want > strength ? 12 : 3));
    (vignette.material as THREE.MeshBasicMaterial).opacity = strength;
    if (nota.visible && performance.now() > notaHasta) nota.visible = false;
    h.manos?.update(h.renderer.xr.getCamera());
  }

  return {
    enter, exit, update, setPanel,
    get state() { return state; },
    get lastError() { return lastError; },
    get active() { return state === "on"; },
    /** Movement intention in the world frame, each -1..1. */
    axes(): [number, number] { return [moveX, moveZ]; },
    /** J2: true once per press of A or X since the last call (the page asks on each tick). */
    takeJump(): boolean { const j = jumpWanted; jumpWanted = false; return j; },
    get comfort() { return comfort; },
    set comfort(v: number) { comfort = Math.max(0, Math.min(1, v)); },
    get yawDegrees() { return yawSteps * SNAP_DEG; },
    get vignetteOpacity() { return strength; },
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
    paneles(): Panel[] { return dialogo && dialogoMalla.visible ? [panelDialogo] : []; },
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
