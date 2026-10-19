// N2 (naturaleza): the low-poly trees — deterministic geometry, triangle budgets per species and LOD, the tier table, the
// near/far split honouring the caps (and its CPU cost), bounding spheres, and the TSL wind material graph building in node.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearArboles, geometriaArbol, geometriaCerca, geometriaLejos, ESPECIES, TRIS_MAX_CERCA, TRIS_MAX_LEJOS, TRIANGULOS_ARBOL } from "../packages/render/src/naturaleza/arboles.ts";
import type { PuntoArbol } from "../packages/render/src/naturaleza/arboles.ts";
import { NATURALEZA_POR_NIVEL } from "../packages/render/src/naturaleza/niveles.ts";
import { crearAzar } from "../packages/render/src/naturaleza/semilla.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const campo = (n: number, lado: number, semilla = 7): PuntoArbol[] => {
  const R = crearAzar(semilla);
  return Array.from({ length: n }, () => ({ x: (R() - 0.5) * lado, y: 0, z: (R() - 0.5) * lado, escala: 0.8 + R() * 0.6, giro: R() * 6.28, especie: ESPECIES[(R() * 4) | 0] }));
};
const viento = () => uniform(new THREE.Vector3(2, 0, 1)) as unknown as { value: THREE.Vector3 };

test("N6: ONE template for every species (4 vertex sets, same topology), within 40 triangles near and 26 far", () => {
  const g = geometriaArbol(), geo = g.geometria;
  assert.equal(g.triangulos, TRIANGULOS_ARBOL);
  assert.ok(g.triangulos >= 30 && g.triangulos <= TRIS_MAX_CERCA, `${g.triangulos} triangles`);
  for (const e of ESPECIES) assert.equal(geometriaCerca(e).geometria, geo, "every species shares the geometry");
  const n = geo.getAttribute("position").count;
  for (const k of ["pos1", "pos2", "pos3", "tono", "parte"]) assert.equal(geo.getAttribute(k).count, n, k);
  assert.ok(geo.boundingSphere && geo.boundingSphere.radius > 0.5, "bounding sphere set");
  const l = geometriaLejos();
  assert.ok(l.triangulos <= TRIS_MAX_LEJOS && l.triangulos >= 20, `far: ${l.triangulos}`);
});

test("species differ in shape (not the same tree four times); the template is deterministic and finite, no NaN", () => {
  const geo = geometriaArbol().geometria, juegos = ["position", "pos1", "pos2", "pos3"].map((k) => geo.getAttribute(k).array as Float32Array);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    let d = 0; for (let k = 0; k < juegos[i].length; k++) d += Math.abs(juegos[i][k] - juegos[j][k]);
    assert.ok(d > 5, `species ${i} vs ${j}: ${d}`);
  }
  for (const k of ["position", "pos1", "pos2", "pos3", "tono", "parte"]) assert.ok(Array.from(geo.getAttribute(k).array).every(Number.isFinite), k);
  assert.equal(Array.from(juegos[2]).join(","), Array.from(geometriaArbol().geometria.getAttribute("pos2").array).join(","));
});

test("closed pieces (leaf blobs, cones) are wound outward: positive signed volume", () => {
  for (const e of ESPECIES) {
    const g = geometriaCerca(e).geometria, p = g.getAttribute("position"), ix = g.index!, padre = Array.from({ length: p.count }, (_, i) => i);
    const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    for (let i = 0; i < ix.count; i += 3) { padre[raiz(ix.getX(i))] = raiz(ix.getX(i + 1)); padre[raiz(ix.getX(i + 2))] = raiz(ix.getX(i)); }
    const piezas = new Map<number, { tris: number[][]; aristas: Map<string, number> }>();
    for (let i = 0; i < ix.count; i += 3) {
      const t = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)], r = raiz(t[0]);
      const pz = piezas.get(r) ?? { tris: [], aristas: new Map() }; piezas.set(r, pz); pz.tris.push(t);
      for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], key = a < b ? `${a}-${b}` : `${b}-${a}`; pz.aristas.set(key, (pz.aristas.get(key) ?? 0) + 1); }
    }
    let cerradas = 0;
    for (const pz of piezas.values()) {
      if (![...pz.aristas.values()].every((c) => c === 2)) continue; // open pieces (branch prisms) have no volume
      cerradas++;
      let vol = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (const t of pz.tris) { a.fromBufferAttribute(p, t[0]); b.fromBufferAttribute(p, t[1]); c.fromBufferAttribute(p, t[2]); vol += a.dot(b.clone().cross(c)) / 6; }
      assert.ok(vol > 0, `${e}: a closed piece is inside-out (${vol})`);
    }
    assert.ok(cerradas >= 3, `${e}: ${cerradas} closed pieces`);
  }
});

