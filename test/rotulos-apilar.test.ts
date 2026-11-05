// mundo-hermes · M4: the flat plates over mirrored things keep clear of each other (packages/render/src/rotulos-apilar.ts, pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apilar, levantarSobre, HUECO_NDC, NIVELES_MAX } from "../packages/render/src/rotulos-apilar.ts";
import type { Placa } from "../packages/render/src/rotulos-apilar.ts";

const rect = (p: Placa, n: number) => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.cy + n * (p.h + HUECO_NDC), y1: p.cy + n * (p.h + HUECO_NDC) + p.h });
const solapan = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test("one plate, or plates side by side, stay where they are", () => {
  assert.deepEqual([...apilar([{ clave: "a", cx: 0, cy: 0.2, w: 0.3, h: 0.1, d: 3 }])], [["a", 0]]);
  const n = apilar([{ clave: "a", cx: -0.5, cy: 0.2, w: 0.3, h: 0.1, d: 3 }, { clave: "b", cx: 0.5, cy: 0.2, w: 0.3, h: 0.1, d: 4 }]);
  assert.deepEqual([n.get("a"), n.get("b")], [0, 0]);
});

test("the nearest stays, the farther one goes up one plate height; two on the same spot are never drawn over each other", () => {
  const n = apilar([{ clave: "lejos", cx: 0, cy: 0.2, w: 0.3, h: 0.1, d: 9 }, { clave: "cerca", cx: 0.05, cy: 0.2, w: 0.3, h: 0.1, d: 2 }]);
  assert.equal(n.get("cerca"), 0); assert.equal(n.get("lejos"), 1);
});

test("14 profiles in a row of a 4 m grid seen from 3 m: whatever is shown overlaps nothing; the rest is hidden, the nearest are never hidden", () => {
  const placas: Placa[] = Array.from({ length: 14 }, (_, i) => { const x = (i % 5) - 2, z = Math.floor(i / 5); return { clave: `p${i}`, cx: x * 0.12, cy: 0.1 + z * 0.01, w: 0.3, h: 0.08, d: 3 + Math.hypot(x, z) * 4 }; });
  const n = apilar(placas);
  const mostradas = placas.filter((p) => (n.get(p.clave) ?? -1) >= 0);
  for (let i = 0; i < mostradas.length; i++) for (let j = i + 1; j < mostradas.length; j++) assert.equal(solapan(rect(mostradas[i], n.get(mostradas[i].clave)!), rect(mostradas[j], n.get(mostradas[j].clave)!)), false, `${mostradas[i].clave} / ${mostradas[j].clave}`);
  for (const p of mostradas) assert.ok((n.get(p.clave) as number) <= NIVELES_MAX);
  const nearest = [...placas].sort((a, b) => a.d - b.d)[0];
  assert.equal(n.get(nearest.clave), 0, "the nearest keeps its place");
  assert.ok(mostradas.length >= 5 && mostradas.length < 14, `some are stacked and some give way (${mostradas.length} shown)`);
});

test("same input, same answer, input untouched", () => {
  const placas: Placa[] = [{ clave: "b", cx: 0, cy: 0, w: 1, h: 0.2, d: 5 }, { clave: "a", cx: 0, cy: 0, w: 1, h: 0.2, d: 5 }];
  const copia = JSON.stringify(placas);
  assert.deepEqual([...apilar(placas)], [...apilar([...placas].reverse())]);
  assert.equal(JSON.stringify(placas), copia);
});

test("a plate whose bottom is under its figure's top rises by whole steps until it clears it; one that clears already does not move", () => {
  assert.equal(levantarSobre(0.30, 0.20, 0.02, 0.1), 0);
  assert.equal(levantarSobre(0.10, 0.20, 0.02, 0.1), 2); // needs 0.12 → 2 steps
  assert.equal(levantarSobre(0.10, 0.20, 0.02, 0), 0, "a zero step never loops");
  assert.equal(levantarSobre(-5, 0.2, 0.02, 0.01, 7), 7, "capped");
});
