// Pure-function tests for tools/tipos.ts (the strict-TypeScript ratchet gate). The tsc run itself is the gate in
// `npm run gates`; here only the counting and the «no new errors» decision are covered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contar, paquete, comparar, fijar, resumenPorPaquete } from "../tools/tipos.ts";

const salida = [
  "packages/render/a.ts(12,3): error TS2345: Argument of type 'x' is not assignable.",
  "  Type 'x' is missing the following properties: y",
  "packages/render/a.ts(40,9): error TS7006: Parameter 'p' implicitly has an 'any' type.",
  "test/b.test.ts(5,1): error TS2339: Property 'z' does not exist.",
  "Found 3 errors in 2 files.",
].join("\n");

test("contar: errors per file, continuation lines and the summary line are ignored", () => {
  assert.deepEqual(contar(salida), { "packages/render/a.ts": 2, "test/b.test.ts": 1 });
  assert.deepEqual(contar(""), {});
});

test("paquete: packages/apps/features take two segments, the rest the first folder", () => {
  assert.equal(paquete("packages/render/a.ts"), "packages/render");
  assert.equal(paquete("features/cliente.ts"), "features");
  assert.equal(paquete("apps/plaza/x/y.ts"), "apps/plaza");
  assert.equal(paquete("test/b.test.ts"), "test");
  assert.equal(paquete("tools/x.ts"), "tools");
});

test("comparar: a file not on the list must have 0, a listed file may not grow", () => {
  const permitidos = { "a.ts": 2, "b.ts": 1 };
  assert.deepEqual(comparar({ "a.ts": 2, "b.ts": 1 }, permitidos).nuevos, []);
  assert.deepEqual(comparar({ "c.ts": 1 }, permitidos).nuevos, [{ archivo: "c.ts", tiene: 1, permitidos: 0 }]);
  assert.deepEqual(comparar({ "a.ts": 3, "b.ts": 1 }, permitidos).nuevos, [{ archivo: "a.ts", tiene: 3, permitidos: 2 }]);
});

test("comparar: fewer errors than allowed is reported as an improvement, not a failure", () => {
  const r = comparar({ "a.ts": 1 }, { "a.ts": 2, "b.ts": 1 });
  assert.deepEqual(r.nuevos, []);
  assert.deepEqual(r.mejoran.map((m) => m.archivo).sort(), ["a.ts", "b.ts"]);
});

test("fijar: lowers and drops fixed files, refuses to raise unless asked", () => {
  const permitidos = { "a.ts": 2, "b.ts": 1 };
  assert.deepEqual(fijar({ "a.ts": 1 }, permitidos), { lista: { "a.ts": 1 }, sube: [] });
  const sube = fijar({ "a.ts": 3, "c.ts": 1 }, permitidos);
  assert.deepEqual(sube.sube, ["a.ts", "c.ts"]);
  assert.deepEqual(sube.lista, { "a.ts": 2 });
  assert.deepEqual(fijar({ "a.ts": 3 }, permitidos, true).lista, { "a.ts": 3 });
});

test("resumenPorPaquete: a package without errors shows 0, so it is visibly protected", () => {
  const r = resumenPorPaquete({ "packages/render/a.ts": 2 }, { "packages/render/a.ts": 2 }, ["packages/core", "packages/render"]);
  assert.deepEqual(r["packages/core"], { errores: 0, permitidos: 0 });
  assert.deepEqual(r["packages/render"], { errores: 2, permitidos: 2 });
});

test("the committed allowance list is well formed: positive whole numbers, only existing .ts paths", () => {
  const j = JSON.parse(readFileSync(new URL("../tools/tipos-permitidos.json", import.meta.url), "utf8"));
  for (const [f, n] of Object.entries(j.archivos as Record<string, number>)) {
    assert.ok(f.endsWith(".ts"), f);
    assert.ok(Number.isInteger(n) && n > 0, `${f}: ${n}`);
    readFileSync(new URL(`../${f}`, import.meta.url)); // throws when a listed file was deleted or renamed
  }
});
