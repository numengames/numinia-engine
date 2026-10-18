// M6 h1-h2: the collision schema of things (objetos v6, `colision: ninguna | caja | malla`, additive over `solido`) and
// the triangles of a .glb read on the server (packages/server/src/colision-glb.ts): node transforms, indices or none,
// quantized positions, meshopt decoded, Draco and sparse refused with the reason, the count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { triangulosDeGlb, trozosDeGlb, TRIANGULOS_MAX_MALLA } from "../packages/server/src/colision-glb.ts";
import { optimizarGlb } from "../packages/server/src/optimizar.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { defineSchema, validate } from "../packages/schema/src/index.ts";
import { objetos, colisionDe, COLISIONES } from "../features/objetos/feature.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import { solidsFrom } from "../packages/sim/src/index.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };

const ROOT = new URL("../", import.meta.url).pathname;
const BLOQUE = biblioteca.modelos.find((m) => m.id === "bloque")!.modelo;

// ---- a tiny .glb writer, so the tests own every byte they read ----
function glb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const total = 12 + 8 + j.length + jp + (bin ? 8 + bin.length + bp : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  if (bin) { const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8); }
  return out;
}
/** Two triangles (a quad on y=0, 1 × 1 m): positions float, indices u16. */
const QUAD = { pos: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], idx: [0, 1, 2, 0, 2, 3] };
function quadGlb(opts: { indices?: boolean; nodes?: unknown[]; scene?: number[]; mode?: number; componentType?: number; normalized?: boolean; scale?: number; extensionsRequired?: string[]; extra?: Record<string, unknown> } = {}) {
  const ct = opts.componentType ?? 5126, s = opts.scale ?? 1;
  const posBytes = ct === 5126 ? new Uint8Array(new Float32Array(QUAD.pos).buffer)
    : ct === 5122 ? new Uint8Array(new Int16Array(QUAD.pos.map((v) => Math.round(v * s))).buffer)
    : new Uint8Array(QUAD.pos.map((v) => Math.round(v * s)));
  const posPad = (4 - (posBytes.length % 4)) % 4;
  const idxBytes = new Uint8Array(new Uint16Array(QUAD.idx).buffer);
  const bin = new Uint8Array(posBytes.length + posPad + idxBytes.length); bin.set(posBytes); bin.set(idxBytes, posBytes.length + posPad);
  const indexed = opts.indices !== false;
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: opts.scene ?? [0] }],
    nodes: opts.nodes ?? [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, ...(indexed ? { indices: 1 } : {}), ...(opts.mode !== undefined ? { mode: opts.mode } : {}) }] }],
    accessors: [{ bufferView: 0, componentType: ct, count: 4, type: "VEC3", ...(opts.normalized ? { normalized: true } : {}) }, { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes.length }, { buffer: 0, byteOffset: posBytes.length + posPad, byteLength: idxBytes.length }],
    buffers: [{ byteLength: bin.length }],
    ...(opts.extensionsRequired ? { extensionsRequired: opts.extensionsRequired, extensionsUsed: opts.extensionsRequired } : {}),
    ...(opts.extra ?? {}),
  };
  return glb(json, bin);
}
const caja = (v: Float32Array) => { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[i + k]); max[k] = Math.max(max[k], v[i + k]); } return { min, max }; };
const cerca = (a: number[], b: number[], tol = 1e-5) => a.every((x, i) => Math.abs(x - b[i]) <= tol);
const ok = async <T,>(r: Promise<{ ok: true; value: T } | { ok: false; issues: { path: string; message: string }[] }>): Promise<T> => { const v = await r; assert.ok(v.ok, v.ok ? "" : JSON.stringify(v.issues)); return v.value; };

test("h2: the house models give their triangles: bloque 12, farolillo 220, RobotExpressive 3237 (74 nodes, 14 meshes, skins)", async () => {
  for (const [f, tris] of [["activos/casa/bloque.glb", 12], ["activos/casa/farolillo.glb", 220], ["activos/robot/RobotExpressive.glb", 3237]] as const) {
    const t = await ok(triangulosDeGlb(readFileSync(join(ROOT, f))));
    assert.equal(t.triangulos, tris, f);
    assert.equal(t.indices.length, tris * 3, f);
    assert.ok(t.vertices.length >= 9 && t.vertices.length % 3 === 0, f);
    assert.deepEqual(t.saltadas, [], f);
    for (const i of t.indices) assert.ok(i < t.vertices.length / 3, `${f}: índice fuera`);
  }
  const bloque = await ok(triangulosDeGlb(readFileSync(join(ROOT, "activos/casa/bloque.glb"))));
  assert.equal(bloque.nodos, 1);
  const c = caja(bloque.vertices); // the house block is one metre each way, centred at the origin (tools/hacer-bloque.mjs)
  assert.ok(cerca([c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]], [1, 1, 1], 1e-3), JSON.stringify(c));
});

