// J14: lod-politica's hysteresis, pure (no three.js, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirLOD, LOD_LEJOS_M, LOD_HISTERESIS_M } from "../packages/render/src/lod-politica.ts";

test("lod: cerca when closer than LOD_LEJOS_M, lejos when farther (first decision, no state yet)", () => {
  assert.equal(decidirLOD(5, undefined), "cerca");
  assert.equal(decidirLOD(LOD_LEJOS_M - 0.01, undefined), "cerca");
  assert.equal(decidirLOD(LOD_LEJOS_M + 0.01, undefined), "lejos");
  assert.equal(decidirLOD(200, undefined), "lejos");
});

test("lod: hysteresis keeps 'cerca' until past LEJOS_M + HISTERESIS_M (no flicker walking out)", () => {
  assert.equal(decidirLOD(LOD_LEJOS_M + LOD_HISTERESIS_M - 0.01, "cerca"), "cerca");
  assert.equal(decidirLOD(LOD_LEJOS_M + LOD_HISTERESIS_M + 0.01, "cerca"), "lejos");
});

test("lod: hysteresis keeps 'lejos' until back below LEJOS_M - HISTERESIS_M (no flicker walking in)", () => {
  assert.equal(decidirLOD(LOD_LEJOS_M - LOD_HISTERESIS_M + 0.01, "lejos"), "lejos");
  assert.equal(decidirLOD(LOD_LEJOS_M - LOD_HISTERESIS_M - 0.01, "lejos"), "cerca");
});

test("lod: pacing right on LOD_LEJOS_M (inside the band) never switches either way", () => {
  assert.equal(decidirLOD(LOD_LEJOS_M, "cerca"), "cerca");
  assert.equal(decidirLOD(LOD_LEJOS_M, "lejos"), "lejos");
});

test("lod: a crowd at mixed distances splits cerca/lejos at LOD_LEJOS_M (20 people, device D cap 80)", () => {
  // 3 draw calls baked ('cerca') vs 1 ('lejos'): 20 people all cerca = 60 calls (already near the 80 cap with
  // nothing else in the scene); push half past LOD_LEJOS_M and the figure cost drops to 20*1.5 = 30.
  const gente = Array.from({ length: 20 }, (_, i) => 5 + i * 3); // 5..62 m
  const estados = gente.map((d) => decidirLOD(d, undefined));
  const calls = estados.reduce((n, e) => n + (e === "cerca" ? 3 : 1), 0);
  assert.ok(estados.includes("lejos"), "some of the 20 should be far enough for the one-piece LOD");
  assert.ok(calls < 60, `baking alone caps at 60 calls for 20 people; LOD must bring it below that (got ${calls})`);
});
