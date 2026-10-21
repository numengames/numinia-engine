// dardos in VR, the 3D side (lazy: fetched by the page's dardos-vr.ts only after a VR-capable device sees a dartboard,
// never awaited before requestSession). It draws three things with the one shared dart mesh of dardos.ts (1 draw call
// each, at most a handful alive):
//   · the dart IN YOUR HAND — a child of the hand's anchor (grip of a controller, thumb-index point of a tracked hand);
//   · the dart FLYING from the hand to the board: it grows to the plaza board's scale on the way (the stuck darts are
//     ESCALA_PLAZA times real size) and, when the server's answer says where it landed, it ends exactly there and
//     gives way to the stuck dart (never vanishing before that: it waits at the board up to ESPERA_S, then falls);
//   · the dart that FALLS (a slow or sideways release, a rejected throw, an answer that never came): ballistic to the
//     floor, rests, shrinks away. A dart is never left floating and never disappears in one frame.
//   · the SCOREBOARD beside the board (v6): names, points, «Te toca» / «Le toca a X» and, when it applies, a button you point at
//     with the ray (the same `Panel` interface as the object card): «Pasar turno», «Empezar», «Otro turno». What it says is
//     dardos-marcador.ts (pure); here it is a plane on the board's group, one canvas, one draw call.
// The dart in the hand is held by its TAIL (the shaft behind the barrel) and points where the controller points (tip
// forward, flights back toward the wrist), not along the hand's own frame.
// Also `cadaCuadro`: the page's per-frame reader, called after the hands moved.
import * as THREE from "three/webgpu";
import { dardoMalla, ESCALA_PLAZA } from "./dardos.ts";
import { RADIO_M, PINTADA } from "./diana.ts";
import { ANCHO_M, ANCHO_PX, PX_POR_M, claveMarcador, disposicion, enBoton, pintarMarcador } from "./dardos-marcador.ts";
import type { Boton, MarcadorV } from "./dardos-marcador.ts";
import type { Panel } from "./manos.ts";

export type Lado = "izq" | "der";
export type V3 = [number, number, number];
export type Vuelo = {
  /** The server answered: "clavado" = it landed at `donde` (world; the flight ends there and hides, the stuck dart is drawn
   *  by the board), "caido" = it was rejected (the flight ends by falling). */
  resolver(como: "clavado" | "caido", donde?: V3): void;
};
/** Seconds a dart waits at the board for the server's answer before it falls. */
export const ESPERA_S = 1.5;
const G = 9.8, DESCANSO_S = 1.2, ENCOGE_S = 0.4;
/** Where the hand holds the dart: this far (m) from its tip, on the shaft behind the barrel (the tail end is 0.143 m). */
export const COLA_M = 0.095;
/** The scoreboard hangs beside the board (board-group metres: right of the painted board, which is PINTADA × RADIO_M × ESCALA_PLAZA of radius; turned a little toward the throwing line). */
const MARCADOR = { x: RADIO_M * PINTADA * ESCALA_PLAZA + 0.1 + ANCHO_M / 2, arriba: 2.15, z: 0.2, giro: -0.4 };

