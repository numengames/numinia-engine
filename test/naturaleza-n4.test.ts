// naturaleza N4: the whole piece. (1) naturaleza.json: schema, defaults, clear errors, extra keys rejected, and how a world carries it
// (conMundo logs a wrong shape, keeps the house part without the file; the server publishes the validated state, the page's
// client hands it to the view). (2) the scatter: pure, deterministic, the brief's rules per zone. (3) the budget: worst case of
// terrain + trees + grass per tier. (4) the piece: off builds nothing, on hides the flat ground, switching off restores it and
// disposes everything, `aplicar` is idempotent.
import { FLORA_POR_NIVEL } from "../packages/render/src/naturaleza/flora.ts"; // R6.5
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { leerNaturaleza, DEFECTOS, ESQUEMA } from "../features/naturaleza/esquema.ts";
import { crearNaturaleza as crearParteServidor } from "../features/naturaleza/server.ts";
import naturalezaCliente from "../features/naturaleza/client.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import clientes from "../features/cliente.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { crearTerreno, alturaEn, zonaEn, estanqueDe, NIVEL_AGUA, CELDAS_TERRENO, triangulosDeTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { RESIDUOS_POR_NIVEL } from "../packages/render/src/naturaleza/residuos.ts";
import { esparcirArboles, RADIO_ESPECIE, SEPARACION, MARGEN_PLAZA, CELDA, PENDIENTE_MAX } from "../packages/render/src/naturaleza/esparcir.ts";
import type { Paleta } from "../packages/render/src/naturaleza/esparcir.ts";
import { NATURALEZA_POR_NIVEL, HIERBA_POR_NIVEL, PRESUPUESTO_NATURALEZA, ARBOLES_MAX_POR_NIVEL } from "../packages/render/src/naturaleza/niveles.ts";
import { triangulosHierba } from "../packages/render/src/naturaleza/hierba.ts";
import { geometriaLejos, triangulosCerca } from "../packages/render/src/naturaleza/arboles.ts";
import { crearNaturaleza, normalizar, DEFECTOS_NATURALEZA } from "../packages/render/src/naturaleza/naturaleza.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const SEMILLA = 1234;

// ---------------------------------------------------------------- the file
test("naturaleza.json: an empty object is valid and gets the defaults; the render's defaults are the same", () => {
  const r = leerNaturaleza({});
  assert.ok(r.ok && JSON.stringify(r.value) === JSON.stringify(DEFECTOS));
  assert.deepEqual(normalizar({}), DEFECTOS_NATURALEZA);
  assert.deepEqual({ ...DEFECTOS }, { ...DEFECTOS_NATURALEZA });
});

test("naturaleza.json: every key can be set; the nested density flattens", () => {
  const r = leerNaturaleza({ schema: ESQUEMA, activa: true, semilla: 77, tamano: 160, plaza: 9, densidad: { arboles: 0.4, hierba: 0.25 }, estanque: false, paleta: "otono" });
  assert.deepEqual(r.ok && r.value, { activa: true, semilla: 77, tamano: 160, plaza: 9, arboles: 0.4, hierba: 0.25, estanque: false, paleta: "otono", fauna: true, faunaDensidad: 1, faunaEspecies: "" });
  const parcial = leerNaturaleza({ densidad: { hierba: 0 } });
  assert.ok(parcial.ok && parcial.value.hierba === 0 && parcial.value.arboles === 1);
});

test("naturaleza.json: extra keys and wrong values are rejected with a path and how to fix them", () => {
  const casos: [unknown, RegExp][] = [
    [null, /naturaleza: un objeto JSON/], [[1], /naturaleza: un objeto JSON/], ["si", /naturaleza: un objeto JSON/],
    [{ arbolitos: 3 }, /naturaleza\.arbolitos: clave desconocida: quítala o corrige el nombre/],
    [{ schema: "otro@1" }, /naturaleza\.schema: debe ser "numinia-engine\/naturaleza@1"/],
    [{ activa: "yes" }, /naturaleza\.activa: true o false/], [{ estanque: 1 }, /naturaleza\.estanque: true o false/],
    [{ semilla: 1.5 }, /naturaleza\.semilla: un número entero entre 0 y 2147483647/], [{ semilla: -3 }, /naturaleza\.semilla/],
    [{ tamano: 50 }, /naturaleza\.tamano: un número entero entre 100 y 400/], [{ plaza: 100 }, /naturaleza\.plaza: un número entero entre 4 y 40/],
    [{ paleta: "invierno" }, /naturaleza\.paleta: una de: "verano", "otono", "primavera"/],
    [{ densidad: 0.5 }, /naturaleza\.densidad: un objeto/], [{ densidad: { arboles: 2 } }, /naturaleza\.densidad\.arboles: un número entre 0 y 1/],
    [{ densidad: { pasto: 1 } }, /naturaleza\.densidad\.pasto: clave desconocida/],
  ];
  for (const [json, re] of casos) {
    const r = leerNaturaleza(json);
    assert.ok(!r.ok, JSON.stringify(json));
    assert.match(r.issues.map((i) => `${i.path}: ${i.message}`).join(" | "), re, JSON.stringify(json));
  }
  const varias = leerNaturaleza({ a: 1, paleta: "x", plaza: 0 });
  assert.ok(!varias.ok && varias.issues.length === 3, "all the issues at once, not only the first");
});

// ---------------------------------------------------------------- how a world carries it
test("a world: the house part stays untouched without the file; a wrong file is logged and not used; a good one replaces the part", () => {
  const casa = funciones.find((p) => p.feature.id === "naturaleza")!;
  assert.ok(casa, "the feature is plugged in features/servidor.ts");
  assert.ok(clientes.some((p) => p.feature.id === "naturaleza"), "and in features/cliente.ts");
  const log: string[] = [];
  const sin = conMundo(funciones, () => undefined, (l) => log.push(l));
  assert.equal(sin.find((p) => p.feature.id === "naturaleza"), casa);
  assert.equal(log.length, 0, "no file, nothing said");
  const mal = conMundo(funciones, (f) => (f === "naturaleza.json" ? { semilla: "uno", arbolitos: 2 } : undefined), (l) => log.push(l));
  assert.equal(mal.find((p) => p.feature.id === "naturaleza"), casa);
  assert.match(log.join(" "), /\[mundo\] naturaleza\.json no se usa \(suelo plano\): .*naturaleza\.arbolitos.*naturaleza\.semilla/);
  const forma = conMundo(funciones, (f) => (f === "naturaleza.json" ? ["no", "un", "objeto"] : undefined), (l) => log.push(l));
  assert.equal(forma.find((p) => p.feature.id === "naturaleza"), casa);
  assert.match(log.join(" "), /naturaleza: un objeto JSON/);
  const bien = conMundo(funciones, (f) => (f === "naturaleza.json" ? { semilla: 5 } : undefined), (l) => log.push(l));
  assert.notEqual(bien.find((p) => p.feature.id === "naturaleza"), casa);
});

test("server + page: the world's data reaches the view once; a world without the file sends nothing", () => {
  const llega = (mundo: Parameters<typeof crearParteServidor>[0]) => {
    const log: string[] = [], vistas: Record<string, unknown>[] = [];
    const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: [crearParteServidor(mundo)], log: (l) => log.push(l), aparicion: { x: 0, z: 0, radio: 1 } });
    const t = inst.join(0);
    const s = new ClientSession(t, { features: [naturalezaCliente], view: { label() {}, bounce() {}, naturaleza: (v: Record<string, unknown>) => vistas.push({ ...v }) } });
    for (let k = 0; k < 4; k++) { t.flush(); inst.tick(); t.flush(); }
    void s;
    return { vistas, log };
  };
  const v = leerNaturaleza({ semilla: 99, paleta: "primavera", densidad: { arboles: 0.5 } });
  assert.ok(v.ok);
  const con = llega(v.ok ? v.value : null);
  assert.equal(con.vistas.length, 1);
  assert.deepEqual(con.vistas[0], { activa: true, semilla: 99, tamano: 200, plaza: 12, arboles: 0.5, hierba: 1, estanque: true, paleta: "primavera", fauna: true, faunaDensidad: 1, faunaEspecies: "" });
  assert.match(con.log.join(" "), /naturaleza: encendida \(semilla 99/);
  assert.equal(llega(null).vistas.length, 0, "no file: the page's view is never called");
});

