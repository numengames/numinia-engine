// residuos (naturaleza R4): old machinery of the Residuos (valves, lenses, coils, gears; glossary «Residuos») half buried in the
// landscape, overgrown with moss and verdigris: the steampunk 40 % of the house mix, so the nature is Numinia's nature.
// PURE: no three.js, no DOM, no Math.random, no clock. The same (seed, options, height, zone) gives the same sites on every
// device, on the server and in a test. ZERO new draw calls: the pieces are BAKED as static triangles (positions + per-vertex
// colours) that terreno.ts appends to its own single mesh; flat normals come from the terrain material's flatShading.
//
// Look (work/naturaleza/DIRECCION-ARTE.md): a Mediterranean garden with bronze machinery nobody uses any more — not a scrapyard,
// not cyberpunk. Brass / copper / dark bronze with verdigris (cobreOxidado, verdín) creeping up from the ground, moss on the top
// faces, one glass lens that catches the sun (light colour only, never emissive) and, on some pieces, ONE tiny turquoise / coral
// led (cyber accent, well under 1 % of the pixels). Every colour is a mix of palette entries (paleta.ts is the only source).
//
// COPIED (technique only): lathe / surface-of-revolution modelling (the classic low-poly prop recipe, e.g. Kenney / Quaternius
// style props), jittered-grid candidate sites (esparcir.ts) and vertex-colour gradients for fake ambient occlusion (terreno.ts).
// CHANGED: pieces are 12–60 triangles built from a few lathes and extrusions; the burial, tilt, yaw, scale and tone of every piece are
// seeded jitter, and the sites (3–7 pieces) are clustered so they read as ruins. COMBINED: relieve zones, semilla.ts hash, paleta.ts.
import { crearAzar, hash2 } from "./semilla.ts";
import { CASA, MAQUINA, SENAL, VERDES, mezcla } from "./paleta.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "../../../relieve/src/relieve.ts";

export type TipoPieza = "engranaje" | "valvula" | "bobina" | "lente" | "arco" | "veleta" | "columna" | "panel" | "tronco" | "roca";
export const TIPOS_PIEZA: readonly TipoPieza[] = ["engranaje", "valvula", "bobina", "lente", "arco", "veleta", "columna", "panel", "tronco", "roca"];

/** Triangles the Residuos may bake into the terrain mesh per tier. They live INSIDE the terrain's share of the budget (niveles.ts `reparto.terreno`). */
export const RESIDUOS_POR_NIVEL: Record<Nivel, number> = { A: 900, B: 450, C: 350, D: 0 };

/** The colours the pieces are made of (hex). Every vertex colour is a blend of these. */
export const PALETA_RESIDUOS: readonly number[] = [
  MAQUINA.laton, MAQUINA.latonSombra, MAQUINA.cobre, MAQUINA.cobreOxidado, MAQUINA.bronce, MAQUINA.hierro, MAQUINA.cristal,
  VERDES.musgo, VERDES.verdin, VERDES.monteSombra, CASA.ceniza, CASA.arenaVelada, CASA.arena, CASA.ambarTostado, SENAL.turquesa, SENAL.coral,
];

export type Sitio = { x: number; y: number; z: number; tipo: TipoPieza; piezas: number; zona: Zona; radio: number };
export type PiezaColocada = { tipo: TipoPieza; x: number; y: number; z: number; escala: number; giro: number };
export type Residuos = {
  /** Triangle soup, 9 floats per triangle (x y z ×3), world space. */
  posiciones: Float32Array;
  /** Linear-RGB vertex colours (what THREE.Color(hex) holds), 9 floats per triangle. */
  colores: Float32Array;
  triangulos: number;
  sitios: Sitio[];
  piezas: PiezaColocada[];
};
export type OpcionesResiduos = {
  nivel: Nivel;
  /** World side (m). */
  tamano: number;
  /** Plaza radius (m): nothing inside it nor within MARGEN_PLAZA of it. */
  plaza: number;
  /** The pond or null: nothing within `radio × 1.25 + 3` of it. */
  estanque: { x: number; z: number; radio: number } | null;
  /** Override the tier's triangle cap (tests). */
  maxTriangulos?: number;
};
export const MARGEN_PLAZA_RESIDUOS = 6, MARGEN_BORDE_RESIDUOS = 14, CELDA_SITIOS = 11;

