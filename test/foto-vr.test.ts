// photo mode inside VR (MIS-222 t_b83d8aef): the headset's view is not the page's canvas, so a picture is one extra draw of the
// scene from the head's pose (packages/render/src/foto-xr.ts). Here with a fake renderer: what is drawn, from where, with the VR
// furniture hidden for that draw only, and what the caller gets back. The PNG with its frame in a real XR session: tools/e2e-piernas/foto-vr.mjs.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { centroDeOjos, crearFotoXR, FOTO_XR } from "../packages/render/src/foto-xr.ts";

// a canvas / ImageData the node run can hold (the module only sets sizes and puts pixels)
const llamadas: string[] = [];
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: () => { llamadas.push("put"); } }) }) };
(globalThis as any).ImageData = class { data: Uint8ClampedArray; width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };

const ojo = (x: number, y: number, z: number) => { const c = new THREE.PerspectiveCamera(); c.matrixWorld.makeTranslation(x, y, z); return c; };
function renderFalso(ojos: THREE.Camera[]) {
  const reg: { dibujos: { objetivo: unknown; pos: THREE.Vector3; ocultoAlDibujar: boolean[] }[]; objetivo: unknown } = { dibujos: [], objetivo: null };
  let objetivoActual: unknown = null;
  const observados: THREE.Object3D[] = [];
  const r = {
    xr: { getCamera: () => ({ cameras: ojos }) },
    getRenderTarget: () => objetivoActual, setRenderTarget: (t: unknown) => { objetivoActual = t; },
    compileAsync: async () => { llamadas.push("compile"); },
    render: (_s: unknown, cam: THREE.Camera) => { reg.dibujos.push({ objetivo: objetivoActual, pos: new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), ocultoAlDibujar: observados.map((o) => !o.visible) }); },
    readRenderTargetPixelsAsync: async (_rt: unknown, _x: number, _y: number, w: number, h: number) => new Uint8Array(w * h * 4),
  };
  return { r: r as unknown as THREE.WebGPURenderer, reg, observados };
}
const esperarListo = () => new Promise((ok) => setTimeout(ok, 5));

test("the head is the point halfway between the eyes, not the left eye", () => {
  assert.deepEqual(centroDeOjos([{ x: -0.03, y: 1.6, z: 0 }, { x: 0.03, y: 1.6, z: 0 }]), { x: 0, y: 1.6, z: 0 });
  assert.deepEqual(centroDeOjos([{ x: 1, y: 2, z: 3 }]), { x: 1, y: 2, z: 3 });
  assert.deepEqual(centroDeOjos([]), { x: 0, y: 0, z: 0 });
});

test("one picture: nothing is drawn until it is asked; then ONE draw into its own target from the head, VR furniture hidden only for that draw", async () => {
  const { r, reg, observados } = renderFalso([ojo(9.97, 1.6, 4), ojo(10.03, 1.6, 4)]);
  const reloj = new THREE.Mesh(), menu = new THREE.Mesh(); observados.push(reloj, menu);
  const foto = crearFotoXR({ renderer: r, scene: new THREE.Scene(), backend: "WebGL2", ocultar: () => [reloj, menu, null] });
  foto.cuadro(); // an XR frame with nothing asked
  assert.equal(foto.pendiente(), false);
  assert.equal(reg.dibujos.length, 0, "no draw without a request");

  const p = foto.sacar();
  assert.equal(foto.pendiente(), true);
  assert.equal(foto.sacar(), p, "asking twice while one is on its way gives the same promise");
  foto.cuadro(); // the target is not ready yet (its shaders compile first): nothing drawn
  assert.equal(reg.dibujos.length, 0);
  await esperarListo();
  foto.cuadro();
  const c = (await p) as unknown as { width: number; height: number };
  assert.equal(reg.dibujos.length, 1, "exactly one extra draw");
  assert.notEqual(reg.dibujos[0].objetivo, null, "into its own target, never the XR layer's");
  assert.ok(Math.abs(reg.dibujos[0].pos.x - 10) < 1e-6 && Math.abs(reg.dibujos[0].pos.y - 1.6) < 1e-6 && Math.abs(reg.dibujos[0].pos.z - 4) < 1e-6, "from between the eyes");
  assert.deepEqual(reg.dibujos[0].ocultoAlDibujar, [true, true], "watch and menu are not in the picture");
  assert.ok(reloj.visible && menu.visible, "and they are back right after");
  assert.equal(c.width, FOTO_XR.ancho); assert.equal(c.height, FOTO_XR.alto);
  assert.equal(foto.pendiente(), false, "done: nothing left to do on later frames");
  foto.cuadro();
  assert.equal(reg.dibujos.length, 1);
});

test("a visor that gives no frame rejects instead of waiting for ever", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { r } = renderFalso([]); // XR session with no eye cameras yet
    const foto = crearFotoXR({ renderer: r, scene: new THREE.Scene(), backend: "WebGL2", ocultar: () => [] });
    const p = foto.sacar(); const vista = assert.rejects(p, /ningún cuadro|no se preparó/);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // the compile step settles (microtasks)
    mock.timers.tick(FOTO_XR.compilaMs + 1);
    await vista;
    assert.equal(foto.pendiente(), false);
  } finally { mock.timers.reset(); }
});

test("the picture is always 16:9 and modest (a still, not a stream)", () => {
  assert.ok(Math.abs(FOTO_XR.ancho / FOTO_XR.alto - 16 / 9) < 0.01);
  assert.ok(FOTO_XR.ancho * FOTO_XR.alto <= 1920 * 1080);
});
