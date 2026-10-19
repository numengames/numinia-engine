// aves (naturaleza F3): the biomechanical birds. ALL birds of the world are ONE instanced mesh = ONE draw call at every tier (no texture, no light,
// no pass, no shadow). A bird is a 39-triangle faceted body (3-sided rings: torso, neck, head with two glowing eyes, beak, 3-triangle tail fan, two
// 4-triangle wings, two leg slivers) built in a NEUTRAL pose; four BODY PLANS (small songbird, swallow/dart, owl/raptor, long-necked crane) and the
// twelve breeds are only 11 rows of numbers (proportions, wing, flap, flight) in a uniform array read by the vertex shader: the shader stretches the same
// 39 triangles into each silhouette, flaps the wings, moves the bird along its path and banks it into the turns. The CPU does not touch an animal per frame.
//
// HOW IT WORKS
//  - WHO: F1 `habitantes` (relieve/fauna.ts) decides who lives in each 32 m cell for each 120 s window. Cells around the camera's cell are asked ONCE
//    (resumable queue, nearest first, <= presupuestoMs per frame), cached, and the instance buffers are rebuilt from the cache only when a cell lands, when
//    the camera crosses a cell border or when the window / part of the day changes. No loop over birds in a normal frame (steady frame: a few uniform writes).
//  - WHERE: the shader evaluates F1 `trayectoria` 1:1 (Lissajous loop around the anchor, see `trayectoriaAve` below for the CPU twin used by tests) from the
//    per-instance anchor / phase, so a bird moves with no CPU. Its heading is the derivative of the path, its roll comes from the curvature (coordinated turn),
//    its pitch from the vertical speed. FLOCKS: a flock member (index m of n) shares the leader's path; its offset (V or cloud, with a slow bob) is computed
//    in the shader from m. Songbirds add bounding-flight arcs (flap while climbing, wings folded while falling), the hummingbird hovers (stop-and-go time warp
//    of the same path), raptors and cranes flap in short bursts and glide in between.
//  - CLEARANCE: when a cell is read, the path of each animal is sampled (16 points) against `alturaEn` and the anchor is lifted until the whole loop clears the ground.
//  - APPEAR / VANISH: scale by F1 `fundido` (4 s in, 4 s out at the window edges), a 1.5 s scale-in for a bird that enters the pool, and a distance fade that
//    only happens far away (beyond the tier's view). Far birds (> `lejosM`) morph, in the same mesh, to a 5-triangle silhouette: every vertex has a second
//    «far pose» and the other triangles collapse to a point (degenerate triangles cost no fragments).
//  - LOOK: flat colour, faceted (flat-shaded Phong with a soft specular = brushed metal), two-tone plumage from the breed colours (back = `ala`, belly =
//    `cuerpo`, wing tips darker), a CIRCUIT LINE along the back, the wings and the tail (a thin line in `circuito` colour whose light runs along it), two
//    glowing eyes and a soft chest lamp in `luz` colour that pulses with the breed's `luz` rhythm (fijo, latido, parpadeo, onda, respiro, estrobo, morse, prisma).
//    Glow is emissive (not lit), so it stays bright in dusk and fog.
//
// COPIED (ideas and technique only, no code or assets): the bird-in-shader idea of instanced boids (three.js `webgpu_*` instanced examples, MIT; the classic
// GPU flocking demos) without the simulation; the coordinated-turn bank angle atan(v·ω/g) from any flight-dynamics textbook; bounding flight / flap-glide
// cycles from bird flight biology (the woodpecker/finch «flap-bound» gait, raptor «thermal soaring»); the golden-ratio (R2) sequence of Martin Roberts to
// scatter a cloud from the member index; low-poly bird silhouettes as SHAPE reference only (Quaternius / Kenney CC0 birds, nothing imported).
// CHANGED: one parametric rig (4 plans · 12 breeds as numbers) instead of one mesh per breed; the motion is a closed form, not a simulation; the far LOD is a
// second pose of the same vertices instead of a second mesh. COMBINED: F1 table + `trayectoria`, the engine wind uniform `vientoU`, tiers of `calidad.ts`.
import * as THREE from "three/webgpu";
import {
  uniform, uniformArray, attribute, float, vec3, vec4, int, positionLocal, sin, cos, atan, sqrt, abs, min, max, clamp, smoothstep, mix, select, fract, floor,
  ceil, step, length, pow, mod, oneMinus,
} from "three/tsl";
import { habitantes, trayectoria, especiesDe, ventanaDe, fundido, faseDelDia, FAUNA_POR_NIVEL, CELDA_M, VENTANA_S, LUCES_FAUNA } from "../../../relieve/src/fauna.ts";
import type { Habitante, Especie, TablaFauna } from "../../../relieve/src/fauna.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "./terreno.ts";
import { CASA, MAQUINA } from "./paleta.ts";
import { RAREZA_FACTOR } from "./mariposas.ts";

const TAU = Math.PI * 2;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any; // TSL nodes are a fluent API whose generic types fight the compiler; every use below is covered by the build tests.

