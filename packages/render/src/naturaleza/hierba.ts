// hierba (naturaleza N3): instanced grass with wind, push-aside and flowers. ONE draw call for the grass (a tuft = 3
// tapered triangles, vertex colour dark at the root and light at the tip) plus ONE for the flowers (stem + a 4-sided bud,
// 5 triangles): 2 draw calls at every tier, no texture, no light, no pass, no shadow.
//
// HOW IT WORKS (and why it is not «all on the GPU»):
//  - The terrain height and the zone are JavaScript functions of (x, z) (terreno.ts), so a vertex shader cannot ask
//    «is this sand?». Placement therefore runs on the CPU, but ONCE per cell: the world is cut into square cells; a ring
//    of cells around the camera owns fixed slots in two instance buffers (a pool: a cell that leaves the ring frees its slot,
//    one that enters takes a free one), so when the camera crosses a cell border only the cells entering the ring are refilled (≤ 0.4 ms of CPU per frame,
//    resumable, nearest first) and everything else stays untouched. There is NO per-frame loop over instances.
//  - Placement is a pure function of (semilla, cell x, cell z, candidate k): same seed → same tuft in the same place,
//    on every device, the server included (tuftDe / florDe below; tested without any GPU).
//  - The vertex shader does the rest per vertex: rotate/scale the tuft, fade it out with distance by dithered thinning
//    (each tuft has its own threshold and SHRINKS to nothing at the edge, so nothing pops), bend it with the wind
//    (quadratic in blade height, a travelling low-frequency gust wave + a small fast flutter), and push it away from up
//    to 4 movers. Wind comes from the engine's `vientoU` uniform + one time uniform.
//
// COPIED (ideas and technique only, no code or assets):
//  - Instanced tufts with a vertex-colour gradient and a travelling-wave sway: three.js `webgpu_*` instanced-grass
//    examples (MIT) and the Codrops «Rendering grass with three.js / TSL» write-up; Ghost of Tsushima (GDC 2021) for the
//    idea of a gust wave that rolls over the field and of fading grass by scaling it to zero.
//  - The R2 low-discrepancy sequence (Martin Roberts, «The Unreasonable Effectiveness of Quasirandom Sequences», 2018)
//    to spread the candidates of a cell evenly (no clumps, no gaps) from one hash.
//  - Seeded hashing/noise: `semilla.ts` (N1).
// CHANGED: placement on the CPU per cell into a toroidal slot map instead of a compute pass (WebGL2 fallback has no
// compute); tufts are `InstancedBufferGeometry` (no 64-byte instance matrix per tuft: 32 bytes per tuft in all);
// the zone, slope and shore edge decide density; stylised flowers in clumps of one colour.
import * as THREE from "three/webgpu";
import { uniform, attribute, float, vec2, vec3, positionLocal, sin, cos, dot, length, normalize, max, clamp, smoothstep, mix, oneMinus, abs, transformNormalToView } from "three/tsl";
import { hash2, valor2 } from "./semilla.ts";
import { HIERBA_POR_NIVEL } from "./niveles.ts";
import type { HierbaNivel } from "./niveles.ts";
import type { Nivel } from "../calidad.ts";
import type { Zona } from "./terreno.ts";

/** What the grass needs from the terrain: the height and the zone at a world point (bind the seed: terreno.ts `crearTerreno().alturaEn`). */
export type Fuente = {
  alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona;
  /** N4: the world's palette (hex): meadow, forest floor and dry patches over the house colours. */
  colores?: { prado?: number; bosque?: number; seco?: number };
};

