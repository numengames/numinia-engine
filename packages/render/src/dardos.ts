// dardos (3D, v1): the dartboards of the world and the one on your real wall.
// · crearDianas3D: every board near you stands in the plaza — a backboard on a post, the painted board (diana.ts, one
//   canvas texture shared by all), the throwing line on the ground, and the darts stuck in it right now (anyone's).
//   The board is drawn ESCALA_PLAZA times its real size so you can read it from the third-person camera.
// · crearDianaAR: a JuegoAR (ar.ts) — look at a wall (or the floor, or nothing: then it stands in front of you), tap or
//   pull the trigger and a real-size board hangs there (anchored, 1.73 m centre when it stands on the floor). Then:
//   PRESS and HOLD (a tap held on a phone, the trigger on a headset): a power bar beside the board fills and empties;
//   RELEASE: the dart goes where your ray points (the tap's ray / the controller's) with the bar's strength. The page
//   sends that (x, y in board radii, fuerza) and the server's answer lands the dart on the board.
// Procedural, no .glb. Per board in the plaza: 4 draw calls + 1 per dart (merged dart geometry).
import * as THREE from "three/webgpu";
import { pintarDiana, PINTADA, RADIO_M, ALTURA_M, LINEA_M } from "./diana.ts";
import type { JuegoAR, RayoAR } from "./ar.ts";

export type Sitio3D = { id: string; x: number; y: number; z: number; rumbo: number; ocupado?: boolean };
export type Dardo3D = { quien: number; sitio: string; numero: number; x: number; y: number; cuando?: number };
/** The boards in the plaza are this many times their real size (a 0.45 m board is a speck from the camera). */
export const ESCALA_PLAZA = 2.4;
/** The ideal strength (features/dardos FUERZA_IDEAL): the power bar marks it. */
export const IDEAL = 0.65;
/** Half-width of the straight-throw window of the AR wall bar (features/dardos ZONA_FUERZA.ar; test/dardos-barra.test.ts checks they agree).
 *  The page passes the real table's number (`zona`); this is only the default. */
export const ZONA_AR = 0.06;
/** One full fill of the power bar (s); it then empties at the same pace and fills again. */
export const CICLO_S = 1.1;

/** Where a ray meets a board face's plane (z = 0, the face's own space), in board radii (x right, y up). Shared by
 * the plaza's miniature boards and the AR board on your wall (ar.ts had its own copy; motor-vr t_5f6ff048). Null if
 * the ray is parallel to the face or points away from it. Pure: `invCara` is the face's world matrix, inverted. */
export function rayoEnCara(invCara: THREE.Matrix4, origen: THREE.Vector3, dir: THREE.Vector3): { x: number; y: number } | null {
  const o0 = origen.clone().applyMatrix4(invCara);
  const d0 = dir.clone().transformDirection(invCara);
  if (Math.abs(d0.z) < 1e-4) return null;
  const t = -o0.z / d0.z;
  if (t <= 0) return null;
  const p = o0.addScaledVector(d0, t);
  const c = (v: number) => Math.max(-3, Math.min(3, v / RADIO_M));
  return { x: c(p.x), y: c(p.y) };
}

