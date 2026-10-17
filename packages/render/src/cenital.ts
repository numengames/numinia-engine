// cenital (J5): the zone seen from above — the big map's background — and the footprints of what stands in it.
// Two ways to the same picture (`ImagenCenital`):
// - "gpu": an orthographic camera renders the world once into a small render target and the pixels are read back
//   (renderer.readRenderTargetPixelsAsync: WebGPU, and three's WebGL2 backend). The real look: lights, colours, models.
// - "huellas": each thing's footprint (its bounding box, in its colour) painted on a 2D canvas. No GPU work: the
//   fallback when readback fails, and the minimap's landmarks.
// Only what is marked `userData.mapa` is drawn: "suelo" (ground, grid: picture only) or true (pillars, things placed).
// People, labels, beacons, gizmos, skies… stay out: people are live markers the page draws, the rest is not the zone.
// Cost: called rarely (when the big map opens and things changed, throttled by the page); measured by the e2e leg.
// U14 — a world that says `mapa.corte` (m) gets a floor plan instead of its roofs: the camera's near plane drops to
// that height (the same projection in WebGL2 and WebGPU: no clipping planes, no new shaders) and the walls and columns
// the plane cuts come as segments (`seccion`, `cristal`; corte.ts), which the page draws as lines over the picture: a
// picture from straight above cannot show a cut wall, its faces are edge-on.
import * as THREE from "three/webgpu";
import { cortarMalla, bajoElCorte } from "./corte.ts";

export type Huella = { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; color: string };
/** A picture of the zone from above: north (-z) up, east (+x) right, covering x0..x1 × z0..z1 metres. `rgba` = its
 * pixels (sRGB, rows from the top), kept so reading a colour never asks the GPU again; `fondo` = the ground's colour
 * (CSS), to paint beyond the picture's edge. With `corte` (m): everything above it left out, and the cut as segments
 * x0, z0, x1, z1 (metres): `seccion` (walls, columns, frames) and `cristal` (see-through: glass). */
export type ImagenCenital = { canvas: HTMLCanvasElement; rgba: Uint8ClampedArray; fondo: string; x0: number; z0: number; x1: number; z1: number; modo: "gpu" | "huellas"; ms: number; px: number; conCosas: number; partes?: Record<string, number>; error?: string;
  corte: number; seccion?: Float32Array; cristal?: Float32Array };

const ALTO = 80;              // camera height (m); things taller than this are cut at the top (a map does not mind)
const SUELO = "#a7b89c";      // the ground's colour, for the footprint picture
const COSA = "#6b5b4b";       // things whose material is a texture (glTF models): a neutral brown
const LADO_MIN = 24, LADO_MAX = 256, MARGEN = 10; // half-side of the picture (m): around what stands in the zone
const TRIANGULOS_MAX = 2_000_000; // U14: the cut looks at no more triangles than this (the TRG26 Nave: 142k, 3–6 ms)

// three keeps render targets in linear colour; the canvas wants sRGB
const SRGB = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) { const c = i / 255; SRGB[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); }

/** The most common colour (the ground) and how many pixels are not it: a picture with things in it is not empty. Looks
 * at one pixel in four and scales the count (it only has to tell «empty» from «something»). */
export function analizarPixeles(rgba: Uint8ClampedArray | Uint8Array): { conCosas: number; fondo: string } {
  const cuenta = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 16) { const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4); cuenta.set(k, (cuenta.get(k) ?? 0) + 1); }
  let max = 0, total = 0, clave = 0;
  for (const [k, n] of cuenta) { total += n; if (n > max) { max = n; clave = k; } }
  const canal = (s: number) => (((clave >> s) & 15) << 4) + 8;
  return { conCosas: (total - max) * 4, fondo: `rgb(${canal(8)},${canal(4)},${canal(0)})` };
}

/** Part of the zone: the ground and grid ("suelo"), landmarks (true) and things placed (named `objeto:<key>`). */
const esZona = (o: THREE.Object3D): boolean => !!o.userData.mapa || o.name.startsWith("objeto:");
const esCosa = (o: THREE.Object3D): boolean => o.userData.mapa === true || (o.userData.mapa === undefined && o.name.startsWith("objeto:"));

