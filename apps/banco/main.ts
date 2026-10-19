// banco de pruebas gráfico (v1) — the page. A fixed scene (the plaza the engine draws before any world: ground, 24
// pillars, sky colour, hemisphere + sun), a fixed camera path driven by the FRAME NUMBER (never the clock), and the
// techniques named in ?on= switched on over it (tecnicas.ts). `window.__banco.medir()` draws the path at each scale and
// returns, per frame: GPU ms (three's timestamp queries: WebGPU `timestamp-query`, or WebGL2
// EXT_disjoint_timer_query_webgl2), CPU ms of the render call, draw calls, triangles; plus renderer.info.memory at the
// end. tools/banco.mjs loads one page per configuration and does the statistics.
//
// Parameters: ?backend=webgpu|webgl2  ?on=niebla,sombras  ?nivel=A|B|C|D (default B)  ?tam=3360x1760 (default: the
// Quest 3's two eyes at render scale 100 %, 1680×1760 each)  ?cuadros=240  ?calentar=40
import * as THREE from "three/webgpu";
import { TECNICAS } from "./tecnicas.ts";
import type { Contexto, Montada } from "./tecnicas.ts";
import type { Nivel } from "../../packages/render/src/calidad.ts";

const q = new URLSearchParams(location.search);
const backendPedido = q.get("backend") === "webgl2" ? "WebGL2" : "WebGPU";
const nivel = (["A", "B", "C", "D"].includes(q.get("nivel") ?? "") ? q.get("nivel") : "B") as Nivel;
const [W, H] = (q.get("tam") ?? "3360x1760").split("x").map((x) => Math.max(16, Number(x) || 0));
const CUADROS = Math.max(10, Number(q.get("cuadros")) || 240);
const CALENTAR = Math.max(5, Number(q.get("calentar")) || 40);
// rt (default) = draw into an offscreen 4× MSAA target of the measured size: headless Chromium with
// --disable-vulkan-surface cannot show a WebGPU canvas (measured: blank), and XR draws into its own framebuffer anyway.
// canvas = draw to the page's canvas (WebGL2 shows it; for a headful check).
const SALIDA = q.get("salida") === "canvas" ? "canvas" : "rt";
const pedidas = (q.get("on") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const DT = 1 / 72; // the bench clock advances one Quest frame per drawn frame

type Resumen = { mediana: number; p95: number; media: number; min: number; max: number; n: number };
function resumen(xs: number[]): Resumen | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))];
  return { mediana: at(0.5), p95: at(0.95), media: v.reduce((a, b) => a + b, 0) / v.length, min: v[0], max: v[v.length - 1], n: v.length };
}

