// pesca-boya: the gauge on my float at the waterline — pure maths (colour thresholds, visibility per phase, scale with the
// distance to the eye, pulse on a surge, repaint key at 1 %). Run: node --test test/pesca-boya.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { boyaVisible, colorTension, escalaBoya, pulsoBoya, marcoBoya, claveBoya, rellenos, VERDE, AMARILLO, ROJO, NARANJA, ESCALA_MIN, ESCALA_MAX, DIST_UNO_M, TENSION_ALTA } from "../packages/render/src/pesca-boya.ts";
import type { EntradaBoya, FaseBoya } from "../packages/render/src/pesca-boya.ts";

const e = (o: Partial<EntradaBoya> = {}): EntradaBoya => ({ fase: "pelea", tension: 50, progreso: 30, arrancada: "no", ...o });

test("colour: green below 60, yellow below 80, red from 80 (same threshold as the HUD)", () => {
  assert.equal(colorTension(0), VERDE); assert.equal(colorTension(59.9), VERDE);
  assert.equal(colorTension(60), AMARILLO); assert.equal(colorTension(79.9), AMARILLO);
  assert.equal(colorTension(TENSION_ALTA), ROJO); assert.equal(colorTension(100), ROJO);
  assert.equal(colorTension(-5), VERDE); assert.equal(colorTension(250), ROJO); assert.equal(colorTension(NaN), VERDE);
});

test("visible only for my float and only while it bites or fights", () => {
  const fases: FaseBoya[] = ["nada", "espera", "mordisqueo", "picada", "pelea"];
  assert.deepEqual(fases.filter((f) => boyaVisible(f, true)), ["picada", "pelea"]);
  assert.deepEqual(fases.filter((f) => boyaVisible(f, false)), []); // others' floats are unchanged
});

test("scale grows with the distance to the eye, within limits", () => {
  assert.equal(escalaBoya(0.5), ESCALA_MIN); assert.equal(escalaBoya(2), ESCALA_MIN);
  assert.equal(escalaBoya(DIST_UNO_M), 1);
  assert.equal(escalaBoya(8), 2); // the third-person camera at ~8 m: twice the base width
  assert.equal(escalaBoya(100), ESCALA_MAX); assert.equal(escalaBoya(NaN), ESCALA_MIN);
  let antes = 0; for (const d of [0, 1, 3, 4, 6, 8, 10, 20]) { const s = escalaBoya(d); assert.ok(s >= antes); antes = s; }
});

test("pulse: still without a surge, slow on the warning, fast and bigger on the surge", () => {
  for (const ms of [0, 100, 777]) assert.equal(pulsoBoya("no", ms), 1);
  const amp = (a: "aviso" | "si") => { let m = 0; for (let ms = 0; ms < 3000; ms += 7) m = Math.max(m, Math.abs(pulsoBoya(a, ms) - 1)); return m; };
  assert.ok(amp("aviso") > 0.04 && amp("aviso") <= 0.05 + 1e-9);
  assert.ok(amp("si") > amp("aviso") && amp("si") <= 0.09 + 1e-9);
});

test("frame colour: orange on the bite and the warning, red on a surge or a tension past the limit, none in a calm fight", () => {
  assert.equal(marcoBoya(e()), null);
  assert.equal(marcoBoya(e({ arrancada: "aviso" })), NARANJA);
  assert.equal(marcoBoya(e({ arrancada: "si" })), ROJO);
  assert.equal(marcoBoya(e({ tension: 85 })), ROJO);
  assert.equal(marcoBoya(e({ fase: "picada", tension: 0, progreso: 0 })), NARANJA);
});

test("repaint key: the same picture inside 1 %, a new one at each step; the bite ignores the numbers", () => {
  assert.equal(claveBoya(e({ tension: 50.2 })), claveBoya(e({ tension: 49.8 })));
  assert.notEqual(claveBoya(e({ tension: 50 })), claveBoya(e({ tension: 52 })));
  assert.notEqual(claveBoya(e({ progreso: 30 })), claveBoya(e({ progreso: 32 })));
  assert.notEqual(claveBoya(e()), claveBoya(e({ arrancada: "aviso" })));
  assert.equal(claveBoya(e({ fase: "picada", tension: 10 })), claveBoya(e({ fase: "picada", tension: 70, progreso: 5 })));
});

test("fill fractions: clamped, and empty outside the fight", () => {
  assert.deepEqual(rellenos(e({ tension: 40, progreso: 75 })), { tension: 0.4, progreso: 0.75 });
  assert.deepEqual(rellenos(e({ tension: 140, progreso: -3 })), { tension: 1, progreso: 0 });
  assert.deepEqual(rellenos(e({ fase: "picada", tension: 90, progreso: 90 })), { tension: 0, progreso: 0 });
});
