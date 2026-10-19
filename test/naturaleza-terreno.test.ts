// N1 (naturaleza): seeded terrain: pure height/zone functions, the one-mesh builder and its per-tier budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAzar, hash2, valor2, simplex2, fbm } from "../packages/render/src/naturaleza/semilla.ts";
import { alturaEn, zonaEn, crearTerreno, estanqueDe, CELDAS_TERRENO, triangulosDeTerreno, ZONAS } from "../packages/render/src/naturaleza/terreno.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const TOPE_TRI: Record<Nivel, number> = { A: 60000, B: 35000, C: 35000, D: 15000 }; // BRIEF: whole nature; terrain alone must leave room

test("seeded randomness is deterministic and bounded", () => {
  const a = crearAzar(42), b = crearAzar(42), c = crearAzar(43);
  const sa = Array.from({ length: 8 }, a), sb = Array.from({ length: 8 }, b), sc = Array.from({ length: 8 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  assert.equal(hash2(7, 3, -4), hash2(7, 3, -4));
  assert.notEqual(hash2(7, 3, -4), hash2(8, 3, -4));
  for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) {
    const x = i * 0.37, z = j * 0.53, v = valor2(5, x, z), s = simplex2(5, x, z), f = fbm(5, x, z, 4);
    assert.ok(v >= 0 && v <= 1 && s >= -1 && s <= 1 && f >= -1 && f <= 1, `${x},${z}`);
  }
});

test("same seed, same heights; different seeds differ", () => {
  let diff = 0;
  for (let x = -90; x <= 90; x += 9) for (let z = -90; z <= 90; z += 9) {
    assert.equal(alturaEn(1234, x, z), alturaEn(1234, x, z));
    assert.equal(zonaEn(1234, x, z), zonaEn(1234, x, z));
    if (Math.abs(alturaEn(1234, x, z) - alturaEn(1235, x, z)) > 0.05) diff++;
  }
  assert.ok(diff > 100, `seeds 1234 and 1235 should give different land (${diff} of 441 points differ)`);
  assert.notDeepEqual(estanqueDe(1234), estanqueDe(1235));
});

test("heights stay in a known range, with real relief", () => {
  let mn = Infinity, mx = -Infinity;
  for (const s of [1, 1234, 99, 31337]) for (let x = -100; x <= 100; x += 2.5) for (let z = -100; z <= 100; z += 2.5) {
    const h = alturaEn(s, x, z);
    assert.ok(Number.isFinite(h));
    mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  assert.ok(mn >= -2.5 && mx <= 16, `range ${mn}…${mx}`);
  assert.ok(mx - mn > 5, `needs relief, got ${mx - mn} m`);
});

test("the plaza stays almost flat (±0.3 m) so the spawn is walkable", () => {
  for (const s of [1, 1234, 99, 31337]) for (let r = 0; r <= 12; r += 1.5) for (let a = 0; a < 6.28; a += 0.4) {
    const h = alturaEn(s, Math.cos(a) * r, Math.sin(a) * r);
    assert.ok(Math.abs(h) <= 0.3, `seed ${s} r=${r}: ${h}`);
  }
  assert.ok(Math.abs(alturaEn(1234, 20, 0, { plaza: 30 })) <= 0.3, "a wider plaza option flattens farther");
});

test("a 200 m world with seed 1234 has all five zones, and the shore belt sits at the pond", () => {
  const cuenta: Record<string, number> = {};
  for (let x = -100; x <= 100; x += 2) for (let z = -100; z <= 100; z += 2) { const k = zonaEn(1234, x, z); cuenta[k] = (cuenta[k] ?? 0) + 1; }
  for (const z of ZONAS) assert.ok((cuenta[z] ?? 0) > 100, `zone ${z}: ${cuenta[z]}`);
  const e = estanqueDe(1234);
  assert.equal(zonaEn(1234, e.x, e.z), "orilla");
  assert.ok(alturaEn(1234, e.x, e.z) < -0.5, "the pond centre is a basin under the water level");
  assert.equal(zonaEn(1234, 0, 0), "prado", "the spawn is meadow");
});

test("one mesh, one draw call per tier, triangles and vertices within budget", () => {
  const vistos: number[] = [];
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: 1234, nivel: n });
    const g = t.malla.geometry, esperado = triangulosDeTerreno(CELDAS_TERRENO[n]);
    assert.equal(t.malla.isMesh, true);
    assert.equal(g.index, null, "non-indexed: flat normals");
    assert.equal(g.attributes.position.count, esperado * 3);
    assert.equal(t.triangulos, esperado);
    assert.ok(esperado <= TOPE_TRI[n] * 0.4, `${n}: ${esperado} triangles leave room for trees and grass`);
    assert.ok(g.attributes.color && !g.attributes.normal, "vertex colours; flat normals come from the material (F4: no normal buffer)");
    assert.ok(g.boundingSphere && g.boundingSphere.radius > 100, "bounding sphere set (frustum culling)");
    assert.equal(Object.keys(t.malla).includes("children") ? t.malla.children.length : 0, 0, "no child meshes");
    vistos.push(esperado);
    t.dispose();
  }
  assert.ok(vistos[0] > vistos[1] && vistos[1] > vistos[2] && vistos[2] > vistos[3], `tiers shrink: ${vistos}`);
});

test("the mesh follows alturaEn and the border fades to the fog colour", () => {
  const t = crearTerreno({ semilla: 1234, nivel: "C", niebla: 0xff00ff });
  const pos = t.malla.geometry.attributes.position, col = t.malla.geometry.attributes.color;
  for (let k = 0; k < pos.count; k += 97) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    if (Math.abs(x) > 99.9 || Math.abs(z) > 99.9) continue;
    if (y < t.alturaEn(x, z) - 10) continue; // skirt
    assert.ok(Math.abs(y - t.alturaEn(x, z)) < 1e-3, `vertex ${k}`);
  }
  let magenta = 0;
  for (let k = 0; k < col.count; k++) if (col.getX(k) > 0.9 && col.getY(k) < 0.01 && col.getZ(k) > 0.9) magenta++;
  assert.ok(magenta > 0, "skirt/border carry the fog colour");
  assert.equal(t.zonaEn(0, 0), "prado");
  t.dispose();
});
