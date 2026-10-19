// flora (naturaleza R6.5): the lore's minor flora (work/naturaleza/DISENO-LORE.md, «Tres franjas»): fossil cacti with brass rings and one
// tiny turquoise signal dot, clusters of glassy spines and thistles on the anthracite moor; low mounds of dark heather («brezo de luto»),
// dry saffron bushes and a few thistles in the colony garden. Nothing in the plaza, by the pond or on the shore.
// PURE: no three.js, no DOM, no Math.random, no clock. ZERO new draw calls: like residuos.ts, the plants are BAKED as static triangles
// (positions + per-vertex colours) that terreno.ts appends to its single mesh; they live inside the terrain's share of the budget.
//
// Read-at-three-distances rule: at 30 m / 8 m the silhouette (ribbed column with a candelabra arm, a burst of glass shards, a dark pillow,
// a golden fan, a stalk with a ball) tells the kind; the brass rings and the dot are the 2 m detail. Colours: paleta.ts `FLORA` only.
//
// COPIED (technique only): lathe modelling and jittered-grid clustered sites from residuos.ts (R4). CHANGED: lean per-plant meshes
// (3–98 triangles), a mitred L-tube for the cactus arm, double-sided blades for the dry bushes, zone rules per kind.
import { crearAzar, hash2 } from "./semilla.ts";
import { CASA, FLORA, MAQUINA, SENAL, VERDES, mezcla } from "./paleta.ts";
import type { Nivel } from "../calidad.ts";
import { NIVEL_AGUA } from "../../../relieve/src/relieve.ts";
import type { Zona } from "../../../relieve/src/relieve.ts";

export type TipoPlanta = "cactus" | "espinas" | "brezo" | "azafran" | "cardo";
export const TIPOS_PLANTA: readonly TipoPlanta[] = ["cactus", "espinas", "brezo", "azafran", "cardo"];

/** Triangles the flora may bake into the terrain mesh per tier (inside niveles.ts `reparto.terreno`, next to the Residuos). */
export const FLORA_POR_NIVEL: Record<Nivel, number> = { A: 510, B: 300, C: 240, D: 120 };

/** Where each kind may grow: the moor is the rock zone (high, far ground), the garden is meadow and forest floor. Never sand belt or shore. */
export const ZONAS_PLANTA: Record<TipoPlanta, readonly Zona[]> = {
  cactus: ["roca"], espinas: ["roca"], brezo: ["prado", "bosque"], azafran: ["prado", "bosque"], cardo: ["roca", "prado", "bosque"],
};
export const MARGEN_PLAZA_FLORA = 4, MARGEN_ESTANQUE_FLORA = 4, MARGEN_BORDE_FLORA = 12, CELDA_FLORA = 9;

export type Planta = { tipo: TipoPlanta; x: number; y: number; z: number; alto: number; triangulos: number; zona: Zona };
export type Flora = {
  /** Triangle soup, 9 floats per triangle, world space. */
  posiciones: Float32Array;
  /** Linear-RGB vertex colours (what THREE.Color(hex) holds), 9 floats per triangle. */
  colores: Float32Array;
  triangulos: number;
  plantas: Planta[];
};
export type OpcionesFlora = {
  nivel: Nivel;
  tamano: number;
  plaza: number;
  estanque: { x: number; z: number; radio: number } | null;
  /** Spots already taken (e.g. the Residuos' pieces): no plant within ~1.2 m × escala of them. */
  evitar?: readonly { x: number; z: number; escala?: number }[];
  /** Override the tier's triangle cap (tests). */
  maxTriangulos?: number;
};

// ------------------------------------------------------------------ geometry kit (local space, y up, base at y = 0)
type V3 = [number, number, number];
type Mat = "planta" | "cristal" | "metal" | "led";
type Tri = { p: [V3, V3, V3]; c: [number, number, number]; m: Mat };
type Hecha = { tris: Tri[]; alto: number };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const entre = (r: () => number, a: number, b: number) => a + (b - a) * r();

