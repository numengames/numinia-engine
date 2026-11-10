// A world whose floor is only a collision GLB (`colision: "malla"`, no naturaleza.json hills) still has a real ground for the
// page's avatars: `ClientSession.sueloTerreno()` must read it. It used to stay null (it was set only when a terrain existed), so
// an avatar walking on an island at y = 19 m was measured «in the air» against the flat plaza and drawn with the jump clip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeature, serverPart, clientPart } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { construirMallaCliente } from "../packages/client/src/malla-glb.ts";

const cosas = defineFeature({
  id: "cosas", version: 1, describe: "Things with a collision kind (avatar ground from a GLB mesh).",
  state: {
    describe: "Each thing: its collision kind and where it is.",
    fields: { colision: { kind: "enum", values: ["ninguna", "caja", "malla"], default: "ninguna" }, modelo: { kind: "text", maxBytes: 64 }, ext: { kind: "text", maxBytes: 8 }, x: { kind: "int", min: -1000, max: 1000 }, y: { kind: "int", min: -1000, max: 1000 }, z: { kind: "int", min: -1000, max: 1000 },
      rx: { kind: "int", min: -360, max: 360 }, ry: { kind: "int", min: -360, max: 360 }, rz: { kind: "int", min: -360, max: 360 },
      sx: { kind: "int", min: 1, max: 100 }, sy: { kind: "int", min: 1, max: 100 }, sz: { kind: "int", min: 1, max: 100 } },
  },
});

function glb(json: unknown, bin: Uint8Array): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + j.length + jp + 8 + bin.length + bp;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8);
  return out;
}
/** A floor 16 × 16 m at height `y` (two triangles, up-facing): the island. */
function isla(y: number): Uint8Array {
  const pos = [-8, y, -8, -8, y, 8, 8, y, 8, 8, y, -8], idx = [0, 1, 2, 0, 2, 3];
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
const bytes = isla(19);
const vuelta = () => new Promise<void>((r) => setImmediate(r));

/** One client in a world with no terrain; `cosa` = the thing put in the shared state (or none); `legible` = whether its GLB can be read. */
async function mundo(cosa: Record<string, unknown> | null, legible = true) {
  let api!: ServerApi;
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [serverPart(cosas, (a) => { api = a; })] });
  const t = inst.join(0);
  const leer = async (h: string, e: string) => (legible && h === HASH && e === "glb" ? bytes : null);
  const s = new ClientSession(t, { features: [clientPart(cosas, () => {})], construirGlb: (entradas) => construirMallaCliente(entradas, leer) });
  t.flush(); inst.tick(); t.flush(); // the feature's setup runs on the first tick
  if (cosa) api.state.set("isla", cosa);
  for (let i = 0; i < 6; i++) { t.flush(); s.tick(0, 0); t.flush(); inst.tick(); t.flush(); await vuelta(); await vuelta(); } // the page ticks at 20 Hz; the mesh is built off the tick
  return s;
}
const ISLA = { colision: "malla", modelo: HASH, ext: "glb", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };

test("no terrain, a GLB mesh floor at y = 19: the session has a ground the avatars measure against (it was null)", async () => {
  const s = await mundo(ISLA);
  const ts = s.sueloTerreno();
  assert.ok(ts, "sueloTerreno() is the mesh floor, not null");
  assert.ok(Math.abs(ts.suelo(0, 0, 19.1) - 19) < 0.05, `suelo(0, 0, 19.1) ≈ 19, got ${ts.suelo(0, 0, 19.1)}`);
  assert.ok(Math.abs(ts.suelo(3, -2, 19.1) - 19) < 0.05, `suelo(3, -2, 19.1) ≈ 19, got ${ts.suelo(3, -2, 19.1)}`);
  assert.ok(Math.abs(ts.malla(0, 0, 19.1) - 19) < 0.05, `the mesh alone ≈ 19, got ${ts.malla(0, 0, 19.1)}`);
});

test("no terrain and no mesh: the ground stays null (a flat world is untouched)", async () => {
  assert.equal((await mundo(null)).sueloTerreno(), null);
  assert.equal((await mundo({ ...ISLA, colision: "caja" })).sueloTerreno(), null, "a box is not a mesh");
});

test("a mesh thing whose GLB cannot be read leaves the ground null", async () => {
  assert.equal((await mundo(ISLA, false)).sueloTerreno(), null);
});
