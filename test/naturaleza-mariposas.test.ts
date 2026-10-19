// F2: butterflies + fireflies. The flight / fade / pulse maths is ONE source instantiated with numbers (CPU) and TSL nodes (GPU): here the
// numeric instance is checked against F1's own `trayectoria`/`fundido`; the placement refills only at cell borders / window changes; the
// piece is 2 draw calls and fits the budget. No GPU needed (the material graphs are built, not run; the on-GPU check is in the photo page).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import {
  crearInsectos, trayectoriaOps, paramsVuelo, fundidoOps, pulsoOps, OPS_NUM, OPS_TSL, geometriaMariposa, geometriaLuciernaga, paletaDe, oscuridad,
  radioLuz, brilloLuz, trianglesMariposa, TRIANGULOS_LUCIERNAGA,
} from "../packages/render/src/naturaleza/mariposas.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { habitantes, trayectoria, fundido, FAUNA_POR_NIVEL, VENTANA_S, LUCES_FAUNA, CELDA_M } from "../packages/relieve/src/fauna.ts";
import type { Habitante } from "../packages/relieve/src/fauna.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";
import type { Zona } from "../packages/render/src/naturaleza/terreno.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
/** Extra triangles the whole fauna may add (F-brief): butterflies + fireflies + birds. */
const TOPE_TRI: Record<Nivel, number> = { A: 6000, B: 4000, C: 4000, D: 1500 };
const alturaEn = (x: number, z: number) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 1.5;
const zonaEn = (x: number, z: number): Zona => { const y = alturaEn(x, z); return y < -2.1 ? "orilla" : y < -1.7 ? "arena" : y > 3.6 ? "roca" : y > 1.6 ? "bosque" : "prado"; };
const SEMILLA = 20261018;
const fuente = { semilla: SEMILLA, alturaEn, zonaEn };
const camara = (x: number, z: number) => { const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500); c.position.set(x, alturaEn(x, z) + 1.7, z); c.updateMatrixWorld(); return c; };
const mk = (nivel: Nivel, hora: number, extra = {}) => crearInsectos({ vientoU: uniform(new THREE.Vector3()), nivel, hora: () => hora, tabla: FAUNA_CASA }, fuente, extra);
const T0 = 1000 * VENTANA_S; // a world-clock time at the start of a window

test("the flight maths over numbers is F1's trayectoria; its derivative is the real velocity; the fade is F1's fundido", () => {
  const todos = habitantes(SEMILLA, { cx: 2, cz: -1 }, 7, FAUNA_CASA, { zonaEn, alturaEn, hora: 12, densidad: 1, nivel: "A" }).concat(
    habitantes(SEMILLA, { cx: 2, cz: -1 }, 7, FAUNA_CASA, { zonaEn, alturaEn, hora: 23, densidad: 1, nivel: "A" }));
  assert.ok(todos.length > 6);
  const porId = new Map(FAUNA_CASA.especies.map((e) => [e.id, e]));
  let n = 0;
  for (const h of todos) {
    const e = porId.get(h.especie)!, p = paramsVuelo(h, e);
    for (const t of [0, 0.7, 3.3, 17.9, 60, 119.9]) {
      const a = trayectoriaOps(OPS_NUM, p, t), b = trayectoria(h, e, t);
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9, `${h.id} t=${t}`);
      const d = 1e-5, a1 = trayectoriaOps(OPS_NUM, p, t + d), a0 = trayectoriaOps(OPS_NUM, p, t - d);
      assert.ok(Math.abs((a1.x - a0.x) / (2 * d) - a.vx) < 1e-4 && Math.abs((a1.z - a0.z) / (2 * d) - a.vz) < 1e-4, "velocity is the derivative");
      n++;
    }
  }
  for (let t = -1; t <= 121; t += 0.37) assert.ok(Math.abs(fundidoOps(OPS_NUM, t) - fundido(t)) < 1e-12, `fundido(${t})`);
  assert.ok(n > 30);
});

