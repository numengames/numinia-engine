// agua-glifos (E51): the tiny glyph atlas the water's code is drawn from — 0/1, letters and house symbols (the relics of
// DISENO-LORE: ring-portal, lens-sphere, crescent blade, crystal teardrop, the three forces Umbral/Velo/Prisma…). Built once
// in code from 7×7 bitmaps (no font fetched, no image file): 8 × 5 cells of 16 px = a 128×80 R8 texture (10 KB; NPOT is
// fine: no mipmaps, clamped). Row 5 (Pablo 19-10) is PLANKTON, not code: diatom disc, ring, chain, rod, spiky
// dinoflagellate, pennate diatom, a triad and a cyst — the same texture, no new binding. Each texel
// keeps a soft distance to the glyph's pixels, so one bilinear read + a threshold gives clean edges at any size (the
// «glyph sheet» of Rezmason/matrix, MIT, there an MSDF; the per-cell random glyph pick is Doss's «glyph bombing», OpenGL
// Shading Language 2nd ed. §10.6). Index layout (what the shader's weighted pick relies on):
//   0–1 binaries · 2–15 letters · 16–31 house symbols · 32–39 plankton.
import * as THREE from "three/webgpu";

/** Cells per row/column of the atlas, and pixels per cell. */
export const ATLAS = { columnas: 8, filas: 5, celda: 16, escala: 2 } as const;
/** Where each family starts (shader + tests). */
export const FAMILIAS = { binarios: [0, 2], letras: [2, 16], simbolos: [16, 32], plancton: [32, 40] } as const;

const L = (s: string) => s.split("|");
/** 7×7 bitmaps, top row first; «#» = on. Letters are 5 wide, centred. */
export const GLIFOS: Record<string, string[]> = {
  "0": L(" ##### |##   ##|##  ###|## # ##|###  ##|##   ##| ##### "),
  "1": L("   #   |  ##   |   #   |   #   |   #   |   #   |  ###  "),
  A: L("  ###  | #   # | #   # | ##### | #   # | #   # | #   # "),
  E: L(" ##### | #     | #     | ####  | #     | #     | ##### "),
  K: L(" #   # | #  #  | # #   | ##    | # #   | #  #  | #   # "),
  N: L(" #   # | ##  # | # # # | #  ## | #   # | #   # | #   # "),
  M: L(" #   # | ## ## | # # # | #   # | #   # | #   # | #   # "),
  R: L(" ####  | #   # | #   # | ####  | # #   | #  #  | #   # "),
  U: L(" #   # | #   # | #   # | #   # | #   # | #   # |  ###  "),
  X: L(" #   # | #   # |  # #  |   #   |  # #  | #   # | #   # "),
  Z: L(" ##### |     # |    #  |   #   |  #    | #     | ##### "),
  H: L(" #   # | #   # | #   # | ##### | #   # | #   # | #   # "),
  T: L(" ##### |   #   |   #   |   #   |   #   |   #   |   #   "),
  Y: L(" #   # | #   # |  # #  |   #   |   #   |   #   |   #   "),
  S: L("  #### | #     | #     |  ###  |     # |     # | ####  "),
  V: L(" #   # | #   # | #   # | #   # | #   # |  # #  |   #   "),
  anillo: L("  ###  | #   # |#     #|#     #|#     #| #   # |  ###  "),
  lente: L("  ###  | #   # |#     #|#  #  #|#     #| #   # |  ###  "),
  creciente: L("  ###  | ##    |##     |##     |##     | ##    |  ###  "),
  lagrima: L("   #   |   #   |  # #  | #   # |#     #| #   # |  ###  "),
  prisma: L("   #   |  # #  |  # #  | #   # | #   # |#     #|#######"),
  umbral: L(" ##### |#     #|#     #|#     #|#     #|#     #|#     #"),
  velo: L(" #   # |#######| #   # | #   # | #   # |#######| #   # "),
  estrella: L("   #   |#  #  #| # # # |  ###  | # # # |#  #  #|   #   "),
  rombo: L("   #   |  # #  | #   # |#     #| #   # |  # #  |   #   "),
  flecha: L("       |    #  |     # |#######|     # |    #  |       "),
  ola: L("       | ##    |#  #  #|    ## | ##    |#  #  #|    ## "),
  lambda: L("#      | #     |  #    |  ##   | #  #  |#    # |#     #"),
  gafas: L("       |       |### ###|# ### #|### ###|       |       "),
  menor: L("    #  |   #   |  #    | #     |  #    |   #   |    #  "),
  mayor: L("  #    |   #   |    #  |     # |    #  |   #   |  #    "),
  barra: L("      #|     # |    #  |   #   |  #    | #     |#      "),
  // plankton (Pablo 19-10: «fitoplancton»): organic shapes, not code
  disco: L("  ###  | ##### |### ###|##   ##|### ###| ##### |  ###  "),
  aro: L("       |  ###  | #   # | #   # | #   # |  ###  |       "),
  cadena: L("##     |##     |  ##   |  ##   |    ## |    ## |       "),
  varilla: L("     ##|    ###|   ### |  ###  | ###   |###    |##     "),
  erizo: L("#  #  #| # # # |  ###  |#######|  ###  | # # # |#  #  #"),
  navicula: L("   #   |  ###  |  # #  |  # #  |  # #  |  ###  |   #   "),
  triada: L("  ##   |  ##   |       |##   ##|##   ##|       |       "),
  quiste: L("       |       |  ###  |  ###  |  ###  |       |       "),
};
/** Atlas order: binaries, letters, symbols (indices as FAMILIAS). */
export const ORDEN = ["0", "1", "A", "E", "K", "N", "M", "R", "U", "X", "Z", "H", "T", "Y", "S", "V",
  "anillo", "lente", "creciente", "lagrima", "prisma", "umbral", "velo", "estrella", "rombo", "flecha", "ola", "lambda", "gafas", "menor", "mayor", "barra",
  "disco", "aro", "cadena", "varilla", "erizo", "navicula", "triada", "quiste"] as const;