class Kit {
  tris: Tri[] = [];
  /** A triangle facing away from `centro`. */
  fuera(a: V3, b: V3, c: V3, ca: number, cb: number, cc: number, m: Mat, centro: V3): void {
    const n = cruz(sub(b, a), sub(c, a)), g: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(g, centro)) >= 0) this.tris.push({ p: [a, b, c], c: [ca, cb, cc], m });
    else this.tris.push({ p: [a, c, b], c: [ca, cc, cb], m });
  }
  /** A thin blade seen from both sides. */
  doble(a: V3, b: V3, c: V3, ca: number, cb: number, cc: number, m: Mat): void {
    this.tris.push({ p: [a, b, c], c: [ca, cb, cc], m }); this.tris.push({ p: [a, c, b], c: [ca, cc, cb], m });
  }
  /** Quad bands between consecutive rings (same vertex count), closed around; colour per ring row and per side. */
  bandas(anillos: V3[][], centros: V3[], col: (fila: number, k: number) => number, m: Mat): void {
    const n = anillos[0].length;
    for (let b = 0; b + 1 < anillos.length; b++) {
      const A = anillos[b], B = anillos[b + 1], cen: V3 = [(centros[b][0] + centros[b + 1][0]) / 2, (centros[b][1] + centros[b + 1][1]) / 2, (centros[b][2] + centros[b + 1][2]) / 2];
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        this.fuera(A[k], A[k2], B[k2], col(b, k), col(b, k2), col(b + 1, k2), m, cen);
        this.fuera(A[k], B[k2], B[k], col(b, k), col(b + 1, k2), col(b + 1, k), m, cen);
      }
    }
  }
  /** A fan from the last ring to an apex. */
  punta(anillo: V3[], centro: V3, apice: V3, col: (k: number) => number, colApice: number, m: Mat): void {
    for (let k = 0; k < anillo.length; k++) { const k2 = (k + 1) % anillo.length; this.fuera(anillo[k], anillo[k2], apice, col(k), col(k2), colApice, m, centro); }
  }
}
const anilloY = (r: number, y: number, seg: number, giro: number, jit?: number[]): V3[] => Array.from({ length: seg }, (_, k) => { const a = giro + (k / seg) * Math.PI * 2, rr = r * (jit ? jit[k] : 1); return [Math.cos(a) * rr, y, Math.sin(a) * rr]; });

