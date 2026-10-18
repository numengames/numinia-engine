// MVL1: opening settings from inside VR (wrist/panel button, panel's third page) changes the comfort vignette —
// one real engine value you can change without taking the headset off. `siguienteConfort`/`nombreConfort`
// (packages/render/src/vr.ts) are the pure cycle the panel's «Ajustes» button runs on each pulsar().
import { test } from "node:test";
import assert from "node:assert/strict";
import { NIVELES_CONFORT, nombreConfort, siguienteConfort } from "../packages/render/src/vr.ts";

test("siguienteConfort: cycles bajo -> medio -> alto -> bajo, never stalling", () => {
  let v = NIVELES_CONFORT[0];
  const vistos = [v];
  for (let i = 0; i < NIVELES_CONFORT.length; i++) { v = siguienteConfort(v); vistos.push(v); }
  assert.deepEqual(vistos, [...NIVELES_CONFORT, NIVELES_CONFORT[0]]);
});

test("siguienteConfort: a value off the three steps still lands on one of them", () => {
  const v = siguienteConfort(0.8); // comfort's own default (0.8) is not one of the three panel steps
  assert.ok(NIVELES_CONFORT.includes(v as (typeof NIVELES_CONFORT)[number]));
});

test("nombreConfort: names the nearest step for any value, including the default 0.8", () => {
  assert.equal(nombreConfort(0.3), "bajo");
  assert.equal(nombreConfort(0.6), "medio");
  assert.equal(nombreConfort(1), "alto");
  assert.equal(nombreConfort(0.8), "alto"); // 0.8 is closer to 1 than to 0.6
});
