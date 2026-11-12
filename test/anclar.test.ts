import { test } from "node:test";
import assert from "node:assert/strict";
import { sitioLibre } from "../apps/plaza/anclar.ts";

const V = { w: 1920, h: 900 }, T = { w: 300, h: 140 };
const corta = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("anclar: a box beside someone goes on the side away from the centre, inside the window", () => {
  const s = sitioLibre({ x: 1200, y: 400 }, T, V, []);
  assert.ok(s.x > 1200, `right of a person on the right half: ${s.x}`);
  const i = sitioLibre({ x: 500, y: 400 }, T, V, []);
  assert.ok(i.x + T.w < 500, `left of a person on the left half: ${i.x}`);
  const borde = sitioLibre({ x: 1900, y: 5 }, T, V, []);
  assert.ok(borde.x + T.w <= V.w - 16 && borde.y >= 16, "kept inside the window");
});

test("anclar: it never covers another panel when a free side exists", () => {
  const panel = { x: 1250, y: 300, w: 400, h: 300 }; // a panel exactly where the right side would go
  const s = sitioLibre({ x: 1200, y: 400 }, T, V, [panel]);
  assert.equal(corta({ ...s, ...T }, panel), false, JSON.stringify(s));
});
