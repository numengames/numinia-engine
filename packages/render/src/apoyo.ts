// apoyo (rest): keep a thing's base on the ground while it turns in the constructor's gizmo. TransformControls
// (gizmo.ts) turns an object around its own origin — the group's position, which this engine always puts at the
// thing's base (see `bloque` in packages/agent/src/obra.ts: "apoyado en el suelo; su base queda en y"). A turn
// around any axis but Y swings the rest of a non-cubic box through that pivot, so part of it lands below the
// floor (or floats above it) once the turn is not a flat spin. Pure geometry, no three.js, so a non-cubic box
// can be checked with node --test (test/apoyo.test.ts) — same shape as encaje.ts in this same package.
export type Caja3 = [number, number, number, number, number, number]; // x0 y0 z0 x1 y1 z1: own axes, unscaled
type Trio = [number, number, number];

/** The lowest Y a thing's own box reaches once `escala` and `giro` (degrees, applied Y then X then Z — the same
 * "YXZ" order and convention as `transformarPuntos`, features/objetos/server.ts `cajaEnMundo`) are put on it,
 * with the group still at Y = 0. */
export function minYTrasGirar(caja: Caja3, escala: Trio, giro: Trio): number {
  const R = Math.PI / 180;
  const [cx, sx] = [Math.cos(giro[0] * R), Math.sin(giro[0] * R)];
  const [cy, sy] = [Math.cos(giro[1] * R), Math.sin(giro[1] * R)];
  const [cz, sz] = [Math.cos(giro[2] * R), Math.sin(giro[2] * R)];
  let min = Infinity;
  for (let i = 0; i < 8; i++) {
    let x = (i & 1 ? caja[3] : caja[0]) * escala[0];
    let y = (i & 2 ? caja[4] : caja[1]) * escala[1];
    let z = (i & 4 ? caja[5] : caja[2]) * escala[2];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    if (y < min) min = y;
  }
  return min;
}

/** Where a thing's group must sit (world Y) so its box's lowest point lands exactly on `sueloY` once `giro` is
 * applied: what the gizmo sets after every rotate step, so a turn never sinks the base into the floor (or lifts
 * it off whatever it was resting on). */
export function yParaApoyar(caja: Caja3, escala: Trio, giro: Trio, sueloY: number): number {
  return sueloY - minYTrasGirar(caja, escala, giro);
}