let texturaComun: THREE.CanvasTexture | null = null;
function texturaDiana(): THREE.CanvasTexture {
  if (texturaComun) return texturaComun;
  const c = document.createElement("canvas"); c.width = c.height = 512;
  pintarDiana(c.getContext("2d")!, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texturaComun = t);
}
/** A dart pointing along -z (tip at the origin), in metres of a REAL dart (15 cm): barrel, shaft and a cross of flights. */
function geometriaDardo(): THREE.BufferGeometry {
  const partes: THREE.BufferGeometry[] = [];
  const punta = new THREE.ConeGeometry(0.0025, 0.02, 6).rotateX(-Math.PI / 2).translate(0, 0, 0.01);
  const barril = new THREE.CylinderGeometry(0.0045, 0.0045, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.045);
  const cana = new THREE.CylinderGeometry(0.002, 0.002, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0, 0.095);
  const ala1 = new THREE.BoxGeometry(0.032, 0.0008, 0.035).translate(0, 0, 0.125);
  const ala2 = new THREE.BoxGeometry(0.0008, 0.032, 0.035).translate(0, 0, 0.125);
  const colores: [THREE.BufferGeometry, number][] = [[punta, 0xd8d8d8], [barril, 0x8a94a3], [cana, 0x30343a], [ala1, 0xe07a3f], [ala2, 0xe07a3f]];
  for (const [g, c] of colores) {
    const ni = g.index ? g.toNonIndexed() : g; const col = new THREE.Color(c); const n = ni.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    ni.setAttribute("color", new THREE.BufferAttribute(a, 3)); ni.deleteAttribute("uv"); partes.push(ni);
  }
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const g of partes) { pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array)); col.push(...(g.attributes.color.array as Float32Array)); }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return m;
}
let dardoGeo: THREE.BufferGeometry | null = null, dardoMat: THREE.MeshStandardMaterial | null = null;
export const dardoMalla = () => new THREE.Mesh((dardoGeo ??= geometriaDardo()), (dardoMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })));

/** A board face (real size) + its dark backboard; the face is the +z side, its centre at the origin. */
function cara(): THREE.Group {
  const g = new THREE.Group();
  const R = RADIO_M * PINTADA;
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(R * 2.5, R * 2.5, 0.025).translate(0, 0, -0.0125), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 }));
  const disco = new THREE.Mesh(new THREE.CircleGeometry(R, 64).translate(0, 0, 0.012), new THREE.MeshStandardMaterial({ map: texturaDiana(), roughness: 0.85 }));
  const canto = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.012, 64, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.006), new THREE.MeshStandardMaterial({ color: 0x1a1c20 }));
  g.add(tabla, disco, canto);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
