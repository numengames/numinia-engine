import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { describeInstance } from "../packages/cli/src/describe.ts";

test("documentación verdadera: cada paquete tiene README y aparece en llms.txt", () => {
  const llms = readFileSync("llms.txt", "utf8");
  for (const pkg of readdirSync("packages")) {
    assert.ok(existsSync(`packages/${pkg}/README.md`), `packages/${pkg}/README.md falta: escribe qué es, qué no, dependencias, pruebas`);
    assert.ok(llms.includes(`\`${pkg}\``), `llms.txt no menciona el paquete '${pkg}': añade una línea en "Packages"`);
  }
  assert.ok(existsSync("docs/MAPA.md"));
});

test("describe: determinista y coherente", () => {
  const o = { seed: 7, bots: 5, ticks: 40, k: 50 };
  const a = describeInstance(o), b = describeInstance(o);
  assert.deepEqual(a, b);
  assert.equal(a.entities.length, 5);
  for (const e of a.entities) assert.ok(!e.sees.includes(e.id), "nadie se ve a sí mismo");
});
