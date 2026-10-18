// tools/aligerar-activos.ts — E3: the house avatars (.vrm) and animations (.vrma) made lighter WITHOUT changing a
// single value the page reads. A new visitor downloads every one of them; this is what they save.
//
// Unlike packages/server/src/optimizar.ts (gltf-transform: rebuilds the whole file, so it refuses VRM — it would drop
// the VRM extensions, which point at nodes, meshes, materials and textures by index), this edits a .glb surgically:
// nodes, meshes, materials, textures, accessors and every extension keep their index and their JSON. Only how the
// bytes are stored changes:
//   - a PNG texture → LOSSLESS WebP (EXT_texture_webp), the same pixels (pngAWebp decodes it back and compares);
//   - a PNG whose only colour note is an sRGB ICC profile (GIMP's «built-in sRGB»: what a browser assumes anyway, and
//     three's GLTFLoader reads pictures with no colour conversion at all) loses that note first;
//   - a morph target that moves only some vertices → a sparse accessor (core glTF 2.0: the vertices it moves and by
//     how much; the rest are zero). The exporter left float residue on the «still» vertices (≤ 0.24 µm in the house
//     avatars): a vertex counts as moved above TOL_MORFO = 1 µm, and the check allows exactly that much;
//   - every geometry/animation buffer → EXT_meshopt_compression in its lossless modes (ATTRIBUTES without a filter,
//     TRIANGLES, INDICES): three's GLTFLoader decodes it with the meshopt decoder the page already loads (gltf.ts).
// Then the result is read back and every accessor is compared, element by element, with the original: one byte of
// difference and the file is left as it was. Running it twice does nothing (an already lighter file is skipped).
// The sky (.hdr, Radiance RGBE, only the light of the «nublado» preset: three turns it into a PMREM) keeps its size
// and every pixel, with BITS_HDR = 6 of its 8 mantissa bits (≤ 1.6 % of a pixel's brightness; spheres from mirror to
// rough lit by it differ by ≤ 3/255): same loader, half the gzip. Halving it to 512 px was tried and refused: three's
// PMREM samples the tiny sun differently and the light changes visibly (work/motor-rendimiento/e3/).
// Licences: meshoptimizer MIT, @jsquash Apache-2.0 (libwebp BSD) — the same the server already uses (optimizar.ts).
// The file's own licence (VRM meta: CC0) is untouched: the JSON keeps every field.
//
// Usage: node tools/aligerar-activos.ts [files…]   (default: activos/avatares/*.vrm activos/animaciones/*.vrma activos/cielos/*.hdr)
//        then: node tools/avatares-catalogo.ts     (the new sha256 into catalogo.json)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { pngAWebp } from "../packages/server/src/optimizar.ts";

/** A morph target's vertex «moves» when one of its components is over this (metres): 1 µm, far below a pixel. */
export const TOL_MORFO = 1e-6;

/** The PNG without its iCCP chunk when that profile is sRGB (the same colours); else the PNG as it is. */
export function sinIccSrgb(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = 8; o + 12 <= b.length;) {
    const n = dv.getUint32(o), tipo = String.fromCharCode(...b.subarray(o + 4, o + 8));
    if (tipo === "iCCP") {
      const d = b.subarray(o + 8, o + 8 + n), z = d.indexOf(0);
      let perfil: Uint8Array;
      try { perfil = inflateSync(d.subarray(z + 2)); } catch { return b; }
      if (!/s\0?R\0?G\0?B/.test(new TextDecoder("latin1").decode(perfil))) return b; // its description (ASCII or UTF-16)
      const out = new Uint8Array(b.length - (12 + n));
      out.set(b.subarray(0, o)); out.set(b.subarray(o + 12 + n), o);
      return out;
    }
    if (tipo === "IDAT") return b;
    o += 12 + n;
  }
  return b;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MESHOPT = "EXT_meshopt_compression", WEBP = "EXT_texture_webp";
const TAM: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function partirGlb(b: Uint8Array): { json: Json; bin: Uint8Array } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("no es un .glb");
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl)));
  let bin = new Uint8Array(0);
  if (20 + jl + 8 <= b.length && dv.getUint32(20 + jl + 4, true) === 0x004e4942) bin = b.subarray(28 + jl, 28 + jl + dv.getUint32(20 + jl, true));
  return { json, bin };
}