// ------------------------------------------------------------------ the plants (each stands on y = 0; the foot sinks a little)
/** Fossil cactus: a ribbed column (ribs = alternating facet tones), 1 ring (short) or 2 rings (tall) of brass, a candelabra arm on some tall ones, a turquoise dot. */
function cactus(r: () => number, alto: boolean): Hecha {
  const K = new Kit(), H = alto ? entre(r, 1.8, 2.5) : entre(r, 1.0, 1.5), R = H * entre(r, 0.1, 0.12), seg = alto ? 5 : 6, g = r() * 6;
  // profile [radius factor, height fraction, is brass]
  const perfil: [number, number, boolean][] = alto
    ? [[1.05, 0, false], [1, 0.3, false], [1.24, 0.34, true], [1, 0.38, false], [0.94, 0.66, false], [1.2, 0.7, true], [0.92, 0.74, false], [0.62, 0.95, false]]
    : [[1.05, 0, false], [1, 0.5, false], [1.25, 0.55, true], [1, 0.6, false], [0.6, 0.94, false]];
  const anillos = perfil.map(([f, y]) => anilloY(R * f, y * H, seg, g)), centros = perfil.map(([, y]) => [0, y * H, 0] as V3);
  const piel = (fila: number, k: number) => {
    if (perfil[fila][2]) return k % 2 ? MAQUINA.laton : mezcla(MAQUINA.laton, CASA.arena, 0.25);
    const y = perfil[fila][1], base = k % 2 ? FLORA.cactusSurco : FLORA.cactus; // rib / groove
    return mezcla(base, FLORA.cactusLuz, k % 2 ? y * 0.25 : y * 0.5);
  };
  K.bandas(anillos, centros, piel, "planta");
  const ult = anillos.length - 1;
  K.punta(anillos[ult], centros[ult], [R * 0.08 * (r() - 0.5), H, R * 0.08 * (r() - 0.5)], (k) => piel(ult, k), FLORA.cactusLuz, "planta");
  // brass faces are metal (the bake keeps them bright); everything between their rows is skin
  for (const t of K.tris) {
    const ym = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3 / H, i = perfil.findIndex(([, , laton], q) => laton && ym > perfil[q - 1][1] && ym < perfil[q + 1][1]);
    if (i < 0) continue;
    const tono = ym < perfil[i][1] ? mezcla(MAQUINA.laton, MAQUINA.latonSombra, 0.3) : mezcla(MAQUINA.laton, CASA.arena, 0.2); // a crisp collar: shaded below, lit above
    t.m = "metal"; t.c = [tono, tono, tono];
  }
  if (alto && r() < 0.6) { // the arm: out, then up (a 4-sided mitred L-tube)
    const ya = H * entre(r, 0.42, 0.55), aa = r() * Math.PI * 2, u: V3 = [Math.cos(aa), 0, Math.sin(aa)], w: V3 = [-Math.sin(aa), 0, Math.cos(aa)], ra = R * 0.6, d = R * 2.4, sube = H * entre(r, 0.22, 0.32);
    const at = (c: V3, e1: V3, e2: V3, rr: number): V3[] => [0, 1, 2, 3].map((q) => { const a = (q / 4) * Math.PI * 2 + Math.PI / 4, cc = Math.cos(a) * rr, ss = Math.sin(a) * rr; return [c[0] + e1[0] * cc + e2[0] * ss, c[1] + e1[1] * cc + e2[1] * ss, c[2] + e1[2] * cc + e2[2] * ss] as V3; });
    const P0: V3 = [u[0] * R * 0.6, ya, u[2] * R * 0.6], P1: V3 = [u[0] * d, ya, u[2] * d], P2: V3 = [u[0] * d, ya + sube, u[2] * d];
    const yv: V3 = [0, 1, 0], mit: V3 = [-u[0], 1, -u[2]];
    const r0 = at(P0, yv, w, ra), r1 = at(P1, mit, w, ra), r2 = at(P2, [-u[0], 0, -u[2]], w, ra * 0.85);
    const brazo = (fila: number, k: number) => mezcla(k % 2 ? FLORA.cactusSurco : FLORA.cactus, FLORA.cactusLuz, fila * 0.25);
    K.bandas([r0, r1, r2], [P0, P1, P2], brazo, "planta");
    K.punta(r2, P2, [P2[0], P2[1] + ra * 0.9, P2[2]], (k) => brazo(2, k), FLORA.cactusLuz, "planta");
  }
  // the signal: a tiny turquoise pyramid on a rib at ~80 % of the height (cyber accent, a few pixels)
  const ad = g + (Math.floor(r() * seg) / seg) * Math.PI * 2, yd = H * (alto ? 0.82 : 0.78), rd = R * (alto ? 0.9 : 0.85), e = 0.05;
  const c: V3 = [Math.cos(ad) * rd, yd, Math.sin(ad) * rd], o: V3 = [Math.cos(ad), 0, Math.sin(ad)], t: V3 = [-Math.sin(ad), 0, Math.cos(ad)];
  const b0: V3 = [c[0] + t[0] * e, c[1] - e * 0.6, c[2] + t[2] * e], b1: V3 = [c[0] - t[0] * e, c[1] - e * 0.6, c[2] - t[2] * e], b2: V3 = [c[0], c[1] + e, c[2]], ap: V3 = [c[0] + o[0] * e * 1.6, c[1], c[2] + o[2] * e * 1.6];
  for (const [a1, a2] of [[b0, b1], [b1, b2], [b2, b0]] as [V3, V3][]) K.fuera(a1, a2, ap, SENAL.turquesa, SENAL.turquesa, SENAL.turquesa, "led", c);
  return { tris: K.tris, alto: H };
}

