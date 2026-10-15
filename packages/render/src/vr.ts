// VR session (J6): immersive-vr, a rig that follows the avatar, stick = movement intentions (left), snap turn in
// fixed steps (right stick), comfort vignette, controller rays/models and one readable 3D panel. render only
// reports intentions (`axes()` in -1..1, world frame); the sim decides where the avatar goes.
// Only offered where WebXR VR exists (Quest, Pico, desktop headsets); phones and iPhone never see the button.
import * as THREE from "three/webgpu";

export const SNAP_DEG = 30;
export const DEADZONE = 0.2;

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
  onChange?: (state: VRState) => void;
};

/** Stick value after dead zone, rescaled so it starts at 0. */
export function deadzone(v: number): number {
  const a = Math.abs(v);
  return a < DEADZONE ? 0 : Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
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

  // one 3D panel (stats): canvas text on a plane, left of the player at arm's length
  const pc = document.createElement("canvas"); pc.width = 512; pc.height = 256;
  const pg = pc.getContext("2d")!;
  const panelTex = new THREE.CanvasTexture(pc);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true }));
  panel.position.set(-0.7, 1.4, -1.2);
  panel.rotation.y = 0.5;
  rig.add(panel);
  let panelText = "";
  function setPanel(lines: string[]): void {
    const t = lines.join("\n");
    if (t === panelText) return; // nothing changed: no texture upload
    panelText = t;
    pg.fillStyle = "rgba(20,30,40,0.85)"; pg.fillRect(0, 0, 512, 256);
    pg.fillStyle = "#ffd27a"; pg.font = "bold 28px sans-serif";
    lines.slice(0, 6).forEach((l, i) => pg.fillText(l.slice(0, 34), 20, 48 + i * 40));
    panelTex.needsUpdate = true;
  }

  // controllers: a ray and a small body each, so the hands are visible
  for (let i = 0; i < 2; i++) {
    const c = h.renderer.xr.getController(i);
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    c.add(ray);
    rig.add(c);
    const grip = h.renderer.xr.getControllerGrip(i);
    grip.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0xe07a3f })));
    rig.add(grip);
  }

  let state: VRState = "off";
  let session: any = null;
  let comfort = 0.8; // 0 = off, 1 = strongest
  let moveX = 0, moveZ = 0, turnLatched = false, yawSteps = 0, strength = 0;
  const dir = new THREE.Vector3();
  const set = (s: VRState) => { if (s !== state) { state = s; h.onChange?.(s); } };

  async function enter(): Promise<boolean> {
    const xr = xrOf();
    if (!xr || session) return false;
    try { session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] }); } catch { session = null; return false; }
    h.renderer.xr.enabled = true;
    h.renderer.xr.setReferenceSpaceType("local-floor");
    await h.renderer.xr.setSession(session);
    rig.add(h.camera);
    h.camera.add(vignette);
    rig.visible = true;
    session.addEventListener("end", () => {
      session = null; moveX = moveZ = 0; strength = 0;
      h.camera.remove(vignette); rig.remove(h.camera); rig.visible = false;
      h.renderer.xr.enabled = false;
      set("off");
    });
    set("on");
    return true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting; `self` is where the avatar is (metres). */
  function update(self: { x: number; z: number } | null, dtSeconds: number): void {
    if (!session) return;
    if (self) rig.position.set(self.x, 0, self.z);
    let lx = 0, ly = 0, rx = 0;
    for (const src of session.inputSources ?? []) {
      const a = src.gamepad?.axes;
      if (!a) continue;
      const sx = a.length > 3 ? a[2] : a[0], sy = a.length > 3 ? a[3] : a[1];
      if (src.handedness === "left") { lx = deadzone(sx); ly = deadzone(sy); }
      else if (src.handedness === "right") rx = deadzone(sx);
    }
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
  }

  return {
    enter, exit, update, setPanel,
    get state() { return state; },
    get active() { return state === "on"; },
    /** Movement intention in the world frame, each -1..1. */
    axes(): [number, number] { return [moveX, moveZ]; },
    get comfort() { return comfort; },
    set comfort(v: number) { comfort = Math.max(0, Math.min(1, v)); },
    get yawDegrees() { return yawSteps * SNAP_DEG; },
    get vignetteOpacity() { return strength; },
  };
}