// ---------------------------------------------------------------- the scatter
const mundo = (semilla = SEMILLA, nivel: Nivel = "A", extra: Partial<Parameters<typeof esparcirArboles>[1]> = {}) => {
  const t = crearTerreno({ semilla, nivel });
  const puntos = esparcirArboles(t, { semilla, tamano: 200, plaza: 12, densidad: 1, nivel, paleta: "verano", estanque: t.estanque, ...extra });
  return { t, puntos };
};

test("scatter: pure and deterministic (same input, same trees; another seed, other trees)", () => {
  const a = mundo().puntos, b = mundo().puntos;
  assert.ok(a.length > 300, `${a.length} trees`);
  assert.deepEqual(a, b);
  assert.notDeepEqual(mundo(77).puntos.slice(0, 20), a.slice(0, 20));
  const solo = mundo(SEMILLA, "A", { densidad: 0 }).puntos;
  assert.equal(solo.length, 0);
});

test("scatter rules: none in the plaza, the pond, on sand or at the border; bushes only on shore and rock; spacing; not on steep ground", () => {
  const { t, puntos } = mundo();
  const e = estanqueDe(SEMILLA);
  const cuenta: Record<string, Record<string, number>> = {};
  for (const p of puntos) {
    assert.ok(Math.hypot(p.x, p.z) >= 12 + MARGEN_PLAZA - 0.01, "outside the plaza and its margin");
    assert.ok(Math.hypot(p.x - e.x, p.z - e.z) >= e.radio * 1.25 - 0.01, "outside the pond");
    assert.ok(p.y >= -0.05 && Math.abs(p.y - alturaEn(SEMILLA, p.x, p.z)) < 0.006, "on the ground, above the water");
    assert.ok(Math.abs(p.x) <= 93.01 && Math.abs(p.z) <= 93.01, "not at the border");
    const z = zonaEn(SEMILLA, p.x, p.z);
    assert.notEqual(z, "arena", "no tree on sand");
    if (z === "roca") assert.equal(p.especie, "arbusto", `only bushes on ${z}`);
    if (z === "orilla") assert.ok(p.especie === "arbusto" || p.especie === "sauce", `only bushes and willows on ${z}`); // R6.3
    (cuenta[z] ??= {})[p.especie as string] = ((cuenta[z] ??= {})[p.especie as string] ?? 0) + 1;
    const s = Math.hypot(alturaEn(SEMILLA, p.x + 0.7, p.z) - alturaEn(SEMILLA, p.x, p.z), alturaEn(SEMILLA, p.x, p.z + 0.7) - alturaEn(SEMILLA, p.x, p.z)) / 0.7;
    assert.ok(s <= PENDIENTE_MAX + 0.02, `slope ${s.toFixed(2)}`);
    assert.equal(p.variante === 0 || p.variante === 1, true);
  }
  // minimum spacing between every pair (O(n²) on a thousand trees is fine here)
  let minimo = Infinity;
  for (let i = 0; i < puntos.length; i++) for (let j = i + 1; j < puntos.length; j++) {
    const a = puntos[i], b = puntos[j], d = Math.hypot(a.x - b.x, a.z - b.z), lim = (RADIO_ESPECIE[a.especie as keyof typeof RADIO_ESPECIE] + RADIO_ESPECIE[b.especie as keyof typeof RADIO_ESPECIE]) * SEPARACION;
    assert.ok(d >= lim - 0.02, `${a.especie}/${b.especie} ${d.toFixed(2)} m < ${lim.toFixed(2)}`);
    minimo = Math.min(minimo, d);
  }
  assert.ok(minimo >= 1.3, `closest pair ${minimo.toFixed(2)} m`);
  // zones really get used with the brief's mix: forest holds pines and oaks, the meadow holds oaks and birches
  // R2: five species spread over the zones, each of them used (groves make some zones lean to one species, but the mix stays wide)
  const todas = new Set(puntos.map((p) => p.especie));
  for (const e of ["encina", "pino", "cipres", "olivo", "arbusto"]) assert.ok(todas.has(e), `${e} is planted: ${JSON.stringify(cuenta)}`);
  assert.ok(Object.keys(cuenta.bosque ?? {}).length >= 4 && Object.keys(cuenta.prado ?? {}).length >= 4, JSON.stringify(cuenta));
  assert.ok(puntos.filter((p) => p.escala > 1.4).length >= 3, "some lone old trees");
  assert.ok(t.malla.isMesh);
  void CELDA;
});

