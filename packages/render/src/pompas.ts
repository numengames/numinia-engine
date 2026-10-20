// pompas (condiciones/c5): a person who is still reading the world's norms is drawn inside a translucent bubble, so everybody
// else sees that they have just arrived and cannot answer yet (the server does not relay their voice nor let anything push them).
// The cheapest thing that reads as a bubble: ONE shared sphere geometry and ONE shared flat material (unlit, alpha, no depth
// write: no shader of our own, no refraction, no second pass), one draw call per person who is reading and in sight, at most
// POMPAS_DIBUJADAS of them. The text over it («leyendo las normas…») is the existing name plate (nombres.ts `leyendo`).
// When they accept the bubble bursts: ~⅓ s of growing and fading on a copy of the material that exists only for that burst.
import * as THREE from "three/webgpu";

export type Target = number;
export const POMPA_RADIO_M = 1.0;       // the capsule is 1.7 m tall: 1 m of radius wraps it with a hand to spare
export const POMPA_OPACIDAD = 0.3;
export const POMPA_COLOR = 0xb8f0f8;
export const POMPA_ESTALLIDO_MS = 340;
export const POMPAS_DIBUJADAS = 24;     // at most this many bubbles drawn at once (draw calls on phones); a world rarely has more than a few at a time
export const POMPA_SOBRE_M = 0.22;      // the name plate over a bubble sits this much higher so the text clears the sphere's top

export function createPompas(o: { world: THREE.Object3D; avatarOf: (t: Target) => THREE.Object3D | undefined }) {
  let geo: THREE.SphereGeometry | null = null, mat: THREE.MeshBasicMaterial | null = null; // shared, made with the first bubble
  const vivas = new Map<Target, THREE.Mesh>();                       // reading now
  const estallando = new Map<Target, { mesh: THREE.Mesh; desde: number }>(); // accepted: bursting
  let pendiente = false; // something changed and has not been placed yet (the power policy must draw one more frame)

  const compartido = () => {
    geo ??= new THREE.SphereGeometry(1, 20, 14);
    mat ??= new THREE.MeshBasicMaterial({ color: POMPA_COLOR, transparent: true, opacity: POMPA_OPACIDAD, depthWrite: false });
    return { geo, mat };
  };
  const quitar = (m: THREE.Mesh) => { o.world.remove(m); }; // geometry and the shared material stay; a burst's own copy is freed in `fin`
  const fin = (t: Target) => {
    const e = estallando.get(t); if (!e) return;
    quitar(e.mesh); (e.mesh.material as THREE.Material).dispose(); estallando.delete(t);
  };

  return {
    /** This avatar starts (`true`) or stops (`false`) reading the norms. Stopping bursts the bubble; a bubble that was never drawn just goes. */
    poner(t: Target, leyendo: boolean, now: number): void {
      if (leyendo) {
        fin(t);
        if (vivas.has(t)) return;
        const { geo: g, mat: m } = compartido();
        const mesh = new THREE.Mesh(g, m);
        mesh.renderOrder = 10; mesh.visible = false; mesh.frustumCulled = true; // placed by the next update
        o.world.add(mesh); vivas.set(t, mesh); pendiente = true;
        return;
      }
      const mesh = vivas.get(t); if (!mesh) return;
      vivas.delete(t);
      if (!mesh.visible || !mat) { quitar(mesh); return; } // nobody saw it: no burst to play
      const propio = mat.clone(); propio.depthWrite = false;
      mesh.material = propio; fin(t);
      estallando.set(t, { mesh, desde: now }); pendiente = true;
    },
    /** Follow the avatars and play the bursts. Called once per frame. */
    update(now: number): void {
      pendiente = false;
      let n = 0;
      for (const [t, mesh] of vivas) {
        const a = o.avatarOf(t);
        if (!a || n >= POMPAS_DIBUJADAS) { mesh.visible = false; continue; }
        n++;
        mesh.visible = true;
        mesh.position.set(a.position.x, a.position.y + 0.05, a.position.z); // the capsule's centre is 0.85 m over the feet: the sphere's centre sits at 0.9 m
        mesh.scale.setScalar(POMPA_RADIO_M);
      }
      for (const [t, e] of estallando) {
        const p = (now - e.desde) / POMPA_ESTALLIDO_MS;
        if (p >= 1) { fin(t); continue; }
        e.mesh.scale.setScalar(POMPA_RADIO_M * (1 + 0.55 * p));
        (e.mesh.material as THREE.MeshBasicMaterial).opacity = POMPA_OPACIDAD * (1 - p) ** 1.5;
        const a = o.avatarOf(t); if (a) e.mesh.position.set(a.position.x, a.position.y + 0.05, a.position.z);
      }
    },
    /** A change is waiting to be drawn, or a burst is playing: the power policy must keep drawing. A bubble that stands still asks for nothing. */
    busy(): boolean { return pendiente || estallando.size > 0; },
    /** Does this avatar have its bubble now? (placed and drawn) */
    estado(t: Target): "no" | "leyendo" | "estallando" { return estallando.has(t) ? "estallando" : vivas.has(t) ? "leyendo" : "no"; },
    /** For checks: who is inside a bubble, whether it is drawn now, and who is bursting. */
    lista(): { target: Target; drawn: boolean; estallando: boolean }[] {
      return [...[...vivas].map(([target, m]) => ({ target, drawn: m.visible, estallando: false })), ...[...estallando].map(([target, e]) => ({ target, drawn: e.mesh.visible, estallando: true }))];
    },
    /** For checks: how many geometries and materials the bubbles share (always one of each: that is the point). */
    compartidos(): { geometrias: number; materiales: number; mallas: number } {
      return { geometrias: geo ? 1 : 0, materiales: mat ? 1 : 0, mallas: vivas.size + estallando.size };
    },
  };
}
