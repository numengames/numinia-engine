// colision-mundo (M6 h8): the server's wiring that turns every `malla` thing in the shared state into the world's
// `sim.mesh`. For each thing whose state says `colision: "malla"`: read its .glb bytes (`leerActivo`, the world's
// own files — the house library or an upload, never the page), its triangles (`colision-glb.ts`, no three.js),
// moved into world space by its place/turn/scale (`transformarPuntos`, packages/feature — the same rotation
// `cajaEnMundo` uses for a box: R-1, one piece of maths). Every `malla` thing's triangles are concatenated, then
// quantized and built into one BVH (packages/sim): the one tree `Instance.rayo`, `groundHeight` and `blockedMesh`
// all read. Called off the sim tick (packages/instance/src/index.ts `reconstruirMalla`): never inside `step`, so a
// slow .glb never costs a tick. Not part of the fingerprint, like the solid boxes of U10.
import { triangulosDeGlb, TRIANGULOS_MAX_MALLA } from "./colision-glb.ts";
import { quantizeTriangles, buildBvh } from "../../sim/src/index.ts";
import type { Bvh } from "../../sim/src/index.ts";
import { transformarPuntos } from "../../feature/src/index.ts";

/** Reads the bytes of /a/<sha256>.<ext> on this server (the house library or an upload), or null — the server's own
 * files, never trusted from a page. `packages/server/src/server.ts` passes `(h, ext) => activos.buscar(h, ext)`
 * read from disk. */
export type LeerActivo = (sha256: string, ext: string) => Uint8Array | null;

/** How many `malla` things one world mesh takes at once (each is a .glb read and parsed): keeps a rebuild light;
 * a world with more just keeps the first ones in state-key order (same order `solidsFrom` caps SOLIDS_MAX at). */
export const MALLA_OBJETOS_MAX = 64;

const esSha256 = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/** Builds the `construirMalla` the instance calls (InstanceOptions): one BVH from every readable `malla` thing in
 * the shared state, or null when there is none (or none of them could be read). Never throws: a thing whose .glb
 * cannot be read or parsed is skipped (logged by the caller through `instance`'s own catch), the rest still builds. */
export function construirMalla(leerActivo: LeerActivo): (objetos: Iterable<[string, Record<string, unknown>]>) => Promise<Bvh | null> {
  return async (objetos) => {
    const candidatos = [...objetos].filter(([, v]) => v.colision === "malla").slice(0, MALLA_OBJETOS_MAX);
    if (!candidatos.length) return null;
    const vertices: number[] = [], indices: number[] = [];
    for (const [, o] of candidatos) {
      const modelo = String(o.modelo ?? ""), ext = String(o.ext ?? "glb");
      if (!esSha256(modelo)) continue; // a house-library id (not a hash) has no file to read: no malla for it yet
      const bytes = leerActivo(modelo, ext);
      if (!bytes) continue; // uploaded elsewhere, or not on this server (yet)
      const r = await triangulosDeGlb(bytes, { max: TRIANGULOS_MAX_MALLA });
      if (!r.ok) continue; // Draco, sparse, too many triangles… skip this one thing, keep the rest
      const base = vertices.length / 3, mundo = transformarPuntos(r.value.vertices, o);
      for (let i = 0; i < mundo.length; i++) vertices.push(mundo[i]);
      for (let i = 0; i < r.value.indices.length; i++) indices.push(base + r.value.indices[i]);
    }
    if (!indices.length) return null;
    return buildBvh(quantizeTriangles(Float64Array.from(vertices), Uint32Array.from(indices)));
  };
}
