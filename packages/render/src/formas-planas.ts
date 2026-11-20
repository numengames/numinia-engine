// formas-planas (mundo-hermes, v0): the flat black-and-white shapes of things that live OUTSIDE the world (the espejo), made by code — no .glb, no
// texture, no gradient, no light. Pure black and pure white only; a white edge on black is the whole look. ONE mesh per shape (vertex colours on one shared
// unlit material: 1 draw call per thing), nothing per frame. The page's start bundle holds only formas-vista.ts; this file is fetched with the first shape.
// The states language is the house one (off / starting / on): OFF = white OUTLINE on black, ON = white FILL, STARTING = outline with a small white core,
// FAIL = outline crossed out. A shape never moves or animates; a change is one rebuild.
//   reloj  an upright clock face on a post (a scheduled task): outline + a hand, filled when on
//   cubo   a cube (a session: a new place): black faces, white edges, the top face white when on
//   losa   a slab standing up (the switch panel): black, white edge, a row of lamps (filled = on)
//   suelo  the floor of a zone: only its white edge on the world's black ground (dashed when the zone's function is off)
//   perfil a standing figure (a Hermes profile / agent) with a status lamp over its head: working = white fill, idle = outline, off = dashed outline
//   uso    a vertical meter (spend): ten stacked flat segments, filled from the bottom up to `nivel` (0..1); its tokens are the label (a tag, not geometry)
import * as THREE from "three/webgpu";

export type EstadoForma = "off" | "starting" | "on" | "fail";
export type FormaPlana = {
  forma: "reloj" | "cubo" | "losa" | "suelo" | "perfil" | "uso" | "estante" | "tableta" | "tablero" | "proyecto" | "guia";
  x: number; z: number;
  estado: EstadoForma;
  /** The way the front looks, radians around the vertical (0 = towards +z). */
  rumbo?: number;
  /** reloj: where the hand points, 0..1 of a turn. */
  mano?: number;
  /** suelo: the size of the zone (m). */
  ancho?: number; fondo?: number;
  /** suelo: draw the edge dashed (the zone's functions are all off). */
  discontinuo?: boolean;
  /** losa: one lamp per switch, true = on (white fill), false = off (outline). */
  luces?: boolean[];
  /** uso: how full the meter is, 0..1 (anything else is clamped; not a number = empty). */
  nivel?: number;
  /** tablero: the three columns (por hacer, en curso, hecho): how many cards each has and the titles of the top ones. */
  columnas?: { n: number; top: string[] }[];
};

export const B = 1, N = 0; // white, black
/** Accumulates triangles with a flat colour each into one geometry. Local space: x right, y up, z towards the viewer. */
export class Malla {
  pos: number[] = []; col: number[] = []; idx: number[] = [];
  tri(a: number[], b: number[], c: number[], color: number): void {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) this.col.push(color, color, color);
    this.idx.push(i, i + 1, i + 2);
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: number): void { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  /** A flat rectangle in the xy plane at depth z. */
  rect(x0: number, y0: number, x1: number, y1: number, z: number, color: number): void { this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], color); }
  /** A flat disc in the xy plane. */
  disco(cx: number, cy: number, r: number, z: number, color: number, lados = 32): void {
    for (let i = 0; i < lados; i++) { const a = (i / lados) * Math.PI * 2, b = ((i + 1) / lados) * Math.PI * 2; this.tri([cx, cy, z], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z], [cx + Math.cos(b) * r, cy + Math.sin(b) * r, z], color); }
  }
  anillo(cx: number, cy: number, r0: number, r1: number, z: number, color: number, lados = 40): void {
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2, b = ((i + 1) / lados) * Math.PI * 2;
      this.quad([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, z], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, z], [cx + Math.cos(b) * r1, cy + Math.sin(b) * r1, z], [cx + Math.cos(b) * r0, cy + Math.sin(b) * r0, z], color);
    }
  }
  /** A bar of width `w` from (x0,y0) to (x1,y1) in the xy plane. */
  barra(x0: number, y0: number, x1: number, y1: number, w: number, z: number, color: number): void {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
    this.quad([x0 + nx, y0 + ny, z], [x1 + nx, y1 + ny, z], [x1 - nx, y1 - ny, z], [x0 - nx, y0 - ny, z], color);
  }
  /** The outline of a rectangle (4 bars). */
  marco(x0: number, y0: number, x1: number, y1: number, w: number, z: number, color: number): void {
    this.rect(x0, y0, x1, y0 + w, z, color); this.rect(x0, y1 - w, x1, y1, z, color); this.rect(x0, y0, x0 + w, y1, z, color); this.rect(x1 - w, y0, x1, y1, z, color);
  }
  geometria(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3)); g.setIndex(this.idx);
    return g;
  }
}