test("the TSL instance builds the same formulas without error (nodes, not numbers) and the operator sets have the same surface", () => {
  assert.deepEqual(Object.keys(OPS_TSL).sort(), Object.keys(OPS_NUM).sort());
  const p = { hx: uniform(1), hy: uniform(2), hz: uniform(3), rad: uniform(4), w: uniform(0.3), p: uniform(1), q: uniform(2), ampY: uniform(0.2) };
  const t = trayectoriaOps(OPS_TSL, p, uniform(5)), f = fundidoOps(OPS_TSL, uniform(5)), u = pulsoOps(OPS_TSL, uniform(6), uniform(5), uniform(0.2), uniform(1));
  for (const nd of [t.x, t.y, t.z, t.vx, t.vz, f, u.i, u.hue, u.prisma]) assert.ok(nd && (nd as { isNode?: boolean }).isNode, "a TSL node");
});

test("the 8 light patterns: ids match F1's LUCES_FAUNA, stay in 0…1, differ from each other, and have the shapes they promise", () => {
  assert.deepEqual([...LUCES_FAUNA], ["fijo", "latido", "parpadeo", "onda", "respiro", "estrobo", "morse", "prisma"]);
  const serie = (id: number, rit = 1, f = 0.13) => Array.from({ length: 2400 }, (_, k) => pulsoOps(OPS_NUM, id, k * 0.01, f, rit).i);
  const series = LUCES_FAUNA.map((_, id) => serie(id));
  series.forEach((s, id) => { assert.ok(s.every((v) => v >= -1e-9 && v <= 1 + 1e-9), `pattern ${id} in 0…1`); });
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const d = series[a].reduce((acc, v, k) => acc + Math.abs(v - series[b][k]), 0) / 2400;
    assert.ok(d > 0.03, `patterns ${LUCES_FAUNA[a]} and ${LUCES_FAUNA[b]} must differ (mean |Δ| = ${d.toFixed(3)})`);
  }
  const flancos = (s: number[], umbral = 0.5) => s.reduce((c, v, k) => c + (k && s[k - 1] < umbral && v >= umbral ? 1 : 0), 0);
  assert.ok(Math.min(...series[0]) > 0.8, "fijo never dims");
  assert.equal(flancos(series[6].slice(0, 420)), 4, "morse: dot dash dot dot = 4 marks in one 4.2 s word");
  assert.ok(flancos(series[5]) >= 3 * 6, "estrobo: bursts of quick flashes (several per burst)");
  assert.ok(flancos(series[2]) >= 9 && flancos(series[2]) <= 12, "parpadeo: one blink per 2.2 s");
  assert.ok(Math.max(...series[4]) - Math.min(...series[4]) > 0.8, "respiro swells fully");
  assert.ok(flancos(serie(1, 0.6)) < flancos(serie(1, 1)), "a slower tempo (legendary) beats less often");
  const p = (t: number) => pulsoOps(OPS_NUM, 7, t, 0, 1);
  assert.equal(p(1).prisma, 1); assert.equal(pulsoOps(OPS_NUM, 3, 1, 0, 1).prisma, 0);
  assert.ok(Math.abs(p(0).hue - p(2.5).hue) > 0.3 && p(7).hue >= 0 && p(7).hue < 1, "prisma cycles its hue");
});

