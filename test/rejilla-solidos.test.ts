// N1 h1: a uniform grid over `solids` (32 m cells), consulted by cell instead of scanning the whole list on every
// avatar move (see packages/sim/src/index.ts solidGrid/buildGrid). Correctness away from the origin cell (the other
// tests all live near 0,0) and the actual performance bar the card asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, spawnAvatar, step, setSolids, solidsFrom, getBody, setBody } from "../packages/sim/src/index.ts";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { medir } from "../tools/banco-solidos.mjs";

test("N1 h1: a wall far from the origin, straddling a 32 m cell border, still stops you", () => {
  const s = createSim(2, 0); spawnAvatar(s, 0);
  setBody(s, 0, { x: 300, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  // bz0=-35..bz1=-34 straddles the border between cells -2 and -1 (32 m cells); x=300 is cell 9, far from (0,0)
  setSolids(s, solidsFrom([["o:muro", { solido: true, bx0: 295, by0: 0, bz0: -35, bx1: 305, by1: 3, bz1: -34 }]]));
  for (let i = 0; i < 60; i++) step(s, new Int32Array([0, 0, -127, 0])); // walk north into the wall
  const b = getBody(s, 0);
  assert.ok(b.z >= fx(-34 + 0.35) - 1, `went through a wall off-origin: z=${b.z / FX_ONE}`);
});

test("N1 h1: a solid in a cell you never enter never blocks you (the grid only looks at nearby cells)", () => {
  const s = createSim(2, 0); spawnAvatar(s, 0);
  setBody(s, 0, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setSolids(s, solidsFrom([["o:lejos", { solido: true, bx0: 995, by0: 0, bz0: 995, bx1: 1005, by1: 3, bz1: 1005 }]]));
  for (let i = 0; i < 40; i++) step(s, new Int32Array([0, 0, -127, 0]));
  assert.ok(getBody(s, 0).z < 0, "a solid in an untouched cell changed something");
});

test("N1 h1: 2.000 scattered solids with 1.000 avatars walking cost under 5 ms/tick (card's done-when bar)", () => {
  const r = medir({ bots: 1000, solidos: 2000, ticks: 80, warmup: 20 });
  assert.ok(r.p50 < 5, `p50 ${r.p50} ms ≥ 5 ms`);
});
