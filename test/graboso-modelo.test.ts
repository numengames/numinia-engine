// MIS-247 (t_af05726f): the Graboso's fine head — a GLB of our own (activos/graboso/graboso-cabeza.glb), CC0, under budget, the sha the
// page asks for is the file's, and the head wears the engine's three looks by node name; the simple head stays when the file does not come.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import * as THREE from "three/webgpu";
import { Document, NodeIO } from "@gltf-transform/core";
import { crearGraboso, MODELO_SHA, RADIO_M } from "../packages/render/src/graboso.ts";

const FICHERO = new URL("../activos/graboso/graboso-cabeza.glb", import.meta.url);
const bytes = readFileSync(FICHERO);
const doc = await new NodeIO().readBinary(new Uint8Array(bytes));

test("the sha256 written in graboso.ts is the file's (the page asks the server for exactly this content)", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), MODELO_SHA);
});
test("the budget: < 2.000 triangles, ONE material, no texture, < 70 kB", () => {
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices()!.getCount() / 3;
  assert.ok(tris > 1000 && tris < 2000, `${tris} triangles`);
  assert.equal(doc.getRoot().listMaterials().length, 1);
  assert.equal(doc.getRoot().listTextures().length, 0);
  assert.ok(bytes.length < 70_000, `${bytes.length} bytes`);
});
test("three nodes by name, each a mesh; every number finite; the head is as big as the one it replaces and looks toward -z", () => {
  const nombres = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).sort();
  assert.deepEqual(nombres, ["concha", "piloto", "rasgos"]);
  let minz = Infinity, maxz = -Infinity, maxr = 0;
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const a = p.getAttribute("POSITION")!.getArray() as Float32Array;
    for (let i = 0; i < a.length; i += 3) { assert.ok(Number.isFinite(a[i]! + a[i + 1]! + a[i + 2]!)); minz = Math.min(minz, a[i + 2]!); maxz = Math.max(maxz, a[i + 2]!); maxr = Math.max(maxr, Math.hypot(a[i]!, a[i + 2]!)); }
    for (const x of p.getAttribute("NORMAL")!.getArray() as Float32Array) assert.ok(Number.isFinite(x));
    for (const i of p.getIndices()!.getArray()!) assert.ok(i < p.getAttribute("POSITION")!.getCount());
  }
  assert.ok(minz < -RADIO_M * 1.1 && minz > -RADIO_M * 1.35, `the nose reaches ${minz} (toward -z)`);
  assert.ok(maxz < RADIO_M * 1.05, "nothing sticks out behind");
  assert.ok(maxr < RADIO_M * 1.6);
});
test("the licence sits next to the file and says CC0, own work, and how to make it again", () => {
  const lic = new URL("../activos/graboso/LICENCIA.txt", import.meta.url);
  assert.ok(existsSync(lic)); const t = readFileSync(lic, "utf8");
  assert.match(t, /CC0/); assert.match(t, /tools\/hacer-graboso\.mjs/);
});

const escenaFina = () => { // the file's scene as the loader would give it: three meshes with the file's one material
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ name: "graboso" });
  for (const n of ["concha", "rasgos", "piloto"]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat); m.name = n; g.add(m); }
  return g;
};
test("with the file: the fine head replaces the simple one and its nodes wear the cloud / dark / pilot looks", async () => {
  const world = new THREE.Group(); let pidio = "";
  const g = crearGraboso({ world, posicion: () => null, yaw: () => 0, modelo: async (sha) => { pidio = sha; return escenaFina(); } });
  assert.equal(g.cabeza(), "sencilla", "until the file lands, the simple head");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(pidio, MODELO_SHA); assert.equal(g.cabeza(), "fina");
  const grupo = world.children[0]!; const sencilla = grupo.getObjectByName("graboso-sencilla")!, fina = grupo.getObjectByName("graboso-fina")!;
  assert.equal(sencilla.visible, false); assert.ok(fina);
  const mats = new Map<string, THREE.MeshStandardMaterial>(); fina.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) mats.set(m.name, m.material as THREE.MeshStandardMaterial); });
  assert.equal(mats.get("concha")!.transparent, true, "the shell is the translucent cloud");
  assert.ok(mats.get("piloto")!.emissive.r > 0.5, "the lamp can glow");
  assert.equal(mats.get("rasgos")!.transparent, false);
  assert.equal(new Set([...mats.values()]).size, 3, "three looks, none of the file's");
  g.quitar(); assert.equal(world.children.length, 0);
});
test("without the file (it fails, or the page gives none): the simple head stays and nothing throws", async () => {
  for (const modelo of [undefined, async () => { throw new Error("404"); }]) {
    const world = new THREE.Group(); const g = crearGraboso({ world, posicion: () => null, yaw: () => 0, ...(modelo ? { modelo } : {}) });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(g.cabeza(), "sencilla"); assert.equal(world.children[0]!.getObjectByName("graboso-sencilla")!.visible, true);
    g.mostrar(true); g.actualizar(0.5); assert.equal(g.visible(), true); g.quitar();
  }
});
