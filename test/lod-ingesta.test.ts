// H13: levels of detail made at ingest (packages/server/src/lod.ts): a heavy still model gets two lighter versions with fewer
// triangles, the queue writes them beside the copy and the report says so, /a/<sha256>.lod1.glb serves them; a small model, an
// animated one or one that comes compressed gets none, with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { Activos } from "../packages/server/src/activos.ts";
import { generarLods, LOD_CAJA_MAX, LOD_MAX_RELATIVO, LOD_TRIANGULOS_MIN } from "../packages/server/src/lod.ts";
import { ColaOptimizar, yaProbados } from "../packages/server/src/optimizar-cola.ts";
import { optimizarGlb } from "../packages/server/src/optimizar.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A smooth hill of n×n vertices (2·(n−1)² triangles): the kind of surface that simplifies well. */
async function colina(n = 64, animada = false): Promise<Uint8Array> {
  const doc = new Document(), buf = doc.createBuffer();
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j;
    pos.set([i * 0.25 - 8, Math.sin(i * 0.12) * Math.cos(j * 0.09) * 2, j * 0.25 - 8], k * 3); nor.set([0, 1, 0], k * 3);
    if (i < n - 1 && j < n - 1) idx.push(k, k + 1, k + n, k + 1, k + n + 1, k + n);
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial("piedra").setBaseColorFactor([0.6, 0.5, 0.4, 1]));
  const nodo = doc.createNode("colina").setMesh(doc.createMesh("colina").addPrimitive(prim));
  doc.createScene("escena").addChild(nodo);
  if (animada) {
    const t = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, 1])).setBuffer(buf);
    const v = doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 0, 1, 0])).setBuffer(buf);
    const s = doc.createAnimationSampler().setInput(t).setOutput(v);
    doc.createAnimation("sube").addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodo).setTargetPath("translation").setSampler(s));
  }
  return new NodeIO().writeBinary(doc);
}

async function triangulosDe(bytes: Uint8Array): Promise<{ triangulos: number; nodos: number; min: number[]; max: number[] }> {
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).readBinary(bytes);
  let triangulos = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) triangulos += (p.getIndices()?.getCount() ?? 0) / 3;
  const caja = getBounds(doc.getRoot().listScenes()[0]); // in metres, whatever the accessors are quantized to
  return { triangulos, nodos: doc.getRoot().listNodes().length, min: caja.min as number[], max: caja.max as number[] };
}

test("lod: a heavy still model gets two levels, each with fewer triangles, the same nodes and a box that holds; three can read them", async () => {
  const glb = await colina();
  const orig = await triangulosDe(glb);
  assert.ok(orig.triangulos >= LOD_TRIANGULOS_MIN, `${orig.triangulos} triangles`);
  const r = await generarLods(glb);
  assert.equal(r.motivo, undefined);
  assert.equal(r.triangulos, orig.triangulos);
  assert.deepEqual(r.lods.map((x) => x.nivel), [1, 2]);
  let antes = orig.triangulos;
  for (const l of r.lods) {
    assert.ok(l.triangulos <= antes * LOD_MAX_RELATIVO, `level ${l.nivel}: ${l.triangulos} of ${antes}`);
    const leido = await triangulosDe(l.bytes);
    assert.equal(leido.triangulos, l.triangulos);
    assert.equal(leido.nodos, orig.nodos);
    const lado = Math.max(...orig.max.map((x, i) => x - orig.min[i]));
    for (let i = 0; i < 3; i++) { assert.ok(Math.abs(leido.min[i] - orig.min[i]) <= lado * LOD_CAJA_MAX); assert.ok(Math.abs(leido.max[i] - orig.max[i]) <= lado * LOD_CAJA_MAX); }
    antes = l.triangulos;
  }
  assert.ok(r.lods[1].triangulos < orig.triangulos / 3, `level 2 keeps ${r.lods[1].triangulos} of ${orig.triangulos}`);
  assert.ok(r.lods[0].bytes.length < glb.length, "a level is also lighter on disk than the raw original");
});

test("lod: none for a small model, an animated one or one that already comes compressed — each with its reason", async () => {
  const chico = await generarLods(await colina(20)); // 722 triangles
  assert.equal(chico.lods.length, 0); assert.match(chico.motivo!, /triángulos/);
  const anim = await generarLods(await colina(64, true));
  assert.equal(anim.lods.length, 0); assert.match(anim.motivo!, /animaciones/);
  const comprimido = (await optimizarGlb(await colina(64)))!.bytes!;
  const c = await generarLods(comprimido);
  assert.equal(c.lods.length, 0); assert.match(c.motivo!, /comprimido/);
  const basura = await generarLods(new Uint8Array([1, 2, 3]));
  assert.equal(basura.lods.length, 0); assert.ok(basura.motivo);
});

