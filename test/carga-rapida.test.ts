// N22: worlds that weigh half or less and show on a 4G phone — the model optimizer (packages/server/src/optimizar.ts),
// the lighter copies the server makes and serves gzipped (optimizar-cola.ts, activos.ts), the page compressed
// (pagina.ts), the room first and the far things last (packages/render/src/carga-orden.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { jsonDeGlb, mismaHuella, optimizarGlb, optimizarImagen, pngQueSeQueda } from "../packages/server/src/optimizar.ts";
import encodePng, { init as initPngEnc } from "@jsquash/png/encode.js";
import decodeWebp, { init as initWebpDec } from "@jsquash/webp/decode.js";
import { Activos } from "../packages/server/src/activos.ts";
import { ColaOptimizar, yaProbados } from "../packages/server/src/optimizar-cola.ts";
import { Pagina } from "../packages/server/src/pagina.ts";
import { startServer } from "../packages/server/src/server.ts";
import { LEJOS_M, ordenCarga, puedeEmpezar } from "../packages/render/src/carga-orden.ts";
import { aDibujo } from "../features/objetos/client.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A heavy model: a 64x64 grid of float vertices (what an exported hall looks like), one material, no textures. */
async function rejilla(n = 64, nombre = "suelo"): Promise<Uint8Array> {
  const doc = new Document(), buf = doc.createBuffer();
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j;
    pos.set([i * 0.5 - 16, Math.sin(i * 0.3) * Math.cos(j * 0.2), j * 0.5 - 16], k * 3); nor.set([0, 1, 0], k * 3); uv.set([i / (n - 1), j / (n - 1)], k * 2);
    if (i < n - 1 && j < n - 1) idx.push(k, k + 1, k + n, k + 1, k + n + 1, k + n);
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial("piedra").setBaseColorFactor([0.6, 0.5, 0.4, 1]));
  const nodo = doc.createNode(nombre).setMesh(doc.createMesh(nombre).addPrimitive(prim));
  doc.createScene("escena").addChild(nodo);
  return new NodeIO().writeBinary(doc);
}

test("optimizar: a heavy .glb is less than half, draws the same (bounds, triangles, nodes) and three can read it (meshopt + quantization)", async () => {
  const glb = await rejilla();
  const r = await optimizarGlb(glb);
  assert.ok(r.bytes, r.motivo);
  assert.ok(r.despues < r.antes / 2, `${r.antes} → ${r.despues}`);
  const json = jsonDeGlb(r.bytes!)!;
  assert.ok(json.extensionsUsed!.includes("EXT_meshopt_compression"));
  assert.ok(json.extensionsUsed!.includes("KHR_mesh_quantization"));
  assert.deepEqual((json as { extensionsRequired?: string[] }).extensionsRequired?.sort(), ["EXT_meshopt_compression", "KHR_mesh_quantization"]);
  // read back with the decoder (what the page does with three's): same triangles, same box within 1/10,000
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.readBinary(r.bytes!);
  const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  assert.equal(p.getIndices()!.getCount(), 63 * 63 * 6);
  assert.equal(doc.getRoot().listNodes()[0].getName(), "suelo"); // names kept: features find parts by name
  assert.equal(doc.getRoot().listMaterials()[0].getName(), "piedra");
  assert.equal(r.huella!.triangulos, 63 * 63 * 2);
});

test("optimizar: what it leaves as it is — already compressed, unknown extensions (VRM), not a glb", async () => {
  const una = await optimizarGlb((await optimizarGlb(await rejilla())).bytes!);
  assert.equal(una.bytes, null); assert.match(una.motivo!, /ya viene comprimido/);
  // a VRM: its extension is not one gltf-transform knows, so it would be dropped: never touched
  const vrm = JSON.parse(new TextDecoder().decode((await rejilla(8)).subarray(20, 20 + new DataView((await rejilla(8)).buffer).getUint32(12, true))));
  vrm.extensionsUsed = ["VRMC_vrm"]; vrm.extensions = { VRMC_vrm: { specVersion: "1.0" } };
  const base = await rejilla(8), n = new DataView(base.buffer, base.byteOffset).getUint32(12, true);
  const enc = new TextEncoder().encode(JSON.stringify(vrm)), jb = new Uint8Array(Math.ceil(enc.length / 4) * 4).fill(0x20); jb.set(enc);
  const rest = base.subarray(20 + n), out = new Uint8Array(20 + jb.length + rest.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true); dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20); out.set(rest, 20 + jb.length);
  const v = await optimizarGlb(out);
  assert.equal(v.bytes, null); assert.match(v.motivo!, /VRMC_vrm/);
  assert.match((await optimizarGlb(new TextEncoder().encode("no soy un glb, soy un texto largo"))).motivo!, /no es un .glb/);
});