export function juntarGlb(json: Json, bin: Uint8Array): Uint8Array {
  let j = new TextEncoder().encode(JSON.stringify(json));
  const jp = (4 - (j.length % 4)) % 4, bp = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + j.length + jp + (bin.length ? 8 + bin.length + bp : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  if (bin.length) {
    const o = 20 + j.length + jp;
    dv.setUint32(o, bin.length + bp, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8);
  }
  j = new Uint8Array(0);
  return out;
}

type Decoder = { ready: Promise<void>; decodeGltfBuffer: (t: Uint8Array, count: number, size: number, src: Uint8Array, mode: string, filter?: string) => void };
type Encoder = { ready: Promise<void>; encodeGltfBuffer: (s: Uint8Array, count: number, size: number, mode: string, version?: number) => Uint8Array };
let meshopt: Promise<{ enc: Encoder; dec: Decoder }> | null = null;
const cargarMeshopt = () => (meshopt ??= import("meshoptimizer").then(async (m) => {
  await m.MeshoptEncoder.ready; await m.MeshoptDecoder.ready;
  return { enc: m.MeshoptEncoder as unknown as Encoder, dec: m.MeshoptDecoder as unknown as Decoder };
}));

/** The bytes of a bufferView as stored (meshopt decoded when compressed). */
async function bytesDeVista(json: Json, bin: Uint8Array, i: number): Promise<Uint8Array> {
  const bv = json.bufferViews[i], m = bv.extensions?.[MESHOPT];
  if (m) {
    if (m.buffer !== 0) throw new Error("meshopt fuera del BIN");
    const { dec } = await cargarMeshopt();
    const out = new Uint8Array(m.count * m.byteStride);
    dec.decodeGltfBuffer(out, m.count, m.byteStride, bin.subarray(m.byteOffset ?? 0, (m.byteOffset ?? 0) + m.byteLength), m.mode, m.filter);
    return out;
  }
  if ((bv.buffer ?? 0) !== 0) throw new Error("buffer externo");
  return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
}

/** Every element of an accessor, packed tight (stride removed, sparse applied): what a reader ends up with. */
export async function datosAccesor(json: Json, bin: Uint8Array, i: number): Promise<Uint8Array> {
  const a = json.accessors[i], el = TAM[a.componentType] * COMP[a.type];
  const out = new Uint8Array(a.count * el);
  if (a.bufferView !== undefined) {
    const v = await bytesDeVista(json, bin, a.bufferView), stride = json.bufferViews[a.bufferView].byteStride ?? el, off = a.byteOffset ?? 0;
    for (let k = 0; k < a.count; k++) out.set(v.subarray(off + k * stride, off + k * stride + el), k * el);
  }
  if (a.sparse) {
    const s = a.sparse, ti = TAM[s.indices.componentType];
    const iv = await bytesDeVista(json, bin, s.indices.bufferView), vv = await bytesDeVista(json, bin, s.values.bufferView);
    const idv = new DataView(iv.buffer, iv.byteOffset + (s.indices.byteOffset ?? 0)), vo = s.values.byteOffset ?? 0;
    for (let k = 0; k < s.count; k++) {
      const idx = ti === 1 ? idv.getUint8(k) : ti === 2 ? idv.getUint16(k * 2, true) : idv.getUint32(k * 4, true);
      out.set(vv.subarray(vo + k * el, vo + (k + 1) * el), idx * el);
    }
  }
  return out;
}

const iguales = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, k) => x === b[k]);
const cerca = (a: Uint8Array, b: Uint8Array, tol: number) => {
  if (a.length !== b.length) return false;
  const p = new Float32Array(a.slice().buffer), q = new Float32Array(b.slice().buffer);
  return p.every((x, k) => Math.abs(x - q[k]) <= tol);
};
/** Triangle lists: the meshopt index codec may start a triangle at another of its corners (same triangle, same
 * winding, so it draws the same); each triangle is compared from its smallest index. */
function mismosTriangulos(a: Uint8Array, b: Uint8Array, tam: number): boolean {
  if (a.length !== b.length) return false;
  const leer = (x: Uint8Array) => tam === 2 ? new Uint16Array(x.slice().buffer) : new Uint32Array(x.slice().buffer);
  const p = leer(a), q = leer(b);
  const giro = (t: ArrayLike<number>, k: number) => { const v = [t[k], t[k + 1], t[k + 2]], m = v.indexOf(Math.min(...v)); return `${v[m]},${v[(m + 1) % 3]},${v[(m + 2) % 3]}`; };
  for (let k = 0; k < p.length; k += 3) if (giro(p, k) !== giro(q, k)) return false;
  return true;
}

export type Informe = { antes: number; despues: number; webp: number; dispersos: number; vistas: number; motivo?: string };

