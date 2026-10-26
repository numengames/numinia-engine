// M16: the zone manifest (packages/server/src/manifiesto.ts) and the page's store of files by hash (apps/plaza/manifiesto.ts).
// Over a real server: upload a heavy model, place it, read /manifiesto.json. In node: the second load of a zone downloads
// nothing, a file with a false hash is refused, the hash cache is not asked twice. Plus H13's page side (lod-modelo.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { webSocketClient } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { signer } from "../packages/server/src/secret.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import { Activos } from "../packages/server/src/activos.ts";
import { ARRANQUE_M, CacheHashes, claseDe, construirManifiesto } from "../packages/server/src/manifiesto.ts";
import { crearTienda, HashFalso, leerManifiesto, sha256, type CachesLike } from "../apps/plaza/manifiesto.ts";
import { textoBytes, textoPiezas } from "../apps/plaza/carga.ts";
import { debeMejorar, ficheroDeNivel, LOD2_M, nivelParaCargar } from "../packages/render/src/lod-modelo.ts";
import { LEJOS_M, contarPiezas } from "../packages/render/src/carga-orden.ts";

const SECRETO = "una-clave-de-prueba-larga";
const BILLETE = emitir(signer(SECRETO), "abcdefgh2345", today());
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));

async function colina(n = 64): Promise<Uint8Array> {
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
  doc.createScene("escena").addChild(doc.createNode("colina").setMesh(doc.createMesh("colina").addPrimitive(prim)));
  return new NodeIO().writeBinary(doc);
}
const espera = async (f: () => boolean | Promise<boolean>, ms = 15000) => { for (let i = 0; i < ms / 50 && !(await f()); i++) await new Promise((r) => setTimeout(r, 50)); return f(); };

test("manifest: classes by where the thing stands; a pinned thing is needed to play wherever it is", () => {
  assert.equal(claseDe({ modelo: "a", x: 3, z: -4 }), "arranque");
  assert.equal(claseDe({ modelo: "a", x: ARRANQUE_M + 1, z: 0 }), "fondo");
  assert.equal(claseDe({ modelo: "a", x: 500, z: 500, fijado: true }), "arranque");
  assert.equal(ARRANQUE_M, LEJOS_M, "the same distance the page's loader calls near");
});

test("manifest: a file per model with the sha256 of the bytes served, its levels as lazy files, hashes remembered", async () => {
  const dir = tmp("m16-dir-"), glb = await colina(), h = sha(glb), pocos = new Uint8Array([1, 2, 3, 4]), h2 = sha(pocos);
  writeFileSync(join(dir, `${h}.glb`), glb); writeFileSync(join(dir, `${h2}.png`), pocos);
  const opt = join(dir, "optimizados"); mkdirSync(opt);
  const copia = Buffer.from("lighter copy of the model"), l1 = Buffer.from("level one"), l2 = Buffer.from("level two");
  writeFileSync(join(opt, `${h}.glb`), copia); writeFileSync(join(opt, `${h}.lod1.glb`), l1); writeFileSync(join(opt, `${h}.lod2.glb`), l2);
  const a = new Activos(null, dir), hashes = new CacheHashes(join(dir, "hashes.json"));
  const cosas = [{ modelo: h, x: 500, z: 0 }, { modelo: h, x: 2, z: 2 }, { modelo: h2, tipo: "imagen", ext: "png", x: 300, z: 0 }, { modelo: "f".repeat(64), x: 0, z: 0 }];
  const m = await construirManifiesto("principal", cosas, a, hashes);
  const f = Object.fromEntries(m.ficheros.map((x) => [x.ruta, x]));
  assert.equal(m.schema, "numinia-engine/manifiesto@1");
  assert.deepEqual(Object.keys(f).sort(), [`/a/${h}.glb`, `/a/${h}.lod1.glb`, `/a/${h}.lod2.glb`, `/a/${h2}.png`].sort(), "a thing whose file is not here is left out");
  assert.equal(f[`/a/${h}.glb`].sha256, sha(copia), "the hash is of the lighter copy the server sends, not of the name");
  assert.equal(f[`/a/${h}.glb`].bytes, copia.length);
  assert.equal(f[`/a/${h}.glb`].clase, "arranque", "two copies, one near: the nearest class wins"); assert.equal(f[`/a/${h}.glb`].copias, 2); assert.equal(f[`/a/${h}.glb`].lods, 2);
  assert.equal(f[`/a/${h2}.png`].clase, "fondo"); assert.equal(f[`/a/${h2}.png`].sha256, h2);
  assert.deepEqual([f[`/a/${h}.lod1.glb`].clase, f[`/a/${h}.lod1.glb`].nivel, f[`/a/${h}.lod1.glb`].de, f[`/a/${h}.lod1.glb`].sha256], ["perezoso", 1, `/a/${h}.glb`, sha(l1)]);
  assert.equal(m.total.bytes, copia.length + pocos.length, "the total is what plays and follows, not the lazy levels");
  assert.deepEqual(m.clases.perezoso, { ficheros: 2, bytes: l1.length + l2.length });
  // the hash cache: the second manifest, and one from a restarted server, hash nothing
  assert.equal(hashes.calculados, 4);
  await construirManifiesto("principal", cosas, a, hashes); assert.equal(hashes.calculados, 4, "second manifest: no file read");
  await hashes.guardar();
  const otra = new CacheHashes(join(dir, "hashes.json"));
  await construirManifiesto("principal", cosas, a, otra); assert.equal(otra.calculados, 0, "after a restart: still none");
  // a file that changed is hashed again
  writeFileSync(join(opt, `${h}.lod1.glb`), "level one, changed"); utimesSync(join(opt, `${h}.lod1.glb`), new Date(), new Date(Date.now() + 5000));
  const m3 = await construirManifiesto("principal", cosas, a, otra);
  assert.equal(otra.calculados, 1); assert.equal(m3.ficheros.find((x) => x.ruta === `/a/${h}.lod1.glb`)!.sha256, sha(Buffer.from("level one, changed")));
  void statSync; void readFileSync;
});

