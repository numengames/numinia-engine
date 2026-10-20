// E05 · PP1 pase de salida (work/saber-3d/concepts/pase-de-salida-quest.md). Pregunta: ¿el pase implícito de
// tono+espacio de color (needsFrameBufferTarget en Renderer.js r186) cuesta algo?
//
// Clave que main.ts del banco general NO puede dar: ese banco dibuja siempre a un RenderTarget propio sin
// marcarlo como «de salida» (sin setOutputRenderTarget), así que `isOutputTarget` es falso, `currentToneMapping`
// se fuerza a NoToneMapping y el pase JAMÁS se activa, pase lo que pase con `renderer.toneMapping`. Para medir el
// pase real (el que ve la pantalla o el framebuffer de XR) hay que llamar `renderer.setOutputRenderTarget(rt)`
// antes de renderizar a ese `rt`. Por eso esta técnica va en su propia página/renderer (ficha de la cola E05).
//
// ?modo=actual|directa|byte  ?cuadros=240  ?calentar=40  ?w=3360 ?h=1760  ?backend=webgpu (fijo: PP1 es un pase de
// three en el pipeline de salida; WebGL2 no tiene needsFrameBufferTarget con la misma forma y no es el backend de Quest).
import * as THREE from "three/webgpu";

const q = new URLSearchParams(location.search);
const MODO = (["actual", "directa", "byte"].includes(q.get("modo") ?? "") ? q.get("modo") : "actual") as "actual" | "directa" | "byte";
const W = Math.max(16, Number(q.get("w")) || 3360), H = Math.max(16, Number(q.get("h")) || 1760);
const CUADROS = Math.max(10, Number(q.get("cuadros")) || 240);
const CALENTAR = Math.max(5, Number(q.get("calentar")) || 40);
const DT = 1 / 72;

// Los tres ajustes de la ficha PP1: «actual» = lo que aplica hoy entorno.ts (Neutral + salida sRGB, R7.1);
// «directa» = sin tono y con el espacio de salida igual al de trabajo (para que needsFrameBufferTarget dé falso);
// «byte» = igual que «actual» pero con outputBufferType UnsignedByte (solo se fija en el constructor).
const AJUSTES: Record<string, { tono: THREE.ToneMapping; espacio: string; byte: boolean }> = {
  actual: { tono: THREE.NeutralToneMapping, espacio: THREE.SRGBColorSpace, byte: false },
  directa: { tono: THREE.NoToneMapping, espacio: THREE.ColorManagement.workingColorSpace, byte: false },
  byte: { tono: THREE.NeutralToneMapping, espacio: THREE.SRGBColorSpace, byte: true },
};

type Resumen = { mediana: number; p95: number; p99: number; min: number; max: number; n: number };
function resumen(xs: number[]): Resumen | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))];
  return { mediana: at(0.5), p95: at(0.95), p99: at(0.99), min: v[0], max: v[v.length - 1], n: v.length };
}

async function adaptador(): Promise<void> {
  // same warm-up as apps/banco/main.ts: the first requestAdapter() of a page can return null while Dawn starts.
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(o?: object): Promise<unknown> } }).gpu;
  if (!gpu) return;
  for (let i = 0; i < 6; i++) { if (await gpu.requestAdapter({ powerPreference: "high-performance" }).catch(() => null)) return; await new Promise((r) => setTimeout(r, 150)); }
}

const estado: { listo: boolean; error?: string; info?: Record<string, unknown>; resultado?: unknown } = { listo: false };
(window as unknown as { __exp05: unknown }).__exp05 = { estado };

/** Bare scene, same shapes as apps/banco/main.ts's "base" (ground + 24 pillars + hemi + sun): comparable order of
 * magnitude, though this page's renderer/output path is different on purpose. */
function escena(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.6);
  scene.add(hemi);
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(6, 12, 4);
  scene.add(sol, sol.target);
  const sueloMalla = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xa7b89c }));
  sueloMalla.rotation.x = -Math.PI / 2;
  scene.add(sueloMalla);
  const pilar = new THREE.BoxGeometry(1, 3, 1), paleta = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];
  const mats = paleta.map((c) => new THREE.MeshStandardMaterial({ color: c }));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(pilar, mats[i % 4]);
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    scene.add(p);
  }
  return { scene, camera };
}

