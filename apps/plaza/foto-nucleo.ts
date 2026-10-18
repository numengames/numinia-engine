// foto-nucleo (N13): the photo mode's arithmetic, pure (no DOM, no three.js) so Node tests it: the filters (colour
// matrices inside the house palette, the same numbers for the live preview — an SVG feColorMatrix — and for the
// saved PNG), the frame's layout, the file name, and the link that takes whoever opens it to where the photo was made
// (`#foto=x,y,z,rumbo,inclinacion,distancia` in the address: the camera's pivot in metres, its angles in degrees).

/** The house palette (tema.css, Nocturno; STD-023): the filters only ever mix toward these. */
export const PALETA = {
  fondo: [0x14, 0x11, 0x0f], texto: [0xf9, 0xeb, 0xdc], ambar: [0xef, 0xa5, 0x17], verdemar: [0xa6, 0xda, 0xd5], turquesa: [0x01, 0x8e, 0xa1],
} as const;

/** A colour matrix: 3 rows (r g b out) of 4 numbers (× r, × g, × b, + offset), all in 0..1 units. */
export type Matriz = readonly [readonly number[], readonly number[], readonly number[]];
export type Filtro = { id: string; nombre: string; describe: string; matriz: Matriz | null };

const LUMA = [0.2126, 0.7152, 0.0722];
const u = (c: readonly number[]) => c.map((v) => v / 255);
/** Luminance mapped from colour `a` (black) to colour `b` (white), then mixed with the original by `k` (1 = all duotone). */
function duotono(a: readonly number[], b: readonly number[], k: number): Matriz {
  const A = u(a), B = u(b);
  const fila = (c: number) => [0, 1, 2].map((j) => k * (B[c] - A[c]) * LUMA[j] + (1 - k) * (j === c ? 1 : 0)).concat(k * A[c]);
  return [fila(0), fila(1), fila(2)] as unknown as Matriz;
}

/** The filters, in the order of the buttons. «Natural» changes nothing. */
export const FILTROS: readonly Filtro[] = [
  { id: "natural", nombre: "Natural", describe: "La foto tal cual", matriz: null },
  { id: "ambar", nombre: "Ámbar", describe: "Cálida, de tarde: sombras de la noche de la casa, luces de ámbar", matriz: duotono(PALETA.fondo, mezcla(PALETA.ambar, PALETA.texto, 0.45), 0.7) },
  { id: "verdemar", nombre: "Verdemar", describe: "Fría, de madrugada: de la noche al verdemar", matriz: duotono(PALETA.fondo, PALETA.verdemar, 0.85) },
  { id: "tinta", nombre: "Tinta", describe: "Blanco y negro sobre papel", matriz: duotono(PALETA.fondo, PALETA.texto, 1) },
];
function mezcla(a: readonly number[], b: readonly number[], t: number): number[] { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

export function filtro(id: string | null | undefined): Filtro { return FILTROS.find((f) => f.id === id) ?? FILTROS[0]; }

/** The same matrix as SVG `feColorMatrix values` (4 rows of 5: the alpha row keeps alpha). */
export function valoresSvg(m: Matriz): string {
  const r = (n: number) => String(Math.round(n * 10000) / 10000);
  return [...m.map((f) => [f[0], f[1], f[2], 0, f[3]]), [0, 0, 0, 1, 0]].map((f) => f.map(r).join(" ")).join("  ");
}

/** Apply a matrix to RGBA bytes in place (alpha untouched). 0..255 in, clamped 0..255 out. */
export function aplicarMatriz(px: Uint8ClampedArray | Uint8Array, m: Matriz | null): void {
  if (!m) return;
  const [R, G, B] = m;
  const o0 = R[3] * 255, o1 = G[3] * 255, o2 = B[3] * 255;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    px[i] = R[0] * r + R[1] * g + R[2] * b + o0;
    px[i + 1] = G[0] * r + G[1] * g + G[2] * b + o1;
    px[i + 2] = B[0] * r + B[1] * g + B[2] * b + o2;
  }
}

