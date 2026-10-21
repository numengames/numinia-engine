// v1 «la muñeca se ve»: the picture of the first-time notice (logic in muneca-aviso.ts). A flat panel stuck to the head
// (like the short notes), above the line of sight so it does not cover the controls card: the sentence in big letters
// (≥ 2°) and an arrow towards the lower left, where the left wrist is. It is only a pointer to the watch: the menu that
// opens is the same one as always (menu-invocado.ts).
import * as THREE from "three/webgpu";
import { AVISO, avisoInicio, avisoPaso, marcarVisto, textoAviso, yaVisto, type EstadoAviso } from "./muneca-aviso.ts";
import { COLOR, FUENTE, envolverPx, fondoPanel } from "./vr-pintura.ts";

/** Paint the notice (also used by checks and pictures). */
export function dibujarAviso(g: CanvasRenderingContext2D, texto: string): void {
  const { w, h } = AVISO.lienzo;
  fondoPanel(g, w, h, 36);
  g.font = `600 ${AVISO.letraPx}px ${FUENTE}`; g.fillStyle = COLOR.texto; g.textAlign = "left"; g.textBaseline = "middle";
  const lineas = envolverPx(g, texto, w - 300).slice(0, 3), alto = AVISO.letraPx * 1.3;
  const y0 = h / 2 - ((lineas.length - 1) * alto) / 2;
  lineas.forEach((l, i) => g.fillText(l, 250, y0 + i * alto));
  // the arrow: a thick turquoise arrow pointing down and to the left (the left wrist)
  g.save(); g.translate(120, h / 2); g.rotate(Math.PI * 0.75);
  g.fillStyle = COLOR.accion; g.beginPath();
  g.moveTo(-70, -26); g.lineTo(20, -26); g.lineTo(20, -62); g.lineTo(90, 0); g.lineTo(20, 62); g.lineTo(20, 26); g.lineTo(-70, 26); g.closePath(); g.fill();
  g.restore();
}

export function createAviso(h: { camera: THREE.Object3D; idioma?: () => string; almacen?: () => Parameters<typeof yaVisto>[0]; ahora?: () => number }) {
  const ahora = h.ahora ?? (() => performance.now());
  const almacen = h.almacen ?? (() => (typeof localStorage !== "undefined" ? localStorage : null));
  const idioma = h.idioma ?? (() => (typeof document !== "undefined" ? document.documentElement.lang : ""));
  const c = document.createElement("canvas"); c.width = AVISO.lienzo.w; c.height = AVISO.lienzo.h;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(AVISO.anchoM, (AVISO.anchoM * AVISO.lienzo.h) / AVISO.lienzo.w), mat);
  malla.name = "aviso-muneca"; malla.renderOrder = 22; malla.visible = false;
  malla.position.set(0, 0.2, -AVISO.distM);
  let e: EstadoAviso = avisoInicio(true), ultimoT = 0, texto = "", vistas = 0;

  return {
    malla, lienzo: c,
    /** Entering VR: read the device's «seen» flag and arm the notice (or not). The panel rides on the camera. */
    nueva(): void {
      e = avisoInicio(yaVisto(almacen())); ultimoT = 0; texto = ""; mat.opacity = 0; malla.visible = false;
      if (e.fase !== "hecho") h.camera.add(malla);
    },
    /** Leaving VR. */
    cerrar(): void { e = avisoInicio(true); mat.opacity = 0; malla.visible = false; h.camera.remove(malla); },
    /** Each frame while presenting. */
    update(en: { bloqueado: boolean; menuAbierto: boolean }, t = ahora()): void {
      const dt = ultimoT ? Math.min(0.1, (t - ultimoT) / 1000) : 0; ultimoT = t;
      if (e.fase === "hecho" && !malla.visible) return;
      const r = avisoPaso(e, en, t);
      e = r.estado;
      if (r.empieza) {
        vistas++; marcarVisto(almacen());
        texto = textoAviso(idioma()); dibujarAviso(g, texto); tex.needsUpdate = true;
      }
      mat.opacity = Math.max(0, Math.min(1, mat.opacity + (r.mostrar ? 1 : -1) * (dt / (AVISO.fundidoMs / 1000))));
      malla.visible = mat.opacity > 0.01;
      if (e.fase === "hecho" && !malla.visible) h.camera.remove(malla);
    },
    /** For checks. */
    diagnostico() { return { fase: e.fase, visible: malla.visible, opacidad: +mat.opacity.toFixed(2), texto, vistas }; },
    get visible() { return malla.visible; },
  };
}
export type Aviso = ReturnType<typeof createAviso>;
