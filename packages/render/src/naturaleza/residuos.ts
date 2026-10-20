// residuos (naturaleza R4, redesigned in R6.6): old machinery of the Residuos (glossary «Residuos») half buried in the landscape,
// at heroic scale and taken from Pablo's relic art (work/naturaleza/referencias/hoja1-reliquias.jpg): the RING-PORTAL (Glido de
// Turing), the cracked LENS-SPHERE (Disco de Janus), the CRESCENT BLADE stuck in the ground (Filo de Atlas), plus a big valve
// wheel with spokes, a coil with copper windings and an upright gear. The steampunk 40 % of the house mix.
// PURE: no three.js, no DOM, no Math.random, no clock. The same (seed, options, height, zone) gives the same sites on every
// device, on the server and in a test. ZERO new draw calls: the pieces are BAKED as static triangles (positions + per-vertex
// colours) that terreno.ts appends to its own single mesh; flat normals come from the terrain material's flatShading.
//
// Look (work/naturaleza/DISENO-LORE.md, binding): read at three distances: at 30 m the black silhouette tells the object (ring,
// sphere with a flange, sickle, spoked wheel, spool, toothed disc), at 8 m the material (bright brass on the raised parts, a lighter
// old-brass body, light verdigris on the faces that look at the sky and on the joints, dark where it goes into the ground), at
// 2 m the detail (bands, the lens, the crack). One signal accent per piece at most (the ring's turquoise line, the lens's pupil,
// or a tiny led on some machines). Every colour is a token or a mezcla() of tokens (paleta.ts; no raw hex here).
// FEWER, LARGER pieces: 80–200 triangles each, so a site is one big anchor plus a machine or two and some stones.
//
// The landmark: the first quest of the demo world sends the player to (18, 0) «the brass ring of the east» (it was the engine's
// gold pillar, hidden while the nature is on since R6.1). On every tier one ring-portal stands there, facing the plaza.
//
// COPIED (technique only): lathe / surface-of-revolution modelling and swept sections (the classic low-poly prop recipe),
// jittered-grid candidate sites (esparcir.ts) and vertex-colour gradients for fake ambient occlusion (terreno.ts).
// CHANGED: shapes from the relic sheet; patina by normal and by depth instead of a uniform olive wash. COMBINED: relieve zones,
// semilla.ts hash, paleta.ts.
import { crearAzar, hash2 } from "./semilla.ts";
import { CASA, MAQUINA, SENAL, VERDES, PATINA, mezcla } from "./paleta.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "../../../relieve/src/relieve.ts";

export type TipoPieza = "anillo" | "esfera" | "hoja" | "valvula" | "bobina" | "engranaje" | "roca";
export const TIPOS_PIEZA: readonly TipoPieza[] = ["anillo", "esfera", "hoja", "valvula", "bobina", "engranaje", "roca"];

/** Triangles the Residuos may bake into the terrain mesh per tier. They live INSIDE the terrain's share of the budget (niveles.ts `reparto.terreno`).
 *  R6.6: D carries only the landmark ring (the quest needs it on every device; niveles.ts D `terreno` grew to pay for it). */
export const RESIDUOS_POR_NIVEL: Record<Nivel, number> = { A: 900, B: 450, C: 350, D: 110 };

/** R6.6: the quest landmark (demo world, mision «primeros-pasos», step «anillo»): one ring-portal always stands here, facing the plaza. */
export const ANILLO_HITO = { x: 18, z: 0 } as const;
/** Bands of the ring per tier (each band = 3 segments × 8 triangles): coarser rings on smaller devices. */
const BANDAS_ANILLO: Record<Nivel, number> = { A: 7, B: 5, C: 5, D: 4 };

/** The colours the pieces are made of (hex). Every vertex colour is a blend of these. */
export const PALETA_RESIDUOS: readonly number[] = [
  MAQUINA.laton, MAQUINA.latonSombra, MAQUINA.cobre, MAQUINA.cobreOxidado, MAQUINA.bronce, MAQUINA.hierro, MAQUINA.cristal,
  VERDES.musgo, VERDES.verdin, VERDES.monteSombra, CASA.ceniza, CASA.arenaVelada, CASA.arena, CASA.ambarTostado, CASA.ambar,
  CASA.verdemar, CASA.bronceOscuro, CASA.basalto, CASA.noche, SENAL.turquesa, SENAL.coral,
];

export type Sitio = { x: number; y: number; z: number; tipo: TipoPieza; piezas: number; zona: Zona; radio: number };
export type PiezaColocada = { tipo: TipoPieza; x: number; y: number; z: number; escala: number; giro: number; triangulos: number; senales: number };
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
  /** Plaza radius (m): nothing inside it nor within MARGEN_PLAZA of it (the landmark ring excepted: it stands where the quest says). */
  plaza: number;
  /** The pond or null: nothing within `radio × 1.25 + 3` of it. */
  estanque: { x: number; z: number; radio: number } | null;
  /** Override the tier's triangle cap (tests). */
  maxTriangulos?: number;
};
export const MARGEN_PLAZA_RESIDUOS = 6, MARGEN_BORDE_RESIDUOS = 14, CELDA_SITIOS = 11;
/** Other sites keep this far (m) from the landmark ring, so it reads alone from the plaza. */
const LIBRE_ANILLO = 12;

