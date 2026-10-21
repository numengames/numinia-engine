// docs/VERSIONES.md: the engine carries a semantic version (STD-019), the only one the page shows; it started at 0.1.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));

test("the version is major.minor.patch, at least 0.1.0, and the lock file says the same", () => {
  const v = leer("package.json").version as string;
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v);
  assert.ok(m, `not a semantic version: ${v}`);
  const [, a, b] = m.map(Number);
  assert.ok(a > 0 || b >= 1, `below 0.1.0: ${v}`);
  const lock = leer("package-lock.json");
  assert.equal(lock.version, v);
  assert.equal(lock.packages[""].version, v);
});

test("semverMotor(): the root package.json's major.minor.patch in a checkout, read once (what /status says as `semver`)", async () => {
  const { semverMotor } = await import("../packages/server/src/version.ts");
  const v = leer("package.json").version as string;
  assert.equal(semverMotor(), v);
  assert.match(semverMotor()!, /^\d+\.\d+\.\d+$/);
  assert.equal(semverMotor(), v, "cached: the second call answers the same");
});

test("tools/build-deploy.mjs stamps the semver into app/build.json (an installed app has no root package.json version)", () => {
  const src = readFileSync(new URL("../tools/build-deploy.mjs", import.meta.url), "utf8");
  assert.match(src, /JSON\.stringify\(\{ build, commit, semver: /);
});