/** The page's side with the server and the Cache API faked: counts what goes over the wire. */
function mundoFalso(ficheros: Record<string, Uint8Array>, tocar: (ruta: string, b: Uint8Array) => Uint8Array = (_r, b) => b) {
  const manifiesto = { schema: "numinia-engine/manifiesto@1", zona: "principal", origenes: ["/"], total: { ficheros: 0, bytes: 0 }, clases: { arranque: { ficheros: 1, bytes: 10 }, fondo: { ficheros: 0, bytes: 0 }, perezoso: { ficheros: 0, bytes: 0 } },
    ficheros: Object.entries(ficheros).map(([ruta, b]) => ({ ruta, sha256: sha(b), bytes: b.length, clase: "arranque", tipo: "glb", ...(ruta.includes(".lod") ? {} : { lods: 2 }) })) };
  const red = { manifiestos: 0, ficheros: [] as string[], bytes: 0 };
  const fetchFalso = (async (u: string) => {
    const ruta = new URL(u).pathname;
    if (ruta === "/manifiesto.json") { red.manifiestos++; return new Response(JSON.stringify(manifiesto)); }
    const b = ficheros[ruta]; if (!b) return new Response("no", { status: 404 });
    red.ficheros.push(ruta); const dado = tocar(ruta, b); red.bytes += dado.length; return new Response(dado);
  }) as unknown as typeof fetch;
  const guardado = new Map<string, ArrayBuffer>();
  const caches: CachesLike = { open: async () => ({ match: async (k: string) => (guardado.has(k) ? { arrayBuffer: async () => guardado.get(k)!.slice(0) } : undefined), put: async (k: string, r: unknown) => { guardado.set(k, await (r as Response).arrayBuffer()); } }) };
  return { red, fetchFalso, caches, guardado };
}

test("page store: the second load of a zone downloads no file; a reload costs only the manifest", async () => {
  const a = new Uint8Array(5000).map((_, i) => i % 251), b = new Uint8Array(3000).map((_, i) => (i * 7) % 253);
  const w = mundoFalso({ "/a/x.glb": a, "/a/y.glb": b });
  const cargar = async () => { const t = crearTienda({ origen: "http://mundo", fetch: w.fetchFalso, caches: w.caches }); const r = await Promise.all([t.leer("http://mundo/a/x.glb"), t.leer("http://mundo/a/y.glb")]); return { t, r }; };
  const primera = await cargar();
  assert.deepEqual(w.red.ficheros.sort(), ["/a/x.glb", "/a/y.glb"]); assert.equal(w.red.bytes, 8000);
  assert.deepEqual(new Uint8Array(primera.r[0]!), a); assert.equal(primera.t.estadisticas().bytesDescargados, 8000);
  const antes = { ...w.red, ficheros: [...w.red.ficheros] };
  const segunda = await cargar();
  assert.deepEqual(w.red.ficheros, antes.ficheros, "no file was asked of the network the second time");
  assert.equal(w.red.bytes, 8000); assert.equal(w.red.manifiestos, 2);
  assert.deepEqual(new Uint8Array(segunda.r[1]!), b);
  assert.deepEqual([segunda.t.estadisticas().desdeCache, segunda.t.estadisticas().bytesDescargados, segunda.t.estadisticas().bytesDeCache], [2, 0, 8000]);
  assert.equal(segunda.t.lods("x"), 2); assert.equal(segunda.t.lods("nada"), 0); assert.equal(segunda.t.manifiesto()!.ficheros.length, 2);
});

