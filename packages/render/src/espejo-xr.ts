// espejo-xr (MIS-200 t_40a65495): what the Graboso records inside an XR session. Inside XR three draws into the layer's
// framebuffer, never into the canvas' own, so canvas.captureStream() gets no frames and the clip comes out empty. While (and
// only while) a clip is being recorded, this mirrors ONE eye into a small 2D canvas that the recorder films instead.
//
// Why re-render into a small render target and not blit the layer framebuffer: the renderer is three's WebGPURenderer, which
// owns the XR layer (a texture array / multiview target on a Quest, a WebGPU texture on the other backend). Reaching into it
// means backend-private GL calls that only work on one backend. The re-render uses the same API the top map uses (cenital.ts:
// setRenderTarget + readRenderTargetPixelsAsync), works on both backends and cannot corrupt the headset's frame. Its cost is one
// extra mono pass at 640×360 (~11 % of the pixels of one Quest eye) drawn with the very same scene, so the draw calls repeat once;
// that is why it is throttled to 20 fps (not the 72–90 of the headset) and skipped while the previous read is still in flight.
// Off the recording, nothing here runs: no target, no canvas, no hook work (cuadro() returns on its first line).
import * as THREE from "three/webgpu";

export const ESPEJO = { ancho: 640, alto: 360, cuadrosPorS: 20, fov: 75 } as const;

const SRGB = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) { const c = i / 255; SRGB[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); }

/** Pixels the GPU read gave back → RGBA of the 2D canvas (sRGB, top row first). Pure, so a test can run it. */
export function pasarPixeles(datos: Uint8Array, ancho: number, alto: number, deAbajo: boolean, destino: Uint8ClampedArray): void {
  const fila = datos.length >= ancho * alto * 4 && datos.length < ancho * alto * 4 + 256 ? ancho * 4 : Math.ceil((ancho * 4) / 256) * 256; // WebGPU pads rows to 256 bytes
  for (let y = 0; y < alto; y++) {
    const src = (deAbajo ? alto - 1 - y : y) * fila, dst = y * ancho * 4;
    for (let x = 0; x < ancho * 4; x += 4) { destino[dst + x] = SRGB[datos[src + x]]; destino[dst + x + 1] = SRGB[datos[src + x + 1]]; destino[dst + x + 2] = SRGB[datos[src + x + 2]]; destino[dst + x + 3] = 255; }
  }
}

export type EspejoXR = {
  /** Starts mirroring; the canvas it returns is what the recorder films. It first compiles the target's shaders (the first
   * clip began with black seconds in software GL), so the clip opens on a picture. Safe to call twice. */
  encender(): Promise<HTMLCanvasElement>;
  /** Stops and frees the target and the canvas. */
  apagar(): void;
  /** Call right after the XR frame was drawn (scene still in its drawn state). Returns at once unless it is time. */
  cuadro(ahoraMs: number): void;
  activo(): boolean;
  lienzo(): HTMLCanvasElement | null;
  /** For checks: frames written to the mirror canvas since it was switched on. */
  escritos(): number;
};

export function crearEspejoXR(o: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; backend: "WebGPU" | "WebGL2" }): EspejoXR {
  const { renderer, scene } = o;
  let lienzo: HTMLCanvasElement | null = null, rt: THREE.RenderTarget | null = null, cam: THREE.PerspectiveCamera | null = null;
  let imagen: ImageData | null = null, proximo = 0, leyendo = false, escritos = 0;
  return {
    async encender() {
      if (lienzo) return lienzo;
      const nuevo = document.createElement("canvas"); nuevo.width = ESPEJO.ancho; nuevo.height = ESPEJO.alto;
      nuevo.getContext("2d")!.fillRect(0, 0, ESPEJO.ancho, ESPEJO.alto); // a first (black) frame, so the stream has a track at once
      const objetivo = new THREE.RenderTarget(ESPEJO.ancho, ESPEJO.alto), c = new THREE.PerspectiveCamera(ESPEJO.fov, ESPEJO.ancho / ESPEJO.alto, 0.05, 2000);
      const destino = renderer.getRenderTarget();
      try { renderer.setRenderTarget(objetivo); await renderer.compileAsync(scene, c); } catch { /* it will compile on its first frame */ } finally { renderer.setRenderTarget(destino); }
      if (lienzo) { objetivo.dispose(); return lienzo; } // a second call finished first
      lienzo = nuevo; rt = objetivo; cam = c;
      imagen = new ImageData(ESPEJO.ancho, ESPEJO.alto); proximo = 0; leyendo = false; escritos = 0;
      return lienzo;
    },
    apagar() { rt?.dispose(); lienzo = null; rt = null; cam = null; imagen = null; },
    activo: () => !!lienzo,
    lienzo: () => lienzo,
    escritos: () => escritos,
    cuadro(ahoraMs) {
      if (!lienzo || !rt || !cam || !imagen || leyendo || ahoraMs < proximo) return;
      const ojo = renderer.xr.getCamera().cameras?.[0]; // the left eye, in world space (refreshed by the frame that just drew)
      if (!ojo) return;
      proximo = ahoraMs + 1000 / ESPEJO.cuadrosPorS;
      cam.matrixWorld.copy(ojo.matrixWorld); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      cam.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale); cam.updateMatrixWorld(true);
      const destino = renderer.getRenderTarget(), mio = lienzo, objetivo = rt, img = imagen;
      try { renderer.setRenderTarget(objetivo); renderer.render(scene, cam); } finally { renderer.setRenderTarget(destino); } // with a target set, three does not use the XR camera
      leyendo = true;
      renderer.readRenderTargetPixelsAsync(objetivo, 0, 0, ESPEJO.ancho, ESPEJO.alto).then((d) => {
        if (lienzo !== mio) return; // switched off while the read was in flight
        pasarPixeles(d as Uint8Array, ESPEJO.ancho, ESPEJO.alto, o.backend === "WebGL2", img.data);
        mio.getContext("2d")!.putImageData(img, 0, 0); escritos++;
      }).catch(() => { /* a lost read is a lost frame */ }).finally(() => { leyendo = false; });
    },
  };
}