// ------------------------------------------------------------------------------------------------------------------------ body plans and breeds
/** The numbers that turn the neutral 39-triangle bird into a breed. Lengths are fractions of the wing span (`tamano` of the table), except `hop` (m). */
export type Forma = {
  /** torso: length, half width, half height */
  L: number; gx: number; gy: number;
  /** head radius; neck forward / up; beak length, droop and base width (1 = like the head) */
  headR: number; neckF: number; neckU: number; beakL: number; beakDrop: number; beakW: number;
  /** tail: length, half width at the tip and at the root, fork depth 0…1 (centre feathers shorter); trailing legs */
  tailL: number; tailTipW: number; tailRootW: number; tailFork: number; legL: number;
  /** wing: chord at the root and the tip, sweep back of the tip, dihedral (rad) */
  cR: number; cT: number; sweep: number; dihedral: number;
  /** flap rate (Hz) and amplitude (rad); glide 0 = always flapping … 1 = bursts then soaring; bounding-flight arc (m); flock shape 0 = cloud, 1 = V */
  hz: number; amp: number; glide: number; hop: number; form: number;
  /** extra bank multiplier; hover 0…1 (stop-and-go of the path); nose-up tilt while hovering (rad) */
  bank: number; hover: number; tilt: number;
};
export type PlanAve = "cantor" | "dardo" | "rapaz" | "zancuda";
export const PLANES: Record<PlanAve, Forma> = {
  cantor: { L: 0.6, gx: 0.1, gy: 0.1, headR: 0.08, neckF: 0.02, neckU: 0.02, beakL: 0.07, beakDrop: 0.01, beakW: 0.55, tailL: 0.34, tailTipW: 0.11, tailRootW: 0.035, tailFork: 0.15, legL: 0.03,
    cR: 0.3, cT: 0.12, sweep: 0.1, dihedral: 0.12, hz: 9, amp: 0.85, glide: 0, hop: 0.45, form: 0, bank: 1, hover: 0, tilt: 0 },
  dardo: { L: 0.5, gx: 0.075, gy: 0.075, headR: 0.075, neckF: 0.01, neckU: 0.01, beakL: 0.04, beakDrop: 0.005, beakW: 0.8, tailL: 0.42, tailTipW: 0.05, tailRootW: 0.03, tailFork: 0.6, legL: 0.02,
    cR: 0.2, cT: 0.035, sweep: 0.36, dihedral: 0.05, hz: 7.5, amp: 0.55, glide: 0.5, hop: 0, form: 0, bank: 1.6, hover: 0, tilt: 0 },
  rapaz: { L: 0.42, gx: 0.1, gy: 0.1, headR: 0.075, neckF: 0.03, neckU: 0.03, beakL: 0.045, beakDrop: 0.03, beakW: 0.7, tailL: 0.27, tailTipW: 0.12, tailRootW: 0.04, tailFork: 0, legL: 0.1,
    cR: 0.34, cT: 0.14, sweep: 0.05, dihedral: 0.1, hz: 2.4, amp: 0.6, glide: 0.88, hop: 0, form: 0, bank: 1.8, hover: 0, tilt: 0 },
  zancuda: { L: 0.34, gx: 0.05, gy: 0.055, headR: 0.035, neckF: 0.32, neckU: 0.04, beakL: 0.1, beakDrop: 0.005, beakW: 0.5, tailL: 0.12, tailTipW: 0.06, tailRootW: 0.03, tailFork: 0.1, legL: 0.36,
    cR: 0.2, cT: 0.08, sweep: 0.06, dihedral: 0.04, hz: 1.9, amp: 0.5, glide: 0.8, hop: 0, form: 1, bank: 1.4, hover: 0, tilt: 0 },
};
/** The twelve breeds of the house table: their plan and what differs from it. Unknown ids (a world's own table) fall back on `planPorTamano`. */
export const RAZAS_AVE: Record<string, { plan: PlanAve; sobre: Partial<Forma> }> = {
  "gorrion-laton": { plan: "cantor", sobre: { hop: 0.5, amp: 0.9 } },
  "paloma-engranajes": { plan: "cantor", sobre: { L: 0.6, gx: 0.13, gy: 0.13, headR: 0.07, beakL: 0.05, tailL: 0.3, tailTipW: 0.13, cR: 0.34, cT: 0.17, sweep: 0.08, hz: 5.5, amp: 0.8, hop: 0, dihedral: 0.2 } },
  "estornino-cobre": { plan: "cantor", sobre: { L: 0.56, tailL: 0.26, beakL: 0.1, beakW: 0.45, hz: 8, hop: 0.3, sweep: 0.14, cT: 0.09 } },
  "golondrina-bobina": { plan: "dardo", sobre: {} },
  "petirrojo-valvula": { plan: "cantor", sobre: { L: 0.5, gx: 0.135, gy: 0.135, headR: 0.095, tailL: 0.3, hop: 0.5 } },
  "colibri-filamento": { plan: "cantor", sobre: { L: 0.5, gx: 0.07, gy: 0.07, headR: 0.09, beakL: 0.3, beakW: 0.2, beakDrop: 0.02, tailL: 0.28, tailTipW: 0.09, cR: 0.2, cT: 0.07, sweep: 0, dihedral: 0.35, hz: 24, amp: 0.9, hop: 0, hover: 0.96, tilt: 0.5 } },
  "mirlo-lente": { plan: "cantor", sobre: { gx: 0.11, gy: 0.11, headR: 0.085, beakL: 0.09, tailL: 0.42, tailTipW: 0.1, hop: 0.55, hz: 8 } },
  "martin-zafiro": { plan: "dardo", sobre: { headR: 0.13, beakL: 0.22, beakW: 0.5, tailL: 0.16, tailFork: 0, tailTipW: 0.09, cR: 0.22, cT: 0.09, sweep: 0.12, L: 0.5, hz: 11, amp: 0.7, glide: 0.2, gx: 0.09, gy: 0.09 } },
  "buho-relojeria": { plan: "rapaz", sobre: { L: 0.42, gx: 0.15, gy: 0.16, headR: 0.14, neckF: 0, neckU: 0, beakL: 0.03, beakW: 0.6, tailL: 0.16, tailTipW: 0.1, cR: 0.38, cT: 0.22, sweep: 0.02, hz: 3.6, amp: 0.55, glide: 0.35, legL: 0.08, bank: 1 } },
  "cuervo-hierro": { plan: "rapaz", sobre: { L: 0.55, gx: 0.11, gy: 0.11, headR: 0.08, beakL: 0.11, beakW: 0.85, tailL: 0.3, cR: 0.26, cT: 0.13, sweep: 0.08, hz: 3.2, amp: 0.7, glide: 0.5, bank: 1.4 } },
  "grulla-ambar": { plan: "zancuda", sobre: {} },
  "aguila-astrolabio": { plan: "rapaz", sobre: { L: 0.38, gx: 0.09, gy: 0.09, headR: 0.06, neckF: 0.05, beakL: 0.06, beakDrop: 0.04, tailL: 0.22, tailTipW: 0.13, cR: 0.36, cT: 0.22, sweep: 0, hz: 1.6, amp: 0.5, glide: 0.95, bank: 2.2 } },
};
/** Plan for a bird the house table does not know: by size and speed. */
export function planPorTamano(e: Pick<Especie, "tamano" | "vuelo">): PlanAve {
  if (e.tamano >= 1.5) return "zancuda";
  if (e.tamano >= 0.8) return "rapaz";
  if (e.vuelo.velocidad >= 8.5 && e.tamano < 0.45) return "dardo";
  return "cantor";
}
export function formaDe(e: Pick<Especie, "id" | "tamano" | "vuelo">): { plan: PlanAve; forma: Forma } {
  const r = RAZAS_AVE[e.id], plan = r?.plan ?? planPorTamano(e);
  return { plan, forma: { ...PLANES[plan], ...(r?.sobre ?? {}) } };
}

/** Floats per breed row in the shader table: 11 × vec4. */
export const NK = 11;
const color = new THREE.Color();
/** The 11 vec4 (as 44 numbers) of a breed. 0 cuerpo+tam · 1 ala+rarity(0 común … 1 legendaria) · 2 circuito+pulso · 3 luz+hz · 4 L,gx,gy,headR · 5 neckF,neckU,beakL,beakDrop · 6 tailL,tipW,fork,legL ·
 *  7 cR,cT,sweep,dihedral · 8 amp,glide,hop,form · 9 radio,vel,dAlt,hover · 10 bank,tilt,rootW,beakW. Colours are linear (THREE.Color converts from sRGB). */
export function filaEspecie(e: Especie): number[] {
  const { forma: f } = formaDe(e), rgb = (hex: number) => { color.setHex(hex); return [color.r, color.g, color.b]; };
  return [
    ...rgb(e.colores.cuerpo), e.tamano, ...rgb(e.colores.ala), RAREZA_FACTOR[e.rareza] ?? 0, ...rgb(e.colores.circuito), Math.max(0, LUCES_FAUNA.indexOf(e.luz)), ...rgb(e.colores.luz), f.hz,
    f.L, f.gx, f.gy, f.headR, f.neckF, f.neckU, f.beakL, f.beakDrop, f.tailL, f.tailTipW, f.tailFork, f.legL, f.cR, f.cT, f.sweep, f.dihedral, f.amp, f.glide, f.hop, f.form,
    e.vuelo.radio, e.vuelo.velocidad, e.vuelo.altura[1] - e.vuelo.altura[0], f.hover, f.bank, f.tilt, f.tailRootW, f.beakW,
  ];
}

// ------------------------------------------------------------------------------------------------------------------------ path (the CPU twin of the shader)
/** Hover stop-and-go cycle (s) of the hummingbird. */
export const CICLO_COLIBRI = 4;
/** Bounding-flight cycle (s) of songbirds. */
export const CICLO_SALTO = 0.8;
/** The time the path is evaluated at, with the hover warp (hover = 0 → t). Mirrors the shader. */
export const tauAve = (t: number, hover: number) => (hover > 0 ? t - ((hover * CICLO_COLIBRI) / TAU) * Math.cos((t * TAU) / CICLO_COLIBRI) : t);
/** Where the LEADER of an animal is `t` seconds into its window (F1 `trayectoria`, with the hover warp). Pure. */
export function trayectoriaAve(h: Habitante, e: Pick<Especie, "vuelo">, t: number, hover = 0, fuera = { x: 0, y: 0, z: 0 }) {
  return trayectoria(h, e, tauAve(t, hover), fuera);
}
/** Flock offset (m) of member `m` of `n` in the leader's frame: lateral (left +), up, back (behind +). V or cloud. The shader twin is in `materialAves`. */
export function desfaseMiembro(form: number, m: number, tam: number, semilla01: number): { lat: number; up: number; atras: number } {
  if (m <= 0) return { lat: 0, up: 0, atras: 0 };
  const fr = (v: number) => v - Math.floor(v);
  if (form >= 0.5) { const k = Math.ceil(m / 2), s = m % 2 === 1 ? 1 : -1, sp = 2.8 * tam + 1; return { lat: s * k * sp, up: 0.12 * k * sp * (m % 2 ? 1 : -1) * 0.5, atras: k * sp * 0.9 }; }
  const Rc = 1.6 + 4 * tam, u1 = fr(0.5 + m * 0.7548776662466927 + semilla01), u2 = fr(0.5 + m * 0.5698402909980532 + semilla01 * 1.7), u3 = fr(0.5 + m * 0.4142135623730951 + semilla01 * 0.6);
  const a = u1 * TAU, rr = Math.sqrt(u2) * Rc;
  return { lat: Math.cos(a) * rr, up: (u3 - 0.5) * Rc * 0.55, atras: Math.sin(a) * rr * 1.3 - rr * 0.25 };
}

