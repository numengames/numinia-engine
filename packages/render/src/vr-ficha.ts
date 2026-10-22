// C5: the object card in VR — a flat panel (one canvas, one draw call) about 1.1 m in front of you with big buttons you
// point at with the controller's ray or a hand's ray (the same `Panel` interface the dialogue and «Salir de VR» use; manos.ts
// is not touched). Loaded on demand by vr.ts the first time an object is picked in a session: desktop never fetches it.
// render only draws and reports the press; the page runs the builder's own verbs (apps/plaza/constructor-xr.ts).
import * as THREE from "three/webgpu";
import type { Panel } from "./manos.ts";

export type AccionFichaVR = "mover" | "girar" | "mas" | "menos" | "duplicar" | "anclar" | "borrar" | "cerrar";
export type DatosFichaVR = { titulo: string; anclado: boolean };
/** Canvas size and the button grid (4 × 2 cells; ≥ 10° of arc each at 1.1 m, Meta asks ≥ 3°). */
export const FICHA_W = 768, FICHA_H = 432, COLS = 4, X0 = 24, Y0 = 128, CW = 168, CH = 132, GAP = 16;
export const FICHA_ANCHO_M = 0.9; // the plane's width in metres
/** Where the card sits, from the eyes and the flat direction of the gaze: DIST_M ahead, DESVIO_RAD to the left, BAJO_M below the eyes
 *  (the ray to the thing you work on, straight ahead, must not cross it, and the right hand stays clear). Pure: world coordinates in, out. */
export const FICHA_DIST_M = 0.9, FICHA_DESVIO_RAD = 0.5, FICHA_BAJO_M = 0.42;
/** v13: the card follows your head — once it is more than this many degrees off your line of sight it comes back (it used to stay
 *  where it opened: turn round and it was behind you, «Cerrar» out of reach). */
export const FICHA_SEGUIR_GRADOS = 55, FICHA_VUELTA_S = 0.2;
type V3 = { x: number; y: number; z: number };
export function puntoFicha(ojo: V3, mira: V3): V3 {
  let dx = mira.x, dz = mira.z; const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = 0; dz = -1; } else { dx /= l; dz /= l; }
  const c = Math.cos(FICHA_DESVIO_RAD), s = Math.sin(FICHA_DESVIO_RAD); // turned to the left about the vertical axis
  const x = dx * c + dz * s, z = -dx * s + dz * c;
  return { x: ojo.x + x * FICHA_DIST_M, y: ojo.y - FICHA_BAJO_M, z: ojo.z + z * FICHA_DIST_M };
}
/** The angle (degrees) between where you look and the point `p`. Pure. */
export function gradosDeLaMirada(ojo: V3, mira: V3, p: V3): number {
  const vx = p.x - ojo.x, vy = p.y - ojo.y, vz = p.z - ojo.z, l = Math.hypot(vx, vy, vz), m = Math.hypot(mira.x, mira.y, mira.z);
  if (l < 1e-6 || m < 1e-6) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (vx * mira.x + vy * mira.y + vz * mira.z) / (l * m)))) * 180) / Math.PI;
}
/** «Borrar» asks twice: the second press must come within this long (ms) of the first. */
export const BORRAR_CONFIRMA_MS = 3000;

/** The cells in order (1..8): the label under each, and whether it is the dangerous one. */
export function celdasFicha(d: DatosFichaVR, pideBorrar = false): { id: AccionFichaVR; etiqueta: string; peligro?: boolean }[] {
  return [
    { id: "mover", etiqueta: "Mover" }, { id: "girar", etiqueta: "Girar 15°" }, { id: "mas", etiqueta: "Escalar +" }, { id: "menos", etiqueta: "Escalar −" },
    { id: "duplicar", etiqueta: "Duplicar" }, { id: "anclar", etiqueta: d.anclado ? "Soltar" : "Anclar" },
    { id: "borrar", etiqueta: pideBorrar ? "¿Seguro?" : "Borrar", peligro: true }, { id: "cerrar", etiqueta: "Cerrar" },
  ];
}

/** Which cell (1..8) a canvas point (px) falls in; 0 for the gaps, the title and outside. Pure. */
export function celdaEn(x: number, y: number): number {
  const c = Math.floor((x - X0) / (CW + GAP)), f = Math.floor((y - Y0) / (CH + GAP));
  if (c < 0 || c >= COLS || f < 0 || f > 1) return 0;
  const dx = (x - X0) - c * (CW + GAP), dy = (y - Y0) - f * (CH + GAP);
  return dx <= CW && dy <= CH ? f * COLS + c + 1 : 0;
}

