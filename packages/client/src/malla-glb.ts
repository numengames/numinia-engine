// malla-glb (M6 h9): the page builds the same GLB collision mesh the server does, so its prediction stands on the same floor.
// Without it the local sim (the one that replays the inputs the server has not acknowledged yet) has no floor under a
// `colision: "malla"` thing: the server says «standing at y = 4», the replay of 4–11 pending inputs lets gravity pull the
// body down to 2.4–3.8, and every snapshot snaps it back (a jittering, sinking player; tools/e2e-piernas/malla.mjs).
// Same recipe as packages/server/src/colision-mundo.ts (a test pins that both give the same triangles): the triangles of the
// .glb (packages/sim/src/colision-glb.ts, a separate chunk loaded only when a world has a `malla` thing), moved into
// world space by the thing's place/turn/scale, quantized, one tree. The bytes come from `leer` (the page fetches /a/<sha>.<ext>);
// a thing whose file cannot be read yet is left out and `falta` is true so the caller tries again on the next change.
import { quantizeTriangles, buildBvh } from "../../sim/src/index.ts";
import type { Bvh } from "../../sim/src/index.ts";
import { transformarPuntos } from "../../feature/src/index.ts";

export type ConstruirMallaCliente = (entradas: readonly [string, Record<string, unknown>][]) => Promise<{ mesh: Bvh | null; falta: boolean }>;
export type LeerGlb = (sha256: string, ext: string) => Promise<Uint8Array | null>;
/** The server's own cap (packages/server/src/colision-mundo.ts MALLA_OBJETOS_MAX) and triangle cap (colision-glb.ts). */
const MALLA_OBJETOS_MAX = 64, TRIANGULOS_MAX_MALLA = 50_000;
const esSha256 = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/**
 * H13 + M16: the url the page reads a `malla` thing's collision from — ALWAYS the whole model, `/a/<sha256>.<ext>`. The drawing may
 * have picked `/a/<sha256>.lod1.glb` or `.lod2.glb` for a far thing (packages/render/src/lod-modelo.ts `ficheroDeNivel`), and
 * lighter levels move vertices by more than the quantization of the sim, so a floor built from one would not be the server's floor.
 * Pure: the page and test/malla-cliente.test.ts both go through here. Null when the thing names no readable file.
 */
export function urlColision(origen: string, sha256: string, ext: string): string | null {
  if (!esSha256(sha256) || !/^[a-z0-9]{2,5}$/.test(ext) || /^lod\d*$/.test(ext)) return null;
  return `${origen}/a/${sha256}.${ext}`;
}

/**
 * The reader `construirMallaCliente` takes: the whole model by `urlColision`, through the page's file store first (`leerTienda` =
 * tienda.leer: the Cache API by sha256, and a download checked against the manifest's sha256 — the same bytes the drawing holds,
 * never downloaded twice), and when the store does not manage the file (no manifest, or not listed) a plain fetch as it always was.
 * A refused hash (store throws) is NOT retried with a plain fetch: a file that does not match its sha256 is not a floor.
 */
export function lectorColision(origen: string, leerTienda: ((url: string) => Promise<ArrayBuffer | null>) | null, pedir: typeof fetch): LeerGlb {
  return async (sha256, ext) => {
    const url = urlColision(origen, sha256, ext);
    if (!url) return null;
    try {
      const b = leerTienda ? await leerTienda(url) : null;
      if (b) return new Uint8Array(b);
      const r = await pedir(url);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    } catch { return null; }
  };
}

/** One BVH from every readable `malla` entry, or null. Never throws. `falta`: some file was not readable (yet). */
export async function construirMallaCliente(entradas: readonly [string, Record<string, unknown>][], leer: LeerGlb): Promise<{ mesh: Bvh | null; falta: boolean }> {
  let falta = false;
  const vertices: number[] = [], indices: number[] = [];
  const { triangulosDeGlb } = await import("../../sim/src/colision-glb.ts");
  for (const [, o] of entradas.slice(0, MALLA_OBJETOS_MAX)) {
    const modelo = String(o.modelo ?? ""), ext = String(o.ext ?? "glb");
    if (!esSha256(modelo)) continue;
    let bytes: Uint8Array | null = null;
    try { bytes = await leer(modelo, ext); } catch { bytes = null; }
    if (!bytes) { falta = true; continue; }
    const r = await triangulosDeGlb(bytes, { max: TRIANGULOS_MAX_MALLA });
    if (!r.ok) continue;
    const base = vertices.length / 3, mundo = transformarPuntos(r.value.vertices, o as never);
    for (let i = 0; i < mundo.length; i++) vertices.push(mundo[i]);
    for (let i = 0; i < r.value.indices.length; i++) indices.push(base + r.value.indices[i]);
  }
  if (!indices.length) return { mesh: null, falta };
  return { mesh: buildBvh(quantizeTriangles(Float64Array.from(vertices), Uint32Array.from(indices))), falta };
}
