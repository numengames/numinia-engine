// Rediseño v2 (story E, maqueta p6): the wrist watch. Turn the back of your menu hand (left by default) towards you as
// when you look at a watch and a 12 cm disc fades in over that wrist; lower the hand and it fades out (muneca-gesto.ts:
// hysteresis, no flicker). Centre «Menú» (turquoise) opens and closes the menu panel (menu-invocado.ts); around it the
// things of every moment: microphone (on/off, the same as the Q key), camera (a photo), notices (opens them in the
// panel) and, only when the world has one, back to the city — without a city its place is not drawn. You press it with
// the OTHER hand: the index fingertip (tracked hand) or the controller's tip touching a button (< 1.5 cm, with
// rebound), or its ray + trigger/pinch (manos.ts asks `panel` like any other panel). Painted on a 512 px canvas at ≤ 10 Hz.
// Replaces U6's read-only watch (11d2637): the watch now has buttons because Pablo's p6 asks for them; you press it
// with the hand that is NOT moving it, which is what Meta's caution is about. Not yet confirmed on a real Quest.
import * as THREE from "three/webgpu";
import type { Lado, Panel } from "./manos.ts";
import { inicio, paso, normalDorsoLocal, type EstadoGesto, type Muestra } from "./muneca-gesto.ts";
import { RELOJ, DISCO, BOTONES_RELOJ, circulosReloj, botonRelojEn, toqueInicio, toquePaso, type BotonReloj, type EstadoToque } from "./menu-vr.ts";
import { COLOR, FUENTE, icono, type PathsIcono } from "./vr-pintura.ts";

/** The menu hand as the view reads it from manos.ts: the wrist in world space. */
export type ManoMenu = { posicion: THREE.Vector3; rotacion: THREE.Quaternion; esMano: boolean; lado: Lado };
/** What the watch shows: microphone on/off (null = this page has no voice), whether a photo can be made here, how many
 * notices you have not seen, and whether this world has a city to go back to. */
export type EstadoReloj = { micro: boolean | null; camara: boolean; avisos: number; ciudad: boolean; menuAbierto: boolean };

const REDIBUJO_MS = 100; // ≤ 10 Hz
const FUNDIDO_S = 0.15;
/** How far over the back of the wrist the disc floats (metres). */
export const ALTO_SOBRE_MUNECA_M = 0.035;

const _n = new THREE.Vector3(), _d = new THREE.Vector3(), _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _l = new THREE.Vector3();
/** The numbers the watch gesture needs, from the eyes (position + gaze) and the menu hand. */
export function medirReloj(ojo: THREE.Vector3, mira: THREE.Vector3, mano: ManoMenu): Muestra {
  const [nx, ny, nz] = normalDorsoLocal(mano.lado, mano.esMano);
  _n.set(nx, ny, nz).applyQuaternion(mano.rotacion).normalize();
  _d.copy(ojo).sub(mano.posicion);
  const dist = _d.length();
  if (dist > 1e-6) _d.divideScalar(dist);
  _dir.copy(_d).negate(); // eye → wrist
  _m.copy(mira).normalize();
  const ang = (Math.acos(Math.max(-1, Math.min(1, _m.dot(_dir)))) * 180) / Math.PI;
  return { dorso: _n.dot(_d), anguloGrados: ang, distanciaM: dist };
}

