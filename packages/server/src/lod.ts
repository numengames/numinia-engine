// lod (H13): the levels of detail of a model, made when the model comes in (the same moment optimizar.ts makes its lighter
// copy). meshoptimizer's simplifier takes the ORIGINAL file down to fewer triangles twice:
//   lod1  about half the triangles      lod2  about one seventh
// Each level is a whole .glb of its own (same nodes, same materials and textures, fewer triangles), stored beside the copy as
// datos/activos/optimizados/<sha256>.lod1.glb (+ .gz) and served at /a/<sha256>.lod1.glb (activos.ts). The page chooses by
// distance and size on screen (packages/render/src/lod-modelo.ts) and learns which levels exist from the zone manifest
// (manifiesto.ts, M16). A level is made only when it is worth the bytes and the loss is small:
//   - the model has at least LOD_TRIANGULOS_MIN triangles (a bench of 300 is cheap at any distance);
//   - it is still, with no animation, skin or morph target (a simplified mesh would no longer follow its bones);
//   - it uses nothing this library does not know, and does not come compressed (the original is what we read);
//   - the level keeps at most LOD_MAX_RELATIVO of the triangles of the level before (else it is not a step down);
//   - its box moves at most LOD_CAJA_MAX of the model's size (the simplifier is told an error, this checks it did keep to it).
// A model that fails any of these has no levels and keeps drawing as it did; the reason goes into the report line.

import { libreria } from "./optimizar.ts";
import type { Huella } from "./optimizar.ts";

/** Below this many triangles a model is not worth a second and a third file. */
export const LOD_TRIANGULOS_MIN = 1000;
/** A level must have at most this fraction of the triangles of the one before. */
export const LOD_MAX_RELATIVO = 0.8;
/** The box of a level may differ from the original's by this fraction of the model's largest side. */
export const LOD_CAJA_MAX = 0.1;
/** What each level asks of the simplifier: `ratio` of the vertices to keep, `error` allowed (a fraction of the mesh radius). */
export const NIVELES_LOD = [
  { nivel: 1, ratio: 0.5, error: 0.02 },
  { nivel: 2, ratio: 0.12, error: 0.06 },
] as const;

export type Lod = { nivel: number; bytes: Uint8Array; triangulos: number };
export type Lods = { lods: Lod[]; triangulos: number; motivo?: string };

type Lib = NonNullable<Awaited<ReturnType<typeof libreria>>>;

/** Triangles and box of what the file draws (scene graph, as optimizar.ts counts them). */
function medir(l: Lib, doc: InstanceType<Lib["core"]["Document"]>): Pick<Huella, "triangulos" | "min" | "max"> {
  let triangulos = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const escena of doc.getRoot().listScenes()) {
    escena.traverse((n) => {
      const m = n.getMesh();
      if (!m) return;
      for (const p of m.listPrimitives()) {
        if (p.getMode() !== l.core.Primitive.Mode.TRIANGLES) continue;
        triangulos += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3;
      }
    });
    const b = l.fns.getBounds(escena);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  }
  return { triangulos, min, max };
}

/** Why a model gets no levels (null = it may). */
function noSirve(l: Lib, doc: InstanceType<Lib["core"]["Document"]>): string | null {
  const root = doc.getRoot();
  if (root.listAnimations().length) return "tiene animaciones";
  if (root.listSkins().length) return "tiene esqueleto";
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.listTargets().length) return "tiene morph targets";
  return null;
}

/**
 * The levels of detail of a .glb (the original bytes), or none with why. Never throws. Each level is read from the original
 * again, not from the level before it: a simplification of a simplification piles up its errors.
 */
export async function generarLods(bytes: Uint8Array): Promise<Lods> {
  const vacio = (motivo: string, triangulos = 0): Lods => ({ lods: [], triangulos, motivo });
  const l = await libreria();
  if (!l) return vacio("falta la librería de optimizar (npm install)");
  try {
    const base = await l.io.readBinary(bytes);
    base.setLogger(new l.core.Logger(l.core.Logger.Verbosity.SILENT));
    const usadas = base.getRoot().listExtensionsUsed().map((e) => e.extensionName);
    if (usadas.includes("EXT_meshopt_compression") || usadas.includes("KHR_draco_mesh_compression")) return vacio("ya viene comprimido");
    const raras = usadas.filter((e) => !l.conocidas.has(e));
    if (raras.length) return vacio(`lleva extensiones que no conozco (${raras.join(", ")})`);
    const h0 = medir(l, base);
    if (h0.triangulos < LOD_TRIANGULOS_MIN) return vacio(`solo ${h0.triangulos} triángulos`, h0.triangulos);
    const no = noSirve(l, base);
    if (no) return vacio(no, h0.triangulos);
    const lado = Math.max(...h0.max.map((x, i) => x - h0.min[i]), 1e-6);
    const { MeshoptSimplifier, MeshoptEncoder } = l.mo;
    await MeshoptSimplifier.ready;
    const lods: Lod[] = [];
    let anterior = h0.triangulos, porque: string | undefined;
    for (const nv of NIVELES_LOD) {
      // First as it is. A flat-shaded model (a normal per face: low-poly, hard edges) comes out of weld() with every triangle on
      // its own island, and the simplifier will not touch an island's border: it removes nothing. For those, a second try
      // without the normals (welded by position, simplified, smooth normals computed again): from afar, which is all a level is for, it reads the same.
      let hecho: { out: Uint8Array; h: ReturnType<typeof medir> } | null = null;
      for (const liso of [false, true]) {
        const doc = await l.io.readBinary(bytes);
        doc.setLogger(new l.core.Logger(l.core.Logger.Verbosity.SILENT));
        if (liso) for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute("NORMAL", null);
        await doc.transform(
          l.fns.dedup(),
          l.fns.prune({ keepLeaves: true, keepAttributes: false, keepExtras: true, keepIndices: true }),
          l.fns.weld(),
          l.fns.simplify({ simplifier: MeshoptSimplifier, ratio: nv.ratio, error: nv.error }),
          ...(liso ? [l.fns.normals({ overwrite: true })] : []),
          l.fns.quantize({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14, quantizeColor: 10, quantizeWeight: 10, quantizeGeneric: 12 }),
          l.fns.reorder({ encoder: MeshoptEncoder, target: "size" }),
        );
        doc.createExtension(l.ext.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: l.ext.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
        const out = await l.io.writeBinary(doc);
        hecho = { out, h: medir(l, await l.io.readBinary(out)) }; // read back what we wrote: the check is on the real bytes
        if (hecho.h.triangulos <= anterior * LOD_MAX_RELATIVO) break;
      }
      const { out, h } = hecho!;
      if (h.triangulos > anterior * LOD_MAX_RELATIVO) { porque = `el nivel ${nv.nivel} solo baja a ${h.triangulos} de ${anterior} triángulos`; break; }
      if (h.triangulos < 1) { porque = `el nivel ${nv.nivel} se queda sin triángulos`; break; }
      const dif = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(h.min[i] - h0.min[i]), Math.abs(h.max[i] - h0.max[i])]));
      if (dif > lado * LOD_CAJA_MAX) { porque = `el nivel ${nv.nivel} mueve la caja ${(100 * dif / lado).toFixed(1)} % del modelo`; break; }
      lods.push({ nivel: nv.nivel, bytes: out, triangulos: h.triangulos });
      anterior = h.triangulos;
    }
    return { lods, triangulos: h0.triangulos, ...(porque && !lods.length ? { motivo: porque } : {}) };
  } catch (e) {
    return vacio(`no pude leerlo: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