test("geometry: butterfly = body 4 + dot 1 (+ antennae 2) + wings 2 × (3 + circuit lines); firefly = 2 triangles; nothing degenerate", () => {
  const g = geometriaMariposa(true), gd = geometriaMariposa(false);
  assert.equal(g.getAttribute("position").count / 3, trianglesMariposa(true));
  const cuerpo = Array.from({ length: g.getAttribute("position").count / 3 }, (_, i) => g.getAttribute("aleta").getX(i * 3)).filter((w) => w === 0).length;
  assert.equal(cuerpo, 4 + 2, "body 4 + antennae 2 (the LED dot is code 2)");
  assert.ok(trianglesMariposa(true) <= 32 && trianglesMariposa(false) <= 22, `${trianglesMariposa(true)} / ${trianglesMariposa(false)} triangles`);
  assert.ok(gd.getAttribute("position").count < g.getAttribute("position").count);
  for (const geo of [g, gd, geometriaLuciernaga()]) {
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
    for (let t = 0; t < p.count / 3; t++) {
      const a = new THREE.Vector3().fromBufferAttribute(p, t * 3), b = new THREE.Vector3().fromBufferAttribute(p, t * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(p, t * 3 + 2);
      assert.ok(b.sub(a).cross(c.sub(a)).length() > 1e-6, "no degenerate triangle");
    }
  }
  assert.equal(geometriaLuciernaga().getAttribute("position").count / 3, TRIANGULOS_LUCIERNAGA);
  const rol = g.getAttribute("rol");
  for (let i = 0; i < rol.count; i++) assert.ok(rol.getX(i) + rol.getY(i) + rol.getZ(i) + rol.getW(i) <= 1 + 1e-6, "roles sum to ≤ 1");
});

test("two draw calls, one mesh each; fireflies are additive, fog-free, depth-write off; butterflies are opaque", () => {
  const ins = mk("A", 12);
  assert.equal(ins.mallas.length, 2);
  const [m, l] = ins.mallas.map((x) => x.material as THREE.MeshBasicNodeMaterial);
  assert.ok(m.positionNode && m.colorNode && !m.transparent);
  // WebGPU's default is 8 vertex buffers per draw: butterflies use position+rol+aleta + 3 instance buffers, fireflies position+esq + 3
  for (const x of ins.mallas) assert.ok(Object.keys((x.geometry as THREE.BufferGeometry).attributes).length <= 6, "≤ 6 vertex buffers");
  assert.ok(l.positionNode && l.colorNode && l.opacityNode);
  assert.equal(l.blending, THREE.AdditiveBlending); assert.equal(l.depthWrite, false); assert.equal(l.fog, false); assert.equal(l.transparent, true);
  for (const x of ins.mallas) assert.ok(x instanceof THREE.Mesh && (x.geometry as THREE.BufferGeometry).boundingSphere, "bounding sphere set");
  ins.dispose();
});

test("by day the butterflies fly and the fireflies are away; by night the other way round; one draw call is saved when one group is empty", () => {
  const dia = mk("A", 12.5), noche = mk("A", 23);
  dia.llenarTodo(camara(0, 0), T0 + 30); noche.llenarTodo(camara(0, 0), T0 + 30);
  assert.ok(dia.datos.mariposas.n > 5 && dia.datos.luciernagas.n === 0, `day: ${dia.datos.mariposas.n} butterflies, ${dia.datos.luciernagas.n} fireflies`);
  assert.ok(noche.datos.luciernagas.n > 5 && noche.datos.mariposas.n === 0, `night: ${noche.datos.luciernagas.n} fireflies, ${noche.datos.mariposas.n} butterflies`);
  assert.equal(dia.estadisticas().dibujos, 1); assert.equal(noche.estadisticas().dibujos, 1);
  assert.equal(oscuridad(12), 0); assert.equal(oscuridad(23), 1); assert.equal(oscuridad(2), 1);
  assert.ok(oscuridad(19) > 0.3 && oscuridad(19) < 0.95 && oscuridad(6.5) > 0.2 && oscuridad(6.5) < 0.8, "the twilights ramp");
  // the instances are the animals F1 says live in those cells (same ids, same anchors)
  const vivos = new Map<string, Habitante>();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) for (const h of habitantes(SEMILLA, { cx, cz }, 1000, FAUNA_CASA, { zonaEn, alturaEn, hora: 12.5, densidad: 1, nivel: "A" })) vivos.set(`${h.x.toFixed(3)},${h.z.toFixed(3)}`, h);
  const A = dia.datos.mariposas.arr.iA.array;
  for (let i = 0; i < dia.datos.mariposas.n; i++) assert.ok(vivos.has(`${A[i * 4].toFixed(3)},${A[i * 4 + 2].toFixed(3)}`), "instance anchor is an F1 habitant");
  dia.dispose(); noche.dispose();
});

