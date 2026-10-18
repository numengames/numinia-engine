// mariposas (naturaleza F2): the electronic butterflies (day) and fireflies (night) of the F1 fauna table, drawn as TWO instanced draw
// calls — one for every butterfly of all 12 breeds, one for every firefly of all 12 breeds — with no texture, no light, no extra pass,
// no shadow and NO per-animal CPU work per frame.
//
// HOW IT WORKS
//  - WHO is there is F1's pure `habitantes(semilla, celda, ventana, tabla, ctx)` (relieve/fauna.ts): the cells (32 m) around the camera
//    are asked once, kept in a small cache, and the nearest `FAUNA_POR_NIVEL[nivel].enVista` animals of each group are written into two
//    instance buffers. That refill happens ONLY when the camera crosses a cell border or the 120 s window changes, spread over frames
//    (≤ `presupuestoMs` of cells per frame, default 0.3 ms), and the buffers are swapped in one go when the last cell is ready.
//  - WHERE it is each frame is a closed form evaluated in the vertex shader from per-instance attributes (anchor, window start, radius,
//    angular speed, two phases): F1's `trayectoria` (Lissajous loop around the anchor) written ONCE as `trayectoriaOps` over a tiny
//    operator set and instantiated twice: with plain numbers (CPU: tests, `visibles`) and with TSL nodes (GPU). Same source, so the two
//    paths cannot drift; the test checks the number instance against F1's own `trayectoria` and against finite differences.
//    The same trick is used for `fundidoOps` (the fade at the window border) and `pulsoOps` (the 8 light patterns).
//  - A butterfly is one merged geometry (≈ 21 triangles): a 4-triangle spindle body (thin dark metal), a glow dot, two antennae, two
//    wings of 3 triangles each plus two thin «circuit line» slivers per wing (on both faces). Vertex colours are ROLES (wing colour,
//    shadow tone, circuit line, light) resolved against the instance's palette in the shader, so one material draws 12 breeds. The wing
//    tips and the dot are unlit (emissive-looking, they pulse with the breed's light pattern), the rest is shaded by one scalar (day
//    light 1 → night 0.25): no light loop, so it is cheaper than Lambert. Wings flap in the vertex shader (rate per breed, glide
//    bursts), the body bobs, and the animal faces the direction of travel (the derivative of the trajectory).
//  - A firefly is a camera-facing quad (2 triangles; the camera's right/up vectors are uniforms) with a soft round halo + hot core
//    computed in the fragment from the corner coordinate. Additive blending (works the same on WebGPU and on the WebGL2 fallback, no
//    extra pass), no fog (fog + additive would add fog colour: it fades by distance on its own), visible by darkness × the F1 `fundido`.
//    Rare ones are bigger and brighter, epic/legendary get a ring, legendary also a 4-point star, and legendary patterns run slower.
//
// COPIED (ideas and technique only, no code or assets): the instanced attribute pattern of hierba.ts (N3) and particulas.ts (H8: Sprite
//  with additive blend); the Lissajous wander and the cell/window rule of relieve/fauna.ts (F1); the heart-beat / strobe / Morse timing
//  vocabulary of ordinary indicator LEDs; the HSV hue wheel formula (the usual 3-term clamp).
// CHANGED: the instances are not placed per cell slot but compacted (nearest first) so the GPU never sees empty slots; the wander is
//  evaluated on the GPU instead of the CPU; the operator-set trick instead of hand-copying maths.
// COMBINED: F1 table + habitantes, the terrain functions (N1) as `fuente`, calidad.ts tiers, the engine's `vientoU` (kept in the
//  signature for the wind-borne drift of a future version; butterflies do not use it yet).
import * as THREE from "three/webgpu";
import { uniform, attribute, float, vec2, vec3, positionLocal, sin, cos, exp, fract, floor, abs, min, max, step, smoothstep, clamp, mix, normalize, length, sqrt, pow } from "three/tsl";
import { habitantes, ventanaDe, FAUNA_POR_NIVEL, CELDA_M, VENTANA_S, LUCES_FAUNA } from "../../../relieve/src/fauna.ts";
import type { Especie, Habitante, TablaFauna, Grupo } from "../../../relieve/src/fauna.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "./terreno.ts";

const TAU = Math.PI * 2;