// ------------------------------------------------------------------ tiny geometry kit (local space, y up, base at y = 0)
type V3 = [number, number, number];
type Mat = "metal" | "piedra" | "madera" | "cristal" | "led";
type Tri = { p: [V3, V3, V3]; c: number; m: Mat; /** hex per vertex when set (gradients) */ cv?: [number, number, number] };
type Pieza = { tris: Tri[]; alto: number; radio: number; led: V3 | null; enterrar: [number, number] };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const igual = (a: V3, b: V3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-5;

class Constructor {
  tris: Tri[] = [];
  /** A triangle that faces away from `centro` (so closed shapes need no winding care). */
  fuera(a: V3, b: V3, c: V3, col: number, m: Mat, centro: V3, cv?: [number, number, number]): void {
    if (igual(a, b) || igual(b, c) || igual(a, c)) return;
    const n = cruz(sub(b, a), sub(c, a)), g: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(g, centro)) >= 0) this.tris.push({ p: [a, b, c], c: col, m, cv });
    else this.tris.push({ p: [a, c, b], c: col, m, cv: cv ? [cv[0], cv[2], cv[1]] : undefined });
  }
  /** A thin sheet seen from both sides (front colour on the side the winding faces, back colour on the other). */
  doble(a: V3, b: V3, c: V3, col: number, m: Mat, atras = col): void {
    if (igual(a, b) || igual(b, c) || igual(a, c)) return;
    this.tris.push({ p: [a, b, c], c: col, m }); this.tris.push({ p: [a, c, b], c: atras, m });
  }
  /** Surface of revolution around Y. `perfil` goes bottom → top as [radius, y]; band k takes colour cols[k % cols.length]. */
  torno(perfil: [number, number][], seg: number, cols: number[], m: Mat, giro = 0, estirar = 1): void {
    const anillo = (r: number, y: number): V3[] => Array.from({ length: seg }, (_, k) => { const a = giro + (k / seg) * Math.PI * 2; return [Math.cos(a) * r, y * estirar, Math.sin(a) * r] as V3; });
    for (let b = 0; b + 1 < perfil.length; b++) {
      const A = anillo(perfil[b][0], perfil[b][1]), B = anillo(perfil[b + 1][0], perfil[b + 1][1]), col = cols[b % cols.length];
      const ym = ((perfil[b][1] + perfil[b + 1][1]) / 2) * estirar;
      for (let k = 0; k < seg; k++) {
        const k2 = (k + 1) % seg, centro: V3 = [0, ym, 0];
        this.fuera(A[k], A[k2], B[k2], col, m, centro); this.fuera(A[k], B[k2], B[k], col, m, centro);
      }
    }
  }
  /** Same as torno but about the X axis: a lying column / log / pipe (ends along +X). */
  tumbado(perfil: [number, number][], seg: number, cols: number[], m: Mat, giro = 0): void {
    const n0 = this.tris.length;
    this.torno(perfil, seg, cols, m, giro);
    for (let i = n0; i < this.tris.length; i++) this.tris[i].p = this.tris[i].p.map((v) => [v[1], v[0], v[2]] as V3) as [V3, V3, V3]; // swap x↔y mirrors: re-wind below
    for (let i = n0; i < this.tris.length; i++) { const t = this.tris[i]; t.p = [t.p[0], t.p[2], t.p[1]]; if (t.cv) t.cv = [t.cv[0], t.cv[2], t.cv[1]]; }
  }
}

/** Uniform random in [a, b). */
const entre = (r: () => number, a: number, b: number) => a + (b - a) * r();

type Hechura = (r: () => number, cols: { metal: number; metal2: number; piedra: number; madera: number }) => Pieza;

