// dados-caida — the fall of 3D dice into a tower's tray (lote 8 mesa, t_95245cf0, story 1 of 3: d6 and d20, PC).
// Pure: no three.js, no DOM, no clock (tested in test/dados-caida.test.ts). THE SERVER ROLLS (features/dados): this file only
// draws a roll it was told. Everything the picture needs is a function of the roll's number `n`, the tower's id, each die's
// face count and value, and the tray: the same inputs give the same flight, bounces and spin on every screen, and the die
// STOPS with the server's value face up, exactly (the spin is `qFinal · rot(axis, angle·(1-s(t)))`: at s = 1 the extra turn
// is the identity, so the end pose is qFinal and not an approximation).
// Dice that are not d6 or d20 are not drawn yet (story 3: d100 and the rest): `tiene3D(caras)` says which are.

export type Vec = readonly [number, number, number];
export type Quat = readonly [number, number, number, number]; // x y z w
/** The tray the dice land on: the centre of its floor (world metres), and its extent along the world's X (`ancho`) and Z (`fondo`). */
export type Bandeja = { x: number; y: number; z: number; ancho: number; fondo: number };

/** What a tower without its own tray gets: a small floor patch on the ground at its place. */
export const BANDEJA_DEF = { dx: 0, dz: 0, alto: 0, ancho: 0.8, fondo: 0.6 } as const;
/** Edge of a d6 / d20 in metres at full size (a tray smaller than the dice needs shrinks them: `escala`). */
export const ARISTA = { 6: 0.12, 20: 0.1 } as const;
export const tiene3D = (caras: number): boolean => caras === 6 || caras === 20;

const PHI = (1 + Math.sqrt(5)) / 2;
const norm = (v: Vec): Vec => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The d6 as the page and the fall share it: unit face normals by value (opposite faces add 7). */
export const D6_NORMALES: readonly Vec[] = [[0, 1, 0], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, -1, 0]]; // index = value - 1
/** The icosahedron of edge 2: 12 vertices, 20 triangles (indices), found as the triples of vertices all 2 apart. */
export const D20_VERTICES: readonly Vec[] = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI], [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
];
export const D20_CARAS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  const V = D20_VERTICES, ady = (i: number, j: number) => Math.abs(dist(V[i], V[j]) - 2) < 1e-9;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (ady(i, j) && ady(j, k) && ady(i, k)) out.push([i, j, k]);
  return out;
})();
const centro3 = (t: readonly [number, number, number]): Vec => { const V = D20_VERTICES; return [(V[t[0]][0] + V[t[1]][0] + V[t[2]][0]) / 3, (V[t[0]][1] + V[t[1]][1] + V[t[2]][1]) / 3, (V[t[0]][2] + V[t[1]][2] + V[t[2]][2]) / 3]; };
/** Outward unit normal of each triangle (the winding does not matter: the centroid points out), and the VALUE written on it: opposite faces add 21. */
export const D20_NORMALES: readonly Vec[] = D20_CARAS.map((t) => norm(centro3(t)));
export const D20_VALOR: readonly number[] = (() => {
  const v = new Array<number>(20).fill(0);
  let siguiente = 1;
  for (let i = 0; i < 20; i++) {
    if (v[i]) continue;
    const n = D20_NORMALES[i];
    const op = D20_NORMALES.findIndex((m, j) => j !== i && Math.hypot(m[0] + n[0], m[1] + n[1], m[2] + n[2]) < 1e-9);
    v[i] = siguiente; v[op] = 21 - siguiente; siguiente++;
  }
  return v;
})();
/** The unit normal of the face that reads `valor` on a die of `caras` faces (d6 or d20), or null. */
export function normalDe(caras: number, valor: number): Vec | null {
  if (caras === 6 && valor >= 1 && valor <= 6) return D6_NORMALES[valor - 1];
  if (caras === 20 && valor >= 1 && valor <= 20) return D20_NORMALES[D20_VALOR.indexOf(valor)];
  return null;
}
/** Distance from a die's centre to each face when it rests on one (the inscribed sphere): edge/2 for a cube, 0.7558·edge for an icosahedron. */
export const APOTEMA = { 6: 0.5, 20: 0.755761314 } as const; // × edge
/** The farthest a die lying on a face reaches from its centre ALONG THE FLOOR (× edge): half the diagonal of a cube's face; an icosahedron's circumradius. */
export const HUELLA = { 6: 0.70711, 20: 0.95106 } as const;