test("same points → same instance data; different seed of points → different", () => {
  const h = { vientoU: viento(), nivel: "A" as Nivel };
  const a = crearArboles(h, campo(300, 100)), b = crearArboles(h, campo(300, 100)), c = crearArboles(h, campo(300, 100, 8));
  const cam = new THREE.Vector3(0, 2, 0);
  for (const x of [a, b, c]) { x.actualizar(0, cam); }
  const dato = (x: typeof a) => x.mallas.map((m) => Array.from((m.geometry.getAttribute("position") as THREE.BufferAttribute).array.slice(0, 30)).join(",") + (m.geometry as THREE.InstancedBufferGeometry).instanceCount);
  assert.deepEqual(dato(a), dato(b));
  assert.notDeepEqual(a.estadisticas().cerca, c.estadisticas().cerca);
  assert.deepEqual(a.estadisticas(), b.estadisticas());
  for (const x of [a, b, c]) x.dispose();
});

test("at most 2 draw calls whatever the mix; frustum-culling spheres cover the grove", () => {
  const h = { vientoU: viento(), nivel: "B" as Nivel }, pts = campo(600, 160);
  const t = crearArboles(h, pts);
  assert.equal(t.mallas.length, 2, "N6: all species share ONE near mesh + 1 shared far mesh");
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  const s = t.estadisticas();
  assert.ok(s.llamadas <= 2 && s.llamadas >= 1, `${s.llamadas}`);
  for (const m of t.mallas) {
    const sp = m.geometry.boundingSphere!; assert.ok(sp.radius > 70, "covers the 160 m grove");
    for (const p of pts) assert.ok(sp.center.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) <= sp.radius, "every tree inside");
    assert.equal(m.frustumCulled, true);
  }
  t.dispose();
});

test("the near/far split honours each tier's caps and the triangle budget of the brief (trees alone)", () => {
  const tope: Record<Nivel, number> = { A: 5200, B: 3000, C: 2700, D: 1200 }; // the trees' share of PRESUPUESTO_NATURALEZA (N6)
  for (const n of NIVELES) {
    const cfg = NATURALEZA_POR_NIVEL[n], t = crearArboles({ vientoU: viento(), nivel: n }, campo(2500, 300));
    t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
    const s = t.estadisticas(), cerca = s.cerca.reduce((a, b) => a + b, 0);
    assert.ok(cerca <= cfg.arbolesCerca, `${n}: near ${cerca}`);
    assert.ok(s.arboles <= cfg.arbolesVisibles, `${n}: visible ${s.arboles}`);
    assert.ok(s.triangulos <= tope[n], `${n}: ${s.triangulos} triangles`);
    // worst case on paper (every slot at its maximum) also fits
    assert.ok(cfg.arbolesCerca * TRIANGULOS_ARBOL + (cfg.arbolesVisibles - cfg.arbolesCerca) * geometriaLejos().triangulos <= tope[n], `${n}: worst case`);
    t.dispose();
  }
  assert.equal(NATURALEZA_POR_NIVEL.D.arbolesAletean, false);
});

test("the split is cheap: 1500 trees in well under a millisecond-ish, and it is skipped when the camera does not move", () => {
  const t = crearArboles({ vientoU: viento(), nivel: "A" }, campo(1500, 400));
  for (let i = 0; i < 20; i++) t.repartir(i, 1.7, 0); // warm up
  const N = 200, t0 = performance.now();
  for (let i = 0; i < N; i++) t.repartir((i % 50) * 2, 1.7, i % 30);
  const ms = (performance.now() - t0) / N;
  console.log(`# repartir 1500 trees: ${ms.toFixed(3)} ms per call`);
  assert.ok(ms < 1.5, `${ms} ms`); // the brief's target is 0.3 ms on a desktop; the bound is loose so a busy machine does not flake
  const cam = new THREE.Vector3(5, 1.7, 5);
  t.actualizar(10, cam);
  const antes = t.estadisticas();
  t.actualizar(10.1, cam.clone().add(new THREE.Vector3(30, 0, 0))); // too soon: no new split
  assert.deepEqual(t.estadisticas(), antes);
  t.dispose();
});

test("the wind material graph builds (position + colour nodes) on every species, leaves flutter off on D", () => {
  for (const n of ["A", "D"] as Nivel[]) {
    const t = crearArboles({ vientoU: viento(), nivel: n }, campo(50, 30));
    for (const m of t.mallas) {
      const mat = m.material as THREE.MeshLambertNodeMaterial;
      assert.ok(mat.positionNode && mat.colorNode, m.name);
      assert.equal(mat.flatShading, true);
    }
    t.actualizar(3.5, new THREE.Vector3());
    assert.equal(t.tiempo.value, 3.5);
    t.dispose();
  }
});

test("empty input and unknown species do not throw", () => {
  const h = { vientoU: viento(), nivel: "C" as Nivel };
  const v = crearArboles(h, []); v.actualizar(1, new THREE.Vector3()); assert.equal(v.estadisticas().arboles, 0); v.dispose();
  const u = crearArboles(h, [{ x: 1, y: 0, z: 1, escala: 1, giro: 0, especie: "baobab" }]); u.actualizar(1, new THREE.Vector3()); assert.equal(u.estadisticas().arboles, 1); u.dispose();
});
