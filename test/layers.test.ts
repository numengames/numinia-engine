import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkLayers } from "../tools/layers.mjs";

const root = join(import.meta.dirname, "..");

test("the repository respects its layers", () => {
  assert.deepEqual(checkLayers(root), []);
});

test("an upward import is rejected with a readable reason", () => {
  const fake = mkdtempSync(join(tmpdir(), "layers-"));
  mkdirSync(join(fake, "tools"));
  copyFileSync(join(root, "tools/layers.json"), join(fake, "tools/layers.json"));
  mkdirSync(join(fake, "packages/core/src"), { recursive: true });
  writeFileSync(join(fake, "packages/core/src/index.ts"), `import { step } from "../../sim/src/index.ts";\n`);
  const v = checkLayers(fake);
  assert.equal(v.length, 1);
  assert.match(v[0], /'core' may not import 'sim'/);
});
