// H11 (importar de Hyperfy, db.sqlite+assets -> carpeta del mundo): a minimal fixture db.sqlite (built here with
// node:sqlite, the same module the importer uses) + a tiny fake asset, imported, then re-loaded by the real
// engine (FileStorage + an Instance with the real `objetos` feature, H1) to prove the output actually boots and
// places things where Hyperfy had them — not just that a JSON file was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { importarMundoHyperfy, quaternionAEuler, leerAsset, OBJETOS_VERSION } from "../packages/server/src/importar-hyperfy.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { leerFicha } from "../packages/server/src/aventura.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { objetos } from "../features/objetos/feature.ts";

test("H11: OBJETOS_VERSION (hand-written, no features/ import allowed from packages/) matches the real feature", () => {
  assert.equal(OBJETOS_VERSION, objetos.version, "features/objetos/feature.ts bumped its version: update OBJETOS_VERSION in importar-hyperfy.ts too");
});

/** A minimal Hyperfy world on disk: `db.sqlite` (config, blueprints, entities) + `assets/<sha256>.glb`. */
function mundoHyperfyDePrueba(dir: string) {
  const assetsDir = join(dir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  const glb = Buffer.from("glTF-fake-bytes-para-la-prueba-h11");
  const sha256 = createHash("sha256").update(glb).digest("hex");
  writeFileSync(join(assetsDir, `${sha256}.glb`), glb);

  const dbPath = join(dir, "db.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)");
  db.exec("CREATE TABLE blueprints (id TEXT PRIMARY KEY, data TEXT)");
  db.exec("CREATE TABLE entities (id TEXT PRIMARY KEY, data TEXT)");
  const ins = (t: string) => db.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?)`);
  const insCfg = db.prepare("INSERT INTO config (key, value) VALUES (?, ?)");
  insCfg.run("title", "La Torre de Prueba");
  insCfg.run("desc", "Un mundo de Hyperfy hecho solo para probar el importador H11.");
  insCfg.run("playerLimit", "24");

  ins("blueprints").run("bp-silla", JSON.stringify({ name: "silla", model: `asset://${sha256}.glb` }));
  ins("blueprints").run("bp-sin-fichero", JSON.stringify({ name: "falta", model: "asset://" + "0".repeat(64) + ".glb" }));

  // 90° yaw (ry): quaternion for rotation of PI/2 around Y.
  const half = Math.PI / 4;
  ins("entities").run("ent-1", JSON.stringify({ id: "ent-1", type: "app", blueprint: "bp-silla", position: [3, 0.5, -7], quaternion: [0, Math.sin(half), 0, Math.cos(half)], scale: [2, 2, 2] }));
  ins("entities").run("ent-2", JSON.stringify({ id: "ent-2", type: "app", blueprint: "bp-sin-fichero", position: [0, 0, 0] })); // its asset is not in assets/
  ins("entities").run("ent-3", JSON.stringify({ id: "ent-3", type: "app", blueprint: "bp-que-no-existe", position: [0, 0, 0] })); // dangling blueprint ref
  db.close();
  return { dbPath, assetsDir, sha256 };
}

