// B3 · the nature is painted on the espacio base's relief; both layers coexist (heights, no pond, key, shared ground/pillars/atmosphere).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";
import { crearEspacioBase } from "../packages/render/src/espacio-base/espacio-base.ts";
import { alturaBase } from "../packages/relieve/src/espacio-base.ts";
import { ocultarSuelo, ocultarHitosCompartido, ponerAtmosfera } from "../packages/render/src/suelo-compartido.ts";

test("terrain with a base: heights == alturaBase at 20 points, no pond, mesh pushed back in depth", () => {
  const t = crearTerreno({ semilla: 1234, base: 42, nivel: "D" });
  for (let i = 0; i < 20; i++) {
    const x = -80 + i * 8.3, z = 70 - i * 7.1;
    assert.equal(t.alturaEn(x, z), alturaBase(42, x, z), `${x},${z}`);
  }
  assert.equal(t.triangulos, crearTerreno({ semilla: 1234, base: 42, nivel: "D", sinEstanque: true }).triangulos, "no painted pond disc");
  assert.equal((t.malla.material as THREE.Material).polygonOffset, true);
  // without a base: the nature's own relief, no offset
  const s = crearTerreno({ semilla: 1234, nivel: "D" });
  assert.notEqual(s.alturaEn(30, 40), alturaBase(1234, 30, 40));
  assert.equal((s.malla.material as THREE.Material).polygonOffset, false);
  t.dispose(); s.dispose();
});

const camara = new THREE.PerspectiveCamera();
const fabrica = () => {
  const ground = new THREE.Mesh(), padre = new THREE.Group(), hito = new THREE.Mesh();
  const lleno: string[] = [];
  const atmosfera = (a: unknown) => { lleno.push("on:" + (a as { n: string }).n); return () => lleno.push("off:" + (a as { n: string }).n); };
  return { ground, padre, hito, lleno, atmosfera };
};

test("nature key changes with the base; both layers on: ground/pillars stay hidden until the LAST one goes off", async () => {
  const f = fabrica();
  const n = crearNaturaleza({ padre: f.padre, ground: f.ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => "D", camara, yo: () => null, niebla: () => 0xcccccc, hitos: () => [f.hito] });
  const b = crearEspacioBase({ padre: f.padre, ground: f.ground, nivel: () => "D", dia: uniform(1) as never, hitos: () => [f.hito] });
  await n.aplicar({ semilla: 7, base: -1 });
  const k0 = n.estadisticas().clave;
  assert.equal(f.ground.visible, false);
  await b.aplicar({ activa: true, semilla: 42 });
  await n.aplicar({ semilla: 7, base: 42 });
  const k1 = n.estadisticas().clave;
  assert.notEqual(k0, k1, "changing the base rebuilds the nature");
  assert.equal(n.terreno!.alturaEn(10, 12), alturaBase(42, 10, 12));
  assert.equal(f.padre.getObjectByName("agua-naturaleza"), undefined, "no pond water on the base");
  assert.ok(f.padre.getObjectByName("espacio-base"), "the base's line mesh is still mounted");
  await n.aplicar({ semilla: 7, base: 43 });
  assert.notEqual(n.estadisticas().clave, k1);
  await n.aplicar({ semilla: 7, base: 43, activa: false });
  assert.equal(f.ground.visible, false, "nature off, base still on: flat ground stays hidden");
  assert.equal(f.hito.visible, false, "…and so do the pillars");
  await n.aplicar({ semilla: 7, base: 43 });
  await b.aplicar({ activa: false });
  assert.equal(f.ground.visible, false, "base off, nature on: still hidden");
  await n.aplicar({ activa: false });
  assert.equal(f.ground.visible, true, "the last one off restores");
  assert.equal(f.hito.visible, true);
  n.dispose(); b.dispose();
});

