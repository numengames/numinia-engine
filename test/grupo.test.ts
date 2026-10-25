// Lote4: turn / scale a multi-selection as one unit — packages/render/src/grupo.ts (pure maths).
import { test } from "node:test";
import assert from "node:assert/strict";
import { transformarGrupo, centroGrupo } from "../packages/render/src/grupo.ts";
import type { Donde } from "../packages/render/src/gizmo.ts";

const cosa = (x: number, y: number, z: number, ry = 0, s = 1): Donde => ({ x, y, z, rx: 0, ry, rz: 0, sx: s, sy: s, sz: s });
const cerca = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

test("centroGrupo: the mean of the positions", () => {
  const c = centroGrupo(new Map([["a", cosa(0, 0, 0)], ["b", cosa(4, 2, -2)]]));
  assert.deepEqual(c, { x: 2, y: 1, z: -1 });
});

test("mover: the rest follow the primary's translation, nothing else changes", () => {
  const ini = new Map([["a", cosa(0, 0, 0)], ["b", cosa(3, 0, 1, 20, 2)]]);
  const f = transformarGrupo(ini, "a", cosa(1.5, 0.5, -1), "mover");
  assert.deepEqual(f.get("b"), cosa(4.5, 0.5, 0, 20, 2));
  assert.deepEqual(f.get("a"), cosa(1.5, 0.5, -1));
});

test("girar: two blocks turned 90° with the primary orbit the group's centre and both end up turned 90°", () => {
  const ini = new Map([["a", cosa(0, 0, 0)], ["b", cosa(2, 0, 0)]]);          // centre (1, 0, 0)
  const f = transformarGrupo(ini, "b", cosa(2, 0, 0, 90), "girar");           // the gizmo turned b by 90° around Y
  const a = f.get("a")!, b = f.get("b")!;
  assert.ok(cerca(a.ry, 90) && cerca(b.ry, 90, 0.11), `both turned 90° (a ${a.ry}, b ${b.ry})`);
  // a quarter turn about +Y sends +x to -z: a (at -1 from the centre) goes to +z, b (at +1) goes to -z
  assert.ok(cerca(a.x, 1) && cerca(a.z, 1), `a orbits to (1, 1) — got (${a.x}, ${a.z})`);
  assert.ok(cerca(b.x, 1) && cerca(b.z, -1), `b orbits to (1, -1) — got (${b.x}, ${b.z})`);
  assert.ok(cerca(Math.hypot(a.x - b.x, a.z - b.z), 2), "the distance between them is kept (a rigid group)");
});

test("girar: orientations compose (a thing already turned 30° ends at 120° after a 90° group turn); height untouched", () => {
  const ini = new Map([["a", cosa(0, 1, 0, 30)], ["b", cosa(2, 1, 0)]]);
  const f = transformarGrupo(ini, "b", cosa(2, 1, 0, 90), "girar");
  assert.ok(cerca(f.get("a")!.ry, 120, 0.11), `ry ${f.get("a")!.ry}`);
  assert.ok(cerca(f.get("a")!.y, 1) && cerca(f.get("b")!.y, 1));
});

test("escalar: a ratio of 2 doubles every scale and doubles the distance of every thing from the centre", () => {
  const ini = new Map([["a", cosa(0, 0, 0, 0, 1)], ["b", cosa(2, 0, 0, 0, 1.5)]]);   // centre (1, 0, 0)
  const f = transformarGrupo(ini, "b", cosa(2, 0, 0, 0, 3), "escalar");              // b: 1.5 -> 3
  const a = f.get("a")!, b = f.get("b")!;
  assert.deepEqual([a.sx, a.sy, a.sz, b.sx, b.sy, b.sz], [2, 2, 2, 3, 3, 3]);
  assert.ok(cerca(a.x, -1) && cerca(b.x, 3), `spread from the centre: a ${a.x}, b ${b.x}`);
  assert.ok(cerca(b.x - a.x, 4), "distance doubled");
});

test("an unknown primary gives nothing; a scale of 0 in the start does not divide by zero", () => {
  assert.equal(transformarGrupo(new Map([["a", cosa(0, 0, 0)]]), "z", cosa(0, 0, 0), "girar").size, 0);
  const f = transformarGrupo(new Map([["a", { ...cosa(0, 0, 0), sx: 0 }]]), "a", cosa(0, 0, 0, 0, 2), "escalar");
  assert.ok(Number.isFinite(f.get("a")!.x));
});
