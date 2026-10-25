// M6 h9: the page builds the same GLB collision mesh as the server, so the replay of unacknowledged inputs (ClientSession.reconcile)
// stands on a `malla` floor. Found by tools/e2e-piernas/malla.mjs: the server held the player at y = 4, the page's local sim had no
// floor and let 4–11 pending inputs sink it to y 2.4–3.8 before every snapshot snapped it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirMallaCliente, urlColision, lectorColision } from "../packages/client/src/malla-glb.ts";
import { crearTienda, ESQUEMA, sha256 as sha256Bytes } from "../apps/plaza/manifiesto.ts";
import { ficheroDeNivel } from "../packages/render/src/lod-modelo.ts";
import { construirMalla } from "../packages/server/src/colision-mundo.ts";
import { createSim, spawnAvatar, step, setBody, getBody, setMesh } from "../packages/sim/src/index.ts";
import { fx, fxToFloat } from "../packages/core/src/index.ts";

function glb(json: unknown, bin: Uint8Array): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + j.length + jp + 8 + bin.length + bp;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8);
  return out;
}
/** A floor 16 × 16 m at y = 4 (two triangles, up-facing), the same floor as the e2e leg's room. */
function suelo4(): Uint8Array {
  const pos = [-8, 4, -8, -8, 4, 8, 8, 4, 8, 8, 4, -8], idx = [0, 1, 2, 0, 2, 3];
  const posBytes = new Uint8Array(new Float32Array(pos).buffer), idxBytes = new Uint8Array(new Uint16Array(idx).buffer);
  const bin = new Uint8Array(posBytes.length + idxBytes.length); bin.set(posBytes); bin.set(idxBytes, posBytes.length);
  return glb({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes.length }, { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length }],
    buffers: [{ byteLength: bin.length }],
  }, bin);
}
const HASH = "c".repeat(64);
const cosa = (over: Record<string, unknown> = {}) => ({ colision: "malla", modelo: HASH, ext: "glb", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, ...over });
const bytes = suelo4();
const leer = async (h: string, e: string) => (h === HASH && e === "glb" ? bytes : null);

test("the page's mesh has exactly the server's triangles", async () => {
  const entradas: [string, Record<string, unknown>][] = [["objetos:a", cosa({ x: 3, y: 1, z: -2, ry: 30, sx: 1.5 })]];
  const cliente = await construirMallaCliente(entradas, leer);
  const servidor = await construirMalla((h, e) => (h === HASH && e === "glb" ? bytes : null))(entradas);
  assert.ok(cliente.mesh && servidor);
  assert.equal(cliente.falta, false);
  assert.deepEqual(Array.from(cliente.mesh.tris), Array.from(servidor.tris));
});

test("a file that cannot be read leaves the thing out and says so (the page tries again on the next change)", async () => {
  const r = await construirMallaCliente([["objetos:a", cosa()]], async () => null);
  assert.equal(r.mesh, null);
  assert.equal(r.falta, true);
  const t = await construirMallaCliente([["objetos:a", cosa()]], async () => { throw new Error("offline"); });
  assert.equal(t.mesh, null);
  assert.equal(t.falta, true);
});

test("replaying pending inputs on the page's sim: with the mesh the body stays on the floor at y = 4, without it it sinks", async () => {
  const { mesh } = await construirMallaCliente([["objetos:a", cosa()]], leer);
  const correr = (m: typeof mesh): number => {
    const s = createSim(1, 0); spawnAvatar(s, 0); setMesh(s, m, 0);
    setBody(s, 0, { x: 0, y: fx(4), z: 0, vy: 0, air: 0, buf: 0 });
    for (let i = 0; i < 11; i++) step(s, new Int32Array([0, 0, 0, 0])); // 11 inputs not yet acknowledged: the worst the e2e saw
    return fxToFloat(getBody(s, 0).y);
  };
  const con = correr(mesh), sin = correr(null);
  assert.ok(con > 3.95 && con < 4.1, `standing on the mesh floor, got ${con}`);
  assert.ok(sin < 3.5, `control: with no floor the replay sinks, got ${sin}`);
});

// H13 (LOD) + M16 (manifest / hash store): whatever level the drawing picked, the collision is read from the WHOLE model.

test("the collision url is the whole model, never a lod level, whatever the drawing picked", () => {
  const ORIGEN = "http://mundo:8787";
  assert.equal(urlColision(ORIGEN, HASH, "glb"), `${ORIGEN}/a/${HASH}.glb`);
  for (const nivel of [0, 1, 2]) { // the drawing's own name for the level (render/lod-modelo.ts) is not what collision asks for
    const dibujo = ficheroDeNivel(`${HASH}.glb`, nivel);
    assert.equal(nivel > 0, /\.lod\d\.glb$/.test(dibujo));
    assert.equal(urlColision(ORIGEN, dibujo.replace(/\..*$/, ""), "glb"), `${ORIGEN}/a/${HASH}.glb`);
  }
  assert.equal(urlColision(ORIGEN, HASH, "lod1"), null); // a thing cannot name a level as its extension
  assert.equal(urlColision(ORIGEN, HASH, "lod2"), null);
  assert.equal(urlColision(ORIGEN, `${HASH}.lod1`, "glb"), null); // nor smuggle one in its hash
  assert.equal(urlColision(ORIGEN, "abc", "glb"), null);
});