export function crearCenital(renderer: THREE.WebGPURenderer, scene: THREE.Scene, world: THREE.Object3D, backend: "WebGPU" | "WebGL2") {
  const caja = new THREE.Box3();
  const colorDe = (o: THREE.Object3D): string => {
    let c: string | null = null;
    o.traverse((ch) => {
      const m = (ch as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!c && m && !Array.isArray(m) && m.color && !m.map) c = `#${m.color.getHexString()}`;
    });
    return c ?? COSA;
  };

  /** Footprints of what stands in the zone (pillars, things placed), from their bounding boxes. */
  function huellas(): Huella[] {
    const out: Huella[] = [];
    for (const o of world.children) {
      if (!esCosa(o) || !o.visible) continue;
      caja.setFromObject(o);
      if (caja.isEmpty()) { const p = o.position; out.push({ x0: p.x - 0.5, z0: p.z - 0.5, x1: p.x + 0.5, z1: p.z + 0.5, y0: p.y, y1: p.y, color: COSA }); continue; } // model still loading
      out.push({ x0: caja.min.x, z0: caja.min.z, x1: caja.max.x, z1: caja.max.z, y0: caja.min.y, y1: caja.max.y, color: colorDe(o) });
    }
    return out;
  }

  /** U14: where the plane y = `corte` cuts the meshes of what stands in the zone (corte.ts), split into what you see
   * through (glass) and the rest. Meshes nobody sees (alpha 0, invisible helpers), skinned and instanced ones stay out. */
  function seccionar(corte: number): { seccion: Float32Array; cristal: Float32Array; triangulos: number } {
    const muro: number[] = [], vidrio: number[] = [];
    let triangulos = 0;
    const invisible = (m: THREE.Material) => !m.visible || m.colorWrite === false || m.opacity < 0.05 || (m.alphaTest > 0 && m.opacity < m.alphaTest);
    for (const o of world.children) {
      if (!esCosa(o) || !o.visible) continue;
      o.updateWorldMatrix(true, true);
      o.traverseVisible((ch) => {
        const me = ch as THREE.Mesh;
        if (!me.isMesh || (me as THREE.SkinnedMesh).isSkinnedMesh || (me as THREE.InstancedMesh).isInstancedMesh || triangulos > TRIANGULOS_MAX) return;
        const mats = Array.isArray(me.material) ? me.material : [me.material], mat = mats.find((m) => m && !invisible(m));
        const geo = me.geometry, attr = geo?.attributes.position;
        if (!mat || !attr) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        caja.copy(geo.boundingBox!).applyMatrix4(me.matrixWorld);
        if (caja.min.y > corte || caja.max.y < corte) return;
        const plano = attr as THREE.BufferAttribute;
        let pos: ArrayLike<number> = plano.array;
        if ((attr as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || plano.normalized || attr.itemSize !== 3 || !(plano.array instanceof Float32Array)) {
          const p = new Float32Array(attr.count * 3); // interleaved or quantized positions: read them one by one
          for (let i = 0; i < attr.count; i++) { p[i * 3] = attr.getX(i); p[i * 3 + 1] = attr.getY(i); p[i * 3 + 2] = attr.getZ(i); }
          pos = p;
        }
        const idx = geo.index ? geo.index.array : null;
        triangulos += (idx ? idx.length : attr.count) / 3;
        cortarMalla(pos, idx, me.matrixWorld.elements, corte, mat.transparent && mat.opacity < 0.6 ? vidrio : muro);
      });
    }
    return { seccion: Float32Array.from(muro), cristal: Float32Array.from(vidrio), triangulos };
  }

  /** The square the picture covers: what stands in the zone (and `incluir`, e.g. you) plus a margin. */
  function marco(hs: Huella[], incluir?: { x: number; z: number }) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const mete = (a: number, b: number, c: number, d: number) => { x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d); };
    for (const h of hs) mete(h.x0, h.z0, h.x1, h.z1);
    if (incluir) mete(incluir.x, incluir.z, incluir.x, incluir.z);
    if (!Number.isFinite(x0)) { x0 = z0 = -1; x1 = z1 = 1; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const medio = Math.min(LADO_MAX, Math.max(LADO_MIN, Math.max(x1 - x0, z1 - z0) / 2 + MARGEN));
    return { cx, cz, medio };
  }

  function pintarHuellas(px: number, m: { cx: number; cz: number; medio: number }, hs: Huella[]): HTMLCanvasElement {
    const c = document.createElement("canvas"); c.width = c.height = px;
    const g = c.getContext("2d", { willReadFrequently: true })!, k = px / (2 * m.medio), X = (x: number) => (x - (m.cx - m.medio)) * k, Z = (z: number) => (z - (m.cz - m.medio)) * k;
    g.fillStyle = SUELO; g.fillRect(0, 0, px, px);
    g.strokeStyle = "rgba(60,72,55,0.25)"; g.lineWidth = 1;
    for (let x = Math.ceil((m.cx - m.medio) / 10) * 10; x <= m.cx + m.medio; x += 10) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), px); g.stroke(); }
    for (let z = Math.ceil((m.cz - m.medio) / 10) * 10; z <= m.cz + m.medio; z += 10) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(px, Z(z)); g.stroke(); }
    for (const h of hs) { g.fillStyle = h.color; g.fillRect(X(h.x0), Z(h.z0), Math.max(1, (h.x1 - h.x0) * k), Math.max(1, (h.z1 - h.z0) * k)); }
    return c;
  }

  async function pintarGpu(px: number, m: { cx: number; cz: number; medio: number }, partes: Record<string, number>, corte = 0): Promise<{ canvas: HTMLCanvasElement; rgba: Uint8ClampedArray }> {
    let t = performance.now();
    const marca = (k: string) => { const a = performance.now(); partes[k] = Math.round((a - t) * 10) / 10; t = a; };
    const rt = new THREE.RenderTarget(px, px);
    // U14: with a cut the near plane sits at its height: what is above is not drawn (a floor plan, not the roof)
    const cam = new THREE.OrthographicCamera(-m.medio, m.medio, m.medio, -m.medio, corte > 0 ? ALTO - corte : 0.1, ALTO + 1);
    cam.up.set(0, 0, -1); cam.position.set(m.cx, ALTO, m.cz); cam.lookAt(m.cx, 0, m.cz); cam.updateMatrixWorld();
    // hide what is not the zone (people, labels, beacons, gizmos, skies) and push the fog away; all put back at once.
    // U14: a floor plan has no shadows (the roof's would cross the floor): the lights' shadow intensity is a uniform
    // (ShadowNode reads it by reference, three r186: no shader changes), set to 0 for this picture only
    const aparte = (): (() => void) => {
      const ocultos: THREE.Object3D[] = [], sombras: [THREE.LightShadow, number][] = [];
      for (const o of scene.children) if (o !== world && !(o as THREE.Light).isLight && o.visible) { o.visible = false; ocultos.push(o); }
      for (const o of world.children) if (!esZona(o) && o.visible) { o.visible = false; ocultos.push(o); }
      if (corte > 0) scene.traverse((o) => { const s = (o as THREE.DirectionalLight).shadow; if ((o as THREE.Light).isLight && o.castShadow && s) { sombras.push([s, s.intensity]); s.intensity = 0; } });
      const niebla = scene.fog as (THREE.Fog & THREE.FogExp2) | null, antes = niebla && { near: niebla.near, far: niebla.far, density: niebla.density };
      if (niebla) { if (niebla.isFog) { niebla.near = 1e5; niebla.far = 2e5; } else niebla.density = 0; }
      return () => {
        for (const o of ocultos) o.visible = true;
        for (const [s, i] of sombras) s.intensity = i;
        if (niebla && antes) { if (niebla.isFog) { niebla.near = antes.near; niebla.far = antes.far; } else niebla.density = antes.density; }
      };
    };
    const destino = renderer.getRenderTarget();
    try {
      // the render target needs its own shaders: compile them first without blocking the page (the first opening
      // stalled for 0.2-1.4 s in software GL); the frames drawn meanwhile see the world as it was
      let volver = aparte(), compilar: Promise<unknown> | undefined;
      try { renderer.setRenderTarget(rt); compilar = renderer.compileAsync(scene, cam); } finally { renderer.setRenderTarget(destino); volver(); }
      await compilar?.catch(() => undefined);
      marca("compilarMs");
      volver = aparte();
      try { renderer.setRenderTarget(rt); renderer.render(scene, cam); } finally { renderer.setRenderTarget(destino); volver(); }
      marca("dibujarMs");
      const datos = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, px, px)) as Uint8Array;
      marca("leerMs");
      const fila = datos.length >= px * px * 4 && datos.length < px * px * 4 + 256 ? px * 4 : Math.ceil((px * 4) / 256) * 256; // WebGPU pads rows to 256 bytes
      const c = document.createElement("canvas"); c.width = c.height = px;
      const g = c.getContext("2d")!, img = g.createImageData(px, px), d = img.data;
      const deAbajo = backend === "WebGL2"; // WebGL reads rows from the bottom; WebGPU from the top
      for (let y = 0; y < px; y++) {
        const src = (deAbajo ? px - 1 - y : y) * fila, dst = y * px * 4;
        for (let x = 0; x < px * 4; x += 4) { d[dst + x] = SRGB[datos[src + x]]; d[dst + x + 1] = SRGB[datos[src + x + 1]]; d[dst + x + 2] = SRGB[datos[src + x + 2]]; d[dst + x + 3] = 255; }
      }
      g.putImageData(img, 0, 0);
      marca("copiarMs");
      return { canvas: c, rgba: d };
    } finally { rt.dispose(); }
  }

  return {
    huellas,
    /** Changes when something in the zone moves, appears, goes or finishes loading (the page regenerates then). */
    version(): number {
      let v = 0;
      for (const o of world.children) if (esCosa(o)) v += 1 + o.position.x * 7.31 + o.position.z * 3.17 + o.position.y + o.rotation.y * 5.3 + o.scale.x * 2.9 + o.children.length * 11 + (o.visible ? 0 : 13);
      return Math.round(v * 100) / 100;
    },
    /** A picture of the zone from above, `px` pixels square (a multiple of 64: 256 on phones, 512 elsewhere). The GPU
     * path draws the real world; when it fails (or in XR, or `modo: "huellas"`) the footprints are painted instead.
     * `corte` (m, U14): a floor plan cut at that height — nothing above it, no footprint taller than it, the cut's
     * segments in `seccion`/`cristal`; 0 or absent = the zone as it always was. */
    async generar(o: { px?: number; incluir?: { x: number; z: number }; modo?: "gpu" | "huellas"; corte?: number } = {}): Promise<ImagenCenital> {
      const t0 = performance.now(), px = Math.max(64, Math.round((o.px ?? 512) / 64) * 64), corte = Math.max(0, Math.min(ALTO - 1, o.corte ?? 0));
      const hs = huellas(), m = marco(hs, o.incluir), partes: Record<string, number> = {};
      let hecho: { canvas: HTMLCanvasElement; rgba: Uint8ClampedArray } | null = null, modo: ImagenCenital["modo"] = "huellas", error: string | undefined;
      if (o.modo !== "huellas" && !renderer.xr.isPresenting) {
        try { hecho = await pintarGpu(px, m, partes, corte); modo = "gpu"; } catch (e) { error = String((e as Error)?.message ?? e).slice(0, 160); }
      }
      if (!hecho) { const canvas = pintarHuellas(px, m, bajoElCorte(hs, corte)); hecho = { canvas, rgba: canvas.getContext("2d")!.getImageData(0, 0, px, px).data }; }
      const t1 = performance.now(), { conCosas, fondo } = analizarPixeles(hecho.rgba);
      partes.contarMs = Math.round((performance.now() - t1) * 10) / 10;
      let corteHecho: { seccion?: Float32Array; cristal?: Float32Array } = {};
      if (corte > 0) {
        const t2 = performance.now(), s = seccionar(corte);
        partes.seccionMs = Math.round((performance.now() - t2) * 10) / 10;
        partes.triangulos = s.triangulos; partes.segmentos = (s.seccion.length + s.cristal.length) / 4;
        corteHecho = { seccion: s.seccion, cristal: s.cristal };
      }
      return { canvas: hecho.canvas, rgba: hecho.rgba, fondo, x0: m.cx - m.medio, z0: m.cz - m.medio, x1: m.cx + m.medio, z1: m.cz + m.medio, modo, ms: Math.round((performance.now() - t0) * 10) / 10, px, conCosas, partes, ...(error ? { error } : {}), corte, ...corteHecho };
    },
  };
}
