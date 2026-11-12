// caminos (pure part): the glowing paths a world lays on its floor (entorno.json `caminos`). Decoding the flat text the
// entorno carries, the strips' geometry and what each device tier draws. No three.js here: tested alone (test/caminos.test.ts).
import type { Nivel } from "./calidad.ts";

/** One path: from (x, z) to (x, z), metres. */
export type Camino = { desde: [number, number]; hasta: [number, number] };
/** Wire format of the flat field `caminos`: "x1,z1,x2,z2;x1,z1,x2,z2" (metres, up to 2 decimals). Empty = none. */
export const CAMINOS_MAX = 14;
export const LARGO_MAX_M = 2000;

/** Decode the flat text. Bad pieces are skipped (the file's checker, features/entorno/esquema.ts, already said why). */
export function decodificarCaminos(texto: unknown): Camino[] {
  if (typeof texto !== "string" || !texto) return [];
  const out: Camino[] = [];
  for (const trozo of texto.split(";")) {
    const p = trozo.split(",").map(Number);
    if (p.length !== 4 || !p.every(Number.isFinite)) continue;
    if (Math.hypot(p[2] - p[0], p[3] - p[1]) < 0.5) continue;
    out.push({ desde: [p[0], p[1]], hasta: [p[2], p[3]] });
    if (out.length >= CAMINOS_MAX) break;
  }
  return out;
}

/** What a tier draws. `animado` = the pulse runs (A, desktop). Quest in XR (B) and phones (C, D) get the same strip with the pulse
 * frozen: no frame is spent on it (principle 2); D is a plain thinner line. */
export type DetalleCaminos = { animado: boolean; pulsos: boolean; ancho: number };
export const DETALLE_CAMINOS: Record<Nivel, DetalleCaminos> = {
  A: { animado: true, pulsos: true, ancho: 0.5 },
  B: { animado: false, pulsos: true, ancho: 0.4 },
  C: { animado: false, pulsos: true, ancho: 0.4 },
  D: { animado: false, pulsos: false, ancho: 0.3 },
};
export const detalleCaminos = (n: Nivel): DetalleCaminos => ({ ...DETALLE_CAMINOS[n] });

/** Metres between the starts of two pulses, and how fast they run (m/s). */
export const PULSO_CADA_M = 6, PULSO_VEL = 2.5;
/** Keep drawing frames only while the player is within this many metres of a path (so a far plaza costs nothing). */
export const ANIMAR_HASTA_M = 90;
/** Height over the floor (m): enough not to fight with it, low enough to look painted. */
export const ALTURA_M = 0.06;

/** One mesh for every path: per path a flat strip (2 triangles). `posicion` x,y,z · `a` = [metres along the path, across −1…1]. */
export function geometriaCaminos(caminos: Camino[], ancho: number): { posicion: Float32Array; a: Float32Array; indices: Uint16Array } {
  const n = caminos.length, posicion = new Float32Array(n * 4 * 3), a = new Float32Array(n * 4 * 2), indices = new Uint16Array(n * 6);
  caminos.forEach((c, i) => {
    const dx = c.hasta[0] - c.desde[0], dz = c.hasta[1] - c.desde[1], largo = Math.hypot(dx, dz) || 1;
    const nx = (-dz / largo) * ancho / 2, nz = (dx / largo) * ancho / 2;
    const v = [[c.desde[0] + nx, c.desde[1] + nz, 0, 1], [c.desde[0] - nx, c.desde[1] - nz, 0, -1], [c.hasta[0] + nx, c.hasta[1] + nz, largo, 1], [c.hasta[0] - nx, c.hasta[1] - nz, largo, -1]];
    v.forEach((p, k) => { const o = (i * 4 + k); posicion.set([p[0], ALTURA_M, p[1]], o * 3); a.set([p[2], p[3]], o * 2); });
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
  });
  return { posicion, a, indices };
}

/** Is any path within `hasta` metres of (x, z)? (distance to the segment) */
export function cercaDeCamino(caminos: Camino[], x: number, z: number, hasta = ANIMAR_HASTA_M): boolean {
  for (const c of caminos) {
    const dx = c.hasta[0] - c.desde[0], dz = c.hasta[1] - c.desde[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - c.desde[0]) * dx + (z - c.desde[1]) * dz) / l2));
    if (Math.hypot(x - (c.desde[0] + t * dx), z - (c.desde[1] + t * dz)) <= hasta) return true;
  }
  return false;
}