// Each builder returns a piece standing on y = 0 whose lower part is meant to sink into the ground.
const engranaje: Hechura = (r, C) => {
  const B = new Constructor(), T = r() < 0.5 ? 5 : 6, R = entre(r, 0.8, 1.15), raiz = R * 0.8, hub = R * 0.34, e = 0.2;
  const alto = e, cima: V3[] = [], base: V3[] = [], cubo: V3[] = [];
  for (let k = 0; k < 2 * T; k++) {
    const a = (k / (2 * T)) * Math.PI * 2, rr = k % 2 === 0 ? R : raiz;
    cima.push([Math.cos(a) * rr, e, Math.sin(a) * rr]); base.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]); cubo.push([Math.cos(a) * hub, e, Math.sin(a) * hub]);
  }
  const arriba: V3 = [0, 5, 0], c0: V3 = [0, -3, 0];
  for (let k = 0; k < 2 * T; k++) {
    const k2 = (k + 1) % (2 * T);
    B.fuera(cima[k], cima[k2], cubo[k2], C.metal, "metal", c0); B.fuera(cima[k], cubo[k2], cubo[k], C.metal, "metal", c0); // face (ring)
    B.fuera(cima[k], base[k], base[k2], C.metal2, "metal", [0, e / 2, 0]); B.fuera(cima[k], base[k2], cima[k2], C.metal2, "metal", [0, e / 2, 0]); // teeth sides
  }
  void arriba;
  // raised hub
  const h2 = Array.from({ length: 2 * T }, (_, k) => { const a = (k / (2 * T)) * Math.PI * 2; return [Math.cos(a) * hub * 0.7, e + 0.14, Math.sin(a) * hub * 0.7] as V3; });
  for (let k = 0; k < 2 * T; k++) { const k2 = (k + 1) % (2 * T); B.fuera(cubo[k], cubo[k2], h2[k2], C.metal2, "metal", [0, e - 1, 0]); B.fuera(cubo[k], h2[k2], h2[k], C.metal2, "metal", [0, e - 1, 0]); }
  return { tris: B.tris, alto: e + 0.14, radio: R, led: [0, e + 0.15, 0], enterrar: [0.35, 0.6] };
};

const valvula: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.9, 1.15);
  B.torno([[0.26 * s, 0], [0.26 * s, 0.5 * s], [0.34 * s, 0.56 * s], [0.12 * s, 0.64 * s]], 5, [C.metal2, C.metal2, C.metal], "metal");
  const y = 0.7 * s, R = 0.56 * s, ri = 0.4 * s, seg = 6, giro = r() * 1.0;
  const f = (rr: number, k: number): V3 => { const a = giro + (k / seg) * Math.PI * 2; return [Math.cos(a) * rr, y, Math.sin(a) * rr]; };
  for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; B.doble(f(R, k), f(R, k2), f(ri, k2), C.metal, "metal", C.metal2); B.doble(f(R, k), f(ri, k2), f(ri, k), C.metal, "metal", C.metal2); }
  for (let q = 0; q < 2; q++) { const a = giro + (q / 2) * Math.PI, c = Math.cos(a), sn = Math.sin(a), w = 0.045 * s; B.doble([c * ri, y, sn * ri], [-c * ri, y, -sn * ri], [-c * ri + sn * w, y, -sn * ri - c * w], C.metal2, "metal"); B.doble([c * ri, y, sn * ri], [-c * ri + sn * w, y, -sn * ri - c * w], [c * ri + sn * w, y, sn * ri - c * w], C.metal2, "metal"); }
  return { tris: B.tris, alto: y, radio: R, led: [0.3 * s, 0.45 * s, 0.05], enterrar: [0.15, 0.35] };
};

const bobina: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.15), est = entre(r, 1.1, 2.0);
  const p: [number, number][] = [[0.4 * s, 0], [0.4 * s, 0.12], [0.27 * s, 0.18], [0.4 * s, 0.3], [0.27 * s, 0.38], [0.2 * s, 0.45], [0, 0.5 * s]];
  B.torno(p, 5, [C.metal2, C.metal, C.metal2, C.metal, C.piedra, C.metal2], "metal", r() * 1.2, est);
  return { tris: B.tris, alto: 0.5 * s * est, radio: 0.4 * s, led: [0, 0.5 * s * est, 0], enterrar: [0.1, 0.3] };
};

const lente: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.2), g = r() * 1.0;
  B.torno([[0.62 * s, 0], [0.62 * s, 0.16 * s], [0.54 * s, 0.2 * s]], 6, [C.metal, C.metal2], "metal", g);
  // the glass: its own tone ring-by-ring (lighter towards the top, only light colours)
  const vidrio = [mezcla(MAQUINA.cristal, CASA.noche, 0.12), MAQUINA.cristal, mezcla(MAQUINA.cristal, CASA.arena, 0.45)];
  B.torno([[0.54 * s, 0.2 * s], [0.5 * s, 0.32 * s], [0.34 * s, 0.46 * s], [0, 0.55 * s]], 6, vidrio, "cristal", g);
  return { tris: B.tris, alto: 0.55 * s, radio: 0.62 * s, led: [0.58 * s, 0.1, 0], enterrar: [0.15, 0.35] };
};

