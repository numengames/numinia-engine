// posproceso (H12b): bloom and ambient occlusion as a three RenderPipeline. LOADED ONLY when a person on level A switches an effect on
// (index.ts imports this file lazily, and it in turn fetches BloomNode / GTAONode only for the effects asked): the start bundle does not
// grow (D2) and no phone or headset ever downloads it. It draws the scene with the SAME camera and the renderer's own tone mapping and
// colour space (RenderPipeline.outputColorTransform), so the picture differs only by the effects.
// COPIED from: three r186 examples webgpu_postprocessing_ao (prePass with normals MRT → GTAONode → builtinAOContext on the scene pass) and
// webgpu_postprocessing_bloom (scene colour + bloom(scene colour, strength, radius, threshold)).
// CHANGED: AO runs at half resolution (resolutionScale 0.5); bloom is mild and only takes what is brighter than 0.9 so the plain world does not glow.
import * as THREE from "three/webgpu";
import { pass, mrt, normalView, screenUV, builtinAOContext } from "three/tsl";
import type { Efectos } from "./calidad.ts";

type Nodo = ReturnType<typeof pass>;
export type Posproceso = {
  /** (Re)build the pipeline for these effects (bloom and/or ao). Loads the node modules the first time each is asked. */
  construir(e: Pick<Efectos, "bloom" | "ao">): Promise<void>;
  /** Draw one frame through the pipeline. */
  dibujar(): void;
  /** Drop the pipeline (its render targets and materials). */
  soltar(): void;
  readonly construido: { bloom: boolean; ao: boolean };
};

export function crearPosproceso(h: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; camera: THREE.Camera }): Posproceso {
  let pipeline: THREE.RenderPipeline | null = null;
  const construido = { bloom: false, ao: false };
  let version = 0;
  async function construir(e: Pick<Efectos, "bloom" | "ao">): Promise<void> {
    const mia = ++version;
    // the node modules are chunks of their own: fetched here, only for what is asked
    const [bloomMod, aoMod] = await Promise.all([
      e.bloom ? import("three/addons/tsl/display/BloomNode.js") : null,
      e.ao ? import("three/addons/tsl/display/GTAONode.js") : null,
    ]);
    if (mia !== version) return; // a newer request came while the chunks came
    const escena: Nodo = pass(h.scene, h.camera);
    if (aoMod) {
      const previo = pass(h.scene, h.camera);
      previo.setMRT(mrt({ output: normalView }));
      const ao = aoMod.ao(previo.getTextureNode("depth"), previo.getTextureNode(), h.camera);
      ao.resolutionScale = 0.5;
      escena.contextNode = builtinAOContext(ao.getTextureNode().sample(screenUV).r);
    }
    let salida: unknown = escena;
    if (bloomMod) {
      const color = escena.getTextureNode();
      salida = color.add(bloomMod.bloom(color, 0.35, 0.4, 0.9));
    }
    const anterior = pipeline;
    const nuevo = new THREE.RenderPipeline(h.renderer);
    (nuevo as unknown as { outputNode: unknown }).outputNode = salida;
    pipeline = nuevo; construido.bloom = !!bloomMod; construido.ao = !!aoMod;
    anterior?.dispose();
  }
  return {
    construir,
    dibujar() { if (pipeline) pipeline.render(); else h.renderer.render(h.scene, h.camera); },
    soltar() { version++; pipeline?.dispose(); pipeline = null; construido.bloom = false; construido.ao = false; },
    construido,
  };
}
