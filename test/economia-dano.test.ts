// Daño en combate con D6 por Éxitos (MIS-245): los números salen de una corrida sembrada; si cambian,
// cambió el simulador o el modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validar } from "../tools/economia/diagrama.ts";
import { correr, finales, primerTick, resumen, simular } from "../tools/economia/simular.ts";
import { diagramaDano, estadoCriatura } from "../tools/economia/modelos/dano.ts";

test("daño: el diagrama valida y cada Éxito suma exactamente su daño", () => {
  const d = diagramaDano();
  assert.equal(validar(d).ok, true);
  const r = simular(d, { ticks: 30, semilla: 7 });
  for (let t = 1; t <= 30; t++) assert.ok(r.series.dano[t] >= r.series.dano[t - 1]);
  assert.equal(r.series.dano[30], r.series.exitos[30] * 3);
  assert.equal(r.series.reserva[30], 0, "todos los dados se resuelven en la ronda");
});

test("daño, conclusión real: 4d6 con Éxito 5+ y 3 por Éxito derriba una criatura de 30 en ~8 rondas (p95 11)", () => {
  const rs = correr(diagramaDano(), { ticks: 40, semillas: 500 });
  assert.deepEqual(resumen(rs.map((r) => primerTick(r, "dano", 15))), { n: 500, min: 2, p50: 4, p95: 7, max: 10, media: 4.2 });
  assert.deepEqual(resumen(rs.map((r) => primerTick(r, "dano", 30))), { n: 500, min: 4, p50: 8, p95: 11, max: 16, media: 8 });
  // esperanza: 4 dados × 1/3 × 3 = 4 de daño por ronda → 40 rondas ≈ 160
  assert.ok(Math.abs(resumen(finales(rs, "dano")).media - 160.6) < 1);
});

test("daño: un dado menos y el doble de vida casi triplican el combate (3d6, vida 60: p50 20 rondas)", () => {
  const rs = correr(diagramaDano({ dados: 3, vida: 60 }), { ticks: 60, semillas: 500 });
  assert.deepEqual(resumen(rs.map((r) => primerTick(r, "dano", 60))), { n: 500, min: 13, p50: 20, p95: 27, max: 36, media: 20.5 });
});

test("daño: el estado de la criatura sigue el daño acumulado", () => {
  assert.deepEqual([0, 14, 15, 29, 30, 99].map((x) => estadoCriatura(x, 30)), ["sana", "sana", "herida", "herida", "caida", "caida"]);
});
