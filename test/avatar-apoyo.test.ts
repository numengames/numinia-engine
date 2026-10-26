// t_3f0e5846 · feet on the floor during a calm posture (sitting, crouching): the pure arithmetic and which moves ask for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APOYO_MAX_M, metaApoyo, suavizarApoyo } from "../packages/render/src/avatares-politica.ts";
import { MOVIMIENTOS } from "../features/gestos/movimientos.ts";

test("metaApoyo: an ankle 5 cm too low is lifted 5 cm, one 5 cm too high is lowered 5 cm, one in place stays", () => {
  assert.ok(Math.abs(metaApoyo(0.04, 0.09) - 0.05) < 1e-9, "sunk feet: the body goes up");
  assert.ok(Math.abs(metaApoyo(0.14, 0.09) + 0.05) < 1e-9, "floating feet: the body goes down");
  assert.equal(metaApoyo(0.09, 0.09), 0);
});

test("metaApoyo: a broken measure never moves the body more than the limit, and NaN means do nothing", () => {
  assert.equal(metaApoyo(-1, 0.09), APOYO_MAX_M);
  assert.equal(metaApoyo(1, 0.09), -APOYO_MAX_M);
  assert.equal(metaApoyo(NaN, 0.09), 0);
  assert.equal(metaApoyo(0.05, Infinity), 0);
});

test("suavizarApoyo: follows its target without overshoot, the same at 30 and 120 fps, and lands exactly", () => {
  const correr = (fps: number, segundos: number) => { let x = 0; for (let i = 0; i < fps * segundos; i++) x = suavizarApoyo(x, 0.05, 1 / fps); return x; };
  for (const fps of [30, 60, 120]) { const x = correr(fps, 0.2); assert.ok(x > 0.03 && x < 0.05, `${fps} fps: ${x}`); }
  assert.ok(Math.abs(correr(30, 0.2) - correr(120, 0.2)) < 0.002, "frame-rate independent");
  assert.equal(correr(60, 2), 0.05, "lands on the target");
  assert.equal(suavizarApoyo(0.05, 0, 1 / 60) < 0.05, true, "and eases back to 0 when the posture ends");
  assert.equal(suavizarApoyo(0.3, 0.3, 0), 0.3, "dt 0 changes nothing");
});

test("only the calm postures that stand on the floor ask for it: sitting, sitting and talking, crouching", () => {
  assert.deepEqual(MOVIMIENTOS.filter((m) => m.apoya).map((m) => m.id).sort(), ["agacharse", "charlar-sentado", "sentarse"]);
  for (const m of MOVIMIENTOS.filter((x) => x.apoya)) assert.equal(m.viva, false, `${m.id} is a calm posture`);
});