const arco: Hechura = (r, C) => {
  const B = new Constructor(), R = entre(r, 1.0, 1.35), w = 0.2, N = 5, L = 0.5 * Math.PI;
  const est: V3[][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI, cx = Math.cos(a) * R, cy = Math.sin(a) * R; // centre of the section on the arc
    const rx = Math.cos(a) * w, ry = Math.sin(a) * w;
    est.push([[cx + rx, cy + ry, -w], [cx + rx, cy + ry, w], [cx - rx, cy - ry, w], [cx - rx, cy - ry, -w]]);
  }
  void L;
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4, col = (i + k) % 3 === 0 ? C.metal2 : C.metal, centro: V3 = [(est[i][0][0] + est[i][2][0]) / 2, (est[i][0][1] + est[i][2][1]) / 2, 0];
    B.fuera(est[i][k], est[i][k2], est[i + 1][k2], col, "metal", centro); B.fuera(est[i][k], est[i + 1][k2], est[i + 1][k], col, "metal", centro);
  }
  return { tris: B.tris, alto: R + w, radio: R + w, led: [0, R + w, 0.0], enterrar: [0.08, 0.2] };
};

const veleta: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.15), H = 1.55 * s;
  B.torno([[0.08, 0], [0.05, H * 0.95], [0.085, H], [0, H + 0.07]], 4, [C.metal2, C.metal2, C.metal], "metal");
  const g = r() * Math.PI * 2, c = Math.cos(g), sn = Math.sin(g), y = H + 0.08;
  const P = (u: number, v: number): V3 => [c * u, y + v, sn * u]; // a vertical plane through the post, rotated by g
  B.doble(P(0.5, 0), P(0.08, 0.1), P(0.08, -0.1), C.metal, "metal", C.metal2);
  B.doble(P(-0.1, 0), P(-0.46, 0.2), P(-0.46, -0.2), C.metal2, "metal", C.metal);
  const yb = H * 0.8, cc = Math.cos(g + 1.2), s2 = Math.sin(g + 1.2);
  B.doble([-cc * 0.26, yb, -s2 * 0.26], [cc * 0.26, yb, s2 * 0.26], [cc * 0.26, yb + 0.04, s2 * 0.26], C.metal2, "metal");
  B.doble([c * 0.26, yb, sn * 0.26], [-c * 0.26, yb, -sn * 0.26], [-c * 0.26, yb + 0.04, -sn * 0.26], C.metal2, "metal");
  return { tris: B.tris, alto: y + 0.2, radio: 0.5, led: P(0.5, 0), enterrar: [0.04, 0.1] };
};

const columna: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.15), L = entre(r, 1.3, 1.8);
  const col = [C.piedra, C.piedra, C.metal, C.metal2, C.metal2, C.piedra, C.piedra];
  B.tumbado([[0.3 * s, 0], [0.3 * s, 0.45], [0.44 * s, 0.5], [0.44 * s, 0.62], [0.3 * s, 0.67], [0.3 * s, L]], 5, [col[0], col[1], C.metal, C.metal2, C.piedra], "piedra", r());
  // colour the collar as metal
  for (const t of B.tris) { const ym = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3; if (ym > 0.46 && ym < 0.66) t.m = "metal"; }
  return { tris: B.tris, alto: 0.6 * s, radio: L / 2, led: [0.56, 0.4 * s, 0.1], enterrar: [0.25, 0.4] };
};

const panel: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.15), H = 1.0 * s;
  B.torno([[0.07, 0], [0.045, H], [0.08, H + 0.04]], 4, [C.metal2, C.metal], "metal");
  const tilt = entre(r, 0.45, 0.7), ct = Math.cos(tilt), st = Math.sin(tilt), g = r() * Math.PI * 2, cg = Math.cos(g), sg = Math.sin(g), y0 = H + 0.1, petalos = 5;
  const Pt = (rr: number, a: number): V3 => { const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = x * st; const x2 = x * ct; return [cg * x2 - sg * z, y0 + y, sg * x2 + cg * z]; };
  const verde = mezcla(MAQUINA.cobreOxidado, CASA.noche, 0.45), brillo = mezcla(MAQUINA.cobreOxidado, MAQUINA.cristal, 0.25);
  const centro = Pt(0, 0);
  for (let k = 0; k < petalos; k++) {
    const a = (k / petalos) * Math.PI * 2, m1 = Pt(0.28 * s, a - 0.4), m2 = Pt(0.28 * s, a + 0.4), tip = Pt(0.62 * s, a);
    const cf = k % 2 === 0 ? verde : brillo;
    B.doble(centro, tip, m1, cf, "cristal", C.metal2); B.doble(centro, m2, tip, cf, "cristal", C.metal2); // winding so the sky side is up
  }
  return { tris: B.tris, alto: y0 + 0.5, radio: 0.62 * s, led: Pt(0.06, 0), enterrar: [0.04, 0.1] };
};

