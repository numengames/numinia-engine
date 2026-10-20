// naturaleza F4: the fauna wired into the nature piece. Fauna on/off (and the fauna switched off by the file), a change of only
// `faunaDensidad`/`faunaEspecies` rebuilds just the fauna (terrain, trees and grass keep their objects), dispose gives the scene back
// (children count, geometries and materials disposed), the world hour reaches the fauna, the tier budget with the fauna included
// (the real numbers come from tools/naturaleza-medir.ts), and the hour read off the environment data.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";
import type { HNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";
import { horaDeEntorno } from "../packages/render/src/naturaleza/cargador.ts";
import { PRESUPUESTO_NATURALEZA } from "../packages/render/src/naturaleza/niveles.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { leerNaturaleza } from "../features/naturaleza/esquema.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

function banco(nivel: Nivel = "B", conTabla = true, hora = 12) {
  const padre = new THREE.Group(), ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
  padre.add(ground);
  const camara = new THREE.PerspectiveCamera(); camara.position.set(0, 1.7, 0);
  const estado = { hora, tablas: 0 };
  const h: HNaturaleza = { padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => nivel, camara, yo: () => ({ x: 0, y: 0, z: 0 }), niebla: () => 0xc9d8e4, hora: () => estado.hora };
  if (conTabla) h.tablaFauna = async () => { estado.tablas++; return FAUNA_CASA; };
  return { padre, ground, camara, estado, n: crearNaturaleza(h) };
}
const mallas = (o: THREE.Object3D) => { const r: THREE.Mesh[] = []; o.traverse((m) => { if ((m as THREE.Mesh).isMesh) r.push(m as THREE.Mesh); }); return r; };
const cuenta = (o: THREE.Object3D) => { let c = 0; o.traverse(() => c++); return c; };

test("fauna on: three groups-worth of insects and birds appear in the nature group; off by the file: none and the table is never asked", async () => {
  const on = banco("B");
  await on.n.aplicar({ semilla: 5 });
  assert.ok(on.n.fauna, "default is fauna on");
  assert.equal(on.estado.tablas, 1);
  const nombres = mallas(on.n.grupo!).map((m) => m.name);
  assert.ok(nombres.some((x) => /mariposa/i.test(x)) || on.n.fauna!.insectos.mallas.length === 2, nombres.join());
  for (const m of [...on.n.fauna!.insectos.mallas, on.n.fauna!.aves.malla]) assert.ok(on.n.grupo!.getObjectById(m.id), "every fauna mesh lives in the nature group");
  on.n.actualizar(0.016);
  const e = on.n.estadisticas();
  assert.ok(e.fauna && e.fauna.mariposas + e.fauna.pajaros > 0, JSON.stringify(e.fauna));
  assert.equal(e.llamadas.fauna, e.fauna!.llamadas);
  assert.equal(e.triangulos.total, e.triangulos.terreno + e.triangulos.arboles + e.triangulos.hierba + e.triangulos.fauna);
  on.n.dispose();

  const off = banco("B");
  await off.n.aplicar({ semilla: 5, fauna: false });
  assert.equal(off.n.fauna, null);
  assert.equal(off.estado.tablas, 0, "fauna off: the table (and so the fauna chunk) is never requested");
  assert.equal(off.n.estadisticas().fauna, null);
  assert.equal(off.n.estadisticas().llamadas.fauna, 0);
  await banco("B").n.aplicar({ semilla: 5, faunaDensidad: 0 }); // density 0 = nothing to draw: nothing loaded either
  const sinTabla = banco("B", false);
  await sinTabla.n.aplicar({ semilla: 5 });
  assert.equal(sinTabla.n.fauna, null, "no table handed over by the page = no fauna, no error");
  off.n.dispose(); sinTabla.n.dispose();
});

test("fauna: changing only density / species rebuilds just the fauna; terrain, trees and grass keep their objects", async () => {
  const { n, padre } = banco("C");
  await n.aplicar({ semilla: 9, faunaDensidad: 1 });
  const grupo = n.grupo!, terreno = n.terreno, antes = mallas(grupo).filter((m) => !n.fauna!.insectos.mallas.includes(m) && m !== n.fauna!.aves.malla);
  const f1 = n.fauna!, hijos = grupo.children.length;
  await n.aplicar({ semilla: 9, faunaDensidad: 0.4 });
  assert.equal(n.grupo, grupo, "same nature group");
  assert.equal(n.terreno, terreno, "same terrain object (not rebuilt)");
  assert.notEqual(n.fauna, f1, "the fauna was rebuilt");
  assert.equal(grupo.children.length, hijos, "no leftovers: the old fauna left the group");
  const despues = mallas(grupo).filter((m) => !n.fauna!.insectos.mallas.includes(m) && m !== n.fauna!.aves.malla);
  assert.deepEqual(despues.map((m) => m.id), antes.map((m) => m.id), "terrain, trees, grass: the very same meshes");
  const f2 = n.fauna!;
  await n.aplicar({ semilla: 9, faunaDensidad: 0.4, faunaEspecies: "mariposa-rele" });
  assert.notEqual(n.fauna, f2);
  assert.equal(n.grupo, grupo); assert.equal(n.terreno, terreno);
  assert.ok(n.fauna!.aves.especies.length === 0, "no bird is in that allow-list");
  // the fauna switch alone
  await n.aplicar({ semilla: 9, fauna: false });
  assert.equal(n.fauna, null); assert.equal(n.terreno, terreno, "switching the fauna off keeps the terrain");
  assert.ok(grupo.children.length <= hijos, "the fauna left the group");
  await n.aplicar({ semilla: 9 });
  assert.ok(n.fauna && n.terreno === terreno);
  // a change of anything else is a full rebuild
  await n.aplicar({ semilla: 10 });
  assert.notEqual(n.terreno, terreno);
  assert.equal(padre.children.filter((c) => c.name === "naturaleza").length, 1);
  n.dispose();
});

test("fauna: dispose and switch-off give the scene back (children count, every geometry and material disposed)", async () => {
  const { n, padre, ground } = banco("B");
  const hijosAntes = padre.children.length, objetosAntes = cuenta(padre);
  await n.aplicar({ semilla: 3 });
  const fm = [...n.fauna!.insectos.mallas, n.fauna!.aves.malla];
  let liberados = 0;
  for (const m of fm) { m.geometry.addEventListener("dispose", () => liberados++); (m.material as THREE.Material).addEventListener("dispose", () => liberados++); }
  n.actualizar(0.016);
  await n.aplicar({ semilla: 3, fauna: false });
  assert.equal(liberados, fm.length * 2, "fauna off disposed its geometries and materials");
  assert.ok(n.fauna === null && fm.every((m) => !m.parent || !m.parent.parent), "no fauna mesh stays attached to the nature group");
  await n.aplicar({ semilla: 3 });
  const fm2 = [...n.fauna!.insectos.mallas, n.fauna!.aves.malla];
  let lib2 = 0;
  for (const m of fm2) { m.geometry.addEventListener("dispose", () => lib2++); (m.material as THREE.Material).addEventListener("dispose", () => lib2++); }
  await n.aplicar(null);
  assert.equal(lib2, fm2.length * 2, "switching the whole nature off disposes the fauna too");
  assert.equal(padre.children.length, hijosAntes);
  assert.equal(cuenta(padre), objetosAntes, "the scene is exactly what it was");
  assert.equal(ground.visible, true);
  await n.aplicar({ semilla: 3 });
  n.dispose();
  assert.equal(cuenta(padre), objetosAntes);
});

test("fauna: a change of device tier rebuilds everything for the new tier, fauna included", async () => {
  const b = banco("B");
  let nivel: Nivel = "B";
  const h2: HNaturaleza = { padre: b.padre, ground: b.ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => nivel, camara: b.camara, yo: () => null, niebla: () => 0xc9d8e4, hora: () => 12, tablaFauna: async () => FAUNA_CASA };
  const n = crearNaturaleza(h2);
  await n.aplicar({ semilla: 4 });
  assert.equal(n.fauna!.insectos.config.nivel, "B");
  nivel = "D"; n.actualizar(0.016); await new Promise((r) => setTimeout(r, 400));
  assert.equal(n.estadisticas().nivel, "D");
  assert.equal(n.fauna!.insectos.config.nivel, "D");
  assert.equal(b.padre.children.filter((c) => c.name === "naturaleza").length, 1);
  n.dispose();
});

test("fauna: the world hour reaches the fauna (fireflies only in the dark, butterflies take their turn on B) and the clock moves the birds", async () => {
  const dia = banco("A", true, 12), noche = banco("A", true, 0), nocheB = banco("B", true, 0), diaB = banco("B", true, 12);
  for (const b of [dia, noche, nocheB, diaB]) { await b.n.aplicar({ semilla: 5 }); b.n.actualizar(0.016); }
  const vis = (b: ReturnType<typeof banco>) => b.n.fauna!.insectos.mallas.map((m) => m.visible);
  assert.deepEqual(vis(dia).slice(1), [false], "no fireflies drawn by day");
  assert.equal(vis(noche)[1], true, "fireflies drawn at night");
  assert.deepEqual(vis(nocheB), [false, true], "tier B at night: fireflies only (one insect call at a time)");
  assert.deepEqual(vis(diaB), [true, false], "tier B by day: butterflies only");
  const ptr = (b: ReturnType<typeof banco>) => JSON.stringify(Array.from(b.n.fauna!.aves.geometria.getAttribute("iA").array.slice(0, 16)));
  const t0 = ptr(dia);
  for (let i = 0; i < 3; i++) dia.n.actualizar(130); // 390 s later: three windows on, the animals are others
  assert.notEqual(ptr(dia), t0, "the clock reaches the birds");
  for (const b of [dia, noche, nocheB, diaB]) b.n.dispose();
});

test("the hour of the day from the environment data: the clock when the sun follows it, else read off the sun", () => {
  assert.equal(horaDeEntorno(null), 12);
  assert.equal(horaDeEntorno({ hora: 19.5, solHora: true }), 19.5);
  assert.equal(horaDeEntorno({ hora: 30, solHora: true }), 6);
  assert.equal(horaDeEntorno({ solAltura: 60, solRumbo: 0 }), 12);
  assert.equal(horaDeEntorno({ solAltura: -20, solRumbo: 0 }), 0);
  assert.equal(horaDeEntorno({ solAltura: 1, solRumbo: -85 }), 6.5, "low sun on the morning side");
  assert.equal(horaDeEntorno({ solAltura: 1, solRumbo: 85 }), 19, "low sun on the evening side");
  assert.equal(horaDeEntorno({}), 12);
});

test("the budget with the fauna: the whole piece (terrain + trees + grass + pond + fauna) at the worst hour of each tier stays inside the brief's limits", async () => {
  for (const nivel of ["A", "B", "C", "D"] as Nivel[]) {
    const tope = PRESUPUESTO_NATURALEZA[nivel];
    for (const hora of [12, 19, 0, 6.5]) {
      const b = banco(nivel, true, hora);
      await b.n.aplicar({ semilla: 1234 });
      b.n.actualizar(0.016);
      const e = b.n.estadisticas();
      assert.ok(e.llamadas.total <= tope.llamadas, `${nivel} h${hora}: ${e.llamadas.total} draw calls > ${tope.llamadas}`);
      assert.ok(e.triangulos.total <= tope.triangulos, `${nivel} h${hora}: ${e.triangulos.total} triangles > ${tope.triangulos}`);
      assert.ok(e.fauna!.triangulosPeor >= e.fauna!.triangulos);
      b.n.dispose();
    }
  }
});

test("naturaleza.json: fauna.activa false and the default (true) reach the page's defaults", () => {
  const r = leerNaturaleza({ fauna: { activa: false } });
  assert.ok(r.ok && r.value.fauna === false);
  const d = leerNaturaleza({});
  assert.ok(d.ok && d.value.fauna === true);
});
