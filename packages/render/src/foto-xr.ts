// foto-xr (MIS-222 t_b83d8aef): one photo of what the headset sees. Inside an XR session three draws into the layer's
// framebuffer, never into the page's canvas, so the photo mode's canvas read (apps/plaza/foto.ts) would come out empty.
// Like the Graboso's mirror (espejo-xr.ts) this re-renders the SAME scene once into a render target from the head's
// pose — the point between the eyes, never the left eye alone — and reads it back; the page frames it and saves it.
// The VR furniture (watch, menu, notices, the rig's help card, «Salir», dialogue, comfort vignette, hands) is hidden for that one draw: a photo of the world,
// not of its buttons. Nothing runs until `sacar()` is called: no target, no camera, one null check per frame.
import * as THREE from "three/webgpu";
import { pasarPixeles } from "./espejo-xr.ts";

/** 1280×720 (16:9, a third more pixels than the Graboso's mirror: a still, drawn once). */
export const FOTO_XR = { ancho: 1280, alto: 720, fov: 75, esperaMs: 4000, compilaMs: 20000 } as const;

type P3 = { x: number; y: number; z: number };
/** The head: the point halfway between the eyes (the left eye alone sits ~3 cm to the side). Pure, so a test can run it. */
export function centroDeOjos(ojos: readonly P3[]): P3 {
  if (!ojos.length) return { x: 0, y: 0, z: 0 };
  const s = ojos.reduce((a, o) => ({ x: a.x + o.x, y: a.y + o.y, z: a.z + o.z }), { x: 0, y: 0, z: 0 });
  return { x: s.x / ojos.length, y: s.y / ojos.length, z: s.z / ojos.length };
}

export type FotoXR = {
  /** Asks for a photo; it is drawn right after the next XR frame. Rejects when no frame comes (visor off, session ended). */
  sacar(): Promise<HTMLCanvasElement>;
  /** True while a photo is waiting for its frame. */
  pendiente(): boolean;
  /** Call right after the XR frame was drawn (scene still in its drawn state). Returns at once when nothing was asked. */
  cuadro(): void;
};

export function crearFotoXR(o: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; backend: "WebGPU" | "WebGL2"; ocultar: () => (THREE.Object3D | null | undefined)[] }): FotoXR {
  const { renderer, scene } = o;
  type Espera = { promesa: Promise<HTMLCanvasElement>; ok: (c: HTMLCanvasElement) => void; mal: (e: Error) => void; listo: boolean; leyendo: boolean; rt: THREE.RenderTarget | null; cam: THREE.PerspectiveCamera | null; reloj: ReturnType<typeof setTimeout> | null };
  let espera: Espera | null = null;
  const cerrar = (e: Espera) => { if (e.reloj) clearTimeout(e.reloj); e.rt?.dispose(); e.rt = null; if (espera === e) espera = null; };
  return {
    pendiente: () => !!espera,
    sacar() {
      if (espera) return espera.promesa;
      let ok!: Espera["ok"], mal!: Espera["mal"];
      const promesa = new Promise<HTMLCanvasElement>((a, b) => { ok = a; mal = b; });
      const e: Espera = { promesa, ok, mal, listo: false, leyendo: false, rt: null, cam: null, reloj: null };
      espera = e;
      const plazo = (ms: number, why: string) => { if (e.reloj) clearTimeout(e.reloj); e.reloj = setTimeout(() => { if (espera === e) { cerrar(e); mal(new Error(why)); } }, ms); };
      plazo(FOTO_XR.compilaMs, "la vista no se preparó a tiempo");
      void (async () => {
        const rt = new THREE.RenderTarget(FOTO_XR.ancho, FOTO_XR.alto), cam = new THREE.PerspectiveCamera(FOTO_XR.fov, FOTO_XR.ancho / FOTO_XR.alto, 0.05, 2000);
        const destino = renderer.getRenderTarget();
        try { renderer.setRenderTarget(rt); await renderer.compileAsync(scene, cam); } catch { /* it will compile on its first draw */ } finally { renderer.setRenderTarget(destino); }
        if (espera !== e) { rt.dispose(); return; } // timed out meanwhile
        e.rt = rt; e.cam = cam; e.listo = true;
        plazo(FOTO_XR.esperaMs, "el visor no dio ningún cuadro"); // from here on, only the wait for a frame counts
      })();
      return promesa;
    },
    cuadro() {
      const e = espera;
      if (!e || !e.listo || e.leyendo || !e.rt || !e.cam) return;
      const xr = renderer.xr.getCamera().cameras ?? [];
      if (!xr.length) return;
      const cam = e.cam, rt = e.rt;
      const c = centroDeOjos(xr.map((v) => new THREE.Vector3().setFromMatrixPosition(v.matrixWorld)));
      const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      xr[0].matrixWorld.decompose(p, q, s); // the eyes look the same way; the left one's turn is the head's
      cam.position.set(c.x, c.y, c.z); cam.quaternion.copy(q); cam.scale.set(1, 1, 1); cam.updateMatrixWorld(true);
      const ocultos = o.ocultar().filter((x): x is THREE.Object3D => !!x && x.visible);
      for (const x of ocultos) x.visible = false;
      const destino = renderer.getRenderTarget();
      try { renderer.setRenderTarget(rt); renderer.render(scene, cam); } finally { renderer.setRenderTarget(destino); for (const x of ocultos) x.visible = true; }
      e.leyendo = true;
      renderer.readRenderTargetPixelsAsync(rt, 0, 0, FOTO_XR.ancho, FOTO_XR.alto).then((d) => {
        const lienzo = document.createElement("canvas"); lienzo.width = FOTO_XR.ancho; lienzo.height = FOTO_XR.alto;
        const img = new ImageData(FOTO_XR.ancho, FOTO_XR.alto);
        pasarPixeles(d as Uint8Array, FOTO_XR.ancho, FOTO_XR.alto, o.backend === "WebGL2", img.data);
        lienzo.getContext("2d")!.putImageData(img, 0, 0);
        cerrar(e); e.ok(lienzo);
      }).catch((err) => { cerrar(e); e.mal(err instanceof Error ? err : new Error(String(err))); });
    },
  };
}