// ------------------------------------------------------------------------------------------------------------------------ geometry
const P_TORSO = 0, P_CUELLO = 1, P_CABEZA = 2, P_PICO = 3, P_COLA = 5, P_ALA = 6, P_PATA = 7;
const APAGADO = 99;
type R3 = [number, number, number];
type Vtx = { r: R3; t: number; far: [number, number, number, number]; part: number; side: number; w: [number, number, number, number]; u: [number, number, number, number]; pl: number };
/** w = (share of `ala`, share of `cuerpo`, share of `luz` glow, shade). u = (line 1 distance, line 2 distance, line 1 flow, line 2 flow). */
/** `pl` (R3) = how much of the vertex is a brass/copper PLATE (0 = the breed's plumage colour, 1 = polished plate); 2 = the dorsal valve tip. */
const V = (part: number, r: R3, w: [number, number, number, number], o: { t?: number; side?: number; far?: Partial<{ r: R3; t: number }>; u?: [number, number, number, number]; pl?: number } = {}): Vtx => {
  const t = o.t ?? 0, fr = o.far?.r ?? r;
  return { r, t, far: [fr[0], fr[1], fr[2], o.far?.t ?? t], part, side: o.side ?? 0, w, u: o.u ?? [APAGADO, APAGADO, 0, 0], pl: o.pl ?? 0 };
};

export type GeometriaAve = { geometria: THREE.BufferGeometry; triangulos: number; triangulosLejos: number; vertices: number };
let cache: GeometriaAve | null = null;
/** The neutral 39-triangle bird (non-indexed: every triangle owns its three vertices). Built once, shared by every piece. */
export function geometriaAve(): GeometriaAve {
  if (cache) return cache;
  const T: Vtx[] = [];
  const tri = (a: Vtx, b: Vtx, c: Vtx) => T.push(a, b, c);
  const anillo = (A: Vtx[], B: Vtx[]) => { for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(A[i], A[j], B[i]); tri(A[j], B[j], B[i]); } };
  const TIP: R3 = [0, 0, -0.5];
  const linea = (x: number, z: number, ancho = 0.16): [number, number, number, number] => [x / ancho, APAGADO, z * 16, 0];

  // ---- torso (9): tail end + 2 rings (ridge on top, flat belly) ----
  const tip = V(P_TORSO, TIP, [1, 0, 0, 0.88], { u: linea(0, -0.5) });
  // R3: the middle back vertex rises into a small dorsal VALVE / turbine stack (no extra triangle: the ring-1 ridge is pulled up and tinted brass)
  const ring1 = [[0, 1.85, -0.22], [0.62, -0.35, -0.25], [-0.62, -0.35, -0.25]] as R3[];
  const ring2 = [[0, 1, 0.22], [1, -0.45, 0.22], [-1, -0.45, 0.22]] as R3[];
  const peso = (i: number, lamp: number): [number, number, number, number] => (i === 0 ? [1, 0, 0, 1] : [0.12, 0.88, lamp, 0.84]);
  const R1 = ring1.map((r, i) => V(P_TORSO, r, peso(i, 0), { far: { r: TIP }, u: linea(r[0], r[2]), pl: i === 0 ? 2 : 0.7 }));
  const R2 = ring2.map((r, i) => V(P_TORSO, r, peso(i, 0.4), { far: i === 0 ? { r: TIP } : {}, u: linea(r[0], r[2]), pl: i === 0 ? 0.25 : 1 }));
  for (let i = 0; i < 3; i++) tri(tip, R1[i], R1[(i + 1) % 3]);
  anillo(R1, R2);

  // ---- neck (6): from the chest ring to the back of the head ----
  const h0 = [[0, 0.85, -0.55], [0.8, -0.45, -0.55], [-0.8, -0.45, -0.55]] as R3[];
  const cuelloW = (i: number): [number, number, number, number] => (i === 0 ? [0.8, 0.2, 0, 0.95] : [0.1, 0.9, 0, 0.82]);
  const N0 = ring2.map((r, i) => V(P_CUELLO, r, cuelloW(i), { t: 0, far: { r: TIP, t: 0 }, u: linea(r[0], 0), pl: i === 0 ? 0.25 : 1 }));
  const N1 = h0.map((r, i) => V(P_CUELLO, r, cuelloW(i), { t: 1, far: { r: TIP, t: 0 } }));
  anillo(N0, N1);

  // ---- head (6) + beak (3): back ring, face ring, beak tip (the face ring collapses to the tip in the far pose) ----
  const cabW = (i: number): [number, number, number, number] => (i === 0 ? [0.55, 0.45, 0, 1] : [0.05, 0.95, 0, 0.9]);
  const H0 = h0.map((r, i) => V(P_CABEZA, r, cabW(i), { far: { r: i === 0 ? [0, -0.05, 0.35] : r } }));
  const h1 = [[0, 0.38, 0.35], [0.38, -0.25, 0.35], [-0.38, -0.25, 0.35]] as R3[], punta: R3 = [0, -0.05, 0.35];
  const H1 = h1.map((r, i) => V(P_PICO, r, cabW(i === 0 ? 1 : 2), { t: 0, far: { r: punta, t: 1 } }));
  const BP = V(P_PICO, punta, [0.1, 0.55, 0.35, 0.7], { t: 1 });
  anillo(H0, H1);
  for (let i = 0; i < 3; i++) tri(H1[i], H1[(i + 1) % 3], BP);

  // ---- two eyes (2): a small triangle on each side face of the head, nudged out; collapse in the far pose ----
  const sub = (a: R3, b: R3): R3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: R3): R3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cen: R3 = [(h0[0][0] + h0[1][0] + h1[1][0] + h1[0][0]) / 4, (h0[0][1] + h0[1][1] + h1[1][1] + h1[0][1]) / 4, (h0[0][2] + h0[1][2] + h1[1][2] + h1[0][2]) / 4];
  const a = norm(sub(h1[1], h0[1])), b = norm(sub(h0[0], h0[1])), nu = norm([0.82, 0.5, 0.27]), c: R3 = [cen[0] + nu[0] * 0.05, cen[1] + nu[1] * 0.05, cen[2] + nu[2] * 0.05];
  const at = (s: number, p: number, q: number): R3 => [c[0] + b[0] * p + a[0] * q, c[1] + b[1] * p + a[1] * q, c[2] + b[2] * p + a[2] * q].map((v, k) => (k === 0 ? v * s : v)) as R3;
  for (const s of [1, -1]) {
    const f = { far: { r: h0[1] } };
    tri(V(P_CABEZA, at(s, 0.16, 0), [0, 1, 1, 1], f), V(P_CABEZA, at(s, -0.12, -0.15), [0, 1, 1, 1], f), V(P_CABEZA, at(s, -0.12, 0.15), [0, 1, 1, 1], f));
  }

  // ---- tail fan (3): root pair + three tip points; the middle one is shortened by the fork. Far: one triangle ----
  const colaW = (z: number): [number, number, number, number] => [0.78, 0.22, 0, 0.92 - 0.2 * z];
  const RL = V(P_COLA, [-1, 0, 0], colaW(0), { u: [-1 / 0.16, APAGADO, 0, 0] }), RR = V(P_COLA, [1, 0, 0], colaW(0), { u: [1 / 0.16, APAGADO, 0, 0] });
  const TLf = V(P_COLA, [-1, 0, 1], colaW(1), { far: { r: [-1, 0, 0] }, u: [-1 / 0.16, APAGADO, 10, 0] });
  const TRf = V(P_COLA, [1, 0, 1], colaW(1), { far: { r: [1, 0, 0] }, u: [1 / 0.16, APAGADO, 10, 0] });
  const TC = V(P_COLA, [0, 0, 1], colaW(1), { t: 1, far: { t: 0 }, u: [0, APAGADO, 10, 0] });
  tri(RL, TLf, TC); tri(RR, TC, TRf); tri(RL, TC, RR);

  // ---- wings (4 each): inner panel (2), outer panel, trailing feather. u = span 0…1 (|x|), v = chord 0 (leading edge)…1 (trailing). Far: one triangle ----
  const alaW = (u: number): [number, number, number, number] => [0.92 - 0.35 * u, 0.08 + 0.35 * u, 0, 1 - 0.3 * u * u];
  for (const s of [1, -1]) {
    const W = (u: number, v: number, far?: R3) => V(P_ALA, [s * u, 0, v], alaW(u), { side: s, far: far ? { r: far } : undefined, u: [(v - 0.5) / 0.07, (v - 0.8) / 0.045, u * 12, u * 9 + 3], pl: u < 0.01 ? 1 : u < 0.6 ? 0.55 : 0 });  // R3: root + inner panel brass plating, outer panel = glass/plumage
    const T0: R3 = [s * 1, 0, 0.25];
    const Rf = W(0, 0), Rb = W(0, 1), Mf = W(0.55, 0, T0), Mb = W(0.55, 1.05, T0), Tt = W(1, 0), Tb = W(0.8, 1.3, T0);
    tri(Rf, Rb, Mb); tri(Rf, Mb, Mf); tri(Mf, Mb, Tt); tri(Mb, Tb, Tt);
  }

  // ---- trailing legs (2): a sliver each (tucked on most breeds, long on the crane); collapse in the far pose ----
  for (const s of [1, -1]) {
    const L = (x: number, z: number) => V(P_PATA, [x, 0, z], [0.1, 0.9, 0, 0.55], { side: s, far: { r: [0, 0, 0] } });
    tri(L(0, 0), L(1, 0), L(0.5, 1));
  }

  const n = T.length, pos = new Float32Array(n * 3), far = new Float32Array(n * 4), aK = new Float32Array(n * 4), aC = new Float32Array(n * 4), aU = new Float32Array(n * 4);
  T.forEach((v, i) => { pos.set(v.r, i * 3); far.set(v.far, i * 4); aK.set([v.part, v.t, v.side, v.pl], i * 4); aC.set(v.w, i * 4); aU.set(v.u, i * 4); });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aF", new THREE.BufferAttribute(far, 4)); g.setAttribute("aK", new THREE.BufferAttribute(aK, 4));
  g.setAttribute("aC", new THREE.BufferAttribute(aC, 4)); g.setAttribute("aU", new THREE.BufferAttribute(aU, 4));
  // far pose triangles that still have area: counted in the NEUTRAL layout (area of the far rest coordinates through a unit mapping per part)
  cache = { geometria: g, triangulos: n / 3, triangulosLejos: contarLejos(T), vertices: n };
  return cache;
}
/** Triangles of the far pose that keep an area (a vertex can sit on another's far position; those collapse). Rest coordinates are compared per part. */
function contarLejos(T: Vtx[]): number {
  let k = 0;
  const key = (v: Vtx) => `${v.part === P_CUELLO ? 0 : v.part === P_PICO ? 2 : v.part}|${v.side}|${v.far.map((x) => x.toFixed(3)).join(",")}`;
  for (let i = 0; i < T.length; i += 3) {
    const ks = [key(T[i]), key(T[i + 1]), key(T[i + 2])];
    if (new Set(ks).size === 3) k++;
  }
  return k;
}
export const TRIANGULOS_AVE = 39;

