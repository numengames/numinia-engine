// t_5eb6d923: every world ships a first quest (the thread everything else hangs from). The engine's template
// (aventuras/ejemplo) already seeds it (mundo-carpeta.ts sembrar()); this checks tools/aventura.ts warns when a
// world's adventure folder has none, without turning that into a load error (an adventure with no misiones/ at
// all still loads fine today).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const correr = (dir: string) => spawnSync(process.execPath, ["tools/aventura.ts", dir], { encoding: "utf8" });

test("tools/aventura.ts: the example template carries a quest, no warning", () => {
  const r = correr("aventuras/ejemplo");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /misiones \(manos-a-la-obra, primeros-pasos\)/);
  assert.doesNotMatch(r.stdout, /sin ninguna misión/);
});

test("tools/aventura.ts: an adventure folder with no misiones/ at all warns, but still loads (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "aventura-sin-mision-"));
  const r = correr(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /0 misiones/);
  assert.match(r.stdout, /⚠ sin ninguna misión/);
});

test("tools/aventura.ts: a misiones/ folder with a quest file does not warn", () => {
  const dir = mkdtempSync(join(tmpdir(), "aventura-con-mision-"));
  mkdirSync(join(dir, "misiones"));
  writeFileSync(join(dir, "misiones", "una.json"), JSON.stringify({ formato: "mision@1", id: "una", titulo: "Una", descripcion: "d", pasos: [{ id: "p", tipo: "llega_a", texto: "t", x: 0, z: 0, radio: 1, lugar: "Sitio" }] }));
  const r = correr(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /sin ninguna misión/);
});
