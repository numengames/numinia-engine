// ux2-gente: a click on a person in the world (packages/render/src/gente-politica.ts) — pure, no GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { personaEn, MIN_PX } from "../packages/render/src/gente-politica.ts";

const cuerpo = (id: number, x: number, pies: number, cabeza: number, prof: number) => ({ id, pies: { x, y: pies }, cabeza: { x, y: cabeza }, prof });

test("gente-politica: the body's box takes the click; outside it, nobody", () => {
  const l = [cuerpo(4, 500, 600, 400, 10)]; // 200 px tall: 84 px wide
  assert.equal(personaEn(l, 500, 500), 4);
  assert.equal(personaEn(l, 540, 410), 4, "inside the box, near the head");
  assert.equal(personaEn(l, 550, 500), null, "beside the body");
  assert.equal(personaEn(l, 500, 620), null, "under the feet");
});

test("gente-politica: overlapping bodies — the nearest wins; behind the camera never", () => {
  const l = [cuerpo(1, 500, 600, 400, 20), cuerpo(2, 510, 580, 420, 8), cuerpo(3, 500, 600, 400, -1)];
  assert.equal(personaEn(l, 505, 500), 2);
  assert.equal(personaEn([l[2]], 500, 500), null);
});

test("gente-politica: a far body still takes a click a finger wide", () => {
  const l = [cuerpo(9, 300, 205, 200, 80)]; // 5 px tall
  assert.equal(personaEn(l, 300 + MIN_PX / 2 - 1, 202), 9);
  assert.equal(personaEn(l, 300 + MIN_PX, 202), null);
});
