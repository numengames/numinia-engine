import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { aligerar, aligerarHdr, BITS_HDR, datosAccesor, escribirHdr, juntarGlb, leerHdr, partirGlb, sinIccSrgb, TOL_MORFO } from "../tools/aligerar-activos.ts";
import { aVista } from "../features/entorno/client.ts";

// E3: the house avatars, animations and sky, lighter without changing what the page reads.
const catalogo = JSON.parse(readFileSync("activos/avatares/catalogo.json", "utf8"));
const suelos = JSON.parse(readFileSync("features/entorno/suelos.json", "utf8"));

test("E3: every house avatar and animation is meshopt-packed (and the avatars' textures WebP); the sky keeps 6 mantissa bits", async () => {
  for (const m of [...catalogo.modelos, ...Object.values(catalogo.animaciones) as { fichero: string }[]]) {
    const b = new Uint8Array(readFileSync(m.fichero));
    const r = await aligerar(b);
    assert.ok(r.bytes === null, `${m.fichero}: rerun node tools/aligerar-activos.ts`); // never assert.equal on the bytes: a failure would print the whole array and eat all the memory
    const { json } = partirGlb(b);
    if (!m.fichero.endsWith(".vrma")) assert.ok(json.extensionsRequired?.includes("EXT_meshopt_compression"), m.fichero);
    if (m.fichero.endsWith(".vrm")) assert.deepEqual(json.images.map((i: { mimeType: string }) => i.mimeType), ["image/webp"]);
  }
  const cielo = new Uint8Array(readFileSync(suelos.cielos.nublado.fichero));
  assert.equal(aligerarHdr(cielo).bytes, null, "rerun node tools/aligerar-activos.ts");
  assert.equal(leerHdr(cielo).ancho, 1024, "same size as Poly Haven's 1k");
});

test("E3: a world saved with the old sky's sha256 gets the new one", () => {
  const nuevo = suelos.cielos.nublado.hdr, viejo = suelos.cielos.nublado.antes[0];
  assert.equal(aVista({ hdr: viejo }).hdr, nuevo);
  assert.equal(aVista({ hdr: nuevo }).hdr, nuevo);
  assert.equal(aVista({ hdr: "" }).hdr, "");
});

/** A small glb: a 20×20 grid (400 vertices, 722 triangles), one morph target that moves only vertex 2 and leaves
 * float residue (1e-7, -2e-7 m: what the house avatars' exporter left) on the others. */
function glbDePrueba(): Uint8Array {
  const N = 20, nv = N * N, pos = new Float32Array(nv * 3), morf = new Float32Array(nv * 3), tri: number[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = y * N + x; pos.set([x / 10, y / 10, 0], v * 3); morf.set([v % 2 ? 1e-7 : 0, v % 3 ? -2e-7 : 0, 0], v * 3); }
  morf.set([0, 0.25, 0], 2 * 3);
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const v = y * N + x; tri.push(v, v + 1, v + N + 1, v, v + N + 1, v + N); }
  const idx = new Uint16Array(tri), pb = pos.byteLength, ib = idx.byteLength, mb = morf.byteLength;
  const bin = new Uint8Array(pb + ib + mb);
  bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(idx.buffer), pb); bin.set(new Uint8Array(morf.buffer), pb + ib);
  const json = {
    asset: { version: "2.0" }, extensionsUsed: ["VRM"], extensions: { VRM: { meta: { title: "prueba", licenseName: "CC0" } } },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb }, { buffer: 0, byteOffset: pb, byteLength: ib }, { buffer: 0, byteOffset: pb + ib, byteLength: mb }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: "VEC3", min: [0, 0, 0], max: [1.9, 1.9, 0] },
      { bufferView: 1, componentType: 5123, count: tri.length, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: nv, type: "VEC3", min: [0, -2e-7, 0], max: [1e-7, 0.25, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, targets: [{ POSITION: 2 }] }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  };
  return juntarGlb(json, bin);
}

test("E3: aligerar keeps every index and extension, packs with meshopt, makes the shape sparse, and decodes to the same values", async () => {
  const antes = glbDePrueba();
  const r = await aligerar(antes);
  assert.ok(r.bytes, r.informe.motivo);
  const a = partirGlb(antes), d = partirGlb(r.bytes!);
  assert.deepEqual(d.json.extensions, a.json.extensions);
  assert.deepEqual(d.json.meshes, a.json.meshes);
  assert.ok(d.json.extensionsRequired.includes("EXT_meshopt_compression"));
  assert.equal(d.json.accessors[2].sparse.count, 1, "only vertex 2 moves");
  assert.deepEqual(await datosAccesor(d.json, d.bin, 0), await datosAccesor(a.json, a.bin, 0));
  const m = new Float32Array((await datosAccesor(d.json, d.bin, 2)).slice().buffer);
  assert.deepEqual([...m].map((x, k) => (k === 7 ? x : Math.abs(x))).filter((x) => x !== 0), [0.25], "vertex 2 moved; the residue is 0");
  assert.ok(2e-7 < TOL_MORFO);
  assert.equal((await aligerar(r.bytes!)).informe.motivo, "ya viene comprimido", "twice = once");
});

test("E3: the sky keeps its size and exponents; each mantissa goes to the middle of its 6-bit step; twice = once; an sRGB ICC note is dropped, any other kept", () => {
  const rgbe = new Uint8Array([200, 101, 0, 130, 255, 1, 3, 120, 0, 0, 0, 0, 128, 128, 128, 133]);
  const hdr = escribirHdr({ cabecera: ["#?RADIANCE", "FORMAT=32-bit_rle_rgbe", ""], ancho: 4, alto: 1, rgbe });
  assert.deepEqual(leerHdr(hdr).rgbe, rgbe, "write → read gives the same pixels");
  const r = aligerarHdr(hdr);
  assert.ok(r.bytes && BITS_HDR === 6);
  assert.deepEqual([...leerHdr(r.bytes!).rgbe], [202, 102, 0, 130, 254, 2, 2, 120, 0, 0, 0, 0, 130, 130, 130, 133]);
  assert.equal(aligerarHdr(r.bytes!).bytes, null);
  // PNG chunks: signature + iCCP(name, 0, zlib(profile)) + IEND
  const trozo = (tipo: string, d: Uint8Array) => { const o = new Uint8Array(12 + d.length); new DataView(o.buffer).setUint32(0, d.length); o.set(new TextEncoder().encode(tipo), 4); o.set(d, 8); return o; };
  const png = (perfil: string) => { const d = new Uint8Array([...new TextEncoder().encode("ICC"), 0, 0, ...deflateSync(new TextEncoder().encode(perfil))]); return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...trozo("iCCP", d), ...trozo("IEND", new Uint8Array())]); };
  assert.equal(sinIccSrgb(png("....desc GIMP built-in sRGB")).length, 8 + 12);
  const p3 = png("....desc Display P3");
  assert.equal(sinIccSrgb(p3), p3);
});