type Una = { g: THREE.Object3D; face: THREE.Object3D; s: { rumbo: number } };
/** The scoreboard plane (lazy with the rest of the VR darts). `alPulsar` is told which button was pressed. */
function crearMarcador(h: { una(id: string): Una | undefined }) {
  const lienzo = document.createElement("canvas"); lienzo.width = ANCHO_PX; lienzo.height = 800;
  const ctx = lienzo.getContext("2d")!;
  const tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO_M, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  malla.name = "dardos:marcador"; malla.renderOrder = 20; malla.visible = false; malla.frustumCulled = false;
  let m: MarcadorV | null = null, sitio = "", firma = "", alto = 0, encima = false, encimaEn = 0, repintados = 0;
  const escuchas = new Set<(b: Boton) => void>();
  function pintar(): void {
    if (!m) return;
    const f = `${claveMarcador(m)}|${encima}`;
    if (f === firma) return;
    firma = f; repintados++;
    alto = disposicion(m).alto;
    pintarMarcador(ctx, m, encima);
    tex.repeat.set(1, alto / lienzo.height); tex.offset.set(0, 1 - alto / lienzo.height); tex.needsUpdate = true;
    malla.scale.y = alto / PX_POR_M; malla.position.y = MARCADOR.arriba - malla.scale.y / 2;
  }
  const panel: Panel = {
    malla,
    fila(uv) { return enBoton(m, uv.x * ANCHO_PX, (1 - uv.y) * alto) ? 1 : 0; },
    encima(n) { encima = n === 1; encimaEn = performance.now(); pintar(); },
    pulsar(n) { if (n === 1 && m?.boton) for (const f of escuchas) f(m.boton); },
  };
  return {
    panel,
    /** The panel of board `id` shows `nuevo`; null (or no such board) hides it. */
    mostrar(id: string | null, nuevo: MarcadorV | null): void {
      const d = id ? h.una(id) : undefined;
      if (!d || !nuevo) { malla.visible = false; m = null; sitio = ""; encima = false; return; }
      if (malla.parent !== d.g) { malla.removeFromParent(); d.g.add(malla); malla.position.x = MARCADOR.x; malla.position.z = MARCADOR.z; malla.rotation.y = MARCADOR.giro; }
      m = nuevo; sitio = id!; malla.visible = true; pintar();
    },
    /** Each frame: the highlight goes once the ray leaves. */
    tick(): void { if (encima && performance.now() - encimaEn > 120) { encima = false; pintar(); } },
    alPulsar(fn: (b: Boton) => void): () => void { escuchas.add(fn); return () => escuchas.delete(fn); },
    /** For checks: what it shows, the world centre of its button, and the canvas itself (the pictures of the e2e). */
    estado() { return { visible: malla.visible, sitio, marcador: m, repintados, encima }; },
    botonMundo(): { x: number; y: number; z: number } | null {
      const b = m ? disposicion(m).boton : null; if (!b || !malla.visible) return null;
      malla.updateMatrixWorld(true);
      const w = new THREE.Vector3(((b.x + b.w / 2) / ANCHO_PX - 0.5) * ANCHO_M, (0.5 - (b.y + b.h / 2) / alto) * (alto / PX_POR_M), 0.002).applyMatrix4(malla.matrixWorld);
      return { x: w.x, y: w.y, z: w.z };
    },
    lienzo: () => { const c = document.createElement("canvas"); c.width = ANCHO_PX; c.height = alto || 1; c.getContext("2d")!.drawImage(lienzo, 0, 0); return c; },
  };
}

