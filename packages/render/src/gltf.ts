// gltf (N22): the one glTF loader setup every model of the page goes through (things of the world, house models,
// avatars). Besides plain glTF it reads what the engine's own optimizer writes (packages/server/src/optimizar.ts) and
// what a builder may upload already compressed:
//   EXT_meshopt_compression + KHR_mesh_quantization   three's meshopt decoder (JS + wasm inside it, ~20 kB gz)
//   KHR_texture_basisu (KTX2 textures)                three's KTX2Loader + the Basis transcoder, served by the page
//                                                     itself from /basis/ (copied from three at build: vite.config)
// Nothing is fetched from a CDN. Draco is NOT read (its decoder is 300 kB more and the engine never writes it: a Draco
// model fails with a clear message and the slot stays empty, as before). The decoders arrive only with the loader,
// and the transcoder only when a KTX2 texture does.
import type * as THREE from "three/webgpu";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Where the page serves the Basis transcoder (basis_transcoder.js + .wasm). */
export const BASIS_DIR = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"}basis/`;

let renderer: THREE.WebGPURenderer | null = null;
let ktx2: Promise<unknown> | null = null;
/** The renderer the KTX2 textures are made for (which GPU formats it takes); set once by the page's view. */
export function usarRenderer(r: THREE.WebGPURenderer): void { renderer = r; }

/** The KTX2 loader, made once and shared (one transcoder worker pool for the whole page). */
function cargadorKtx2(): Promise<unknown> {
  return (ktx2 ??= import("three/addons/loaders/KTX2Loader.js").then(async ({ KTX2Loader }) => {
    const k = new KTX2Loader().setTranscoderPath(BASIS_DIR).setWorkerLimit(1);
    try { if (renderer) await k.detectSupportAsync(renderer as never); } catch { /* no renderer yet: it transcodes to RGBA */ }
    return k;
  }));
}

type Carga = (url: string, ok: (t: unknown) => void, progreso?: (e: ProgressEvent) => void, mal?: (e: unknown) => void) => void;
/** What GLTFLoader asks of its KTX2 loader (only `load`, in loadImageSource): the real one (24 kB gz + the
 * transcoder) is fetched the first time a KTX2 texture appears, so a world without them never downloads it. */
const ktx2Perezoso = {
  load: ((url, ok, progreso, mal) => {
    void cargadorKtx2().then((k) => (k as { load: Carga }).load(url, ok, progreso, mal)).catch((e) => mal?.(e));
  }) as Carga,
};

/** A GLTFLoader that reads meshopt and KTX2 (the caller registers its own plugins after, as VRM does). */
export async function prepararGltf(loader: GLTFLoader): Promise<GLTFLoader> {
  const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2Perezoso as never);
  return loader;
}
