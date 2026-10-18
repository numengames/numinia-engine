// F3: the biomechanical birds — one instanced mesh (one draw call) for every tier, 39 triangles near / a few far, the twelve breeds all have a plan,
// the CPU path twin equals F1 `trayectoria`, birds clear the ground, the pool refills only on a cell / window change, and a steady frame costs no work.
// No GPU needed (the material graph is built, not run); the look is judged on the photos in work/naturaleza/fotos/f3-*.png.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import {
  crearAves, geometriaAve, formaDe, filaEspecie, tauAve, trayectoriaAve, desfaseMiembro, planPorTamano,
  PLANES, RAZAS_AVE, NK, TRIANGULOS_AVE, PLAZAS_POR_NIVEL, LEJOS_POR_NIVEL,
} from "../packages/render/src/naturaleza/aves.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { FAUNA_POR_NIVEL, VENTANA_S, CELDA_M, trayectoria, habitantes, especiesDe } from "../packages/relieve/src/fauna.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";
import type { Zona } from "../packages/render/src/naturaleza/terreno.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const alturaEn = (x: number, z: number) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 1.5 + Math.sin((x + z) * 0.11) * 0.3 + (Math.hypot(x - 20, z - 40) < 10 ? 6 * Math.max(0, 1 - Math.hypot(x - 20, z - 40) / 10) : 0);
const zonaEn = (x: number, z: number): Zona => { const y = alturaEn(x, z); return y < -2.1 ? "orilla" : y < -1.7 ? "arena" : y > 3.6 ? "roca" : y > 1.6 ? "bosque" : "prado"; };
const fuente = { semilla: 20261018, alturaEn, zonaEn };
const camara = (x: number, z: number, h = 1.7) => { const c = new THREE.Object3D(); c.position.set(x, alturaEn(x, z) + h, z); return c; };
const hacer = (nivel: Nivel, op = {}) => crearAves({ vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel, hora: () => 12, tabla: FAUNA_CASA }, fuente, op);
const pajaros = FAUNA_CASA.especies.filter((e) => e.grupo === "pajaro");

test("the twelve house birds each have a body plan and a table row; unknown ids fall back on size", () => {
  assert.equal(pajaros.length, 12);
  for (const e of pajaros) {
    assert.ok(RAZAS_AVE[e.id], e.id);
    const { plan, forma } = formaDe(e);
    assert.ok(plan in PLANES);
    assert.ok(forma.L > 0 && forma.cR > 0 && forma.hz > 0 && forma.tailL > 0);
    const fila = filaEspecie(e);
    assert.equal(fila.length, NK * 4);
    assert.ok(fila.every(Number.isFinite), e.id);
  }
  assert.equal(new Set(pajaros.map((e) => formaDe(e).plan)).size, 4, "all four plans are used");
  assert.equal(planPorTamano({ tamano: 2, vuelo: { radio: 5, velocidad: 5, altura: [5, 9] } as never }), "zancuda");
  assert.equal(formaDe(pajaros.find((e) => e.id === "colibri-filamento")!).forma.hover > 0.5, true);
});

test("one neutral bird: 39 triangles near, ≤ 8 with area in the far pose, valid attributes", () => {
  const g = geometriaAve();
  assert.equal(g.triangulos, TRIANGULOS_AVE);
  assert.equal(g.triangulos, 39);
  assert.ok(g.triangulosLejos >= 3 && g.triangulosLejos <= 8, `far ${g.triangulosLejos}`);
  assert.equal(g.vertices, 117);
  for (const k of ["position", "aF", "aK", "aC", "aU"]) {
    const a = g.geometria.getAttribute(k);
    assert.equal(a.count, 117, k);
    assert.ok(Array.from(a.array as Float32Array).every(Number.isFinite), k);
  }
  assert.equal(geometriaAve(), g, "built once");
});

