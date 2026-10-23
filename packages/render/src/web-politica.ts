// web (N17), the pure half: distances, the iframe's sandbox and permissions, and whether a solid box of the world stands
// between the camera and a screen. No three.js here, so the unit tests read it without a GPU or a DOM.
/** Within this distance (m) a screen shows the live page (outside XR). */
export const VER_IFRAME_M = 16;
/** Past this distance the iframe is removed (its page stops running): phones stay cool. */
export const QUITAR_IFRAME_M = 32;
/** The page's width in CSS pixels on a screen (its height follows the screen's proportion). */
export const PX_ANCHO = 1280;
/** What the iframe may do: run its own page and forms, open links in a new tab; never navigate this page, never
 * reach the parent (it is another origin: allow-same-origin keeps its own cookies, not ours). */
/** A video screen's player may autoplay (muted), go full screen and decode protected video; nothing else more than any screen. */
export const PERMISOS_VIDEO = "autoplay; fullscreen; encrypted-media; picture-in-picture; camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; payment 'none'; xr-spatial-tracking 'none'; clipboard-read 'none'";
export const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";
/** Permissions Policy for the iframe: none of these, ever. */
export const PERMISOS = "camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; payment 'none'; xr-spatial-tracking 'none'; clipboard-read 'none'";

/** Does the segment a→b (shortened by 0.3 m at b) cross any box of `cajas` (6 numbers per box: x0 y0 z0 x1 y1 z1)? */
export function tapadoPorCajas(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, cajas: ArrayLike<number>): boolean {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 0.5) return false;
  const tMax = 1 - 0.3 / len, o = [a.x, a.y, a.z];
  for (let k = 0; k + 5 < cajas.length; k += 6) {
    let t0 = 0, t1 = tMax, fuera = false;
    for (let i = 0; i < 3 && !fuera; i++) {
      const lo = cajas[k + i], hi = cajas[k + 3 + i];
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) fuera = true; continue; }
      let ta = (lo - o[i]) / d[i], tb = (hi - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) fuera = true;
    }
    if (!fuera) return true;
  }
  return false;
}