test("scatter: forest is dense, meadow is sparse (trees per hectare of each zone)", () => {
  const { puntos } = mundo(SEMILLA, "A");
  // grid of probes: count area per zone, trees per zone
  const area: Record<string, number> = {}, arb: Record<string, number> = {};
  for (let x = -92; x < 92; x += 2) for (let z = -92; z < 92; z += 2) { if (Math.hypot(x, z) < 15) continue; const zz = zonaEn(SEMILLA, x, z); area[zz] = (area[zz] ?? 0) + 4; }
  for (const p of puntos) { const zz = zonaEn(SEMILLA, p.x, p.z); arb[zz] = (arb[zz] ?? 0) + 1; }
  const dens = (z: string) => ((arb[z] ?? 0) / Math.max(1, area[z] ?? 0)) * 10000;
  assert.ok(area.bosque > 2000 && area.prado > 2000, JSON.stringify(area));
  assert.ok(dens("bosque") > 2.2 * dens("prado"), `forest ${dens("bosque").toFixed(0)} vs meadow ${dens("prado").toFixed(0)} trees/ha`);
  assert.ok(dens("prado") > 15, "the meadow is not empty");
  assert.ok(dens("arena") === 0, "sand has none");
});

test("scatter: density scales the count; each tier's cap is honoured and thinning keeps the whole world covered", () => {
  const lleno = mundo(SEMILLA, "A", { nivel: "A" }).puntos.length, medio = mundo(SEMILLA, "A", { densidad: 0.5 }).puntos.length;
  assert.ok(medio < lleno * 0.75 && medio > lleno * 0.25, `${medio} vs ${lleno}`);
  for (const n of NIVELES) {
    const p = mundo(SEMILLA, n).puntos;
    assert.ok(p.length <= ARBOLES_MAX_POR_NIVEL[n], `${n}: ${p.length} > ${ARBOLES_MAX_POR_NIVEL[n]}`);
    const cuadrantes = new Set(p.map((q) => `${q.x > 0}${q.z > 0}`));
    assert.equal(cuadrantes.size, 4, `${n}: trees in all four quadrants`);
  }
  assert.ok(mundo(SEMILLA, "D").puntos.length < mundo(SEMILLA, "A").puntos.length);
});