// ------------------------------------------------------------------ tiny geometry kit (local space, y up, base at y = 0)
type V3 = [number, number, number];
/** metal/piedra take the patina; cristal stays light; led and grieta are drawn as given. */
type Mat = "metal" | "piedra" | "cristal" | "led" | "grieta";
type Tri = { p: [V3, V3, V3]; c: number; m: Mat };
type Pieza = { tris: Tri[]; alto: number; radio: number; led: V3 | null; enterrar: [number, number]; /** carries its own signal accent */ senal: boolean };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const igual = (a: V3, b: V3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-5;

class Constructor {
  tris: Tri[] = [];
  /** A triangle that faces away from `centro` (so closed shapes need no winding care). */
  fuera(a: V3, b: V3, c: V3, col: number, m: Mat, centro: V3): void {
    if (igual(a, b) || igual(b, c) || igual(a, c)) return;
    const n = cruz(sub(b, a), sub(c, a)), g: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    this.tris.push({ p: dot(n, sub(g, centro)) >= 0 ? [a, b, c] : [a, c, b], c: col, m });
  }
  /** A quad a-b-c-d facing away from `centro`. */
  quad(a: V3, b: V3, c: V3, d: V3, col: number, m: Mat, centro: V3): void { this.fuera(a, b, c, col, m, centro); this.fuera(a, c, d, col, m, centro); }
  /** Surface of revolution around Y. `perfil` goes bottom → top as [radius, y]; band k takes colour cols[k % cols.length]. */
  torno(perfil: [number, number][], seg: number, cols: number[], m: Mat, giro = 0): void {
    const anillo = (r: number, y: number): V3[] => Array.from({ length: seg }, (_, k) => { const a = giro + (k / seg) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r] as V3; });
    for (let b = 0; b + 1 < perfil.length; b++) {
      const A = anillo(perfil[b][0], perfil[b][1]), B = anillo(perfil[b + 1][0], perfil[b + 1][1]), col = cols[b % cols.length];
      const centro: V3 = [0, (perfil[b][1] + perfil[b + 1][1]) / 2, 0];
      for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; this.fuera(A[k], A[k2], B[k2], col, m, centro); this.fuera(A[k], B[k2], B[k], col, m, centro); }
    }
  }
  /** Apply `f` to every vertex of the triangles from index `desde` on (winding is kept: only rigid moves). */
  mover(desde: number, f: (v: V3) => V3): void { for (let i = desde; i < this.tris.length; i++) this.tris[i].p = this.tris[i].p.map(f) as [V3, V3, V3]; }
  /**
   * A swept rectangular section along an arc in the XY plane (centre `c`, centre-line radius `R`): a ring, a wheel rim.
   * `est` lists the stations [angle, section scale, colour of the segment that STARTS here]; `tr` radial thickness, `dz` depth.
   * The inner face takes `interior` when given (the relic's lit inner band). 8 triangles per segment, open ends.
   */
  aro(c: V3, R: number, tr: number, dz: number, est: [number, number, number][], m: Mat, interior?: number): void {
    const sec = (a: number, s: number): V3[] => {
      const ca = Math.cos(a), sa = Math.sin(a), ro = R + tr * s / 2, ri = R - tr * s / 2, z = dz * s / 2;
      return [[c[0] + ca * ro, c[1] + sa * ro, c[2] + z], [c[0] + ca * ro, c[1] + sa * ro, c[2] - z], [c[0] + ca * ri, c[1] + sa * ri, c[2] - z], [c[0] + ca * ri, c[1] + sa * ri, c[2] + z]];
    };
    for (let i = 0; i + 1 < est.length; i++) {
      const [a0, s0, col] = est[i], [a1, s1] = est[i + 1], A = sec(a0, s0), B = sec(a1, s1), am = (a0 + a1) / 2;
      const centro: V3 = [c[0] + Math.cos(am) * R, c[1] + Math.sin(am) * R, c[2]];
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; this.quad(A[k], A[k2], B[k2], B[k], k === 2 && interior !== undefined && s0 === s1 ? interior : col, m, centro); }
    }
  }
}

/** Uniform random in [a, b). */
const entre = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Per-site materials: the body (old brass or copper), the raised parts (bright brass), the joints (verdigris), the stone. */
type Maniera = { cuerpo: number; realce: number; junta: number; piedra: number; verdin: number; musgo: number };
type Hechura = (r: () => number, C: Maniera, nivel: Nivel) => Pieza;

// ------------------------------------------------------------------ the pieces (each stands on y = 0; its foot is meant to sink)

/** RING-PORTAL (Glido de Turing): a thick faceted brass ring 5.6–6.6 m across standing in the XY plane (it looks along Z), sunk ~1 m,
 *  raised bands every few segments, a lit inner face and ONE turquoise signal line running over the front of the crown. */
