// burbujas-politica (ia-llamar S9): what the page decides about drawing an AI's action bubble, pure (no three.js, no DOM) so it is tested alone.
// The SERVER decides who is inside (features/burbuja/feature.ts `dentro`); this file only says how far you are from the edge of the
// same shape, how visible the shape is, how many are drawn at once and where each shape sits. render imports nothing from features
// (tools/layers.json), so the few constants are copied here and test/burbuja-vista.test.ts checks them against `dentro` over a grid.
// Looks (design §3 + Appendix A): translucent green #14897a, a faint edge; `siempre` always faint, `al-acercarte` fades in from
// APARECE_M metres outside the edge, `nunca` is never drawn; a short flash when you enter; a sleeping AI's bubble is dim and dashed.

export type Forma = "esfera" | "cupula" | "cilindro" | "caja";
export type Visible = "siempre" | "al-acercarte" | "nunca";
export type Punto = { x: number; y: number; z: number };
export type Config = { forma: Forma; radio: number; visible: Visible };

// Same numbers as features/burbuja/feature.ts (a test compares them).
export const CENTRO_ESFERA_M = 1, PECHO_M = 1, ALTO_M = 6, SUELO_TOL_M = 0.5;

export const BURBUJA_COLOR = 0x14897a;          // the house green of every AI sign (VERDE_IA)
export const BURBUJA_COLOR_DORMIDA = 0x6fb3a9;   // a sleeping AI: the same tint as its ring
export const APARECE_M = 3;                      // `al-acercarte`: fully there at the edge, gone this far outside it
export const DESTELLO_MS = 700;                  // the flash on entering
export const RELLENO_MAX = 0.045, BORDE_MAX = 0.55;  // opacity at intensity 1 (fill, edge): faint, the AI behind it stays in plain sight
export const DORMIDA_FACTOR = 0.55;              // a sleeping bubble is dimmer
export const DESTELLO_EXTRA = 2.5;               // intensity added at the peak of the flash (fill reaches ~0.25, the edge is capped at 1)
export const PASOS = 8;                          // opacity is quantised to 1/PASOS of an intensity unit, so materials are shared (a handful in all)
export const NIVEL_MAX = Math.ceil((1 + DESTELLO_EXTRA) * PASOS);

/** How many bubbles a device draws at once (draw calls); the nearest win. VR is lean, a phone leaner than a PC. */
export const BURBUJAS_PC = 8, BURBUJAS_MOVIL = 3, BURBUJAS_VR = 2;
export const burbujasMax = (movil: boolean, vr: boolean): number => (vr ? BURBUJAS_VR : movil ? BURBUJAS_MOVIL : BURBUJAS_PC);

/**
 * Metres from a person's feet `p` to the nearest point of the bubble of an AI standing at `a` (feet); 0 = inside, edges included.
 * It is zero exactly when the server's `dentro` says so, and the distance is the way you would walk out of the shape (not a box).
 */
export function distanciaAlBorde(forma: Forma, radio: number, a: Punto, p: Punto): number {
  const dx = p.x - a.x, dz = p.z - a.z, dy = p.y - a.y;
  const bajo = Math.max(0, -SUELO_TOL_M - dy), alto = Math.max(0, dy - ALTO_M);
  switch (forma) {
    case "esfera": { const ey = (p.y + PECHO_M) - (a.y + CENTRO_ESFERA_M); return Math.max(0, Math.sqrt(dx * dx + ey * ey + dz * dz) - radio); }
    case "cupula": return Math.hypot(Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - radio), bajo);
    case "cilindro": return Math.hypot(Math.max(0, Math.hypot(dx, dz) - radio), bajo + alto);
    case "caja": return Math.hypot(Math.max(0, Math.abs(dx) - radio), Math.max(0, Math.abs(dz) - radio), bajo + alto);
    default: return Infinity;
  }
}

/** 1 → 0 over DESTELLO_MS after an entry (`null` = no flash); eased out so it lights at once and dies softly. */
export function destello(ms: number | null): number {
  if (ms === null || ms < 0 || ms >= DESTELLO_MS) return 0;
  const u = 1 - ms / DESTELLO_MS;
  return u * u;
}

/**
 * How strongly a bubble is drawn, 0 (not at all) to 1 (plain) plus the flash on top (up to 1 + DESTELLO_EXTRA).
 * `nunca` is always 0 (not even the flash: the keeper chose not to see it); `siempre` is 1; `al-acercarte` ramps from 0 at APARECE_M
 * outside the edge to 1 at the edge and inside. A sleeping AI's bubble is dimmer.
 */
export function intensidad(visible: Visible, distBorde: number, dormida: boolean, flash: number): number {
  let base: number;
  if (visible === "nunca") return 0;
  if (visible === "siempre") base = 1;
  else base = Math.min(1, Math.max(0, (APARECE_M - distBorde) / APARECE_M));
  if (base === 0) return 0;
  return base * (dormida ? DORMIDA_FACTOR : 1) + flash * DESTELLO_EXTRA;
}

/** Quantised level 0..NIVEL_MAX of an intensity: bubbles at the same level share one material. */
export const nivelDe = (i: number): number => Math.min(NIVEL_MAX, Math.max(0, Math.round(i * PASOS)));
/** Opacity of the fill and of the edge at a level. */
export const opacidadRelleno = (nivel: number): number => Math.min(1, (nivel / PASOS) * RELLENO_MAX);
export const opacidadBorde = (nivel: number): number => Math.min(1, (nivel / PASOS) * BORDE_MAX);

export type Candidata = { id: number; dist: number };
/** The `max` nearest candidates (ids), nearest first; a tie keeps the lower id so the choice does not flicker. */
export function elegir(cands: readonly Candidata[], max: number): number[] {
  const n = Math.max(0, Math.floor(max));
  return [...cands].sort((x, y) => x.dist - y.dist || x.id - y.id).slice(0, n).map((c) => c.id);
}

/** Where the unit shape of each form goes (centre, over the AI's feet) and how it is scaled. The unit shapes are in burbujas.ts. */
export function colocacion(forma: Forma, radio: number): { dy: number; sx: number; sy: number; sz: number } {
  switch (forma) {
    case "esfera": return { dy: CENTRO_ESFERA_M, sx: radio, sy: radio, sz: radio };
    case "cupula": return { dy: 0, sx: radio, sy: radio, sz: radio };
    // the cylinder and the box hold people from SUELO_TOL_M under the AI's feet up to ALTO_M over them (unit height 1, centred)
    case "cilindro":
    case "caja": return { dy: (ALTO_M - SUELO_TOL_M) / 2, sx: radio, sy: ALTO_M + SUELO_TOL_M, sz: radio };
    default: return { dy: 0, sx: radio, sy: radio, sz: radio };
  }
}