test("palettes: autumn puts most oaks and birches in their orange / yellow set, spring puts blossom on the bushes, summer stays green", () => {
  const cuenta = (pal: Paleta, esp: string) => { const l = mundo(SEMILLA, "A", { paleta: pal }).puntos.filter((p) => p.especie === esp); return l.filter((p) => p.variante === 1).length / Math.max(1, l.length); };
  assert.ok(cuenta("otono", "encina") > 0.7 && cuenta("otono", "olivo") > 0.15 && cuenta("otono", "cipres") === 0);
  assert.ok(cuenta("verano", "encina") < 0.2 && cuenta("verano", "olivo") < 0.2);
  assert.ok(cuenta("primavera", "arbusto") > 0.55 && cuenta("primavera", "encina") === 0);
  // the positions do not depend on the palette (only the colours do)
  const a = mundo(SEMILLA, "A", { paleta: "verano" }).puntos.map((p) => [p.x, p.z, p.especie]), b = mundo(SEMILLA, "A", { paleta: "otono" }).puntos.map((p) => [p.x, p.z, p.especie]);
  assert.deepEqual(a, b);
});

test("scatter CPU: a full 200 m world builds in well under a second (pure code, once at the load)", () => {
  const t = crearTerreno({ semilla: SEMILLA, nivel: "D" });
  const t0 = performance.now();
  esparcirArboles(t, { semilla: SEMILLA, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: t.estanque });
  const ms = performance.now() - t0;
  console.log(`# scatter: ${ms.toFixed(0)} ms for a 200 m world, tier A`);
  assert.ok(ms < 800, `${ms.toFixed(0)} ms (a loaded machine may add a spike: re-run alone)`);
});