test("H11: db.sqlite + assets -> world folder (objetos.json, activos/, ficha.json) and an informe with real counts", () => {
  const base = mkdtempSync(join(tmpdir(), "h11-"));
  const { dbPath, assetsDir, sha256 } = mundoHyperfyDePrueba(join(base, "hyperfy-mundo"));
  const destino = join(base, "mundo-numinia");

  const informe = importarMundoHyperfy({ dbPath, assetsDir, destino });

  // informe de lo traído: counts a person can check
  assert.equal(informe.entidades.leidas, 3);
  assert.equal(informe.objetos.importados, 1); // only ent-1 has both a resolvable blueprint and its asset on disk
  assert.equal(informe.objetos.omitidos.length, 2);
  assert.ok(informe.objetos.omitidos.some((o) => o.id === "ent-2"));
  assert.ok(informe.objetos.omitidos.some((o) => o.id === "ent-3"));
  assert.equal(informe.activos.copiados.length, 1);
  assert.equal(informe.activos.copiados[0].sha256, sha256);
  assert.equal(informe.ajustes.ficha, true);
  assert.ok(existsSync(join(destino, "informe-importacion.json")));
  assert.ok(existsSync(join(destino, "informe-importacion.txt")));

  // the asset actually landed where H9's /a/<sha256>.<ext> and the objetos feature expect it
  const copiado = readFileSync(join(destino, "datos", "activos", `${sha256}.glb`));
  assert.equal(createHash("sha256").update(copiado).digest("hex"), sha256);

  // H7: world settings as a ficha.json the real reader accepts
  const { ficha, problemas } = leerFicha(join(destino, "aventura"));
  assert.deepEqual(problemas, []);
  assert.equal(ficha?.nombre, "La Torre de Prueba");
  assert.equal(ficha?.descripcion, "Un mundo de Hyperfy hecho solo para probar el importador H11.");
  assert.equal(ficha?.aforo, 24);

  // H1, for real: boot the actual engine over the produced datos/ and see the thing where Hyperfy had it
  const storage = new FileStorage(join(destino, "datos"));
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [crearObjetos()], storage, puede: () => false });
  const estado = new Map<string, Record<string, unknown>>();
  for (const [clave, valor] of inst.features.allState()) if (clave.startsWith("objetos:")) estado.set(clave.slice("objetos:".length), valor as Record<string, unknown>);
  assert.equal(estado.size, 1);
  const o = estado.get("ent-1")!;
  assert.equal(o.modelo, sha256);
  assert.equal(o.ext, "glb");
  assert.equal(o.nombre, "silla");
  assert.equal(o.x, 3); assert.equal(o.y, 0.5); assert.equal(o.z, -7);
  assert.equal(o.sx, 2); assert.equal(o.sy, 2); assert.equal(o.sz, 2);
  assert.ok(Math.abs(Number(o.ry) - 90) < 0.5, `ry debería ser ~90°, es ${o.ry}`); // the 90° yaw quaternion above
  assert.equal(o.rx, 0); assert.equal(o.rz, 0);
});

test("H11: quaternionAEuler decodes a plain yaw back to degrees", () => {
  const half = Math.PI / 4; // 90° total
  const { rx, ry, rz } = quaternionAEuler([0, Math.sin(half), 0, Math.cos(half)]);
  assert.ok(Math.abs(ry - 90) < 0.01);
  assert.equal(rx, 0);
  assert.equal(rz, 0);
  assert.deepEqual(quaternionAEuler(undefined), { rx: 0, ry: 0, rz: 0 }); // identity when a row has none
});

test("H11: leerAsset only accepts Hyperfy's own asset:// shape", () => {
  const sha = "a".repeat(64);
  assert.deepEqual(leerAsset(`asset://${sha}.glb`), { sha256: sha, ext: "glb" });
  assert.equal(leerAsset("https://example.com/x.glb"), null);
  assert.equal(leerAsset(undefined), null);
});

test("H11: a db.sqlite with no entities at all imports zero objects without crashing (empty world)", () => {
  const base = mkdtempSync(join(tmpdir(), "h11-vacio-"));
  const dbPath = join(base, "db.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)");
  db.exec("CREATE TABLE blueprints (id TEXT PRIMARY KEY, data TEXT)");
  db.exec("CREATE TABLE entities (id TEXT PRIMARY KEY, data TEXT)");
  db.close();
  const assetsDir = join(base, "assets");
  mkdirSync(assetsDir, { recursive: true });
  const destino = join(base, "mundo-numinia");
  const informe = importarMundoHyperfy({ dbPath, assetsDir, destino });
  assert.equal(informe.entidades.leidas, 0);
  assert.equal(informe.objetos.importados, 0);
  assert.equal(informe.ajustes.ficha, true); // a ficha with the fallback name is still written
});