/** The clock: face r = 0.9 at 1.9 m on a post. Layers (z): fill/face 0, ring 0.01, ticks and hand 0.02. */
function reloj(m: Malla, f: FormaPlana): void {
  const cy = 1.9, R = 0.9, lleno = f.estado === "on", ang = (f.mano ?? 0) * Math.PI * 2, tinta = lleno ? N : B;
  m.rect(-0.04, 0, 0.04, cy - R, 0, B); // the post, white
  m.disco(0, cy, R, 0, lleno ? B : N);
  m.anillo(0, cy, R - 0.07, R, 0.01, B);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r0 = i % 3 === 0 ? 0.62 : 0.72, r1 = 0.78; m.barra(Math.sin(a) * r0, cy + Math.cos(a) * r0, Math.sin(a) * r1, cy + Math.cos(a) * r1, i % 3 === 0 ? 0.06 : 0.03, 0.02, tinta); }
  m.barra(0, cy, Math.sin(ang) * 0.6, cy + Math.cos(ang) * 0.6, 0.07, 0.025, tinta); // the hand
  m.disco(0, cy, 0.07, 0.03, tinta, 12);
  if (f.estado === "starting") { m.disco(0, cy, 0.3, 0.015, B, 20); m.barra(0, cy, Math.sin(ang) * 0.6, cy + Math.cos(ang) * 0.6, 0.07, 0.025, B); m.disco(0, cy, 0.07, 0.03, B, 12); }
  if (f.estado === "fail") { m.barra(-0.55, cy - 0.55, 0.55, cy + 0.55, 0.09, 0.03, B); m.barra(-0.55, cy + 0.55, 0.55, cy - 0.55, 0.09, 0.03, B); }
}

/** The cube (a session): 2.2 m, black faces so it hides what is behind, 12 white edges; on = the top face white. */
function cubo(m: Malla, f: FormaPlana): void {
  const s = 1.1, e = 0.05, c = (x: number, y: number, z: number) => [x * s, y * s + s, z * s];
  const caras: number[][][] = [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]];
  caras.forEach((q, i) => m.quad(c(...(q[0] as [number, number, number])), c(...(q[1] as [number, number, number])), c(...(q[2] as [number, number, number])), c(...(q[3] as [number, number, number])), i === 4 && f.estado === "on" ? B : N));
  // the edges: 4 vertical, 4 along x and 4 along z, each a thin white box (two crossed quads would show from one side only: use 4 faces of a small box)
  const caja = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const P = (x: number, y: number, z: number) => [x, y, z];
    m.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), B); m.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), B);
    m.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), B); m.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), B);
    m.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), B); m.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), B);
  };
  const L = s + e / 2, t = e / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caja(sx * L - t, 0, sz * L - t, sx * L + t, 2 * s, sz * L + t); // verticals
  for (const sy of [0, 2 * s]) for (const sz of [-1, 1]) { caja(-L, sy - t, sz * L - t, L, sy + t, sz * L + t); caja(sz * L - t, sy - t, -L, sz * L + t, sy + t, L); }
  if (f.estado === "starting") { // a white square on the front face
    m.rect(-0.35, s - 0.35, 0.35, s + 0.35, s + 0.02, B);
  }
}

/** Lamp spacing along the slab: 0.62 m, squeezed so that up to 8 lamps stay inside the slab's width (half-width `W`). */
const pasoLuces = (n: number, W: number): number => (n > 1 ? Math.min(0.62, (2 * W - 0.8) / (n - 1)) : 0.62);

/** The slab (panel de interruptores): 3.2 × 1.7 m standing on two feet, black with a white edge; a lamp per switch along its front. */
function losa(m: Malla, f: FormaPlana): void {
  const W = 1.6, H = 1.7, y0 = 0.5, y1 = y0 + H, e = 0.07;
  m.rect(-0.45, 0, -0.35, y0, 0, B); m.rect(0.35, 0, 0.45, y0, 0, B); // feet
  m.rect(-W, y0, W, y1, 0, N); m.marco(-W, y0, W, y1, e, 0.01, B);
  m.rect(-W, y0, W, y1, -0.01, N);
  const luces = f.luces ?? [], paso = pasoLuces(f.luces?.length ?? 0, W), x0 = -((luces.length - 1) * paso) / 2, ly = y0 + H * 0.5;
  luces.forEach((on, i) => {
    const cx = x0 + i * paso, h = Math.min(0.22, paso * 0.42);
    m.rect(cx - h, ly - h, cx + h, ly + h, 0.01, on ? B : N);
    m.marco(cx - h, ly - h, cx + h, ly + h, 0.045, 0.02, B);
  });
}

