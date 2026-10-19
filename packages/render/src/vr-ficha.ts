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

export function crearFichaVR(rig: THREE.Object3D, alPulsar: (a: AccionFichaVR) => void, colocar: (m: THREE.Object3D) => void) {
  const c = document.createElement("canvas"); c.width = FICHA_W; c.height = FICHA_H;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(FICHA_ANCHO_M, (FICHA_ANCHO_M * FICHA_H) / FICHA_W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  malla.renderOrder = 20; malla.visible = false; rig.add(malla);
  let datos: DatosFichaVR = { titulo: "", anclado: false }, encima = 0, encimaEn = 0, pideHasta = 0, firma = "";

  function pintar(): void {
    const ahora = performance.now(), sobre = ahora - encimaEn < 120 ? encima : 0, pide = ahora < pideHasta;
    const f = JSON.stringify([datos, sobre, pide]);
    if (f === firma) return;
    firma = f;
    g.clearRect(0, 0, FICHA_W, FICHA_H);
    g.fillStyle = "rgba(20,30,40,0.92)"; g.fillRect(0, 0, FICHA_W, FICHA_H);
    g.fillStyle = "#ffd27a"; g.font = "bold 40px sans-serif"; g.fillText(datos.titulo.slice(0, 34) || "Objeto", 24, 62);
    g.fillStyle = "rgba(255,255,255,0.65)"; g.font = "24px sans-serif"; g.fillText("Apunta con el rayo y aprieta el gatillo · para moverlo, mantén el gatillo sobre él", 24, 104);
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
    mostrar(d: DatosFichaVR): void { const abria = !malla.visible; datos = d; if (abria) { colocar(malla); malla.visible = true; pideHasta = 0; } firma = ""; pintar(); },
    ocultar(): void { malla.visible = false; encima = 0; pideHasta = 0; },
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