// ---------------------------------------------------------------- the budget
test("budget: terrain + trees + grass fit the brief's triangles and draw calls on every tier, in the worst case", () => {
  for (const n of NIVELES) {
    const cfg = NATURALEZA_POR_NIVEL[n], b = PRESUPUESTO_NATURALEZA[n];
    const terreno = triangulosDeTerreno(CELDAS_TERRENO[n], n === "D") + RESIDUOS_POR_NIVEL[n] + FLORA_POR_NIVEL[n]; // R4/R6.5: the baked Residuos and flora fit inside the terrain share
    const arboles = cfg.arbolesCerca * triangulosCerca(cfg.arbolesDetalle) + (cfg.arbolesVisibles - cfg.arbolesCerca) * geometriaLejos().triangulos; // every near slot at the cap, every other at the far cap
    const hierba = triangulosHierba(HIERBA_POR_NIVEL[n]); // N7: outer + dense inner ring
    assert.ok(terreno + arboles + hierba <= b.triangulos, `${n}: ${terreno} + ${arboles} + ${hierba} = ${terreno + arboles + hierba} > ${b.triangulos}`);
    const llamadas = 1 + (cfg.arbolesVisibles > cfg.arbolesCerca ? 2 : 1) + 1 + (n === "D" ? 0 : 1) + 2; // terrain + trees + grass (flowers inside) + water (D paints it into the terrain) + fauna (butterflies+fireflies, birds)
    assert.ok(llamadas <= b.llamadas, `${n}: ${llamadas} draw calls > ${b.llamadas}`);
  }
  assert.deepEqual(NIVELES.map((n) => PRESUPUESTO_NATURALEZA[n].triangulos), [15000, 10000, 8000, 4000]);
  assert.deepEqual(NIVELES.map((n) => PRESUPUESTO_NATURALEZA[n].llamadas), [8, 7, 6, 5]);
});

// ---------------------------------------------------------------- the piece
function banco(nivel: Nivel = "B") {
  const padre = new THREE.Group(), ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
  padre.add(ground);
  const camara = new THREE.PerspectiveCamera(); camara.position.set(0, 1.7, 0);
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => nivel, camara, yo: () => ({ x: 0, y: 0, z: 0 }), niebla: () => 0xc9d8e4 });
  return { padre, ground, camara, n };
}
const grabar = (o: THREE.Object3D) => { const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = []; o.traverse((m) => { const q = m as THREE.Mesh; if (q.isMesh) { geos.push(q.geometry); mats.push(q.material as THREE.Material); } }); return { geos, mats }; };

