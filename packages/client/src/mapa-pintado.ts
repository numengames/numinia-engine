// mapa-pintado (Map v2.2): the big map and the minimap are a PAINTED old map, not a photo. The top-down render of the zone
// (view.cenital) is only the INPUT: this turns it into a few flat tones of the house palette (STD-023 §1–2) with a soft ink
// line where two tones meet, and no texture. Pure (no DOM, no three.js): numbers in, numbers out, tested in Node.
//
// How it avoids pixels at any zoom: the picture is first reduced to a CLASS per pixel (ground / three land tones / water),
// each class becomes a soft mask (blurred), and `pintarVentana` samples those masks at whatever resolution the screen needs
// (bilinear) and keeps the strongest class — the borders come out as smooth curves, the ink line as a line of constant
// width on screen. The page asks for the window it is looking at, at the resolution it is looking at it, and asks again
// (debounced) when the view changes; nothing is ever stretched from a small bitmap.
export type RGB = readonly [number, number, number];
export type Paleta = { papel: RGB; tonos: readonly [RGB, RGB, RGB]; agua: RGB; tinta: RGB; tintaA: number };

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Diurno: Arena paper, Veiled Arena as the middle tone, Bronce ink; a pale Turquesa wash for water. Nocturno: Noche/Basalto. */
export const PALETAS: Readonly<Record<"pintado" | "pintado-noche", Paleta>> = {
  pintado: { papel: hex("#F9EBDC"), tonos: [hex("#EBDCC8"), hex("#D6C6B3"), hex("#B5A594")], agua: hex("#B7D9D8"), tinta: hex("#3A332D"), tintaA: 0.72 },
  "pintado-noche": { papel: hex("#14110F"), tonos: [hex("#1E1A17"), hex("#292420"), hex("#3A332D")], agua: hex("#0C3A42"), tinta: hex("#C4B5A6"), tintaA: 0.55 },
};

const N = 5; // classes: 0 ground (paper), 1..3 land tones (light → dark), 4 water

export type Preparado = { px: number; masks: Float32Array[]; relleno: number };

/** Box blur of one channel (edge-replicating), in place via `tmp`. */
function difuminar(a: Float32Array, tmp: Float32Array, px: number, r: number): void {
  const w = 2 * r + 1;
  for (let y = 0; y < px; y++) { // horizontal
    const o = y * px; let s = 0;
    for (let i = -r; i <= r; i++) s += a[o + Math.min(px - 1, Math.max(0, i))];
    for (let x = 0; x < px; x++) { tmp[o + x] = s / w; s += a[o + Math.min(px - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < px; x++) { // vertical
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(px - 1, Math.max(0, i)) * px + x];
    for (let y = 0; y < px; y++) { a[y * px + x] = s / w; s += tmp[Math.min(px - 1, y + r + 1) * px + x] - tmp[Math.max(0, y - r) * px + x]; }
  }
}

/** The colour of the ground, from the picture's `fondo` («rgb(r,g,b)» or «#rrggbb»); null when it cannot be read. */
export function leerFondo(f: string | undefined): RGB | null {
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(f ?? "");
  if (m) return [+m[1], +m[2], +m[3]];
  return f && /^#[0-9a-f]{6}$/i.test(f) ? hex(f) : null;
}

/** The soft masks of a top-down picture (`px` × `px` RGBA, rows from the top). Done once per picture. */
export function preparar(rgba: ArrayLike<number>, px: number, fondo: RGB | null): Preparado {
  const n = px * px, tmp = new Float32Array(n);
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { ch[0][i] = rgba[i * 4]; ch[1][i] = rgba[i * 4 + 1]; ch[2][i] = rgba[i * 4 + 2]; }
  const r1 = Math.max(1, Math.round(px / 256)); // a first blur takes the detail out (bricks, planks, grass)
  for (const c of ch) { difuminar(c, tmp, px, r1); difuminar(c, tmp, px, r1); }
  const clase = new Uint8Array(n), hist = new Uint32Array(256);
  let tierra = 0;
  for (let i = 0; i < n; i++) {
    const r = ch[0][i], g = ch[1][i], b = ch[2][i];
    if (rgba[i * 4 + 3] < 8 || (fondo && Math.max(Math.abs(r - fondo[0]), Math.abs(g - fondo[1]), Math.abs(b - fondo[2])) < 22)) { clase[i] = 0; continue; }
    if (b > r + 18 && g > r + 8) { clase[i] = 4; continue; }
    clase[i] = 255; // land: the tone is set below, from the picture's own lightness
    hist[Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)))]++; tierra++;
  }
  let t1 = 85, t2 = 170; // lightness quantiles of the land: a third each
  if (tierra > 0) {
    let acc = 0; t1 = -1; t2 = -1;
    for (let l = 0; l < 256; l++) { acc += hist[l]; if (t1 < 0 && acc >= tierra / 3) t1 = l; if (t2 < 0 && acc >= (2 * tierra) / 3) { t2 = l; break; } }
  }
  for (let i = 0; i < n; i++) {
    if (clase[i] !== 255) continue;
    const l = Math.round(0.2126 * ch[0][i] + 0.7152 * ch[1][i] + 0.0722 * ch[2][i]);
    clase[i] = l > t2 ? 1 : l > t1 ? 2 : 3; // the lightest third is the lightest tone
  }
  const rm = Math.max(2, Math.round(px / 170)), p2 = px + 2; // the masks' blur; each mask is padded by one pixel of «ground»
  const masks: Float32Array[] = [];
  for (let k = 0; k < N; k++) {
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = clase[i] === k ? 1 : 0;
    for (let p = 0; p < 3; p++) difuminar(m, tmp, px, rm);
    const pad = new Float32Array(p2 * p2).fill(k === 0 ? 1 : 0);
    for (let y = 0; y < px; y++) pad.set(m.subarray(y * px, y * px + px), (y + 1) * p2 + 1);
    masks.push(pad);
  }
  return { px, masks, relleno: Math.sqrt(rm * (rm + 1)) };
}