/** Glass spines: 3–6 thin three-sided shards leaning out of one root, sea-green glass with a deep turquoise heart and a light tip. */
function espinas(r: () => number): Hecha {
  const K = new Kit(), n = 3 + Math.floor(r() * 4); let alto = 0;
  for (let q = 0; q < n; q++) {
    const a = r() * Math.PI * 2, d = q === 0 ? 0 : entre(r, 0.12, 0.38), h = q === 0 ? entre(r, 0.9, 1.3) : entre(r, 0.4, 0.95), rb = entre(r, 0.06, 0.1), lean = q === 0 ? entre(r, 0, 0.12) : entre(r, 0.18, 0.5);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, g = r() * 6;
    const base = [0, 1, 2].map((k) => [cx + Math.cos(g + k * 2.094) * rb, -0.05, cz + Math.sin(g + k * 2.094) * rb] as V3);
    const tip: V3 = [cx + Math.cos(a) * Math.sin(lean) * h, Math.cos(lean) * h, cz + Math.sin(a) * Math.sin(lean) * h];
    for (let k = 0; k < 3; k++) K.fuera(base[k], base[(k + 1) % 3], tip, FLORA.espinaHondo, k === 1 ? FLORA.espina : FLORA.espinaHondo, FLORA.espinaPunta, "cristal", [cx, h * 0.3, cz]);
    alto = Math.max(alto, tip[1]);
  }
  return { tris: K.tris, alto };
}

/** Dark heather: a low lumpy pillow (5 sides, two rows and an off-centre crown), mourning-dark with a dusty wine top. */
function brezo(r: () => number): Hecha {
  const K = new Kit(), R = entre(r, 0.55, 0.95), H = R * entre(r, 0.6, 0.85), seg = 5, g = r() * 6;
  const j0 = Array.from({ length: seg }, () => entre(r, 0.82, 1.15)), j1 = Array.from({ length: seg }, () => entre(r, 0.75, 1.2));
  const A = anilloY(R, -0.05, seg, g, j0), B = anilloY(R * 0.74, H * 0.62, seg, g + 0.4, j1), cima: V3 = [R * 0.18 * (r() - 0.5), H, R * 0.18 * (r() - 0.5)];
  const col = (fila: number, k: number) => fila === 0 ? FLORA.brezo : mezcla(FLORA.brezo, FLORA.brezoLuz, 0.35 + 0.25 * ((k * 7) % 3) / 2);
  K.bandas([A, B], [[0, 0, 0], [0, H * 0.62, 0]], col, "planta");
  K.punta(B, [0, H * 0.4, 0], cima, (k) => col(1, k), FLORA.brezoLuz, "planta");
  return { tris: K.tris, alto: H };
}

/** Dry saffron bush: 5–7 double-sided blades fanning out of one root, toasted amber at the foot, amber at the tips. */
function azafran(r: () => number): Hecha {
  const K = new Kit(), n = 5 + Math.floor(r() * 3), H = entre(r, 0.55, 0.95); let alto = 0;
  for (let q = 0; q < n; q++) {
    const a = (q / n) * Math.PI * 2 + entre(r, -0.3, 0.3), out = entre(r, 0.18, 0.55), h = H * entre(r, 0.7, 1.05), w = entre(r, 0.06, 0.1);
    const ca = Math.cos(a), sa = Math.sin(a);
    const b0: V3 = [-sa * w, -0.04, ca * w], b1: V3 = [sa * w, -0.04, -ca * w], tip: V3 = [ca * out, h, sa * out];
    K.doble(b0, b1, tip, FLORA.azafranSeco, FLORA.azafranSeco, q % 2 ? FLORA.azafran : mezcla(FLORA.azafran, CASA.arena, 0.2), "planta");
    alto = Math.max(alto, h);
  }
  return { tris: K.tris, alto };
}

