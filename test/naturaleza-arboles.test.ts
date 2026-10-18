// N2 (naturaleza): the low-poly trees — deterministic geometry, triangle budgets per species and LOD, the tier table, the
// near/far split honouring the caps (and its CPU cost), bounding spheres, and the TSL wind material graph building in node.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearArboles, geometriaCerca, geometriaLejos, ESPECIES, TRIS_MAX_CERCA, TRIS_MAX_LEJOS } from "../packages/render/src/naturaleza/arboles.ts";
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

test("every species: 2 variants share one topology, within 220 triangles near and 60 far", () => {
  for (const e of ESPECIES) {
    const g = geometriaCerca(e);
    assert.ok(g.triangulos > 60 && g.triangulos <= TRIS_MAX_CERCA, `${e}: ${g.triangulos} triangles`);
    assert.equal(g.geometria.getAttribute("position").count, g.geometria.getAttribute("posB").count, "variant B has the same vertices");
    assert.equal(g.geometria.getAttribute("color").count, g.geometria.getAttribute("colB").count);
    assert.equal(g.geometria.getAttribute("mov").count, g.geometria.getAttribute("position").count);
    assert.ok(g.geometria.boundingSphere && g.geometria.boundingSphere.radius > 0.5, "bounding sphere set");
  }
  const l = geometriaLejos();
  assert.ok(l.triangulos <= TRIS_MAX_LEJOS && l.triangulos >= 20, `far: ${l.triangulos}`);
});

test("variants differ in shape and colour (not the same tree twice)", () => {
  for (const e of ESPECIES) {
    const g = geometriaCerca(e).geometria, a = g.getAttribute("position").array, b = g.getAttribute("posB").array, ca = g.getAttribute("color").array, cb = g.getAttribute("colB").array;
    let dp = 0, dc = 0; for (let i = 0; i < a.length; i++) { dp += Math.abs(a[i] - b[i]); dc += Math.abs(ca[i] - cb[i]); }
    assert.ok(dp > 1 && dc > 1, `${e}: ${dp} ${dc}`);
  }
});

test("the geometry is deterministic and vertex colours are finite, no NaN anywhere", () => {
  const una = ESPECIES.map((e) => Array.from(geometriaCerca(e).geometria.getAttribute("position").array).join(","));
  const otra = ESPECIES.map((e) => Array.from(geometriaCerca(e).geometria.getAttribute("posB").array).join(","));
  assert.equal(una.length, 4);
  for (const e of ESPECIES) for (const k of ["position", "posB", "color", "colB", "mov"]) assert.ok(Array.from(geometriaCerca(e).geometria.getAttribute(k).array).every(Number.isFinite), `${e}.${k}`);
  assert.deepEqual(otra, ESPECIES.map((e) => Array.from(geometriaCerca(e).geometria.getAttribute("posB").array).join(",")));
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
    assert.ok(cerradas >= 2, `${e}: ${cerradas} closed pieces`);
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

test("at most 5 draw calls whatever the mix; frustum-culling spheres cover the grove", () => {
  const h = { vientoU: viento(), nivel: "B" as Nivel }, pts = campo(600, 160);
  const t = crearArboles(h, pts);
  assert.equal(t.mallas.length, 5, "4 species near + 1 shared far");
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  const s = t.estadisticas();
  assert.ok(s.llamadas <= 5 && s.llamadas >= 2, `${s.llamadas}`);
  for (const m of t.mallas) {
    const sp = m.geometry.boundingSphere!; assert.ok(sp.radius > 70, "covers the 160 m grove");
    for (const p of pts) assert.ok(sp.center.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) <= sp.radius, "every tree inside");
    assert.equal(m.frustumCulled, true);
  }
  t.dispose();
});

test("the near/far split honours each tier's caps and the triangle budget of the brief (trees alone)", () => {
  const tope: Record<Nivel, number> = { A: 60000, B: 35000, C: 35000, D: 15000 };
  for (const n of NIVELES) {
    const cfg = NATURALEZA_POR_NIVEL[n], t = crearArboles({ vientoU: viento(), nivel: n }, campo(2500, 300));
    t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
    const s = t.estadisticas(), cerca = s.cerca.reduce((a, b) => a + b, 0);
    assert.ok(cerca <= cfg.arbolesCerca, `${n}: near ${cerca}`);
    assert.ok(s.arboles <= cfg.arbolesVisibles, `${n}: visible ${s.arboles}`);
    assert.ok(s.triangulos <= tope[n], `${n}: ${s.triangulos} triangles`);
    // worst case on paper (every slot at its maximum) also fits
    assert.ok(cfg.arbolesCerca * TRIS_MAX_CERCA + (cfg.arbolesVisibles - cfg.arbolesCerca) * TRIS_MAX_LEJOS <= tope[n], `${n}: worst case`);
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