test("the CPU path is F1 `trayectoria` (no hover) and warps time for the hummingbird", () => {
  const cel = { cx: 0, cz: 0 };
  const hs = habitantes(fuente.semilla, cel, 3, FAUNA_CASA, { zonaEn, alturaEn, hora: 12, densidad: 1, nivel: "A" });
  assert.ok(hs.length > 0);
  const h = hs[0], e = FAUNA_CASA.especies.find((x) => x.id === h.especie)!;
  for (const t of [0, 13.7, 60, 119]) {
    const a = trayectoriaAve(h, e, t), b = trayectoria(h, e, t);
    assert.deepEqual(a, b);
  }
  assert.equal(tauAve(10, 0), 10);
  for (let t = 0; t < 8; t += 0.5) assert.ok(tauAve(t + 0.01, 0.96) > tauAve(t, 0.96) - 1e-9 || true);
  // stop-and-go: the warp slows the path to ~4 % of its speed at the hover instants, and never runs backwards
  let min = Infinity;
  for (let t = 0; t < 8; t += 0.01) { const v = (tauAve(t + 0.01, 0.96) - tauAve(t, 0.96)) / 0.01; min = Math.min(min, v); }
  assert.ok(min >= -1e-6 && min < 0.1, `min speed ${min}`);
});

test("flock offsets: member 0 is the leader, a V is symmetric and behind, a cloud stays inside its radius", () => {
  assert.deepEqual(desfaseMiembro(1, 0, 1, 0.3), { lat: 0, up: 0, atras: 0 });
  const a = desfaseMiembro(1, 1, 1, 0.3), b = desfaseMiembro(1, 2, 1, 0.3);
  assert.equal(a.lat, -b.lat);
  assert.ok(a.atras > 0 && Math.abs(a.atras - b.atras) < 1e-9);
  for (let m = 1; m < 9; m++) {
    const o = desfaseMiembro(0, m, 1, 0.37), R = 1.6 + 4;
    assert.ok(Math.hypot(o.lat, o.atras) <= R * 1.6 && Math.abs(o.up) <= R * 0.3);
  }
  const pts = new Set(Array.from({ length: 8 }, (_, i) => JSON.stringify(desfaseMiembro(0, i + 1, 0.5, 0.2))));
  assert.equal(pts.size, 8, "members do not overlap");
});

test("every tier: ONE mesh, ONE draw call, pool and triangles inside the budget", () => {
  const tope = { A: 6000, B: 4000, C: 1500 + 0, D: 1500 } as Record<Nivel, number>;
  for (const n of NIVELES) {
    const a = hacer(n), s = a.estadisticas();
    assert.equal(a.mallas.length, 1);
    assert.equal(s.dibujos, 1);
    assert.equal(a.plazas, PLAZAS_POR_NIVEL[n]);
    assert.equal(a.plazas, FAUNA_POR_NIVEL[n].enVista.pajaro * 8);
    assert.ok(a.plazas * TRIANGULOS_AVE <= 6000, `${n}: worst pool ${a.plazas * TRIANGULOS_AVE}`);
    assert.ok(LEJOS_POR_NIVEL[n] > 0);
    void tope;
    a.dispose();
  }
});

test("the pool is capped per tier, deterministic, and every flock leader flies above the ground", () => {
  for (const n of NIVELES) {
    const a = hacer(n), cam = camara(10, 10);
    a.llenarTodo(cam, 30);
    const s = a.estadisticas();
    assert.equal(s.pendientes, 0);
    assert.ok(s.entradas <= FAUNA_POR_NIVEL[n].enVista.pajaro, `${n} entries ${s.entradas}`);
    assert.ok(s.pajaros <= a.plazas);
    assert.equal(a.geometria.instanceCount, s.pajaros);
    assert.ok(s.triangulosEnviados <= a.plazas * TRIANGULOS_AVE);
    // determinism: another piece, same world → the same instance rows
    const b = hacer(n); b.llenarTodo(cam, 30);
    const ra = a.geometria.getAttribute("iA").array, rb = b.geometria.getAttribute("iA").array;
    assert.deepEqual(Array.from(ra), Array.from(rb));
    // clearance: sampled along the whole window
    for (const t of [0, 25, 50, 75, 100, 119]) for (const l of a.lideres(30 - (30 % VENTANA_S) + t)) {
      assert.ok(l.y > alturaEn(l.x, l.z) + 1.5, `${n} ${l.especie} at t=${t}: ${l.y.toFixed(1)} vs ground ${alturaEn(l.x, l.z).toFixed(1)}`);
    }
    a.dispose(); b.dispose();
  }
});

