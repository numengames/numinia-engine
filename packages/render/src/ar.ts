// AR session (J8): immersive-ar with a floor hit-test, a reticle, tap/trigger to place one object, anchors when
// the device has them. Only offered where WebXR AR exists (Android Chrome, Quest 3, Pico 4); iPhone has no
// WebXR AR, so nothing shows there and the game stays flat. The session ends by itself (phones must stay cool).
import * as THREE from "three/webgpu";

export const AR_MAX_MS = 90_000;

type XRLike = { isSessionSupported(mode: string): Promise<boolean>; requestSession(mode: string, init?: object): Promise<any> };
const xrOf = (): XRLike | null => (typeof navigator !== "undefined" && (navigator as unknown as { xr?: XRLike }).xr) || null;

/** True only when this device can run an immersive-ar session. Never throws. */
export async function arSupported(): Promise<boolean> {
  const xr = xrOf();
  if (!xr) return false;
  try { return await xr.isSessionSupported("immersive-ar"); } catch { return false; }
}

export type ARState = "off" | "searching" | "ready" | "placed";
export type ARHooks = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  /** Everything of the normal world: hidden (and background/fog removed) while the camera feed is the world. */
  world: THREE.Object3D;
  domOverlayRoot?: HTMLElement;
  maxMs?: number;
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
  const thing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.1, 0), new THREE.MeshStandardMaterial({ color: 0xe07a3f }));
  thing.matrixAutoUpdate = false;
  thing.visible = false;
  root.add(thing);
  root.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2));

  let state: ARState = "off";
  let session: any = null, source: any = null, anchor: any = null, timer: ReturnType<typeof setTimeout> | undefined;
  let savedBg: THREE.Scene["background"] = null, savedFog: THREE.Scene["fog"] = null;
  let hitMatrix: THREE.Matrix4 | null = null, lastHit: any = null;
  const set = (s: ARState) => { if (s !== state) { state = s; h.onChange?.(s); } };

  const place = () => {
    if (!hitMatrix) return;
    thing.matrix.copy(hitMatrix); thing.visible = true; set("placed");
    anchor = null;
    // an anchor keeps the object still while the device refines its idea of the floor; optional
    try { lastHit?.createAnchor?.()?.then((a: any) => { anchor = a; }).catch(() => {}); } catch { /* no anchors here */ }
  };

  async function enter(): Promise<boolean> {
    const xr = xrOf();
    if (!xr || session) return false;
    const init: Record<string, unknown> = { requiredFeatures: ["hit-test"], optionalFeatures: ["anchors", "local-floor"] };
    if (h.domOverlayRoot) { (init.optionalFeatures as string[]).push("dom-overlay"); init.domOverlay = { root: h.domOverlayRoot }; }
    try { session = await xr.requestSession("immersive-ar", init); } catch { session = null; return false; }
    h.renderer.xr.enabled = true;
    h.renderer.xr.setReferenceSpaceType("local");
    await h.renderer.xr.setSession(session);
    savedBg = h.scene.background; savedFog = h.scene.fog;
    h.scene.background = null; h.scene.fog = null; h.world.visible = false; root.visible = true;
    const viewer = await session.requestReferenceSpace("viewer");
    source = await session.requestHitTestSource({ space: viewer });
    session.addEventListener("select", place);
    session.addEventListener("end", () => {
      clearTimeout(timer);
      session = null; source = null; anchor = null; hitMatrix = null; lastHit = null;
      h.scene.background = savedBg; h.scene.fog = savedFog; h.world.visible = true; root.visible = false;
      reticle.visible = false; thing.visible = false; h.renderer.xr.enabled = false;
      set("off");
    });
    timer = setTimeout(() => { void exit(); }, h.maxMs ?? AR_MAX_MS);
    set("searching");
    return true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting. */
  function update(): void {
    const frame = h.renderer.xr.getFrame?.();
    const ref = h.renderer.xr.getReferenceSpace?.();
    if (!session || !frame || !ref) return;
    if (anchor) {
      const p = frame.getPose(anchor.anchorSpace, ref);
      if (p) thing.matrix.fromArray(p.transform.matrix);
    }
    const hits = source ? frame.getHitTestResults(source) : [];
    const pose = hits.length ? hits[0].getPose(ref) : null;
    if (pose) {
      lastHit = hits[0];
      hitMatrix = (hitMatrix ?? new THREE.Matrix4()).fromArray(pose.transform.matrix);
      reticle.matrix.copy(hitMatrix); reticle.visible = true;
      if (state === "searching") set("ready");
    } else { reticle.visible = false; hitMatrix = null; lastHit = null; }
  }

  return { enter, exit, update, get state() { return state; }, get placed() { return thing.visible; } };
}