/** Thistle: a thin stalk with a spiky head (ash-silver bracts below, muted crimson crown), two spiky base leaves; a second head on some. */
function cardo(r: () => number): Hecha {
  const K = new Kit(), H = entre(r, 0.8, 1.25), cabezas = r() < 0.5 ? 2 : 1, g = r() * 6;
  for (let q = 0; q < cabezas; q++) {
    const h = q === 0 ? H : H * entre(r, 0.65, 0.8), a = r() * 6, off = q === 0 ? 0 : 0.18, hx = Math.cos(a) * off * 1.6, hz = Math.sin(a) * off * 1.6, rb = 0.035;
    const base = [0, 1, 2].map((k) => [Math.cos(a) * off * 0.3 + Math.cos(g + k * 2.094) * rb, -0.04, Math.sin(a) * off * 0.3 + Math.sin(g + k * 2.094) * rb] as V3);
    const cuello: V3 = [hx, h - 0.1, hz];
    for (let k = 0; k < 3; k++) K.fuera(base[k], base[(k + 1) % 3], cuello, FLORA.cardoTallo, FLORA.cardoTallo, FLORA.cardoTallo, "planta", [hx * 0.5, h * 0.4, hz * 0.5]);
    // head: a four-sided bipyramid, wider than tall, bracts below and crown above
    const rc = entre(r, 0.11, 0.15), cen: V3 = [hx, h, hz], ec = anilloY(rc, 0, 4, g + q).map((v) => [v[0] + hx, h, v[2] + hz] as V3), bajo: V3 = [hx, h - 0.12, hz], alto: V3 = [hx, h + rc * 1.3, hz];
    K.punta(ec, cen, bajo, () => FLORA.cardoPua, FLORA.cardoTallo, "planta");
    K.punta(ec, cen, alto, () => mezcla(FLORA.cardoFlor, FLORA.cardoPua, 0.15), FLORA.cardoFlor, "planta");
  }
  for (let q = 0; q < 2; q++) { // spiky base leaves
    const a = g + q * Math.PI + 0.4, ca = Math.cos(a), sa = Math.sin(a), L = entre(r, 0.3, 0.45);
    K.doble([-sa * 0.06, 0.02, ca * 0.06], [sa * 0.06, 0.02, -ca * 0.06], [ca * L, 0.16, sa * L], FLORA.cardoTallo, FLORA.cardoTallo, mezcla(FLORA.cardoTallo, FLORA.cardoPua, 0.4), "planta");
  }
  return { tris: K.tris, alto: H + 0.15 };
}

const HACER: Record<TipoPlanta, (r: () => number, alto: boolean) => Hecha> = { cactus, espinas: (r) => espinas(r), brezo: (r) => brezo(r), azafran: (r) => azafran(r), cardo: (r) => cardo(r) };

// ------------------------------------------------------------------ colour bake
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const aLineal = (hex: number): [number, number, number] => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Puesta = { tipo: TipoPlanta; hecha: Hecha; x: number; y: number; z: number; giro: number; escala: number; incl: [number, number]; zona: Zona };

