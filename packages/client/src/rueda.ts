// rueda (J7b): the arithmetic of a radial menu, pure (no DOM) so tests can run it. Eight slices around a centre,
// slice 0 at the top, clockwise. A pointer (mouse, finger) or a stick picks by its direction from where it started;
// inside the dead zone it picks nothing (the centre). Pages (rings) of eight; the first ring is the player's favourites.
// apps/plaza/rueda.ts draws it and listens to keys, pointers and gamepads.

export const PORCIONES = 8;
/** A pointer must leave the centre by this many CSS pixels before a slice is picked (a still hand picks nothing). */
export const ZONA_MUERTA_PX = 28;
/** A stick must be pushed this far (0–1) to pick. */
export const ZONA_MUERTA_PALANCA = 0.5;

/** The slice for a direction on screen (dx right, dy DOWN, as pointer events give them), or -1 inside the dead zone. */
export function porcionDe(dx: number, dy: number, zonaMuerta = ZONA_MUERTA_PX, n = PORCIONES): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < zonaMuerta) return -1;
  const ang = Math.atan2(dx, -dy); // 0 = up, + = clockwise
  const paso = (2 * Math.PI) / n;
  return ((Math.floor((ang + paso / 2) / paso) % n) + n) % n;
}

/** The centre of slice `i` on a circle of radius `r` (x right, y down), for drawing. */
export function centroDe(i: number, r: number, n = PORCIONES): { x: number; y: number } {
  const ang = (i * 2 * Math.PI) / n;
  const k = (v: number) => Math.round(v * 100) / 100 + 0; // + 0: no −0
  return { x: k(Math.sin(ang) * r), y: k(-Math.cos(ang) * r) };
}

/** An SVG path of slice `i` of a ring between radii `r0` and `r1` around (c, c), with a gap of `hueco` radians. */
export function trazoDe(i: number, c: number, r0: number, r1: number, hueco = 0.02, n = PORCIONES): string {
  const paso = (2 * Math.PI) / n, a0 = i * paso - paso / 2 + hueco, a1 = i * paso + paso / 2 - hueco;
  const p = (r: number, a: number) => `${(c + Math.sin(a) * r).toFixed(2)} ${(c - Math.cos(a) * r).toFixed(2)}`;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/** Arrow keys and the like: the next slice that has something, going `paso` (+1 clockwise, -1 back); -1 when none has. */
export function siguiente(actual: number, paso: 1 | -1, ocupada: (i: number) => boolean, n = PORCIONES): number {
  for (let k = 1; k <= n; k++) {
    const i = (((actual < 0 ? (paso > 0 ? -1 : 0) : actual) + paso * k) % n + n) % n;
    if (ocupada(i)) return i;
  }
  return -1;
}

/** Split a list into rings of eight, each padded with null (an empty slice) to eight. */
export function anillos<T>(lista: readonly T[], n = PORCIONES): (T | null)[][] {
  const out: (T | null)[][] = [];
  for (let i = 0; i < lista.length; i += n) {
    const r: (T | null)[] = lista.slice(i, i + n);
    while (r.length < n) r.push(null);
    out.push(r);
  }
  return out;
}

/** The favourites as saved (localStorage text): eight slots of a known move id or null. Anything else → the defaults.
 * Unknown ids (a move that left the list) and repeats become empty slots; never throws. */
export function leerFavoritos(guardado: string | null, conocidos: readonly string[], porDefecto: readonly string[], n = PORCIONES): (string | null)[] {
  const base = (): (string | null)[] => { const r: (string | null)[] = porDefecto.filter((x) => conocidos.includes(x)).slice(0, n); while (r.length < n) r.push(null); return r; };
  if (!guardado) return base();
  let v: unknown;
  try { v = JSON.parse(guardado); } catch { return base(); }
  if (!Array.isArray(v)) return base();
  const vistos = new Set<string>(), r: (string | null)[] = [];
  for (const x of v.slice(0, n)) {
    if (typeof x === "string" && conocidos.includes(x) && !vistos.has(x)) { vistos.add(x); r.push(x); } else r.push(null);
  }
  while (r.length < n) r.push(null);
  return r;
}

/** Put a move in the favourites (the first empty slot) or take it out. `lleno` when there is no room. */
export function alternarFavorito(favs: readonly (string | null)[], id: string): { favs: (string | null)[]; puesto: boolean; lleno: boolean } {
  const r = [...favs];
  const i = r.indexOf(id);
  if (i >= 0) { r[i] = null; return { favs: r, puesto: false, lleno: false }; }
  const libre = r.indexOf(null);
  if (libre < 0) return { favs: r, puesto: false, lleno: true };
  r[libre] = id;
  return { favs: r, puesto: true, lleno: false };
}

/** Hold or tap: a key or button let go before `ms` was a tap (G taps wave), after it a hold (the wheel stays open). */
export const TOQUE_MS = 220;
export const esToque = (abajo: number, arriba: number, ms = TOQUE_MS): boolean => arriba - abajo < ms;
