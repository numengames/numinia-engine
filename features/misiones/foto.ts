// misiones — the geometry of the step `foto` (P10). Pure: no state, no clock, no imports, so a test runs it as it is.
// A photo counts for a step when the CENTRE of the step's `objetivo` (a sphere: the corner to photograph) is inside the
// camera's view frustum (its real vertical fov and aspect), no further than the step's `distancia` from the camera, and
// nothing solid stands between them (the server asks the world's collision mesh; maquina.ts calls this and `tapado`).

/** The default of a step's `distancia`: how far from the camera (m) its objetivo's centre may be. */
export const FOTO_DISTANCIA_M = 8;
/** The most a step's `distancia` may say (m). */
export const FOTO_DISTANCIA_MAX_M = 60;
/** The least time between two photos of one player that the server looks at (ms). */
export const FOTO_CADA_MS = 1000;
/** The height of the eye over the feet (m): the camera's leash starts there (CAMARA.ojo, packages/render/src/camara-orbita.ts). */
export const FOTO_OJO_M = 1.6;
/** How far the photo camera may be from its player's eye (m). Photo mode keeps the camera's PIVOT within CAMARA.foto.alcance (12) of the
 * eye and the camera sits up to CAMARA.foto.lejos (14) back from the pivot, plus 2 m of slack for the server's own copy of the position
 * being a moment behind. features/ may not import render, so test/misiones-foto.test.ts pins these three numbers to CAMARA. */
export const FOTO_ALCANCE_M = 12, FOTO_LEJOS_M = 14, FOTO_MARGEN_M = 2;
export const FOTO_CAMARA_MAX_M = FOTO_ALCANCE_M + FOTO_LEJOS_M + FOTO_MARGEN_M;

/** Where the camera was (m), the unit vector it looked along, its vertical field of view (degrees) and width/height. */
export type PoseFoto = { x: number; y: number; z: number; fx: number; fy: number; fz: number; fov: number; aspecto: number };
/** The corner to photograph: a sphere (m). */
export type EsferaFoto = { x: number; y: number; z: number; radio: number };

/** Why a pose cannot be a camera's, in words for the player; null when it can. */
export function poseInvalida(p: PoseFoto): string | null {
  const v = [p.x, p.y, p.z, p.fx, p.fy, p.fz, p.fov, p.aspecto];
  if (!v.every((n) => typeof n === "number" && Number.isFinite(n))) return "La foto llegó incompleta: vuelva a hacerla.";
  const l = Math.hypot(p.fx, p.fy, p.fz);
  if (!(l > 0.9 && l < 1.1)) return "La foto llegó sin una dirección clara: vuelva a hacerla.";
  if (p.fov < 10 || p.fov > 120 || p.aspecto < 0.2 || p.aspecto > 5) return "La foto llegó con un encuadre imposible: vuelva a hacerla.";
  return null;
}

/** The distance from the camera (m) to the objetivo's centre when that centre is IN the shot — in front of the camera, inside the
 * frustum its fov and aspect make, and within `distancia` — or null when it is not. The camera never rolls (as the engine's): its
 * right is horizontal, so «up» is the world's. */
export function enEncuadre(pose: PoseFoto, o: EsferaFoto, distancia: number = FOTO_DISTANCIA_M): number | null {
  const l = Math.hypot(pose.fx, pose.fy, pose.fz);
  if (!(l > 0)) return null;
  const fx = pose.fx / l, fy = pose.fy / l, fz = pose.fz / l;
  const h = Math.hypot(fx, fz); // looking straight up or down: right is any horizontal, say +x
  const rx = h > 1e-6 ? -fz / h : 1, rz = h > 1e-6 ? fx / h : 0;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // up = right × forward
  const vx = o.x - pose.x, vy = o.y - pose.y, vz = o.z - pose.z;
  const d = Math.hypot(vx, vy, vz);
  if (d > distancia) return null;
  const z = vx * fx + vy * fy + vz * fz; // depth along the view
  if (!(z > 0.05)) return null; // behind the camera (or on it)
  const alto = Math.tan((pose.fov * Math.PI) / 360), ancho = alto * pose.aspecto; // half-extents at depth 1
  const x = vx * rx + vz * rz, y = vx * ux + vy * uy + vz * uz;
  return Math.abs(x) <= z * ancho && Math.abs(y) <= z * alto ? d : null;
}