function ponerCamara(camera: THREE.PerspectiveCamera, i: number): void {
  const a = (i / CUADROS) * Math.PI * 2;
  const x = Math.cos(a) * 14, z = Math.sin(a) * 14, mx = Math.cos(a + Math.PI) * 4, mz = Math.sin(a + Math.PI) * 4;
  camera.position.set(x, 1.7, z);
  camera.lookAt(mx, 1.0, mz);
}

function pool(renderer: THREE.WebGPURenderer): { timestamps?: Map<string, number> } | undefined {
  return (renderer.backend as unknown as { timestampQueryPool?: Record<string, { timestamps?: Map<string, number> }> }).timestampQueryPool?.render;
}

async function medir(): Promise<unknown> {
  await adaptador();
  const aj = AJUSTES[MODO];
  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: "high-performance", trackTimestamp: true, outputBufferType: aj.byte ? THREE.UnsignedByteType : THREE.HalfFloatType });
  await renderer.init();
  const be = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  if (!be.isWebGPUBackend) throw new Error("exp-05: WebGPU no disponible en este navegador (necesario para medir el pase de salida de PP1)");
  renderer.info.autoReset = false;
  renderer.toneMapping = aj.tono;
  renderer.outputColorSpace = aj.espacio;
  const esperaPase = renderer.toneMapping !== THREE.NoToneMapping || renderer.outputColorSpace !== THREE.ColorManagement.workingColorSpace;

  const { scene, camera } = escena();
  const rt = new THREE.RenderTarget(W, H, { samples: 4, depthBuffer: true });
  renderer.setOutputRenderTarget(rt); // mark this target as THE output: without this, isOutputTarget is false and
  // currentToneMapping/currentColorSpace are forced to NoToneMapping/working space — the pass never runs (what the
  // shared apps/banco/main.ts measures by accident, see file header).
  renderer.setRenderTarget(rt);

  ponerCamara(camera, 0);
  await renderer.compileAsync(scene, camera);
  for (let i = 0; i < CALENTAR; i++) { ponerCamara(camera, i); renderer.info.reset(); renderer.render(scene, camera); await renderer.resolveTimestampsAsync("render"); }

  const gpu: number[] = [], cpu: number[] = [], llamadas: number[] = [], triangulos: number[] = [];
  for (let i = 0; i < CUADROS; i++) {
    ponerCamara(camera, i);
    const t0 = performance.now();
    renderer.info.reset();
    renderer.render(scene, camera);
    const t1 = performance.now();
    llamadas.push(renderer.info.render.drawCalls); triangulos.push(renderer.info.render.triangles);
    const g = await renderer.resolveTimestampsAsync("render");
    cpu.push(t1 - t0);
    if (typeof g === "number" && g > 0) gpu.push(g);
  }
  // control sin temporizador: la misma pasada seguida, una sola espera final a la GPU
  await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1);
  const r0 = performance.now();
  for (let i = 0; i < CUADROS; i++) { ponerCamara(camera, i); renderer.info.reset(); renderer.render(scene, camera); }
  await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1);
  const rafaga = (performance.now() - r0) / CUADROS;

  const pasadas: Record<string, number[]> = {};
  for (const [uid, ms] of pool(renderer)?.timestamps ?? []) { const k = String(uid).replace(/^r:\d+:/, "").replace(/:f\d+$/, ""); (pasadas[k] ??= []).push(ms); }

  renderer.setRenderTarget(null);
  rt.dispose();
  return {
    modo: MODO, esperaPase, outputBufferType: aj.byte ? "UnsignedByte" : "HalfFloat", toneMapping: String(aj.tono), outputColorSpace: aj.espacio,
    gpuMs: resumen(gpu), cpuRenderMs: resumen(cpu), drawCalls: resumen(llamadas), triangulos: resumen(triangulos), rafagaMs: rafaga, cuadrosConGpu: gpu.length,
    memoria: { ...renderer.info.memory }, pasadas: Object.fromEntries(Object.entries(pasadas).map(([k, v]) => [k, resumen(v)?.mediana])),
  };
}

medir().then((r) => { estado.resultado = r; estado.listo = true; }).catch((err) => { estado.error = String(err?.stack ?? err); estado.listo = true; console.error(err); });