test("ocultarSuelo: hide twice, release once → still hidden; release twice → back; releases are idempotent", () => {
  const g = new THREE.Object3D(), a = ocultarSuelo(g), b = ocultarSuelo(g);
  assert.equal(g.visible, false);
  a(); a();
  assert.equal(g.visible, false);
  b();
  assert.equal(g.visible, true);
  g.visible = false; const c = ocultarSuelo(g); c();
  assert.equal(g.visible, false, "it restores what it found");
});

test("hitos and atmosphere: the base's wins and survives the nature leaving", () => {
  const f = fabrica(), A = { n: "base" } as never, B = { n: "nat" } as never;
  const u1 = ocultarHitosCompartido([f.hito]), u2 = ocultarHitosCompartido([f.hito]);
  u1(); assert.equal(f.hito.visible, false); u2(); assert.equal(f.hito.visible, true);
  const q = ponerAtmosfera(f.atmosfera, "naturaleza", B), w = ponerAtmosfera(f.atmosfera, "base", A);
  q();
  assert.deepEqual(f.lleno, ["on:nat", "on:base"], "nature leaves: nothing is undone");
  w();
  assert.deepEqual(f.lleno, ["on:nat", "on:base", "off:base"]);
});

test("B6 fill: indiceRelleno = 2 triangles per cell inside the lattice, same diagonal as the collision mesh; 3 children, 3 draw calls; off frees all three geometries", async () => {
  const { construirMalla, CELDAS_POR_NIVEL, LLAMADAS } = await import("../packages/render/src/espacio-base/malla.ts");
  for (const nivel of ["A", "B", "C", "D"] as const) {
    const n = CELDAS_POR_NIVEL[nivel], m = construirMalla(42, nivel);
    assert.ok(m.indiceRelleno instanceof Uint32Array);
    assert.equal(m.indiceRelleno.length / 3, 2 * n * n);
    for (const i of m.indiceRelleno) assert.ok(i < m.nv * m.nv, "only lattice vertices");
    // the diagonal of cell (0,0) is a–d, of (1,0) is b–c (alternating, like terreno-malla.ts)
    const t = (c: number) => [...m.indiceRelleno.slice(6 * c, 6 * c + 6)];
    assert.ok(t(0).includes(0) && t(0).includes(m.nv + 1), "even cell: a–d");
    assert.ok(t(1).includes(2) && t(1).includes(m.nv + 1), "odd cell: b–c");
  }
  const f = fabrica();
  const b = crearEspacioBase({ padre: f.padre, ground: f.ground, nivel: () => "D", dia: uniform(1) as never });
  await b.aplicar({ activa: true, semilla: 42 });
  const g = b.grupo!;
  assert.equal(g.children.length, 3); assert.equal(b.estadisticas().llamadas, 3); assert.equal(LLAMADAS, 3);
  const r = g.getObjectByName("espacio-base-relleno") as THREE.Mesh, l = g.children.find((o) => o.name === "espacio-base") as THREE.LineSegments;
  const mat = r.material as THREE.MeshBasicMaterial;
  assert.equal(mat.transparent, true); assert.equal(mat.depthWrite, false); assert.equal(mat.side, THREE.DoubleSide);
  assert.ok(r.renderOrder < l.renderOrder, "lines over the fill");
  assert.equal(r.frustumCulled, false); assert.equal(r.matrixAutoUpdate, false); assert.equal(r.userData.sinSombra, true);
  assert.equal(r.geometry.getAttribute("position"), l.geometry.getAttribute("position"), "one shared position buffer");
  const t = crearTerreno({ semilla: 1, base: 42, nivel: "D" }), tm = t.malla.material as THREE.Material;
  assert.ok(mat.polygonOffsetFactor > tm.polygonOffsetFactor && mat.polygonOffsetUnits > tm.polygonOffsetUnits, "fill sits under the nature's terrain");
  t.dispose();
  let libres = 0;
  for (const o of g.children as THREE.Mesh[]) o.geometry.addEventListener("dispose", () => libres++);
  await b.aplicar({ activa: false });
  assert.equal(libres, 3); assert.equal(b.estadisticas().llamadas, 0); assert.equal(f.padre.children.length, 0);
  b.dispose();
});