export function crearDianas3D(h: { world: THREE.Object3D }) {
  type Una = { g: THREE.Group; face: THREE.Group; dardos: Map<string, THREE.Mesh>; s: Sitio3D };
  const dianas = new Map<string, Una>();
  const S = ESCALA_PLAZA;
  const poste = new THREE.CylinderGeometry(0.07, 0.09, 1, 8).translate(0, 0.5, 0);
  const posteMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const lineaMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0x3a2a00 });
  const crear = (s: Sitio3D): Una => {
    const g = new THREE.Group(); g.name = `dardos:${s.id}`;
    const face = cara(); face.scale.setScalar(S); face.position.set(0, ALTURA_M * 1.15, 0.12); g.add(face);
    const p = new THREE.Mesh(poste, posteMat); p.scale.set(1, ALTURA_M * 1.15 + RADIO_M * PINTADA * S, 1); g.add(p);
    const linea = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.08).translate(0, 0.01, 0), lineaMat); linea.position.set(0, 0, LINEA_M * 1.1); g.add(linea);
    h.world.add(g);
    return { g, face, dardos: new Map(), s };
  };
  const ganchos = new Set<(dt: number) => void>();
  return {
    /** AR-D4 handles (dardos-duelo-plaza-3d.ts): a board's group and face, one stuck dart's mesh, and a per-frame hook. */
    grupo: (id: string) => { const d = dianas.get(id); return d ? { g: d.g, face: d.face } : null; },
    malla: (id: string, quien: number, numero: number): THREE.Object3D | null => dianas.get(id)?.dardos.get(`${quien}:${numero}`) ?? null,
    alFotograma(fn: (dt: number) => void): () => void { ganchos.add(fn); return () => ganchos.delete(fn); },
    actualizar(dt: number): void { for (const fn of ganchos) fn(dt); },
    sitios(lista: Sitio3D[]): void {
      const vivos = new Set(lista.map((s) => s.id));
      for (const [id, d] of dianas) if (!vivos.has(id)) { h.world.remove(d.g); dianas.delete(id); }
      for (const s of lista) {
        const d = dianas.get(s.id) ?? crear(s); dianas.set(s.id, d); d.s = s;
        d.g.position.set(s.x, s.y, s.z); d.g.rotation.y = (s.rumbo * Math.PI) / 180;
      }
    },
    clavados(lista: Dardo3D[]): void {
      const vistos = new Map<string, Set<string>>();
      for (const x of lista) {
        const d = dianas.get(x.sitio); if (!d) continue;
        const k = `${x.quien}:${x.numero}`;
        (vistos.get(x.sitio) ?? vistos.set(x.sitio, new Set()).get(x.sitio)!).add(k);
        let m = d.dardos.get(k);
        if (!m) { m = dardoMalla(); d.face.add(m); d.dardos.set(k, m); }
        const fuera = Math.hypot(x.x, x.y) > PINTADA * 1.2; // way off: it falls under the board
        m.position.set(x.x * RADIO_M, fuera ? -RADIO_M * PINTADA * 1.3 : x.y * RADIO_M, 0.012);
        m.rotation.set(fuera ? Math.PI / 2.4 : 0.08 * ((x.numero % 3) - 1), 0.1 * ((x.numero % 2) - 0.5), 0);
      }
      for (const [id, d] of dianas) { const v = vistos.get(id); for (const [k, m] of d.dardos) if (!v?.has(k)) { d.face.remove(m); d.dardos.delete(k); } }
    },
    /** Where a board's throwing line is and which way to face it (radians, the avatar's rumbo), or null. */
    linea(id: string): { x: number; z: number; rumbo: number } | null {
      const d = dianas.get(id); if (!d) return null;
      const a = (d.s.rumbo * Math.PI) / 180, L = LINEA_M * 1.1;
      return { x: d.s.x + Math.sin(a) * L, z: d.s.z + Math.cos(a) * L, rumbo: a + Math.PI };
    },
    /** VR (J10, motor-vr t_5f6ff048): where a hand's ray meets this board's face (board radii), or null (no board,
     * or the ray does not reach the face). `dardos-vr.ts` throws along whichever controller's ray sent this; plain
     * numbers in, not a THREE.Vector3 (a page never needs to import three for this). */
    apuntar(id: string, origen: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): { x: number; y: number } | null {
      const d = dianas.get(id); if (!d) return null;
      d.face.updateMatrixWorld();
      return rayoEnCara(new THREE.Matrix4().copy(d.face.matrixWorld).invert(), new THREE.Vector3(origen.x, origen.y, origen.z), new THREE.Vector3(dir.x, dir.y, dir.z));
    },
    /** VR throws (dardos-vr.ts, lazy: it does the maths): a board's group, its scaled face and its site. */
    una: (id: string) => dianas.get(id),
    contar: () => ({ dianas: dianas.size, dardos: [...dianas.values()].reduce((n, d) => n + d.dardos.size, 0) }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
export type FaseAR = "buscando" | "colocada";
export type DianaAR = JuegoAR & {
  /** The darts the server landed on this board (this player's turn and anyone's near: same list as the plaza). */
  clavados(lista: Dardo3D[]): void;
  /** Take the board off the wall and look for a place again. */
  recolocar(): void;
  estado(): { fase: FaseAR; pared: boolean | null; cargando: boolean; potencia: number; lanzados: number; clavados: number; ultimo: { x: number; y: number; fuerza: number } | null; zona: number };
};
/** The power bar: 0 → 1 in CICLO_S, then back to 0, and again (timing matters: IDEAL is marked). */
export const potenciaDe = (s: number): number => { const t = (s / CICLO_S) % 2; return t <= 1 ? t : 2 - t; };

export function crearDianaAR(o: { alLanzar: (x: number, y: number, fuerza: number) => void; alColocar?: (pared: boolean) => void; zona?: number }): DianaAR {
  const zona = o.zona ?? ZONA_AR;
  const root = new THREE.Group();
  const reticula = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, side: THREE.DoubleSide }));
  reticula.matrixAutoUpdate = false; reticula.visible = false; root.add(reticula);
  const diana = new THREE.Group(); diana.visible = false; root.add(diana);
  const face = cara(); diana.add(face);
  // the power bar, to the right of the board: a white frame, a dark track, the fill (scaled in y: teal under the window, red over
  // it), and the straight-throw WINDOW (±zona, the server's number): a flat gold band with a white border and two notches that
  // lights up while the bar is inside it. The fill is never gold, so the window is never hidden by another gold.
  const altoBarra = RADIO_M * PINTADA * 2;
  const barra = new THREE.Group(); barra.position.set(RADIO_M * PINTADA * 1.5, 0, 0.02); diana.add(barra);
  const plano = (w: number, h: number, color: number, z: number, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color })); m.position.set(0, y, z); barra.add(m); return m; };
  plano(0.092, altoBarra + 0.02, 0xffffff, 0);                       // white frame
  plano(0.08, altoBarra + 0.008, 0x0b0e12, 0.003);                   // dark track
  const relleno = new THREE.Mesh(new THREE.PlaneGeometry(0.05, altoBarra).translate(0, altoBarra / 2, 0), new THREE.MeshBasicMaterial({ color: 0x3fb6a8 }));
  relleno.position.set(0, -altoBarra / 2, 0.006); barra.add(relleno);
  const yIdeal = -altoBarra / 2 + altoBarra * IDEAL, altoZona = Math.max(0.012, 2 * zona * altoBarra);
  plano(0.092, altoZona + 0.01, 0xffffff, 0.009, yIdeal);            // the window's white border
  const banda = plano(0.084, altoZona, 0xffd27a, 0.012, yIdeal);     // the window
  for (const lado of [-1, 1]) { // two white notches on the sides, pointing at the window
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.014, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    if (lado > 0) m.rotation.z = Math.PI;
    m.position.set(lado * 0.064, yIdeal, 0.012); barra.add(m);
  }
  barra.visible = false;
  // where you aim right now (the gaze on a phone): a small dot on the face
  const punto = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12).translate(0, 0, 0.014), new THREE.MeshBasicMaterial({ color: 0xffffff })); punto.visible = false; face.add(punto);
  const vuelo = dardoMalla(); vuelo.visible = false; root.add(vuelo); // the dart on its way, until the server answers

  let fase: FaseAR = "buscando", pared: boolean | null = null, superficie: THREE.Matrix4 | null = null;
  let cargando = false, desde = 0, potencia = 0, lanzados = 0, ultimo: { x: number; y: number; fuerza: number } | null = null;
  let vueloDesde = 0; const vueloA = new THREE.Vector3(), vueloB = new THREE.Vector3();
  const clav = new Map<string, THREE.Mesh>();
  const M = new THREE.Matrix4(), V = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Quaternion();
  const ahora = () => performance.now() / 1000;

  function colocar(cam: THREE.Camera): void {
    const ojo = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const mira = new THREE.Vector3(); cam.getWorldDirection(mira);
    if (superficie) {
      V.setFromMatrixPosition(superficie);
      N.set(0, 1, 0).transformDirection(superficie);
      if (Math.abs(N.y) < 0.5) { // a wall: hang it there, facing out of the wall (toward you)
        N.y = 0; N.normalize(); if (N.dot(V.clone().sub(ojo)) > 0) N.negate();
        pared = true;
      } else { // the floor or a table: stand it up, centre at a real board's height (never above your eyes), facing you
        N.copy(ojo).sub(V); N.y = 0; if (N.lengthSq() < 1e-6) N.set(0, 0, 1); N.normalize();
        V.y = Math.min(V.y + ALTURA_M, ojo.y + 0.05); pared = false;
      }
    } else { // no surface (or no hit-test): in front of you at the throwing line, at your eyes
      N.copy(mira).negate(); N.y = 0; if (N.lengthSq() < 1e-6) N.set(0, 0, 1); N.normalize();
      V.copy(ojo).addScaledVector(N, -LINEA_M); V.y = ojo.y - 0.05; pared = false;
    }
    diana.position.copy(V); diana.rotation.set(0, Math.atan2(N.x, N.z), 0); // N is level: a turn about y, never upside down
    diana.visible = true; reticula.visible = false; fase = "colocada"; barra.visible = true;
    o.alColocar?.(pared);
  }
  /** Where a ray meets the board's face, in board radii (x right, y up), or null (parallel / behind you). */
  function enLaCara(r: RayoAR): { x: number; y: number } | null {
    diana.updateMatrixWorld();
    return rayoEnCara(M.copy(face.matrixWorld).invert(), r.origen, r.dir);
  }
  const rayoMirada = (cam: THREE.Camera): RayoAR => { const d = new THREE.Vector3(); cam.getWorldDirection(d); return { origen: new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), dir: d }; };

  return {
    root,
    superficie(hit, cam, sinHitTest) {
      superficie = sinHitTest ? null : hit;
      if (fase === "buscando") {
        if (hit) {
          // the ring lies on the surface: for a wall it stands up facing you
          reticula.matrix.copy(hit); reticula.visible = true;
        } else reticula.visible = false;
      } else {
        const p = enLaCara(rayoMirada(cam));
        punto.visible = !!p && Math.hypot(p.x, p.y) < PINTADA * 1.6;
        if (p) punto.position.set(p.x * RADIO_M, p.y * RADIO_M, 0);
      }
    },
    pulsar(_rayo, _cam) {
      if (fase !== "colocada") return; // placing happens on release (a tap = press + release)
      cargando = true; desde = ahora(); potencia = 0;
    },
    soltar(rayo, cam) {
      if (fase === "buscando") { colocar(cam); return; } // a surface, or none: then in front of you
      if (!cargando) return;
      potencia = potenciaDe(ahora() - desde); cargando = false; // from the clock, not the last frame
      const p = enLaCara(rayo ?? rayoMirada(cam));
      if (!p) return;
      const fuerza = Math.round(potencia * 1000) / 1000;
      ultimo = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, fuerza };
      lanzados++;
      // the dart flies from just under your hand toward where you aimed; the server's answer puts it where it lands
      vueloA.copy((rayo ?? rayoMirada(cam)).origen).add(V.set(0, -0.08, 0));
      vueloB.set(p.x * RADIO_M, p.y * RADIO_M, 0.012).applyMatrix4(face.matrixWorld);
      vueloDesde = ahora(); vuelo.visible = true;
      o.alLanzar(ultimo.x, ultimo.y, ultimo.fuerza);
    },
    update(_dt, _cam) {
      if (cargando) {
        potencia = potenciaDe(ahora() - desde);
        relleno.scale.y = Math.max(0.001, potencia);
        const dentro = Math.abs(Math.round((potencia - IDEAL) * 1e6) / 1e6) <= zona;
        (relleno.material as THREE.MeshBasicMaterial).color.setHex(potencia > IDEAL + zona ? 0xe5484d : 0x3fb6a8);
        (banda.material as THREE.MeshBasicMaterial).color.setHex(dentro ? 0xfff4cf : 0xffd27a); // lit while inside the window
      } else relleno.scale.y = Math.max(0.001, potencia);
      if (vuelo.visible) {
        const t = Math.min(1, (ahora() - vueloDesde) / 0.28);
        vuelo.position.lerpVectors(vueloA, vueloB, t); vuelo.position.y += Math.sin(t * Math.PI) * 0.06;
        vuelo.quaternion.copy(Q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), V.copy(vueloB).sub(vueloA).normalize()));
        if (t >= 1 && ahora() - vueloDesde > 1.5) vuelo.visible = false; // the server never answered: drop it
      }
    },
    fin() { cargando = false; vuelo.visible = false; },
    clavados(lista) {
      const vistos = new Set<string>();
      for (const x of lista) {
        const k = `${x.quien}:${x.numero}`; vistos.add(k);
        let m = clav.get(k);
        if (!m) { m = dardoMalla(); face.add(m); clav.set(k, m); vuelo.visible = false; }
        const fuera = Math.hypot(x.x, x.y) > PINTADA * 1.2;
        m.visible = !fuera; // way off the board: it is in the wall, not on the board
        m.position.set(x.x * RADIO_M, x.y * RADIO_M, 0.012);
        m.rotation.set(0.08 * ((x.numero % 3) - 1), 0.1 * ((x.numero % 2) - 0.5), 0);
      }
      for (const [k, m] of clav) if (!vistos.has(k)) { face.remove(m); clav.delete(k); }
    },
    recolocar() { fase = "buscando"; diana.visible = false; barra.visible = false; pared = null; },
    estado: () => ({ fase, pared, cargando, potencia: Math.round(potencia * 1000) / 1000, lanzados, clavados: clav.size, ultimo, zona }),
  };
}