function hornear(pp: Puesta, semilla: number, idx: number, pos: number[], col: number[]): void {
  const { hecha, escala, giro, incl } = pp, cy = Math.cos(giro), sy = Math.sin(giro), cx = Math.cos(incl[0]), sx = Math.sin(incl[0]), cz = Math.cos(incl[1]), sz = Math.sin(incl[1]);
  const mundo = (v: V3): V3 => {
    let x = v[0] * escala, y = v[1] * escala, z = v[2] * escala;
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1;
    const x2 = x * cz - y * sz, y2 = x * sz + y * cz; x = x2; y = y2;
    return [pp.x + x * cy + z * sy, pp.y + y, pp.z - x * sy + z * cy];
  };
  const alto = Math.max(0.2, hecha.alto);
  let t = 0;
  for (const tri of hecha.tris) {
    const w = tri.p.map(mundo) as [V3, V3, V3], n = cruz(sub(w[1], w[0]), sub(w[2], w[0])), ln = Math.hypot(n[0], n[1], n[2]) || 1, ny = n[1] / ln;
    const tono = hash2(semilla + 6300 + idx, t++, 23) - 0.5;
    for (let q = 0; q < 3; q++) {
      let c = tri.c[q];
      if (tri.m !== "led") {
        const h = Math.min(1, Math.max(0, tri.p[q][1] / alto));
        if (tri.m === "metal") c = mezcla(c, VERDES.verdin, 0.25 * sstep(0.3, 0.9, ny));                    // verdigris on the brass faces that look up
        else if (tri.m === "planta") c = mezcla(c, CASA.bronceOscuro, 0.32 * (1 - h) * (1 - h) * (1 - h));  // the ground swallows the foot
        c = mezcla(c, CASA.arenaVelada, (tri.m === "cristal" ? 0.08 : 0.16) * (1 - sstep(-0.2, 0.5, ny)));  // baked fill: faces turned from the sky are never black
        c = mezcla(c, tono > 0 ? CASA.arenaVelada : CASA.bronce, Math.abs(tono) * (tri.m === "cristal" ? 0.12 : 0.2)); // per-face tone jitter
      }
      pos.push(w[q][0], w[q][1], w[q][2]); col.push(...aLineal(c));
    }
  }
}

// ------------------------------------------------------------------ placement
type Sitio = { x: number; z: number; zona: Zona; paramo: boolean; i: number; j: number; prioridad: number };
const MOOR: [TipoPlanta, number][] = [["espinas", 3], ["cactus", 1.6], ["cardo", 1]];
const JARDIN: [TipoPlanta, number][] = [["brezo", 2.2], ["azafran", 2], ["cardo", 0.8]];
const elegir = (tabla: [TipoPlanta, number][], u: number): TipoPlanta => { const tot = tabla.reduce((a, [, w]) => a + w, 0); let a = 0; for (const [t, w] of tabla) { a += w / tot; if (u < a) return t; } return tabla[tabla.length - 1][0]; };

/** Is (x, z) free of the plaza, the pond, the border and the avoided spots? */
function libre(o: OpcionesFlora, x: number, z: number, m = 0): boolean {
  if (Math.hypot(x, z) < o.plaza + MARGEN_PLAZA_FLORA + m) return false;
  if (o.estanque && Math.hypot(x - o.estanque.x, z - o.estanque.z) < o.estanque.radio * 1.25 + MARGEN_ESTANQUE_FLORA + m) return false;
  if (Math.abs(x) > o.tamano / 2 - MARGEN_BORDE_FLORA || Math.abs(z) > o.tamano / 2 - MARGEN_BORDE_FLORA) return false;
  for (const e of o.evitar ?? []) if (Math.hypot(x - e.x, z - e.z) < 1.2 * (e.escala ?? 1) + 0.6) return false;
  return true;
}

function sitios(semilla: number, o: OpcionesFlora, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Sitio[] {
  const s = semilla | 0, n = Math.floor((o.tamano - 2 * MARGEN_BORDE_FLORA) / CELDA_FLORA), x0 = (-n * CELDA_FLORA) / 2, moor: Sitio[] = [], jardin: Sitio[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.2 + 0.6 * hash2(s + 6101, i, j)) * CELDA_FLORA, z = x0 + (j + 0.2 + 0.6 * hash2(s + 6102, i, j)) * CELDA_FLORA;
    if (!libre(o, x, z, 2)) continue;
    const zona = zonaEn(x, z), paramo = zona === "roca", jard = zona === "prado" || zona === "bosque";
    if (!paramo && !jard) continue;
    if (hash2(s + 6103, i, j) >= (paramo ? 0.6 : 0.2)) continue;
    const y = alturaEn(x, z);
    if (y < NIVEL_AGUA + 0.3) continue;
    const d = Math.hypot(x, z);
    // the near ones first (a player finds them within a short walk), then the seeded hash
    const p = hash2(s + 6105, i, j) * 0.5 + Math.min(1, Math.max(0, (d - 16) / 90)) * 1.0;
    (paramo ? moor : jardin).push({ x, z, zona, paramo, i, j, prioridad: p });
  }
  moor.sort((a, b) => a.prioridad - b.prioridad); jardin.sort((a, b) => a.prioridad - b.prioridad);
  // interleave moor and garden sites so every tier's cap shows both bands
  const res: Sitio[] = [];
  for (let k = 0; k < Math.max(moor.length, jardin.length); k++) { if (moor[k]) res.push(moor[k]); if (jardin[k]) res.push(jardin[k]); }
  return res;
}