// ------------------------------------------------------------------------------------------------------------------------ material (TSL)
export type EntradaMaterial = {
  viento: unknown; tiempo: unknown; camara: unknown; tabla: unknown; lejos: number; lejosFin: number; desvanece: number; desvaneceFin: number;
};
const luz3 = (n: N) => n as N;
/** The bird material: instance attributes iA (anchor x,y,z · phase) iB (window start · breed · member · flock size) iC (loop phase q · entered at · seed · exposed yaw+1). */
export function materialAves(e: EntradaMaterial): THREE.MeshPhongNodeMaterial {
  const mat = new THREE.MeshPhongNodeMaterial({ side: THREE.DoubleSide, flatShading: true, shininess: 46, specular: new THREE.Color(0x8d96a3) });
  mat.name = "aves"; mat.forceSinglePass = true;
  const uT = e.tiempo as N, uCam = e.camara as N, K = e.tabla as N, wind = e.viento as N;
  const iA = attribute("iA", "vec4") as N, iB = attribute("iB", "vec4") as N, iC = attribute("iC", "vec4") as N;
  const aF = attribute("aF", "vec4") as N, aK = attribute("aK", "vec4") as N, aC = attribute("aC", "vec4") as N;
  const row = int(iB.y).mul(NK) as N, R = (k: number) => K.element(row.add(k)) as N;
  const k0 = R(0), k1 = R(1), k2 = R(2), k3 = R(3), k4 = R(4), k5 = R(5), k6 = R(6), k7 = R(7), k8 = R(8), k9 = R(9), k10 = R(10);

  // ---- clock: seconds into the window (the world clock is passed mod 7200, a multiple of 120, so floats stay exact) ----
  const wrap = (d: N) => d.add(select(d.lessThan(-3600), float(7200), float(0)));
  const tl = wrap((uT as N).sub(iB.x)) as N;
  const fase = iA.w as N, m = iB.z as N, nSize = iB.w as N, semilla = iC.z as N;
  const expo = iC.w.greaterThan(0.5) as N;                       // exposed (photo / aviary): fixed place and heading, no path
  const fund = clamp(min(tl.div(4), float(VENTANA_S).sub(tl).div(4)), 0, 1) as N;
  const entra = smoothstep(0, 1.5, wrap(uT.sub(iC.y))) as N;
  const tam = k0.w as N;
  const tj = fract(semilla.mul(7).add(m.mul(0.37)).add(fase.mul(3.1))) as N;                  // R3: one per-bird random 0…1 (size, tone, wing-beat)
  const jitter = fract(semilla.mul(7).add(m.mul(0.37))).mul(0.24).add(0.88) as N;

  // ---- the path: F1 `trayectoria` 1:1 (Lissajous around the anchor), with the hummingbird's stop-and-go warp ----
  const r = k9.x as N, vel = k9.y as N, dAlt = k9.z as N, hover = k9.w as N;
  const w = vel.div(max(r, 0.5)) as N, p = fase.mul(TAU) as N, q = iC.x as N;
  const ph = tl.mul(TAU / CICLO_COLIBRI) as N;
  const tau = tl.sub(hover.mul(CICLO_COLIBRI / TAU).mul(cos(ph))) as N, rate = hover.mul(sin(ph)).add(1) as N;
  const a1 = w.mul(tau).add(p) as N, a2 = w.mul(tau).mul(1.31).add(q) as N, a3 = w.mul(tau).mul(2.3).add(p).add(q) as N;
  const ra = r.mul(0.7) as N;
  const lx = ra.mul(sin(a1)) as N, lz = ra.mul(sin(a2)) as N, ly = dAlt.mul(0.15).mul(sin(a3)) as N;
  const vx0 = ra.mul(w).mul(cos(a1)).add(1e-4) as N, vz0 = ra.mul(w).mul(1.31).mul(cos(a2)).add(1e-4) as N, vy0 = dAlt.mul(0.15).mul(2.3).mul(w).mul(cos(a3)) as N;
  const ax = ra.mul(w).mul(w).mul(sin(a1)).negate().mul(rate).mul(rate) as N, az = ra.mul(w).mul(w).mul(1.7161).mul(sin(a2)).negate().mul(rate).mul(rate) as N;
  const sp0 = sqrt(vx0.mul(vx0).add(vz0.mul(vz0))) as N, sp = sp0.mul(rate) as N;
  // bounding flight (songbirds): arcs of CICLO_SALTO s, wings folded while falling
  const hopH = k8.z as N, sj = fract(tl.div(CICLO_SALTO).add(fase.mul(0.7)).add(m.mul(0.21))) as N;
  const arco = hopH.mul(sj).mul(oneMinus(sj)).mul(4) as N, arcoV = hopH.mul(4).mul(oneMinus(sj.mul(2))).div(CICLO_SALTO) as N;
  const plega = smoothstep(0.52, 0.66, sj).mul(step(0.001, hopH)) as N;
  const vy = vy0.mul(rate).add(arcoV) as N;
  // heading, bank (coordinated turn) and pitch
  const yaw = atan(vx0, vz0) as N;
  const giro = vz0.mul(ax).sub(vx0.mul(az)).div(sp0.mul(sp0)) as N;                      // d(yaw)/dt
  const bank = clamp(atan(giro.mul(sp).mul(2.5 / 9.81).mul(k10.x)), -0.85, 0.85).add(sin(tl.mul(1.3).add(m.mul(2.1))).mul(0.05)) as N;
  const pitch = clamp(atan(vy.div(max(sp, 0.5))), -0.6, 0.6).add(k10.y.mul(oneMinus(clamp(rate, 0, 1)))) as N;
  const cy = cos(yaw) as N, sy = sin(yaw) as N;
  // flock member offset in the leader's frame (V for form = 1, cloud for 0)
  const mm = max(m, 0) as N, kv = ceil(mm.div(2)) as N, spV = tam.mul(2.8).add(1) as N, signV = select(mod(mm, 2).greaterThan(0.5), float(1), float(-1)) as N;
  const Rc = tam.mul(4).add(1.6) as N;
  const u1 = fract(mm.mul(0.7548776662466927).add(0.5).add(semilla)) as N, u2 = fract(mm.mul(0.5698402909980532).add(0.5).add(semilla.mul(1.7))) as N, u3 = fract(mm.mul(0.4142135623730951).add(0.5).add(semilla.mul(0.6))) as N;
  const ang = u1.mul(TAU) as N, rr = sqrt(u2).mul(Rc) as N;
  const isV = k8.w.greaterThan(0.5) as N;
  const lat = select(isV, signV.mul(kv).mul(spV), cos(ang).mul(rr)) as N;
  const upo = select(isV, signV.mul(kv).mul(spV).mul(0.06), u3.sub(0.5).mul(Rc).mul(0.55)) as N;
  const atr = select(isV, kv.mul(spV).mul(0.9), sin(ang).mul(rr).mul(1.3).sub(rr.mul(0.25))) as N;
  const bob = Rc.mul(0.12) as N, mf = step(0.5, mm) as N;
  const dl = lat.add(sin(tl.mul(0.9).add(m.mul(1.7))).mul(bob)).mul(mf) as N;
  const du = upo.add(sin(tl.mul(1.3).add(m.mul(2.9))).mul(bob).mul(0.6)).mul(mf) as N;
  const da = atr.add(sin(tl.mul(0.7).add(m.mul(3.3))).mul(bob)).mul(mf) as N;
  const yawF = select(expo, iC.w.sub(1), yaw) as N;
  const fx = sin(yawF), fz = cos(yawF), lxd = fz, lzd = fx.negate();                    // forward (sin, cos) and left (cos, -sin) in x,z
  const pm = select(expo, float(0), float(1)) as N;                                        // exposed: no path, but the flock offsets still apply
  const centroF = vec3(
    iA.x.add(lx.mul(pm)).add(lxd.mul(dl)).sub(fx.mul(da)),
    iA.y.add(ly.mul(pm)).add(arco.mul(pm)).add(du),
    iA.z.add(lz.mul(pm)).add(lzd.mul(dl)).sub(fz.mul(da)),
  ) as N;
  const bankF = select(expo, float(0), bank) as N, pitchF = select(expo, float(0), pitch) as N;

  // ---- visibility: fundido at the window edges, scale-in when it enters, fade far away; far LOD morph ----
  const dist = length((centroF as N).sub(uCam)) as N;
  const lejosK = smoothstep(e.lejos, e.lejosFin, dist) as N;
  const vis = oneMinus(smoothstep(e.desvanece, e.desvaneceFin, dist)) as N;
  const activo = step(m.add(0.5), nSize).mul(step(0.5, nSize)) as N;                  // member index < flock size
  const escala = select(expo, float(1), fund.mul(entra)).mul(vis).mul(activo).mul(tam).mul(jitter) as N;

  // ---- the rig: rest coordinates (near pose morphing to the far pose) → body metres ----
  const part = aK.x as N, side = aK.z as N;
  const rest = mix(vec4(positionLocal.x, positionLocal.y, positionLocal.z, aK.y), aF, lejosK) as N;
  const rx = rest.x as N, ry = rest.y as N, rz = rest.z as N, slot = rest.w as N;
  const L = k4.x as N, gx = k4.y as N, gy = k4.z as N, headR = k4.w as N;
  const neckF = k5.x as N, neckU = k5.y as N, beakL = k5.z as N, beakDrop = k5.w as N;
  const tailL = k6.x as N, tailTipW = k6.y as N, fork = k6.z as N, legL = k6.w as N;
  const cR = k7.x as N, cT = k7.y as N, sweep = k7.z as N, dihedral = k7.w as N;
  const amp = k8.x as N, glide = k8.y as N, tailRootW = k10.z as N, beakW = k10.w as N;
  const isP = (id: number) => part.equal(id) as N;
  const headC = vec3(0, gy.mul(0.2).add(neckU), L.mul(0.22).add(neckF).add(headR.mul(0.55))) as N;
  // torso / neck / head / beak share one blend: neck vertices carry t (0 = chest ring … 1 = back of head); head 2 = plain, 3 = face ring (slot 0) or beak tip (slot 1)
  const th = select(isP(P_CABEZA).or(isP(P_PICO)), float(1), select(isP(P_CUELLO), slot, float(0))) as N;
  const bw = select(isP(P_PICO), beakW, float(1)) as N;
  const ext = select(isP(P_PICO), slot, float(0)) as N;
  const torsoP = vec3(rx.mul(gx), ry.mul(gy), rz.mul(L)) as N;
  const cabezaP = headC.add(vec3(rx.mul(bw).mul(headR), ry.mul(bw).mul(headR).sub(ext.mul(beakDrop)), rz.mul(headR).add(ext.mul(beakL)))) as N;
  const cuerpoP = mix(torsoP, cabezaP, th) as N;
  // tail: rz 0 root … 1 tip; `slot` = 1 on the middle tip feather (shortened by the fork)
  const colaZ = rz.mul(oneMinus(fork.mul(slot))) as N;
  const colaP = vec3(rx.mul(mix(tailRootW, tailTipW, rz)), float(0), L.mul(0.5).add(colaZ.mul(tailL)).negate()) as N;
  // legs: root under the belly, tip trailing behind the tail
  const pataRaiz = vec3(side.mul(gx).mul(rx.mul(0.4).add(0.25)), gy.mul(-0.55), L.mul(-0.12)) as N;
  const pataPunta = vec3(side.mul(gx).mul(0.6), gy.mul(-0.45), L.mul(0.5).add(legL).negate()) as N;
  const pataP = mix(pataRaiz, pataPunta, rz) as N;
  // wing: x = span from the shoulder, z = leading edge swept back − v × chord; flap rotates each vertex about the shoulder line (tip lags)
  const u = abs(rx) as N, v = rz as N;
  const xw = gx.mul(0.5).add(u.mul(float(0.5).sub(gx.mul(0.5)))) as N;
  const cuerda = mix(cR, cT.mul(0.6), u) as N;
  const zl = L.mul(0.18).add(0.02).sub(sweep.mul(pow(max(u, 1e-3), 1.3))).sub(v.mul(cuerda)) as N;
  const hz = k3.w.mul(tj.mul(0.24).add(0.88)) as N, th0 = tl.mul(hz).mul(TAU).add(fase.mul(TAU * 3)).add(m.mul(1.7)) as N;
  const onda = sin(th0.sub(u.mul(1.1))).add(sin(th0.mul(2).add(0.8).sub(u.mul(2))).mul(0.22)) as N;
  const rafaga = smoothstep(0.3, 0.75, sin(tl.mul(TAU / 11).add(fase.mul(TAU)).add(m.mul(0.2)))) as N;
  const env = mix(float(1), rafaga, glide) as N;
  const planeo = sin(tl.mul(1.7).add(fase.mul(9)).add(u.mul(2))).mul(amp).mul(0.1).mul(oneMinus(env)) as N;
  const viento = length((wind as N).xz) as N;
  const aleteo = sin(tl.mul(9).add(u.mul(3)).add(m)).mul(viento.mul(0.004)).mul(u) as N;
  const ang0 = dihedral.mul(mix(float(1), float(0.55), glide.mul(oneMinus(env)))).add(amp.mul(onda).mul(env).mul(u.mul(0.7).add(0.3))).add(planeo).add(aleteo) as N;
  const angA = ang0.mul(oneMinus(plega)) as N;
  const alaX = side.mul(xw.mul(cos(angA))).mul(oneMinus(plega.mul(0.7))) as N;
  const alaY = gy.mul(0.5).add(xw.mul(sin(angA))) as N;
  const alaP = vec3(alaX, alaY, zl) as N;
  const local = select(isP(P_ALA), alaP, select(isP(P_COLA), colaP, select(isP(P_PATA), pataP, cuerpoP))) as N;
  const lv = local.mul(escala) as N;

  // roll → pitch → yaw (aerospace order), then move to the bird's centre
  const cb = cos(bankF) as N, sb = sin(bankF) as N, cp = cos(pitchF) as N, sp_ = sin(pitchF) as N, cyy = cos(yawF) as N, syy = sin(yawF) as N;
  const x1 = lv.x.mul(cb).add(lv.y.mul(sb)) as N, y1 = lv.x.mul(sb).negate().add(lv.y.mul(cb)) as N;
  const y2 = y1.mul(cp).add(lv.z.mul(sp_)) as N, z2 = lv.z.mul(cp).sub(y1.mul(sp_)) as N;
  const x3 = x1.mul(cyy).add(z2.mul(syy)) as N, z3 = x1.mul(syy).negate().add(z2.mul(cyy)) as N;
  mat.positionNode = centroF.add(vec3(x3, y2, z3));

  // ---- colour: two-tone plumage (ala back, cuerpo belly), circuit lines that carry light, glowing eyes + chest lamp ----
  const ala = k1.xyz as N, cuerpo = k0.xyz as N, circ = k2.xyz as N, luzBase = k3.xyz as N, luzId = k2.w as N;
  const ph2 = fase.mul(TAU) as N;
  const es = (id: number) => luzId.equal(id) as N;
  const latido = pow(max(sin(tl.mul(TAU * 1.2).add(ph2)), 0), 6).max(pow(max(sin(tl.mul(TAU * 1.2).add(ph2).sub(1.3)), 0), 6).mul(0.7)).mul(0.75).add(0.25) as N;
  const parpadeo = smoothstep(0.3, 0.38, fract(tl.mul(0.9).add(fase))) as N;
  const ondaL = sin(tl.mul(TAU * 0.5).add(ph2)).mul(0.5).add(0.5) as N;
  const respiro = sin(tl.mul(TAU * 0.2).add(ph2)).mul(0.4).add(0.6) as N;
  const estrobo = step(0.8, fract(tl.mul(3).add(fase))).mul(0.85).add(0.15) as N;
  const morse = step(0.45, fract(floor(tl.mul(4).add(fase.mul(16))).mul(0.7548776662466927).add(0.3))).mul(0.9).add(0.1) as N;
  const pulso = select(es(1), latido, select(es(2), parpadeo, select(es(3), ondaL, select(es(4), respiro, select(es(5), estrobo, select(es(6), morse, select(es(7), float(1), float(1)))))))) as N;
  const hue = vec3(cos(tl.mul(0.9).add(ph2)), cos(tl.mul(0.9).add(ph2).add(2.094)), cos(tl.mul(0.9).add(ph2).add(4.188))).mul(0.5).add(0.5) as N;
  const luz = select(es(7), mix(luzBase, hue, 0.85), luzBase) as N;
  const wl = aC.z as N;
  // R3 materials: the breed's plumage (ala back, cuerpo belly) with PLATES in house brass / copper on torso, neck and wing roots; rarer = more polished
  // (brighter plates + a harder, brighter highlight). Per-bird tone nudge inside the palette (towards bronze or arena, ±12 % brightness).
  const rar = k1.w as N, vRar = rar.toVarying("ave_rar") as N;
  const lc = (hex: number) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b) as N; };
  const plato = mix(mix(lc(MAQUINA.laton), lc(MAQUINA.cobre), step(0.5, rar)), cuerpo, 0.3).mul(rar.mul(0.5).add(0.78)) as N;
  const placa = clamp(aK.w, 0, 1) as N, valvula = clamp(aK.w.sub(1), 0, 1) as N;
  const pelo = ala.mul(aC.x).add(cuerpo.mul(aC.y)) as N;
  const tono = tj.sub(0.5) as N;
  const tonal = mix(mix(pelo, lc(CASA.bronce), step(tono, 0).mul(tono.abs()).mul(0.5)), lc(CASA.arena), step(0, tono).mul(tono).mul(0.4)).mul(tono.mul(0.24).add(1)) as N;
  const colBase = mix(mix(tonal, plato, placa.mul(0.8)), lc(MAQUINA.laton).mul(1.25), valvula).mul(aC.w).mul(oneMinus(wl.mul(0.6))) as N;
  mat.shininessNode = mix(float(12), float(95), vRar) as N;
  mat.specularNode = mix(vec3(0.3, 0.28, 0.26), vec3(0.95, 0.85, 0.6), vRar) as N;
  (mat as N).colorNode = luz3(colBase.toVarying("ave_col"));
  const brillo = luz.mul(wl.add(valvula.mul(0.55))).mul(pulso.mul(0.8).add(0.25)).mul(2.4).toVarying("ave_luz") as N;
  const circuloV = circ.toVarying("ave_cir") as N, pulsoC = pulso.mul(0.5).add(0.5).toVarying("ave_pc") as N;
  const aU = attribute("aU", "vec4") as N;
  const m1 = oneMinus(smoothstep(0.6, 1.0, abs(aU.x))) as N, m2 = oneMinus(smoothstep(0.6, 1.0, abs(aU.y))) as N;
  const f1 = sin(aU.z.sub(uT.mul(5))).mul(0.5).add(0.5) as N, f2 = sin(aU.w.sub(uT.mul(4)).add(1.7)).mul(0.5).add(0.5) as N;
  const lineas = m1.mul(f1.mul(0.9).add(0.55)).add(m2.mul(f2.mul(0.6).add(0.3))) as N;
  (mat as N).emissiveNode = luz3(circuloV.mul(lineas).mul(pulsoC.mul(0.8).add(0.45)).mul(1.15).add(brillo).add(colBase.mul(0.2)));
  return mat;
}