const tronco: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.85, 1.2), L = entre(r, 1.7, 2.6), q = L * entre(r, 0.35, 0.6), rr = 0.24 * s;
  B.tumbado([[rr, 0], [rr, q], [rr * 1.18, q + 0.01], [rr * 1.18, q + 0.13], [rr, q + 0.14], [rr, L], [0, L + 0.02]], 5, [C.madera, C.madera, C.metal, C.metal2, C.madera, C.madera], "madera", r());
  for (const t of B.tris) { const xm = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3; if (xm > q - 0.02 && xm < q + 0.15) t.m = "metal"; }
  return { tris: B.tris, alto: rr * 2.4, radio: L / 2, led: null, enterrar: [0.15, 0.3] };
};

const roca: Hechura = (r, C) => {
  const B = new Constructor(), R = entre(r, 0.4, 0.9), seg = 5, g = r() * 6;
  const anillo = (rr: number, y: number, off: number): V3[] => Array.from({ length: seg }, (_, k) => { const a = g + off + (k / seg) * Math.PI * 2, j = 0.78 + 0.44 * r(); return [Math.cos(a) * rr * j, y * (0.85 + 0.3 * r()), Math.sin(a) * rr * j] as V3; });
  const A = anillo(R, 0, 0), M = anillo(R * 0.78, R * 0.5, 0.6), cima: V3 = [R * 0.08 * (r() - 0.5), R * 0.8, R * 0.08 * (r() - 0.5)], centro: V3 = [0, R * 0.2, 0];
  for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; B.fuera(A[k], A[k2], M[k2], C.piedra, "piedra", centro); B.fuera(A[k], M[k2], M[k], C.piedra, "piedra", centro); B.fuera(M[k], M[k2], cima, C.piedra, "piedra", centro); }
  return { tris: B.tris, alto: R * 0.8, radio: R, led: null, enterrar: [0.1, 0.3] };
};

const HECHURAS: Record<TipoPieza, Hechura> = { engranaje, valvula, bobina, lente, arco, veleta, columna, panel, tronco, roca };

// ------------------------------------------------------------------ colour
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex → linear RGB floats, as THREE.Color(hex) stores them (the terrain's own vertex colours are in that space). */
export function aLineal(hex: number): [number, number, number] { return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)]; }
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The metals a site may be built of: brass, copper, toasted amber (old brass), dark bronze; the stone is ash or sand-veiled ash. */
const METALES = [MAQUINA.laton, MAQUINA.cobre, MAQUINA.latonSombra, MAQUINA.laton, MAQUINA.cobre, MAQUINA.bronce];
type Maniera = { metal: number; metal2: number; piedra: number; madera: number; musgo: number; verdin: number };

// ------------------------------------------------------------------ sites
const ANCLAS: Partial<Record<Zona, [TipoPieza, number][]>> = {
  roca: [["engranaje", 3], ["columna", 2], ["bobina", 3], ["valvula", 1], ["arco", 1]],
  bosque: [["tronco", 2], ["valvula", 3], ["arco", 3], ["veleta", 2], ["engranaje", 2], ["bobina", 1]],
  prado: [["panel", 3], ["lente", 3], ["veleta", 2], ["valvula", 2], ["arco", 1], ["bobina", 1]],
  orilla: [["arco", 3], ["valvula", 3], ["lente", 2]],
  arena: [["engranaje", 3], ["lente", 2], ["columna", 2]],
};
const RELLENO: [TipoPieza, number][] = [["roca", 5], ["engranaje", 2], ["tronco", 1], ["valvula", 1], ["columna", 1], ["bobina", 1], ["lente", 1], ["veleta", 0.5], ["panel", 0.5]];
const elegir = <T,>(tabla: [T, number][], u: number): T => { const tot = tabla.reduce((a, [, w]) => a + w, 0); let a = 0; for (const [t, w] of tabla) { a += w / tot; if (u < a) return t; } return tabla[tabla.length - 1][0]; };