test("optimizar: the check catches a model that would draw differently", () => {
  const a = { triangulos: 10, nodos: 2, texturas: 1, animaciones: 0, min: [0, 0, 0], max: [10, 10, 10] };
  assert.equal(mismaHuella(a, { ...a, min: [0.0005, 0, 0] }), null); // 1/20,000 of the side: quantization
  assert.match(mismaHuella(a, { ...a, min: [0.01, 0, 0] })!, /caja/);
  assert.match(mismaHuella(a, { ...a, triangulos: 9 })!, /triángulos/);
  assert.match(mismaHuella(a, { ...a, texturas: 0 })!, /texturas/);
  assert.match(mismaHuella(a, { ...a, animaciones: 1 })!, /animaciones/);
});

test("an uploaded .glb gets its lighter copy in the background; /a/ serves it gzipped, the original stays as it is", async () => {
  const dir = tmp("n22-subidas-"), glb = await rejilla(), h = sha(glb);
  writeFileSync(join(dir, `${h}.glb`), glb);
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, subidas: dir, features: [], log: () => {}, optimizar: true });
  try {
    await srv.optimizar.esperar();
    assert.ok(existsSync(join(dir, "optimizados", `${h}.glb`)) && existsSync(join(dir, "optimizados", `${h}.glb.gz`)));
    assert.deepEqual(readFileSync(join(dir, `${h}.glb`)), Buffer.from(glb)); // the original never changes
    assert.ok(yaProbados(join(dir, "optimizados")).has(`${h}.glb`));
    const r = await fetch(`http://127.0.0.1:${srv.port}/a/${h}.glb`, { headers: { "accept-encoding": "gzip" } });
    assert.equal(r.headers.get("x-optimizado"), "meshopt");
    assert.equal(r.headers.get("vary"), "accept-encoding");
    const cuerpo = new Uint8Array(await r.arrayBuffer()); // fetch undoes the gzip
    assert.ok(jsonDeGlb(cuerpo)!.extensionsUsed!.includes("EXT_meshopt_compression"));
    // a range (a resumed download) gets the plain copy, never a slice of the gzip
    const rg = await fetch(`http://127.0.0.1:${srv.port}/a/${h}.glb`, { headers: { range: "bytes=0-3", "accept-encoding": "gzip" } });
    assert.equal(rg.status, 206); assert.equal(rg.headers.get("content-encoding"), null);
    assert.equal(new TextDecoder().decode(await rg.arrayBuffer()), "glTF");
  } finally { await srv.close(); }
});

test("MOTOR_OPTIMIZAR=no (optimizar: false): no copies, the file as it is", async () => {
  const dir = tmp("n22-no-"), glb = await rejilla(), h = sha(glb);
  writeFileSync(join(dir, `${h}.glb`), glb);
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, subidas: dir, features: [], log: () => {}, optimizar: false });
  try {
    await srv.optimizar.esperar();
    assert.equal(existsSync(join(dir, "optimizados")), false);
    const r = await fetch(`http://127.0.0.1:${srv.port}/a/${h}.glb`);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), glb);
  } finally { await srv.close(); }
});

