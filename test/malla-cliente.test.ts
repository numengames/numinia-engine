// M6 h9: the page builds the same GLB collision mesh as the server, so the replay of unacknowledged inputs (ClientSession.reconcile)
// stands on a `malla` floor. Found by tools/e2e-piernas/malla.mjs: the server held the player at y = 4, the page's local sim had no
// floor and let 4–11 pending inputs sink it to y 2.4–3.8 before every snapshot snapped it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirMallaCliente } from "../packages/client/src/malla-glb.ts";
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