/** `cabeza()` says where the eyes are and where they look now (world); the card places itself from it. */
export function crearFichaVR(rig: THREE.Object3D, alPulsar: (a: AccionFichaVR) => void, cabeza: () => { ojo: V3; mira: V3 }) {
  const c = document.createElement("canvas"); c.width = FICHA_W; c.height = FICHA_H;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(FICHA_ANCHO_M, (FICHA_ANCHO_M * FICHA_H) / FICHA_W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  malla.renderOrder = 20; malla.visible = false; rig.add(malla);
  let pedida = false, cede = false, siguiendo = false; // asked by the page / stepping aside for the VR menu / easing back to your line of sight
  const ver = (): void => { malla.visible = pedida && !cede; };
  const aqui = new THREE.Vector3(), alli = new THREE.Vector3();
  const colocar = (m: THREE.Object3D): void => { // in front of you, low and to the left, facing the eyes
    const { ojo, mira } = cabeza(), t = puntoFicha(ojo, mira);
    alli.set(t.x, t.y, t.z); rig.worldToLocal(alli); m.position.copy(alli);
    m.lookAt(ojo.x, ojo.y, ojo.z);
  };
  let datos: DatosFichaVR = { titulo: "", anclado: false }, encima = 0, encimaEn = 0, pideHasta = 0, firma = "";

  function pintar(): void {
    const ahora = performance.now(), sobre = ahora - encimaEn < 120 ? encima : 0, pide = ahora < pideHasta;
    const f = JSON.stringify([datos, sobre, pide]);
    if (f === firma) return;
    firma = f;
    g.clearRect(0, 0, FICHA_W, FICHA_H);
    g.fillStyle = "rgba(20,30,40,0.92)"; g.fillRect(0, 0, FICHA_W, FICHA_H);
    g.fillStyle = "#ffd27a"; g.font = "bold 40px sans-serif"; g.fillText(datos.titulo.slice(0, 34) || "Objeto", 24, 62);
    g.fillStyle = "rgba(255,255,255,0.65)"; g.font = "24px sans-serif"; g.fillText("Gatillo: elegir · mantenlo sobre algo: moverlo · B: dejar de construir", 24, 104);
    celdasFicha(datos, pide).forEach((cel, i) => {
      const x = X0 + (i % COLS) * (CW + GAP), y = Y0 + Math.floor(i / COLS) * (CH + GAP), sel = sobre === i + 1;
      g.fillStyle = sel ? "#ffd27a" : cel.peligro ? (pide ? "#e07a5f" : "rgba(224,122,95,0.35)") : "rgba(255,255,255,0.14)"; g.fillRect(x, y, CW, CH);
      g.strokeStyle = "#ffd27a"; g.lineWidth = sel ? 6 : 3; g.strokeRect(x + 1.5, y + 1.5, CW - 3, CH - 3);
      g.fillStyle = sel ? "#1a2430" : "#ffffff"; g.font = "bold 30px sans-serif"; g.textAlign = "center";
      g.fillText(cel.etiqueta, x + CW / 2, y + CH / 2 + 10); g.textAlign = "start";
    });
    tex.needsUpdate = true;
  }

  const panel: Panel = {
    malla,
    fila(uv) { return celdaEn(uv.x * FICHA_W, (1 - uv.y) * FICHA_H); },
    encima(n) { encima = n; encimaEn = performance.now(); pintar(); },
    pulsar(n) {
      const cel = celdasFicha(datos)[n - 1];
      if (!cel) return;
      if (cel.id === "borrar") { // twice, like «Salir de VR»: a stray press never deletes
        if (performance.now() >= pideHasta) { pideHasta = performance.now() + BORRAR_CONFIRMA_MS; pintar(); return; }
        pideHasta = 0;
      }
      alPulsar(cel.id); firma = ""; pintar();
    },
  };
  return {
    panel,
    get visible() { return malla.visible; },
    mostrar(d: DatosFichaVR): void { const abria = !pedida; datos = d; pedida = true; if (abria) { colocar(malla); pideHasta = 0; siguiendo = false; } ver(); firma = ""; pintar(); },
    ocultar(): void { pedida = false; ver(); encima = 0; pideHasta = 0; siguiendo = false; },
    /** The VR menu opens in front of you: the card steps aside (one thing in front of you) and comes back where you look when it closes. */
    ceder(si: boolean): void { if (si === cede) return; cede = si; if (!si && pedida) { colocar(malla); siguiendo = false; } ver(); },
    /** Each frame while shown (v13): once you have turned away (> FICHA_SEGUIR_GRADOS) the card eases back to your line of sight; while
     *  it is in view it never moves, so the buttons do not slide from under the pointer. */
    seguir(ojo: V3, mira: V3, dt: number): void {
      if (!malla.visible) return;
      malla.getWorldPosition(aqui);
      if (!siguiendo && gradosDeLaMirada(ojo, mira, aqui) < FICHA_SEGUIR_GRADOS) return;
      siguiendo = true;
      const t = puntoFicha(ojo, mira); alli.set(t.x, t.y, t.z);
      aqui.lerp(alli, 1 - Math.exp(-dt / FICHA_VUELTA_S));
      if (aqui.distanceToSquared(alli) < 0.0009) { aqui.copy(alli); siguiendo = false; }
      malla.parent!.worldToLocal(aqui); malla.position.copy(aqui);
      malla.lookAt(ojo.x, ojo.y, ojo.z);
    },
    /** Each frame while shown: the highlight fades once the ray leaves; «¿Seguro?» goes back after BORRAR_CONFIRMA_MS. */
    tick(): void { if (malla.visible) pintar(); },
    /** For checks: the centre of cell n in the world, and what the panel says. */
    celdaMundo(n: number): { x: number; y: number; z: number } | null {
      if (!malla.visible || n < 1 || n > 8) return null;
      const h = (FICHA_ANCHO_M * FICHA_H) / FICHA_W, i = n - 1;
      const px = X0 + (i % COLS) * (CW + GAP) + CW / 2, py = Y0 + Math.floor(i / COLS) * (CH + GAP) + CH / 2;
      malla.updateMatrixWorld(true);
      const p = new THREE.Vector3((px / FICHA_W - 0.5) * FICHA_ANCHO_M, h / 2 - (py / FICHA_H) * h, 0.001).applyMatrix4(malla.matrixWorld);
      return { x: p.x, y: p.y, z: p.z };
    },
    estado() { return { visible: malla.visible, titulo: datos.titulo, anclado: datos.anclado, pideBorrar: performance.now() < pideHasta }; },
  };
}
export type FichaVR = ReturnType<typeof crearFichaVR>;