// ------------------------------------------------------------------------------------------------------------------------ the piece
export type FuenteAves = { semilla: number; alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona };
export type HAves = { vientoU: unknown; nivel?: Nivel; camara?: THREE.Object3D; hora: () => number; tabla: TablaFauna };
export type OpcionesAves = {
  /** Add the mesh to this parent; dispose() removes it. */
  escena?: THREE.Object3D;
  /** Device tier; default `h.nivel`. */
  nivel?: Nivel;
  /** 0…1, the world's `fauna.densidad` (default 1). */
  densidad?: number;
  /** The world's `fauna.especies` allow-list (ids); default all. */
  especies?: readonly string[];
  /** CPU budget (ms) per frame for reading cells (default 0.3). */
  presupuestoMs?: number;
  /** Override the pool size (birds) and LOD distance (tests, photos). */
  plazas?: number; lejosM?: number;
};
/** Birds in the pool per tier: worst case = every entry a flock of 8 (the most F1 allows) → ≤ 5.0 k / 3.1 k / 2.2 k / 0.94 k triangles. */
export const PLAZAS_POR_NIVEL: Record<Nivel, number> = { A: FAUNA_POR_NIVEL.A.enVista.pajaro * 3, B: FAUNA_POR_NIVEL.B.enVista.pajaro * 3, C: FAUNA_POR_NIVEL.C.enVista.pajaro * 3, D: FAUNA_POR_NIVEL.D.enVista.pajaro * 3 };
/** Beyond this distance (m) a bird morphs to its 5-triangle silhouette, and it is gone `DESVANECE` m later. */
export const LEJOS_POR_NIVEL: Record<Nivel, number> = { A: 60, B: 48, C: 42, D: 32 };
const DESVANECE = 14;
const LEJOS = 1e6;
const MOD_T = 7200;
const CLEARANCE = (tam: number) => Math.max(2, 1.6 * tam);