test("h2: a .glb without indices gives the same triangles; a strip and a fan count n-2; points are skipped and named", async () => {
  const a = await ok(triangulosDeGlb(quadGlb()));
  const b = await ok(triangulosDeGlb(quadGlb({ indices: false })));
  assert.equal(a.triangulos, 2); assert.deepEqual([...a.indices], QUAD.idx);
  assert.equal(b.triangulos, 1); assert.deepEqual([...b.indices], [0, 1, 2]); // 4 vertices, no indices: one whole triangle
  assert.deepEqual([...a.vertices], QUAD.pos);
  const strip = await ok(triangulosDeGlb(quadGlb({ mode: 5 })));
  assert.equal(strip.triangulos, 4); // 6 indices as a strip
  assert.deepEqual([...strip.indices].slice(0, 6), [0, 1, 2, 2, 1, 0]); // the second one flips to keep the winding
  const fan = await ok(triangulosDeGlb(quadGlb({ mode: 6 })));
  assert.equal(fan.triangulos, 4);
  const puntos = await triangulosDeGlb(quadGlb({ mode: 0 }));
  assert.ok(!puntos.ok && /ninguna primitiva/.test(puntos.issues[0].message) && /modo 0/.test(puntos.issues[0].message), JSON.stringify(puntos));
});

test("h2: node transforms are applied, parents first: matrix, TRS, a mesh under two nodes is two colliders; nodes off the scene are ignored", async () => {
  const dos = quadGlb({
    nodes: [
      { children: [1, 2], translation: [10, 0, 0] },
      { mesh: 0, matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 5, 0, 1] },   // scale 2, up 5
      { mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [1, 1, 3] }, // 90° about Y, z × 3
      { mesh: 0, translation: [999, 999, 999] },                                    // not in the scene
    ],
  });
  const t = await ok(triangulosDeGlb(dos));
  assert.equal(t.nodos, 2); assert.equal(t.triangulos, 4); assert.equal(t.vertices.length, 24);
  const v = [...t.vertices];
  // node 1: quad 0..1 scaled ×2 → 0..2, +5 up, +10 x from the parent
  assert.ok(cerca(v.slice(0, 3), [10, 5, 0]) && cerca(v.slice(6, 9), [12, 5, 2]), JSON.stringify(v.slice(0, 12)));
  // node 2: (x, 0, z) → rotated 90° about Y: (z·3, 0, -x), then +10 x
  const c = caja(Float32Array.from(v.slice(12)));
  assert.ok(cerca(c.min, [10, 0, -1]) && cerca(c.max, [13, 0, 0]), JSON.stringify(c));
  assert.ok(v.every((x) => x < 100), "the node off the scene must not appear");
});

test("h2: KHR_mesh_quantization positions (short, byte, normalized or not) read back in metres", async () => {
  const corto = await ok(triangulosDeGlb(quadGlb({ componentType: 5122, scale: 1000, nodes: [{ mesh: 0, scale: [0.001, 0.001, 0.001] }], extensionsRequired: ["KHR_mesh_quantization"] })));
  assert.ok(cerca([...corto.vertices], QUAD.pos, 1e-6), JSON.stringify([...corto.vertices]));
  const byte = await ok(triangulosDeGlb(quadGlb({ componentType: 5121, scale: 255, normalized: true, extensionsRequired: ["KHR_mesh_quantization"] })));
  assert.ok(cerca([...byte.vertices], QUAD.pos, 1e-6), JSON.stringify([...byte.vertices]));
  const firmado = await ok(triangulosDeGlb(quadGlb({ componentType: 5120, scale: 127, normalized: true, extensionsRequired: ["KHR_mesh_quantization"] })));
  assert.ok(cerca([...firmado.vertices], QUAD.pos, 1e-6));
});