const anillo: Hechura = (r, C, nivel) => {
  const B = new Constructor(), R = entre(r, 2.45, 2.85), tr = 0.62, dz = 0.95, yc = R * 0.74;
  const bandas = BANDAS_ANILLO[nivel], a0 = -1.25, a1 = Math.PI + 1.25, paso = (a1 - a0) / bandas, ancho = paso * 0.16;
  const est: [number, number, number][] = [];
  for (let b = 0; b < bandas; b++) {
    const a = a0 + b * paso;
    est.push([a, 1, C.realce], [a + ancho, 1.24, C.realce], [a + 2 * ancho, 1, C.cuerpo]); // a raised band (chevron section), then the plain run
  }
  est.push([a1, 1, C.cuerpo]);
  B.aro([0, yc, 0], R, tr, dz, est, "metal", C.realce);
  // the signal line: a thin strip on the back face (-Z: the side that looks at the plaza once placed), over the crown's plain runs (it slips under the raised bands)
  const z = -(dz / 2 + 0.015), w = 0.06, n0 = Math.floor(bandas / 2) - 1;
  for (let b = n0; b < n0 + 2; b++) {
    const s = a0 + b * paso + 2 * ancho, e = a0 + (b + 1) * paso;
    const P = (a: number, rr: number): V3 => [Math.cos(a) * rr, yc + Math.sin(a) * rr, z];
    B.quad(P(s, R - w), P(s, R + w), P(e, R + w), P(e, R - w), SENAL.turquesa, "led", [0, yc, 0]);
  }
  return { tris: B.tris, alto: yc + R + tr / 2, radio: R + tr, led: null, enterrar: [0, 0], senal: true };
};

/** LENS-SPHERE (Disco de Janus): a ~3 m sphere with a wide brass equator flange, a lens on its front and a dark crack down its crown. */
const esfera: Hechura = (r, C) => {
  const B = new Constructor(), R = entre(r, 1.35, 1.6), seg = 7, g = r() * 6;
  const perfil: [number, number][] = [0, 0.18, 0.5, 0.82, 1].map((u) => { const a = -Math.PI / 2 + u * Math.PI; return [Math.cos(a) * R, R + Math.sin(a) * R] as [number, number]; });
  B.torno(perfil, seg, [C.cuerpo, C.cuerpo, C.junta, C.junta], "metal", g); // brass below, the verdigris crown of the relic above
  // the crack: a zig-zag column of crown facets turned dark (no hole: the shell stays closed)
  const k0 = Math.floor(r() * seg), sector = (t: Tri) => { const x = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, z = (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3; return Math.floor((((Math.atan2(z, x) - g) / (Math.PI * 2)) % 1 + 1) % 1 * seg); };
  for (const t of B.tris) { const y = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, fila = y > R * 1.7 ? 0 : y > R * 1.15 ? 1 : 2; if (fila < 2 && sector(t) === (k0 + fila) % seg) { t.c = mezcla(CASA.noche, CASA.bronceOscuro, 0.4); t.m = "grieta"; } }
  // the flange: a thin brass wing round the equator, wider than the shell (the silhouette at 30 m: a ball with a brim)
  B.torno([[R * 0.97, R - 0.1], [R * 1.32, R - 0.02], [R * 0.97, R + 0.1]], seg, [C.realce, C.realce], "metal", g + Math.PI / seg);
  // the lens, on the side away from the crack: a brass rim (verdigris joint) and a glass dome, with a turquoise pupil
  const n0 = B.tris.length, vidrio = mezcla(MAQUINA.cristal, CASA.noche, 0.1);
  B.torno([[0.5, 0], [0.5, 0.2], [0.38, 0.26]], 6, [C.realce, C.junta], "metal");
  B.torno([[0.38, 0.26], [0.2, 0.36], [0, 0.4]], 6, [vidrio, MAQUINA.cristal], "cristal");
  const la = g + ((k0 + seg / 2) / seg) * Math.PI * 2, cl = Math.cos(la), sl = Math.sin(la), fi = 0.15, ci = Math.cos(Math.PI / 2 - fi), si = Math.sin(Math.PI / 2 - fi);
  // lathe axis Y → the sphere's outward normal at azimuth la, elevation fi (a rotation about Z, then about Y), seated on the shell
  const n: V3 = [cl * Math.cos(fi), Math.sin(fi), sl * Math.cos(fi)], b0: V3 = [n[0] * R * 0.97, R + n[1] * R * 0.97, n[2] * R * 0.97];
  B.mover(n0, ([x, y, z]) => { const x1 = x * ci + y * si, y1 = -x * si + y * ci; return [b0[0] + cl * x1 - sl * z, b0[1] + y1, b0[2] + sl * x1 + cl * z]; });
  const pupila: V3 = [b0[0] + n[0] * 0.4, b0[1] + n[1] * 0.4, b0[2] + n[2] * 0.4];
  return { tris: B.tris, alto: 2 * R, radio: R * 1.32, led: pupila, enterrar: [0.18, 0.3], senal: true };
};

/** CRESCENT BLADE (Filo de Atlas): a 3.5–4 m sickle in the XY plane, one tip driven into the ground; a thick spine, bright bevelled
 *  edges and a verdigris hub on its back. */
const hoja: Hechura = (r, C) => {
  const B = new Constructor(), Ro = entre(r, 1.9, 2.2), N = 8, amp = 1.25, ancho = Ro * 0.36, e = 0.13, giro = -0.35;
  const rot = (x: number, y: number): [number, number] => [x * Math.cos(giro) - y * Math.sin(giro), x * Math.sin(giro) + y * Math.cos(giro)];
  const plano = mezcla(C.cuerpo, C.realce, 0.5), filo: V3[] = [], lomoF: V3[] = [], lomoB: V3[] = [], medF: V3[] = [], medB: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = -amp + 2 * amp * t, w = ancho * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.01, ca = Math.cos(a), sa = Math.sin(a);
    const P = (rr: number, z: number): V3 => { const [x, y] = rot(ca * rr, sa * rr); return [x, y, z]; };
    filo.push(P(Ro, 0)); medF.push(P(Ro - w * 0.45, e * 0.7 * Math.sin(Math.PI * t) + 0.01)); medB.push(P(Ro - w * 0.45, -e * 0.7 * Math.sin(Math.PI * t) - 0.01));
    lomoF.push(P(Ro - w, e * Math.sin(Math.PI * t) + 0.01)); lomoB.push(P(Ro - w, -e * Math.sin(Math.PI * t) - 0.01));
  }
  for (let i = 0; i < N; i++) {
    const c: V3 = [(medF[i][0] + medF[i + 1][0]) / 2 * 0.6, (medF[i][1] + medF[i + 1][1]) / 2 * 0.6, 0], j = i + 1;
    B.quad(filo[i], filo[j], medF[j], medF[i], C.realce, "metal", [c[0], c[1], -1]); B.quad(filo[i], filo[j], medB[j], medB[i], C.realce, "metal", [c[0], c[1], 1]); // bright bevels
    B.quad(medF[i], medF[j], lomoF[j], lomoF[i], plano, "metal", [c[0], c[1], -1]); B.quad(medB[i], medB[j], lomoB[j], lomoB[i], plano, "metal", [c[0], c[1], 1]); // the flats
    B.quad(lomoF[i], lomoF[j], lomoB[j], lomoB[i], C.cuerpo, "metal", [(filo[i][0] + filo[j][0]) / 2, (filo[i][1] + filo[j][1]) / 2, 0]); // the spine (faces the arc's centre)
  }
  // the hub on the spine's middle: a short drum across the blade
  const n0 = B.tris.length, [hx, hy] = rot(Ro - ancho - 0.1, 0);
  B.torno([[0, -0.26], [0.24, -0.2], [0.24, 0.2], [0, 0.26]], 6, [C.realce, C.cuerpo, C.realce], "metal");
  B.mover(n0, ([x, y, z]) => [hx + x, hy - z, y]); // a quarter turn about X: the drum's axis goes across the blade
  // stand it up: the lower tip down into the ground (y = 0 is about 0.5 m above that tip)
  const lo = Math.min(...B.tris.flatMap((t) => t.p.map((v) => v[1])));
  B.mover(0, ([x, y, z]) => [x - Ro * 0.6, y - lo - 0.5, z]);
  const alto = Math.max(...B.tris.flatMap((t) => t.p.map((v) => v[1])));
  return { tris: B.tris, alto, radio: Ro * 0.9, led: [hx - Ro * 0.6, hy - lo - 0.5, 0.33], enterrar: [0, 0.04], senal: false };
};