export function createReloj(h: { scene: THREE.Object3D; iconos?: PathsIcono; ahora?: () => number }) {
  const ahora = h.ahora ?? (() => performance.now());
  const W = RELOJ.lienzo;
  const c = document.createElement("canvas"); c.width = c.height = W;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(RELOJ.diametroM, RELOJ.diametroM), mat);
  malla.name = "reloj-muneca"; malla.renderOrder = 20; malla.visible = false;
  h.scene.add(malla);

  let gesto: EstadoGesto = inicio(), toque: EstadoToque = toqueInicio(), ultima: Muestra | null = null, ultimoT = 0;
  let firma = "", pintadoEn = -1e9, pinturas = 0, encima: BotonReloj | null = null, encimaEn = 0, pulsaciones = 0, ultimoPulsado: BotonReloj | null = null;
  let estado: () => EstadoReloj = () => ({ micro: null, camara: false, avisos: 0, ciudad: false, menuAbierto: false });
  let alPulsar: (b: BotonReloj, como: "dedo" | "rayo") => void = () => {};
  const visto = { ojo: [0, 0, 0], mano: null as number[] | null, punta: null as number[] | null };

  function pintar(forzar = false): void {
    const t = ahora(), e = estado();
    const f = JSON.stringify([e, encima]);
    if (!forzar && (f === firma || t - pintadoEn < REDIBUJO_MS)) return;
    firma = f; pintadoEn = t; pinturas++;
    dibujarReloj(g, e, encima, h.iconos);
    tex.needsUpdate = true;
  }
  function pulsar(b: BotonReloj, como: "dedo" | "rayo"): void {
    const e = estado();
    if (b === "ciudad" && !e.ciudad) return;
    pulsaciones++; ultimoPulsado = b;
    alPulsar(b, como);
    pintar(true);
  }

  const panel: Panel = {
    malla,
    fila(uv) { const b = botonRelojEn(uv.x * W, (1 - uv.y) * W, estado().ciudad); return b ? BOTONES_RELOJ.indexOf(b) + 1 : 0; },
    encima(n) { encimaEn = ahora(); const b = n ? BOTONES_RELOJ[n - 1] : null; if (b !== encima) { encima = b; pintar(true); } },
    pulsar(n) { if (n && malla.visible) pulsar(BOTONES_RELOJ[n - 1], "rayo"); },
  };

  return {
    /** Each frame while presenting. `ojo`/`mira` = the eyes' world position and gaze; `mano` = the menu hand's wrist
     * (null = not here); `punta` = the other hand's fingertip in world space (null = none). */
    update(ojo: THREE.Vector3, mira: THREE.Vector3, mano: ManoMenu | null, punta: THREE.Vector3 | null, t = ahora()): void {
      const dt = ultimoT ? Math.min(0.1, (t - ultimoT) / 1000) : 0; ultimoT = t;
      ultima = mano ? medirReloj(ojo, mira, mano) : null;
      visto.ojo = ojo.toArray().map((v) => +v.toFixed(3)); visto.mano = mano ? mano.posicion.toArray().map((v) => +v.toFixed(3)) : null;
      visto.punta = punta ? punta.toArray().map((v) => +v.toFixed(3)) : null;
      gesto = paso(gesto, ultima, t);
      const quiere = gesto.abierto && !!mano;
      mat.opacity = Math.max(0, Math.min(1, mat.opacity + (quiere ? 1 : -1) * (dt / FUNDIDO_S)));
      malla.visible = mat.opacity > 0.01;
      if (encima && t - encimaEn > 150) { encima = null; pintar(true); }
      if (!malla.visible || !mano) { toque = toqueInicio(); return; }
      const [nx, ny, nz] = normalDorsoLocal(mano.lado, mano.esMano);
      _n.set(nx, ny, nz).applyQuaternion(mano.rotacion).normalize();
      malla.position.copy(mano.posicion).addScaledVector(_n, ALTO_SOBRE_MUNECA_M); // over the back of the wrist
      if (malla.parent) malla.parent.worldToLocal(malla.position);
      malla.lookAt(ojo);
      malla.updateMatrixWorld(true);
      pintar();
      // the other hand's fingertip: pressed when it comes within 1.5 cm of a button (only while the watch is shown fully)
      if (mat.opacity < 0.9) return;
      const local = punta ? malla.worldToLocal(_l.copy(punta)) : null;
      const r = toquePaso(toque, local ? { x: local.x, y: local.y, z: local.z } : null, estado().ciudad, t);
      toque = r.estado;
      if (r.pulsado) pulsar(r.pulsado, "dedo");
    },
    /** What the watch draws (read at each paint). */
    estado(fn: () => EstadoReloj): void { estado = fn; },
    /** A button was pressed (by a fingertip or a ray). */
    alPulsar(fn: (b: BotonReloj, como: "dedo" | "rayo") => void): void { alPulsar = fn; },
    /** The panel manos.ts may point at (only while shown). */
    paneles(): Panel[] { return malla.visible && mat.opacity > 0.5 ? [panel] : []; },
    cerrar(): void { gesto = inicio(); toque = toqueInicio(); mat.opacity = 0; malla.visible = false; encima = null; },
    get visible() { return malla.visible; },
    malla, lienzo: c,
    /** Repaint now (checks, pictures). */
    pintar: () => pintar(true),
    /** For checks: where button `b` sits in the world (null while hidden or when that button is not drawn). */
    botonMundo(b: BotonReloj): { x: number; y: number; z: number } | null {
      if (!malla.visible) return null;
      const k = circulosReloj(estado().ciudad).find((x) => x.id === b);
      if (!k) return null;
      malla.updateMatrixWorld(true);
      const s = RELOJ.diametroM / W;
      const q = new THREE.Vector3((k.cx - W / 2) * s, (W / 2 - k.cy) * s, 0).applyMatrix4(malla.matrixWorld);
      return { x: q.x, y: q.y, z: q.z };
    },
    /** For checks. */
    diagnostico() {
      return { ...visto, visible: malla.visible, opacidad: +mat.opacity.toFixed(2), abierto: gesto.abierto, pinturas, pulsaciones, ultimoPulsado,
        encima, botones: circulosReloj(estado().ciudad).map((b) => b.id),
        medida: ultima ? { dorso: +ultima.dorso.toFixed(3), angulo: +ultima.anguloGrados.toFixed(1), distancia: +ultima.distanciaM.toFixed(3) } : null };
    },
  };
}
export type Reloj = ReturnType<typeof createReloj>;

