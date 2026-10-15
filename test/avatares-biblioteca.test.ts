import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { infoVrm, leerGlb, revisarAvatar, TRIANGULOS_MAX_VRM } from "../packages/server/src/vrm.ts";
import type { InfoVrm } from "../packages/server/src/vrm.ts";
import { Activos, BIBLIOTECA, SERVIR } from "../packages/server/src/activos.ts";

// J1: the house library of avatars (VRM) and animations (VRMA). The plaza's side is test/avatares.test.ts.
const catalogo = JSON.parse(readFileSync("activos/avatares/catalogo.json", "utf8"));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

test("J1 library: every house avatar is the file its sha256 says, CC0 inside the file, at most 10,000 triangles", () => {
  assert.ok(catalogo.modelos.length >= 2, "two or three avatars");
  for (const m of catalogo.modelos) {
    assert.ok(existsSync(m.fichero), `${m.fichero} missing`);
    const bytes = new Uint8Array(readFileSync(m.fichero));
    assert.equal(sha(bytes), m.sha256, `${m.fichero}: sha256 changed — rerun node tools/avatares-catalogo.ts`);
    const r = infoVrm(bytes);
    assert.ok(r.ok);
    if (!r.ok) continue;
    assert.deepEqual(revisarAvatar(r.value), [], `${m.fichero} refused`);
    assert.equal(r.value.licencia.nombre, "CC0");
    assert.equal(r.value.triangulos, m.triangulos);
    assert.ok(m.triangulos <= TRIANGULOS_MAX_VRM);
    assert.ok(m.fuente.startsWith("https://"), `${m.fichero}: needs its source URL`);
  }
  const licencias = readFileSync("activos/avatares/LICENCIAS.md", "utf8");
  for (const m of catalogo.modelos) assert.ok(licencias.includes(m.sha256), `LICENCIAS.md must name ${m.fichero} by its sha256`);
});

test("J1 library: the animations are VRMA 1.0 with a humanoid, by their sha256, and the server serves .vrma", () => {
  for (const clip of ["quieto", "andar", "trotar", "correr"]) {
    const a = catalogo.animaciones[clip];
    assert.ok(a, `${clip} missing from catalogo.json`);
    const bytes = new Uint8Array(readFileSync(a.fichero));
    assert.equal(sha(bytes), a.sha256, `${a.fichero}: sha256 changed — rerun node tools/avatares-catalogo.ts`);
    const j = leerGlb(bytes);
    assert.ok(j.ok);
    if (!j.ok) continue;
    const ext = (j.value.extensions as Record<string, { specVersion: string; humanoid: { humanBones: Record<string, { node: number }> } }>).VRMC_vrm_animation;
    assert.equal(ext.specVersion, "1.0");
    for (const b of ["hips", "spine", "head", "leftUpperLeg", "rightLowerArm"]) assert.equal(typeof ext.humanoid.humanBones[b]?.node, "number", `${clip}: ${b}`);
    assert.equal((j.value.animations as unknown[]).length, 1);
  }
  assert.equal(SERVIR.vrma, "model/gltf-binary"); // served, never uploaded (TIPOS = what a builder may upload, H9)
  const lib = new Activos(BIBLIOTECA, null);
  assert.ok(lib.buscar(catalogo.animaciones.quieto.sha256, "vrma")?.endsWith("quieto.vrma"));
  assert.ok(lib.buscar(catalogo.modelos[0].sha256, "vrm")?.endsWith(".vrm"));
});

test("J1 server: a VRM over 10,000 triangles or without CC0 inside is refused, saying how to fix it", () => {
  const base: InfoVrm = { version: "0", bytes: 1, triangulos: 2000, huesos: 52, imagenes: 1, morfos: 0, meta: {}, licencia: { nombre: "CC0", comercial: true, redistribuir: null, autor: "x", titulo: "t", url: "" } };
  assert.deepEqual(revisarAvatar(base), []);
  assert.match(revisarAvatar({ ...base, triangulos: 12000 })[0].message, /12000 triángulos > 10000/);
  assert.match(revisarAvatar({ ...base, licencia: { ...base.licencia, nombre: "CC_BY_NC" } })[0].message, /solo toma CC0/);
  assert.equal(revisarAvatar({ ...base, version: null }).some((i) => /no es un VRM/.test(i.message)), true);
  const v1: InfoVrm = { ...base, version: "1", licencia: { ...base.licencia, nombre: "https://vrm.dev/licenses/1.0/", url: "https://creativecommons.org/publicdomain/zero/1.0/" } };
  assert.deepEqual(revisarAvatar(v1), []);
  assert.equal(leerGlb(new Uint8Array([1, 2, 3])).ok, false);
  assert.equal(leerGlb(new Uint8Array(40)).ok, false);
});