/** VALVE: a pipe stub out of the ground with a flange, carrying an upright hand-wheel ~1.9 m across: thick rim, two crossing spokes. */
const valvula: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.92, 1.1), Rw = 0.9 * s, yw = 1.05 * s + Rw;
  B.torno([[0.34 * s, 0], [0.34 * s, 0.78 * s], [0.5 * s, 0.84 * s], [0.5 * s, 0.98 * s], [0.16 * s, 1.08 * s]], 5, [C.cuerpo, C.junta, C.realce, C.cuerpo], "metal", r());
  // the stem up to the hub: a square post
  const q = 0.07 * s, top = yw;
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4, b = ((k + 1) / 4) * Math.PI * 2 + Math.PI / 4; B.quad([Math.cos(a) * q, 1.0 * s, Math.sin(a) * q], [Math.cos(b) * q, 1.0 * s, Math.sin(b) * q], [Math.cos(b) * q, top, Math.sin(b) * q], [Math.cos(a) * q, top, Math.sin(a) * q], C.cuerpo, "metal", [0, (top + s) / 2, 0]); }
  // the wheel in the XY plane: 8 rim segments, the rim raised (bright brass)
  const est: [number, number, number][] = Array.from({ length: 9 }, (_, k) => [(k / 8) * Math.PI * 2 + Math.PI / 8, 1, C.realce]);
  B.aro([0, yw, 0], Rw, 0.2 * s, 0.22 * s, est, "metal");
  // two spokes crossing at the hub (square bars), turned 45° so they read as an X
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const ca = Math.cos(a), sa = Math.sin(a), h = 0.06 * s, L = Rw - 0.05;
    const P = (u: number, v: number, w: number): V3 => [ca * u - sa * v, yw + sa * u + ca * v, w];
    const c: V3 = [0, yw, 0];
    for (const [v0, w0, v1, w1] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) B.quad(P(-L, v0, w0), P(-L, v1, w1), P(L, v1, w1), P(L, v0, w0), C.cuerpo, "metal", c);
  }
  return { tris: B.tris, alto: yw + Rw, radio: Rw, led: [0, yw, 0.18 * s], enterrar: [0.04, 0.1], senal: false };
};