export function crearDardosVR(h: { world: THREE.Object3D; ancla(l: Lado): THREE.Object3D | null; suelo(): number; una(id: string): Una | undefined; /** Where that hand points now (world, unit): the controller's ray, a tracked hand's wrist-to-fingertip. */ apunta?(l: Lado): V3 | null }) {
  const marcador = crearMarcador(h);
  const cuadro = new Set<(dt: number) => void>();
  let enMano: { lado: Lado; malla: THREE.Object3D; pivote: THREE.Object3D } | null = null;
  type Vola = { malla: THREE.Mesh; desde: THREE.Vector3; hacia: THREE.Vector3; resuelto: "clavado" | "caido" | null; t0: number; ms: number; fin?: () => void };
  type Cae = { malla: THREE.Mesh; vel: THREE.Vector3; reposo: number };
  const vuelos: Vola[] = [], caidas: Cae[] = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), F = new THREE.Vector3(0, 0, -1), Q = new THREE.Quaternion();
  const mallaMundo = (): THREE.Mesh => { const m = dardoMalla(); m.frustumCulled = false; h.world.add(m); return m; };
  const quitar = (m: THREE.Object3D) => m.parent?.remove(m);

  /** Turn the held dart so its tip points where that hand points (the grip frame of a controller is tilted from its ray: held «as is» the dart pointed up and sideways). */
  function apuntar(): void {
    if (!enMano) return;
    const a = enMano.pivote.parent, d = h.apunta?.(enMano.lado);
    if (!a || !d) { enMano.pivote.quaternion.identity(); return; }
    a.updateWorldMatrix(true, false); a.getWorldQuaternion(Q).invert();
    A.set(d[0], d[1], d[2]).applyQuaternion(Q);
    if (A.lengthSq() > 1e-6) enMano.pivote.quaternion.setFromUnitVectors(F, A.normalize());
  }
  function caer(m: THREE.Mesh, vel: THREE.Vector3): void { caidas.push({ malla: m, vel: vel.clone(), reposo: 0 }); }

  return {
    /** The dart in this hand (null: none). The hand's anchor must exist (the hands module is loaded). */
    enMano(lado: Lado | null): boolean {
      if (enMano && enMano.lado !== lado) { quitar(enMano.malla); enMano = null; }
      if (!lado || enMano) return !!enMano || !lado;
      const a = h.ancla(lado); if (!a) return false;
      const malla = dardoMalla(); malla.frustumCulled = false;
      malla.position.set(0, 0, -COLA_M); // the mesh's tip is its origin and its flights are at +z: held at the shaft, the tip is COLA_M ahead of the hand, the flights behind it
      const pivote = new THREE.Group(); pivote.add(malla); a.add(pivote); // the pivot is the hand's point: it turns the dart to where the controller points
      enMano = { lado, malla: pivote, pivote }; apuntar();
      return true;
    },
    /** The world position of a hand's anchor (where a dart leaves it). */
    posicion(lado: Lado): V3 | null { const n = h.ancla(lado); if (!n) return null; n.updateWorldMatrix(true, false); n.getWorldPosition(A); return [A.x, A.y, A.z]; },
    /** A hand's anchor in its OWN frame (the rig's: it ignores the avatar walking) and a way to turn a velocity from it into the world's. */
    local(lado: Lado): V3 | null { const n = h.ancla(lado); return n ? [n.position.x, n.position.y, n.position.z] : null; },
    aMundo(v: V3, lado: Lado): V3 {
      const n = h.ancla(lado); if (!n?.parent) return v;
      n.parent.updateWorldMatrix(true, false); n.parent.getWorldQuaternion(Q);
      A.set(v[0], v[1], v[2]).applyQuaternion(Q); return [A.x, A.y, A.z];
    },
    /** Take the dart out of the hand and send it flying to `hacia` (call `.resolver` when the server answers). */
    volar(desde: V3, hacia: V3, ms: number, fin?: () => void): Vuelo {
      if (enMano) { quitar(enMano.malla); enMano = null; }
      const malla = mallaMundo(); malla.position.set(...desde);
      const w: Vola = { malla, desde: new THREE.Vector3(...desde), hacia: new THREE.Vector3(...hacia), resuelto: null, t0: performance.now(), ms, fin };
      vuelos.push(w);
      return { resolver(como, donde) { if (donde) w.hacia.set(...donde); w.resuelto = como; } };
    },
    /** The dart in hand (or a new one at `desde`) falls with a velocity. */
    soltar(desde: V3, vel: V3): void {
      if (enMano) { quitar(enMano.malla); enMano = null; }
      const m = mallaMundo(); m.position.set(...desde); caer(m, new THREE.Vector3(...vel));
    },
    /** The face of a board in the world: centre, unit normal toward the thrower, unit right, metres per board radius. */
    cara(id: string): { c: V3; n: V3; r: V3; m: number } | null {
      const d = h.una(id); if (!d) return null;
      d.g.updateMatrixWorld(true);
      const c = d.face.getWorldPosition(new THREE.Vector3()), a = (d.s.rumbo * Math.PI) / 180;
      return { c: [c.x, c.y, c.z], n: [Math.sin(a), 0, Math.cos(a)], r: [Math.cos(a), 0, -Math.sin(a)], m: RADIO_M * ESCALA_PLAZA };
    },
    /** Where a dart that landed at (x, y) board radii sits in the world (way off the board: under it, as the board draws it). */
    puntoMundo(id: string, x: number, y: number): V3 | null {
      const d = h.una(id); if (!d) return null;
      d.g.updateMatrixWorld(true);
      const fuera = Math.hypot(x, y) > PINTADA * 1.2;
      const w = d.face.localToWorld(new THREE.Vector3(x * RADIO_M, fuera ? -RADIO_M * PINTADA * 1.3 : y * RADIO_M, 0.012));
      return [w.x, w.y, w.z];
    },
    cadaCuadro(fn: (dt: number) => void): () => void { cuadro.add(fn); return () => cuadro.delete(fn); },
    actualizar(dt: number): void {
      const ahora = performance.now();
      for (const f of cuadro) { try { f(dt); } catch (e) { console.warn("[dardos-vr]", e); } }
      apuntar(); marcador.tick();
      for (let i = vuelos.length - 1; i >= 0; i--) {
        const w = vuelos[i], t = (ahora - w.t0) / w.ms;
        B.copy(w.hacia);
        w.malla.position.lerpVectors(w.desde, B, Math.min(1, t));
        w.malla.position.y += Math.sin(Math.min(1, t) * Math.PI) * 0.05 * Math.min(1, w.ms / 600); // a little arc, so it reads as thrown
        w.malla.scale.setScalar(1 + (ESCALA_PLAZA - 1) * Math.min(1, t));
        A.copy(B).sub(w.desde); if (A.lengthSq() > 1e-6) w.malla.quaternion.copy(Q.setFromUnitVectors(F, A.normalize()));
        if (t < 1) continue;
        if (w.resuelto === "clavado") { quitar(w.malla); vuelos.splice(i, 1); w.fin?.(); }
        else if (w.resuelto === "caido" || ahora - w.t0 > w.ms + ESPERA_S * 1000) { vuelos.splice(i, 1); w.malla.scale.setScalar(1); caer(w.malla, A.set(0, 0.5, 0)); w.fin?.(); }
      }
      for (let i = caidas.length - 1; i >= 0; i--) {
        const c = caidas[i];
        if (c.reposo === 0) {
          c.vel.y -= G * dt; c.malla.position.addScaledVector(c.vel, dt);
          if (c.vel.lengthSq() > 1e-4) c.malla.quaternion.slerp(Q.setFromUnitVectors(F, A.copy(c.vel).normalize()), Math.min(1, dt * 8));
          const suelo = h.suelo() + 0.004;
          if (c.malla.position.y <= suelo) { c.malla.position.y = suelo; c.reposo = ahora; c.malla.rotation.set(Math.PI / 2 - 0.1, c.malla.rotation.y, 0); }
        } else {
          const s = ahora - c.reposo - DESCANSO_S * 1000;
          if (s > 0) { const k = Math.max(0, 1 - s / (ENCOGE_S * 1000)); c.malla.scale.setScalar(Math.max(0.001, k)); if (k <= 0) { quitar(c.malla); caidas.splice(i, 1); } }
        }
      }
    },
    /** For checks: how many darts this module draws now. */
    contar: () => ({ enMano: enMano ? enMano.lado : null, vuelan: vuelos.length, caen: caidas.length }),
    /** The scoreboard beside the board and its button as a `Panel` (the hands' ray and pinch find it through `paneles`). */
    marcador,
    paneles: (): Panel[] => (marcador.estado().visible ? [marcador.panel] : []),
    /** For checks: the held dart's tip and hold point in the world, and the way it points (null: nothing in hand). */
    mano(): { punta: V3; agarre: V3; dir: V3 } | null {
      if (!enMano) return null;
      enMano.pivote.updateWorldMatrix(true, true);
      const pu = enMano.malla.children[0].localToWorld(new THREE.Vector3(0, 0, 0)), ag = enMano.pivote.getWorldPosition(new THREE.Vector3()), dir = pu.clone().sub(ag).normalize();
      return { punta: [pu.x, pu.y, pu.z], agarre: [ag.x, ag.y, ag.z], dir: [dir.x, dir.y, dir.z] };
    },
  };
}
export type DardosVR = ReturnType<typeof crearDardosVR>;