/** The floor of a zone: the white edge as a flat strip on the ground (dashed: 1 m on, 1 m off). */
function suelo(m: Malla, f: FormaPlana): void {
  const w = (f.ancho ?? 10) / 2, d = (f.fondo ?? 10) / 2, e = 0.2, y = 0.05;
  const tira = (x0: number, z0: number, x1: number, z1: number) => { // along the longer axis, the strip lies flat (y up)
    const l = Math.hypot(x1 - x0, z1 - z0), paso = f.discontinuo ? 1 : l;
    for (let t = 0; t < l - 1e-6; t += paso * (f.discontinuo ? 2 : 1)) {
      const a = t / l, b = Math.min(l, t + paso) / l, ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      const nx = z1 === z0 ? 0 : e / 2, nz = z1 === z0 ? e / 2 : 0;
      m.quad([ax - nx, y, az - nz], [ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], B);
    }
  };
  tira(-w, -d, w, -d); tira(w, d, -w, d); tira(-w, d, -w, -d); tira(w, -d, w, d);
  // corners stay solid so a dashed zone still reads as a rectangle
  for (const [cx, cz] of [[-w, -d], [w, -d], [w, d], [-w, d]]) m.quad([cx - 0.25, y, cz - 0.25], [cx + 0.25, y, cz - 0.25], [cx + 0.25, y, cz + 0.25], [cx - 0.25, y, cz + 0.25], B);
}

/** A hollow rectangle drawn as dashes (0.12 m on, 0.12 m off) — the «off» look; the four corners stay solid so it still reads as a rectangle. */
export function marcoRaya(m: Malla, x0: number, y0: number, x1: number, y1: number, w: number, z: number): void {
  const raya = (ax: number, ay: number, bx: number, by: number) => {
    const l = Math.hypot(bx - ax, by - ay), paso = 0.12;
    for (let t = 0; t < l - 1e-6; t += paso * 2) { const a = t / l, b = Math.min(l, t + paso) / l; m.barra(ax + (bx - ax) * a, ay + (by - ay) * a, ax + (bx - ax) * b, ay + (by - ay) * b, w, z, B); }
  };
  raya(x0, y0, x1, y0); raya(x1, y0, x1, y1); raya(x1, y1, x0, y1); raya(x0, y1, x0, y0);
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) m.rect(cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2, z, B);
}
/** The three looks of one flat part: white fill (working), white outline on black (idle), dashed outline on black (off). */
type Aspecto = "lleno" | "borde" | "raya";
export function parte(m: Malla, a: Aspecto, x0: number, y0: number, x1: number, y1: number, z: number): void {
  if (a === "lleno") { m.rect(x0, y0, x1, y1, z, B); return; }
  m.rect(x0, y0, x1, y1, z, N);
  if (a === "borde") m.marco(x0, y0, x1, y1, 0.05, z + 0.005, B); else marcoRaya(m, x0, y0, x1, y1, 0.05, z + 0.005);
}

/** The profile (an agent): a standing figure 1.9 m tall — head, shoulders and torso, two arms, two legs — and a lamp over the head.
 *  on = white fill (working) · off = outline (idle) · off + `discontinuo` = dashed outline and dashed lamp (switched off) · fail = crossed out. Any other state is «idle». */
function perfil(m: Malla, f: FormaPlana): void {
  const a: Aspecto = f.estado === "on" ? "lleno" : f.discontinuo ? "raya" : "borde";
  parte(m, a, -0.2, 0, -0.04, 0.8, 0); parte(m, a, 0.04, 0, 0.2, 0.8, 0); // legs
  parte(m, a, -0.3, 0.8, 0.3, 1.45, 0); // torso
  parte(m, a, -0.46, 0.85, -0.34, 1.4, 0); parte(m, a, 0.34, 0.85, 0.46, 1.4, 0); // arms
  // the head: a disc (a ring when not working; a ring of dashes when off)
  if (a === "lleno") m.disco(0, 1.68, 0.22, 0, B);
  else { m.disco(0, 1.68, 0.22, 0, N); if (a === "borde") m.anillo(0, 1.68, 0.17, 0.22, 0.005, B); else for (let i = 0; i < 16; i += 2) m.tri([0, 1.68, 0.005], [Math.cos((i / 16) * Math.PI * 2) * 0.22, 1.68 + Math.sin((i / 16) * Math.PI * 2) * 0.22, 0.005], [Math.cos(((i + 1) / 16) * Math.PI * 2) * 0.22, 1.68 + Math.sin(((i + 1) / 16) * Math.PI * 2) * 0.22, 0.005], B); }
  // the status lamp, 0.35 m over the head: filled when working, a ring when idle, a dotted ring when off
  const ly = 2.2;
  if (a === "lleno") m.disco(0, ly, 0.12, 0, B, 20);
  else if (a === "borde") m.anillo(0, ly, 0.08, 0.12, 0, B, 20);
  else for (let i = 0; i < 12; i += 2) { const t0 = (i / 12) * Math.PI * 2, t1 = ((i + 1) / 12) * Math.PI * 2; m.quad([Math.cos(t0) * 0.08, ly + Math.sin(t0) * 0.08, 0], [Math.cos(t0) * 0.12, ly + Math.sin(t0) * 0.12, 0], [Math.cos(t1) * 0.12, ly + Math.sin(t1) * 0.12, 0], [Math.cos(t1) * 0.08, ly + Math.sin(t1) * 0.08, 0], B); }
  if (f.estado === "fail") { m.barra(-0.5, 0.1, 0.5, 1.9, 0.08, 0.03, B); m.barra(-0.5, 1.9, 0.5, 0.1, 0.08, 0.03, B); }
}