/** Palette (linear via THREE.Color): the brief's warm meadow green, a deeper forest green, a yellowing patch, three flowers. */
export const PALETA_HIERBA = { prado: 0x9bc25a, bosque: 0x558c3b, seco: 0xc9cf62, flores: [0xfaf6ea, 0xffd84a, 0xf28fb5] as number[] };
/** Share of the meadow's candidates kept under trees. */
export const DENSIDAD_BOSQUE = 0.4;
/** Height (m) of a tuft at scale 1, and of a flower. */
export const ALTO_TUFT = 0.78, ALTO_FLOR = 0.85;
const TAU = Math.PI * 2;
const R2A = 0.7548776662466927, R2B = 0.5698402909980532;
const frac = (v: number) => v - Math.floor(v);
const paso = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A random number in 0…1 for (seed, cell, candidate, channel): every tuft draws the same numbers whatever the order. */
const azar = (s: number, cx: number, cz: number, k: number, canal: number) => hash2((s + canal * 7919) | 0, cx * 1024 + k, cz * 16 + canal);

const cPrado = new THREE.Color(PALETA_HIERBA.prado), cBosque = new THREE.Color(PALETA_HIERBA.bosque), cSeco = new THREE.Color(PALETA_HIERBA.seco);
const cFlores = PALETA_HIERBA.flores.map((h) => new THREE.Color(h));
const tmp = new THREE.Color(), tmp2 = new THREE.Color(), tmp3 = new THREE.Color(), tmp4 = new THREE.Color();

/** One placed tuft: world position (y = ground), yaw, scale, linear colour. Written by `tuftDe`/`florDe` into a scratch. */
export type Pieza = { x: number; y: number; z: number; giro: number; escala: number; r: number; g: number; b: number };
const nuevaPieza = (): Pieza => ({ x: 0, y: 0, z: 0, giro: 0, escala: 0, r: 0, g: 0, b: 0 });

/** Slope (rise over run) of the ground at a point, from two forward differences 0.6 m apart. */
function pendiente(f: Fuente, x: number, z: number, y: number): number {
  const dx = f.alturaEn(x + 0.6, z) - y, dz = f.alturaEn(x, z + 0.6) - y;
  return Math.hypot(dx, dz) / 0.6;
}

/** Candidate `k` of cell (cx, cz): a tuft, or false when the zone, the shore edge or the slope say no. Pure. */
export function tuftDe(semilla: number, cx: number, cz: number, k: number, f: Fuente, celda: number, out: Pieza): boolean {
  const x = (cx + frac(azar(semilla, cx, cz, 0, 0) + k * R2A)) * celda, z = (cz + frac(azar(semilla, cx, cz, 0, 1) + k * R2B)) * celda;
  const zona = f.zonaEn(x, z);
  if (zona !== "prado" && zona !== "bosque") return false;       // never on sand, rock or the water's edge
  if (azar(semilla, cx, cz, k, 2) >= (zona === "prado" ? 1 : DENSIDAD_BOSQUE)) return false;
  // soften the fringe: near a non-grass zone, half the tufts give way (one extra zone probe, 0.7 m away)
  const a = azar(semilla, cx, cz, k, 3) * TAU, z2 = f.zonaEn(x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7);
  if (z2 !== "prado" && z2 !== "bosque" && azar(semilla, cx, cz, k, 4) < 0.6) return false;
  const y = f.alturaEn(x, z);
  if (azar(semilla, cx, cz, k, 5) >= 1 - paso(0.45, 0.95, pendiente(f, x, z, y))) return false; // steep ground: thinner
  const claro = valor2(semilla + 11, x * 0.06, z * 0.06), fino = valor2(semilla + 23, x * 0.11, z * 0.11), seco = paso(0.62, 0.9, valor2(semilla + 37, x * 0.03, z * 0.03));
  const pal = f.colores, cp = pal?.prado !== undefined ? tmp2.set(pal.prado) : cPrado;
  tmp.copy(zona === "prado" ? cp : pal?.bosque !== undefined ? tmp3.set(pal.bosque) : cBosque);
  if (zona === "prado") tmp.lerp(pal?.seco !== undefined ? tmp4.set(pal.seco) : cSeco, seco * 0.55);
  // a slow large-scale light/dark patchiness, a finer one and a per-tuft jitter
  const luz = (0.66 + 0.5 * claro + (fino - 0.5) * 0.14) * (0.88 + 0.24 * azar(semilla, cx, cz, k, 7));
  out.x = x; out.y = y; out.z = z; out.giro = azar(semilla, cx, cz, k, 6) * TAU;
  const alto = 0.8 + 0.6 * azar(semilla, cx, cz, k, 8);
  out.escala = zona === "prado" ? alto : alto * 0.82;
  out.r = tmp.r * luz; out.g = tmp.g * luz; out.b = tmp.b * luz;
  return true;
}

