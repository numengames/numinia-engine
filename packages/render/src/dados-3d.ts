// dados-3d — the dice of a roll drawn falling into a tower's tray (lote 8 mesa, t_95245cf0, story 1: d6 and d20, PC).
// Procedural geometry built from the SAME tables the fall uses (dados-caida.ts: D6_NORMALES, D20_CARAS/D20_VALOR), so the
// numeral on the face that ends up must read the server's value — `contar()` reads the meshes' real orientation back to check
// it. Per die: a body and a plane of numerals (2 draw calls); a roll of 10 is 20. One roll per tower stays lying on the tray
// until the next one (a roll heard while you are near; nothing is made until the first one).
// The page decides nothing: it is told a roll the server already numbered and drew (features/dados). Not in VR and not on
// phones (story 2): `vistaDados` (dados-vista.ts) does not even load this file there.
import * as THREE from "three/webgpu";
import { APOTEMA, D20_CARAS, D20_NORMALES, D20_VALOR, D20_VERTICES, D6_NORMALES, caraArriba, planTirada, poseEn, qDeAHacia } from "./dados-caida.ts";
import type { Bandeja, Plan } from "./dados-caida.ts";

export type Tirada3D = { n: number; sitio: string; caras: number; valores: readonly number[]; bandeja: Bandeja };
export type Ayudas3D = { world: THREE.Object3D };
export type Visto = { sitio: string; n: number; caras: number; dados: { valor: number; arriba: number | null; quieto: boolean; x: number; y: number; z: number }[] };

const CELDA = 64;
/** An atlas of the numerals 1..20 (5 × 4 cells), transparent around them. */
function atlas(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = CELDA * 5; c.height = CELDA * 4;
  const g = c.getContext("2d")!; g.fillStyle = color; g.font = `bold ${CELDA * 0.62}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  for (let v = 1; v <= 20; v++) { const i = v - 1, x = (i % 5) * CELDA + CELDA / 2, y = Math.floor(i / 5) * CELDA + CELDA / 2 + 2; g.fillText(String(v), x, y); if (v === 6 || v === 9) g.fillRect(x - CELDA * 0.14, y + CELDA * 0.26, CELDA * 0.28, 3); } // 6 and 9 underlined
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** Numeral quads for faces (unit-edge die): centre, outward normal, side of the quad, the value written there. */
function numerales(caras: { c: THREE.Vector3; n: THREE.Vector3; lado: number; valor: number }[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const f of caras) {
    const q = new THREE.Quaternion(...qDeAHacia([0, 0, 1], [f.n.x, f.n.y, f.n.z]));
    const i0 = pos.length / 3, u0 = ((f.valor - 1) % 5) / 5, v0 = 1 - (Math.floor((f.valor - 1) / 5) + 1) / 4;
    for (const [dx, dy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]] as const) {
      const p = new THREE.Vector3(dx * f.lado / 2, dy * f.lado / 2, 0).applyQuaternion(q).add(f.c).addScaledVector(f.n, 0.004);
      pos.push(p.x, p.y, p.z); uv.push(u0 + u / 5, v0 + v / 4);
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

type Molde = { cuerpo: THREE.BufferGeometry; cifras: THREE.BufferGeometry; mat: THREE.Material; matCifras: THREE.Material };
type Dado = { malla: THREE.Group; plan: Plan };
type Lanzada = { sitio: string; n: number; caras: number; t: number; dados: Dado[]; grupo: THREE.Group };

export function crearDados3D(h: Ayudas3D) {
  const moldes = new Map<number, Molde>();
  const molde = (caras: 6 | 20): Molde => {
    let m = moldes.get(caras); if (m) return m;
    if (caras === 6) {
      m = {
        cuerpo: new THREE.BoxGeometry(1, 1, 1),
        cifras: numerales(D6_NORMALES.map((n, i) => ({ c: new THREE.Vector3(...n).multiplyScalar(0.5), n: new THREE.Vector3(...n), lado: 0.5, valor: i + 1 }))),
        mat: new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.35 }), matCifras: new THREE.MeshBasicMaterial({ map: atlas("#2a2118"), transparent: true, alphaTest: 0.35 }),
      };
    } else {
      // the inscribed radius of a unit-edge icosahedron: where the face planes are
      const r = APOTEMA[20];
      m = {
        cuerpo: cuerpoD20(),
        cifras: numerales(D20_NORMALES.map((n, i) => ({ c: new THREE.Vector3(...n).multiplyScalar(r), n: new THREE.Vector3(...n), lado: 0.5, valor: D20_VALOR[i] }))),
        mat: new THREE.MeshStandardMaterial({ color: 0x3a4a8c, roughness: 0.3, flatShading: true }), matCifras: new THREE.MeshBasicMaterial({ map: atlas("#f4e3a0"), transparent: true, alphaTest: 0.35 }),
      };
    }
    moldes.set(caras, m); return m;
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
      const m = molde(plan.caras), malla = new THREE.Group();
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
        dados: a.dados.map((d) => { const q = d.malla.quaternion; return { valor: d.plan.valor, arriba: caraArriba(d.plan.caras, [q.x, q.y, q.z, q.w]), quieto: a.t >= d.plan.duracion, x: d.malla.position.x, y: d.malla.position.y, z: d.malla.position.z }; }),
      }));
    },
  };
}