/** COIL: an upright spool ~2 m tall, wide brass end plates and three proud copper windings between dark grooves. */
const bobina: Hechura = (r, C) => {
  const B = new Constructor(), s = entre(r, 0.9, 1.1), Rb = 0.78 * s, Rn = 0.56 * s, Rv = 0.66 * s, H = 2.0 * s;
  const cobre = PATINA.cobre, surco = mezcla(C.cuerpo, CASA.bronceOscuro, 0.55);
  const p: [number, number][] = [[Rb, 0], [Rb, 0.2 * H], [Rn, 0.24 * H], [Rv, 0.32 * H], [Rn, 0.42 * H], [Rv, 0.52 * H], [Rn, 0.62 * H], [Rv, 0.72 * H], [Rn, 0.8 * H], [Rb, 0.84 * H], [Rb, 0.95 * H], [0, H]];
  B.torno(p, 5, [C.cuerpo, C.junta, cobre, cobre, cobre, cobre, cobre, cobre, C.junta, C.realce, C.realce], "metal", r() * 1.2);
  // the grooves between windings: the down-sloping faces are turned dark so each winding reads as a separate ring
  for (const t of B.tris) if (t.c === cobre) { const n = cruz(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0])); if (n[1] < 0) t.c = surco; }
  return { tris: B.tris, alto: H, radio: Rb, led: [0, H, 0], enterrar: [0.12, 0.22], senal: false };
};

/** GEAR: a toothed disc 2.6–3.4 m across, set on edge and half sunk (closed both sides: it is seen from behind too); bright raised hub.
 *  ED2 (work/saber-3d/comparisons/catalogo-tecnicas.md: «bisel + normales ponderadas»; http://wiki.polycount.com/wiki/Face_weighted_normals,
 *  https://www.blog.radiator.debacle.us/2017/07/bevels-in-video-games.html): the front-face/flank corner at the tooth rim was a bare 90°
 *  join (flat-shaded, reads as a hard line with no highlight: «the look of the 2000s»). A thin bright chamfer band now sits in its place —
 *  a real bevel, not a shading trick — so the rim catches a rim-light streak at the silhouette, same recipe `hoja` already used on its edges. */
const engranaje: Hechura = (r, C) => {
  const B = new Constructor(), T = r() < 0.5 ? 7 : 8, R = entre(r, 1.3, 1.7), raiz = R * 0.8, hub = R * 0.32, e = 0.28, n = 2 * T;
  const BISEL = 0.05; // chamfer depth/inset (m): small and constant, so the cost stays "algunos tris más" at every tier
  const cima: V3[] = [], base: V3[] = [], cubo: V3[] = [], h2: V3[] = [], bisel: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, rr = k % 2 === 0 ? R : raiz, ca = Math.cos(a), sa = Math.sin(a);
    cima.push([ca * rr, e, sa * rr]); base.push([ca * rr, 0, sa * rr]); cubo.push([ca * hub, e, sa * hub]); h2.push([ca * hub * 0.7, e + 0.18, sa * hub * 0.7]);
    bisel.push([ca * (rr - BISEL), e - BISEL, sa * (rr - BISEL)]); // inset ring: the chamfer's inner edge (front face and flank now meet here instead)
  }
  const arriba: V3 = [0, -3, 0], abajo: V3 = [0, 3, 0], tapa: V3 = [0, e + 0.2, 0];
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    B.quad(bisel[k], bisel[k2], cubo[k2], cubo[k], C.cuerpo, "metal", arriba);                                // front face (now inset by the chamfer)
    B.quad(cima[k], cima[k2], bisel[k2], bisel[k], C.realce, "metal", arriba);                                 // ED2 bevel band: bright, catches light at the rim
    B.quad(cima[k], base[k], base[k2], cima[k2], k % 2 === 0 ? C.realce : C.cuerpo, "metal", [0, e / 2, 0]); // teeth flanks
    B.fuera(base[k], base[k2], [0, 0, 0], C.cuerpo, "metal", abajo);                                         // back face (a fan)
  }
  for (let k = 0; k < n; k += 2) { const k2 = (k + 2) % n; B.quad(cubo[k], cubo[k2], h2[k2], h2[k], C.realce, "metal", [0, e - 1, 0]); B.fuera(h2[k], h2[k2], tapa, C.realce, "metal", [0, 0, 0]); }
  return { tris: B.tris, alto: e + 0.18, radio: R, led: [0, e + 0.19, 0], enterrar: [0.2, 0.5], senal: false };
};

const roca: Hechura = (r, C) => {
  const B = new Constructor(), R = entre(r, 0.5, 1.0), seg = 5, g = r() * 6;
  const anillo = (rr: number, y: number, off: number): V3[] => Array.from({ length: seg }, (_, k) => { const a = g + off + (k / seg) * Math.PI * 2, j = 0.78 + 0.44 * r(); return [Math.cos(a) * rr * j, y * (0.85 + 0.3 * r()), Math.sin(a) * rr * j] as V3; });
  const A = anillo(R, 0, 0), M = anillo(R * 0.78, R * 0.5, 0.6), cima: V3 = [R * 0.08 * (r() - 0.5), R * 0.8, R * 0.08 * (r() - 0.5)], centro: V3 = [0, R * 0.2, 0];
  for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; B.fuera(A[k], A[k2], M[k2], C.piedra, "piedra", centro); B.fuera(A[k], M[k2], M[k], C.piedra, "piedra", centro); B.fuera(M[k], M[k2], cima, C.piedra, "piedra", centro); }
  return { tris: B.tris, alto: R * 0.8, radio: R, led: null, enterrar: [0.1, 0.3], senal: false };
};

