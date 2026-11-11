import { test } from "node:test";
import assert from "node:assert/strict";
import { duracionHabla, esClipCamina, esClipHabla, esClipReposo } from "../packages/render/src/vida.ts";

test("an AI's own body: its clips are found by name (respira / habla / camina, or idle / talk / walk)", () => {
  assert.equal(esClipReposo("respira"), true); assert.equal(esClipReposo("idle"), true);
  assert.equal(esClipHabla("habla"), true); assert.equal(esClipHabla("talk"), true);
  assert.equal(esClipCamina("camina"), true); assert.equal(esClipCamina("walk"), true);
  assert.equal(esClipReposo("habla"), false, "a talking clip is never taken for the idle one");
});

test("an AI's own body talks about as long as the line takes, never longer than its bubble", () => {
  assert.equal(duracionHabla("", 8000), 1200);
  assert.equal(duracionHabla("x".repeat(20), 8000), 1200 + 20 * 55);
  assert.equal(duracionHabla("x".repeat(500), 8000), 8000, "capped by the bubble");
  assert.equal(duracionHabla("hola", 0), 0);
});