test("Activos: a model without a copy is gzipped once and kept; pictures and video never", async () => {
  const dir = tmp("n22-act-"), glb = await rejilla(), h = sha(glb), png = new Uint8Array(4000).fill(7), hp = sha(png);
  writeFileSync(join(dir, `${h}.glb`), glb); writeFileSync(join(dir, `${hp}.png`), png);
  const a = new Activos(null, dir), cab: Record<string, string>[] = [];
  const res = () => { const chunks: Buffer[] = []; let h0: Record<string, string> = {}; return { r: { writeHead(_s: number, h: Record<string, string>) { h0 = h; cab.push(h); }, write(c: Buffer) { chunks.push(c); }, end(c?: Buffer) { if (c) chunks.push(c); }, on() { return this; }, once() { return this; }, emit() { return true; } } as never, cuerpo: () => Buffer.concat(chunks), cab: () => h0 }; };
  a.servir(`/a/${h}.glb`, res().r, true, undefined, "gzip, br"); // the first one starts the gzip
  await new Promise((ok) => setTimeout(ok, 300));
  const x = res(); a.servir(`/a/${h}.glb`, x.r, false, undefined, "gzip, br");
  assert.equal(x.cab()["content-encoding"], "gzip");
  assert.deepEqual(gunzipSync(x.cuerpo()), Buffer.from(glb));
  const y = res(); a.servir(`/a/${hp}.png`, y.r, true, undefined, "gzip");
  assert.equal(y.cab()["content-encoding"], undefined);
});

test("the page: JS goes brotli (or gzip) to a browser that takes it, the same bytes inside; small files and pictures as they are", async () => {
  const dir = tmp("n22-www-"); mkdirSync(join(dir, "assets"));
  const js = "export const x = 1;\n".repeat(5000);
  writeFileSync(join(dir, "index.html"), `<!doctype html><title>t</title>${"<p>hola</p>".repeat(300)}`);
  writeFileSync(join(dir, "assets", "a.js"), js); writeFileSync(join(dir, "assets", "p.js"), "1;");
  const p = new Pagina(dir);
  await new Promise((ok) => setTimeout(ok, 500)); // brotli is made in the background
  const pedir = (path: string, ae: string) => {
    const chunks: Buffer[] = []; let h: Record<string, string> = {};
    const res = { writeHead(_s: number, x: Record<string, string>) { h = x; }, end(c?: Buffer) { if (c) chunks.push(Buffer.from(c)); }, write(c: Buffer) { chunks.push(c); }, on() { return this; }, once() { return this; }, emit() { return true; }, destroy() {} };
    const req = { headers: { "accept-encoding": ae } };
    return new Promise<{ h: Record<string, string>; b: Buffer }>((ok) => {
      const fin = res.end; res.end = (c?: Buffer) => { fin(c); ok({ h, b: Buffer.concat(chunks) }); };
      p.servir("GET", path, req as never, res as never);
    });
  };
  const br = await pedir("/assets/a.js", "gzip, deflate, br");
  assert.equal(br.h["content-encoding"], "br"); assert.equal(br.h.vary, "accept-encoding");
  assert.equal(brotliDecompressSync(br.b).toString(), js);
  assert.ok(br.b.length < js.length / 10);
  const gz = await pedir("/assets/a.js", "gzip");
  assert.equal(gz.h["content-encoding"], "gzip"); assert.equal(gunzipSync(gz.b).toString(), js);
  const html = await pedir("/", "gzip");
  assert.equal(html.h["content-encoding"], "gzip"); assert.match(gunzipSync(html.b).toString(), /<title>t<\/title>/);
});