/** Candidate `k` of the flower buffer of cell (cx, cz): a flower tuft in a meadow clump (one colour per clump, with the odd stray). Pure. */
export function florDe(semilla: number, cx: number, cz: number, k: number, f: Fuente, celda: number, out: Pieza): boolean {
  const x = (cx + frac(azar(semilla, cx, cz, 0, 9) + k * R2A)) * celda, z = (cz + frac(azar(semilla, cx, cz, 0, 10) + k * R2B)) * celda;
  if (f.zonaEn(x, z) !== "prado") return false;                  // flowers only in the meadow
  const mancha = valor2(semilla + 51, x * 0.07, z * 0.07);
  if (azar(semilla, cx, cz, k, 11) >= paso(0.36, 0.6, mancha)) return false;
  const y = f.alturaEn(x, z);
  if (pendiente(f, x, z, y) > 0.7) return false;
  const tono = azar(semilla, cx, cz, k, 12) < 0.2 ? azar(semilla, cx, cz, k, 13) : valor2(semilla + 63, x * 0.05, z * 0.05);
  tmp.copy(cFlores[tono < 0.36 ? 0 : tono < 0.7 ? 1 : 2]);
  const luz = 0.94 + 0.12 * azar(semilla, cx, cz, k, 14);
  out.x = x; out.y = y; out.z = z; out.giro = azar(semilla, cx, cz, k, 15) * TAU;
  out.escala = 0.7 + 0.55 * azar(semilla, cx, cz, k, 16);
  out.r = tmp.r * luz; out.g = tmp.g * luz; out.b = tmp.b * luz;
  return true;
}

/** The cells of the ring around the camera's cell, nearest first, the side of the slot map and the capacities per cell. */
export type Anillo = { celdas: { dx: number; dz: number }[]; lado: number; capTuft: number; capFlor: number };
export function anillo(n: HierbaNivel): Anillo {
  const m = Math.ceil((n.radio + 1.2 * n.celda) / n.celda), celdas: { dx: number; dz: number }[] = [];
  for (let dz = -m; dz <= m; dz++) for (let dx = -m; dx <= m; dx++) if (Math.hypot(dx, dz) * n.celda <= n.radio + 1.2 * n.celda) celdas.push({ dx, dz });
  celdas.sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz) || a.dz - b.dz || a.dx - b.dx);
  return { celdas, lado: 2 * m + 1, capTuft: Math.max(1, Math.floor(n.tuftsMax / celdas.length)), capFlor: n.floresMax > 0 ? Math.max(1, Math.floor(n.floresMax * n.tuftsMax / celdas.length)) : 0 };
}

/** All the tufts / flowers of one cell, in candidate order (pure; tests and the server use it, the page fills buffers with it). */
export function tuftsDeCelda(semilla: number, cx: number, cz: number, f: Fuente, n: HierbaNivel): Pieza[] {
  const a = anillo(n), res: Pieza[] = [];
  for (let k = 0; k < a.capTuft; k++) { const p = nuevaPieza(); if (tuftDe(semilla, cx, cz, k, f, n.celda, p)) res.push(p); }
  return res;
}
export function floresDeCelda(semilla: number, cx: number, cz: number, f: Fuente, n: HierbaNivel): Pieza[] {
  const a = anillo(n), res: Pieza[] = [];
  for (let k = 0; k < a.capFlor; k++) { const p = nuevaPieza(); if (florDe(semilla, cx, cz, k, f, n.celda, p)) res.push(p); }
  return res;
}

