// Pure-function tests for tools/ci-gates.mjs (the PR workflow: bench + gates + size, ratio vs main).
// The full flow (worktree, npm ci, two bench runs) is for CI, not for this fast test file; only the
// decision math is covered here, like `gates.mjs` covers its own thresholds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratio, empeora } from "../tools/ci-gates.mjs";

test("ratio: equal measures give 1", () => {
  assert.equal(ratio(10, 10), 1);
});

test("ratio: HEAD slower than base gives > 1", () => {
  assert.ok(ratio(12, 10) > 1);
});

test("ratio: base is 0 and HEAD is 0 is treated as no change", () => {
  assert.equal(ratio(0, 0), 1);
});

test("ratio: base is 0 and HEAD > 0 is an infinite regression", () => {
  assert.equal(ratio(5, 0), Infinity);
});

test("empeora: within the 10% default budget passes", () => {
  assert.equal(empeora(ratio(109, 100)), false);
  assert.equal(empeora(ratio(111, 100)), true);
});

test("empeora: a custom budget is honoured", () => {
  assert.equal(empeora(ratio(114, 100), 1.15), false);
  assert.equal(empeora(ratio(116, 100), 1.15), true);
});