const HECHURAS: Record<TipoPieza, Hechura> = { anillo, esfera, hoja, valvula, bobina, engranaje, roca };

// ------------------------------------------------------------------ colour
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex → linear RGB floats, as THREE.Color(hex) stores them (the terrain's own vertex colours are in that space). */
export function aLineal(hex: number): [number, number, number] { return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)]; }
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function maniera(r: () => number, zona: Zona): Maniera {
  const cobre = r() < 0.25;
  return {
    cuerpo: cobre ? PATINA.cobre : mezcla(PATINA.cuerpo, PATINA.latonVivo, 0.3 * r()), realce: PATINA.latonVivo, junta: PATINA.verdin,
    piedra: zona === "roca" || zona === "arena" ? mezcla(CASA.basalto, CASA.ceniza, 0.35 + 0.25 * r()) : mezcla(CASA.ceniza, CASA.arenaVelada, 0.35 * r()),
    verdin: 0.72 + 0.2 * r(), musgo: 0.2 + 0.3 * r(),
  };
}

// ------------------------------------------------------------------ sites
const ANCLAS: Partial<Record<Zona, [TipoPieza, number][]>> = {
  roca: [["esfera", 3], ["hoja", 3], ["anillo", 1], ["engranaje", 1]], // the moor carries the big relics
  arena: [["hoja", 2], ["esfera", 2], ["engranaje", 2]],
  bosque: [["engranaje", 3], ["bobina", 2], ["hoja", 1], ["valvula", 1]],
  prado: [["bobina", 2], ["engranaje", 2], ["esfera", 1], ["valvula", 1]],
  orilla: [["valvula", 4], ["bobina", 1]],
};
const RELLENO: [TipoPieza, number][] = [["roca", 6], ["valvula", 1], ["bobina", 1], ["engranaje", 1]];
const elegir = <T,>(tabla: [T, number][], u: number): T => { const tot = tabla.reduce((a, [, w]) => a + w, 0); let a = 0; for (const [t, w] of tabla) { a += w / tot; if (u < a) return t; } return tabla[tabla.length - 1][0]; };

type Candidato = { cx: number; cz: number; prioridad: number; zona: Zona; ancla: TipoPieza; i: number; j: number };

