// transmision (N2-H1): a glTF glass with KHR_materials_transmission (Blender writes it by default when «Transmission» is
// on) froze the whole picture 12-14 s after loading, in three 0.186.1's WebGPURenderer on a real GPU: three draws
// every transmissive material from a shared viewport texture (RGBA16Float, canvas size) and, when the pipelines of the
// late-compiled materials were rebuilt, that texture was destroyed while a submit still used it («Destroyed texture
// [RGBA16Float 1280x720] used in a submit», ~1 300 times) and no frame was shown again. Measured with the v2 house of
// the crime-scene adventure (cache/scratch/n2/diag-vidrio.mjs): without this, 0 % of the pixels change when the camera
// turns at 25 s; with the glass turned into plain translucency, 51-69 % and 0 errors.
// Fix at the root of the load (every model of the page goes through gltf.ts' prepararGltf): a transmissive material
// becomes an ordinary translucent one with the opacity it would let the light through, and the console says so once
// per file. The look is a flat see-through glass (no refraction, no blur of what is behind): enough for windows and
// shower screens, and a world that needs real refraction can opt in later behind its own switch.
import type * as THREE from "three/webgpu";

/** The most see-through a degraded glass gets, and how much of the transmission turns into transparency. */
export const OPACIDAD_MIN = 0.15;
export const TRANSPARENCIA = 0.85;

/** Opacity of the plain translucent material that stands for `transmission` (0..1) over a base `opacidad` (0..1):
 * transmission 0 keeps the opacity, 1 leaves 15 % of it, in a straight line, never below OPACIDAD_MIN. Pure. */
export function opacidadEquivalente(transmission: number, opacidad = 1): number {
  const t = Number.isFinite(transmission) ? Math.min(1, Math.max(0, transmission)) : 0;
  const o = Number.isFinite(opacidad) ? Math.min(1, Math.max(0, opacidad)) : 1;
  return Math.min(o, Math.max(OPACIDAD_MIN, Math.round(o * (1 - TRANSPARENCIA * t) * 1000) / 1000));
}

/** True when the material asks for transmission (the only thing that makes three allocate the viewport texture). */
export function pideTransmision(m: THREE.Material): boolean {
  return (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial === true && ((m as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0;
}

/** Turns every transmissive material under `raiz` into a plain translucent one, in place. Returns the names of the
 * materials changed (each once, even when many meshes share it). */
export function degradarTransmision(raiz: THREE.Object3D): string[] {
  const hechos = new Set<THREE.Material>(), nombres: string[] = [];
  raiz.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (hechos.has(m) || !pideTransmision(m)) continue;
      hechos.add(m);
      const f = m as THREE.MeshPhysicalMaterial;
      f.opacity = opacidadEquivalente(f.transmission, f.opacity);
      f.transparent = true;
      f.depthWrite = false;
      f.transmission = 0;
      f.transmissionMap = null;
      f.thickness = 0;
      f.thicknessMap = null;
      f.needsUpdate = true;
      nombres.push(m.name || "(sin nombre)");
    }
  });
  return nombres;
}

/** What GLTFLoader's plugin hook needs: after the scene is built, degrade and warn once per file. */
export function registrarTransmision(loader: { register(cb: (parser: unknown) => unknown): unknown }, avisar: (texto: string) => void = (t) => console.warn(t)): void {
  loader.register(() => ({
    name: "NUMINIA_transmision",
    afterRoot(gltf: { scene?: THREE.Object3D; scenes?: THREE.Object3D[] }) {
      const nombres: string[] = [];
      for (const s of gltf.scenes?.length ? gltf.scenes : gltf.scene ? [gltf.scene] : []) nombres.push(...degradarTransmision(s));
      if (nombres.length) avisar(`[numinia] KHR_materials_transmission turned into plain translucency (it froze the picture on some GPUs): ${[...new Set(nombres)].join(", ")}`);
      return null;
    },
  }));
}