test("h2: a meshopt-compressed copy (what the optimizer makes) decodes to the same triangles and the same box", async () => {
  const bytes = readFileSync(join(ROOT, "activos/casa/farolillo.glb"));
  const r = await optimizarGlb(bytes);
  if (!r.bytes) { console.log(`meshopt copy not made (${r.motivo}): skipped`); return; }
  const antes = await ok(triangulosDeGlb(bytes)), despues = await ok(triangulosDeGlb(r.bytes));
  assert.deepEqual(despues.decodificado, ["meshopt"]);
  assert.equal(despues.triangulos, antes.triangulos);
  assert.equal(despues.indices.length, antes.indices.length);
  const a = caja(antes.vertices), b = caja(despues.vertices);
  assert.ok(cerca(a.min, b.min, 0.01) && cerca(a.max, b.max, 0.01), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`); // quantized to well under a centimetre
});

test("h2: what cannot be read is refused with the reason: Draco, sparse, external buffer, not a glb, too many triangles", async () => {
  const draco = await triangulosDeGlb(quadGlb({ extensionsRequired: ["KHR_draco_mesh_compression"] }));
  assert.ok(!draco.ok && /Draco/.test(draco.issues[0].message));
  const disperso = quadGlb({ extra: {} });
  const t = trozosDeGlb(disperso); assert.ok(t.ok);
  const j = t.value.json as { accessors: Record<string, unknown>[] };
  j.accessors[0].sparse = { count: 1 };
  const sp = await triangulosDeGlb(glb(j, t.value.bin));
  assert.ok(!sp.ok && /disperso \(sparse\)/.test(sp.issues[0].message) && /accessors\[0\]/.test(sp.issues[0].path), JSON.stringify(sp));
  const t2 = trozosDeGlb(quadGlb()); assert.ok(t2.ok);
  const fuera = await triangulosDeGlb(glb({ ...(t2.value.json as object), buffers: [{ byteLength: 4, uri: "fuera.bin" }] }, t2.value.bin));
  assert.ok(!fuera.ok && /fuera del fichero/.test(fuera.issues[0].message), JSON.stringify(fuera));
  const nada = await triangulosDeGlb(new TextEncoder().encode("hola, no soy un glb, de verdad que no"));
  assert.ok(!nada.ok && /glTF/.test(nada.issues[0].message));
  const vacio = await triangulosDeGlb(glb({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], nodes: [] }, null));
  assert.ok(!vacio.ok && /ninguna malla/.test(vacio.issues[0].message));
  const muchos = await triangulosDeGlb(quadGlb(), { max: 1 });
  assert.ok(!muchos.ok && /más de 1 triángulos/.test(muchos.issues[0].message), JSON.stringify(muchos));
  assert.equal(TRIANGULOS_MAX_MALLA, 50_000);
});

// ---- h1: the schema ----
test("h1: objetos is version 6 with colision ninguna|caja|malla; a v5 value (no colision) validates and reads as caja when it was solid", () => {
  assert.equal(objetos.version, 6);
  assert.deepEqual([...COLISIONES], ["ninguna", "caja", "malla"]);
  assert.equal(objetos.issues.length, 0, JSON.stringify(objetos.issues));
  const s = defineSchema("objetos.state", 6, objetos.state!.fields);
  const v5 = { modelo: BLOQUE, x: 1, y: 0, z: 2, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, nombre: "", decorado: true, fijado: false, animar: true, tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: true, bx0: 0, by0: 0, bz0: 0, bx1: 1, by1: 1, bz1: 1, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
  const r = validate(s, v5);
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues));
  assert.equal(r.value.colision, "ninguna"); // the schema's default: the server reads it with colisionDe
  assert.equal(colisionDe(r.value), "caja");
  assert.equal(colisionDe({ ...r.value, solido: false }), "ninguna");
  assert.equal(colisionDe({ solido: true, colision: "malla" }), "malla");
  assert.equal(colisionDe(undefined), "ninguna");
  const r6 = validate(s, { ...v5, colision: "malla" });
  assert.ok(r6.ok && r6.value.colision === "malla");
  const mal = validate(s, { ...v5, colision: "esfera" });
  assert.ok(!mal.ok);
  // the wire: a solid box still comes out of the same fields the simulation reads (nothing changed for the pages)
  assert.equal(solidsFrom([["o1", r.value]]).length, 6);
});

const PNG = "f".repeat(64);
function world(opts: { storage?: FileStorage; n?: number } = {}) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {}, storage: opts.storage, puede: (_w, accion) => accion === "construir",
    activo: (h, e) => h === PNG && e === "png" });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; b: ReturnType<typeof crearCliente>["constructor"] }[] = [];
  for (let i = 0; i < (opts.n ?? 1); i++) {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
    pages.push({ s, t, b: cli.constructor });
  }
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump };
}
const CAJA_PROPIA: [number, number, number, number, number, number] = [-0.5, 0, -0.5, 0.5, 1, 0.5];

test("h1: ajustar writes colision and keeps solido coherent: caja, malla (models only), ninguna; an old page's solido:true is caja", () => {
  const { pages, pump } = world();
  const [a] = pages;
  assert.ok(a.b.colocar("bloque").ok); pump();
  const id = [...a.s.features.stateOf("objetos").keys()][0];
  const o = () => a.s.features.stateOf("objetos").get(id)!;
  assert.equal(o().colision, "ninguna"); assert.equal(o().solido, false);
  a.b.seleccionar(id);
  assert.ok(a.b.ajustar({ colision: "malla", caja: CAJA_PROPIA }).ok); pump();
  assert.equal(o().colision, "malla"); assert.equal(o().solido, true); assert.equal(o().bx1, 0.5); // malla keeps its box until h5 (never worse than caja)
  assert.ok(a.b.ajustar({ solido: false }).ok); pump();
  assert.equal(o().colision, "ninguna"); assert.equal(o().solido, false);
  assert.ok(a.b.ajustar({ solido: true }).ok); pump(); // the box is kept in the store: zeros keep it
  assert.equal(o().colision, "caja"); assert.equal(o().solido, true); assert.equal(o().bx1, 0.5);
  assert.ok(a.b.ajustar({ volumen: 0.5 }).ok); pump(); // an unrelated change keeps the collision
  assert.equal(o().colision, "caja"); assert.equal(o().solido, true);
  // a page from before v6 sends only solido (no colision at all): caja
  a.t.flush();
  a.s.features.send("objetos", "ajustar", { id, oculto: false, volumen: 1, solido: true, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8 });
  pump();
  assert.equal(o().colision, "caja"); assert.equal(o().solido, true);
});

test("h1: malla is refused for a picture, with the reason (a box is fine); a saved v5 world comes back with colision: caja written", async () => {
  {
    const { pages, pump } = world();
    const [a] = pages;
    assert.ok(a.b.colocarFichero(PNG, "png", "Cartel").ok); pump();
    const id = [...a.s.features.stateOf("objetos").keys()][0];
    a.b.seleccionar(id);
    assert.ok(a.b.ajustar({ colision: "malla", caja: CAJA_PROPIA }).ok); pump();
    assert.match(a.b.estado.ultimoRechazo, /Solo un modelo 3D/);
    assert.equal(a.s.features.stateOf("objetos").get(id)!.colision, "ninguna");
    assert.ok(a.b.ajustar({ colision: "caja", caja: CAJA_PROPIA }).ok); pump();
    assert.equal(a.s.features.stateOf("objetos").get(id)!.colision, "caja");
  }
  const dir = mkdtempSync(join(tmpdir(), "m6-colision-"));
  {
    const s1 = new FileStorage(dir);
    const { pages, pump } = world({ storage: s1 });
    const [a] = pages;
    assert.ok(a.b.colocar("bloque").ok); pump();
    const id = [...a.s.features.stateOf("objetos").keys()][0];
    a.b.seleccionar(id);
    assert.ok(a.b.ajustar({ solido: true, caja: CAJA_PROPIA }).ok); pump();
    assert.equal(a.s.features.stateOf("objetos").get(id)!.colision, "caja");
    await s1.flush();
  }
  // rewrite what was saved as a v5 world would have (no colision key)
  const st = new FileStorage(dir), saved = st.load("objetos")!;
  assert.ok(saved.state.length === 1);
  for (const [, s] of saved.state) delete (s.value as Record<string, unknown>).colision;
  const w2 = world({ storage: { load: () => ({ ...saved, version: 5 }), record() {} } as unknown as FileStorage });
  const [b] = w2.pages;
  const id2 = [...b.s.features.stateOf("objetos").keys()][0];
  const o2 = b.s.features.stateOf("objetos").get(id2)!;
  assert.equal(o2.solido, true); assert.equal(o2.colision, "caja"); // written at start by the server
});