/** Paint the watch's face (also used by the pictures of tools/ and by tests in a browser). */
export function dibujarReloj(g: CanvasRenderingContext2D, e: EstadoReloj, encima: BotonReloj | null, iconos?: PathsIcono): void {
  const W = RELOJ.lienzo, cx = W / 2;
  g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(cx, cx, DISCO.r, 0, Math.PI * 2);
  g.fillStyle = COLOR.fondo; g.fill(); g.lineWidth = 4; g.strokeStyle = COLOR.linea; g.stroke();
  for (const b of circulosReloj(e.ciudad)) {
    const sobre = encima === b.id;
    g.beginPath(); g.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    if (b.id === "menu") {
      g.fillStyle = sobre || e.menuAbierto ? COLOR.accionEncima : COLOR.accion; g.fill();
      if (sobre) { g.lineWidth = 5; g.strokeStyle = COLOR.texto; g.stroke(); }
      g.font = `600 44px ${FUENTE}`; g.fillStyle = COLOR.texto; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("Menú", b.cx, b.cy + 2);
      continue;
    }
    const apagado = (b.id === "camara" && !e.camara) || (b.id === "micro" && e.micro === null);
    g.fillStyle = sobre ? COLOR.filaEncima : "rgba(249,235,220,0.07)"; g.fill();
    g.lineWidth = sobre ? 5 : 3; g.strokeStyle = sobre ? COLOR.foco : COLOR.linea; g.stroke();
    const nombre = b.id === "micro" ? (e.micro ? "microphone" : "microphone-slash") : b.id === "camara" ? "camera" : b.id === "avisos" ? "bell" : "map-pin";
    icono(g, iconos, nombre, b.cx, b.cy, 56, apagado ? COLOR.tenue : b.id === "micro" && e.micro ? COLOR.ok : COLOR.texto);
    if (b.id === "avisos" && e.avisos > 0) { // unseen notices: an amber dot with the count
      const x = b.cx + b.r * 0.7, y = b.cy - b.r * 0.7;
      g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.fillStyle = COLOR.aviso; g.fill();
      g.font = `700 24px ${FUENTE}`; g.fillStyle = COLOR.fondoSolido; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(e.avisos > 9 ? "9+" : String(e.avisos), x, y + 1);
    }
  }
}