test("lod: the queue writes the levels beside the copy, the report lists them, /a/<sha>.lod1.glb serves them (gzip too), the originals never change", async () => {
  const dir = tmp("h13-cola-"), glb = await colina(), h = sha(glb);
  writeFileSync(join(dir, `${h}.glb`), glb);
  const a = new Activos(null, dir), log: string[] = [];
  const c = new ColaOptimizar(a, (l) => log.push(l), true);
  c.pedir(h, "glb"); await c.esperar(); await c.parar();
  const opt = join(dir, "optimizados");
  for (const n of [1, 2]) { assert.ok(existsSync(join(opt, `${h}.lod${n}.glb`)), `lod${n}`); assert.ok(existsSync(join(opt, `${h}.lod${n}.glb.gz`)), `lod${n}.gz`); }
  const linea = JSON.parse(readFileSync(join(opt, "informe.jsonl"), "utf8").trim().split("\n").pop()!);
  assert.equal(linea.lods.length, 2); assert.ok(linea.triangulos > linea.lods[0].triangulos && linea.lods[0].triangulos > linea.lods[1].triangulos);
  assert.equal(linea.lods[0].bytes, readFileSync(join(opt, `${h}.lod1.glb`)).length);
  assert.ok(log.some((l) => /niveles de detalle/.test(l)), log.join("\n"));
  assert.deepEqual(readFileSync(join(dir, `${h}.glb`)), Buffer.from(glb)); // the original is untouched
  assert.ok(yaProbados(opt).has(`${h}.glb`));
  // served: the level itself, the gzip to a page that takes it, a 404 for a level that does not exist
  const pedir = (path: string, ae = "") => { const ch: Buffer[] = []; let est = 0, cab: Record<string, string> = {}; const res = { writeHead(s: number, x: Record<string, string>) { est = s; cab = x; }, write(x: Buffer) { ch.push(Buffer.from(x)); }, end(x?: Buffer | string) { if (x) ch.push(Buffer.from(x)); }, on() { return this; }, once() { return this; }, emit() { return true; } };
    a.servir(path, res as never, false, undefined, ae); return new Promise<{ est: number; cab: Record<string, string>; cuerpo: Buffer }>((ok) => setTimeout(() => ok({ est, cab, cuerpo: Buffer.concat(ch) }), 150)); };
  const plano = await pedir(`/a/${h}.lod2.glb`);
  assert.equal(plano.est, 200); assert.equal(plano.cab["x-optimizado"], "lod2"); assert.match(plano.cab["cache-control"], /immutable/);
  assert.deepEqual(plano.cuerpo, readFileSync(join(opt, `${h}.lod2.glb`)));
  await pedir(`/a/${h}.lod1.glb`, "gzip");
  const gz = await pedir(`/a/${h}.lod1.glb`, "gzip");
  assert.equal(gz.cab["content-encoding"], "gzip"); assert.deepEqual(gunzipSync(gz.cuerpo), readFileSync(join(opt, `${h}.lod1.glb`)));
  assert.equal((await pedir(`/a/${"0".repeat(64)}.lod1.glb`)).est, 404);
});

test("lod: a report line from before H13 (no `lods`) does not count as done, so an old world's models are revisited once", async () => {
  const dir = tmp("h13-viejo-"), glb = await colina(), h = sha(glb);
  writeFileSync(join(dir, `${h}.glb`), glb);
  const opt = join(dir, "optimizados"); await import("node:fs/promises").then((f) => f.mkdir(opt));
  writeFileSync(join(opt, "informe.jsonl"), JSON.stringify({ cuando: "2026-10-18T00:00:00Z", sha256: h, tipo: "glb", antes: 1, despues: 1, ms: 1, motivo: "solo ahorra 3 %" }) + "\n");
  assert.equal(yaProbados(opt).has(`${h}.glb`), false);
  const a = new Activos(null, dir), c = new ColaOptimizar(a, () => {}, true);
  assert.equal(c.repasar(), 1); await c.esperar(); await c.parar();
  assert.ok(existsSync(join(opt, `${h}.lod1.glb`)));
  assert.equal(yaProbados(opt).has(`${h}.glb`), true);
});