test("page store: the same model asked by two copies at once is one download; a file the manifest does not list is not ours", async () => {
  const a = new Uint8Array(2000).map((_, i) => i % 200);
  const w = mundoFalso({ "/a/x.glb": a });
  const t = crearTienda({ origen: "http://mundo", fetch: w.fetchFalso, caches: w.caches });
  const [p, q] = await Promise.all([t.leer("http://mundo/a/x.glb"), t.leer("http://mundo/a/x.glb")]);
  assert.equal(w.red.ficheros.length, 1); assert.deepEqual(new Uint8Array(p!), new Uint8Array(q!)); assert.notEqual(p, q, "each caller gets its own buffer (the loader may take it)");
  assert.equal(await t.leer("http://mundo/a/otro.glb"), null);
});

test("page store: a file whose sha256 is not the manifest's is refused and not kept", async () => {
  const a = new Uint8Array(4000).map((_, i) => i % 199);
  const w = mundoFalso({ "/a/x.glb": a }, (_r, b) => { const c = b.slice(); c[100] ^= 1; return c; }); // one flipped bit on the wire
  const t = crearTienda({ origen: "http://mundo", fetch: w.fetchFalso, caches: w.caches });
  await assert.rejects(() => t.leer("http://mundo/a/x.glb"), (e: unknown) => e instanceof HashFalso && /no coincide/.test((e as Error).message));
  assert.equal(w.guardado.size, 0, "nothing wrong is kept"); assert.equal(t.estadisticas().rechazados, 1);
});

