// N4 (Pablo, 18-10: «voy súper despacito», «que vayamos un poco más rápido»): «Velocidad al andar en VR» goes above 100 %
// with a published cap. packages/render/src/vr-paso.ts turns the stick's push into what the sim is told; the sim is untouched,
// so the server never sees a pace it does not already know. Pure numbers, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fxToFloat } from "../packages/core/src/index.ts";
import { SPEED, RUN_SPEED, STICK_MAX } from "../packages/sim/src/index.ts";
import { pasoVR, metrosPorSegundo, ANDAR_MS, CORRER_MS, BORDE_CORRER, VELOCIDAD_MAX, VELOCIDAD_MIN } from "../packages/render/src/vr-paso.ts";
import { VELOCIDAD } from "../packages/render/src/vr.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";

/** What the sim does with the page's push: the int8 axes, the length clamped to 1, the step of walking or running. */
const simula = (p: { mx: number; mz: number; correr: boolean }): number => {
  const ix = Math.round(p.mx * STICK_MAX), iz = Math.round(p.mz * STICK_MAX);
  let x = ix / STICK_MAX, z = iz / STICK_MAX;
  const len = Math.hypot(x, z); if (len > 1) { x /= len; z /= len; }
  return Math.hypot(x, z) * (p.correr ? fxToFloat(RUN_SPEED) : fxToFloat(SPEED));
};

test("the paces the page assumes are the sim's", () => {
  assert.equal(ANDAR_MS, fxToFloat(SPEED));
  assert.equal(CORRER_MS, fxToFloat(RUN_SPEED));
});

test("up to 100 % it is what it always was: the push shrinks, only the very edge runs", () => {
  for (const v of [0.4, 0.7, 1]) {
    const p = pasoVR(0, -0.8, v);
    assert.ok(Math.abs(p.mz - -0.8 * v) < 1e-9 && p.mx === 0 && !p.correr, `v=${v}: ${JSON.stringify(p)}`);
  }
  assert.equal(pasoVR(0, -1, 1).correr, true, "100 %: the full push runs");
  assert.equal(pasoVR(0, -0.96, 1).correr, false);
  assert.equal(pasoVR(0, -1, 0.9).correr, false, "90 %: the push never reaches the edge, as before");
  assert.deepEqual(pasoVR(0, 0, 1.5), { mx: 0, mz: 0, correr: false });
});

test("above 100 % a push of the same size goes faster, in the same direction", () => {
  const base = simula(pasoVR(0.6, 0.3, 1)), mas = simula(pasoVR(0.6, 0.3, 1.5)), tope = simula(pasoVR(0.6, 0.3, 2));
  assert.ok(mas > base * 1.45 && tope > mas, `${base} < ${mas} < ${tope}`);
  const p = pasoVR(0.6, 0.3, 2);
  assert.ok(Math.abs(p.mx / p.mz - 2) < 1e-9, "the direction does not change");
});

test("150 % of a half push is 150 % of the half-push pace; a hand's walk (0.7) too", () => {
  assert.ok(Math.abs(simula(pasoVR(0, -0.5, 1.5)) - ANDAR_MS * 0.75) < 0.03);
  assert.ok(Math.abs(simula(pasoVR(0.7, 0, 2)) - ANDAR_MS * 1.4) < 0.03, "tracked hands walk 0.7 of a pace: 1.4 at 200 %");
  assert.equal(pasoVR(0.7, 0, 2).correr, true, "faster than the walking step = the run flag with a short push");
});

test("the cap: nothing below the stick's edge goes over 200 % of the walking pace, the edge still runs at 4 m/s", () => {
  let mas = 0;
  for (let m = 0.01; m < BORDE_CORRER; m += 0.01) for (const ang of [0, 0.7, 1.9]) {
    const mx = m * Math.cos(ang), mz = m * Math.sin(ang);
    mas = Math.max(mas, simula(pasoVR(mx, mz, VELOCIDAD_MAX)));
  }
  assert.ok(mas <= ANDAR_MS * VELOCIDAD_MAX + 0.05, `max ${mas} m/s`);
  assert.ok(mas > ANDAR_MS * VELOCIDAD_MAX * 0.95, "and it does reach the cap");
  assert.ok(Math.abs(simula(pasoVR(0, -1, VELOCIDAD_MAX)) - CORRER_MS) < 0.05, "the edge: the running pace, as shipped");
  for (const v of [1, 1.3, 2]) assert.ok(simula(pasoVR(0, -1, v)) <= CORRER_MS + 1e-9, "never above the running pace");
  assert.ok(metrosPorSegundo(0.5, true) === 2);
});

test("it never slows down as the push grows (no dip at the walk/run hand-over)", () => {
  for (const v of [1.1, 1.5, 2]) {
    let antes = 0;
    for (let m = 0.01; m <= 1.0001; m += 0.01) {
      const s = simula(pasoVR(0, -Math.min(m, 1), v));
      assert.ok(s >= antes - 0.03, `v=${v} m=${m.toFixed(2)}: ${s} after ${antes}`);
      antes = s;
    }
  }
});

test("the setting, the view's clamp and limits.json publish the same cap", () => {
  const a = AJUSTES_MOTOR.find((x) => x.id === "velocidadVR") as { min: number; max: number; defecto: number; describe: string };
  assert.equal(a.max, VELOCIDAD_MAX * 100);
  assert.equal(a.min, VELOCIDAD_MIN * 100);
  assert.equal(a.defecto, 100, "the default is still the walking pace");
  assert.equal(VELOCIDAD.max, VELOCIDAD_MAX);
  const lim = JSON.parse(readFileSync("limits.json", "utf8")).limits.find((e: { key: string }) => e.key === "vr_stick_speed_cap");
  assert.equal(lim.value, a.max, "limits.json says the number the setting allows");
  assert.match(a.describe, /200 %/, "the setting's own words name the cap");
});