/** The lighter .glb/.vrm/.vrma, or null + why it stays. Never changes what a reader decodes. */
export async function aligerar(bytes: Uint8Array): Promise<{ bytes: Uint8Array | null; informe: Informe }> {
  const { json: orig, bin } = partirGlb(bytes);
  const inf: Informe = { antes: bytes.length, despues: bytes.length, webp: 0, dispersos: 0, vistas: 0 };
  const no = (motivo: string) => ({ bytes: null, informe: { ...inf, motivo } });
  const usadas: string[] = orig.extensionsUsed ?? [];
  if (usadas.includes(MESHOPT) || usadas.includes("KHR_draco_mesh_compression") || usadas.includes("KHR_meshopt_compression")) return no("ya viene comprimido");
  if ((orig.buffers ?? []).length > 1 || orig.buffers?.[0]?.uri) return no("buffers fuera del .glb");
  const json: Json = structuredClone(orig);
  const { enc } = await cargarMeshopt();

  // what each accessor is: triangle indices, a morph target, or plain data (attributes, animation, skins)
  const triangulos = new Set<number>(), morfos = new Set<number>();
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    if (p.indices !== undefined && (p.mode ?? 4) === 4) triangulos.add(p.indices);
    for (const t of p.targets ?? []) for (const a of Object.values(t)) morfos.add(a as number);
  }

  // 1. the new bufferViews: images first (as they are, or as lossless WebP), then one tight view per accessor
  const trozos: Uint8Array[] = [];
  let largo = 0, largoFalso = 0;
  const vistas: Json[] = [];
  const poner = (b: Uint8Array): number => { const o = largo; trozos.push(b); largo += b.length; const p = (4 - (largo % 4)) % 4; if (p) { trozos.push(new Uint8Array(p)); largo += p; } return o; };
  const vistaCruda = (b: Uint8Array): number => { vistas.push({ buffer: 0, byteOffset: poner(b), byteLength: b.length }); return vistas.length - 1; };
  const vistaMeshopt = (b: Uint8Array, count: number, size: number, modo: "ATTRIBUTES" | "TRIANGLES" | "INDICES", target?: number): number => {
    const c = enc.encodeGltfBuffer(b, count, size, modo, 0);
    const f = largoFalso; largoFalso += b.length + ((4 - (b.length % 4)) % 4);
    vistas.push({ buffer: 1, byteOffset: f, byteLength: b.length, ...(modo === "ATTRIBUTES" ? { byteStride: size } : {}), ...(target ? { target } : {}),
      extensions: { [MESHOPT]: { buffer: 0, byteOffset: poner(c), byteLength: c.length, byteStride: size, count, mode: modo } } });
    inf.vistas++;
    return vistas.length - 1;
  };

  for (const [i, im] of (json.images ?? []).entries()) {
    if (im.bufferView === undefined) continue;
    const b = await bytesDeVista(orig, bin, im.bufferView);
    const w = im.mimeType === "image/png" ? await pngAWebp(sinIccSrgb(b)) : "no es PNG";
    if (typeof w !== "string" && w.length < b.length) {
      im.bufferView = vistaCruda(w); im.mimeType = "image/webp"; inf.webp++;
      for (const t of json.textures ?? []) if (t.source === i) { delete t.source; t.extensions = { ...(t.extensions ?? {}), [WEBP]: { source: i } }; }
    } else im.bufferView = vistaCruda(b);
  }

  for (const [i, a] of (json.accessors ?? []).entries()) {
    if (a.sparse) return no("ya trae accesores dispersos");
    if (a.bufferView === undefined) continue;
    const el = TAM[a.componentType] * COMP[a.type], datos = await datosAccesor(orig, bin, i);
    delete a.byteOffset;
    if (morfos.has(i) && a.componentType === 5126) {
      // sparse: only the vertices this shape moves (over TOL_MORFO); their values are copied as they are
      const mov: number[] = [], f = new Float32Array(datos.slice().buffer);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < COMP[a.type]; c++) if (Math.abs(f[k * COMP[a.type] + c]) > TOL_MORFO) { mov.push(k); break; }
      if (mov.length * (el + 4) < datos.length * 0.75) {
        delete a.bufferView; inf.dispersos++;
        if (mov.length) {
          const idx = a.count < 65536 ? new Uint16Array(mov) : new Uint32Array(mov);
          const val = new Uint8Array(mov.length * el);
          mov.forEach((k, n) => val.set(datos.subarray(k * el, (k + 1) * el), n * el));
          a.sparse = { count: mov.length,
            indices: { bufferView: vistaMeshopt(new Uint8Array(idx.buffer), mov.length, idx.BYTES_PER_ELEMENT, "INDICES"), componentType: a.count < 65536 ? 5123 : 5125 },
            values: { bufferView: el % 4 === 0 ? vistaMeshopt(val, mov.length, el, "ATTRIBUTES") : vistaCruda(val) } };
        }
        continue;
      }
    }
    if (triangulos.has(i) && (el === 2 || el === 4) && a.count % 3 === 0) a.bufferView = vistaMeshopt(datos, a.count, el, "TRIANGLES", 34963);
    else if (el % 4 === 0 && el <= 256) a.bufferView = vistaMeshopt(datos, a.count, el, "ATTRIBUTES", orig.bufferViews[orig.accessors[i].bufferView].target);
    else a.bufferView = vistaCruda(datos);
  }

  json.bufferViews = vistas;
  json.buffers = [{ byteLength: largo }, { byteLength: largoFalso, extensions: { [MESHOPT]: { fallback: true } } }];
  const usa = new Set<string>(usadas), req = new Set<string>(orig.extensionsRequired ?? []);
  if (inf.vistas) { usa.add(MESHOPT); req.add(MESHOPT); }
  if (inf.webp) { usa.add(WEBP); req.add(WEBP); }
  json.extensionsUsed = [...usa];
  if (req.size) json.extensionsRequired = [...req];
  const binNuevo = new Uint8Array(largo);
  let o = 0; for (const t of trozos) { binNuevo.set(t, o); o += t.length; }
  const out = juntarGlb(json, binNuevo);

  // 2. the check, on the bytes we wrote: same JSON except storage, and every accessor decodes to the same values
  const leido = partirGlb(out);
  const sinAlmacen = (j: Json) => {
    const c = structuredClone(j);
    delete c.bufferViews; delete c.buffers; delete c.extensionsUsed; delete c.extensionsRequired;
    for (const a of c.accessors ?? []) { delete a.bufferView; delete a.byteOffset; delete a.sparse; }
    for (const im of c.images ?? []) { delete im.bufferView; delete im.mimeType; }
    for (const t of c.textures ?? []) { if (t.extensions?.[WEBP]) { t.source = t.extensions[WEBP].source; delete t.extensions[WEBP]; if (!Object.keys(t.extensions).length) delete t.extensions; } }
    return JSON.stringify(c);
  };
  if (sinAlmacen(leido.json) !== sinAlmacen(orig)) return no("el JSON cambió más allá del almacenamiento");
  for (let i = 0; i < (orig.accessors ?? []).length; i++) {
    const x = await datosAccesor(orig, bin, i), y = await datosAccesor(leido.json, leido.bin, i);
    const ok = morfos.has(i) && orig.accessors[i].componentType === 5126 ? cerca(x, y, TOL_MORFO) : triangulos.has(i) && leido.json.bufferViews[leido.json.accessors[i].bufferView]?.extensions?.[MESHOPT]?.mode === "TRIANGLES" ? mismosTriangulos(x, y, TAM[orig.accessors[i].componentType]) : iguales(x, y);
    if (!ok) return no(`el accesor ${i} no da los mismos valores`);
  }
  if (out.length >= bytes.length) return no("no sale más pequeño");
  inf.despues = out.length;
  return { bytes: out, informe: inf };
}

