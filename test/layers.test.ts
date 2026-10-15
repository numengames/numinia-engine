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

test("features/: only composition roots import a feature; a feature uses only the plug, never a library", () => {
  const fake = mkdtempSync(join(tmpdir(), "layers-"));
  mkdirSync(join(fake, "tools"));
  copyFileSync(join(root, "tools/layers.json"), join(fake, "tools/layers.json"));
  for (const d of ["packages/instance/src", "packages/server/src", "features/rara"]) mkdirSync(join(fake, d), { recursive: true });
  writeFileSync(join(fake, "packages/instance/src/index.ts"), `import f from "../../../features/servidor.ts";\n`);
  writeFileSync(join(fake, "packages/server/src/main.ts"), `import f from "../../../features/servidor.ts";\n`); // a composition root
  writeFileSync(join(fake, "features/rara/server.ts"), [
    `import { serverPart } from "../../packages/feature/src/index.ts";`,
    `import { step } from "../../packages/sim/src/index.ts";`,
    `import * as THREE from "three";`, ""].join("\n"));
  const v = checkLayers(fake);
  assert.equal(v.length, 3, v.join("\n"));
  assert.match(v[0], /packages\/instance\/src\/index\.ts: packages never import features\//);
  assert.match(v[1], /a feature may not import 'sim'/);
  assert.match(v[2], /features import nothing outside the repo \('three'\)/);
});
