// dados-3d — the dice of a roll drawn falling into a tower's tray (lote 8 mesa, t_95245cf0; story 1: d6 and d20, story 2: d4, d8,
// d10, d12 and d100 — two d10, tens and units).
// Procedural geometry built from the SAME tables the fall uses (dados-caida.ts: D6_NORMALES, D20_CARAS/D20_VALOR; dados-formas.ts for the rest), so the
// numeral on the face that ends up must read the server's value — `contar()` reads the meshes' real orientation back to check
// it. Per die: a body and a plane of numerals (2 draw calls); a roll of 10 is 20. One roll per tower stays lying on the tray
// until the next one (a roll heard while you are near; nothing is made until the first one).
// The page decides nothing: it is told a roll the server already numbered and drew (features/dados). Not in VR and not on
// phones (story 2): `vistaDados` (dados-vista.ts) does not even load this file there.
import * as THREE from "three/webgpu";
import { APOTEMA, D20_CARAS, D20_NORMALES, D20_VALOR, D20_VERTICES, D6_NORMALES, caraArriba, planTirada, poseEn, qDeAHacia, rotuloDe } from "./dados-caida.ts";
import type { Bandeja, Modelo, Plan, Rol } from "./dados-caida.ts";
import { FORMAS } from "./dados-formas.ts";
import type { Forma } from "./dados-formas.ts";

export type Tirada3D = { n: number; sitio: string; caras: number; valores: readonly number[]; bandeja: Bandeja };
export type Ayudas3D = { world: THREE.Object3D };
export type Visto = { sitio: string; n: number; caras: number; dados: { valor: number; arriba: number | null; quieto: boolean; x: number; y: number; z: number; modelo: number; rol?: Rol }[] };