test("instances stay under each tier's cap, the extra triangles under the fauna budget, and the bytes are small", () => {
  const filas: string[] = [];
  for (const nivel of NIVELES) for (const hora of [12, 23]) {
    const ins = mk(nivel, hora);
    // walk the world a bit so the worst cell mixes are met
    let max = { m: 0, l: 0 };
    for (const [x, z] of [[0, 0], [150, 40], [-90, -200], [330, 310]]) {
      ins.llenarTodo(camara(x, z), T0 + 30);
      const e = ins.estadisticas();
      max = { m: Math.max(max.m, e.mariposas), l: Math.max(max.l, e.luciernagas) };
      assert.ok(e.mariposas <= FAUNA_POR_NIVEL[nivel].enVista.mariposa && e.luciernagas <= FAUNA_POR_NIVEL[nivel].enVista.luciernaga, `${nivel} caps`);
      assert.ok(e.triangulosEnviados <= TOPE_TRI[nivel] * 0.75, `${nivel}: ${e.triangulosEnviados} triangles leave room for the birds (F3)`);
      assert.ok(e.dibujos <= 2);
      assert.ok(e.bytes < 16000);
    }
    filas.push(`${nivel} ${hora}h: max ${max.m} butterflies, ${max.l} fireflies`);
    ins.dispose();
  }
  const peor = NIVELES.map((n) => `${n}: ${FAUNA_POR_NIVEL[n].enVista.mariposa * trianglesMariposa(n !== "D") + FAUNA_POR_NIVEL[n].enVista.luciernaga * TRIANGULOS_LUCIERNAGA}`);
  console.log("[F2] worst case triangles (all caps full, both groups):", peor.join("  "), "|", filas.join(" · "));
  for (const n of NIVELES) assert.ok(FAUNA_POR_NIVEL[n].enVista.mariposa * trianglesMariposa(n !== "D") + FAUNA_POR_NIVEL[n].enVista.luciernaga * TRIANGULOS_LUCIERNAGA <= TOPE_TRI[n] * 0.4, `${n} worst case ≤ 40 % of the fauna budget`);
});

test("deterministic: same seed, same clock → same instance bytes; another seed → another sky", () => {
  const dump = (seed: number) => { const i = crearInsectos({ nivel: "B", hora: () => 12, tabla: FAUNA_CASA }, { ...fuente, semilla: seed }); i.llenarTodo(camara(10, 10), T0 + 5); const r = [...i.datos.mariposas.arr.iA.array.slice(0, i.datos.mariposas.n * 4)].join(","); i.dispose(); return r; };
  assert.equal(dump(SEMILLA), dump(SEMILLA));
  assert.notEqual(dump(SEMILLA), dump(SEMILLA + 1));
});