/** The spend meter: a tall flat column 0.9 × 2.6 m of ten stacked segments (0.22 m + 0.04 gap), a white base. Segment i (from the bottom) is filled when i < round(nivel × 10);
 *  the rest are outlines. The label (tokens) is a tag put by the page, not geometry. A `nivel` that is not a number is an empty meter; outside 0..1 it is clamped. */
export const SEGMENTOS_USO = 10;
export function segmentosLlenos(nivel: unknown): number { const n = typeof nivel === "number" && Number.isFinite(nivel) ? Math.min(1, Math.max(0, nivel)) : 0; return Math.round(n * SEGMENTOS_USO); }
function uso(m: Malla, f: FormaPlana): void {
  const llenos = segmentosLlenos(f.nivel), W = 0.45, h = 0.22, gap = 0.04, y0 = 0.15;
  m.rect(-0.6, 0, 0.6, 0.1, 0, B); // the base
  for (let i = 0; i < SEGMENTOS_USO; i++) parte(m, i < llenos ? "lleno" : "borde", -W, y0 + i * (h + gap), W, y0 + i * (h + gap) + h, 0);
  if (f.estado === "fail") { m.barra(-0.6, 0.1, 0.6, 2.7, 0.08, 0.03, B); m.barra(-0.6, 2.7, 0.6, 0.1, 0.08, 0.03, B); }
}

const HACER = { reloj, cubo, losa, suelo, perfil, uso } as const;

export function crearFormas(h: { world: THREE.Object3D }) {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); // the offset: a floor edge 3 cm over the ground must win against it from far away
  const vivas = new Map<string, { malla: THREE.Mesh; firma: string }>();
  const extra: Record<string, (m: Malla, f: FormaPlana) => void> = {}; // the shapes of formas-extra.ts, once that chunk has arrived
  let restantes = 0;
  const quitar = (key: string) => { const v = vivas.get(key); if (!v) return; h.world.remove(v.malla); v.malla.geometry.dispose(); vivas.delete(key); restantes = 45; };
  return {
    /** Put, change or (with null) take away the shape of `key`. The same description = nothing is rebuilt. */
    poner(key: string, f: FormaPlana | null): void {
      if (!f) { quitar(key); return; }
      const firma = JSON.stringify(f), antes = vivas.get(key);
      if (antes && antes.firma === firma) return;
      quitar(key);
      const m = new Malla(); ((HACER as Record<string, (m: Malla, f: FormaPlana) => void>)[f.forma] ?? extra[f.forma] ?? cubo)(m, f); // an unknown shape name is drawn as the safe default, the cube
      const malla = new THREE.Mesh(m.geometria(), material);
      malla.name = `forma:${key}`; malla.userData.sinSombra = true; malla.userData.pulsable = f.forma !== "suelo" && f.forma !== "guia" && key.includes(":"); // a click on it (not on a zone's floor) opens its card malla.frustumCulled = true;
      malla.position.set(f.x, 0, f.z); malla.rotation.y = f.rumbo ?? 0;
      malla.geometry.computeBoundingSphere();
      h.world.add(malla); vivas.set(key, { malla, firma }); restantes = 45;
    },
    /** Teach the shapes of the extra chunk (it arrives after the first ones were asked for). */
    registrar(mas: Record<string, (m: Malla, f: FormaPlana) => void>): void { Object.assign(extra, mas); },
    /** Move a shape that is already there without rebuilding it (the guide walks): position and the way it faces. */
    mover(key: string, x: number, z: number, rumbo: number): void { const v = vivas.get(key); if (!v) return; v.malla.position.set(x, 0, z); v.malla.rotation.y = rumbo; restantes = 3; },
    /** Counts down the frames still to draw after a change (a still page draws only when something moved). */
    actualizar(): void { if (restantes > 0) restantes--; },
    ocupado: (): boolean => restantes > 0,
    cuantas: (): number => vivas.size,
    claves: (): string[] => [...vivas.keys()],
    dispose(): void { for (const k of [...vivas.keys()]) quitar(k); material.dispose(); },
  };
}
