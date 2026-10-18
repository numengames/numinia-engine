// Caso real: la Tabla de Prestigio del manual (Semillas verde 1 … roja 5; costes 50/100/200/500/1000) y
// el ritmo de las Reliquias (máximo tres portadas), simulados con tools/economia. Los números fijados aquí
// salen de una corrida (misma semilla → mismo resultado); si cambian, cambió el simulador o el modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validar } from "../tools/economia/diagrama.ts";
import { correr, finales, primerTick, resumen, simular } from "../tools/economia/simular.ts";
import { COSTES, diagramaPrestigio } from "../tools/economia/modelos/prestigio.ts";
import { diagramaReliquias } from "../tools/economia/modelos/reliquias.ts";

test("prestigio: el diagrama valida y el Prestigio total nunca baja aunque se gasten las Semillas", () => {
  const d = diagramaPrestigio();
  assert.equal(validar(d).ok, true);
  const r = simular(d, { ticks: 100, semilla: 5 });
  for (let t = 1; t <= 100; t++) assert.ok(r.series.prestigio[t] >= r.series.prestigio[t - 1]);
  assert.ok(r.series.semillas[100] < r.series.prestigio[100], "algo se gastó");
  // cada punto gastado es un nivel comprado: lo que entró = lo que queda + lo pagado
  const pagado = r.series.competencias[100] * COSTES.competencia + r.series.aptitudes[100] * COSTES.aptitud + r.series.caracteristicas[100] * COSTES.caracteristica;
  assert.equal(r.series.prestigio[100], r.series.semillas[100] + pagado);
});

test("prestigio, conclusión real: con 1-3 Semillas por sesión, la primera mejora llega a la sesión ~12 y una Aptitud nueva (1000) a la ~240", () => {
  const rs = correr(diagramaPrestigio({ persona: "ahorrador" }), { ticks: 300, semillas: 200 });
  const hasta = (coste: number) => resumen(rs.map((r) => primerTick(r, "prestigio", coste)));
  assert.deepEqual(hasta(COSTES.competencia), { n: 200, min: 7, p50: 12, p95: 16, max: 18, media: 12.4 });
  assert.deepEqual(hasta(COSTES.competenciaNueva), { n: 200, min: 101, p50: 118, p95: 128, max: 133, media: 118.6 });
  assert.deepEqual(hasta(COSTES.aptitudNueva), { n: 200, min: 215, p50: 239, p95: 253, max: 266, media: 238.2 });
  // renta media: 2 Semillas × 2,1 puntos = 4,2 puntos por sesión → 300 sesiones ≈ 1260
  assert.equal(resumen(finales(rs, "prestigio")).p50, 1260);
  // el ahorrador tiene 2 Competencias nuevas y ninguna Aptitud nueva al año 6 (300 sesiones semanales)
  assert.equal(resumen(finales(rs, "competencias_nuevas")).p50, 2);
  assert.equal(resumen(finales(rs, "aptitudes_nuevas")).max, 0);
});

test("prestigio: el gastador compra ~4 niveles de Competencia en 52 sesiones y nunca llega a 500 — no hay inflación, hay sequía", () => {
  const rs = correr(diagramaPrestigio({ persona: "gastador" }), { ticks: 52, semillas: 200 });
  assert.deepEqual(resumen(finales(rs, "competencias")), { n: 200, min: 3, p50: 4, p95: 4, max: 5, media: 4 });
  assert.equal(resumen(finales(rs, "competencias_nuevas")).max, 0);
  assert.ok(resumen(finales(rs, "semillas")).max < COSTES.competencia, "nunca queda más de 49 sin gastar");
});

test("prestigio con escalada (freno, no canon): el mismo jugador compra 1 Competencia y pasa a Aptitudes; sin escalada, 4-5", () => {
  const con = correr(diagramaPrestigio({ persona: "gastador", escalada: true }), { ticks: 52, semillas: 50 });
  const sin = correr(diagramaPrestigio({ persona: "gastador" }), { ticks: 52, semillas: 50 });
  assert.ok(resumen(finales(con, "competencias")).max < resumen(finales(sin, "competencias")).min);
  assert.ok(resumen(finales(con, "aptitudes")).min > 0);
});

test("reliquias, conclusión real: al 5 % por encuentro, la mediana ve la 1.ª a los 12 y la desafortunada (p95) a los 57", () => {
  const d = diagramaReliquias({ base: 50 });
  assert.equal(validar(d).ok, true);
  const rs = correr(d, { ticks: 300, semillas: 500 });
  assert.deepEqual(resumen(rs.map((r) => primerTick(r, "reliquias", 1))), { n: 500, min: 1, p50: 12, p95: 57, max: 156, media: 19.2 });
  assert.deepEqual(resumen(rs.map((r) => primerTick(r, "reliquias", 3))), { n: 500, min: 7, p50: 52, p95: 121, max: 260, media: 58.5 });
  assert.equal(resumen(rs.map((r) => Math.max(...r.series.fallos))).p95, 103);
});

test("reliquias con piedad (+1 % por fallo): la p95 baja de 57 a 19 y ninguna racha pasa de 36; la media de Reliquias sube ×2", () => {
  const sin = correr(diagramaReliquias({ base: 50 }), { ticks: 300, semillas: 500 });
  const con = correr(diagramaReliquias({ base: 50, piedad: 10 }), { ticks: 300, semillas: 500 });
  assert.deepEqual(resumen(con.map((r) => primerTick(r, "reliquias", 1))), { n: 500, min: 1, p50: 8, p95: 19, max: 34, media: 9.1 });
  assert.equal(resumen(con.map((r) => Math.max(...r.series.fallos))).max, 36);
  assert.ok(resumen(finales(con, "reliquias")).media > 2 * resumen(finales(sin, "reliquias")).media);
  // la piedad fija el ritmo: con base 10‰ y la misma piedad, la espera mediana apenas cambia (11 frente a 8)
  const poca = correr(diagramaReliquias({ base: 10, piedad: 10 }), { ticks: 300, semillas: 500 });
  assert.equal(resumen(poca.map((r) => primerTick(r, "reliquias", 1))).p50, 11);
  // y el contador de fallos vuelve a 0 cada vez que cae una Reliquia
  for (const r of con.slice(0, 20)) for (let t = 1; t < r.series.reliquias.length; t++) if (r.series.reliquias[t] > r.series.reliquias[t - 1]) assert.equal(r.series.fallos[t], 0);
});