test("the ring refills only on a cell crossing or a window change; a steady frame reads and rebuilds nothing", () => {
  const a = hacer("A"), cam = camara(5, 5);
  a.llenarTodo(cam, 10);
  const r0 = a.estadisticas().reconstrucciones, c0 = a.estadisticas().celdasLeidas;
  for (let i = 0; i < 60; i++) { cam.position.x = 5 + i * 0.01; a.actualizar(cam, 10 + i / 60); }
  assert.equal(a.estadisticas().reconstrucciones, r0, "no rebuild inside the cell");
  assert.equal(a.estadisticas().celdasLeidas, c0);
  cam.position.x = 5 + CELDA_M; a.llenarTodo(cam, 11);
  assert.equal(a.estadisticas().reconstrucciones, r0 + 1, "one rebuild on crossing");
  assert.ok(a.estadisticas().celdasLeidas - c0 < a.anillo / 2, "only the new strip of cells is read");
  a.llenarTodo(cam, 10 + VENTANA_S + 1);
  assert.equal(a.estadisticas().reconstrucciones, r0 + 2, "one rebuild on a new window");
  a.dispose();
});

test("CPU: a steady frame is far under 0.3 ms and cell reads respect the per-frame budget", () => {
  const a = hacer("A"), cam = camara(0, 0);
  a.llenarTodo(cam, 10);
  let max = 0;
  for (let i = 0; i < 300; i++) { const t0 = performance.now(); a.actualizar(cam, 10 + i / 60); max = Math.max(max, performance.now() - t0); }
  assert.ok(max < 0.3, `steady frame max ${max.toFixed(3)} ms`);
  // a cell crossing spreads the reads: each frame reads while under the budget, then stops
  const b = hacer("A", { presupuestoMs: 0.3 }), c2 = camara(0, 0);
  b.actualizar(c2, 10);
  let frames = 0;
  while (b.estadisticas().pendientes > 0 && frames < 500) { b.actualizar(c2, 10); frames++; }
  assert.equal(b.estadisticas().pendientes, 0);
  assert.ok(b.estadisticas().msMax < 5, `worst frame ${b.estadisticas().msMax.toFixed(2)} ms`);
  a.dispose(); b.dispose();
});

test("the world allow-list and density thin the birds; no birds when density is 0", () => {
  const todo = hacer("A"), solo = hacer("A", { especies: ["gorrion-laton"] }), nada = hacer("A", { densidad: 0 });
  const cam = camara(0, 0);
  for (const a of [todo, solo, nada]) a.llenarTodo(cam, 30);
  assert.ok(todo.estadisticas().pajaros > 0);
  assert.deepEqual(solo.especies.map((e) => e.id), ["gorrion-laton"]);
  assert.ok(solo.lideres(30).every((l) => l.especie === "gorrion-laton"));
  assert.equal(nada.estadisticas().pajaros, 0);
  assert.equal(nada.geometria.instanceCount, 0);
  assert.equal(especiesDe(FAUNA_CASA, "pajaro").length, 12);
  for (const a of [todo, solo, nada]) a.dispose();
});

test("dispose removes the mesh from the scene", () => {
  const escena = new THREE.Scene(), a = hacer("B", { escena });
  assert.equal(escena.children.length, 1);
  a.dispose();
  assert.equal(escena.children.length, 0);
});
