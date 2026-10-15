// H8 + H12: particle curves (the GPU's 4-key formula = the plain one), caps per device tier (one source: limits.json),
// quality per tier (phones cold), and the fire light's flicker never flashing more than 3 times per second (V7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluar, curva4, evaluar4, color4, parpadeo, destellosPorSegundo } from "../packages/render/src/curvas.ts";
import type { Curva } from "../packages/render/src/curvas.ts";
import { CALIDAD_POR_NIVEL, TOPE_PARTICULAS, LUCES_FUEGO, nivelDe, capacidades, acotarCalidad, particulasPara } from "../packages/render/src/calidad.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const limits = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")).limits as { axis: string; scope: string; key: string; value: unknown }[];
const limite = (scope: string, key: string) => limits.find((l) => l.axis === "device" && l.scope === scope && l.key === key)?.value;

test("curves: the GPU's 4-key formula gives the same values as plain piecewise-linear evaluation", () => {
  const curvas: Curva[] = [[[0, 0], [0.2, 1], [0.7, 0.6], [1, 0]], [[0, 1], [1, 0]], [[0, 0.5]], [[0.3, 2], [0.6, 1]]];
  for (const c of curvas) {
    const c4 = curva4(c);
    for (let a = 0; a <= 1.0001; a += 0.01) assert.ok(Math.abs(evaluar4(c4, a) - evaluar(c, a)) < 1e-9, `${JSON.stringify(c)} @ ${a.toFixed(2)}`);
  }
  // more than 4 keys: resampled at thirds, exact at those points
  const larga: Curva = [[0, 0], [0.1, 1], [0.3, 0.2], [0.5, 0.9], [0.8, 0.1], [1, 0]];
  const l4 = curva4(larga);
  for (const t of [0, 1 / 3, 2 / 3, 1]) assert.ok(Math.abs(evaluar4(l4, t) - evaluar(larga, t)) < 1e-9);
  const [r, g, b] = color4([[0, 1, 0.9, 0.5], [0.5, 1, 0.4, 0.1], [1, 0.2, 0.2, 0.2]]);
  assert.deepEqual([evaluar4(r, 0.25), evaluar4(g, 0.25), evaluar4(b, 1)].map((x) => Math.round(x * 100) / 100), [1, 0.65, 0.2]);
});

test("flash limiter: the fire light never flashes more than 3 times per second (smooth flicker)", () => {
  for (const semilla of [0, 1, 2.5, 7]) {
    const n = destellosPorSegundo((t) => parpadeo(t, semilla), 60);
    assert.ok(n <= 3, `semilla ${semilla}: ${n} destellos en un segundo`);
    for (let t = 0; t < 10; t += 0.01) { const v = parpadeo(t, semilla); assert.ok(v > 0.7 && v < 1.3, `flicker ${v}`); }
  }
  // the counter itself catches a fast flicker (sanity check of the check)
  assert.ok(destellosPorSegundo((t) => Math.sin(2 * Math.PI * 5 * t), 3) >= 5);
});

test("tiers: decided by capability; phones and XR start cold (no shadows, simple water, few particles, no HDR light)", () => {
  assert.equal(nivelDe({ mobile: false }), "A");
  assert.equal(nivelDe({ mobile: true }), "C");
  assert.equal(nivelDe({ mobile: true, deviceMemoryGB: 2 }), "D");
  assert.equal(nivelDe({ mobile: false, saveData: true }), "D");
  assert.equal(nivelDe({ mobile: false, xr: true }), "B");
  for (const n of ["B", "C", "D"] as Nivel[]) assert.deepEqual(CALIDAD_POR_NIVEL[n], { sombras: "no", agua: "simple", particulas: "pocas", hdr: false }, n);
  assert.equal(CALIDAD_POR_NIVEL.A.agua, "reflejos");
  // asking for more than the tier allows is clamped; unknown words keep what there was
  const d = acotarCalidad("D", CALIDAD_POR_NIVEL.D, { sombras: "alta", agua: "reflejos", particulas: "muchas", hdr: true });
  assert.deepEqual(d, { sombras: "no", agua: "simple", particulas: "pocas", hdr: false });
  assert.equal(acotarCalidad("A", CALIDAD_POR_NIVEL.A, { sombras: "nada" as never }).sombras, "media");
  assert.deepEqual(capacidades("C").sombras, ["no", "baja"]);
  assert.deepEqual(capacidades("A").agua, ["simple", "reflejos"]);
});

test("particle caps per tier match limits.json, and an emitter never gets more than its tier allows", () => {
  for (const n of ["A", "B", "C", "D"] as Nivel[]) {
    assert.equal(limite(n, "particles_per_emitter"), TOPE_PARTICULAS[n].emisor, `limits.json particles_per_emitter ${n}`);
    assert.equal(limite(n, "particles_total"), TOPE_PARTICULAS[n].total, `limits.json particles_total ${n}`);
    assert.equal(limite(n, "fire_lights"), LUCES_FUEGO[n], `limits.json fire_lights ${n}`);
    assert.ok(particulasPara(n, "muchas", 1e6, 0) <= TOPE_PARTICULAS[n].emisor);
    assert.equal(particulasPara(n, "normal", 100, TOPE_PARTICULAS[n].total), 0, "nothing left of the total: none");
  }
  assert.equal(particulasPara("A", "pocas", 1000, 0), 300);
  assert.equal(particulasPara("D", "normal", 1000, 450), 50);
});