test("page store: with no manifest (older server) or no Cache API, nothing breaks", async () => {
  const sin = crearTienda({ origen: "http://mundo", fetch: (async () => new Response("no", { status: 404 })) as unknown as typeof fetch, caches: null });
  assert.equal(await sin.leer("http://mundo/a/x.glb"), null); assert.equal(sin.manifiesto(), null); assert.deepEqual(sin.totales(), { arranque: 0, fondo: 0, perezoso: 0 });
  const a = new Uint8Array(100).map((_, i) => i), w = mundoFalso({ "/a/x.glb": a });
  const t = crearTienda({ origen: "http://mundo", fetch: w.fetchFalso, caches: null });
  assert.deepEqual(new Uint8Array((await t.leer("http://mundo/a/x.glb"))!), a);
  assert.equal(leerManifiesto({ schema: "otra" }), null);
  assert.equal(await sha256(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("loading screen: the count of pieces is the same with or without bytes; the bytes read «3,2 de 8,1 MB»", () => {
  assert.equal(textoPiezas({ listas: 3, total: 5 }), "3 de 5 piezas");
  assert.equal(textoPiezas({ listas: 3, total: 5, bytes: { listos: 3.2 * 1048576, total: 8.1 * 1048576 } }), "3 de 5 piezas · 3,2 de 8,1 MB");
  assert.equal(textoBytes(99, 0), ""); assert.equal(textoBytes(20 * 1048576, 10 * 1048576), "10 de 10 MB", "never more than the total");
  // H13: a far thing (rank 2) is not counted whether it loads whole or as a level: the screen's total does not move
  const cerca = { key: "o1", distancia2: 30 ** 2, loaded: true, failed: false }, lejos = { key: "o2", distancia2: 300 ** 2, loaded: false, failed: false };
  assert.deepEqual(contarPiezas([cerca, lejos]), { total: 1, listas: 1, fallidas: 0 });
  assert.deepEqual(contarPiezas([cerca, { ...lejos, loaded: true }]), { total: 1, listas: 1, fallidas: 0 });
});

test("levels in the page: whole model near, level 1 from the near limit, level 2 far; the whole one comes back before it counts as near", () => {
  assert.equal(nivelParaCargar(10, 2), 0); assert.equal(nivelParaCargar(LEJOS_M, 2), 0);
  assert.equal(nivelParaCargar(LEJOS_M + 1, 2), 1); assert.equal(nivelParaCargar(LOD2_M + 1, 2), 2);
  assert.equal(nivelParaCargar(LOD2_M + 1, 1), 1, "only one level made: the lightest there is"); assert.equal(nivelParaCargar(500, 0), 0, "none made: the whole model");
  assert.equal(debeMejorar(200, 2), false); assert.equal(debeMejorar(LEJOS_M - 11, 1), true); assert.equal(debeMejorar(LEJOS_M - 9, 1), false); assert.equal(debeMejorar(1, 0), false);
  assert.equal(ficheroDeNivel("abc.glb", 2), "abc.lod2.glb"); assert.equal(ficheroDeNivel("abc.glb", 0), "abc.glb");
});

test("levels before the page knows where you stand: never the whole model; position near → whole, far → level; no upgrade loop without a position", () => {
  assert.notEqual(nivelParaCargar(null, 2), 0, "no position: not the whole model"); assert.equal(nivelParaCargar(null, 2), 2, "the lightest level");
  assert.equal(nivelParaCargar(null, 1), 1, "one level made: that one"); assert.equal(nivelParaCargar(NaN, 2), 2, "a non-finite distance is unknown too");
  assert.equal(nivelParaCargar(null, 0), 0, "no levels made: the whole model, as before");
  assert.equal(nivelParaCargar(5, 2), 0, "position known, near: the whole model"); assert.equal(nivelParaCargar(0, 2), 0, "standing on it is a real 0, still whole");
  assert.equal(nivelParaCargar(LEJOS_M + 1, 2), 1); assert.equal(nivelParaCargar(LOD2_M + 1, 2), 2, "position known, far: a level");
  assert.equal(debeMejorar(null, 2), false, "no position: a level is not 'near' (it would swap to the whole model at once)");
  assert.equal(debeMejorar(5, 2), true, "the first snapshot says it is near: swap to the whole model");
  assert.equal(debeMejorar(LOD2_M + 1, 2), false, "the first snapshot says it is far: keep the level");
  // loading screen: a thing drawn from a level is a loaded piece, and the later swap keeps it loaded (index.ts keeps `loaded` while `mejorando`)
  const p = { key: "a", distancia2: 0, loaded: true, failed: false };
  assert.deepEqual(contarPiezas([p]), { total: 1, listas: 1, fallidas: 0 });
});

test("over a real server: upload a heavy model, place it, /manifiesto.json lists it with its levels and hashes that match what /a/ sends", async () => {
  const dir = tmp("m16-srv-"), datos = tmp("m16-datos-"), log: string[] = [];
  const glb = await colina(), h = sha(glb);
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, secret: SECRETO, construir: "todos", subidas: dir, datos, features: [crearObjetos()], log: (l) => log.push(l) });
  const base = `http://127.0.0.1:${srv.port}`;
  try {
    assert.equal((await fetch(`${base}/manifiesto.json`)).status, 200, "an empty zone has a manifest too");
    assert.equal((await fetch(`${base}/a/${h}.glb`, { method: "PUT", body: glb, headers: { authorization: `Bearer ${BILLETE}`, "x-nombre-fichero": "colina.glb" } })).status, 201);
    assert.ok(await espera(async () => (await fetch(`${base}/a/${h}.lod2.glb`)).status === 200), `levels made: ${log.join(" | ")}`);
    let token: string | null = BILLETE;
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}`), cli = crearCliente();
    const s = new ClientSession(t, { features: [cli.part as ClientPart], identity: { load: () => token, save: (x) => { token = x; } } });
    await t.opened;
    assert.ok(await espera(() => !!s.who && cli.constructor.estado.puede));
    s.features.send("objetos", "colocar", { modelo: h, x: 400, z: 0, nombre: "Colina", decorado: false });
    assert.ok(await espera(() => s.features.stateOf("objetos").size > 0));
    t.close();
    const r = await fetch(`${base}/manifiesto.json`), m = await r.json() as { ficheros: { ruta: string; sha256: string; bytes: number; clase: string; lods?: number }[]; total: { bytes: number } };
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(m.ficheros.map((f) => f.ruta), [`/a/${h}.glb`, `/a/${h}.lod1.glb`, `/a/${h}.lod2.glb`]);
    assert.equal(m.ficheros[0].clase, "fondo"); assert.equal(m.ficheros[0].lods, 2);
    for (const f of m.ficheros) { // what the manifest promises is what the server sends
      const cuerpo = new Uint8Array(await (await fetch(`${base}${f.ruta}`, { headers: { "accept-encoding": "identity" } })).arrayBuffer());
      assert.equal(sha(cuerpo), f.sha256, f.ruta); assert.equal(cuerpo.length, f.bytes, f.ruta);
    }
    assert.ok(m.ficheros[1].bytes < m.ficheros[0].bytes * 2 && m.ficheros[2].bytes <= m.ficheros[1].bytes, "levels are not heavier than the model");
    assert.ok(srv.inst && readFileSync(join(dir, "hashes.json"), "utf8").includes(m.ficheros[0].sha256), "the hash cache is on disk beside the uploads");
  } finally { await srv.close(); }
});
