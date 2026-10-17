// N2: the stylised water's detail per device tier (calidad.ts DETALLE_AGUA) and the grid it is drawn on (agua-estilo.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detalleAgua, DETALLE_AGUA, OLAS_DESDE_M, AGUAS } from "../packages/render/src/calidad.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";
import { geometriaDeAgua, celdasOlas, amplitudOlas } from "../packages/render/src/agua-estilo.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const extras = (n: Nivel) => { const d = detalleAgua(n, "reflejos"); return [d.olas > 0, d.espumaViva, d.lineas, d.causticas, d.destellos].filter(Boolean).length; };

test("water detail climbs with the tier: desktop most, old phone least", () => {
  assert.ok(extras("A") > extras("C") && extras("C") >= extras("D"), `${extras("A")} ${extras("C")} ${extras("D")}`);
  const d = detalleAgua("D", "simple");
  assert.deepEqual(d, { olas: 0, espumaViva: false, lineas: false, causticas: false, destellos: false }, "D: bands + still foam + fresnel only");
});

test("sun glints only with the «reflejos» choice on desktop; Quest in XR draws no per-pixel extras", () => {
  assert.equal(detalleAgua("A", "reflejos").destellos, true);
  assert.equal(detalleAgua("A", "simple").destellos, false);
  for (const a of AGUAS) { const b = detalleAgua("B", a); assert.equal(b.causticas || b.destellos, false, a); assert.ok(b.olas > 0, "vertex waves are cheap on Quest"); }
});

test("asking more than the tier allows gets the tier's ceiling", () => {
  for (const n of ["B", "C", "D"] as Nivel[]) assert.deepEqual(detalleAgua(n, "reflejos"), detalleAgua(n, "simple"), n);
  // a copy: changing it never touches the table
  const d = detalleAgua("A", "reflejos"); d.olas = 1; assert.equal(DETALLE_AGUA.A.reflejos.olas, 96);
});

test("wave grid: one quad for small water and on D, capped cells and gentle swell on big water", () => {
  const vertices = (n: Nivel, ancho: number, largo: number) => geometriaDeAgua({ tipo: "rect", ancho, largo }, detalleAgua(n, "reflejos"), OLAS_DESDE_M).getAttribute("position").count;
  assert.equal(vertices("A", 3.2, 3.2), 4, "a fountain stays one quad");
  assert.equal(vertices("D", 60, 40), 4, "D: no waves, one quad");
  for (const n of NIVELES) { const cap = DETALLE_AGUA[n].reflejos.olas; assert.ok(vertices(n, 200, 200) <= (Math.max(1, cap) + 1) ** 2, n); }
  assert.ok(vertices("A", 60, 40) > vertices("C", 60, 40), "desktop gets the finer grid");
  assert.equal(celdasOlas(10, 0), 1); assert.equal(celdasOlas(500, 32), 32); assert.equal(celdasOlas(5, 96), 4);
  for (const l of [1, 12, 40, 200]) { const a = amplitudOlas(l); assert.ok(a >= 0.05 && a <= 0.35, `${l}: ${a}`); }
  // the geometry lies flat (+y up) so the mesh needs no rotation
  const g = geometriaDeAgua({ tipo: "circulo", radio: 4 }, detalleAgua("A", "reflejos"), OLAS_DESDE_M);
  g.computeBoundingBox(); assert.ok(Math.abs(g.boundingBox!.max.y) < 1e-6 && g.boundingBox!.max.x > 3.9);
});
