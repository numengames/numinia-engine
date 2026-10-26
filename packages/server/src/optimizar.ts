// optimizar (N22): a world's .glb made lighter WITHOUT changing how it looks, so a phone on 4G gets the world in
// half the bytes or less. Same scene, same materials, same textures; only how the geometry is stored changes:
//   dedup (identical meshes/materials/accessors once) · prune (what nothing uses; leaves, attributes and extras kept)
//   · weld (identical vertices once) · quantize (16-bit positions ≈ 1/65,000 of the model's size, 12-bit normals,
//   14-bit UVs: KHR_mesh_quantization) · reorder for the vertex cache · EXT_meshopt_compression on every buffer.
// The page decodes it with three.js' own meshopt decoder (packages/render, no CDN). On the wire it is also gzipped.
//
// The ORIGINAL file never changes and keeps its name (objects point to its sha256): the lighter copy lives beside it in
// datos/activos/optimizados/<sha256>.glb (+ .glb.gz) and /a/<sha256>.glb serves that one (activos.ts). Delete the
// folder and the world serves the originals again; the world zip carries only the originals.
//
// A file is left as it is (null + why) when: it already comes compressed (meshopt, Draco), it carries extensions this
// library does not know (VRM avatars: it would drop them), it is not a valid glb, the result is not 10 % smaller, or the
// check after (same bounds, same triangles drawn, same nodes, textures, animations) does not hold.
// Pictures: a PNG (an image object, or a texture inside a .glb) becomes LOSSLESS WebP — the same pixels, checked by
// decoding it back — when that is 10 % smaller; in a .glb through EXT_texture_webp. A PNG with a colour profile or a
// gamma (iCCP, gAMA, cHRM), 16 bits per channel or animated stays: a browser could show it differently. JPEG and KTX2
// stay as they come (re-encoding them would change them; KTX2 is read by the page when a model brings it).
// Tier copies (t_dee4d0eb): beside that, every picture (png, jpg, webp) bigger than a device tier's size (limits.json image_px_max:
// 2048 / 1024 / 512 px on the longest side) gets a smaller copy per tier it exceeds — lossy WebP, quality 82, same proportion —
// that /a/<sha256>.<ext>?px=1024 sends (activos.ts), so a Quest downloads a 1024 px picture instead of the 2048 px one it will only
// ever show at 1024. The original is never touched; a picture with its own colour profile (or animated) gets none. JPEG goes through
// @jsquash/jpeg's decoder (mozjpeg, wasm, Apache-2.0, 166 kB, no native build) and the shrinking is plain JS (area average, below).
// No pixel library with native code: @gltf-transform/functions' ndarray-pixels is replaced by an empty package
// (tools/vacio/ndarray-pixels), so neither sharp nor libvips (LGPL) is installed; PNG and WebP go through @jsquash's
// wasm (Apache-2.0: squoosh's codecs, libwebp BSD). Licences: MIT (gltf-transform, meshoptimizer, property-graph,
// ktx-parse, ndarray*), Apache-2.0 (@jsquash/*, wasm-feature-detect) — `npm ls` lists them.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IMAGEN_PX_COPIAS, medidasImagen } from "../../net/src/ficheros.ts";

/** Below this a file is not worth a second copy. */
export const AHORRO_MIN = 0.10;
/** What the quantization keeps (bits). 16-bit positions: 1.5 mm on a 100 m hall. */
export const BITS = { quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14, quantizeColor: 10, quantizeWeight: 10, quantizeGeneric: 12 } as const;

export type Huella = { triangulos: number; nodos: number; texturas: number; animaciones: number; min: number[]; max: number[] };
export type Resultado = { bytes: Uint8Array | null; antes: number; despues: number; ms: number; motivo?: string; huella?: Huella;
  /** The copy's kind when it is not the original's (a PNG's copy is a WebP). */
  ext?: string; webp?: number;
  /** The per-tier copies of a picture (see «Tier copies»); `[]` when it needs none. Undefined = not a picture. */
  copias?: CopiaPx[]; copiasMotivo?: string;
  /** H13: the levels of detail made from the original (lod.ts); only for a .glb. */
  lods?: import("./lod.ts").Lods };

/** A smaller copy of a picture: its longest side is `px` (or less), lossy WebP. */
export type CopiaPx = { px: number; ancho: number; alto: number; bytes: Uint8Array };
/** WebP quality of a tier copy: the copy is only ever looked at (never edited), shrunk 2-4x, where 82 is invisible. */
export const CALIDAD_COPIA = 82;
/** Most pixels decoded to make the copies (4096×4096: the biggest hole picture, a RGBA frame of 64 MB, and a copy of a few). */
export const PIXELES_MAX_COPIA = 4096 * 4096;

