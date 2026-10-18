// colision-glb (M6 h2): the triangles of a .glb, read on the server without three.js, so the mesh collider (M6 h3-h7)
// is built from the same numbers on the server and on every page. Walks the default scene's nodes with their
// transforms (matrix or TRS, parents first), reads POSITION in every component type KHR_mesh_quantization allows
// (float, byte, short, signed or not, normalized or not, with byteStride), indexed (u8/u16/u32) or not, triangle
// lists, strips and fans; buffer views compressed with EXT_meshopt_compression are decoded with the meshoptimizer
// decoder (the same one the optimizer uses). What it cannot read it refuses with the reason, never throws:
// KHR_draco_mesh_compression (no decoder here), sparse accessors, buffers outside the file, more triangles than `max`.
// Output: positions in the model's own space (the node transforms already applied, the object's place/turn/scale
// in the world not: that is the state's x,y,z,r*,s*), three indices per triangle, and the count.
import type { Issue, Result } from "../../core/src/index.ts";

/** Most triangles one `malla` thing may bring (docs: DISENO-M6 §4.1, proposed; limits.json publishes it in h15).
 * A .glb up to 12 MB (H9) can bring more: a collider node (M21, h14) then carries the collision alone. */
export const TRIANGULOS_MAX_MALLA = 50_000;

export type Triangulos = {
  /** x y z per vertex, metres, in the model's space after node transforms. */
  vertices: Float32Array;
  /** three per triangle, into `vertices`. */
  indices: Uint32Array;
  triangulos: number;
  /** nodes of the scene that carry a mesh (a mesh under two nodes counts twice: two colliders). */
  nodos: number;
  /** primitives skipped and why (points, lines): the file still counts. */
  saltadas: string[];
  /** what had to be decoded: "meshopt" when EXT_meshopt_compression was used. */
  decodificado: string[];
};

type Json = { [k: string]: unknown };
type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; sparse?: unknown };
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } };
type Primitive = { attributes: Record<string, number>; indices?: number; mode?: number; extensions?: Json };
type Node = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
type Gltf = { asset?: { version?: string }; scene?: number; scenes?: { nodes?: number[] }[]; nodes?: Node[]; meshes?: { primitives: Primitive[] }[]; accessors?: Accessor[]; bufferViews?: BufferView[]; buffers?: { byteLength: number; uri?: string }[]; extensionsRequired?: string[]; extensionsUsed?: string[] };

type Decoder = { ready: Promise<void>; decodeGltfBuffer: (target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter?: string) => void };
let decoder: Promise<Decoder | null> | null = null;
/** The meshopt decoder, loaded on first use (a server that never meets a compressed .glb never loads it). */
async function meshopt(): Promise<Decoder | null> {
  decoder ??= import("meshoptimizer").then(async (m) => { await m.MeshoptDecoder.ready; return m.MeshoptDecoder as Decoder; }).catch(() => null);
  return decoder;
}

const no = (path: string, message: string): Result<never> => ({ ok: false, issues: [{ path, message }] });
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** The JSON and BIN chunks of a .glb (version 2). */
export function trozosDeGlb(bytes: Uint8Array): Result<{ json: Gltf; bin: Uint8Array | null }> {
  if (bytes.length < 20) return no("glb", "demasiado corto para ser un GLB");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return no("glb.magic", "no empieza por «glTF»: no es un .glb binario");
  if (dv.getUint32(4, true) !== 2) return no("glb.version", `GLB versión ${dv.getUint32(4, true)}: solo leo la 2`);
  const total = Math.min(dv.getUint32(8, true), bytes.length);
  let at = 12, json: Gltf | null = null, bin: Uint8Array | null = null;
  while (at + 8 <= total) {
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    if (at + 8 + len > total) return no("glb.chunk", "un trozo dice más bytes de los que hay");
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (type === 0x4e4f534a && !json) { try { json = JSON.parse(new TextDecoder().decode(body)) as Gltf; } catch (e) { return no("glb.json", `JSON roto: ${(e as Error).message}`); } }
    else if (type === 0x004e4942 && !bin) bin = body;
    at += 8 + len;
  }
  if (!json) return no("glb.json", "no tiene trozo JSON");
  return { ok: true, value: { json, bin } };
}

