// cuerpo-vr (t_8217ffea, N1 + N2 of the 18-10 recording): pure maths for «your own body in VR» and «hands that wear your avatar's skin».
// No three.js, no DOM: avatares.ts / manos.ts apply it, test/cuerpo-vr.test.ts runs it.
// The body is your avatar's own VRM (already worn, already skinned: +1 draw call, ~3 k triangles, no new file): in VR it is stood
// under the head, turned where the head looks, scaled so its neck meets your eyes, with the head and the two arms collapsed
// (the head is where the camera is; the arms would swing on their own clips next to your real hands, which manos.ts draws).

/** The head bone sits about this far under the eyes (m): a VRM's head joint is the neck-skull hinge, the eyes are in the face. */
export const OJOS_SOBRE_CABEZA_M = 0.09;
/** The body is stood this far behind the head (m) so the chest is not in front of the eyes when you lean. */
export const CUERPO_ATRAS_M = 0.1;
/** The avatar is scaled to your height inside these limits (a seated player or a child still gets a body that touches the floor). */
export const ESCALA_CUERPO = { min: 0.6, max: 1.5 } as const;
/** Looking steeper than this (the horizontal part of the gaze shorter than it) the head's own «up» tells where the body faces. */
export const MIRADA_VERTICAL = 0.35;

/** The XR camera's pose, plain numbers: where the eyes are, where they look (unit) and the head's up (unit). */
export type PoseCabeza = { x: number; y: number; z: number; fx: number; fy: number; fz: number; ux: number; uy: number; uz: number };
export type ColocacionCuerpo = { x: number; z: number; rumbo: number; escala: number };

/** Where the horizontal front of the body points (unit [x, z]) given the head: the gaze, or — looking steeply down or up, when the
 * gaze has no horizontal part to speak of — the top of the head (it points forward when you look down, backward when you look up).
 * null when the head is so odd that neither says anything (the caller keeps the last facing). */
export function frenteDeLaCabeza(p: PoseCabeza): [number, number] | null {
  let dx = p.fx, dz = p.fz;
  if (Math.hypot(dx, dz) < MIRADA_VERTICAL) { const s = p.fy < 0 ? 1 : -1; dx = p.ux * s; dz = p.uz * s; }
  const l = Math.hypot(dx, dz);
  return l < 1e-3 ? null : [dx / l, dz / l];
}

/** Where to stand the avatar's root, which way to turn it (three's rotation.y: its front is +Z) and how much to scale it so that
 * its head bone is under your eyes and its feet on the floor. `cabezaM` = the head bone's height over the root at rest (m);
 * `sueloY` = the world height of the avatar's root (its feet). null when the facing is unknown. */
export function colocarCuerpo(p: PoseCabeza, sueloY: number, cabezaM: number): ColocacionCuerpo | null {
  const f = frenteDeLaCabeza(p);
  if (!f || !(cabezaM > 0.2)) return null;
  const meta = p.y - OJOS_SOBRE_CABEZA_M - sueloY;
  const escala = Math.max(ESCALA_CUERPO.min, Math.min(ESCALA_CUERPO.max, meta / cabezaM));
  return { x: p.x - f[0] * CUERPO_ATRAS_M, z: p.z - f[1] * CUERPO_ATRAS_M, rumbo: Math.atan2(f[0], f[1]), escala };
}

/** The shortest turn from `a` to `b` (radians, -π..π). */
export function giroCorto(a: number, b: number): number { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
/** `actual` eased towards `meta` (the body follows the head, it does not snap to it): `k` per second, `dt` in seconds. */
export function seguirRumbo(actual: number, meta: number, dt: number, k = 12): number {
  return actual + giroCorto(actual, meta) * Math.min(1, Math.max(0, dt) * k);
}

/** The colour of a hand: the plain mean of RGB samples (0..255) packed 0xRRGGBB, or null with nothing to average. Samples come from
 * the avatar's own texture where its hand vertices are (avatares-vrm.ts `colorMano`), so the hands drawn in VR are the avatar's skin,
 * be it flesh, bone or steel. */
export function promedioColor(muestras: ArrayLike<number>): number | null {
  const n = Math.floor(muestras.length / 3);
  if (!n) return null;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < n; i++) { r += muestras[i * 3]; g += muestras[i * 3 + 1]; b += muestras[i * 3 + 2]; }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v / n)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/** A little deterministic circuit pattern for the skin's lights: polylines on a `tam` × `tam` grid, horizontal/vertical runs with 45° joints
 * and a node at each end. The same seed always gives the same traces (every headset draws the same skin). Returns [x0, y0, x1, y1] segments
 * and the node points. Nothing is drawn within `margen` of the top-left corner (the controller's plastic samples that texel). */
export function trazosCircuito(semilla: number, tam: number, lineas = 14, margen = 6): { segmentos: [number, number, number, number][]; nodos: [number, number][] } {
  let s = (semilla >>> 0) || 1;
  const azar = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const rejilla = Math.max(4, Math.floor(tam / 16));
  const segmentos: [number, number, number, number][] = [], nodos: [number, number][] = [];
  const dentro = (v: number) => Math.max(margen, Math.min(tam - margen, v));
  for (let i = 0; i < lineas; i++) {
    let x = dentro(Math.round(azar() * (tam / rejilla)) * rejilla), y = dentro(Math.round(azar() * (tam / rejilla)) * rejilla);
    nodos.push([x, y]);
    for (let k = 0; k < 3 + Math.floor(azar() * 3); k++) {
      const largo = (1 + Math.floor(azar() * 3)) * rejilla, dir = Math.floor(azar() * 4), diag = azar() < 0.3;
      const dx = dir === 0 ? largo : dir === 1 ? -largo : diag ? largo : 0, dy = dir === 2 ? largo : dir === 3 ? -largo : diag ? (dir === 0 ? largo : -largo) : 0;
      const nx = dentro(x + dx), ny = dentro(y + dy);
      if (nx === x && ny === y) continue;
      segmentos.push([x, y, nx, ny]); x = nx; y = ny;
    }
    nodos.push([x, y]);
  }
  return { segmentos, nodos };
}