// ---- pictures: PNG → lossless WebP ----

/** Why a PNG must stay as it is (null = it may become WebP): not a PNG, colour profile/gamma, 16 bits, animated. */
export function pngQueSeQueda(b: Uint8Array): string | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || firma.some((x, i) => b[i] !== x)) return "no es un PNG";
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[24] === 16) return "16 bits por canal";
  for (let o = 8; o + 8 <= b.length;) {
    const n = dv.getUint32(o), tipo = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    if (tipo === "iCCP" || tipo === "gAMA" || tipo === "cHRM") return `lleva ${tipo} (color o gamma propios)`;
    if (tipo === "acTL") return "es animado";
    if (tipo === "IEND") break;
    o += 12 + n;
  }
  return null;
}

type Rgba = { data: Uint8ClampedArray; width: number; height: number };
type Codecs = { aWebpCopia: (i: unknown) => Promise<ArrayBuffer>; png: (b: Uint8Array) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>; aWebp: (i: unknown) => Promise<ArrayBuffer>; deWebp: (b: ArrayBuffer) => Promise<{ data: Uint8ClampedArray; width: number; height: number }> };
let codecs: Promise<Codecs | null> | null = null;
const wasm = (m: string) => readFileSync(fileURLToPath(import.meta.resolve(m)));
/** @jsquash's PNG decoder and WebP coder (wasm), loaded on first use; null = not installed. */
function cargarCodecs(): Promise<Codecs | null> {
  return (codecs ??= (async () => {
    const [png, enc, dec] = await Promise.all([import("@jsquash/png/decode.js"), import("@jsquash/webp/encode.js"), import("@jsquash/webp/decode.js")]);
    await png.init(wasm("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));
    let simd = true;
    try { await enc.init(new WebAssembly.Module(wasm("@jsquash/webp/codec/enc/webp_enc_simd.wasm"))); } catch { simd = false; }
    if (!simd) await enc.init(new WebAssembly.Module(wasm("@jsquash/webp/codec/enc/webp_enc.wasm")));
    await dec.init(new WebAssembly.Module(wasm("@jsquash/webp/codec/dec/webp_dec.wasm")));
    return { aWebpCopia: (i: unknown) => enc.default(i as never, { lossless: 0, quality: CALIDAD_COPIA, method: 4 }), png: (b) => png.default(b) as never, aWebp: (i) => enc.default(i as never, { lossless: 1, quality: 100, method: 4, exact: 1 }), deWebp: (b) => dec.default(b) as never };
  })().catch(() => null));
}

let jpeg: Promise<((b: ArrayBuffer) => Promise<Rgba>) | null> | null = null;
/** @jsquash/jpeg's decoder (wasm), loaded on first use; null = not installed. The EXIF turn is applied by the decoder, as a browser does. */
function cargarJpeg(): Promise<((b: ArrayBuffer) => Promise<Rgba>) | null> {
  return (jpeg ??= (async () => {
    const dec = await import("@jsquash/jpeg/decode.js");
    await dec.init(new WebAssembly.Module(wasm("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm")));
    return (b: ArrayBuffer) => dec.default(b) as never;
  })().catch(() => null));
}

/** Why a JPEG must stay as it is (null = it may get tier copies): not a JPEG, or it carries a colour profile (APP2 ICC_PROFILE). */
export function jpgQueSeQueda(b: Uint8Array): string | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return "no es un JPEG";
  for (let o = 2; o + 4 <= b.length;) {
    if (b[o] !== 0xff) return null;
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; } // fill bytes
    if (m === 0xda || m === 0xd9) return null; // the picture's data starts: no profile before it
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { o += 2; continue; } // markers without a length
    const n = (b[o + 2] << 8) | b[o + 3];
    if (m === 0xe2 && String.fromCharCode(...b.subarray(o + 4, o + 15)) === "ICC_PROFILE") return "lleva un perfil de color (ICC)";
    o += 2 + n;
  }
  return null;
}

/** Why a WebP must stay as it is (null = it may get tier copies): not a WebP, animated, or with a colour profile (ICCP). */
export function webpQueSeQueda(b: Uint8Array): string | null {
  if (b.length < 20 || String.fromCharCode(...b.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...b.subarray(8, 12)) !== "WEBP") return "no es un WebP";
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = 12; o + 8 <= b.length;) {
    const tipo = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (tipo === "ICCP") return "lleva un perfil de color (ICCP)";
    if (tipo === "ANIM" || tipo === "ANMF") return "es animado";
    o += 8 + dv.getUint32(o + 4, true) + (dv.getUint32(o + 4, true) & 1);
  }
  return null;
}

