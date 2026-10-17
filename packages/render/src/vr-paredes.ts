// vr-paredes (N1c): pure arithmetic for "se atraviesan las paredes" — room-scale walking (the headset's
// own tracking) moves the head INSIDE the rig without the sim ever seeing it (only the stick feeds the
// sim's `step()`/`blocked()`), so a real step used to walk the eye straight through a column or wall.
// No DOM, no three.js: testable in Node like camara-orbita.ts.

export const CUERPO_RADIO_VR = 0.3; // m: a bit under the avatar's 0.35 (sim BODY_RADIUS) so standing still right at a wall does not jitter
export const CUERPO_ALTO_VR = 1.7;  // same as sim BODY_HEIGHT
export const PASO_SUBIDA_VR = 0.4;  // same as sim STEP_UP: a kerb low enough to step onto never pushes the head back

/** How far (x, z) must move to stand outside every solid box it is inside, given the feet are at `pieY`.
 * `cajas` is the world's solid boxes in metres ([x0,y0,z0,x1,y1,z1] each, same array `view.solidos()`
 * converts for the flat-screen camera, packages/render/src/camara.ts `paredes`). */
export function empujaFuera(px: number, pz: number, pieY: number, cajas: ArrayLike<number> | null): [number, number] {
  const b = cajas;
  if (!b) return [0, 0];
  let dx = 0, dz = 0;
  for (let o = 0; o + 5 < b.length; o += 6) {
    const x0 = b[o], y0 = b[o + 1], z0 = b[o + 2], x1 = b[o + 3], y1 = b[o + 4], z1 = b[o + 5];
    if (y1 <= pieY + PASO_SUBIDA_VR) continue; // low enough to step onto
    if (y0 >= pieY + CUERPO_ALTO_VR) continue; // above the head
    const cx = Math.max(x0, Math.min(px, x1)), cz = Math.max(z0, Math.min(pz, z1));
    const ddx = px - cx, ddz = pz - cz, d2 = ddx * ddx + ddz * ddz;
    if (d2 >= CUERPO_RADIO_VR * CUERPO_RADIO_VR) continue; // outside this box
    const d = Math.sqrt(d2);
    if (d > 1e-4) { const falta = CUERPO_RADIO_VR - d; dx += (ddx / d) * falta; dz += (ddz / d) * falta; continue; }
    // dead centre inside the box (walked straight through a thin one): push out the nearest face
    const aX0 = px - x0, aX1 = x1 - px, aZ0 = pz - z0, aZ1 = z1 - pz, m = Math.min(aX0, aX1, aZ0, aZ1);
    if (m === aX0) dx -= aX0 + CUERPO_RADIO_VR; else if (m === aX1) dx += aX1 + CUERPO_RADIO_VR;
    else if (m === aZ0) dz -= aZ0 + CUERPO_RADIO_VR; else dz += aZ1 + CUERPO_RADIO_VR;
  }
  return [dx, dz];
}