// ---------------------------------------------------------------- geometry
/** Grass tuft: `hojas` tapered triangles (1 each) leaning out from the centre, height 1 (× ALTO_TUFT m), dark root, light tip. */
export function geometriaTuft(hojas = 3): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const alturas = [1, 0.78, 0.9, 0.7, 0.95];
  for (let i = 0; i < hojas; i++) {
    const a = (i / hojas) * TAU + 0.35 + i * 0.1, rx = Math.cos(a), rz = Math.sin(a), tx = -rz, tz = rx, h = alturas[i % 5];
    const w = 0.3, b0 = 0.06, b1 = 0.42 * h;
    pos.push(rx * b0 - tx * w, 0, rz * b0 - tz * w, rx * b0 + tx * w, 0, rz * b0 + tz * w, rx * b1 + tx * 0.04, h, rz * b1 + tz * 0.04);
    col.push(0.55, 0.68, 0.45, 0.55, 0.68, 0.45, 0.9, 1.08, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("cab", new THREE.Float32BufferAttribute(new Array(hojas * 3).fill(0), 1));
  return g;
}
/** Flower: a thin stem (1 triangle) and a 4-sided bud on top (4 triangles), height 1 (× ALTO_FLOR m). Head vertices carry `cab` = 1. */
export function geometriaFlor(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], cab: number[] = [];
  pos.push(-0.035, 0, 0, 0.035, 0, 0, 0.05, 0.84, 0.02);
  col.push(0.1, 0.22, 0.05, 0.1, 0.22, 0.05, 0.24, 0.45, 0.1); cab.push(0, 0, 0);
  const r = 0.2, y0 = 0.72, y1 = 1.04, c = [[r, 0], [0, r], [-r, 0], [0, -r]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    pos.push(0.05 + ax, y0, 0.02 + az, 0.05 + bx, y0, 0.02 + bz, 0.05, y1, 0.02);
    col.push(0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.2, 1.2, 1.2); cab.push(1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("cab", new THREE.Float32BufferAttribute(cab, 1));
  return g;
}
export const TRIANGULOS_TUFT = 3, TRIANGULOS_FLOR = 5;

// ---------------------------------------------------------------- material (TSL)
type N = ReturnType<typeof float>;
type Entrada = {
  viento: ReturnType<typeof uniform>; tiempo: ReturnType<typeof uniform>; camara: ReturnType<typeof uniform>; radio: number;
  empuja: ReturnType<typeof uniform>[]; aleteo: boolean; tam: number; flor: boolean;
};
/** The grass material: instanced placement attributes (iPos = x,y,z,yaw · iCol = linear rgb, scale), fade, wind, push, colour. */
export function materialHierba(e: Entrada): THREE.MeshLambertNodeMaterial {
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  mat.name = e.flor ? "hierba-flores" : "hierba";
  const iPos = attribute("iPos", "vec4"), iCol = attribute("iCol", "vec4");
  const base = iPos.xyz as unknown as ReturnType<typeof vec3>, giro = iPos.w as unknown as N, esc0 = iCol.w as unknown as N;
  const bxz = base.xz as unknown as ReturnType<typeof vec2>;
  const rnd = giro.mul(1 / TAU) as N;
  const cam = e.camara as unknown as ReturnType<typeof vec3>;
  // ---- distance fade: dithered thinning (every tuft has its own threshold) and shrink to 0 at the edge: no popping ----
  const dist = length(bxz.sub(cam.xz));
  const queda = oneMinus(smoothstep(e.radio * 0.7, e.radio, dist)) as N;
  const k = esc0.mul(clamp(queda.sub(rnd.mul(0.8)).mul(5), 0, 1)) as N;
  const alto = k.mul(e.tam) as N;
  const p = positionLocal as unknown as ReturnType<typeof vec3>;
  const h = p.y as unknown as N;
  const w = h.mul(h) as N;                                       // bending grows with the square of the height
  // ---- wind: a gust wave travelling over the field along the wind + a slower cross wave; a small fast flutter ----
  const viento = (e.viento as unknown as ReturnType<typeof vec3>).xz as unknown as ReturnType<typeof vec2>;
  const t = e.tiempo as unknown as N;
  const vel = length(viento) as N;
  const dir = normalize(viento.add(vec2(0.3, 0.2))) as unknown as ReturnType<typeof vec2>;
  const lado = vec2(dir.y.negate(), dir.x) as unknown as ReturnType<typeof vec2>;
  const along = dot(bxz, dir) as N;
  const ph1 = along.mul(0.17).sub(t.mul(vel.mul(0.18).add(1.1))) as N;
  const ph2 = dot(bxz, lado).mul(0.11).add(along.mul(0.29)).sub(t.mul(1.9)) as N;
  const gust = sin(ph1).mul(0.65).add(sin(ph2).mul(0.35)).mul(0.5).add(0.5) as N;   // 0 … 1
  const S = clamp(vel.div(9), 0, 1) as N;
  const amp = gust.mul(0.04).add(0.035).add(S.mul(gust.mul(0.5).add(0.1))) as N;     // share of the tuft's height at the tip
  const lean = alto.mul(w).mul(amp) as N;
  let dx = dir.x.mul(lean) as N, dz = dir.y.mul(lean) as N;
  if (e.aleteo) {
    const fl = sin(t.mul(rnd.mul(4).add(6)).add(rnd.mul(TAU * 3)).add(base.x.mul(1.3))).mul(alto.mul(w).mul(S.mul(0.05).add(0.016))) as N;
    dx = dx.add(lado.x.mul(fl)) as N; dz = dz.add(lado.y.mul(fl)) as N;
  }
  let aplasta = amp.mul(w).mul(0.35) as N;
  // ---- the movers (up to 4): grass within ~0.8 m leans away from them and lies down a little ----
  for (const u of e.empuja) {
    const m = u as unknown as ReturnType<typeof import("three/tsl").vec4>;
    const d = bxz.sub(m.xz) as unknown as ReturnType<typeof vec2>;
    const dd = length(d) as N;
    const nivelY = oneMinus(smoothstep(1.5, 3, abs(base.y.sub(m.y)))) as N;
    const infl = oneMinus(smoothstep(0, m.w, dd)).mul(nivelY) as N;
    const f = infl.mul(alto).mul(w).mul(1.4).div(max(dd, 0.05)) as N;
    dx = dx.add(d.x.mul(f)) as N; dz = dz.add(d.y.mul(f)) as N;
    aplasta = aplasta.add(infl.mul(w).mul(0.55)) as N;
  }
  const cg = cos(giro) as N, sg = sin(giro) as N;
  const lx = p.x.mul(e.tam).mul(k) as N, lz = p.z.mul(e.tam).mul(k) as N;
  const ly = h.mul(alto).mul(oneMinus(clamp(aplasta, 0, 0.7))) as N;
  mat.positionNode = vec3(base.x.add(lx.mul(cg)).sub(lz.mul(sg)).add(dx), base.y.add(ly), base.z.add(lx.mul(sg)).add(lz.mul(cg)).add(dz));
  // ---- colour: vertex gradient × the tuft's colour (zone, patches, tint); flowers keep a green stem; light ripples with the gust ----
  const vc = attribute("color", "vec3") as unknown as ReturnType<typeof vec3>;
  const tinte = iCol.xyz as unknown as ReturnType<typeof vec3>;
  const brillo = gust.mul(S.mul(0.5).add(0.12)).toVarying("hierba_racha") as N;
  const albedo = e.flor ? mix(vc, vc.mul(tinte), attribute("cab", "float") as unknown as N) : vc.mul(tinte);
  mat.colorNode = (albedo as unknown as ReturnType<typeof vec3>).mul(brillo.mul(0.4).add(0.88));
  // a soft, nearly upward normal on every blade: the meadow reads as one lit surface, not as spikes
  mat.normalNode = transformNormalToView(vec3(0, 1, 0));
  return mat;
}

// ---------------------------------------------------------------- the piece
export type OpcionesHierba = {
  /** Integer seed (the same one the terrain uses). */
  semilla: number;
  /** Device tier; default `h.nivel`. */
  nivel?: Nivel;
  /** Add the group to this parent; dispose() removes it. */
  escena?: THREE.Object3D;
  /** Override the tier's table (tests, photos). */
  tabla?: Partial<HierbaNivel>;
  /** The camera pushes grass aside too (default true: the first-person player); off for orbit cameras. */
  empujaCamara?: boolean;
  /** Blades per tuft (default 3; every blade is one triangle). */
  hojas?: number;
};
export type HierbaH = { vientoU: unknown; nivel?: Nivel };
export type Mover = { x: number; y: number; z: number };
export type EstadisticasHierba = {
  dibujos: number; instancias: number; tuftsVivos: number; floresVivas: number; triangulosVivos: number; triangulosEnviados: number;
  pendientes: number; msUltimo: number; msMax: number; celdasLlenadas: number;
};
const LEJOS = 1e6;

export function crearHierba(h: HierbaH, fuente: Fuente, op: OpcionesHierba) {
  const nivel = op.nivel ?? h.nivel ?? "A";
  const cfg: HierbaNivel = { ...HIERBA_POR_NIVEL[nivel], ...op.tabla };
  const a = anillo(cfg), hojas = op.hojas ?? 3;
  const nSlots = a.celdas.length, nTuft = a.capTuft * nSlots, nFlor = a.capFlor * nSlots;
  const uT = uniform(0), uCam = uniform(new THREE.Vector3(LEJOS, 0, LEJOS));
  const uP = [0, 1, 2, 3].map(() => uniform(new THREE.Vector4(LEJOS, 0, LEJOS, 0.8)));
  const grupo = new THREE.Group(); grupo.name = "hierba";
  const crear = (geo: THREE.BufferGeometry, n: number, flor: boolean) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", geo.getAttribute("position")); g.setAttribute("color", geo.getAttribute("color")); g.setAttribute("cab", geo.getAttribute("cab"));
    const pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", pos); g.setAttribute("iCol", col);
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), cfg.radio + 20);
    const mat = materialHierba({ viento: h.vientoU as ReturnType<typeof uniform>, tiempo: uT, camara: uCam, radio: cfg.radio, empuja: uP, aleteo: cfg.aleteo, tam: flor ? ALTO_FLOR : ALTO_TUFT, flor });
    const m = new THREE.Mesh(g, mat);
    m.name = flor ? "hierba-flores" : "hierba-tufts"; m.matrixAutoUpdate = false; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = true; m.userData.sinSombra = true;
    grupo.add(m);
    return { m, g, pos, col, mat };
  };
  const T = crear(geometriaTuft(hojas), nTuft, false);
  const F = a.capFlor > 0 ? crear(geometriaFlor(), nFlor, true) : null;
  op.escena?.add(grupo);

  // slot state: which cell it holds, how far its fill got, how many it holds
  type Slot = { cx: number; cz: number; k: number; nT: number; nF: number; hecho: boolean; vivo: boolean };
  const slots: Slot[] = Array.from({ length: nSlots }, () => ({ cx: 0, cz: 0, k: 0, nT: 0, nF: 0, hecho: true, vivo: false }));
  let cxA = NaN, czA = NaN, cola: number[] = [], vivosT = 0, vivosF = 0, llenadas = 0, msUltimo = 0, msMax = 0;
  const sucios = new Set<number>();
  const pieza = nuevaPieza();

  const limpiar = (s: number) => {
    const st = slots[s];
    vivosT -= st.nT; vivosF -= st.nF; st.nT = 0; st.nF = 0; st.k = 0;
    T.pos.array.fill(0, s * a.capTuft * 4, (s + 1) * a.capTuft * 4); T.col.array.fill(0, s * a.capTuft * 4, (s + 1) * a.capTuft * 4);
    if (F) { F.pos.array.fill(0, s * a.capFlor * 4, (s + 1) * a.capFlor * 4); F.col.array.fill(0, s * a.capFlor * 4, (s + 1) * a.capFlor * 4); }
    sucios.add(s);
  };
  const recentrar = (cx0: number, cz0: number) => {
    const quiere = new Map<string, { cx: number; cz: number }>(), tienen = new Map<string, number>();
    for (const c of a.celdas) quiere.set(`${cx0 + c.dx},${cz0 + c.dz}`, { cx: cx0 + c.dx, cz: cz0 + c.dz });
    const libres: number[] = [];
    for (let s = 0; s < nSlots; s++) {
      const st = slots[s], k = `${st.cx},${st.cz}`;
      if (st.vivo && quiere.has(k)) { tienen.set(k, s); continue; }
      if (st.vivo || st.nT || st.nF) limpiar(s);
      st.vivo = false; st.hecho = true; libres.push(s);
    }
    for (const [k, q] of quiere) {            // the cells entering the ring take the slots the leaving ones freed
      if (tienen.has(k)) continue;
      const s = libres.pop()!, st = slots[s];
      st.cx = q.cx; st.cz = q.cz; st.vivo = true; st.hecho = false; st.k = 0; tienen.set(k, s);
    }
    // nearest first so the ground at the player's feet grows before the far edge
    const d = (s: number) => Math.hypot(slots[s].cx - cx0, slots[s].cz - cz0);
    cola = [...tienen.values()].filter((s) => !slots[s].hecho).sort((p, q) => d(p) - d(q));
    const c = T.g.boundingSphere!.center; c.set((cx0 + 0.5) * cfg.celda, 4, (cz0 + 0.5) * cfg.celda);
    if (F) F.g.boundingSphere!.center.copy(c);
  };
  const llenar = (s: number, hasta: number): boolean => {
    const st = slots[s], total = a.capTuft + a.capFlor;
    let n = 0;
    while (st.k < total && n < 12) {
      const k = st.k++; n++;
      if (k < a.capTuft) {
        if (!tuftDe(op.semilla, st.cx, st.cz, k, fuente, cfg.celda, pieza)) continue;
        const o = (s * a.capTuft + st.nT++) * 4; vivosT++;
        T.pos.array[o] = pieza.x; T.pos.array[o + 1] = pieza.y; T.pos.array[o + 2] = pieza.z; T.pos.array[o + 3] = pieza.giro;
        T.col.array[o] = pieza.r; T.col.array[o + 1] = pieza.g; T.col.array[o + 2] = pieza.b; T.col.array[o + 3] = pieza.escala;
      } else if (F) {
        if (!florDe(op.semilla, st.cx, st.cz, k - a.capTuft, fuente, cfg.celda, pieza)) continue;
        const o = (s * a.capFlor + st.nF++) * 4; vivosF++;
        F.pos.array[o] = pieza.x; F.pos.array[o + 1] = pieza.y; F.pos.array[o + 2] = pieza.z; F.pos.array[o + 3] = pieza.giro;
        F.col.array[o] = pieza.r; F.col.array[o + 1] = pieza.g; F.col.array[o + 2] = pieza.b; F.col.array[o + 3] = pieza.escala;
      }
    }
    sucios.add(s);
    if (st.k >= total) { st.hecho = true; llenadas++; return true; }
    return performance.now() < hasta;
  };
  const subir = () => {
    if (!sucios.size) return;
    for (const s of sucios) {
      T.pos.addUpdateRange(s * a.capTuft * 4, a.capTuft * 4); T.col.addUpdateRange(s * a.capTuft * 4, a.capTuft * 4);
      if (F) { F.pos.addUpdateRange(s * a.capFlor * 4, a.capFlor * 4); F.col.addUpdateRange(s * a.capFlor * 4, a.capFlor * 4); }
    }
    T.pos.needsUpdate = T.col.needsUpdate = true; if (F) F.pos.needsUpdate = F.col.needsUpdate = true;
    sucios.clear();
  };

  /** Call once per frame: sets the clock and the camera, recentres the ring at a cell border, refills ≤ presupuestoMs of cells. */
  function actualizar(camara: THREE.Object3D, t: number, empujan: readonly Mover[] = []) {
    uT.value = t;
    const p = camara.position;
    (uCam.value as THREE.Vector3).copy(p);
    // F4 audit: no list is built per frame (the camera is slot 0 when it pushes the grass, the rest follow)
    const sinCam = op.empujaCamara === false ? 0 : 1;
    for (let i = 0; i < 4; i++) {
      const v = uP[i].value as THREE.Vector4, m = i < sinCam ? null : empujan[i - sinCam];
      if (i < sinCam) v.set(p.x, p.y - 1.7, p.z, 0.8); else if (m) v.set(m.x, m.y, m.z, 0.8); else v.set(LEJOS, 0, LEJOS, 0.8);
    }
    const t0 = performance.now();
    const cx0 = Math.floor(p.x / cfg.celda), cz0 = Math.floor(p.z / cfg.celda);
    if (cx0 !== cxA || cz0 !== czA) { cxA = cx0; czA = cz0; recentrar(cx0, cz0); }
    const hasta = t0 + cfg.presupuestoMs;
    while (cola.length) {
      const s = cola[0];
      if (!slots[s].vivo || slots[s].hecho) { cola.shift(); continue; }
      const seguir = llenar(s, hasta);
      if (slots[s].hecho) cola.shift();
      if (!seguir) break;
    }
    subir();
    msUltimo = performance.now() - t0; if (msUltimo > msMax) msMax = msUltimo;
  }
  /** Fill the whole ring now (loading screen, tests, photos): never call per frame. */
  function llenarTodo(camara: THREE.Object3D) {
    const antes = cfg.presupuestoMs; cfg.presupuestoMs = 1e9;
    actualizar(camara, uT.value as number); cfg.presupuestoMs = antes;
  }
  /** Tufts that rasterise something right now (scale after the fade > 0), for the camera at (x, z): a counter, never per frame. */
  function visibles(x: number, z: number) {
    let tufts = 0, flores = 0;
    const cuenta = (pos: Float32Array, col: Float32Array, n: number) => {
      let c = 0;
      for (let i = 0; i < n; i++) {
        const esc = col[i * 4 + 3]; if (esc <= 0) continue;
        const d = Math.hypot(pos[i * 4] - x, pos[i * 4 + 2] - z), q = 1 - paso(cfg.radio * 0.7, cfg.radio, d), rnd = pos[i * 4 + 3] / TAU;
        if (Math.min(1, Math.max(0, (q - rnd * 0.8) * 5)) > 0) c++;
      }
      return c;
    };
    tufts = cuenta(T.pos.array as Float32Array, T.col.array as Float32Array, nTuft);
    if (F) flores = cuenta(F.pos.array as Float32Array, F.col.array as Float32Array, nFlor);
    return { tufts, flores, triangulos: tufts * TRIANGULOS_TUFT + flores * TRIANGULOS_FLOR };
  }
  function estadisticas(): EstadisticasHierba {
    return {
      dibujos: F ? 2 : 1, instancias: nTuft + nFlor, tuftsVivos: vivosT, floresVivas: vivosF,
      triangulosVivos: vivosT * hojas + vivosF * TRIANGULOS_FLOR, triangulosEnviados: nTuft * hojas + nFlor * TRIANGULOS_FLOR,
      pendientes: cola.length, msUltimo, msMax, celdasLlenadas: llenadas,
    };
  }
  function dispose() {
    grupo.removeFromParent();
    for (const x of [T, F]) if (x) { x.g.dispose(); x.mat.dispose(); }
  }
  return { malla: grupo, mallas: F ? [T.m, F.m] : [T.m], actualizar, llenarTodo, visibles, estadisticas, dispose, config: cfg, anillo: a, bytes: (nTuft + nFlor) * 32 };
}
export type Hierba = ReturnType<typeof crearHierba>;