/** `img` shrunk so its longest side is `lado` px (same proportion, never enlarged): the average of the source pixels each new pixel covers
 * (exact fractional coverage, weighted by alpha so a transparent edge does not bleed its colour). Null = it already fits. */
export function reducirRgba(img: Rgba, lado: number): Rgba | null {
  const { width: w, height: h } = img, k = lado / Math.max(w, h);
  if (!(k < 1)) return null;
  const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k)), src = img.data;
  // horizontal pass: nw × h, premultiplied floats (r·a, g·a, b·a, a)
  const mid = new Float32Array(nw * h * 4), sx = w / nw;
  for (let x = 0; x < nw; x++) {
    const a0 = x * sx, a1 = (x + 1) * sx, i0 = Math.floor(a0), i1 = Math.min(w - 1, Math.ceil(a1) - 1);
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, al = 0, peso = 0;
      for (let i = i0; i <= i1; i++) {
        const c = Math.min(a1, i + 1) - Math.max(a0, i), p = (y * w + i) * 4, a = src[p + 3] / 255 * c;
        r += src[p] * a; g += src[p + 1] * a; b += src[p + 2] * a; al += a; peso += c;
      }
      const q = (y * nw + x) * 4; mid[q] = r / peso; mid[q + 1] = g / peso; mid[q + 2] = b / peso; mid[q + 3] = al / peso;
    }
  }
  // vertical pass: nw × nh, back to straight colour
  const out = new Uint8ClampedArray(nw * nh * 4), sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const a0 = y * sy, a1 = (y + 1) * sy, i0 = Math.floor(a0), i1 = Math.min(h - 1, Math.ceil(a1) - 1);
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, al = 0, peso = 0;
      for (let i = i0; i <= i1; i++) {
        const c = Math.min(a1, i + 1) - Math.max(a0, i), p = (i * nw + x) * 4;
        r += mid[p] * c; g += mid[p + 1] * c; b += mid[p + 2] * c; al += mid[p + 3] * c; peso += c;
      }
      al /= peso;
      const q = (y * nw + x) * 4;
      if (al > 1e-6) { out[q] = Math.round(r / peso / al); out[q + 1] = Math.round(g / peso / al); out[q + 2] = Math.round(b / peso / al); }
      out[q + 3] = Math.round(al * 255);
    }
  }
  return { data: out, width: nw, height: nh };
}

/** The smaller copies of a picture, one per tier size it is bigger than (IMAGEN_PX_COPIAS): `copias` empty with `motivo` when it gets none. */
export async function copiasPorNivel(bytes: Uint8Array, tipo: string): Promise<{ copias: CopiaPx[]; motivo?: string }> {
  const m = medidasImagen(tipo, bytes);
  if (!m) return { copias: [], motivo: "no sé cuánto mide" };
  const lado = Math.max(m.ancho, m.alto), pxs = IMAGEN_PX_COPIAS.filter((p) => lado > p);
  if (!pxs.length) return { copias: [], motivo: `${lado} px: cabe en todos los niveles` };
  if (m.ancho * m.alto > PIXELES_MAX_COPIA) return { copias: [], motivo: `${m.ancho}×${m.alto} px: demasiado grande para reducirla` };
  const no = tipo === "png" ? pngQueSeQueda(bytes) : tipo === "jpg" ? jpgQueSeQueda(bytes) : webpQueSeQueda(bytes);
  if (no) return { copias: [], motivo: no };
  const c = await cargarCodecs();
  if (!c) return { copias: [], motivo: "falta el codificador de WebP (npm install)" };
  try {
    const limpio = bytes.slice().buffer; // decoders may keep a view: they get their own bytes
    let img: Rgba;
    if (tipo === "jpg") { const d = await cargarJpeg(); if (!d) return { copias: [], motivo: "falta el decodificador de JPEG (npm install)" }; img = await d(limpio); }
    else if (tipo === "png") img = await c.png(new Uint8Array(limpio));
    else img = await c.deWebp(limpio);
    const copias: CopiaPx[] = [];
    for (const px of pxs) {
      const r = reducirRgba(img, px);
      if (!r) continue;
      const w = new Uint8Array(await c.aWebpCopia(r));
      if (w.length >= bytes.length) continue; // not lighter than the picture itself: not worth keeping
      copias.push({ px, ancho: r.width, alto: r.height, bytes: w });
    }
    return copias.length ? { copias } : { copias, motivo: "ninguna copia sale más ligera" };
  } catch (e) { return { copias: [], motivo: `no pude reducirla: ${String((e as Error)?.message ?? e).slice(0, 120)}` }; }
}