// ---- 4×4 column-major matrices, as glTF stores them ----
type M4 = Float64Array;
const identidad = (): M4 => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiplicar(a: M4, b: M4): M4 { // a · b (apply b first, then a)
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
/** A node's own matrix: `matrix` as given, else T · R · S (glTF: scale, then rotate, then translate). */
function matrizDe(n: Node): M4 {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return Float64Array.from(n.matrix.map(Number));
  const [tx, ty, tz] = (n.translation ?? [0, 0, 0]).map(Number), [sx, sy, sz] = (n.scale ?? [1, 1, 1]).map(Number);
  const [qx, qy, qz, qw] = (n.rotation ?? [0, 0, 0, 1]).map(Number);
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return new Float64Array([
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

/** The triangles of a .glb: see the header. `max` refuses a file with more triangles (the count is in the reason). */
export async function triangulosDeGlb(bytes: Uint8Array, opts: { max?: number } = {}): Promise<Result<Triangulos>> {
  const t = trozosDeGlb(bytes);
  if (!t.ok) return t;
  const { json: j, bin } = t.value, max = opts.max ?? TRIANGULOS_MAX_MALLA;
  const requeridas = j.extensionsRequired ?? [], usadas = new Set([...requeridas, ...(j.extensionsUsed ?? [])]);
  if (usadas.has("KHR_draco_mesh_compression")) return no("extensions", "viene comprimido con Draco (KHR_draco_mesh_compression): no tengo descodificador; guárdalo sin Draco o con meshopt");
  const decodificado: string[] = [];
  const mo = usadas.has("EXT_meshopt_compression") ? await meshopt() : null;
  if (usadas.has("EXT_meshopt_compression") && !mo) return no("extensions", "viene comprimido con meshopt (EXT_meshopt_compression) y el descodificador meshoptimizer no está instalado");

  // buffers: only the BIN chunk (buffer 0 without uri); the rest is outside the file
  const buffers = j.buffers ?? [];
  const bufferDe = (i: number): Result<Uint8Array> => {
    const b = buffers[i];
    if (!b) return no(`buffers[${i}]`, "no existe");
    if (b.uri !== undefined) return no(`buffers[${i}]`, "apunta fuera del fichero (uri): un .glb de colisión lleva su geometría dentro");
    if (!bin) return no(`buffers[${i}]`, "el .glb no tiene trozo BIN");
    return { ok: true, value: bin };
  };
  // buffer views, meshopt ones decoded once
  const vistas = new Map<number, Uint8Array>();
  const vistaDe = (i: number): Result<{ bytes: Uint8Array; stride: number }> => {
    const v = (j.bufferViews ?? [])[i];
    if (!v) return no(`bufferViews[${i}]`, "no existe");
    const m = v.extensions?.EXT_meshopt_compression;
    if (m) {
      let out = vistas.get(i);
      if (!out) {
        const src = bufferDe(m.buffer);
        if (!src.ok) return src;
        const from = m.byteOffset ?? 0;
        if (from + m.byteLength > src.value.length) return no(`bufferViews[${i}]`, "meshopt: la vista se sale del buffer");
        out = new Uint8Array(m.count * m.byteStride);
        try { mo!.decodeGltfBuffer(out, m.count, m.byteStride, src.value.subarray(from, from + m.byteLength), m.mode, m.filter); }
        catch (e) { return no(`bufferViews[${i}]`, `meshopt no pudo descodificar: ${(e as Error).message}`); }
        vistas.set(i, out);
        if (!decodificado.includes("meshopt")) decodificado.push("meshopt");
      }
      return { ok: true, value: { bytes: out, stride: v.byteStride ?? m.byteStride } };
    }
    const src = bufferDe(v.buffer);
    if (!src.ok) return src;
    const from = v.byteOffset ?? 0;
    if (from + v.byteLength > src.value.length) return no(`bufferViews[${i}]`, "se sale del buffer");
    return { ok: true, value: { bytes: src.value.subarray(from, from + v.byteLength), stride: v.byteStride ?? 0 } };
  };
  /** Reads an accessor as numbers (normalized ones to [-1,1] / [0,1], as KHR_mesh_quantization says). */
  const leer = (i: number, esperado: string): Result<Float64Array> => {
    const a = (j.accessors ?? [])[i];
    if (!a) return no(`accessors[${i}]`, "no existe");
    if (a.sparse) return no(`accessors[${i}]`, "es un accessor disperso (sparse): no lo leo; guárdalo denso");
    const n = COMPONENTS[a.type], tam = BYTES[a.componentType];
    if (a.type !== esperado) return no(`accessors[${i}]`, `es ${a.type}, esperaba ${esperado}`);
    if (!tam) return no(`accessors[${i}]`, `componentType ${a.componentType} desconocido`);
    const out = new Float64Array(a.count * n);
    if (a.bufferView === undefined) return { ok: true, value: out }; // all zeros, as the spec says
    const v = vistaDe(a.bufferView);
    if (!v.ok) return v;
    const stride = v.value.stride || n * tam, base = a.byteOffset ?? 0;
    if (base + (a.count - 1) * stride + n * tam > v.value.bytes.length && a.count > 0) return no(`accessors[${i}]`, "se sale de su vista");
    const dv = new DataView(v.value.bytes.buffer, v.value.bytes.byteOffset, v.value.bytes.byteLength);
    const norm = a.normalized === true;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const at = base + k * stride + c * tam;
      let x: number;
      switch (a.componentType) {
        case 5120: x = dv.getInt8(at); if (norm) x = Math.max(x / 127, -1); break;
        case 5121: x = dv.getUint8(at); if (norm) x /= 255; break;
        case 5122: x = dv.getInt16(at, true); if (norm) x = Math.max(x / 32767, -1); break;
        case 5123: x = dv.getUint16(at, true); if (norm) x /= 65535; break;
        case 5125: x = dv.getUint32(at, true); break;
        default: x = dv.getFloat32(at, true);
      }
      out[k * n + c] = x;
    }
    return { ok: true, value: out };
  };

  // the scene's nodes, parents first, with their world matrices
  const nodos = j.nodes ?? [];
  const raices = j.scenes?.[j.scene ?? 0]?.nodes ?? (j.scenes?.length ? [] : nodos.map((_, i) => i).filter((i) => !nodos.some((n) => n.children?.includes(i))));
  const pila: [number, M4][] = raices.map((i) => [i, identidad()]);
  const visitados = new Set<number>();
  const vertices: number[] = [], indices: number[] = [], saltadas: string[] = [];
  let triangulos = 0, conMalla = 0;
  while (pila.length) {
    const [i, padre] = pila.pop()!;
    const n = nodos[i];
    if (!n || visitados.has(i)) continue;
    visitados.add(i);
    const m = multiplicar(padre, matrizDe(n));
    for (const c of [...(n.children ?? [])].reverse()) pila.push([c, m]); // popped in document order
    if (n.mesh === undefined) continue;
    const malla = j.meshes?.[n.mesh];
    if (!malla) return no(`nodes[${i}].mesh`, `la malla ${n.mesh} no existe`);
    conMalla++;
    for (const [pi, p] of malla.primitives.entries()) {
      const donde = `meshes[${n.mesh}].primitives[${pi}]`;
      const modo = p?.mode ?? 4;
      if (!p) continue;
      if (modo !== 4 && modo !== 5 && modo !== 6) { saltadas.push(`${donde}: modo ${modo} (puntos o líneas), no son triángulos`); continue; }
      if (p.extensions?.KHR_draco_mesh_compression) return no(donde, "viene comprimida con Draco: no tengo descodificador");
      if (p.attributes.POSITION === undefined) { saltadas.push(`${donde}: sin POSITION`); continue; }
      const pos = leer(p.attributes.POSITION, "VEC3");
      if (!pos.ok) return no(`${donde}.${pos.issues[0].path}`, pos.issues[0].message);
      const nv = pos.value.length / 3, base = vertices.length / 3;
      let idx: ArrayLike<number>;
      if (p.indices !== undefined) {
        const r = leer(p.indices, "SCALAR");
        if (!r.ok) return no(`${donde}.${r.issues[0].path}`, r.issues[0].message);
        idx = r.value;
      } else idx = Array.from({ length: nv }, (_, k) => k);
      for (let k = 0; k < idx.length; k++) if (idx[k] >= nv) return no(`${donde}.indices`, `un índice (${idx[k]}) apunta fuera de sus ${nv} vértices`);
      // vertices through the node's world matrix
      for (let k = 0; k < nv; k++) {
        const x = pos.value[k * 3], y = pos.value[k * 3 + 1], z = pos.value[k * 3 + 2];
        vertices.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
      const tri = (a: number, b: number, c: number) => { indices.push(base + idx[a], base + idx[b], base + idx[c]); triangulos++; };
      if (modo === 4) for (let k = 0; k + 2 < idx.length; k += 3) tri(k, k + 1, k + 2);
      else if (modo === 5) for (let k = 0; k + 2 < idx.length; k++) (k % 2 === 0 ? tri(k, k + 1, k + 2) : tri(k + 1, k, k + 2)); // strip keeps its winding
      else for (let k = 1; k + 1 < idx.length; k++) tri(0, k, k + 1);
    }
    if (triangulos > max) return no("meshes", `más de ${max} triángulos (ya van ${triangulos}): en una malla de colisión caben ${max}; marca un nodo colisionador o simplifica el modelo`);
  }
  if (!conMalla) return no("scenes", "la escena no tiene ninguna malla: nada con lo que chocar");
  if (!triangulos) return no("meshes", `ninguna primitiva da triángulos${saltadas.length ? ` (${saltadas[0]})` : ""}`);
  return { ok: true, value: { vertices: Float32Array.from(vertices), indices: Uint32Array.from(indices), triangulos, nodos: conMalla, saltadas, decodificado } };
}