test("load order: the room first (pinned or backdrop), then near, and far only when nothing near is left", () => {
  assert.equal(ordenCarga({ sala: true }, 500 ** 2), 0);
  assert.equal(ordenCarga({}, (LEJOS_M - 1) ** 2), 1);
  assert.equal(ordenCarga({}, (LEJOS_M + 1) ** 2), 2);
  assert.equal(puedeEmpezar(0, false), true);
  assert.equal(puedeEmpezar(1, false), false);
  assert.equal(puedeEmpezar(0, true), false);
  // the world's objects say which are the room
  const base = { modelo: "a".repeat(64), x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  assert.equal(aDibujo({ ...base, fijado: true }).sala, true);
  assert.equal(aDibujo({ ...base, decorado: true }).sala, true);
  assert.equal(aDibujo(base).sala, undefined);
});

test("the queue makes copies one at a time off the loop and stops clean", async () => {
  const dir = tmp("n22-cola-"), hs: string[] = [];
  for (const n of [40, 48, 56]) { const g = await rejilla(n, `m${n}`); const h = sha(g); hs.push(h); writeFileSync(join(dir, `${h}.glb`), g); }
  const a = new Activos(null, dir), log: string[] = [];
  const c = new ColaOptimizar(a, (l) => log.push(l), true);
  assert.equal(c.repasar(), 3);
  await c.esperar();
  assert.equal(c.stats.hechos, 3);
  for (const h of hs) assert.ok(existsSync(join(dir, "optimizados", `${h}.glb`)));
  assert.equal(new ColaOptimizar(a, () => {}, true).repasar(), 0); // the report remembers
  await c.parar();
});

/** A PNG with flat areas and a gradient (what UI pictures and posters look like), 256x256 RGBA. */
async function unPng(): Promise<Uint8Array> {
  await initPngEnc(readFileSync(new URL(import.meta.resolve("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"))) as never);
  const d = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4; d[i] = x < 128 ? 200 : x; d[i + 1] = y; d[i + 2] = (x * y) % 7 ? 40 : 90; d[i + 3] = y < 20 ? 128 : 255; }
  return new Uint8Array(await encodePng({ data: d, width: 256, height: 256, colorSpace: "srgb" } as never));
}

test("a PNG becomes lossless WebP: exactly the same pixels, smaller; one with its own colour or gamma stays", async () => {
  const png = await unPng();
  const r = await optimizarImagen(png, "png");
  assert.ok(r.bytes, r.motivo); assert.equal(r.ext, "webp");
  assert.ok(r.despues < r.antes, `${r.antes} → ${r.despues}`);
  await initWebpDec(new WebAssembly.Module(readFileSync(new URL(import.meta.resolve("@jsquash/webp/codec/dec/webp_dec.wasm")))));
  const back = await decodeWebp(r.bytes!.slice().buffer);
  assert.equal(back.width, 256);
  // the same pixels as the PNG itself (compared inside optimizarImagen too): spot-check the gradient and the alpha
  assert.deepEqual([...back.data.slice(0, 4)], [200, 0, 90, 128]);
  assert.deepEqual([...back.data.slice((100 * 256 + 200) * 4, (100 * 256 + 200) * 4 + 4)], [200, 100, 40, 255]);
  // a gAMA chunk right after IHDR: stays as it is
  const g = new Uint8Array(png.length + 16); g.set(png.subarray(0, 33)); g.set([0, 0, 0, 4, 0x67, 0x41, 0x4d, 0x41, 0, 0, 0xb1, 0x8f, 0, 0, 0, 0], 33); g.set(png.subarray(33), 49);
  assert.match(pngQueSeQueda(g)!, /gAMA/);
  assert.match((await optimizarImagen(new Uint8Array(100), "jpg")).motivo!, /se queda/);
});

test("/a/<sha>.png: the WebP to a browser that takes it (Vary: Accept), the PNG to anyone else", async () => {
  const dir = tmp("n22-png-"), png = await unPng(), h = sha(png);
  writeFileSync(join(dir, `${h}.png`), png);
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, subidas: dir, features: [], log: () => {}, optimizar: true });
  try {
    await srv.optimizar.esperar();
    assert.ok(existsSync(join(dir, "optimizados", `${h}.png.webp`)));
    const w = await fetch(`http://127.0.0.1:${srv.port}/a/${h}.png`, { headers: { accept: "image/avif,image/webp,*/*" } });
    assert.equal(w.headers.get("content-type"), "image/webp"); assert.equal(w.headers.get("vary"), "accept");
    assert.equal(new TextDecoder().decode((await w.arrayBuffer()).slice(8, 12)), "WEBP");
    const p = await fetch(`http://127.0.0.1:${srv.port}/a/${h}.png`, { headers: { accept: "*/*" } });
    assert.equal(p.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await p.arrayBuffer()), png);
  } finally { await srv.close(); }
});
