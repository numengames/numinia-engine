// aros (ia-visible S5): a green ring on the floor under every AI, seen from afar without reading anything. Same trick as
// pompas.ts: ONE shared ring geometry and ONE flat unlit material per state (active, asleep), no shader of our own, no second pass.
// The meshes are pooled: at most `max()` are drawn at once (the nearest to the camera), a ring that leaves goes back to the pool,
// and a world without AIs makes nothing at all (no geometry, no material, no mesh, nothing to update).
import * as THREE from "three/webgpu";
import { estiloAro, escalaAro, type EstadoIA } from "./ia-marca.ts";

export type Target = number;
export const ARO_RADIO_INT_M = 0.45, ARO_RADIO_EXT_M = 0.68;  // the capsule is 0.5 m wide; the ring wraps the feet with a hand to spare
export const ARO_SOBRE_SUELO_M = 0.03;                        // a hair over the floor (no flicker against it)
const PIES_M = 0.85;                                           // the capsule's centre is this high over the feet (nombres.ts `top`)

export function createAros(o: { world: THREE.Object3D; avatarOf: (t: Target) => THREE.Object3D | undefined; camera: THREE.Camera; max: () => number }) {
  let geo: THREE.RingGeometry | null = null;
  const mats = new Map<EstadoIA, THREE.MeshBasicMaterial>();       // shared, made when first needed
  const vivas = new Map<Target, EstadoIA>();                        // AIs in the world now (ring wanted)
  const mallas = new Map<Target, THREE.Mesh>();                     // rings drawn now (a subset of vivas, at most max())
  const libres: THREE.Mesh[] = [];                                  // the pool: meshes that are not on a floor
  const cam = new THREE.Vector3();
  let pendiente = false;                                            // something changed and has not been placed yet (the power policy must draw one more frame)

  const material = (e: EstadoIA): THREE.MeshBasicMaterial => {
    let m = mats.get(e);
    if (!m) {
      const est = estiloAro(e);
      m = new THREE.MeshBasicMaterial({ color: est.color, transparent: true, opacity: est.opacidad, depthWrite: false, side: THREE.DoubleSide });
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; // wins against a floor at the same height
      mats.set(e, m);
    }
    return m;
  };
  const tomar = (e: EstadoIA): THREE.Mesh => {
    const m = libres.pop() ?? (() => {
      geo ??= new THREE.RingGeometry(ARO_RADIO_INT_M, ARO_RADIO_EXT_M, 40).rotateX(-Math.PI / 2);
      const n = new THREE.Mesh(geo, material(e));
      n.renderOrder = 9; n.frustumCulled = true;
      return n;
    })();
    m.material = material(e);
    o.world.add(m);
    return m;
  };
  const soltar = (t: Target) => { const m = mallas.get(t); if (!m) return; o.world.remove(m); libres.push(m); mallas.delete(t); };

  return {
    /** This avatar is an AI in this state (its ring is drawn), or a person again / gone (`null`: its ring goes back to the pool). */
    poner(t: Target, estado: EstadoIA | null): void {
      pendiente = true;
      if (estado === null) { vivas.delete(t); soltar(t); return; }
      vivas.set(t, estado);
      const m = mallas.get(t); if (m) m.material = material(estado);
    },
    /** Follow the avatars: the nearest `max()` AIs get a ring under their feet. Called once per frame; nothing to do when there are no AIs. */
    update(): void {
      pendiente = false;
      if (vivas.size === 0) return;
      o.camera.getWorldPosition(cam);
      const quedan: { t: Target; a: THREE.Object3D; d: number }[] = [];
      for (const [t] of vivas) {
        const a = o.avatarOf(t);
        if (!a) { soltar(t); continue; }
        quedan.push({ t, a, d: Math.hypot(a.position.x - cam.x, a.position.z - cam.z) });
      }
      quedan.sort((x, y) => x.d - y.d);
      const tope = Math.max(0, Math.floor(o.max()));
      quedan.forEach(({ t, a, d }, i) => {
        if (i >= tope) { soltar(t); return; }
        const e = vivas.get(t)!;
        const m = mallas.get(t) ?? (() => { const n = tomar(e); mallas.set(t, n); return n; })();
        m.position.set(a.position.x, a.position.y - PIES_M + ARO_SOBRE_SUELO_M, a.position.z);
        m.scale.setScalar(escalaAro(d));
        m.visible = true;
      });
    },
    /** A change is waiting to be drawn: the power policy must draw one more frame. A ring that stands still asks for nothing. */
    busy(): boolean { return pendiente; },
    /** For checks: who has a ring (and its state), whether it is drawn now, and how much the rings share. */
    lista(): { target: Target; estado: EstadoIA; drawn: boolean }[] {
      return [...vivas].map(([target, estado]) => ({ target, estado, drawn: mallas.has(target) }));
    },
    compartidos(): { geometrias: number; materiales: number; mallas: number; libres: number } {
      return { geometrias: geo ? 1 : 0, materiales: mats.size, mallas: mallas.size, libres: libres.length };
    },
  };
}