// ---- quaternions (x y z w) ----
const qmul = (a: Quat, b: Quat): Quat => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qEje = (eje: Vec, ang: number): Quat => { const e = norm(eje), s = Math.sin(ang / 2); return [e[0] * s, e[1] * s, e[2] * s, Math.cos(ang / 2)]; };
/** The shortest turn taking unit vector `a` onto unit vector `b`. */
export function qDeAHacia(a: Vec, b: Vec): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 1 - 1e-12) return [0, 0, 0, 1];
  if (d < -1 + 1e-12) { const p: Vec = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c: Vec = [a[1] * p[2] - a[2] * p[1], a[2] * p[0] - a[0] * p[2], a[0] * p[1] - a[1] * p[0]]; return qEje(c, Math.PI); }
  const c: Vec = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** Turn vector `v` by unit quaternion `q`. */
export function girar(q: Quat, v: Vec): Vec {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

// ---- the deterministic part ----
/** 32-bit FNV-1a of a string, and mulberry32 over it: the same text gives the same stream on every machine. */
export function semilla(texto: string): number { let h = 0x811c9dc5; for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export function azarDe(s: number): () => number { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Gravity of the picture (m/s², a little slow so the eye can follow it) and how much of its height a bounce keeps. */
const G = 7.5, REBOTE = 0.2, REBOTES = 3, REPOSO_S = 0.3;
/** One die's flight, all decided: pose(t) needs nothing else. */
export type Plan = {
  caras: 6 | 20; valor: number; indice: number;
  escala: number;             // edge in metres
  inicio: Vec; fin: Vec;      // centre at t = 0 (above, off to one side) and at rest
  altura: number;             // height of the first drop (m, over the resting centre)
  qFinal: Quat; eje: Vec; giros: number; // the extra turn: angle = giros·(1-s)
  tramos: readonly { t0: number; t1: number; h: number }[]; // free-flight arcs: peak h over the floor
  duracion: number;           // seconds until it lies still
};
export type Pose = { x: number; y: number; z: number; q: Quat; quieto: boolean };

/** The plan of every die of a roll that has a 3D model (`valores` in the server's order; dice with no model are skipped but keep their index). */
export function planTirada(o: { n: number; sitio: string; caras: number; valores: readonly number[]; bandeja: Bandeja }): Plan[] {
  if (!tiene3D(o.caras)) return [];
  const caras = o.caras as 6 | 20, c = o.valores.length, B = o.bandeja;
  const base = semilla(`${o.sitio}|${o.n}|d${caras}`);
  const mezcla = azarDe(base ^ 0x9e3779b9);
  // a grid of cells over the tray, as many as dice, shuffled by the roll (the same shuffle everywhere)
  const cols = Math.max(1, Math.min(c, Math.round(Math.sqrt((c * B.ancho) / B.fondo)))), filas = Math.ceil(c / cols);
  const cw = B.ancho / cols, cf = B.fondo / filas;
  const celdas = Array.from({ length: cols * filas }, (_, i) => i);
  for (let i = celdas.length - 1; i > 0; i--) { const j = Math.floor(mezcla() * (i + 1)); [celdas[i], celdas[j]] = [celdas[j], celdas[i]]; }
  const escala = Math.min(ARISTA[caras], (0.85 * Math.min(cw, cf)) / (2 * HUELLA[caras])); // it must fit its cell whatever way it is turned
  const out: Plan[] = [];
  o.valores.forEach((valor, indice) => {
    const normal = normalDe(caras, valor);
    if (!normal) return;
    const r = azarDe(base + Math.imul(indice + 1, 0x85ebca6b));
    const cel = celdas[indice], cx = cel % cols, cz = Math.floor(cel / cols);
    const holgura = Math.max(0, Math.min(cw, cf) / 2 - HUELLA[caras] * escala) * 0.9;
    const px = B.x - B.ancho / 2 + (cx + 0.5) * cw + (r() * 2 - 1) * holgura, pz = B.z - B.fondo / 2 + (cz + 0.5) * cf + (r() * 2 - 1) * holgura;
    const reposo = B.y + APOTEMA[caras] * escala;
    const altura = 0.55 + r() * 0.35;
    const inicio: Vec = [px + (r() * 2 - 1) * 0.35, reposo + altura, pz + (r() * 2 - 1) * 0.35];
    // the end pose: the chosen face up, then a turn about the vertical (so not every die lies with the same edge forward)
    const qFinal = qmul(qEje([0, 1, 0], r() * Math.PI * 2), qDeAHacia(normal, [0, 1, 0]));
    const eje = norm([r() * 2 - 1, r() * 2 - 1 + 0.2, r() * 2 - 1]);
    const giros = (1.5 + r() * 1.5) * Math.PI * 2 + r() * Math.PI;
    // free flight: the drop from `altura`, then REBOTES arcs each keeping REBOTE of the previous height
    const tramos: { t0: number; t1: number; h: number }[] = [];
    let t = 0, h = altura;
    const caida = Math.sqrt((2 * h) / G); tramos.push({ t0: 0, t1: caida, h }); t = caida;
    for (let k = 0; k < REBOTES; k++) { h *= REBOTE; const d = 2 * Math.sqrt((2 * h) / G); tramos.push({ t0: t, t1: t + d, h }); t += d; }
    out.push({ caras, valor, indice, escala, inicio, fin: [px, reposo, pz], altura, qFinal, eje, giros, tramos, duracion: t + REPOSO_S });
  });
  return out;
}

const suave = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 2.2);
/** Where the die is and how it is turned `t` seconds after the roll arrived. t ≥ duracion = at rest, exactly on its end pose. */
export function poseEn(p: Plan, t: number): Pose {
  if (t >= p.duracion) return { x: p.fin[0], y: p.fin[1], z: p.fin[2], q: p.qFinal, quieto: true };
  const tt = Math.max(0, t);
  // vertical: the arc we are in. First arc: from `altura` down to 0 (a parabola with its peak at t = 0); later arcs: up and down.
  let y = 0;
  for (let i = 0; i < p.tramos.length; i++) {
    const a = p.tramos[i];
    if (tt <= a.t1 || i === p.tramos.length - 1) {
      if (i === 0) y = a.h - 0.5 * G * tt * tt;
      else { const mitad = (a.t1 - a.t0) / 2, d = tt - a.t0 - mitad; y = Math.max(0, a.h - 0.5 * G * d * d); }
      break;
    }
  }
  // horizontal: from the start to the spot as the die slows (the same ease as the spin)
  const caida = p.tramos[0].t1, ux = suave(tt / (caida + (p.duracion - caida) * 0.6));
  const x = p.inicio[0] + (p.fin[0] - p.inicio[0]) * ux, z = p.inicio[2] + (p.fin[2] - p.inicio[2]) * ux;
  const giro = p.giros * (1 - suave(tt / (p.duracion - REPOSO_S * 0.5)));
  return { x, y: p.fin[1] + Math.max(0, y), z, q: qmul(p.qFinal, qEje(p.eje, giro)), quieto: false };
}

/** The face that reads `valor` ends up pointing along +Y (up), within `eps`: what the tests and the page check. */
export function caraArriba(caras: number, q: Quat): number | null {
  let mejor = -2, valor: number | null = null;
  const normales = caras === 6 ? D6_NORMALES : caras === 20 ? D20_NORMALES : [];
  normales.forEach((n, i) => { const y = girar(q, n)[1]; if (y > mejor) { mejor = y; valor = caras === 6 ? i + 1 : D20_VALOR[i]; } });
  return valor;
}