/** Value of the field at the glyph's edge (the shader thresholds a little under it). */
export const BORDE_GLIFO = 0.75;

/** The atlas pixels (R8, row 0 = bottom = v 0, as a DataTexture without flipY): 1 inside a glyph pixel, falling 1/4 per
 * texel outside it (0.75 on the edge, 0 three texels out). Pure; the texture is built from it. */
export function pixelesAtlas(): { datos: Uint8Array; ancho: number; alto: number } {
  const { columnas, filas, celda, escala } = ATLAS, ancho = columnas * celda, alto = filas * celda;
  const datos = new Uint8Array(ancho * alto), margen = (celda - 7 * escala) / 2;
  ORDEN.forEach((nombre, k) => {
    const g = GLIFOS[nombre], cx = (k % columnas) * celda, cy = Math.floor(k / columnas) * celda;
    const on: [number, number][] = [];
    for (let fy = 0; fy < 7; fy++) for (let fx = 0; fx < 7; fx++) if (g[fy][fx] === "#") on.push([margen + fx * escala, margen + (6 - fy) * escala]); // bottom-up
    for (let py = 0; py < celda; py++) for (let px = 0; px < celda; px++) {
      const x = px + 0.5, y = py + 0.5;
      let d = 1e9;
      for (const [ox, oy] of on) { const dx = Math.max(ox - x, 0, x - (ox + escala)), dy = Math.max(oy - y, 0, y - (oy + escala)); d = Math.min(d, Math.hypot(dx, dy)); }
      const v = d <= 0 ? 1 : Math.max(0, BORDE_GLIFO - d / 4);
      datos[(cy + py) * ancho + cx + px] = Math.round(v * 255);
    }
  });
  return { datos, ancho, alto };
}

let cache: THREE.DataTexture | null = null;
/** The shared atlas texture (one per page; never disposed by a water). */
export function atlasGlifos(): THREE.DataTexture {
  if (cache) return cache;
  const { datos, ancho, alto } = pixelesAtlas();
  const t = new THREE.DataTexture(datos, ancho, alto, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  t.name = "agua-glifos";
  return (cache = t);
}