// ---- the sky: Radiance .hdr ----

/** Mantissa bits the house sky keeps (of RGBE's 8): the noise in the last two is what gzip could not squeeze. */
export const BITS_HDR = 6;

/** A Radiance .hdr (new-style RLE or flat) → its header lines and RGBE pixels, top row first. */
export function leerHdr(b: Uint8Array): { cabecera: string[]; ancho: number; alto: number; rgbe: Uint8Array } {
  const cabecera: string[] = [];
  let i = 0, dims = "";
  for (;;) {
    const j = b.indexOf(10, i); if (j < 0) throw new Error("no es un .hdr");
    const l = new TextDecoder("latin1").decode(b.subarray(i, j)); i = j + 1;
    if (/^[-+]Y /.test(l)) { dims = l; break; }
    cabecera.push(l);
  }
  const m = /^-Y (\d+) \+X (\d+)$/.exec(dims); if (!m || !cabecera[0]?.startsWith("#?")) throw new Error(`.hdr que no sé leer (${dims})`);
  const alto = +m[1], ancho = +m[2], rgbe = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    if (b[i] === 2 && b[i + 1] === 2 && ((b[i + 2] << 8) | b[i + 3]) === ancho) {
      i += 4;
      for (let c = 0; c < 4; c++) for (let x = 0; x < ancho;) {
        let n = b[i++];
        if (n > 128) { n -= 128; const v = b[i++]; for (let k = 0; k < n; k++) rgbe[(y * ancho + x++) * 4 + c] = v; }
        else for (let k = 0; k < n; k++) rgbe[(y * ancho + x++) * 4 + c] = b[i++];
      }
    } else { rgbe.set(b.subarray(i, i + ancho * 4), y * ancho * 4); i += ancho * 4; }
  }
  return { cabecera, ancho, alto, rgbe };
}