test("cells are asked only at a cell border or a window change; moving inside a cell costs nothing; the work is spread over frames", () => {
  const ins = mk("B", 12, { presupuestoMs: 0.05 });
  const cam = camara(5, 5);
  let frames = 0, t = T0 + 10;
  while (ins.estadisticas().relleno === 0 && frames < 2000) { ins.actualizar(cam, t); t += 1 / 60; frames++; }
  const e0 = ins.estadisticas();
  assert.ok(e0.relleno === 1 && e0.celdasPendientes === 0, "the ring completes");
  assert.ok(frames >= 1, `ring ready after ${frames} frames`);
  const pedidas0 = e0.celdasPedidas;
  for (let i = 0; i < 300; i++) { cam.position.x = 5 + (i % 7) * 0.5; cam.updateMatrixWorld(); ins.actualizar(cam, t); t += 1 / 60; }
  assert.equal(ins.estadisticas().celdasPedidas, pedidas0, "no cell asked while the camera stays in its cell and the window holds");
  assert.equal(ins.estadisticas().relleno, 1);
  cam.position.x = 5 + CELDA_M; cam.updateMatrixWorld();
  for (let i = 0; i < 600; i++) { ins.actualizar(cam, t); t += 1 / 60; }
  const e1 = ins.estadisticas();
  assert.ok(e1.celdasPedidas > pedidas0 && e1.celdasPedidas - pedidas0 < 12, `a border crossing asks only the cells entering the ring (${e1.celdasPedidas - pedidas0} new)`);
  assert.equal(e1.relleno, 2);
  // the window changes → everything is asked again, once
  t = T0 + VENTANA_S + 1;
  for (let i = 0; i < 600; i++) { ins.actualizar(cam, t); t += 1 / 60; }
  const e2 = ins.estadisticas();
  assert.equal(e2.relleno, 3); assert.ok(e2.celdasPedidas - e1.celdasPedidas >= 6);
  for (let i = 0; i < 300; i++) { ins.actualizar(cam, t); t += 1 / 60; }
  assert.equal(ins.estadisticas().relleno, 3, "and then nothing again");
  ins.dispose();
});

test("CPU cost of the per-frame call: idle frames are microseconds; a refill frame stays near the 0.3 ms budget (one cell over at most)", () => {
  const ins = mk("A", 12);
  const cam = camara(0, 0);
  let t = T0 + 10;
  const trabajo: number[] = [], quietos: number[] = [];
  // walk 600 m at 1.4 m/s at 60 fps through terrain: ~19 cell crossings, then idle frames
  for (let i = 0; i < 60 * 430; i++) {
    cam.position.x += 1.4 / 60; cam.updateMatrixWorld();
    const antes = ins.estadisticas().celdasPedidas, t0 = performance.now();
    ins.actualizar(cam, t); t += 1 / 60;
    const ms = performance.now() - t0;
    (ins.estadisticas().celdasPedidas > antes ? trabajo : quietos).push(ms);
  }
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)], p99 = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length * 0.99)];
  console.log(`[F2] CPU ms per frame, tier A: idle median ${med(quietos).toFixed(4)} p99 ${p99(quietos).toFixed(4)} (${quietos.length} frames) · refill frames median ${med(trabajo).toFixed(3)} max ${Math.max(...trabajo).toFixed(3)} (${trabajo.length} frames)`);
  assert.ok(trabajo.length > 10, "there were refills");
  assert.ok(med(quietos) < 0.05, `idle frame median ${med(quietos)} ms`);
  assert.ok(med(trabajo) < 1.0, `refill frame median ${med(trabajo)} ms (budget 0.3 + one cell)`);
  ins.dispose();
});

test("the window border never pops: at the border nothing is visible, 4 s after it everything is, and the new window's animals replace the old ones", () => {
  const ins = mk("A", 12);
  const cam = camara(0, 0);
  ins.llenarTodo(cam, T0 + 60);
  const n0 = ins.estadisticas().mariposas;
  assert.ok(n0 > 5);
  const vis = (t: number) => ins.visibles(cam.position.x, cam.position.z, t).mariposas;
  const hasta = ins.datos.mariposas.n;
  assert.equal(vis(T0 + 120), 0, "end of the window: all faded out");
  assert.equal(vis(T0 + 120 + 0.001), 0, "stale instances stay invisible after the border");
  assert.equal(vis(T0 - 0.001), 0);
  // continuity of the fade scale: no instance's fade jumps more than 1/20 s worth
  let prev = fundidoOps(OPS_NUM, 0);
  for (let t = 0; t <= 121; t += 0.05) { const f = fundidoOps(OPS_NUM, t); assert.ok(Math.abs(f - prev) <= 0.0126, "fade is continuous"); prev = f; }
  assert.ok(vis(T0 + 60) >= 1);
  // the next window: refill, new animals, old ones gone
  const ids0 = [...ins.datos.mariposas.arr.iA.array.slice(0, hasta * 4)].join(",");
  // the refill is spread over frames by a per-frame time budget: a loaded machine may need a few calls (same instant), never zero progress
  for (let i = 0; i < 200 && ins.estadisticas().relleno !== 2; i++) ins.actualizar(cam, T0 + VENTANA_S + 0.5);
  assert.equal(ins.estadisticas().relleno, 2);
  assert.notEqual([...ins.datos.mariposas.arr.iA.array.slice(0, ins.datos.mariposas.n * 4)].join(","), ids0);
  assert.ok(fundidoOps(OPS_NUM, 0.5) < 0.2, "the new ones start nearly invisible");
  assert.ok(ins.visibles(cam.position.x, cam.position.z, T0 + VENTANA_S + 6).mariposas >= 1);
  ins.dispose();
});