async function adaptador(): Promise<Record<string, unknown> | null> {
  // Measured 2026-10-19 (headless Chromium 1248 on Linux/NVIDIA): the FIRST requestAdapter() of a page can answer null
  // while Dawn starts; the second one gets the GPU. three asks only once and then silently falls back to WebGL2, so ask
  // here first until there is an adapter (the browser keeps it warm for three's own request).
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(o?: object): Promise<{ info: Record<string, unknown>; features: Set<string> } | null> } }).gpu;
  if (!gpu) return null;
  for (let i = 0; i < 6; i++) {
    const a = await gpu.requestAdapter({ powerPreference: "high-performance", featureLevel: "compatibility" }).catch(() => null);
    if (a) { const inf = a.info ?? {}; return { vendor: inf.vendor, architecture: inf.architecture, description: inf.description, isFallbackAdapter: inf.isFallbackAdapter, timestampQuery: a.features.has("timestamp-query"), intentos: i + 1 }; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

const estado: { listo: boolean; error?: string; info?: Record<string, unknown> } = { listo: false };
(window as unknown as { __banco: unknown }).__banco = { estado, medir, tecnicas: () => [...TECNICAS.values()].map(({ id, nombre, origen }) => ({ id, nombre, origen })) };

let renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
const montadas: Array<{ id: string; m: Montada }> = [];
let reloj = 0;

async function iniciar(): Promise<void> {
  const desconocidas = pedidas.filter((id) => !TECNICAS.has(id));
  if (desconocidas.length) throw new Error(`técnica(s) desconocida(s): ${desconocidas.join(", ")}; hay: ${[...TECNICAS.keys()].join(", ")}`);
  const adapt = backendPedido === "WebGPU" ? await adaptador() : null;
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backendPedido === "WebGL2", powerPreference: "high-performance", trackTimestamp: true });
  await renderer.init();
  const be = renderer.backend as unknown as { isWebGPUBackend?: boolean; trackTimestamp?: boolean; gl?: WebGL2RenderingContext };
  const backend = be.isWebGPUBackend ? "WebGPU" : "WebGL2";
  let gpuNombre = "";
  if (be.gl) { const e = be.gl.getExtension("WEBGL_debug_renderer_info"); gpuNombre = String(be.gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : be.gl.RENDERER)); }
  else if (adapt) gpuNombre = [adapt.vendor, adapt.architecture, adapt.description].filter(Boolean).join(" / ");
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.domElement.style.width = "100vw"; renderer.domElement.style.height = "auto";
  document.body.appendChild(renderer.domElement);
  // the engine turns the shadow map on at start (entorno.ts: turning it on later recompiles everything); each light decides
  renderer.shadowMap.enabled = true;
  renderer.info.autoReset = false;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 400);
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(6, 12, 4);
  scene.add(sol, sol.target);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xa7b89c }));
  suelo.rotation.x = -Math.PI / 2;
  world.add(suelo);
  const pilar = new THREE.BoxGeometry(1, 3, 1), paleta = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];
  const mats = paleta.map((c) => new THREE.MeshStandardMaterial({ color: c }));
  for (let i = 0; i < 24; i++) { // the plaza's landmarks (index.ts), same positions
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(pilar, mats[i % 4]);
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    world.add(p);
  }
  const ctx: Contexto = { renderer, scene, world, camera, sol, nivel };
  for (const id of pedidas) montadas.push({ id, m: await TECNICAS.get(id)!.montar(ctx) });
  ponerCamara(0);
  await renderer.compileAsync(scene, camera);
  estado.info = { backendPedido, backend, salida: SALIDA, gpu: gpuNombre, adaptador: adapt, timestamps: !!be.trackTimestamp, nivel, tam: [W, H], cuadros: CUADROS, calentar: CALENTAR, on: pedidas, three: THREE.REVISION, userAgent: navigator.userAgent };
  estado.listo = true;
}

/** The fixed path: a walk at eye height on a 14 m circle around the plaza's centre, looking across it, so the
 * techniques' spots (fires, travel lights near the centre, the pond 22 m out) and the pillars and far ground (fog
 * range) behind them pass through the view. Frame number only, so every run draws the same frames. */
function ponerCamara(i: number): void {
  const a = (i / CUADROS) * Math.PI * 2;
  camera.position.set(Math.cos(a) * 14, 1.7, Math.sin(a) * 14);
  camera.lookAt(Math.cos(a + Math.PI) * 4, 1.0, Math.sin(a + Math.PI) * 4);
}

function cuadro(i: number): void {
  reloj += DT;
  for (const { m } of montadas) m.cuadro?.(DT, reloj);
  ponerCamara(i);
}

/** three's timestamp pool for render passes (WebGPU or WebGL2 backend): its `timestamps` map is uid → ms of the last resolve. */
function pool(): { timestamps?: Map<string, number> } | undefined {
  return (renderer.backend as unknown as { timestampQueryPool?: Record<string, { timestamps?: Map<string, number> }> }).timestampQueryPool?.render;
}