export function escribirHdr(h: { cabecera: string[]; ancho: number; alto: number; rgbe: Uint8Array }): Uint8Array {
  const out: number[] = [...new TextEncoder().encode(h.cabecera.join("\n") + `\n-Y ${h.alto} +X ${h.ancho}\n`)];
  const fila = new Uint8Array(h.ancho);
  for (let y = 0; y < h.alto; y++) {
    out.push(2, 2, h.ancho >> 8, h.ancho & 255);
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < h.ancho; x++) fila[x] = h.rgbe[(y * h.ancho + x) * 4 + c];
      for (let x = 0; x < h.ancho;) {
        let r = 1; while (x + r < h.ancho && r < 127 && fila[x + r] === fila[x]) r++;
        if (r >= 3) { out.push(128 + r, fila[x]); x += r; continue; }
        const s0 = x;
        while (x < h.ancho && x - s0 < 128 && !(x + 2 < h.ancho && fila[x] === fila[x + 1] && fila[x] === fila[x + 2])) x++;
        out.push(x - s0); for (let k = s0; k < x; k++) out.push(fila[k]);
      }
    }
  }
  return new Uint8Array(out);
}

/** Each colour's 8-bit mantissa keeps its top BITS_HDR bits and goes to the middle of what it drops (m → m & ~3 | 2):
 * at most ±2/256 of the pixel's brightest channel (≤ 1.6 %), zero on average; the exponent and every pixel's place stay,
 * so the sun stays the same few pixels and three's PMREM sees the same sky. A mantissa of 0 stays 0. */
export function aligerarHdr(bytes: Uint8Array): { bytes: Uint8Array | null; motivo?: string } {
  const h = leerHdr(bytes), k = 8 - BITS_HDR, baja = (1 << k) - 1, medio = 1 << (k - 1);
  let hecho = true;
  for (let o = 0; o < h.rgbe.length && hecho; o += 4) for (let c = 0; c < 3; c++) if (h.rgbe[o + c] && (h.rgbe[o + c] & baja) !== medio) { hecho = false; break; }
  if (hecho) return { bytes: null, motivo: `ya va a ${BITS_HDR} bits de mantisa` };
  const rgbe = h.rgbe.slice();
  for (let o = 0; o < rgbe.length; o += 4) for (let c = 0; c < 3; c++) if (rgbe[o + c]) rgbe[o + c] = (rgbe[o + c] & ~baja & 255) | medio;
  return { bytes: escribirHdr({ ...h, rgbe }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const dir = (d: string, ext: string) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith(ext)).sort().map((f) => join(ROOT, d, f));
  const files = process.argv.slice(2).length ? process.argv.slice(2) : [...dir("activos/avatares", ".vrm"), ...dir("activos/animaciones", ".vrma"), ...dir("activos/cielos", ".hdr")];
  let antes = 0, despues = 0;
  for (const f of files) {
    const b = new Uint8Array(readFileSync(f));
    if (f.endsWith(".hdr")) {
      const r = aligerarHdr(b), d = r.bytes?.length ?? b.length;
      antes += b.length; despues += d;
      if (r.bytes) writeFileSync(f, r.bytes);
      console.log(`${f.replace(ROOT, "")}: ${b.length} → ${d} B${r.bytes ? ` (−${Math.round(100 * (1 - d / b.length))} %; ${BITS_HDR} bits de mantisa)` : ` · se queda: ${r.motivo}`}`);
      continue;
    }
    const r = await aligerar(b);
    antes += r.informe.antes; despues += r.informe.despues;
    if (r.bytes) writeFileSync(f, r.bytes);
    const i = r.informe;
    console.log(`${f.replace(ROOT, "")}: ${i.antes} → ${i.despues} B${r.bytes ? ` (−${Math.round(100 * (1 - i.despues / i.antes))} %; ${i.webp} WebP, ${i.dispersos} morfos dispersos, ${i.vistas} vistas meshopt)` : ` · se queda: ${i.motivo}`}`);
  }
  console.log(`total ${antes} → ${despues} B`);
}
