// hitos (R5.3): the engine's landmark pillars (index.ts: 24 boxes 1×3×1 in three rings, gold/blue/red/green "so movement is
// visible" on the flat ground) dressed as machinery while a world has the nature on: brass, verdigris, copper and ash posts
// (paleta.ts HITOS, same order as the engine's colours) seated on the relief instead of floating/buried at y = 1.5. Worlds
// without nature never call this and keep the engine's colours. `vestirHitos` returns the undo: colour, metalness, roughness
// and height come back exactly as they were when the nature goes off (or is rebuilt for another tier).
//
// Costs nothing to draw: the same 24 meshes and materials, only their colour and position change once at build time (no
// per-frame work, no new draw call, no triangle). Visibility is not touched (the environment's `hitos: false` still hides them).
import type * as THREE from "three/webgpu";
import { HITOS } from "./paleta.ts";

/** How deep a post goes into the ground below the lowest corner of its footprint (m): reads as planted, never floating. */
export const HUNDIDO = 0.35;
/** Metal look of the posts (MeshStandardMaterial): a little metal, matte, so the env light reads as worn bronze, not chrome. */
export const METAL = { metalness: 0.1, roughness: 0.82 } as const;

type Mat = { color: THREE.Color; metalness?: number; roughness?: number };

/** Dress every pillar; returns the function that puts them back. `alturaEn` = the terrain's height (terreno.ts). */
export function vestirHitos(hitos: Iterable<THREE.Object3D>, alturaEn: (x: number, z: number) => number): () => void {
  const antes: { o: THREE.Object3D; m: Mat; color: number; metalness?: number; roughness?: number; y: number }[] = [];
  let i = 0;
  for (const o of hitos) {
    const m = (o as THREE.Mesh).material as unknown as Mat | Mat[] | undefined;
    if (!m || Array.isArray(m) || !m.color) { i++; continue; }
    antes.push({ o, m, color: m.color.getHex(), metalness: m.metalness, roughness: m.roughness, y: o.position.y });
    m.color.setHex(HITOS[i % HITOS.length]);
    if (m.metalness !== undefined) m.metalness = METAL.metalness;
    if (m.roughness !== undefined) m.roughness = METAL.roughness;
    // seat it: half height above the lowest corner of its footprint (box 1×3×1 centred on its position, scale respected), minus HUNDIDO
    const { x, z } = o.position, sx = 0.5 * o.scale.x, sz = 0.5 * o.scale.z, mitad = 1.5 * o.scale.y;
    const suelo = Math.min(alturaEn(x - sx, z - sz), alturaEn(x + sx, z - sz), alturaEn(x - sx, z + sz), alturaEn(x + sx, z + sz), alturaEn(x, z));
    o.position.y = suelo + mitad - HUNDIDO;
    o.updateMatrix(); o.updateMatrixWorld(true);
    i++;
  }
  return () => {
    for (const a of antes) {
      a.m.color.setHex(a.color);
      if (a.metalness !== undefined) a.m.metalness = a.metalness;
      if (a.roughness !== undefined) a.m.roughness = a.roughness;
      a.o.position.y = a.y; a.o.updateMatrix(); a.o.updateMatrixWorld(true);
    }
    antes.length = 0;
  };
}