const CELDA = 64, COLS = 6, FILAS = 5;
/** Every text a face can carry: 1..20 (a d10 writes «10»; the tens die writes «10» and «20» too), then the rest of the tens die's and the units die's. */
const ETIQUETAS = [...Array.from({ length: 20 }, (_, i) => String(i + 1)), "0", "00", "30", "40", "50", "60", "70", "80", "90"];
const celdaDe = (etiqueta: string): number => { const i = ETIQUETAS.indexOf(etiqueta); return i < 0 ? 0 : i; };
/** An atlas of the numerals above (6 × 5 cells), transparent around them. */
function atlas(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = CELDA * COLS; c.height = CELDA * FILAS;
  const g = c.getContext("2d")!; g.fillStyle = color; g.font = `bold ${CELDA * 0.62}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  ETIQUETAS.forEach((e, i) => { const x = (i % COLS) * CELDA + CELDA / 2, y = Math.floor(i / COLS) * CELDA + CELDA / 2 + 2; g.fillText(e, x, y, CELDA * 0.9); if (e === "6" || e === "9") g.fillRect(x - CELDA * 0.14, y + CELDA * 0.26, CELDA * 0.28, 3); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** Numeral quads for faces (unit die): centre, outward normal, side of the quad, the text written there; `arriba` = where the top of the text points (omitted: any). */
function numerales(caras: { c: THREE.Vector3; n: THREE.Vector3; lado: number; etiqueta: string; arriba?: THREE.Vector3 }[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const f of caras) {
    const q = new THREE.Quaternion(...qDeAHacia([0, 0, 1], [f.n.x, f.n.y, f.n.z]));
    const ey = f.arriba ? f.arriba.clone().normalize() : new THREE.Vector3(0, 1, 0).applyQuaternion(q), ex = new THREE.Vector3().crossVectors(ey, f.n); // x = y × n: right-handed, read from outside
    const celda = celdaDe(f.etiqueta), i0 = pos.length / 3, u0 = (celda % COLS) / COLS, v0 = 1 - (Math.floor(celda / COLS) + 1) / FILAS;
    for (const [dx, dy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]] as const) {
      const p = ex.clone().multiplyScalar(dx * f.lado / 2).addScaledVector(ey, dy * f.lado / 2).add(f.c).addScaledVector(f.n, 0.004);
      pos.push(p.x, p.y, p.z); uv.push(u0 + u / COLS, v0 + v / FILAS);
    }
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
/** The icosahedron of edge 1 (flat-shaded: one normal per triangle). */
function cuerpoD20(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  D20_CARAS.forEach((t, i) => { for (const k of t) { const v = D20_VERTICES[k]; pos.push(v[0] / 2, v[1] / 2, v[2] / 2); nor.push(...D20_NORMALES[i]); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  // the triangles' own winding is arbitrary: turn every one so it faces away from the centre
  const p = g.getAttribute("position");
  for (let i = 0; i < 20; i++) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i * 3), b = new THREE.Vector3().fromBufferAttribute(p, i * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(p, i * 3 + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(new THREE.Vector3(...D20_NORMALES[i])) < 0) { p.setXYZ(i * 3 + 1, c.x, c.y, c.z); p.setXYZ(i * 3 + 2, b.x, b.y, b.z); }
  }
  return g;
}

/** The flat-shaded body of d4/d8/d10/d12: every face a fan of triangles turned to face away from the centre. */
function cuerpoForma(f: Forma): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  f.poligonos.forEach((poly, p) => {
    for (let i = 1; i < poly.length - 1; i++) {
      const tri = [f.vertices[poly[0]], f.vertices[poly[i]], f.vertices[poly[i + 1]]].map((v) => new THREE.Vector3(...v));
      const n = new THREE.Vector3().subVectors(tri[1], tri[0]).cross(new THREE.Vector3().subVectors(tri[2], tri[0]));
      if (n.dot(new THREE.Vector3(...f.normales[p])) < 0) tri.reverse();                  // the winding is ours to choose
      for (const v of tri) { pos.push(v.x, v.y, v.z); nor.push(...f.normales[p]); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
/** Body and numeral colours per die: each kind its own, so a handful of mixed dice read at a glance; the d100's two are told apart too. */
const COLORES: Record<string, [number, string]> = {
  "4": [0xb03a2e, "#fbe9d0"], "8": [0x2e7d4f, "#f3f0d0"], "10": [0x6a3d9a, "#f4e3a0"], "12": [0xc4721a, "#fff4dc"],
  "10decenas": [0x1d6f73, "#f7f2dc"], "10unidades": [0xe7e0cf, "#2a2118"],
};

type Molde = { cuerpo: THREE.BufferGeometry; cifras: THREE.BufferGeometry; mat: THREE.Material; matCifras: THREE.Material };
type Dado = { malla: THREE.Group; plan: Plan };
type Lanzada = { sitio: string; n: number; caras: number; t: number; dados: Dado[]; grupo: THREE.Group };

export function crearDados3D(h: Ayudas3D) {
  const moldes = new Map<number, Molde>();
  const molde = (caras: Modelo, rol?: Rol): Molde => {
    const clave = caras * 10 + (rol === "decenas" ? 1 : rol === "unidades" ? 2 : 0);
    let m = moldes.get(clave); if (m) return m;
    if (caras === 4 || caras === 8 || caras === 10 || caras === 12) {
      const f = FORMAS[caras], [cuerpo, tinta] = COLORES[`${caras}${rol ?? ""}`] ?? COLORES[String(caras)];
      m = {
        cuerpo: cuerpoForma(f),
        cifras: numerales(f.cifras.map((c) => ({ c: new THREE.Vector3(...c.centro), n: new THREE.Vector3(...f.normales[c.poligono]), lado: c.lado, etiqueta: caras === 4 ? String(c.valor) : rotuloDe(rol, c.valor), arriba: new THREE.Vector3(...c.arriba) }))),
        mat: new THREE.MeshStandardMaterial({ color: cuerpo, roughness: 0.3, flatShading: true }), matCifras: new THREE.MeshBasicMaterial({ map: atlas(tinta), transparent: true, alphaTest: 0.35 }),
      };
    } else if (caras === 6) {
      m = {
        cuerpo: new THREE.BoxGeometry(1, 1, 1),
        cifras: numerales(D6_NORMALES.map((n, i) => ({ c: new THREE.Vector3(...n).multiplyScalar(0.5), n: new THREE.Vector3(...n), lado: 0.5, etiqueta: String(i + 1) }))),
        mat: new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.35 }), matCifras: new THREE.MeshBasicMaterial({ map: atlas("#2a2118"), transparent: true, alphaTest: 0.35 }),
      };
    } else {
      // the inscribed radius of a unit-edge icosahedron: where the face planes are
      const r = APOTEMA[20];
      m = {
        cuerpo: cuerpoD20(),
        cifras: numerales(D20_NORMALES.map((n, i) => ({ c: new THREE.Vector3(...n).multiplyScalar(r), n: new THREE.Vector3(...n), lado: 0.5, etiqueta: String(D20_VALOR[i]) }))),
        mat: new THREE.MeshStandardMaterial({ color: 0x3a4a8c, roughness: 0.3, flatShading: true }), matCifras: new THREE.MeshBasicMaterial({ map: atlas("#f4e3a0"), transparent: true, alphaTest: 0.35 }),
      };
    }
    moldes.set(clave, m); return m;
  };
  const activas = new Map<string, Lanzada>(); // one roll per tower: the next one replaces it

  function quitar(sitio: string): void {
    const a = activas.get(sitio); if (!a) return;
    a.grupo.removeFromParent(); activas.delete(sitio); // geometry and materials are shared moulds: nothing to dispose per roll
  }
  function tirar(t: Tirada3D): number {
    quitar(t.sitio);
    const planes = planTirada(t);
    if (!planes.length) return 0;
    const grupo = new THREE.Group(); grupo.name = `dados-${t.sitio}`;
    const dados: Dado[] = planes.map((plan) => {
      const m = molde(plan.caras, plan.rol), malla = new THREE.Group();
      malla.add(new THREE.Mesh(m.cuerpo, m.mat), new THREE.Mesh(m.cifras, m.matCifras));
      malla.scale.setScalar(plan.escala);
      grupo.add(malla); return { malla, plan };
    });
    h.world.add(grupo);
    const a: Lanzada = { sitio: t.sitio, n: t.n, caras: t.caras, t: 0, dados, grupo };
    activas.set(t.sitio, a); poner(a);
    return dados.length;
  }
  function poner(a: Lanzada): void {
    for (const d of a.dados) { const p = poseEn(d.plan, a.t); d.malla.position.set(p.x, p.y, p.z); d.malla.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]); }
  }
  const sigue = (a: Lanzada) => a.dados.some((d) => a.t < d.plan.duracion);
  return {
    tirar,
    quitar,
    /** Once per drawn frame (not in VR, not on a phone: the caller does not call it there). */
    actualizar(dt: number): void { for (const a of activas.values()) if (sigue(a)) { a.t += dt; poner(a); } },
    /** True while any die is still moving (the page keeps drawing). */
    ocupado(): boolean { for (const a of activas.values()) if (sigue(a)) return true; return false; },
    /** What is drawn right now, read back from the meshes (the leg checks the face up from the real orientation, not from the plan). */
    contar(): Visto[] {
      return [...activas.values()].map((a) => ({
        sitio: a.sitio, n: a.n, caras: a.caras,
        dados: a.dados.map((d) => { const q = d.malla.quaternion; return { valor: d.plan.valor, modelo: d.plan.caras, ...(d.plan.rol ? { rol: d.plan.rol } : {}), arriba: caraArriba(d.plan.caras, [q.x, q.y, q.z, q.w]), quieto: a.t >= d.plan.duracion, x: d.malla.position.x, y: d.malla.position.y, z: d.malla.position.z }; }),
      }));
    },
  };
}