/** A PNG as lossless WebP with exactly its pixels (decoded back and compared), or why not. */
export async function pngAWebp(bytes: Uint8Array): Promise<Uint8Array | string> {
  const no = pngQueSeQueda(bytes);
  if (no) return no;
  const c = await cargarCodecs();
  if (!c) return "falta el codificador de WebP (npm install)";
  try {
    const img = await c.png(bytes);
    const w = new Uint8Array(await c.aWebp(img));
    const back = await c.deWebp(w.slice().buffer);
    if (back.width !== img.width || back.height !== img.height || back.data.length !== img.data.length) return "el WebP no sale del mismo tamaño";
    for (let i = 0; i < img.data.length; i++) if (img.data[i] !== back.data[i]) return "el WebP no da los mismos píxeles";
    return w;
  } catch (e) { return `no pude leer el PNG: ${String((e as Error)?.message ?? e).slice(0, 120)}`; }
}

/** The lighter copy of a picture uploaded to the world: a PNG as lossless WebP (the same pixels), and for a png/jpg/webp the smaller copy
 * per device tier it is bigger than (`copias`). `bytes` null with `motivo` when the picture itself stays as it is. */
export async function optimizarImagen(bytes: Uint8Array, tipo: string): Promise<Resultado> {
  const t0 = performance.now(), antes = bytes.length;
  const no = (motivo: string): Resultado => ({ bytes: null, antes, despues: antes, ms: Math.round(performance.now() - t0), motivo });
  let base: Resultado;
  if (tipo !== "png") base = no(`.${tipo} se queda como viene`);
  else {
    const w = await pngAWebp(bytes);
    if (typeof w === "string") base = no(w);
    else if (w.length > antes * (1 - AHORRO_MIN)) base = no(`solo ahorra ${Math.round(100 * (1 - w.length / antes))} %`);
    else base = { bytes: w, antes, despues: w.length, ms: 0, ext: "webp" };
  }
  if (tipo !== "png" && tipo !== "jpg" && tipo !== "webp") return base;
  const c = await copiasPorNivel(bytes, tipo);
  return { ...base, ms: Math.round(performance.now() - t0), copias: c.copias, ...(c.motivo ? { copiasMotivo: c.motivo } : {}) };
}

/** Any file of the world: the right optimizer for its kind. */
export async function optimizar(bytes: Uint8Array, tipo: string): Promise<Resultado> {
  if (tipo !== "glb") return optimizarImagen(bytes, tipo);
  const r = await optimizarGlb(bytes);
  // H13: the levels of detail come from the ORIGINAL, whether or not it also got a lighter copy (lod.ts is loaded here, not at the top: it imports this file)
  const { generarLods } = await import("./lod.ts");
  return { ...r, lods: await generarLods(bytes) };
}

/** The JSON chunk of a .glb (null = not a glb). */
export function jsonDeGlb(b: Uint8Array): { extensionsUsed?: string[]; [k: string]: unknown } | null {
  if (b.length < 20) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(12, true) > b.length - 20 || dv.getUint32(16, true) !== 0x4e4f534a) return null;
  try { return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + dv.getUint32(12, true)))); } catch { return null; }
}

type Lib = Awaited<ReturnType<typeof cargarLib>>;
let lib: Promise<Lib> | null = null;
async function cargarLib() {
  const [core, ext, fns, mo] = await Promise.all([import("@gltf-transform/core"), import("@gltf-transform/extensions"), import("@gltf-transform/functions"), import("meshoptimizer")]);
  await mo.MeshoptEncoder.ready; await mo.MeshoptDecoder.ready;
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": mo.MeshoptEncoder, "meshopt.decoder": mo.MeshoptDecoder });
  const conocidas = new Set<string>(ext.ALL_EXTENSIONS.map((e: { EXTENSION_NAME: string }) => e.EXTENSION_NAME));
  return { core, ext, fns, mo, io, conocidas };
}
/** The library, loaded on first use (a server that never optimizes never loads it); null = not installed. */
export async function libreria(): Promise<Lib | null> {
  lib ??= cargarLib();
  try { return await lib; } catch { lib = null; return null; }
}

