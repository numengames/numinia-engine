// formas-planas (mundo-hermes, v0): the flat black-and-white shapes of things that live OUTSIDE the world (the espejo), made by code — no .glb, no
// texture, no gradient, no light. Pure black and pure white only; a white edge on black is the whole look. ONE mesh per shape (vertex colours on one shared
// unlit material: 1 draw call per thing), nothing per frame. The page's start bundle holds only formas-vista.ts; this file is fetched with the first shape.
// The states language is the house one (off / starting / on): OFF = white OUTLINE on black, ON = white FILL, STARTING = outline with a small white core,
// FAIL = outline crossed out. A shape never moves or animates; a change is one rebuild.
//   reloj  an upright clock face on a post (a scheduled task): outline + a hand, filled when on
//   cubo   a cube (a session: a new place): black faces, white edges, the top face white when on
//   losa   a slab standing up (the switch panel): black, white edge, a row of lamps (filled = on)
//   suelo  the floor of a zone: only its white edge on the world's black ground (dashed when the zone's function is off)
import * as THREE from "three/webgpu";

export type EstadoForma = "off" | "starting" | "on" | "fail";
export type FormaPlana = {
  forma: "reloj" | "cubo" | "losa" | "suelo";
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
};

const B = 1, N = 0; // white, black
/** Accumulates triangles with a flat colour each into one geometry. Local space: x right, y up, z towards the viewer. */
class Malla {
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

/** The slab (panel de interruptores): 3.2 × 1.7 m standing on two feet, black with a white edge; a lamp per switch along its front. */
function losa(m: Malla, f: FormaPlana): void {
  const W = 1.6, H = 1.7, y0 = 0.5, y1 = y0 + H, e = 0.07;
  m.rect(-0.45, 0, -0.35, y0, 0, B); m.rect(0.35, 0, 0.45, y0, 0, B); // feet
  m.rect(-W, y0, W, y1, 0, N); m.marco(-W, y0, W, y1, e, 0.01, B);
  m.rect(-W, y0, W, y1, -0.01, N);
  const luces = f.luces ?? [], paso = 0.62, x0 = -((luces.length - 1) * paso) / 2, ly = y0 + H * 0.5;
  luces.forEach((on, i) => {
    const cx = x0 + i * paso, h = 0.22;
    m.rect(cx - h, ly - h, cx + h, ly + h, 0.01, on ? B : N);
    m.marco(cx - h, ly - h, cx + h, ly + h, 0.045, 0.02, B);
  });
}

/** The floor of a zone: the white edge as a flat strip on the ground (dashed: 1 m on, 1 m off). */
function suelo(m: Malla, f: FormaPlana): void {
  const w = (f.ancho ?? 10) / 2, d = (f.fondo ?? 10) / 2, e = 0.14, y = 0.03;
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

const HACER = { reloj, cubo, losa, suelo } as const;

export function crearFormas(h: { world: THREE.Object3D }) {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const vivas = new Map<string, { malla: THREE.Mesh; firma: string }>();
  let restantes = 0;
  const quitar = (key: string) => { const v = vivas.get(key); if (!v) return; h.world.remove(v.malla); v.malla.geometry.dispose(); vivas.delete(key); restantes = 45; };
  return {
    /** Put, change or (with null) take away the shape of `key`. The same description = nothing is rebuilt. */
    poner(key: string, f: FormaPlana | null): void {
      if (!f) { quitar(key); return; }
      const firma = JSON.stringify(f), antes = vivas.get(key);
      if (antes && antes.firma === firma) return;
      quitar(key);
      const m = new Malla(); HACER[f.forma](m, f);
      const malla = new THREE.Mesh(m.geometria(), material);
      malla.name = `forma:${key}`; malla.userData.sinSombra = true; malla.frustumCulled = true;
      malla.position.set(f.x, 0, f.z); malla.rotation.y = f.rumbo ?? 0;
      malla.geometry.computeBoundingSphere();
      h.world.add(malla); vivas.set(key, { malla, firma }); restantes = 45;
    },
    /** Counts down the frames still to draw after a change (a still page draws only when something moved). */
    actualizar(): void { if (restantes > 0) restantes--; },
    ocupado: (): boolean => restantes > 0,
    cuantas: (): number => vivas.size,
    claves: (): string[] => [...vivas.keys()],
    dispose(): void { for (const k of [...vivas.keys()]) quitar(k); material.dispose(); },
  };
}
