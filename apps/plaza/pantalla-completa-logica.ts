// pantalla-completa-logica: when «Watch full screen» is offered, with no DOM so node:test can run it (test/pantalla-completa.test.ts).
// Seated, and a 3D video screen that shows something right now (a share or a playing video) within reach and roughly in front of the seat.
import { PANTALLA_CERCA_M } from "./pantalla-logica.ts";
import type { Pantalla } from "./pantalla-logica.ts";

/** A seat looks at its screen; this far off its facing (degrees, either side) a screen still counts as «in front». */
export const FRENTE_GRADOS = 60;
export type Sentado = { x: number; z: number; mira: number }; // `mira` = the seat's yaw in degrees, forward = (sin, cos) on (x, z) like features/asiento

/** The screen to offer, or null: the nearest of `mostrando` within `max` m and within FRENTE_GRADOS of where the seat looks. Not seated, or in VR (no DOM full screen there) → null. */
export function pantallaParaVer(sentado: Sentado | null, mostrando: readonly Pantalla[], o: { vr?: boolean; max?: number } = {}): Pantalla | null {
  if (!sentado || o.vr) return null;
  const a = (sentado.mira * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a), max = o.max ?? PANTALLA_CERCA_M;
  let mejor: Pantalla | null = null, mejorD = Infinity;
  for (const p of mostrando) {
    const dx = p.x - sentado.x, dz = p.z - sentado.z, d = Math.hypot(dx, dz);
    if (d > max || d >= mejorD) continue;
    if (d > 0.01 && (dx * fx + dz * fz) / d < Math.cos((FRENTE_GRADOS * Math.PI) / 180)) continue; // behind or beside
    mejor = p; mejorD = d;
  }
  return mejor;
}