type Candidato = { cx: number; cz: number; prioridad: number; zona: Zona; ancla: TipoPieza; i: number; j: number };

function candidatos(semilla: number, o: OpcionesResiduos, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Candidato[] {
  const s = semilla | 0, mitad = o.tamano / 2, n = Math.floor((o.tamano - 2 * MARGEN_BORDE_RESIDUOS) / CELDA_SITIOS), x0 = -n * CELDA_SITIOS / 2, res: Candidato[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.15 + 0.7 * hash2(s + 4101, i, j)) * CELDA_SITIOS, z = x0 + (j + 0.15 + 0.7 * hash2(s + 4102, i, j)) * CELDA_SITIOS;
    if (Math.abs(x) > mitad - MARGEN_BORDE_RESIDUOS || Math.abs(z) > mitad - MARGEN_BORDE_RESIDUOS) continue;
    const d = Math.hypot(x, z);
    if (d < o.plaza + MARGEN_PLAZA_RESIDUOS + 4) continue;
    if (o.estanque && Math.hypot(x - o.estanque.x, z - o.estanque.z) < o.estanque.radio * 1.25 + 5) continue;
    const zona = zonaEn(x, z);
    // rarer in the meadow, more along the edge of the rock and of the forest
    let p = zona === "roca" ? 0.55 : zona === "bosque" ? 0.2 : zona === "prado" ? 0.12 : zona === "orilla" ? 0.1 : 0.06;
    const vec = [zonaEn(x + 7, z), zonaEn(x - 7, z), zonaEn(x, z + 7), zonaEn(x, z - 7)];
    const borde = vec.some((v) => v !== zona);
    if (borde && (vec.includes("roca") || vec.includes("bosque") || zona === "roca" || zona === "bosque")) p *= 2.2;
    if (hash2(s + 4103, i, j) >= Math.min(0.9, p)) continue;
    const y = alturaEn(x, z);
    if (y < -0.02) continue;
    const pend = Math.hypot(alturaEn(x + 1.5, z) - y, alturaEn(x, z + 1.5) - y) / 1.5;
    if (pend > 0.6) continue;
    const ancla = elegir(ANCLAS[zona] ?? ANCLAS.prado!, hash2(s + 4104, i, j));
    // visible first: sites a player finds within a short walk of the plaza rank higher, then the seeded hash
    res.push({ cx: x, cz: z, zona, ancla, i, j, prioridad: hash2(s + 4105, i, j) * 0.6 + Math.min(1, Math.max(0, (d - 20) / 90)) * 0.9 });
  }
  return res.sort((a, b) => a.prioridad - b.prioridad);
}

type Colocada = { pieza: Pieza; tipo: TipoPieza; x: number; y: number; z: number; giro: number; escala: number; incl: [number, number]; fondo: number; mani: Maniera };