test("the piece: off by default it builds nothing; on it hides the flat ground; switching off restores it and disposes everything", async () => {
  const { padre, ground, n } = banco("B");
  assert.equal(padre.children.length, 1, "constructing adds nothing to the scene");
  assert.equal(n.activa, false);
  n.actualizar(0.016); // harmless while off
  await n.aplicar(undefined);
  assert.equal(padre.children.length, 1);
  assert.equal(ground.visible, true);
  await n.aplicar({ semilla: 5 });
  assert.equal(n.activa, true);
  assert.equal(ground.visible, false, "the flat ground is hidden only while the nature is on");
  assert.equal(padre.children.length, 2);
  const grupo = n.grupo!, { geos, mats } = grabar(grupo);
  assert.ok(geos.length >= 5, `${geos.length} meshes`);
  let liberados = 0;
  for (const g of geos) g.addEventListener("dispose", () => liberados++);
  for (const m of mats) m.addEventListener("dispose", () => liberados++);
  n.actualizar(0.016); n.actualizar(0.016);
  const e = n.estadisticas();
  assert.ok(e.activa && e.llamadas.total <= PRESUPUESTO_NATURALEZA.B.llamadas && e.triangulos.total <= PRESUPUESTO_NATURALEZA.B.triangulos, JSON.stringify(e));
  await n.aplicar({ activa: false });
  assert.equal(n.activa, false);
  assert.equal(ground.visible, true, "the ground is back");
  assert.equal(padre.children.length, 1, "the group left the scene");
  assert.equal(liberados, geos.length + mats.length, "every geometry and material was disposed");
  await n.aplicar(null);
  assert.equal(ground.visible, true);
});

test("the piece: aplicar is idempotent (same data = same objects), and a change rebuilds without leaving the old one behind", async () => {
  const { padre, ground, n } = banco("C");
  await n.aplicar({ semilla: 5, paleta: "otono" });
  const g1 = n.grupo!;
  await n.aplicar({ semilla: 5, paleta: "otono" });
  await n.aplicar({ activa: true, semilla: 5, paleta: "otono", plaza: 12, estanque: true });
  assert.equal(n.grupo, g1, "the same data on the same tier does nothing");
  const dos = Promise.all([n.aplicar({ semilla: 6 }), n.aplicar({ semilla: 7 })]); // two calls while the modules are cached: the last one wins
  await dos;
  assert.notEqual(n.grupo, g1);
  assert.equal(padre.children.filter((c) => c.name === "naturaleza").length, 1, "exactly one nature group in the scene");
  assert.equal(ground.visible, false);
  n.dispose();
  assert.equal(ground.visible, true);
  assert.equal(padre.children.length, 1);
});

test("the piece: it was already hidden? it stays hidden when switched off (the ground returns exactly as it was)", async () => {
  const { ground, n } = banco("D");
  ground.visible = false;
  await n.aplicar({ semilla: 3, estanque: false });
  assert.equal(n.estadisticas().llamadas.agua, 0, "no pond, no water draw call");
  await n.aplicar({ activa: false });
  assert.equal(ground.visible, false);
});

test("the piece: draw calls and triangles from the spawn fit every tier's budget", async () => {
  for (const nivel of NIVELES) {
    const { n, camara } = banco(nivel);
    await n.aplicar({ semilla: SEMILLA });
    n.actualizar(0.016);
    const e = n.estadisticas();
    assert.ok(e.llamadas.total <= PRESUPUESTO_NATURALEZA[nivel].llamadas, `${nivel}: ${e.llamadas.total} draw calls`);
    assert.ok(e.triangulos.total <= PRESUPUESTO_NATURALEZA[nivel].triangulos, `${nivel}: ${e.triangulos.total} triangles`);
    camara.position.set(70, 1.7, -60); n.actualizar(5); // walking far away: still inside the budget
    assert.ok(n.estadisticas().triangulos.total <= PRESUPUESTO_NATURALEZA[nivel].triangulos);
    n.dispose();
  }
});

test("the piece: the terrain it exposes is the pure N1 function (same height as alturaEn for the same seed)", async () => {
  const { n } = banco("B");
  await n.aplicar({ semilla: 42, tamano: 160, plaza: 8 });
  const t = n.terreno!;
  for (const [x, z] of [[0, 0], [20, -10], [-30, 40]]) assert.equal(t.alturaEn(x, z), alturaEn(42, x, z, { tamano: 160, plaza: 8 }));
  assert.ok(Math.abs(t.alturaEn(0, 0)) < 1e-9, "the spawn stays at height 0 (the old flat ground)");
  assert.ok(t.estanque.nivel === NIVEL_AGUA);
  n.dispose();
});