/** What the file draws: triangles over every node of every scene, nodes, distinct pictures, animations and the bounds. */
function huella(l: Lib, doc: InstanceType<Lib["core"]["Document"]>): Huella {
  let triangulos = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const root = doc.getRoot();
  for (const escena of root.listScenes()) {
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
  // textures: distinct pictures (dedup may merge two copies of one; it must never lose one)
  const fotos = new Set(root.listTextures().map((t) => { const b = t.getImage(); return b ? createHash("sha256").update(b).digest("hex") : t.getURI(); }));
  return { triangulos, nodos: root.listNodes().length, texturas: fotos.size, animaciones: root.listAnimations().length, min, max };
}

/** Same drawing? Bounds within 1/10,000 of the model's size (16-bit positions move a vertex 1/131,000 at most). */
export function mismaHuella(a: Huella, b: Huella): string | null {
  if (a.triangulos !== b.triangulos) return `triángulos ${a.triangulos} → ${b.triangulos}`;
  if (a.nodos !== b.nodos) return `nodos ${a.nodos} → ${b.nodos}`;
  if (a.texturas !== b.texturas) return `texturas ${a.texturas} → ${b.texturas}`;
  if (a.animaciones !== b.animaciones) return `animaciones ${a.animaciones} → ${b.animaciones}`;
  const lado = Math.max(...a.max.map((x, i) => x - a.min[i]), 1e-6);
  for (let i = 0; i < 3; i++) if (Math.abs(a.min[i] - b.min[i]) > lado * 1e-4 || Math.abs(a.max[i] - b.max[i]) > lado * 1e-4) return `caja ${a.min}…${a.max} → ${b.min}…${b.max}`;
  return null;
}

/** The lighter copy of a .glb, or null with the reason it stays as it is. Never throws. */
export async function optimizarGlb(bytes: Uint8Array): Promise<Resultado> {
  const t0 = performance.now(), antes = bytes.length;
  const no = (motivo: string): Resultado => ({ bytes: null, antes, despues: antes, ms: Math.round(performance.now() - t0), motivo });
  const json = jsonDeGlb(bytes);
  if (!json) return no("no es un .glb");
  const usadas = json.extensionsUsed ?? [];
  if (usadas.includes("EXT_meshopt_compression") || usadas.includes("KHR_draco_mesh_compression")) return no("ya viene comprimido");
  const l = await libreria();
  if (!l) return no("falta la librería de optimizar (npm install)");
  const raras = usadas.filter((e) => !l.conocidas.has(e));
  if (raras.length) return no(`lleva extensiones que no conozco (${raras.join(", ")}): se queda como está`);
  try {
    const doc = await l.io.readBinary(bytes);
    doc.setLogger(new l.core.Logger(l.core.Logger.Verbosity.SILENT));
    const h0 = huella(l, doc);
    // PNG textures → lossless WebP (EXT_texture_webp), each only when it is the same pixels and smaller
    let webp = 0;
    for (const t of doc.getRoot().listTextures()) {
      const img = t.getImage();
      if (t.getMimeType() !== "image/png" || !img) continue;
      const w = await pngAWebp(img);
      if (typeof w === "string" || w.length > img.length * (1 - AHORRO_MIN)) continue;
      t.setImage(w).setMimeType("image/webp"); if (t.getURI()) t.setURI(t.getURI().replace(/\.png$/i, ".webp"));
      webp++;
    }
    if (webp) doc.createExtension(l.ext.EXTTextureWebP).setRequired(true);
    await doc.transform(
      l.fns.dedup(),
      l.fns.prune({ keepLeaves: true, keepAttributes: false, keepExtras: true, keepIndices: true }),
      l.fns.weld(),
      l.fns.quantize(BITS),
      l.fns.reorder({ encoder: l.mo.MeshoptEncoder, target: "size" }),
    );
    doc.createExtension(l.ext.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: l.ext.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const out = await l.io.writeBinary(doc);
    if (out.length > antes * (1 - AHORRO_MIN)) return no(`solo ahorra ${Math.round(100 * (1 - out.length / antes))} %`);
    const h1 = huella(l, await l.io.readBinary(out)); // read back what we wrote: the check is on the real bytes
    const dif = mismaHuella(h0, h1);
    if (dif) return no(`no dibuja lo mismo (${dif})`);
    return { bytes: out, antes, despues: out.length, ms: Math.round(performance.now() - t0), huella: h1, ...(webp ? { webp } : {}) };
  } catch (e) {
    return no(`no pude leerlo: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