// ================================================================================ the shared maths (numbers on the CPU, TSL nodes on the GPU)
/** The small operator set the flight / fade / pulse formulas are written over. Arguments may be numbers or values of `T`. */
export type Ops<T> = {
  add(a: T | number, b: T | number): T; sub(a: T | number, b: T | number): T; mul(a: T | number, b: T | number): T; div(a: T | number, b: T | number): T;
  sin(a: T | number): T; cos(a: T | number): T; exp(a: T | number): T; fract(a: T | number): T; abs(a: T | number): T;
  min(a: T | number, b: T | number): T; max(a: T | number, b: T | number): T;
  /** GLSL step: 0 when x < edge, else 1. */
  step(edge: T | number, x: T | number): T;
  smoothstep(a: T | number, b: T | number, x: T | number): T;
};
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The numeric instance (CPU). */
export const OPS_NUM: Ops<number> = {
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, sin: Math.sin, cos: Math.cos, exp: Math.exp,
  fract: (a) => a - Math.floor(a), abs: Math.abs, min: Math.min, max: Math.max, step: (e, x) => (x < e ? 0 : 1), smoothstep: ss,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nodo = any;
const nodo = (v: Nodo): Nodo => (typeof v === "number" ? float(v) : v);
/** The TSL instance (GPU, WebGPU and the WebGL2 fallback). */
export const OPS_TSL: Ops<Nodo> = {
  add: (a, b) => nodo(a).add(b), sub: (a, b) => nodo(a).sub(b), mul: (a, b) => nodo(a).mul(b), div: (a, b) => nodo(a).div(b),
  sin: (a) => sin(nodo(a)), cos: (a) => cos(nodo(a)), exp: (a) => exp(nodo(a)), fract: (a) => fract(nodo(a)), abs: (a) => abs(nodo(a)),
  min: (a, b) => min(nodo(a), nodo(b)), max: (a, b) => max(nodo(a), nodo(b)), step: (e, x) => step(nodo(e), nodo(x)),
  smoothstep: (a, b, x) => smoothstep(nodo(a), nodo(b), nodo(x)),
};

/** Per-animal flight parameters as the shader receives them (anchor, wander radius × 0.7, angular speed, two phases, vertical amplitude). */
export type ParamsVuelo<T> = { hx: T | number; hy: T | number; hz: T | number; rad: T | number; w: T | number; p: T | number; q: T | number; ampY: T | number };
/** F1's `trayectoria` (x, y, z) and its time derivative on the ground plane (vx, vz: the direction the animal faces), `tl` seconds into its window. */
export function trayectoriaOps<T>(o: Ops<T>, a: ParamsVuelo<T>, tl: T | number): { x: T; y: T; z: T; vx: T; vz: T } {
  const wt = o.mul(a.w, tl), w2 = o.mul(1.31, wt);
  return {
    x: o.add(a.hx, o.mul(a.rad, o.sin(o.add(wt, a.p)))),
    z: o.add(a.hz, o.mul(a.rad, o.sin(o.add(w2, a.q)))),
    y: o.add(a.hy, o.mul(a.ampY, o.sin(o.add(o.mul(2.3, wt), o.add(a.p, a.q))))),
    vx: o.mul(o.mul(a.rad, a.w), o.cos(o.add(wt, a.p))),
    vz: o.mul(o.mul(o.mul(a.rad, a.w), 1.31), o.cos(o.add(w2, a.q))),
  };
}
/** Flight parameters of a habitant + its species (what `trayectoriaOps` takes, in numbers). F1 writes 2π as 6.2831853 in `trayectoria`: copied digit for digit so both agree to 1e-9. */
export function paramsVuelo(h: Habitante, e: Pick<Especie, "vuelo">, escalaRadio = 1): ParamsVuelo<number> {
  const r = e.vuelo.radio;
  return { hx: h.x, hy: h.y, hz: h.z, rad: r * 0.7 * escalaRadio, w: e.vuelo.velocidad / Math.max(0.5, r), p: h.fase * 6.2831853, q: ((h.semillaPropia % 1000) / 1000) * 6.2831853, ampY: 0.15 * (e.vuelo.altura[1] - e.vuelo.altura[0]) };
}
/** F1's `fundido(t)`: 0→1 in 4 s at the start of the window, 1→0 in the last 4 s. */
export function fundidoOps<T>(o: Ops<T>, tl: T | number): T {
  return o.max(0, o.min(1, o.min(o.div(tl, 4), o.div(o.sub(VENTANA_S, tl), 4))));
}
/** The 8 light patterns of F1 (`LUCES_FAUNA` order: fijo 0, latido 1, parpadeo 2, onda 3, respiro 4, estrobo 5, morse 6, prisma 7).
 *  `i` = intensity 0…1 at `t` seconds, `f` = the animal's 0…1 phase, `rit` = tempo (1 = normal; legendary ones run slower). `prisma` = 1 when
 *  the colour should follow `hue` (0…1) instead of the breed's colour. */
export function pulsoOps<T>(o: Ops<T>, id: T | number, t: T | number, f: T | number, rit: T | number): { i: T; hue: T; prisma: T } {
  const tt = o.mul(t, rit), sq = (x: T | number) => o.mul(x, x), neg = (x: T | number) => o.sub(0, x);
  const g = (x: T | number, c: number, w: number) => o.exp(neg(sq(o.div(o.sub(x, c), w))));
  const m = (k: number) => o.sub(1, o.step(0.5, o.abs(o.sub(id, k))));
  // fijo: steady with a tiny hum
  const fijo = o.add(0.92, o.mul(0.08, o.sin(o.add(o.mul(1.7, tt), o.mul(f, TAU)))));
  // latido: two beats then a rest
  const p1 = o.fract(o.add(o.div(tt, 1.5), f));
  const latido = o.add(0.18, o.mul(0.82, o.max(g(p1, 0.08, 0.05), o.mul(0.7, g(p1, 0.3, 0.06)))));
  // parpadeo: a short blink every 2.2 s
  const p2 = o.fract(o.add(o.div(tt, 2.2), f));
  const parpadeo = o.add(0.05, o.mul(0.95, o.mul(o.smoothstep(0, 0.03, p2), o.sub(1, o.smoothstep(0.1, 0.16, p2)))));
  // onda: a sine swell, sharpened
  const s3 = o.add(0.5, o.mul(0.5, o.sin(o.mul(TAU, o.add(o.div(tt, 2.8), f)))));
  const onda = o.add(0.1, o.mul(0.9, sq(s3)));
  // respiro: a slow breath of 5 s
  const c4 = o.sub(0.5, o.mul(0.5, o.cos(o.mul(TAU, o.add(o.div(tt, 5), f)))));
  const respiro = o.add(0.08, o.mul(0.92, sq(c4)));
  // estrobo: bursts of quick flashes (6 Hz for ~1.2 s, then dark)
  const gate = o.sub(1, o.step(0.45, o.fract(o.add(o.div(tt, 2.6), f))));
  const flash = o.sub(1, o.smoothstep(0.12, 0.3, o.fract(o.add(o.mul(tt, 6), o.mul(f, 3)))));
  const estrobo = o.add(0.04, o.mul(0.96, o.mul(gate, flash)));
  // morse: dot dash dot dot (units of 0.3 s, a 14-unit word)
  const u = o.mul(o.fract(o.add(o.div(tt, 4.2), f)), 14);
  const banda = (a: number, b: number) => o.mul(o.step(a, u), o.sub(1, o.step(b, u)));
  const morse = o.add(0.05, o.mul(0.95, o.add(o.add(banda(0, 1), banda(2, 5)), o.add(banda(6, 7), banda(8, 9)))));
  // prisma: nearly steady, the colour does the work
  const prisma = o.add(0.8, o.mul(0.2, o.sin(o.add(o.mul(2.1, tt), o.mul(f, TAU)))));
  const i = [fijo, latido, parpadeo, onda, respiro, estrobo, morse, prisma].map((p, k) => o.mul(m(k), p)).reduce((a, b) => o.add(a, b));
  return { i, hue: o.fract(o.add(o.div(tt, 5), f)), prisma: m(7) };
}

// ================================================================================ palette / table helpers
export const RAREZA_FACTOR: Record<string, number> = { comun: 0, rara: 1 / 3, epica: 2 / 3, legendaria: 1 };
/** One breed as the drawing needs it. `orden` = its position among the breeds of its group (the index the instances carry); `indice` = position in `tabla.especies`. */
export type BichoPaleta = { especie: Especie; indice: number; orden: number; grupo: Grupo; ala: THREE.Color; cuerpo: THREE.Color; luz: THREE.Color; circuito: THREE.Color; luzId: number; rar: number };
/** The butterfly and firefly breeds of a table, with their colours converted once (linear working space), keyed by id. */
export function paletaDe(tabla: TablaFauna): Map<string, BichoPaleta> {
  const m = new Map<string, BichoPaleta>(), orden: Record<string, number> = { mariposa: 0, luciernaga: 0 };
  tabla.especies.forEach((e, indice) => {
    if (e.grupo === "pajaro") return;
    m.set(e.id, { especie: e, indice, orden: orden[e.grupo]++, grupo: e.grupo, ala: new THREE.Color(e.colores.ala), cuerpo: new THREE.Color(e.colores.cuerpo), luz: new THREE.Color(e.colores.luz), circuito: new THREE.Color(e.colores.circuito), luzId: Math.max(0, LUCES_FAUNA.indexOf(e.luz)), rar: RAREZA_FACTOR[e.rareza] ?? 0 });
  });
  return m;
}
/** How dark the world is for the fireflies: 1 at night, 0 by day, ramping over the two twilights (hour 0–24). */
export function oscuridad(hora: number): number {
  const h = ((hora % 24) + 24) % 24;
  if (h >= 5.5 && h < 8) return 1 - ss(5.5, 8, h);
  if (h >= 17.5 && h < 20.5) return ss(17.5, 20.5, h);
  return h >= 8 && h < 17.5 ? 0 : 1;
}
/** The light butterflies are shaded with (a scalar standing for the sun / hemisphere): 1 by day, 0.25 in the dark. */
export const luzDelDia = (hora: number) => 1 - 0.75 * oscuridad(hora);
/** Glow radius (m) of a firefly: body length × 3, and rare ones bigger (legendary ≈ 1.9×). Brightness 1 → 1.8. */
export const radioLuz = (e: Pick<Especie, "tamano" | "rareza">) => e.tamano * 3 * (1 + 0.9 * (RAREZA_FACTOR[e.rareza] ?? 0));
export const brilloLuz = (e: Pick<Especie, "rareza">) => 1 + 0.8 * (RAREZA_FACTOR[e.rareza] ?? 0);
/** Wing beat rate (rad/s): large butterflies ≈ 4 Hz, small ≈ 9 Hz. */
export const aleteoRadS = (tamano: number) => TAU * (4 + 5 * Math.min(1, Math.max(0, (0.3 - tamano) / 0.16)));
/** Most breeds of one group the palette-by-mask shader takes (a custom world table above this is refused with the fix). */
export const RAZAS_MAX = 32;

// ================================================================================ geometry
type V3 = [number, number, number];
type Rol = [number, number, number, number]; // wing colour, shadow tone, glowing circuit line, steady light (the rest is the body metal)
/** `aleta` codes: 0 body · 1 wing (flaps) · 2 pulsing LED on the body · 3 pulsing LED on a wing. */
const CUERPO_: 0 = 0, ALA_: 1 = 1, LED_CUERPO: 2 = 2, LED_ALA: 3 = 3;
/** One butterfly in a unit where the wing span is 2 (half-span 1), +z forward, +y up. `detalle` false = tier D: no antennae, the glowing lines and LEDs on the top face only. */
export function geometriaMariposa(detalle = true): THREE.BufferGeometry {
  const pos: number[] = [], rol: number[] = [], aleta: number[] = [];
  const tri = (a: V3, b: V3, c: V3, ra: Rol, rb: Rol, rc: Rol, w: 0 | 1 | 2 | 3) => { pos.push(...a, ...b, ...c); rol.push(...ra, ...rb, ...rc); aleta.push(w, w, w); };
  const CUERPO: Rol = [0, 0, 0, 0], ROOT: Rol = [0.15, 0.85, 0, 0], ALA: Rol = [1, 0, 0, 0], PUNTA: Rol = [0.35, 0, 0, 0.65], PUNTA2: Rol = [0.6, 0, 0, 0.4], CIRC: Rol = [0, 0, 1, 0], LUZ: Rol = [0, 0, 0, 1];
  // body: an elongated tetrahedron (4 triangles): ridge F–R on top, L–Q below
  const F: V3 = [0, 0.04, 0.5], R: V3 = [0, 0.04, -0.55], L: V3 = [-0.09, -0.05, 0], Q: V3 = [0.09, -0.05, 0];
  const RF: Rol = [0, 0.05, 0, 0.1], RR: Rol = [0, 0.3, 0, 0];
  tri(F, R, L, RF, RR, CUERPO, CUERPO_); tri(F, R, Q, RF, RR, CUERPO, CUERPO_); tri(F, L, Q, RF, CUERPO, CUERPO, CUERPO_); tri(R, L, Q, RR, CUERPO, CUERPO, CUERPO_);
  // the circuit-glow dot on the thorax: one tiny roof triangle, a pulsing LED
  tri([0, 0.11, 0.17], [-0.065, 0.045, 0.07], [0.065, 0.045, 0.07], CUERPO, CUERPO, CUERPO, LED_CUERPO);
  if (detalle) for (const s of [-1, 1]) tri([s * 0.015, 0.04, 0.49], [s * 0.05, 0.04, 0.49], [s * 0.34, 0.2, 0.92], CUERPO, CUERPO, LUZ, CUERPO_);
  // wings: right wing in half-span units (x out, z forward), mirrored for the left; three triangles, then per face two glowing lines ending in an LED pad
  const a: V3 = [0.04, 0, 0.13], b: V3 = [0.04, 0, -0.13], c: V3 = [0.46, 0, 0.54], d: V3 = [1, 0, 0.32], n: V3 = [0.8, 0, -0.1], f: V3 = [0.62, 0, -0.72];
  const e = 0.018; // lift of the lines above the wing (half-span units): ≈ 1.5 mm on a 0.16 m butterfly
  for (const s of [1, -1]) {
    const m = (p: V3, y = 0): V3 => [p[0] * s, y, p[2]];
    const MED: Rol = [0.65, 0.3, 0, 0.05];
    tri(m(a), m(c), m(d), ROOT, ALA, PUNTA, ALA_); tri(m(a), m(d), m(n), ROOT, PUNTA, MED, ALA_); tri(m(a), m(n), m(b), ROOT, MED, ROOT, ALA_); tri(m(b), m(n), m(f), ROOT, MED, PUNTA2, ALA_);
    for (const y of detalle ? [e, -e] : [e]) {
      tri(m([0.07, 0, 0.1], y), m([0.07, 0, 0.17], y), m([0.86, 0, 0.3], y), CIRC, CIRC, CIRC, ALA_);
      tri(m([0.07, 0, -0.03], y), m([0.07, 0, -0.1], y), m([0.7, 0, -0.55], y), CIRC, CIRC, CIRC, ALA_);
      for (const [cx, cz] of [[0.85, 0.3], [0.69, -0.55]]) tri(m([cx, 0, cz + 0.075], y * 1.4), m([cx - 0.065, 0, cz - 0.045], y * 1.4), m([cx + 0.065, 0, cz - 0.045], y * 1.4), CUERPO, CUERPO, CUERPO, LED_ALA);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("rol", new THREE.Float32BufferAttribute(rol, 4));
  g.setAttribute("aleta", new THREE.Float32BufferAttribute(aleta, 1));
  return g;
}
/** Triangles of one butterfly / one firefly. */
export const trianglesMariposa = (detalle = true) => geometriaMariposa(detalle).getAttribute("position").count / 3;
export const TRIANGULOS_LUCIERNAGA = 2;
/** A quad with corners (±1, ±1), two triangles. */
export function geometriaLuciernaga(): THREE.BufferGeometry {
  const q: V3[] = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], idx = [0, 1, 2, 0, 2, 3];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(idx.flatMap((i) => q[i]), 3));
  g.setAttribute("esq", new THREE.Float32BufferAttribute(idx.flatMap((i) => [q[i][0], q[i][1]]), 2));
  return g;
}

// ================================================================================ materials (TSL)
// Vertex buffers: WebGPU allows 8 per draw by default, so the per-instance data is 3 vec4 (anchor + breed, flight, phases) and everything
// a breed owns (colours, size, light pattern, rarity) is a constant table selected by the breed index with masks (no dynamic uniform
// indexing, no texture): butterflies use 3 geometry + 3 instance buffers, fireflies 2 + 3.
type Entrada = { tiempo: Nodo; camara: Nodo; derecha: Nodo; arriba: Nodo; luzDia: Nodo; osc: Nodo; radio: number; razas: BichoPaleta[] };
const attr4 = (n: string): Nodo => attribute(n, "vec4");
/** Hue wheel → pastel RGB (so the prisma breeds read as a shifting light, not a saturated paint). */
function arcoiris(h: Nodo): Nodo {
  const rgb = clamp(abs(fract(vec3(h, h, h).add(vec3(0, 2 / 3, 1 / 3))).mul(6).sub(3)).sub(1), 0, 1);
  return mix(vec3(1, 1, 1), rgb, 0.7);
}
/** Selects, per instance, a constant of its breed: one mask per breed (1 for the breed whose index is `idx`), summed. */
function tablaRazas(idx: Nodo, n: number) {
  const mask = Array.from({ length: n }, (_, k) => float(1).sub(step(0.5, abs(idx.sub(k)))));
  const suma = (f: (k: number) => Nodo) => mask.map((m, k) => m.mul(f(k))).reduce((p, q) => p.add(q));
  return {
    escalar: (v: (k: number) => number): Nodo => suma((k) => float(v(k))),
    color: (v: (k: number) => THREE.Color): Nodo => suma((k) => vec3(v(k).r, v(k).g, v(k).b)),
  };
}
/** Butterflies: instance attributes iA (x, y, z, breed) · iB (radius, rate, phase p, phase q) · iC (vertical amplitude, 0…1 phase, size jitter); flap + face the travel + fade in `positionNode`, role vertex colours in `colorNode`. */
export function materialMariposas(e: Entrada): THREE.MeshBasicNodeMaterial {
  if (e.razas.length > RAZAS_MAX) throw new Error(`mariposas: ${e.razas.length} butterfly breeds in the table, the shader takes at most ${RAZAS_MAX}: drop some in fauna.json (or raise RAZAS_MAX in naturaleza/mariposas.ts).`);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  mat.name = "mariposas";
  const iA = attr4("iA"), iB = attr4("iB"), iC = attr4("iC"), tl = e.tiempo, fund = fundidoOps(OPS_TSL, tl);
  const tr = trayectoriaOps(OPS_TSL, { hx: iA.x, hy: iA.y, hz: iA.z, rad: iB.x, w: iB.y, p: iB.z, q: iB.w, ampY: iC.x }, tl);
  const T = tablaRazas(iA.w, e.razas.length);
  const span = T.escalar((k) => e.razas[k].especie.tamano).mul(iC.z.mul(0.16).add(0.92));
  const dist = length(vec2(tr.x, tr.z).sub(e.camara.xz));
  const k = fund.mul(float(1).sub(smoothstep(e.radio * 0.7, e.radio, dist)));       // shrink to nothing at the window border and at the edge of the view
  const S = span.mul(0.5).mul(k);
  // flap: glide bursts (amplitude and opening angle swell and ebb), a per-breed rate, a per-animal phase
  const phi = T.escalar((k2) => aleteoRadS(e.razas[k2].especie.tamano)).mul(tl).add(iC.y.mul(TAU));
  const aleteando = smoothstep(-0.4, 0.4, sin(tl.mul(0.5).add(iB.w)));
  const theta = mix(0.2, 0.5, aleteando).add(mix(0.15, 0.8, aleteando).mul(sin(phi)));
  const p = positionLocal as Nodo, code = attribute("aleta", "float");
  const nodo = floor(code.mul(0.5)), lado = code.sub(nodo.mul(2));                 // code = wing + 2·LED
  const ax = abs(p.x), sg = step(0, p.x).mul(2).sub(1);
  const lx = mix(p.x, sg.mul(ax).mul(cos(theta)), lado), ly = mix(p.y, p.y.add(ax.mul(sin(theta))), lado), lz = p.z;
  const dir = normalize(vec2(tr.vx, tr.vz).add(vec2(1e-4, 1e-4)));
  const fx = dir.x, fz = dir.y;
  const bob = span.mul(0.05).mul(cos(phi)).mul(k);
  mat.positionNode = vec3(tr.x.add(lx.mul(fz).add(lz.mul(fx)).mul(S)), tr.y.add(ly.mul(S)).add(bob), tr.z.add(lz.mul(fz).sub(lx.mul(fx)).mul(S)));
  // colour: roles → the breed's palette; the lines, tips and LEDs are unlit and pulse with the breed's light pattern
  const rol = attribute("rol", "vec4"), ala = T.color((k2) => e.razas[k2].ala), cuerpo = T.color((k2) => e.razas[k2].cuerpo).mul(0.4), luz = T.color((k2) => e.razas[k2].luz), circ = T.color((k2) => e.razas[k2].circuito);
  const sombra = ala.mul(0.42).add(circ.mul(0.35)), resto = clamp(float(1).sub(rol.x.add(rol.y).add(rol.z).add(rol.w)), 0, 1);
  const lit = ala.mul(rol.x).add(sombra.mul(rol.y)).add(cuerpo.mul(resto));
  const pu = pulsoOps(OPS_TSL, T.escalar((k2) => e.razas[k2].luzId), tl, iC.y, float(1).sub(T.escalar((k2) => e.razas[k2].rar).mul(0.4)));
  const luzCol = mix(luz, arcoiris(pu.hue), pu.prisma);
  const linea = mix(circ, luzCol, 0.7);
  const emis = linea.mul(rol.z).mul(pu.i.mul(0.6).add(0.6)).add(luzCol.mul(rol.w).mul(pu.i.mul(0.5).add(0.6))).add(luzCol.mul(nodo).mul(pu.i.mul(1.4).add(0.3)));
  mat.colorNode = lit.mul(float(1).sub(nodo)).mul(e.luzDia).add(emis.mul(1.15)).toVarying("mar_col");
  return mat;
}
/** Fireflies: billboard + trajectory + pulse in `positionNode`/varyings, halo/core/ring/star in the fragment, additive blending, no fog. */
export function materialLuciernagas(e: Entrada): THREE.MeshBasicNodeMaterial {
  if (e.razas.length > RAZAS_MAX) throw new Error(`luciernagas: ${e.razas.length} firefly breeds in the table, the shader takes at most ${RAZAS_MAX}: drop some in fauna.json (or raise RAZAS_MAX in naturaleza/mariposas.ts).`);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  mat.name = "luciernagas";
  const iA = attr4("iA"), iB = attr4("iB"), iC = attr4("iC"), tl = e.tiempo, fund = fundidoOps(OPS_TSL, tl);
  const tr = trayectoriaOps(OPS_TSL, { hx: iA.x, hy: iA.y, hz: iA.z, rad: iB.x, w: iB.y, p: iB.z, q: iB.w, ampY: iC.x }, tl);
  const T = tablaRazas(iA.w, e.razas.length);
  const dist = length(vec2(tr.x, tr.z).sub(e.camara.xz));
  const rar = T.escalar((k) => e.razas[k].rar), brillo = float(1).add(rar.mul(0.8));
  const pu = pulsoOps(OPS_TSL, T.escalar((k) => e.razas[k].luzId), tl, iC.y, float(1).sub(rar.mul(0.4)));
  const vista = fund.mul(float(1).sub(smoothstep(e.radio * 0.7, e.radio, dist))).mul(e.osc);
  const esq = attribute("esq", "vec2"), R = T.escalar((k) => radioLuz(e.razas[k].especie)).mul(iC.z.mul(0.16).add(0.92));
  mat.positionNode = vec3(tr.x, tr.y, tr.z).add(e.derecha.mul(esq.x.mul(R))).add(e.arriba.mul(esq.y.mul(R)));
  const col = mix(T.color((k) => e.razas[k].luz), arcoiris(pu.hue), pu.prisma);
  const vCol = col.toVarying("luc_col"), vInt = pu.i.mul(vista).mul(brillo).toVarying("luc_int"), vRar = rar.toVarying("luc_rar");
  const d2 = esq.x.mul(esq.x).add(esq.y.mul(esq.y)), d = sqrt(d2);
  const halo = pow(clamp(float(1).sub(d), 0, 1), 2.2), core = exp(d2.mul(-38));
  const anillo = exp(pow(d.sub(0.72).div(0.05), 2).negate()).mul(0.45).mul(smoothstep(0.5, 0.7, vRar));
  const estrella = exp(abs(esq.x).mul(-24).sub(abs(esq.y).mul(2.2))).add(exp(abs(esq.y).mul(-24).sub(abs(esq.x).mul(2.2)))).mul(0.55).mul(smoothstep(0.85, 0.95, vRar));
  const forma = halo.mul(0.55).add(core).add(anillo).add(estrella).mul(smoothstep(1, 0.92, d));
  mat.colorNode = mix(vCol, vec3(1, 1, 1), core.mul(0.3));
  mat.opacityNode = clamp(forma.mul(vInt), 0, 1);
  return mat;
}

// ================================================================================ the piece
export type OpcionesInsectos = {
  /** Add the group to this parent; dispose() removes it. */
  escena?: THREE.Object3D;
  /** 0–1, as `naturaleza.faunaDensidad` (default 1). */
  densidad?: number;
  /** The world's allow-list of breed ids (`faunaEspecies`); empty/absent = all. */
  especies?: readonly string[];
  /** CPU budget (ms) per frame for asking cells (default 0.3). */
  presupuestoMs?: number;
  /** Override the tier's caps (tests, photos). */
  tope?: Partial<Record<"mariposa" | "luciernaga", number>>;
};
export type HInsectos = {
  vientoU?: unknown; nivel?: Nivel; camara?: THREE.Object3D; tabla: TablaFauna;
  /** The world's hour of day, 0–24 (`entorno`'s clock). */
  hora(): number;
};
export type FuenteInsectos = { semilla: number; alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona };
export type EstadisticasInsectos = {
  dibujos: number; mariposas: number; luciernagas: number; triangulosEnviados: number; triangulosVisibles: number;
  celdasPendientes: number; celdasPedidas: number; relleno: number; msUltimo: number; msMax: number; bytes: number;
};
const LEJOS = 1e6;
const clave = (cx: number, cz: number) => `${cx},${cz}`;

export function crearInsectos(h: HInsectos, fuente: FuenteInsectos, op: OpcionesInsectos = {}) {
  const nivel: Nivel = h.nivel ?? "A";
  const lim = FAUNA_POR_NIVEL[nivel], radio = lim.radio;
  let presup = op.presupuestoMs ?? 0.3;
  const capM = op.tope?.mariposa ?? lim.enVista.mariposa, capL = op.tope?.luciernaga ?? lim.enVista.luciernaga;
  const paleta = paletaDe(h.tabla);
  const razas = { mariposa: [...paleta.values()].filter((b) => b.grupo === "mariposa"), luciernaga: [...paleta.values()].filter((b) => b.grupo === "luciernaga") };
  const ids = [...paleta.keys()].filter((id) => !op.especies?.length || op.especies.includes(id));
  const uT = uniform(0), uCam = uniform(new THREE.Vector3(LEJOS, 0, LEJOS)), uDer = uniform(new THREE.Vector3(1, 0, 0)), uArr = uniform(new THREE.Vector3(0, 1, 0));
  const uLuz = uniform(1), uOsc = uniform(0);
  const ent = { tiempo: uT, camara: uCam, derecha: uDer, arriba: uArr, luzDia: uLuz, osc: uOsc, radio };
  const grupo = new THREE.Group(); grupo.name = "insectos";

  const crear = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material, nombre: string) => {
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v);
    const arr: Record<string, THREE.InstancedBufferAttribute> = {};
    for (const a of ["iA", "iB", "iC"]) { const at = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(a, at); arr[a] = at; }
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radio + 24);
    const m = new THREE.Mesh(g, mat);
    m.name = nombre; m.matrixAutoUpdate = false; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = true; m.visible = false;
    m.userData.sinSombra = true; m.raycast = () => {};
    grupo.add(m);
    return { m, g, arr, n: 0, cap: n, tri: geo.getAttribute("position").count / 3 };
  };
  const M = crear(geometriaMariposa(nivel !== "D"), capM, materialMariposas({ ...ent, razas: razas.mariposa }), "mariposas");
  const L = crear(geometriaLuciernaga(), capL, materialLuciernagas({ ...ent, razas: razas.luciernaga }), "luciernagas");
  L.m.renderOrder = 3;
  op.escena?.add(grupo);

  // ---- writing one animal into the instance arrays (the only place the layout lives) ----
  let origen = 0;               // world-clock seconds the window of the instances starts at (uT = tReloj − origen)
  let escalaRadio = 1;
  const jit = (s: number) => ((s >>> 10) % 256) / 255;
  function escribir(G: typeof M | typeof L, i: number, a: Habitante, b: BichoPaleta) {
    const v = paramsVuelo(a, b.especie, escalaRadio), A = G.arr.iA.array, B = G.arr.iB.array, C = G.arr.iC.array, o = i * 4;
    A[o] = v.hx as number; A[o + 1] = v.hy as number; A[o + 2] = v.hz as number; A[o + 3] = b.orden;
    B[o] = v.rad as number; B[o + 1] = v.w as number; B[o + 2] = v.p as number; B[o + 3] = v.q as number;
    C[o] = v.ampY as number; C[o + 1] = a.fase; C[o + 2] = jit(a.semillaPropia); C[o + 3] = 0;
  }
  /** Replace the instances by exactly these animals (capped by the buffers). Photos and tests; the page never calls it. */
  function fijar(lista: readonly Habitante[], o?: { origen?: number; escalaRadio?: number }) {
    origen = o?.origen ?? 0; escalaRadio = o?.escalaRadio ?? 1;
    M.n = 0; L.n = 0;
    for (const a of lista) {
      const b = paleta.get(a.especie); if (!b) continue;
      if (b.grupo === "mariposa" && M.n < M.cap) escribir(M, M.n++, a, b);
      else if (b.grupo === "luciernaga" && L.n < L.cap) escribir(L, L.n++, a, b);
    }
    uT.value = tUlt - origen; subir();
  }
  function subir() {
    for (const G of [M, L]) {
      for (const at of Object.values(G.arr)) at.needsUpdate = true;
      G.g.instanceCount = G.n;
    }
  }

  // ---- who is where: cells asked from F1, kept for the window, committed when the ring is complete ----
  let vAct = NaN, horaV = 12, cxA = NaN, czA = NaN, sucio = false, cola: { cx: number; cz: number }[] = [], pedidas = 0, commits = 0, msUltimo = 0, msMax = 0;
  let camX = 0, camZ = 0, tUlt = 0, anillo: { cx: number; cz: number }[] = [];
  const cache = new Map<string, Habitante[]>();
  const ctxBase = () => ({ zonaEn: fuente.zonaEn, alturaEn: fuente.alturaEn, hora: horaV, densidad: op.densidad ?? 1, nivel, especies: ids });
  /** Cells whose square is within `radio` of the camera, nearest first. */
  function celdasDelAnillo(x: number, z: number) {
    const m = Math.ceil(radio / CELDA_M) + 1, cx0 = Math.floor(x / CELDA_M), cz0 = Math.floor(z / CELDA_M), res: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -m; dz <= m; dz++) for (let dx = -m; dx <= m; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz, nx = Math.max(cx * CELDA_M - x, 0, x - (cx + 1) * CELDA_M), nz = Math.max(cz * CELDA_M - z, 0, z - (cz + 1) * CELDA_M), d = Math.hypot(nx, nz);
      if (d <= radio) res.push({ cx, cz, d });
    }
    return res.sort((p, q) => p.d - q.d || p.cz - q.cz || p.cx - q.cx);
  }
  function pedir(cx: number, cz: number) {
    pedidas++;
    cache.set(clave(cx, cz), ids.length ? habitantes(fuente.semilla, { cx, cz }, vAct, h.tabla, ctxBase()) : []);
  }
  function confirmar() {
    const lista: { a: Habitante; b: BichoPaleta; d: number }[][] = [[], []];
    for (const c of anillo) for (const a of cache.get(clave(c.cx, c.cz)) ?? []) {
      const b = paleta.get(a.especie); if (!b) continue;
      lista[b.grupo === "mariposa" ? 0 : 1].push({ a, b, d: Math.hypot(a.x - camX, a.z - camZ) });
    }
    origen = VENTANA_S * vAct; escalaRadio = 1; M.n = 0; L.n = 0;
    lista[0].sort((p, q) => p.d - q.d || (p.a.id < q.a.id ? -1 : 1)).slice(0, M.cap).forEach((x) => escribir(M, M.n++, x.a, x.b));
    lista[1].sort((p, q) => p.d - q.d || (p.a.id < q.a.id ? -1 : 1)).slice(0, L.cap).forEach((x) => escribir(L, L.n++, x.a, x.b));
    subir(); sucio = false; commits++;
  }

  /** Call once per frame with the camera and the world clock (seconds). Sets the shader inputs; asks cells only at a border / window change. */
  function actualizar(camara: THREE.Object3D | undefined, tReloj: number) {
    const cam = camara ?? h.camara; if (!cam) return;
    const t0 = performance.now();
    cam.updateWorldMatrix(true, false);
    const me = cam.matrixWorld.elements;
    (uDer.value as THREE.Vector3).set(me[0], me[1], me[2]).normalize(); (uArr.value as THREE.Vector3).set(me[4], me[5], me[6]).normalize();
    camX = me[12]; camZ = me[14]; (uCam.value as THREE.Vector3).set(me[12], me[13], me[14]);
    const hora = h.hora(); uLuz.value = luzDelDia(hora); uOsc.value = oscuridad(hora);
    const v = ventanaDe(tReloj), cx0 = Math.floor(camX / CELDA_M), cz0 = Math.floor(camZ / CELDA_M);
    let recalcular = false;
    if (v !== vAct) { vAct = v; horaV = hora; cache.clear(); recalcular = true; }
    if (cx0 !== cxA || cz0 !== czA) { cxA = cx0; czA = cz0; recalcular = true; }
    if (recalcular) {
      const celdas = celdasDelAnillo(camX, camZ);
      anillo = celdas; const vivas = new Set(celdas.map((c) => clave(c.cx, c.cz)));
      for (const k of [...cache.keys()]) if (!vivas.has(k)) cache.delete(k);
      cola = celdas.filter((c) => !cache.has(clave(c.cx, c.cz)));
      sucio = true;
    }
    const hasta = t0 + presup;
    while (cola.length && performance.now() < hasta) { const c = cola.shift()!; pedir(c.cx, c.cz); }
    if (sucio && !cola.length) confirmar();
    tUlt = tReloj; uT.value = tReloj - origen;
    M.m.visible = M.n > 0; L.m.visible = L.n > 0 && (uOsc.value as number) > 0.01;
    (M.g.boundingSphere as THREE.Sphere).center.set(camX, me[13], camZ); (L.g.boundingSphere as THREE.Sphere).center.set(camX, me[13], camZ);
    msUltimo = performance.now() - t0; if (msUltimo > msMax) msMax = msUltimo;
  }
  /** Ask every cell of the ring now and commit (loading screen, tests, photos): never per frame. */
  function llenarTodo(camara: THREE.Object3D | undefined, tReloj: number) {
    const antes = presup; presup = 1e9;
    actualizar(camara, tReloj); presup = antes;
  }

  // ---- CPU mirrors (counters for tests / reports, never per frame) ----
  /** What rasterises something right now: instances whose fade is > 0 at clock `t` for a viewer at (x, z). */
  function visibles(x = camX, z = camZ, t = tUlt) {
    const cuenta = (G: typeof M | typeof L, esL: boolean) => {
      let n = 0;
      const A = G.arr.iA.array, B = G.arr.iB.array, C = G.arr.iC.array;
      for (let i = 0; i < G.n; i++) {
        const o = i * 4, tl = t - origen;
        if (fundidoOps(OPS_NUM, tl) <= 0) continue;
        const p = trayectoriaOps(OPS_NUM, { hx: A[o], hy: A[o + 1], hz: A[o + 2], rad: B[o], w: B[o + 1], p: B[o + 2], q: B[o + 3], ampY: C[o] }, tl);
        if (1 - ss(radio * 0.7, radio, Math.hypot(p.x - x, p.z - z)) <= 0) continue;
        if (esL && (uOsc.value as number) <= 0.001) continue;
        n++;
      }
      return n;
    };
    const mariposas = cuenta(M, false), luciernagas = L.m.visible ? cuenta(L, true) : 0;
    return { mariposas, luciernagas, triangulos: mariposas * M.tri + luciernagas * TRIANGULOS_LUCIERNAGA };
  }
  function estadisticas(): EstadisticasInsectos {
    const v = visibles();
    return {
      dibujos: (M.m.visible ? 1 : 0) + (L.m.visible ? 1 : 0), mariposas: M.n, luciernagas: L.n,
      triangulosEnviados: (M.m.visible ? M.n * M.tri : 0) + (L.m.visible ? L.n * TRIANGULOS_LUCIERNAGA : 0), triangulosVisibles: v.triangulos,
      celdasPendientes: cola.length, celdasPedidas: pedidas, relleno: commits, msUltimo, msMax,
      bytes: (M.cap + L.cap) * 3 * 16,
    };
  }
  function dispose() {
    grupo.removeFromParent();
    for (const G of [M, L]) { G.g.dispose(); (G.m.material as THREE.Material).dispose(); }
  }
  return {
    mallas: [M.m, L.m], grupo, actualizar, llenarTodo, fijar, visibles, estadisticas, dispose, paleta, razas,
    config: { nivel, radio, capM, capL, presupuestoMs: op.presupuestoMs ?? 0.3, triMariposa: M.tri, triLuciernaga: TRIANGULOS_LUCIERNAGA },
    datos: { mariposas: M, luciernagas: L },
  };
}
export type Insectos = ReturnType<typeof crearInsectos>;