/** The pieces of one site, or null when it has fewer than 3 valid ones. */
function armarSitio(semilla: number, o: OpcionesResiduos, c: Candidato, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Colocada[] | null {
  const r = crearAzar(Math.floor(hash2(semilla + 4200, c.i, c.j) * 4294967296));
  const metal = METALES[Math.floor(r() * METALES.length)], metal2 = METALES[Math.floor(r() * METALES.length)];
  const mani: Maniera = { metal, metal2, piedra: r() < 0.5 ? CASA.ceniza : mezcla(CASA.ceniza, CASA.arenaVelada, 0.35), madera: mezcla(CASA.bronce, CASA.ambarTostado, 0.4), musgo: 0.1 + 0.3 * r(), verdin: 0.3 + 0.35 * r() };
  const quiere = 3 + Math.floor(r() * 5), pzs: Colocada[] = [];
  const cabe = (x: number, z: number) => {
    if (Math.hypot(x, z) < o.plaza + MARGEN_PLAZA_RESIDUOS) return false;
    if (o.estanque && Math.hypot(x - o.estanque.x, z - o.estanque.z) < o.estanque.radio * 1.25 + 3) return false;
    if (Math.abs(x) > o.tamano / 2 - MARGEN_BORDE_RESIDUOS + 4 || Math.abs(z) > o.tamano / 2 - MARGEN_BORDE_RESIDUOS + 4) return false;
    return true;
  };
  for (let k = 0; k < quiere * 3 && pzs.length < quiere; k++) {
    const tipo: TipoPieza = k === 0 ? c.ancla : elegir(RELLENO, r()), a = r() * Math.PI * 2, d = k === 0 ? 0 : entre(r, 1.3, 4.6);
    const x = c.cx + Math.cos(a) * d, z = c.cz + Math.sin(a) * d;
    if (!cabe(x, z)) continue;
    if (pzs.some((q) => Math.hypot(q.x - x, q.z - z) < (q.pieza.radio + 0.5) * q.escala * 0.8 + 0.6)) continue;
    const escala = entre(r, 1.2, 1.75) * (tipo === "roca" ? entre(r, 0.7, 1.1) : 1);
    const pieza = HECHURAS[tipo](r, mani);
    const fp = pieza.radio * escala * 0.6, hs = [alturaEn(x, z), alturaEn(x + fp, z), alturaEn(x - fp, z), alturaEn(x, z + fp), alturaEn(x, z - fp)];
    const suelo = Math.min(...hs);
    if (suelo < -0.1 || Math.max(...hs) - suelo > 1.1 * pieza.radio * escala) continue;
    if (zonaEn(x, z) === "arena" && tipo === "tronco") continue;
    const incl: [number, number] = tipo === "engranaje" ? [entre(r, -0.6, 0.6), entre(r, -0.6, 0.6)] : tipo === "roca" ? [entre(r, -0.1, 0.1), entre(r, -0.1, 0.1)] : [entre(r, -0.2, 0.2), entre(r, -0.2, 0.2)];
    const fondo = entre(r, pieza.enterrar[0], pieza.enterrar[1]) * pieza.alto * escala;
    pzs.push({ pieza, tipo, x, y: suelo - fondo, z, giro: r() * Math.PI * 2, escala, incl, fondo, mani });
    // a tiny led on about one piece in three (machines only)
    if (pieza.led && tipo !== "roca" && r() < 0.34) {
      const led = pieza.led, t: Tri[] = [], col = r() < 0.7 ? SENAL.turquesa : SENAL.coral, e = 0.045 / escala, [lx, ly, lz] = led;
      const A: V3 = [lx + e, ly, lz], Bq: V3 = [lx - e * 0.5, ly, lz + e * 0.87], Cq: V3 = [lx - e * 0.5, ly, lz - e * 0.87], D: V3 = [lx, ly + e * 1.4, lz];
      for (const [p, q, w] of [[A, Bq, D], [Bq, Cq, D], [Cq, A, D], [A, Cq, Bq]] as [V3, V3, V3][]) t.push({ p: [p, q, w], c: col, m: "led" });
      // orient the little pyramid outwards
      const g: V3 = [lx, ly + e * 0.35, lz];
      for (const q of t) { const nn = cruz(sub(q.p[1], q.p[0]), sub(q.p[2], q.p[0])), gg: V3 = [(q.p[0][0] + q.p[1][0] + q.p[2][0]) / 3, (q.p[0][1] + q.p[1][1] + q.p[2][1]) / 3, (q.p[0][2] + q.p[1][2] + q.p[2][2]) / 3]; if (dot(nn, sub(gg, g)) < 0) q.p = [q.p[0], q.p[2], q.p[1]]; }
      pieza.tris.push(...t);
    }
  }
  return pzs.length >= 3 ? pzs : null;
}

// ------------------------------------------------------------------ bake
/** Transform a piece into world space and colour every vertex. Returns the triangles' positions and linear colours. */
function hornear(pz: Colocada, semilla: number, idx: number, pos: number[], col: number[]): void {
  const { pieza, escala, giro, incl } = pz, cy = Math.cos(giro), sy = Math.sin(giro), cx = Math.cos(incl[0]), sx = Math.sin(incl[0]), cz = Math.cos(incl[1]), sz = Math.sin(incl[1]);
  const mundo = (v: V3): V3 => {
    let x = v[0] * escala, y = v[1] * escala, z = v[2] * escala;
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1;        // tilt about X
    const x2 = x * cz - y * sz, y2 = x * sz + y * cz; x = x2; y = y2;        // tilt about Z
    return [pz.x + x * cy + z * sy, pz.y + y, pz.z - x * sy + z * cy];       // yaw, move
  };
  const M = pz.mani, alto = Math.max(0.3, pieza.alto);
  let t = 0;
  for (const tri of pieza.tris) {
    const w = tri.p.map(mundo) as [V3, V3, V3], n = cruz(sub(w[1], w[0]), sub(w[2], w[0])), ln = Math.hypot(n[0], n[1], n[2]) || 1, ny = n[1] / ln;
    const tono = hash2(semilla + 4300 + idx, t, 17) - 0.5; t++;
    for (let q = 0; q < 3; q++) {
      const h = Math.min(1, Math.max(0, tri.p[q][1] / alto)); // 0 = foot of the piece … 1 = top
      const hv = hash2(semilla + 4400 + idx, t * 3 + q, 5);
      let c = tri.cv ? tri.cv[q] : tri.c;
      if (tri.m === "led") { col.push(...aLineal(c)); pos.push(w[q][0], w[q][1], w[q][2]); continue; }
      if (tri.m !== "cristal") {
        if (tri.m === "metal") c = mezcla(mezcla(c, CASA.ceniza, 0.16), CASA.arenaVelada, 0.1); // weathered brass: lighter and duller than its paint chip
        if (tri.m === "metal" || tri.m === "piedra") c = mezcla(c, hv < 0.5 ? MAQUINA.cobreOxidado : VERDES.verdin, Math.min(0.9, M.verdin * (0.15 + 1.4 * (1 - h) * (1 - h)) * (0.5 + hv))); // verdigris rises from the ground, with water-stain streaks
        c = mezcla(c, CASA.arenaVelada, 0.2 * (1 - sstep(-0.2, 0.5, ny))); // baked fill light: the faces turned from the sun are never pure black
        const sobre = sstep(0.25, 0.85, ny);
        c = mezcla(c, VERDES.musgo, Math.min(0.85, M.musgo * sobre * (0.5 + hv) * (tri.m === "madera" ? 1.1 : 1)));            // moss on the top faces
        c = mezcla(c, VERDES.monteSombra, Math.min(0.4, 0.3 * (1 - h) * (1 - h) * (1 - h)));                                             // earth swallows the foot
        c = mezcla(c, tono > 0 ? CASA.arenaVelada : MAQUINA.latonSombra, Math.abs(tono) * 0.3);                                       // tone jitter
      } else c = mezcla(c, CASA.arena, 0.2 * sstep(0.4, 1, ny) + Math.max(0, tono) * 0.2);                                         // glass: light colours only
      pos.push(w[q][0], w[q][1], w[q][2]); col.push(...aLineal(c));
    }
  }
}

/** Build the Residuos of a world: static triangles (positions + colours) and the list of sites. Pure and deterministic. */
export function construirResiduos(semilla: number, o: OpcionesResiduos, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Residuos {
  const tope = o.maxTriangulos ?? RESIDUOS_POR_NIVEL[o.nivel], pos: number[] = [], col: number[] = [], sitios: Sitio[] = [], piezas: PiezaColocada[] = [];
  let usados = 0;
  if (tope > 0) for (const c of candidatos(semilla, o, alturaEn, zonaEn)) {
    let pzs = armarSitio(semilla, o, c, alturaEn, zonaEn);
    if (!pzs) continue;
    // fit the rest of the budget: drop the last fillers, a site keeps at least 3 pieces
    let coste = pzs.reduce((a, p) => a + p.pieza.tris.length, 0);
    while (pzs.length > 3 && usados + coste > tope) { coste -= pzs[pzs.length - 1].pieza.tris.length; pzs = pzs.slice(0, -1); }
    if (usados + coste > tope) continue;
    usados += coste;
    pzs.forEach((p, k) => { hornear(p, semilla, c.i * 131 + c.j * 7 + k, pos, col); piezas.push({ tipo: p.tipo, x: p.x, y: p.y + p.fondo, z: p.z, escala: p.escala, giro: p.giro }); });
    const a = pzs[0];
    sitios.push({ x: c.cx, y: a.y + a.fondo, z: c.cz, tipo: a.tipo, piezas: pzs.length, zona: c.zona, radio: 5 });
  }
  return { posiciones: Float32Array.from(pos), colores: Float32Array.from(col), triangulos: pos.length / 9, sitios, piezas };
}
