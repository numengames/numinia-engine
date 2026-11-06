// marca-mirada (P15): the ONE ring that shows which thing «E: …» is about, so on a table with several things you see which one the
// prompt means. A thing gets a small amber ring that faces the camera, as big as the thing (the caller sizes it); a person gets a ring
// lying on the floor at their feet (`suelo`), so it never covers them.
// Cheap by construction: ONE mesh, ONE geometry and ONE material, all made the first time something is offered (a world where
// nothing is ever near makes nothing), reused for every thing after; moving it assigns numbers, never objects. It does not
// animate (no pulsing: nothing for «reduce motion» to turn off, nothing that asks for frames) and it is hidden when nothing is offered.
import * as THREE from "three/webgpu";

export const MARCA_COLOR = 0xEFA517;       // --n-ambar, the house emphasis
export const MARCA_GROSOR = 0.14;          // ring thickness as a share of its radius
export type Marca = { x: number; y: number; z: number; r: number; /** lying flat on the floor (a person's feet) instead of facing the camera */ suelo?: boolean };
const RAD = Math.PI / 180;
const _v = new THREE.Vector3(), _e = new THREE.Euler();
/** Where the middle of a placed model really is: the middle measured on the model alone (its sphere's centre, before scale and turn), scaled and
 * turned like the thing (`Thing` keeps degrees, Euler order YXZ as `placeGroup` sets it) and moved to its place. The ring sits there, not at the
 * origin: a piece whose origin is not its middle (the v4 kitchen's knife, board and vegetables: origin at the board) is ringed round what it is. */
export function centroEnMundo(cen: { x: number; y: number; z: number }, t: { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number }): { x: number; y: number; z: number } {
  _v.set(cen.x * t.sx, cen.y * t.sy, cen.z * t.sz).applyEuler(_e.set(t.rx * RAD, t.ry * RAD, t.rz * RAD, "YXZ"));
  return { x: t.x + _v.x, y: t.y + _v.y, z: t.z + _v.z };
}
const PLANO = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // the ring is born facing +z; this lays it on the floor, face up

export function createMarcaMirada(o: { world: THREE.Object3D; camera: THREE.Camera }) {
  let malla: THREE.Mesh | null = null;
  let suelo = false;                        // lying on the floor (true) or facing the camera
  let pendiente = false;                    // changed and not drawn yet: the power policy must draw one more frame
  const crear = (): THREE.Mesh => {
    const geo = new THREE.RingGeometry(1 - MARCA_GROSOR, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color: MARCA_COLOR, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 12; m.frustumCulled = false; m.visible = false; m.name = "marca-mirada";
    o.world.add(m);
    return m;
  };
  return {
    /** Mark a thing (centre in metres, radius `r`), or `null` to take the mark away. Same place again = nothing to do. */
    poner(p: Marca | null): void {
      if (!p) { if (malla?.visible) { malla.visible = false; pendiente = true; } return; }
      malla ??= crear();
      const q = malla.position;
      const s = p.suelo === true;
      if (malla.visible && q.x === p.x && q.y === p.y && q.z === p.z && malla.scale.x === p.r && suelo === s) return;
      q.set(p.x, p.y, p.z); malla.scale.setScalar(p.r); suelo = s; malla.visible = true; pendiente = true;
    },
    /** Once per frame: turn the ring to face the camera (or lay it flat). Nothing to do while nothing is marked. */
    update(): void {
      pendiente = false;
      if (malla?.visible) malla.quaternion.copy(suelo ? PLANO : o.camera.quaternion);
    },
    busy(): boolean { return pendiente; },
    /** For checks: is it drawn, where, and how many meshes ever existed (never more than 1). */
    estado(): { visible: boolean; x: number; y: number; z: number; r: number; suelo: boolean; mallas: number } {
      return { visible: !!malla?.visible, x: malla?.position.x ?? 0, y: malla?.position.y ?? 0, z: malla?.position.z ?? 0, r: malla?.scale.x ?? 0, suelo, mallas: malla ? 1 : 0 };
    },
  };
}