test("rare fireflies are bigger and brighter; the 12 firefly colours reach the instance buffer as the table says", () => {
  const luc = FAUNA_CASA.especies.filter((e) => e.grupo === "luciernaga");
  const comun = luc.find((e) => e.rareza === "comun")!, leg = luc.find((e) => e.rareza === "legendaria")!, epi = luc.find((e) => e.rareza === "epica")!;
  assert.ok(radioLuz(leg) > 1.6 * radioLuz(comun) && radioLuz(epi) > radioLuz(comun), "bigger glow");
  assert.ok(brilloLuz(leg) > brilloLuz(epi) && brilloLuz(epi) > brilloLuz(comun), "brighter");
  const ins = mk("A", 23), pal = paletaDe(FAUNA_CASA);
  const lista: Habitante[] = luc.map((e, k) => ({ id: `t${k}`, especie: e.id, x: k, y: 0, z: 0, fase: 0.1, semillaPropia: 7, n: 1 }));
  ins.fijar(lista);
  const A = ins.datos.luciernagas.arr.iA.array;
  assert.equal(ins.datos.luciernagas.n, 12);
  const razas = ins.razas.luciernaga;
  assert.equal(razas.length, 12);
  luc.forEach((e, k) => {
    const b = razas[A[k * 4 + 3]];
    assert.equal(b.especie.id, e.id, "the instance's breed index leads to its breed");
    assert.ok(Math.abs(b.luz.r - pal.get(e.id)!.luz.r) < 1e-9);
    assert.equal(b.luzId, LUCES_FAUNA.indexOf(e.luz));
  });
  assert.equal(new Set(luc.map((e) => e.colores.luz)).size >= 10, true, "the 12 firefly colours are (nearly all) distinct in the table");
  const radios = razas.map((b) => radioLuz(b.especie));
  assert.equal(razas[radios.indexOf(Math.max(...radios))].especie.rareza, "legendaria", "the biggest glow is a legendary one");
  ins.dispose();
});

test("the allow-list and the density of the world are honoured", () => {
  const solo = mk("A", 12, { especies: ["mariposa-rele"] });
  solo.llenarTodo(camara(0, 0), T0 + 30);
  const F = solo.datos.mariposas.arr.iA.array, idx = solo.razas.mariposa.findIndex((b) => b.especie.id === "mariposa-rele");
  assert.ok(solo.datos.mariposas.n > 0);
  for (let i = 0; i < solo.datos.mariposas.n; i++) assert.equal(F[i * 4 + 3], idx);
  assert.ok(idx >= 0);
  const ninguno = mk("A", 12, { densidad: 0 });
  ninguno.llenarTodo(camara(0, 0), T0 + 30);
  assert.equal(ninguno.datos.mariposas.n, 0); assert.equal(ninguno.estadisticas().dibujos, 0);
  const aves = mk("A", 12, { especies: ["gorrion-laton"] });
  aves.llenarTodo(camara(0, 0), T0 + 30);
  assert.equal(aves.datos.mariposas.n + aves.datos.luciernagas.n, 0, "birds are F3's, never drawn here");
  solo.dispose(); ninguno.dispose(); aves.dispose();
});
