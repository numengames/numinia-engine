// hitos (R6.1): the engine's landmark pillars (index.ts: 24 boxes 1×3×1 in three rings, gold/blue/red/green "so movement is
// visible" on the flat ground) are GONE while a world has the nature on: the relief, the trees and the Residuos already show
// movement, and the boxes read as toys on the meadow (Pablo, R6). R5.3 recoloured them; R6.1 hides them instead.
//
// Hidden = `visible` false, so the renderer skips them (no draw call, no triangle) and so do the top-down map (cenital.ts) and
// the AR miniature (ar.ts), which both skip invisible pillars. The environment (entorno.ts) writes `visible` on every apply
// (`hitos: false` hides them, and it re-applies on tier/quality changes); while hidden that write is only remembered, never
// shown, and the undo hands the pillars back with the environment's latest wish. Worlds without nature never call this and
// keep the engine's look. One-off work at build time: no per-frame cost.
import type * as THREE from "three/webgpu";

/** True while `ocultarHitos` holds this object hidden. */
export const estaOculto = (o: THREE.Object3D): boolean => Object.getOwnPropertyDescriptor(o, "visible")?.get !== undefined;

/** Hide every pillar while the nature is on; returns the function that gives them back exactly as the environment wants them. */
export function ocultarHitos(hitos: Iterable<THREE.Object3D>): () => void {
  const ocultos: { o: THREE.Object3D; quiere: boolean }[] = [];
  for (const o of hitos) {
    if (estaOculto(o)) continue; // already held by another build: its undo owns it
    const a = { o, quiere: o.visible };
    Object.defineProperty(o, "visible", {
      configurable: true, enumerable: true,
      get: () => false,
      set: (v: boolean) => { a.quiere = v; }, // the environment's hitos:true/false while the nature is on: kept for the undo
    });
    ocultos.push(a);
  }
  return () => {
    for (const a of ocultos) {
      delete (a.o as { visible?: boolean }).visible; // drop the accessor (configurable own property) ...
      a.o.visible = a.quiere;                          // ... and write the plain own property back, as Object3D made it
    }
    ocultos.length = 0;
  };
}