function candidatos(semilla: number, o: OpcionesResiduos, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Candidato[] {
  const s = semilla | 0, mitad = o.tamano / 2, n = Math.floor((o.tamano - 2 * MARGEN_BORDE_RESIDUOS) / CELDA_SITIOS), x0 = -n * CELDA_SITIOS / 2, res: Candidato[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.15 + 0.7 * hash2(s + 4101, i, j)) * CELDA_SITIOS, z = x0 + (j + 0.15 + 0.7 * hash2(s + 4102, i, j)) * CELDA_SITIOS;
    if (Math.abs(x) > mitad - MARGEN_BORDE_RESIDUOS || Math.abs(z) > mitad - MARGEN_BORDE_RESIDUOS) continue;
    const d = Math.hypot(x, z);
    if (d < o.plaza + MARGEN_PLAZA_RESIDUOS + 4) continue;
    if (Math.hypot(x - ANILLO_HITO.x, z - ANILLO_HITO.z) < LIBRE_ANILLO + 4) continue;
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

type Colocada = { pieza: Pieza; tipo: TipoPieza; x: number; y: number; z: number; suelo: number; giro: number; escala: number; incl: [number, number]; fondo: number; mani: Maniera };

/** Tilt of a piece as placed: the gear stands on edge (half sunk), the rest lean a little. */
function inclinacion(r: () => number, tipo: TipoPieza): [number, number] {
  if (tipo === "engranaje") return [(r() < 0.5 ? -1 : 1) * entre(r, 0.9, 1.2), entre(r, -0.15, 0.15)]; // leaning on edge: its face reads from most sides
  if (tipo === "roca") return [entre(r, -0.1, 0.1), entre(r, -0.1, 0.1)];
  if (tipo === "esfera") return [entre(r, -0.3, 0.3), entre(r, -0.3, 0.3)];
  return [entre(r, -0.12, 0.12), entre(r, -0.12, 0.12)];
}

/** Add a tiny led pyramid (4 triangles) at `led` in the piece's local space. */
function ponerLed(pieza: Pieza, led: V3, col: number, escala: number): void {
  const t: Tri[] = [], e = 0.06 / escala, [lx, ly, lz] = led;
  const A: V3 = [lx + e, ly, lz], Bq: V3 = [lx - e * 0.5, ly, lz + e * 0.87], Cq: V3 = [lx - e * 0.5, ly, lz - e * 0.87], D: V3 = [lx, ly + e * 1.4, lz];
  for (const [p, q, w] of [[A, Bq, D], [Bq, Cq, D], [Cq, A, D], [A, Cq, Bq]] as [V3, V3, V3][]) t.push({ p: [p, q, w], c: col, m: "led" });
  const g: V3 = [lx, ly + e * 0.35, lz]; // orient the little pyramid outwards
  for (const q of t) { const nn = cruz(sub(q.p[1], q.p[0]), sub(q.p[2], q.p[0])), gg: V3 = [(q.p[0][0] + q.p[1][0] + q.p[2][0]) / 3, (q.p[0][1] + q.p[1][1] + q.p[2][1]) / 3, (q.p[0][2] + q.p[1][2] + q.p[2][2]) / 3]; if (dot(nn, sub(gg, g)) < 0) q.p = [q.p[0], q.p[2], q.p[1]]; }
  pieza.tris.push(...t);
}

/** The pieces of one site, or null when it has fewer than 3 valid ones. */
function armarSitio(semilla: number, o: OpcionesResiduos, c: Candidato, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Colocada[] | null {
  const r = crearAzar(Math.floor(hash2(semilla + 4200, c.i, c.j) * 4294967296));
  const mani = maniera(r, c.zona), quiere = 3 + Math.floor(r() * 3), pzs: Colocada[] = [];
  const cabe = (x: number, z: number) => {
    if (Math.hypot(x, z) < o.plaza + MARGEN_PLAZA_RESIDUOS) return false;
    if (Math.hypot(x - ANILLO_HITO.x, z - ANILLO_HITO.z) < LIBRE_ANILLO) return false;
    if (o.estanque && Math.hypot(x - o.estanque.x, z - o.estanque.z) < o.estanque.radio * 1.25 + 3) return false;
    if (Math.abs(x) > o.tamano / 2 - MARGEN_BORDE_RESIDUOS + 4 || Math.abs(z) > o.tamano / 2 - MARGEN_BORDE_RESIDUOS + 4) return false;
    return true;
  };
  for (let k = 0; k < quiere * 3 && pzs.length < quiere; k++) {
    const tipo: TipoPieza = k === 0 ? c.ancla : elegir(RELLENO, r()), a = r() * Math.PI * 2, d = k === 0 ? 0 : entre(r, 2.6, 6.5);
    const x = c.cx + Math.cos(a) * d, z = c.cz + Math.sin(a) * d;
    if (!cabe(x, z)) continue;
    const escala = tipo === "roca" ? entre(r, 0.8, 1.5) : entre(r, 0.92, 1.12);
    const pieza = HECHURAS[tipo](r, mani, o.nivel);
    if (pzs.some((q) => Math.hypot(q.x - x, q.z - z) < (q.pieza.radio * q.escala + pieza.radio * escala) * 0.75 + 0.3)) continue;
    const fp = Math.min(pieza.radio * escala * 0.6, 2), hs = [alturaEn(x, z), alturaEn(x + fp, z), alturaEn(x - fp, z), alturaEn(x, z + fp), alturaEn(x, z - fp)];
    const suelo = Math.min(...hs);
    if (suelo < -0.1 || Math.max(...hs) - suelo > Math.max(1.2, 0.7 * pieza.radio * escala)) continue;
    const incl = inclinacion(r, tipo), fondo = entre(r, pieza.enterrar[0], pieza.enterrar[1]) * pieza.alto * escala;
    pzs.push({ pieza, tipo, x, y: suelo - fondo, z, suelo, giro: r() * Math.PI * 2, escala, incl, fondo, mani });
    // one signal accent at most: pieces without their own get a tiny led about one time in three (machines only)
    if (pieza.led && !pieza.senal && tipo !== "roca" && r() < 0.34) { ponerLed(pieza, pieza.led, r() < 0.7 ? SENAL.turquesa : SENAL.coral, escala); pieza.senal = true; }
    else if (pieza.led && pieza.senal && tipo === "esfera") ponerLed(pieza, pieza.led, SENAL.turquesa, escala); // the lens's pupil IS its accent
  }
  return pzs.length >= 3 ? pzs : null;
}

/** The landmark ring at ANILLO_HITO, facing the plaza, or null when the world is too small to hold it. */
function anilloHito(semilla: number, o: OpcionesResiduos, alturaEn: (x: number, z: number) => number): Colocada | null {
  const { x, z } = ANILLO_HITO;
  if (Math.abs(x) > o.tamano / 2 - 6 || Math.abs(z) > o.tamano / 2 - 6) return null;
  const r = crearAzar(Math.floor(hash2(semilla + 4250, 18, 0) * 4294967296)), mani = maniera(r, "roca");
  mani.cuerpo = mezcla(PATINA.cuerpo, PATINA.latonVivo, 0.15);
  const pieza = anillo(r, mani, o.nivel), hs = [-3, -1.5, 0, 1.5, 3].flatMap((dz) => [alturaEn(x - 0.5, z + dz), alturaEn(x + 0.5, z + dz)]), suelo = Math.min(...hs);
  // the ring looks along its local Z: turn it so it looks along the radius from the plaza (you see through it from the plaza), plus a little lean
  const giro = Math.atan2(x, z) + entre(r, -0.12, 0.12);
  return { pieza, tipo: "anillo", x, y: suelo, z, suelo, giro, escala: 1, incl: [entre(r, -0.05, 0.05), entre(r, 0.04, 0.09)], fondo: 0, mani };
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
  const M = pz.mani;
  let t = 0;
  for (const tri of pieza.tris) {
    const w = tri.p.map(mundo) as [V3, V3, V3], n = cruz(sub(w[1], w[0]), sub(w[2], w[0])), ln = Math.hypot(n[0], n[1], n[2]) || 1, ny = n[1] / ln;
    const tono = hash2(semilla + 4300 + idx, t, 17) - 0.5; t++;
    for (let q = 0; q < 3; q++) {
      let c = tri.c;
      if (tri.m === "led" || tri.m === "grieta") { col.push(...aLineal(c)); pos.push(w[q][0], w[q][1], w[q][2]); continue; }
      const hv = hash2(semilla + 4400 + idx, t * 3 + q, 5), dy = w[q][1] - pz.suelo;
      if (tri.m === "cristal") c = mezcla(c, CASA.arena, 0.2 * sstep(0.4, 1, ny) + Math.max(0, tono) * 0.2); // glass: light colours only
      else {
        if (tri.m === "metal") c = mezcla(c, PATINA.verdin, M.verdin * sstep(0.5, 0.72, ny) * (0.8 + 0.4 * hv));        // verdigris on the faces that look at the sky
        else c = mezcla(c, VERDES.musgo, Math.min(0.8, M.musgo * sstep(0.35, 0.85, ny) * (0.6 + hv)));                 // moss on the stones' tops
        c = mezcla(c, CASA.arenaVelada, 0.12 * (1 - sstep(-0.2, 0.5, ny)));                                          // baked fill: faces turned from the sun are never black
        c = mezcla(c, PATINA.enterrado, (tri.m === "metal" ? 0.8 : 0.45) * (1 - sstep(-0.05, 0.5, dy)));                                           // dark where it goes into the ground
        if (tri.m === "metal") c = mezcla(c, tono > 0 ? PATINA.latonVivo : MAQUINA.latonSombra, Math.abs(tono) * 0.14); // tone jitter between facets
      }
      pos.push(w[q][0], w[q][1], w[q][2]); col.push(...aLineal(c));
    }
  }
}

const SENALES = new Set([SENAL.turquesa, SENAL.coral] as number[]);
const colocar = (p: Colocada): PiezaColocada => ({
  tipo: p.tipo, x: p.x, y: p.y + p.fondo, z: p.z, escala: p.escala, giro: p.giro, triangulos: p.pieza.tris.length,
  // signal accents of the piece: the ring's line counts as one, a led (4 triangles) as one
  senales: p.pieza.tris.some((t) => t.m === "led" && SENALES.has(t.c)) ? 1 : 0,
});

/** Build the Residuos of a world: static triangles (positions + colours) and the list of sites. Pure and deterministic. */
export function construirResiduos(semilla: number, o: OpcionesResiduos, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Residuos {
  const tope = o.maxTriangulos ?? RESIDUOS_POR_NIVEL[o.nivel], pos: number[] = [], col: number[] = [], sitios: Sitio[] = [], piezas: PiezaColocada[] = [];
  let usados = 0;
  // the landmark first: the quest needs it on every tier that carries Residuos
  const hito = tope > 0 ? anilloHito(semilla, o, alturaEn) : null;
  if (hito && hito.pieza.tris.length <= tope) {
    usados += hito.pieza.tris.length;
    hornear(hito, semilla, 9001, pos, col); piezas.push(colocar(hito));
    sitios.push({ x: hito.x, y: hito.suelo, z: hito.z, tipo: "anillo", piezas: 1, zona: zonaEn(hito.x, hito.z), radio: 4 });
  }
  const vistas = new Set<TipoPieza>(hito ? ["anillo"] : []);
  if (tope > 0) for (const c0 of candidatos(semilla, o, alturaEn, zonaEn)) {
    // variety: a site whose anchor kind is already standing takes the next kind of its zone's table that is not (heaviest first)
    const libre = [...(ANCLAS[c0.zona] ?? ANCLAS.prado!)].sort((x, y) => y[1] - x[1]).find(([t]) => !vistas.has(t));
    const c = vistas.has(c0.ancla) && libre ? { ...c0, ancla: libre[0] } : c0;
    let pzs = armarSitio(semilla, o, c, alturaEn, zonaEn);
    if (!pzs) continue;
    // fit the rest of the budget: drop the last fillers, a site keeps at least 3 pieces
    let coste = pzs.reduce((a, p) => a + p.pieza.tris.length, 0);
    while (pzs.length > 3 && usados + coste > tope) { coste -= pzs[pzs.length - 1].pieza.tris.length; pzs = pzs.slice(0, -1); }
    if (usados + coste > tope) continue;
    usados += coste; vistas.add(c.ancla);
    pzs.forEach((p, k) => { hornear(p, semilla, c.i * 131 + c.j * 7 + k, pos, col); piezas.push(colocar(p)); });
    const a = pzs[0];
    sitios.push({ x: c.cx, y: a.y + a.fondo, z: c.cz, tipo: a.tipo, piezas: pzs.length, zona: c.zona, radio: 7 });
  }
  return { posiciones: Float32Array.from(pos), colores: Float32Array.from(col), triangulos: pos.length / 9, sitios, piezas };
}