function armar(semilla: number, o: OpcionesFlora, st: Sitio, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona, ocupadas: Puesta[]): Puesta[] {
  const r = crearAzar(Math.floor(hash2(semilla + 6200, st.i, st.j) * 4294967296)), quiere = 3 + Math.floor(r() * 3), res: Puesta[] = [];
  for (let k = 0; k < quiere * 3 && res.length < quiere; k++) {
    const tipo: TipoPlanta = k === 0 ? (st.paramo ? "cactus" : "brezo") : elegir(st.paramo ? MOOR : JARDIN, r());
    const a = r() * Math.PI * 2, d = k === 0 ? 0 : entre(r, 1.1, 3.6), x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d;
    if (!libre(o, x, z)) continue;
    const zona = zonaEn(x, z);
    if (!ZONAS_PLANTA[tipo].includes(zona)) continue;
    if ([...res, ...ocupadas].some((q) => Math.hypot(q.x - x, q.z - z) < 0.9)) continue;
    const hecha = HACER[tipo](r, k === 0 || r() < 0.35);
    const y0 = alturaEn(x, z), hs = [y0, alturaEn(x + 0.4, z), alturaEn(x - 0.4, z), alturaEn(x, z + 0.4), alturaEn(x, z - 0.4)], suelo = Math.min(...hs);
    if (suelo < NIVEL_AGUA + 0.2 || Math.max(...hs) - suelo > 0.6) continue;
    const escala = entre(r, 0.85, 1.15), incl: [number, number] = tipo === "cactus" ? [entre(r, -0.06, 0.06), entre(r, -0.06, 0.06)] : [entre(r, -0.12, 0.12), entre(r, -0.12, 0.12)];
    res.push({ tipo, hecha, x, y: suelo - 0.03, z, giro: r() * Math.PI * 2, escala, incl, zona });
  }
  return res;
}

/** Build the flora of a world: static triangles (positions + colours) and the list of plants. Pure and deterministic. */
export function construirFlora(semilla: number, o: OpcionesFlora, alturaEn: (x: number, z: number) => number, zonaEn: (x: number, z: number) => Zona): Flora {
  const tope = o.maxTriangulos ?? FLORA_POR_NIVEL[o.nivel], pos: number[] = [], col: number[] = [], plantas: Planta[] = [], puestas: Puesta[] = [];
  let usados = 0;
  if (tope > 0) for (const st of sitios(semilla, o, alturaEn, zonaEn)) {
    if (tope - usados < 12) break;
    let grupo = armar(semilla, o, st, alturaEn, zonaEn, puestas);
    if (grupo.length < 2) continue;
    // fit the rest of the budget: drop the last plants, a group keeps at least two
    let coste = grupo.reduce((a, p) => a + p.hecha.tris.length, 0);
    while (grupo.length > 2 && usados + coste > tope) { coste -= grupo[grupo.length - 1].hecha.tris.length; grupo = grupo.slice(0, -1); }
    if (usados + coste > tope) continue;
    usados += coste;
    grupo.forEach((p, k) => { hornear(p, semilla, st.i * 131 + st.j * 7 + k, pos, col); puestas.push(p); plantas.push({ tipo: p.tipo, x: p.x, y: p.y, z: p.z, alto: p.hecha.alto * p.escala, triangulos: p.hecha.tris.length, zona: p.zona }); });
  }
  return { posiciones: Float32Array.from(pos), colores: Float32Array.from(col), triangulos: pos.length / 9, plantas };
}