/** Copy the offscreen target into a visible 2D canvas so a screenshot shows what was measured (colours approximate). */
async function foto(rt: THREE.RenderTarget): Promise<void> {
  const w = rt.width, h = rt.height;
  const px = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h)) as Uint8Array;
  const c = (document.getElementById("foto") as HTMLCanvasElement | null) ?? Object.assign(document.createElement("canvas"), { id: "foto" });
  c.width = w; c.height = h; c.style.cssText = "position:fixed;inset:0;width:100vw;height:auto";
  const fila = px.length >= w * h * 4 + (h - 1) * 4 ? Math.ceil((w * 4) / 256) * 256 : w * 4; // WebGPU pads rows to 256 bytes
  const limpio = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) limpio.set(px.subarray(y * fila, y * fila + w * 4), y * w * 4);
  const img = new ImageData(limpio, w, h);
  const x = c.getContext("2d")!; x.putImageData(img, 0, 0);
  if (backendGL()) { x.save(); x.scale(1, -1); x.drawImage(c, 0, -h); x.restore(); } // WebGL reads bottom-up
  document.body.appendChild(c);
}
const backendGL = () => !(renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend;

async function medir(o: { escalas?: number[] } = {}): Promise<unknown> {
  const escalas = o.escalas ?? [1, 0.5];
  const porEscala: Record<string, unknown> = {};
  for (const e of escalas) {
    let rt: THREE.RenderTarget | null = null;
    if (SALIDA === "rt") {
      rt = new THREE.RenderTarget(Math.round(W * e), Math.round(H * e), { samples: 4, depthBuffer: true });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      renderer.setRenderTarget(rt);
    } else { renderer.setPixelRatio(e); renderer.setSize(W, H, false); }
    // warm-up: shaders, the shadow map's first allocation, buffers; then the timestamp pool is emptied
    for (let i = 0; i < CALENTAR; i++) { cuadro(i); renderer.info.reset(); renderer.render(scene, camera); await renderer.resolveTimestampsAsync("render"); }
    const pasadas: Record<string, number[]> = {};
    const gpu: number[] = [], cpu: number[] = [], llamadas: number[] = [], triangulos: number[] = [], logica: number[] = [];
    for (let i = 0; i < CUADROS; i++) {
      const t0 = performance.now();
      cuadro(i);
      const t1 = performance.now();
      renderer.info.reset(); // own frame boundaries: three resets info only on its rAF tick, not per render() call
      renderer.render(scene, camera);
      const t2 = performance.now();
      llamadas.push(renderer.info.render.drawCalls); triangulos.push(renderer.info.render.triangles);
      const g = await renderer.resolveTimestampsAsync("render"); // ms of every render pass of this frame (shadow pass included)
      logica.push(t1 - t0); cpu.push(t2 - t1);
      if (typeof g === "number" && g > 0) gpu.push(g);
      for (const [uid, ms] of pool()?.timestamps ?? []) { const k = String(uid).replace(/^r:\d+:/, "").replace(/:f\d+$/, ""); (pasadas[k] ??= []).push(ms); }
    }
    // cross-check that needs no GPU timer: the same path drawn back to back with ONE wait for the GPU at the end.
    // ms per frame = max(CPU, GPU) per frame once the queue is full; if a GPU timer says more than this, the timer lies.
    let rafaga: number | null = null;
    if (rt) {
      await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1); // start empty
      const r0 = performance.now();
      for (let i = 0; i < CUADROS; i++) { cuadro(i); renderer.info.reset(); renderer.render(scene, camera); }
      await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1); // returns when every frame above is done on the GPU
      rafaga = (performance.now() - r0) / CUADROS;
      await renderer.resolveTimestampsAsync("render");
    }
    const tamReal = new THREE.Vector2();
    if (rt) tamReal.set(rt.width, rt.height); else renderer.getDrawingBufferSize(tamReal);
    if (rt) { if (e === escalas[0]) await foto(rt); renderer.setRenderTarget(null); rt.dispose(); }
    porEscala[String(e)] = { escala: e, px: [tamReal.x, tamReal.y], gpuMs: resumen(gpu), cpuRenderMs: resumen(cpu), cpuTecnicasMs: resumen(logica), drawCalls: resumen(llamadas), triangulos: resumen(triangulos), cuadrosConGpu: gpu.length, rafagaMs: rafaga,
      pasadas: Object.fromEntries(Object.entries(pasadas).map(([k, v]) => [k, resumen(v)?.mediana])) };
  }
  if (SALIDA === "rt") renderer.setPixelRatio(1);
  const mem = renderer.info.memory as unknown as Record<string, number>;
  const cuentas: Record<string, unknown> = {};
  for (const { id, m } of montadas) cuentas[id] = m.cuenta ?? {};
  return { info: estado.info, porEscala, memoria: { ...mem }, cuentas };
}

iniciar().catch((err) => { estado.error = String(err?.stack ?? err); console.error(err); });