/** The frame (inset, drawn over the picture so the live overlay is exactly what is saved): a thin border all round
 * and a band at the foot carrying the world's name. Pixels, for a picture `w` × `h`. */
export function marco(w: number, h: number): { borde: number; banda: number; letra: number; margen: number } {
  const corto = Math.min(w, h);
  const borde = Math.max(4, Math.round(corto * 0.022));
  const banda = Math.max(28, Math.round(corto * 0.1));
  return { borde, banda, letra: Math.round(banda * 0.46), margen: Math.round(banda * 0.38) };
}

/** A world's name fit for a file name: lower case, ASCII letters, digits and dashes (accents dropped). */
export function nombreArchivo(mundo: string, cuando: Date): string {
  const base = mundo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mundo";
  const d = (n: number) => String(n).padStart(2, "0");
  return `${base}-${cuando.getFullYear()}${d(cuando.getMonth() + 1)}${d(cuando.getDate())}-${d(cuando.getHours())}${d(cuando.getMinutes())}${d(cuando.getSeconds())}.png`;
}

/** Where a photo was made: the camera's pivot (m), its heading and tilt (radians, like the camera's `yaw()`/pitch) and distance. */
export type Sitio = { x: number; y: number; z: number; yaw: number; pitch: number; dist: number };
const LIMITE = 100_000; // metres: anything farther is not a place of a world
const G = Math.PI / 180;

/** The `#foto=` value of a place (decimetres and whole degrees: short, and precise enough to stand in the same spot). */
export function codificarSitio(s: Sitio): string {
  const m = (v: number) => String(Math.round(v * 10) / 10);
  const a = (v: number) => String(Math.round(Math.atan2(Math.sin(v), Math.cos(v)) / G));
  return [m(s.x), m(s.y), m(s.z), a(s.yaw), String(Math.round(s.pitch / G)), m(s.dist)].join(",");
}

/** Read a `#foto=` value back; null when it is not one (wrong count, not numbers, out of range). */
export function leerSitio(v: string | null | undefined): Sitio | null {
  if (typeof v !== "string" || v.length > 80) return null;
  const p = v.split(",");
  if (p.length !== 6 || p.some((t) => !/^-?\d+(\.\d+)?$/.test(t.trim()))) return null;
  const [x, y, z, yaw, pitch, dist] = p.map(Number);
  if ([x, y, z].some((n) => Math.abs(n) > LIMITE) || Math.abs(yaw) > 180 || Math.abs(pitch) > 90 || dist < 0 || dist > 100) return null;
  return { x, y, z, yaw: yaw * G, pitch: pitch * G, dist };
}

/** The link to a place: this page's address (its query kept: `?server=` says which world) with `#foto=…`; any other
 * `#` value (never a pass: tomarPaseDeLaDireccion already took it out) is dropped. */
export function enlaceSitio(loc: { origin: string; pathname: string; search: string }, s: Sitio): string {
  return `${loc.origin}${loc.pathname}${loc.search}#foto=${codificarSitio(s)}`;
}

/** Take `foto=` out of the address's hash (and out of the bar, keeping anything else there). */
export function tomarSitioDeLaDireccion(loc: { hash: string; pathname: string; search: string }, hist: { state: unknown; replaceState(state: unknown, title: string, url: string): void }): Sitio | null {
  if (!loc.hash.includes("foto=")) return null;
  const params = new URLSearchParams(loc.hash.replace(/^#/, ""));
  const sitio = leerSitio(params.get("foto"));
  params.delete("foto");
  const rest = params.toString();
  try { hist.replaceState(hist.state, "", loc.pathname + loc.search + (rest ? `#${rest}` : "")); } catch { /* no history API */ }
  return sitio;
}

/** The heading (like the camera's `yaw()`: 0 = looking along -z, + = left) that looks from (x0, z0) toward (x1, z1). */
export function rumboHacia(x0: number, z0: number, x1: number, z1: number): number { return Math.atan2(-(x1 - x0), -(z1 - z0)); }
