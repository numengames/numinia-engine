// MIS-200 t_ee19c84b: the live frame meter — the ring, the gaps, the draw-call census. No GPU: the census reads a THREE scene.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearMedidorVivo, lineaMedidor, lineaMedidorCorta, censoDeEscena, categoriaDe, lineasCenso, CAPACIDAD_MEDIDOR, PAUSA_MS } from "../packages/render/src/medidor-vivo.ts";

test("medidor-vivo: median, p99, fps, draw calls of the last frame (not a running total) and programs", () => {
  const m = crearMedidorVivo();
  assert.equal(m.resumen().cuadros, 0);
  assert.equal(lineaMedidor(m.resumen()), "medidor: sin cuadros");
  for (let i = 0; i < 99; i++) m.cuadro({ dtMs: 11.1, cpuMs: 3, llamadas: 145, triangulos: 68_500, programas: 108 });
  m.cuadro({ dtMs: 40, cpuMs: 9, llamadas: 150, triangulos: 68_500, programas: 110 });
  const r = m.resumen();
  assert.equal(r.cuadros, 100);
  assert.equal(r.cuadroMs.p50, 11.1); assert.equal(r.cuadroMs.max, 40);
  assert.equal(r.fps, 90);
  assert.equal(r.huecos, 1, "one frame over 1.5× the median");
  assert.equal(r.huecoMaxMs, 40);
  assert.deepEqual(r.llamadas, { ultima: 150, p50: 145, max: 150 }, "the frame's own count, never an ever-growing sum");
  assert.equal(r.programas, 110); assert.equal(r.kTriangulos, 68.5);
  assert.match(lineaMedidor(r), /llamadas 150 · programas 110/);
  assert.match(lineaMedidorCorta(r), /^150 llamadas · 110 progr\. · hueco máx 40 ms$/);
});

test("medidor-vivo: a pause (hidden tab, headset off) is not a gap; junk is ignored; the ring keeps the newest frames", () => {
  const m = crearMedidorVivo(10);
  m.cuadro({ dtMs: PAUSA_MS }); m.cuadro({ dtMs: 5000 }); m.cuadro({ dtMs: NaN }); m.cuadro({ dtMs: -3 }); m.cuadro({ dtMs: 0 });
  assert.equal(m.resumen().cuadros, 0);
  for (let i = 0; i < 25; i++) m.cuadro({ dtMs: 20, llamadas: 10 });   // old: 20 ms
  for (let i = 0; i < 10; i++) m.cuadro({ dtMs: 10, llamadas: 50 });   // the last 10 frames fill the ring
  const r = m.resumen();
  assert.equal(r.cuadros, 10); assert.equal(r.cuadroMs.max, 10); assert.equal(r.huecos, 0); assert.equal(r.llamadas.p50, 50);
  m.reiniciar();
  assert.equal(m.resumen().cuadros, 0, "reiniciar empties the window");
  assert.ok(CAPACIDAD_MEDIDOR >= 120);
});

test("medidor-vivo: cuadro() writes into preallocated arrays — no allocation per frame", () => {
  const m = crearMedidorVivo();
  for (let i = 0; i < 1000; i++) m.cuadro({ dtMs: 11, llamadas: 1 }); // warm
  const antes = process.memoryUsage().heapUsed;
  const muestra = { dtMs: 11.1, cpuMs: 2, llamadas: 100, triangulos: 1000, programas: 30 };
  for (let i = 0; i < 200_000; i++) m.cuadro(muestra);
  assert.ok(process.memoryUsage().heapUsed - antes < 5_000_000, "no per-frame garbage");
});

test("censo: categories from the names up the tree and the map mark; lotes by userData", () => {
  assert.equal(categoriaDe(["lote", "lotes", "world"], { lote: true }), "lotes");
  assert.equal(categoriaDe(["", "objeto:o4a"], {}), "objetos");
  assert.equal(categoriaDe(["manos"], {}), "manos");
  assert.equal(categoriaDe(["x", "ancestros:asimov"], {}), "ancestros");
  assert.equal(categoriaDe(["nombre:3"], {}), "nombres");
  assert.equal(categoriaDe(["elemento:ev"], {}), "elementos");
  assert.equal(categoriaDe([], { mapa: true }), "mapa");
  assert.equal(categoriaDe(["cosa"], {}), "otros");
});

test("censo: counts per eye through the frustum, per material group, instanced as one, hidden and culled not at all", () => {
  const escena = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const rojo = new THREE.MeshBasicMaterial({ color: 0xff0000 }), azul = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true });
  const mapa = new THREE.Group(); mapa.userData.mapa = true;
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(geo, rojo); c.position.set(i, 0, -5); mapa.add(c); }
  escena.add(mapa);
  const g = new THREE.Group(); g.name = "objeto:silla"; escena.add(g);
  const dosMats = new THREE.Mesh(geo, [rojo, azul]); dosMats.geometry = geo.clone(); dosMats.geometry.clearGroups(); dosMats.geometry.addGroup(0, 18, 0); dosMats.geometry.addGroup(18, 18, 1);
  dosMats.position.set(0, 0, -5); g.add(dosMats);
  const oculto = new THREE.Mesh(geo, rojo); oculto.visible = false; oculto.position.set(0, 0, -5); g.add(oculto);
  const detras = new THREE.Mesh(geo, rojo); detras.position.set(0, 0, 50); g.add(detras); // behind the camera
  const inst = new THREE.InstancedMesh(geo, azul, 20); inst.count = 20; inst.frustumCulled = false; inst.name = "lote"; inst.userData.lote = true; escena.add(inst);
  const vacio = new THREE.InstancedMesh(geo, azul, 20); vacio.count = 0; vacio.frustumCulled = false; vacio.userData.lote = true; escena.add(vacio);
  escena.updateMatrixWorld(true); // the renderer does this before it draws; the census reads the matrices as they are
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const c1 = censoDeEscena(escena, [cam]);
  assert.equal(c1.ojos, 1);
  assert.equal(c1.porCategoria.mapa.llamadas, 3); assert.equal(c1.porCategoria.mapa.materiales, 1);
  assert.equal(c1.porCategoria.objetos.llamadas, 2, "2 material groups = 2 calls; hidden and behind-the-camera ones are not counted");
  assert.equal(c1.porCategoria.objetos.transparentes, 1);
  assert.equal(c1.porCategoria.lotes.llamadas, 1, "20 instances = one call; an empty instanced mesh draws nothing");
  assert.equal(c1.porCategoria.lotes.instanciadas, 1);
  assert.equal(c1.llamadas, 6);
  const c2 = censoDeEscena(escena, [cam, cam]);
  assert.equal(c2.llamadas, 12, "two eyes = every call twice (renderer.info.render.drawCalls counts both)");
  assert.ok(lineasCenso(c1).some((l) => l.includes("mapa: 3")));
});