export type Ventana = { u0: number; v0: number; u1: number; v1: number }; // in the prepared picture's pixels (0..px), v down

/** Paint a window of the prepared picture at W × H output pixels (RGBA, rows from the top). `tintaPx` = the ink line's
 * half-width in output pixels (about 1 for a hairline). Cost: W × H × 5 samples; the page keeps it under ~1.5 M pixels. */
export function pintarVentana(p: Preparado, v: Ventana, W: number, H: number, pal: Paleta, tintaPx = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4), p2 = p.px + 2, m = p.masks;
  const colores: RGB[] = [pal.papel, pal.tonos[0], pal.tonos[1], pal.tonos[2], pal.agua];
  const salidaPorFuente = W / Math.max(1e-6, v.u1 - v.u0); // output pixels per picture pixel
  const ancho = Math.max(0.02, Math.min(0.6, tintaPx / salidaPorFuente / (1.25 * p.relleno))); // margin that counts as «on the line»
  const xi = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = v.u0 + ((x + 0.5) / W) * (v.u1 - v.u0) - 0.5, f = Math.floor(u);
    xi[x] = Math.max(-1, Math.min(p.px - 1, f)) + 1; xf[x] = f < -1 || f > p.px - 1 ? 0 : u - f; // +1: the padding; far outside = pure padding
  }
  const s = new Float64Array(N);
  for (let y = 0; y < H; y++) {
    const vv = v.v0 + ((y + 0.5) / H) * (v.v1 - v.v0) - 0.5, fy = Math.floor(vv);
    const yi = Math.max(-1, Math.min(p.px - 1, fy)) + 1, yf = fy < -1 || fy > p.px - 1 ? 0 : vv - fy, o0 = yi * p2, o1 = Math.min(p2 - 1, yi + 1) * p2;
    for (let x = 0; x < W; x++) {
      const i0 = xi[x], i1 = Math.min(p2 - 1, i0 + 1), fx = xf[x];
      let best = 0, bv = -1, sv = -1;
      for (let k = 0; k < N; k++) {
        const a = m[k], top = a[o0 + i0] + (a[o0 + i1] - a[o0 + i0]) * fx, bot = a[o1 + i0] + (a[o1 + i1] - a[o1 + i0]) * fx, val = top + (bot - top) * yf;
        s[k] = val;
        if (val > bv) { sv = bv; bv = val; best = k; } else if (val > sv) sv = val;
      }
      const marg = bv - sv; // 0 on a border, 1 deep inside a region
      let a = 1 - marg / ancho; a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a); a *= pal.tintaA; // smoothstep
      const c = colores[best], o = (y * W + x) * 4;
      out[o] = c[0] + (pal.tinta[0] - c[0]) * a; out[o + 1] = c[1] + (pal.tinta[1] - c[1]) * a; out[o + 2] = c[2] + (pal.tinta[2] - c[2]) * a; out[o + 3] = 255;
    }
  }
  return out;
}

/** Which window of the picture a view sees, and at what size to paint it: the visible part (plus a quarter around it, so a short
 * drag shows no gap), at the screen's own resolution, capped so a phone never paints more than `tope` pixels on a side. */
export function ventanaDeVista(img: { x0: number; z0: number; x1: number; z1: number; px: number }, vis: { x0: number; z0: number; x1: number; z1: number }, escala: number, dpr: number, tope: number): { ventana: Ventana; w: number; h: number; mundo: { x0: number; z0: number; x1: number; z1: number } } {
  const mx = (vis.x1 - vis.x0) * 0.25, mz = (vis.z1 - vis.z0) * 0.25;
  const x0 = vis.x0 - mx, x1 = vis.x1 + mx, z0 = vis.z0 - mz, z1 = vis.z1 + mz;
  let w = Math.max(16, Math.round((x1 - x0) * escala * dpr)), h = Math.max(16, Math.round((z1 - z0) * escala * dpr));
  const k = Math.min(1, tope / Math.max(w, h)); w = Math.max(16, Math.round(w * k)); h = Math.max(16, Math.round(h * k));
  const sx = img.px / (img.x1 - img.x0), sz = img.px / (img.z1 - img.z0);
  return { ventana: { u0: (x0 - img.x0) * sx, v0: (z0 - img.z0) * sz, u1: (x1 - img.x0) * sx, v1: (z1 - img.z0) * sz }, w, h, mundo: { x0, z0, x1, z1 } };
}