test("with a manifest and lod levels: the drawing loads lod1, the collision still reads and verifies the full model (sha check, one download)", async () => {
  const lod = suelo4().slice(); // stands for a lighter file: different bytes, different sha256
  lod[lod.length - 1] ^= 0xff; lod[lod.length - 2] ^= 0xff;
  const completo = bytes, ORIGEN = "http://mundo:8787";
  const shaCompleto = await sha256Bytes(completo), shaLod = await sha256Bytes(lod);
  assert.notEqual(shaCompleto, shaLod);
  const manifiesto = { schema: ESQUEMA, zona: "z", origenes: ["/"], total: { ficheros: 2, bytes: 0 }, clases: { arranque: { ficheros: 1, bytes: 0 }, fondo: { ficheros: 0, bytes: 0 }, perezoso: { ficheros: 1, bytes: 0 } },
    ficheros: [{ ruta: `/a/${HASH}.glb`, sha256: shaCompleto, bytes: completo.length, clase: "arranque", tipo: "glb", lods: 1 },
      { ruta: `/a/${HASH}.lod1.glb`, sha256: shaLod, bytes: lod.length, clase: "perezoso", tipo: "glb", de: `/a/${HASH}.glb`, nivel: 1 }] };
  const pedidos: string[] = [];
  const falsoFetch = (async (u: string) => {
    const ruta = new URL(u).pathname; pedidos.push(ruta);
    if (ruta === "/manifiesto.json") return new Response(JSON.stringify(manifiesto));
    if (ruta === `/a/${HASH}.glb`) return new Response(completo.slice().buffer);
    if (ruta === `/a/${HASH}.lod1.glb`) return new Response(lod.slice().buffer);
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  const tienda = crearTienda({ origen: ORIGEN, fetch: falsoFetch, caches: null });
  await tienda.listo;
  assert.equal(tienda.lods(HASH), 1);
  // the drawing: a far thing takes level 1 (what lod-modelo.ts asks the store for)
  const dibujado = await tienda.leer(`${ORIGEN}/a/${ficheroDeNivel(`${HASH}.glb`, 1)}`);
  assert.ok(dibujado && dibujado.byteLength === lod.length);
  // the collision, after it: the whole model, through the store
  const leerColision = lectorColision(ORIGEN, (u) => tienda.leer(u), falsoFetch);
  const r = await construirMallaCliente([["objetos:a", cosa()]], leerColision);
  assert.ok(r.mesh && !r.falta);
  const esperado = await construirMallaCliente([["objetos:a", cosa()]], leer); // the full bytes
  assert.deepEqual(Array.from(r.mesh.tris), Array.from(esperado.mesh!.tris));
  assert.deepEqual(pedidos.filter((p) => p.startsWith("/a/")), [`/a/${ficheroDeNivel(`${HASH}.glb`, 1)}`, `/a/${HASH}.glb`]);
  assert.equal(tienda.estadisticas().descargados, 2);
  assert.equal(tienda.estadisticas().rechazados, 0);
  assert.ok(!pedidos.some((p, i) => i > 1 && /lod/.test(p)), "collision never asks for a level");
});

test("a full model whose bytes do not match the manifest's sha256 is not a floor (no silent plain fetch), and no manifest = the plain fetch as before", async () => {
  const ORIGEN = "http://mundo:8787";
  const manifiesto = { schema: ESQUEMA, zona: "z", origenes: ["/"], total: { ficheros: 1, bytes: 0 }, clases: { arranque: { ficheros: 1, bytes: 0 }, fondo: { ficheros: 0, bytes: 0 }, perezoso: { ficheros: 0, bytes: 0 } },
    ficheros: [{ ruta: `/a/${HASH}.glb`, sha256: "d".repeat(64), bytes: bytes.length, clase: "arranque", tipo: "glb" }] };
  const pedidos: string[] = [];
  const con = (async (u: string) => { const ruta = new URL(u).pathname; pedidos.push(ruta); return ruta === "/manifiesto.json" ? new Response(JSON.stringify(manifiesto)) : new Response(bytes.slice().buffer); }) as unknown as typeof fetch;
  const tienda = crearTienda({ origen: ORIGEN, fetch: con, caches: null });
  const mal = await construirMallaCliente([["objetos:a", cosa()]], lectorColision(ORIGEN, (u) => tienda.leer(u), con));
  assert.equal(mal.mesh, null); assert.equal(mal.falta, true); assert.equal(tienda.estadisticas().rechazados, 1);
  assert.deepEqual(pedidos.filter((p) => p.startsWith("/a/")), [`/a/${HASH}.glb`]); // asked once, not a second plain fetch
  // a server with no manifest: the store manages nothing, the reader falls back to the plain fetch of the same whole-model url
  const sin = (async (u: string) => (new URL(u).pathname === "/manifiesto.json" ? new Response("", { status: 404 }) : new Response(bytes.slice().buffer))) as unknown as typeof fetch;
  const t2 = crearTienda({ origen: ORIGEN, fetch: sin, caches: null });
  const bien = await construirMallaCliente([["objetos:a", cosa()]], lectorColision(ORIGEN, (u) => t2.leer(u), sin));
  assert.ok(bien.mesh && !bien.falta);
});
