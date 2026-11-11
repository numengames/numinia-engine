// Presence on the page (Pablo, 2026-11-11): an AI faces the person it is with (features/burbuja `mira`, decided by the server) while it
// stands still. The page only works out the heading and hands it to the render; it lets go when the AI is with nobody.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CADA_MS, montarPresencia, rumboHacia } from "../apps/plaza/ia-presencia.ts";

test("rumboHacia: the avatars' heading (atan2(dx, dz), 0 = +z), nothing on the same spot", () => {
  assert.equal(rumboHacia({ x: 0, z: 0 }, { x: 0, z: 5 }), 0);
  assert.ok(Math.abs(rumboHacia({ x: 0, z: 0 }, { x: 5, z: 0 })! - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(Math.abs(rumboHacia({ x: 1, z: 1 }, { x: 1, z: -4 })!) - Math.PI) < 1e-9);
  assert.equal(rumboHacia({ x: 2, z: 2 }, { x: 2.05, z: 2.05 }), undefined);
});

test("montarPresencia: turns each AI towards the one it is with (you or another person), lets go when nobody, works at most every CADA_MS", () => {
  let mira = new Map<number, number>([[3, 1], [4, 7]]);
  const yo = 1, giros: [number, number | undefined][] = [];
  let otrosPedidos = 0;
  const p = montarPresencia({
    burbujas: { lista: () => [...mira.keys()].map((quien) => ({ quien })), mira: (q) => mira.get(q) ?? -1 },
    yo: () => yo, miPosicion: () => ({ x: 0, z: 0 }),
    otros: () => { otrosPedidos++; return [{ id: 3, x: 0, z: -4 }, { id: 4, x: 10, z: 0 }, { id: 7, x: 10, z: 3 }]; },
    orientar: (q, r) => giros.push([q, r]),
  });
  p.cuadro(1000);
  assert.deepEqual(giros.map(([q]) => q), [3, 4]);
  assert.equal(giros[0][1], 0, "AI 3 at z -4 looks at you (+z)");
  assert.equal(giros[1][1], 0, "AI 4 looks at person 7, 3 m to its +z");
  assert.equal(otrosPedidos, 1, "everybody's positions once per pass");
  p.cuadro(1000 + CADA_MS - 1);
  assert.equal(giros.length, 2, "not again before CADA_MS");
  mira = new Map([[3, -1], [4, 7]]);
  p.cuadro(1000 + CADA_MS);
  assert.deepEqual(giros.slice(2), [[4, 0], [3, undefined]], "AI 3 is with nobody now: let go");
  assert.deepEqual(p.orientadas(), [4]);
  mira = new Map();
  p.cuadro(1000 + 2 * CADA_MS);
  assert.deepEqual(giros.slice(4), [[4, undefined]], "the AI left: let go");
  const antes = otrosPedidos;
  p.cuadro(1000 + 3 * CADA_MS);
  assert.equal(otrosPedidos, antes, "a world without AIs asks for nothing");
});