type Animal = { h: Habitante; e: number; y: number; semilla01: number };
export type EstadisticasAves = {
  dibujos: number; plazas: number; pajaros: number; entradas: number; triangulosEnviados: number; triangulosPeor: number; celdasLeidas: number; pendientes: number;
  msUltimo: number; msMax: number; reconstrucciones: number;
};

export function crearAves(h: HAves, fuente: FuenteAves, op: OpcionesAves = {}) {
  const nivel = op.nivel ?? h.nivel ?? "A";
  const fnv = FAUNA_POR_NIVEL[nivel], plazas = op.plazas ?? PLAZAS_POR_NIVEL[nivel], lejosM = op.lejosM ?? LEJOS_POR_NIVEL[nivel];
  let presupuesto = op.presupuestoMs ?? 0.3; const densidad = op.densidad ?? 1;
  const especies = especiesDe(h.tabla, "pajaro", op.especies).slice(0, 16);
  const indice = new Map(especies.map((e, i) => [e.id, i]));
  const filas = especies.flatMap((e) => filaEspecie(e));
  const tabla = uniformArray(Array.from({ length: especies.length * NK }, (_, i) => new THREE.Vector4(filas[i * 4], filas[i * 4 + 1], filas[i * 4 + 2], filas[i * 4 + 3])), "vec4");
  const uT = uniform(0), uCam = uniform(new THREE.Vector3(LEJOS, 0, LEJOS));
  const { geometria: base } = geometriaAve();
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ["position", "aF", "aK", "aC", "aU"]) g.setAttribute(k, base.getAttribute(k));
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(plazas * 4), 4), iB = new THREE.InstancedBufferAttribute(new Float32Array(plazas * 4), 4), iC = new THREE.InstancedBufferAttribute(new Float32Array(plazas * 4), 4);
  for (const a of [iA, iB, iC]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("iA", iA); g.setAttribute("iB", iB); g.setAttribute("iC", iC);
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  const mat = materialAves({ viento: h.vientoU, tiempo: uT, camara: uCam, tabla, lejos: lejosM, lejosFin: lejosM + 10, desvanece: lejosM + DESVANECE, desvaneceFin: lejosM + DESVANECE + 16 });
  const malla = new THREE.Mesh(g, mat);
  malla.name = "aves"; malla.matrixAutoUpdate = false; malla.castShadow = false; malla.receiveShadow = false; malla.frustumCulled = true; malla.userData.sinSombra = true;
  op.escena?.add(malla);

  // cells of the ring around the camera's cell (the camera sits anywhere inside it: reach = view + fade + half a cell diagonal)
  const alcance = fnv.radio + 8 + CELDA_M * 0.72, m = Math.ceil(alcance / CELDA_M) + 1;
  const anillo: { dx: number; dz: number }[] = [];
  for (let dz = -m; dz <= m; dz++) for (let dx = -m; dx <= m; dx++) if (Math.hypot(dx, dz) * CELDA_M <= alcance) anillo.push({ dx, dz });
  anillo.sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz) || a.dz - b.dz || a.dx - b.dx);

  const cacheCeldas = new Map<string, Animal[]>();
  let cxA = NaN, czA = NaN, ventanaA = NaN, faseA = "", cola: { cx: number; cz: number; k: string }[] = [], sucio = false, ultimoT = 0, ventanaNueva = false;
  /** When each bird (by id) entered the pool: the shader scales it in over 1.5 s. A whole new window enters «long ago» (F1 `fundido` fades it instead). */
  let entro = new Map<string, number>();
  let celdasLeidas = 0, reconstrucciones = 0, msUltimo = 0, msMax = 0, pajaros = 0, entradas = 0;
  const tmp = { x: 0, y: 0, z: 0 };

  /** Read one cell: F1 `habitantes` (cheap, pure), then lift each anchor until the loop clears the ground (16 samples of its path). */
  function leerCelda(cx: number, cz: number, ventana: number): Animal[] {
    const vivos = habitantes(fuente.semilla, { cx, cz }, ventana, h.tabla, { zonaEn: fuente.zonaEn, alturaEn: fuente.alturaEn, hora: h.hora(), densidad, nivel, especies: op.especies });
    const res: Animal[] = [];
    for (const hab of vivos) {
      const ei = indice.get(hab.especie); if (ei === undefined) continue;
      const e = especies[ei], { forma } = formaDe(e), margen = CLEARANCE(e.tamano) + forma.hop + 0.5 * (1.6 + 4 * e.tamano) * (hab.n > 1 ? 1 : 0);
      let sube = 0;
      for (let k = 0; k < 16; k++) {
        const t = VENTANA_S * ((k * 0.6180339887) % 1);
        trayectoriaAve(hab, e, t, forma.hover, tmp);
        sube = Math.max(sube, fuente.alturaEn(tmp.x, tmp.z) + margen - tmp.y);
      }
      res.push({ h: hab, e: ei, y: hab.y + Math.max(0, sube), semilla01: (hab.semillaPropia % 997) / 997 });
    }
    return res;
  }
  const claveCelda = (cx: number, cz: number, ventana: number, fase: string) => `${ventana}|${fase}|${cx},${cz}`;

  /** Pool = the nearest animals to the camera's cell centre (the camera can be anywhere in it), flocks written member by member, capped at `plazas` birds. */
  function reconstruir(cx0: number, cz0: number, ventana: number, fase: string) {
    const ax = (cx0 + 0.5) * CELDA_M, az = (cz0 + 0.5) * CELDA_M, lista: { a: Animal; d: number }[] = [];
    for (const c of anillo) {
      const celda = cacheCeldas.get(claveCelda(cx0 + c.dx, cz0 + c.dz, ventana, fase)); if (!celda) continue;
      for (const a of celda) lista.push({ a, d: Math.hypot(a.h.x - ax, a.h.z - az) });
    }
    lista.sort((p, q) => p.d - q.d || (p.a.h.id < q.a.h.id ? -1 : 1));
    const t0 = (ventana * VENTANA_S) % MOD_T, nuevo = new Map<string, number>();
    let n = 0, ent = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity, y0 = Infinity, rmax = 0;
    for (const { a } of lista) {
      if (n + a.h.n > plazas || ent >= fnv.enVista.pajaro) continue;
      const e = especies[a.e], ti = entro.get(a.h.id) ?? (ventanaNueva ? ultimoT - 99 : ultimoT);
      nuevo.set(a.h.id, ti);
      for (let mi = 0; mi < a.h.n; mi++, n++) {
        iA.array[n * 4] = a.h.x; iA.array[n * 4 + 1] = a.y; iA.array[n * 4 + 2] = a.h.z; iA.array[n * 4 + 3] = a.h.fase;
        iB.array[n * 4] = t0; iB.array[n * 4 + 1] = a.e; iB.array[n * 4 + 2] = mi; iB.array[n * 4 + 3] = a.h.n;
        iC.array[n * 4] = ((a.h.semillaPropia % 1000) / 1000) * TAU; iC.array[n * 4 + 1] = ti; iC.array[n * 4 + 2] = a.semilla01; iC.array[n * 4 + 3] = 0;
      }
      ent++;
      const R = e.vuelo.radio * 0.7 + 6 + (a.h.n > 1 ? 1.6 + 4 * e.tamano + 4 * e.tamano * a.h.n * 0.3 : 0);
      x0 = Math.min(x0, a.h.x - R); x1 = Math.max(x1, a.h.x + R); z0 = Math.min(z0, a.h.z - R); z1 = Math.max(z1, a.h.z + R);
      y0 = Math.min(y0, a.y - 1); y1 = Math.max(y1, a.y + 0.15 * (e.vuelo.altura[1] - e.vuelo.altura[0]) + 3); rmax = Math.max(rmax, R);
    }
    entro = nuevo; ventanaNueva = false;
    // an empty pool keeps the instance count at 0 (nothing drawn); stale rows beyond n are never read
    g.instanceCount = n; pajaros = n; entradas = ent;
    if (n > 0) {
      const c = g.boundingSphere!.center; c.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.boundingSphere!.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 2;
    }
    iA.clearUpdateRanges(); iB.clearUpdateRanges(); iC.clearUpdateRanges();
    for (const a of [iA, iB, iC]) { if (n > 0) a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    reconstrucciones++;
  }

  /** Call once per frame with the camera and the world clock (seconds). Reads ≤ presupuestoMs of cells; rebuilds the pool only when something changed. */
  function actualizar(camara: THREE.Object3D, tReloj: number) {
    const t0 = performance.now();
    uT.value = ((tReloj % MOD_T) + MOD_T) % MOD_T; ultimoT = uT.value as number;
    const p = camara.position; (uCam.value as THREE.Vector3).copy(p);
    const cx = Math.floor(p.x / CELDA_M), cz = Math.floor(p.z / CELDA_M), ventana = ventanaDe(tReloj), fase = faseDelDia(h.hora());
    if (cx !== cxA || cz !== czA || ventana !== ventanaA || fase !== faseA) {
      if (ventana !== ventanaA || fase !== faseA) ventanaNueva = true;
      cxA = cx; czA = cz; ventanaA = ventana; faseA = fase;
      const quiere = new Set<string>();
      cola = [];
      for (const c of anillo) {
        const k = claveCelda(cx + c.dx, cz + c.dz, ventana, fase); quiere.add(k);
        if (!cacheCeldas.has(k)) cola.push({ cx: cx + c.dx, cz: cz + c.dz, k });
      }
      for (const k of [...cacheCeldas.keys()]) if (!quiere.has(k)) cacheCeldas.delete(k);
      sucio = true;
    }
    const hasta = t0 + presupuesto;
    while (cola.length && performance.now() < hasta) {
      const c = cola.shift()!; cacheCeldas.set(c.k, leerCelda(c.cx, c.cz, ventana)); celdasLeidas++; sucio = true;
    }
    if (sucio) { reconstruir(cx, cz, ventana, fase); sucio = false; }
    msUltimo = performance.now() - t0; if (msUltimo > msMax) msMax = msUltimo;
  }
  /** Read every cell now (loading screen, tests, photos): never call per frame. */
  function llenarTodo(camara: THREE.Object3D, tReloj: number) {
    const antes = presupuesto; presupuesto = 1e9;
    try { actualizar(camara, tReloj); } finally { presupuesto = antes; }
  }
  /** Put birds exactly where you say (photos, an aviary, icons): each `{ especie, x, y, z, rumbo, n? }` stands still facing `rumbo` (rad). Replaces the pool. */
  function exponer(lista: { especie: string; x: number; y: number; z: number; rumbo?: number; fase?: number; n?: number }[], tLocal = 5, tamanoX = 1) {
    let n = 0;
    for (const it of lista) {
      const ei = indice.get(it.especie); if (ei === undefined) continue;
      for (let mi = 0; mi < (it.n ?? 1) && n < plazas; mi++, n++) {
        iA.array.set([it.x, it.y, it.z, it.fase ?? 0.25], n * 4);
        iB.array.set([0, ei, mi, it.n ?? 1], n * 4);
        iC.array.set([0, -99, 0.5, 1 + (it.rumbo ?? 0)], n * 4);
      }
    }
    void tamanoX; exposicionT = tLocal;
    g.instanceCount = n; pajaros = n; entradas = lista.length; cola = []; sucio = false;
    g.boundingSphere!.center.set(0, 5, 0); g.boundingSphere!.radius = 1e4;
    iA.clearUpdateRanges(); iB.clearUpdateRanges(); iC.clearUpdateRanges();
    for (const a of [iA, iB, iC]) { if (n > 0) a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    cxA = NaN; ventanaA = NaN;  // the next actualizar() would refill the ring: exposed pools are for photos only, call actualizar with `congelar`
  }
  let exposicionT = 0;
  /** Photo helper: set the clock so an exposed pool is `tLocal` seconds into its (fake) window. */
  function fijarReloj(camara: THREE.Object3D, tLocal = exposicionT) {
    uT.value = tLocal; (uCam.value as THREE.Vector3).copy(camara.position);
  }
  /** Birds that rasterise something right now for a camera at (x, y, z) at world time `tReloj`: leader positions from the CPU twin of the path (a counter, never per frame). */
  function visibles(x: number, y: number, z: number, tReloj: number) {
    const ventana = ventanaDe(tReloj), t = tReloj - ventana * VENTANA_S, f = fundido(t);
    let cerca = 0, lejos = 0;
    const lista: { a: Animal; ei: number }[] = [];
    for (const c of anillo) { const celda = cacheCeldas.get(claveCelda(cxA + c.dx, czA + c.dz, ventanaA, faseA)); if (celda) for (const a of celda) lista.push({ a, ei: a.e }); }
    let usados = 0, entradasV = 0;
    lista.sort((p, q) => Math.hypot(p.a.h.x - (cxA + 0.5) * CELDA_M, p.a.h.z - (czA + 0.5) * CELDA_M) - Math.hypot(q.a.h.x - (cxA + 0.5) * CELDA_M, q.a.h.z - (czA + 0.5) * CELDA_M));
    for (const { a } of lista) {
      if (usados + a.h.n > plazas || entradasV >= fnv.enVista.pajaro) continue; usados += a.h.n; entradasV++;
      const e = especies[a.e], { forma } = formaDe(e);
      trayectoriaAve(a.h, e, t, forma.hover, tmp);
      const d = Math.hypot(tmp.x - x, a.y - a.h.y + tmp.y - y, tmp.z - z);
      if (f <= 0 || d >= lejosM + DESVANECE + 16) continue;
      if (d >= lejosM) lejos += a.h.n; else cerca += a.h.n;
    }
    return { cerca, lejos, triangulos: cerca * TRIANGULOS_AVE + lejos * geometriaAve().triangulosLejos };
  }
  /** Where each animal of the pool is at world time `tReloj` (flock leader; the CPU twin of the shader path). For tests and photos, not for the frame loop. */
  function lideres(tReloj: number) {
    const ventana = ventanaDe(tReloj), t = tReloj - ventana * VENTANA_S, res: { id: string; especie: string; n: number; x: number; y: number; z: number }[] = [];
    for (const c of anillo) {
      const celda = cacheCeldas.get(claveCelda(cxA + c.dx, czA + c.dz, ventanaA, faseA)); if (!celda) continue;
      for (const a of celda) { const e = especies[a.e]; trayectoriaAve(a.h, e, t, formaDe(e).forma.hover, tmp); res.push({ id: a.h.id, especie: e.id, n: a.h.n, x: tmp.x, y: a.y - a.h.y + tmp.y, z: tmp.z }); }
    }
    return res;
  }
  function estadisticas(): EstadisticasAves {
    return {
      dibujos: 1, plazas, pajaros, entradas, triangulosEnviados: pajaros * TRIANGULOS_AVE, triangulosPeor: plazas * TRIANGULOS_AVE, celdasLeidas, pendientes: cola.length,
      msUltimo, msMax, reconstrucciones,
    };
  }
  function dispose() {
    malla.removeFromParent(); g.dispose(); mat.dispose();
  }
  return { mallas: [malla], malla, actualizar, llenarTodo, exponer, fijarReloj, visibles, lideres, estadisticas, dispose, especies, anillo: anillo.length, lejosM, plazas, geometria: g };
}
export type Aves = ReturnType<typeof crearAves>;
