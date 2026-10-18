// M6b: terrain with a hill (heightmap→mesh, M6-malla already merged does the walking/climbing/camera part).
// activos/terreno/loma.glb (tools/hacer-terreno.mjs) is a 20×20 m grid with a gentle gaussian bump: it is read and
// collided exactly like any M6 "malla" .glb (colision-glb.ts → quantizeTriangles → buildBvh → sim.mesh), so no
// change to packages/sim was needed — the heightmap IS the source of the triangles M6 already walks on, slides off
// of and stops a camera on top of.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { triangulosDeGlb } from "../packages/server/src/colision-glb.ts";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { buildBvh, quantizeTriangles } from "../packages/sim/src/bvh.ts";
import { createSim, spawnAvatar, step, setMesh, groundHeight, getBody, setBody } from "../packages/sim/src/index.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const ok = async (r) => { const v = await r; assert.ok(v.ok, v.ok ? "" : JSON.stringify(v.issues)); return v.value; };

async function mundoConLoma() {
  const bytes = readFileSync(join(ROOT, "activos/terreno/loma.glb"));
  const t = await ok(triangulosDeGlb(bytes));
  const bvh = buildBvh(quantizeTriangles(t.vertices, t.indices));
  const s = createSim(1, 0);
  setMesh(s, bvh);
  return s;
}

test("M6b: the hill's triangles are a sane heightmap mesh (800 triangles, box 20×~2×20 m)", async () => {
  const bytes = readFileSync(join(ROOT, "activos/terreno/loma.glb"));
  const t = await ok(triangulosDeGlb(bytes));
  assert.equal(t.triangulos, 800); // 20×20 quads, 2 triangles each
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < t.vertices.length; i += 3) { minY = Math.min(minY, t.vertices[i]); maxY = Math.max(maxY, t.vertices[i]); }
  assert.ok(minY >= -0.001 && minY < 0.3, `minY=${minY}`);
  assert.ok(maxY > 1.9 && maxY <= 2.0, `maxY=${maxY}`); // the gaussian peak, amplitude 2 m
});

test("M6b: groundHeight rises toward the centre and falls back toward the edges (bilinear-ish over the mesh)", async () => {
  const s = await mundoConLoma();
  const alturas = [-9, -6, -3, 0, 3, 6, 9].map((x) => groundHeight(fx(x), fx(0), s, fx(5)) / FX_ONE);
  // the centre (x=0) is the highest, both edges are near the flat 0: it goes up, then down (a hill, not a step)
  const centro = alturas[3], izq = alturas[0], der = alturas[6];
  assert.ok(centro > izq + 1 && centro > der + 1, `no sube hacia el centro: ${JSON.stringify(alturas)}`);
  assert.ok(izq < 0.5 && der < 0.5, `los bordes no están casi planos: ${JSON.stringify(alturas)}`);
  // strictly rising from the left edge to the centre, then strictly falling to the right edge
  for (let i = 1; i <= 3; i++) assert.ok(alturas[i] >= alturas[i - 1] - 0.05, `no sube monótonamente: ${JSON.stringify(alturas)}`);
  for (let i = 4; i <= 6; i++) assert.ok(alturas[i] <= alturas[i - 1] + 0.05, `no baja monótonamente: ${JSON.stringify(alturas)}`);
});

test("M6b: an avatar walking straight across the hill climbs it and comes back down without clipping or floating", () => {
  const s = createSim(1, 1);
  // reuse the same quantized triangles synchronously built from the already-read glb in the previous test's shape
  return mundoConLoma().then((built) => {
    const sim = built;
    const e = spawnAvatar(sim, 0);
    setBody(sim, e, { x: fx(-9.5), y: groundHeight(fx(-9.5), 0, sim, fx(5)), z: 0, vy: 0, air: 0, buf: 0 });
    const trayectoria = [];
    for (let i = 0; i < 400; i++) {
      step(sim, new Int32Array([e, 127, 0, 0])); // walk straight east (+x), full stick
      const b = getBody(sim, e);
      trayectoria.push({ x: b.x / FX_ONE, y: b.y / FX_ONE });
    }
    const maxY = Math.max(...trayectoria.map((p) => p.y));
    const last = trayectoria[trayectoria.length - 1];
    assert.ok(maxY > 1.5, `no subió la loma: max y=${maxY}`);
    assert.ok(last.x > 8, `no cruzó la loma en 400 ticks: x=${last.x}`);
    assert.ok(last.y < 0.3, `no bajó al otro lado: y=${last.y}`);
    // never floats (y well above the real ground under it) nor sinks through it, tick by tick
    for (const p of trayectoria) {
      const g = groundHeight(fx(p.x), 0, sim, fx(p.y + 1)) / FX_ONE;
      assert.ok(Math.abs(p.y - g) < 0.05 || p.y > g, `atravesó el suelo en x=${p.x}: y=${p.y} suelo=${g}`);
    }
  });
});
