// ancestros v1: the Salón de los Ancestros and the tribute to Asimov, headless (in-memory world, pages pumped by 20 Hz
// ticks). The hall's walls are solid and nameless, the hologram has a card and is used from close by; it lights up for
// everyone when someone comes near (and tells only that person); «hablar» says the Three Laws in turn with one of our
// AGW rules beside each, to whoever is near; far away it is refused; the simulation never sees any of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { solidsFrom, stateHash } from "../packages/sim/src/index.ts";
import { ancestros, CERCA_M, DESPIERTA_M, DUERME_M, HABLAR_M, LEYES, NUESTRAS, SALON } from "../features/ancestros/feature.ts";
import { crearAncestros, murosDelSalon, HOLOGRAMAS_DEFECTO, nuestraDe } from "../features/ancestros/server.ts";
import { crearCliente } from "../features/ancestros/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const H = HOLOGRAMAS_DEFECTO[0];

function mundo(n: number, features = [crearAncestros()]) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features, log: (l) => log.push(l) });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { features: cli.parts });
    return { t, s, a: cli.ancestros };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log };
}

test("declaration: loads, is accessible, and is plugged into the server and the page", () => {
  assert.deepEqual(ancestros.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "ancestros") && paginas.some((f) => f.feature.id === "ancestros"));
  assert.equal(LEYES.length, 3); assert.equal(NUESTRAS.length, 4);
  assert.ok(NUESTRAS.every((r) => /^AGW-0(0[1-9]|1[0-4])$/.test(r.id)), "our rules are AGW-001 … AGW-014");
  assert.deepEqual([nuestraDe(0).id, nuestraDe(3).id, nuestraDe(4).id], [NUESTRAS[0].id, NUESTRAS[3].id, NUESTRAS[0].id]);
});

test("the hall: four walls with a door to the south, all solid for the simulation and nameless for readers and agents", () => {
  const muros = murosDelSalon();
  assert.equal(muros.length, 5);
  const sur = muros.filter((m) => m.id.startsWith("sur"));
  assert.equal(sur[1].x0 - sur[0].x1, SALON.puerta, "the door is the gap between the two south pieces");
  assert.ok(sur.every((m) => m.z1 === SALON.z + SALON.lado / 2), "the door faces the plaza (+z, south)");
  const { pages: [a], pump, inst } = mundo(1);
  pump(3);
  assert.equal(solidsFrom(inst.features.allState()).length, 5 * 6, "the server's simulation has the five boxes");
  assert.equal(solidsFrom(a.s.features.allState()).length, 5 * 6, "the page's prediction has the same five");
  assert.deepEqual(a.a.muros().map((m) => m.id).sort(), ["muro-este", "muro-norte", "muro-oeste", "muro-sur-este", "muro-sur-oeste"]);
  assert.ok(a.a.muros().every((m) => m.y1 === SALON.alto && m.y0 === 0));
  const fichas = a.s.features.cards().filter((c) => c.feature === "ancestros");
  assert.deepEqual(fichas.map((c) => [c.key, c.role, c.name, c.actions]), [["asimov", "objeto", "Holograma de Asimov", ["hablar"]]], "only the hologram has a name: the walls are decoration");
  assert.match(fichas[0].description ?? "", /dramatización/);
  assert.deepEqual(a.a.hologramas().map((h) => [h.id, h.x, h.z, h.radio, h.encendido]), [["asimov", H.x, H.z, HABLAR_M, false]]);
  // the walls are never «in reach»: standing next to one offers nothing
  assert.deepEqual(a.s.features.reachable(SALON.x - SALON.lado / 2, SALON.z, 0).filter((r) => r.feature === "ancestros"), []);
});

test("coming near lights the hologram for everyone and tells only who came; going away puts it out (with hysteresis)", () => {
  const { pages: [a, b], pump, place, log } = mundo(2);
  pump(3);
  place(a.s.entity, H.x, H.z + 30); place(b.s.entity, H.x, H.z + 30); pump(6);
  assert.equal(a.a.hologramas()[0].encendido, false);
  place(a.s.entity, H.x, H.z + DESPIERTA_M - 1); pump(6);
  assert.equal(a.a.hologramas()[0].encendido, true, "a is near: lit");
  assert.equal(b.a.hologramas()[0].encendido, true, "b sees it lit too (shared state)");
  assert.equal(a.a.despierto(), "asimov"); assert.equal(b.a.despierto(), "", "only who came is told");
  assert.ok(a.s.features.announcements.some((x) => x.feature === "ancestros" && x.event === "despierta" && /se enciende al notarte/.test(x.text)));
  place(a.s.entity, H.x, H.z + DUERME_M - 0.5); pump(6);
  assert.equal(a.a.hologramas()[0].encendido, true, "past DESPIERTA_M but inside DUERME_M: still lit");
  place(a.s.entity, H.x, H.z + DUERME_M + 1); pump(6);
  assert.equal(a.a.hologramas()[0].encendido, false, "beyond DUERME_M: out");
  place(a.s.entity, H.x, H.z + 2); pump(6);
  assert.equal(a.s.features.announcements.filter((x) => x.event === "despierta").length, 2, "told again when coming back");
  assert.ok(log.some((l) => /Salón de los Ancestros con 1 holograma/.test(l)));
});

test("hablar: the Three Laws in turn with one of our rules beside each, heard by who asked and who is near; refused from afar", () => {
  const { pages: [a, b, lejos], pump, place } = mundo(3);
  pump(3);
  place(a.s.entity, H.x, H.z + 2); place(b.s.entity, H.x + 6, H.z + 6); place(lejos.s.entity, H.x, H.z + CERCA_M + 10); pump(6);
  const cerca = a.s.features.reachable(H.x, H.z + 2, 0).find((r) => r.feature === "ancestros");
  assert.equal(cerca?.prompt, "hablar con Holograma de Asimov");
  assert.ok(a.s.features.use("ancestros", "asimov").ok); pump(3);
  const d1 = a.a.ultimo()!;
  assert.deepEqual([d1.pnj, d1.ley, d1.texto, d1.regla, d1.nuestra, d1.mia], ["asimov", 1, LEYES[0], NUESTRAS[0].id, NUESTRAS[0].texto, true]);
  assert.deepEqual([b.a.ultimo()?.ley, b.a.ultimo()?.mia], [1, false], "who is within CERCA_M hears the same law");
  assert.equal(lejos.a.ultimo(), null, "out of CERCA_M nobody is told");
  assert.ok(a.s.features.announcements.some((x) => x.event === "dice" && x.text.startsWith(LEYES[0]) && x.text.includes(NUESTRAS[0].id) && x.at?.x === H.x));
  assert.ok(a.a.hablar("asimov").ok); pump(3);
  assert.deepEqual([a.a.ultimo()!.ley, a.a.ultimo()!.regla], [2, NUESTRAS[1].id]);
  pump(25); // the rate limit: 1/s with a burst of 2 — wait before the third
  assert.ok(a.a.hablar("asimov").ok); pump(3);
  assert.equal(a.a.ultimo()!.ley, 3);
  pump(25);
  assert.ok(a.a.hablar("asimov").ok); pump(3);
  assert.deepEqual([a.a.ultimo()!.ley, a.a.ultimo()!.texto, a.a.ultimo()!.regla], [1, LEYES[0], NUESTRAS[3].id], "after the third law, the first again; our four rules rotate on their own");
  // b is 8,5 m away (reach 3 + 1,5 of slack): refused with the reason; nobody else hears anything
  const antes = a.a.ultimo()!.cuando;
  assert.ok(b.a.hablar("asimov").ok); pump(3);
  assert.match(b.a.aviso(), /Acércate a Holograma de Asimov/);
  assert.equal(a.a.ultimo()!.cuando, antes);
  assert.ok(b.a.hablar("nadie").ok); pump(3);
  assert.match(b.a.aviso(), /No hay ningún holograma «nadie»/);
});

test("the texts carry the homage's notice and never a recording: the page and an agent read the same", () => {
  const t = crearCliente().ancestros.textos;
  assert.equal(t.leyes, LEYES); assert.equal(t.nuestras, NUESTRAS);
  assert.match(t.aviso, /Dramatización/); assert.match(t.aviso, /No es una grabación/);
  assert.match(t.lema, /80 años después/);
  assert.ok(LEYES.every((l) => new TextEncoder().encode(l).length <= 320), "each law fits the event's text field");
});

test("the simulation never sees the hall: same hash with the feature and without it", () => {
  const con = mundo(2), sin = mundo(2, []);
  for (const w of [con, sin]) { w.pump(3); w.place(0, 5, 5); w.place(1, -5, 5); w.pump(20); }
  assert.equal(stateHash(con.inst.sim), stateHash(sin.inst.sim));
});

test("3D: the hall is drawn from state, a lit hologram turns to you and flickers only within VIVO_M, the panels are painted once", async () => {
  // a tiny `document` so canvases paint without a browser (the texts land on a 2D context that records nothing)
  const g = new Proxy({}, { get: (_, k) => (k === "measureText" ? () => ({ width: 10 }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  const antes = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = doc;
  try {
    const THREE = await import("three/webgpu");
    const { crearSalon, VIVO_M, LUZ_SALA, LUZ_M, TECHO_GROSOR } = await import("../packages/render/src/ancestros.ts");
    const world = new THREE.Group(), cam = new THREE.PerspectiveCamera();
    const s = crearSalon({ world, camara: () => cam });
    const muros = murosDelSalon().map((m) => ({ id: m.id, x0: m.x0, y0: 0, z0: m.z0, x1: m.x1, y1: SALON.alto, z1: m.z1 }));
    s.muros(muros);
    const holo = { id: "asimov", nombre: "Holograma de Asimov", x: H.x, y: 0, z: H.z, rumbo: 0, encendido: false };
    s.hologramas([holo]);
    s.paneles([{ id: "a-leyes", titulo: "Leyes", lineas: [...LEYES], x: 0, y: 2, z: -50, rumbo: 0 }, { id: "a-nuestras", titulo: "Nuestras", lineas: NUESTRAS.map((n) => n.texto), x: 2, y: 2, z: -50, rumbo: 0 }]);
    assert.deepEqual(s.contar(), { muros: 5, techo: true, luz: true, hologramas: 1, paneles: 2, encendidos: 0, placas: 0 });
    assert.equal(world.children.length, 1 + 1 + 1 + 1 + 1 + 2, "ONE wall mesh (5 walls, same stone), floor, ceiling, light, hologram, two panels");
    // MIS-200 t_7ed19d06: fewer pieces. The five walls are one mesh (the same boxes), the hologram three: pedestal, translucent body, wireframe head
    const paredes = world.getObjectByName("ancestros:muros") as import("three/webgpu").Mesh;
    assert.ok(paredes && (paredes as { isMesh?: boolean }).isMesh);
    paredes.geometry.computeBoundingBox();
    const bb = paredes.geometry.boundingBox!;
    assert.ok(bb.min.x <= Math.min(...muros.map((m) => m.x0)) + 1e-6 && bb.max.x >= Math.max(...muros.map((m) => m.x1)) - 1e-6, "the merged walls cover the same footprint");
    assert.ok(Math.abs(bb.max.y - SALON.alto) < 1e-6, "and the same height");
    assert.equal(paredes.userData.mapa, true, "still on the top-down map");
    const holoGrupo = world.getObjectByName("ancestros:asimov")!;
    assert.equal(holoGrupo.children.filter((o) => (o as { isMesh?: boolean }).isMesh).length, 3, "pedestal, translucent body, wireframe head");
    const cuerpo = holoGrupo.getObjectByName("holograma-cuerpo") as import("three/webgpu").Mesh;
    assert.equal((cuerpo.material as { vertexColors?: boolean }).vertexColors, true, "the cone's weaker glow lives in the vertices");
    s.hologramas([{ ...holo, encendido: true }]);
    const op = (cuerpo.material as { opacity: number }).opacity;
    assert.ok(op > 0.2 && op <= 0.32, `lit body opacity ${op}`);
    s.hologramas([holo]);
    // MIS-228: ONE slab over the walls (one draw call), above their top, not on the top-down map; ONE dim cyan point light inside under it
    const techo = world.getObjectByName("ancestros:techo") as import("three/webgpu").Mesh, luz = world.getObjectByName("ancestros:luz") as import("three/webgpu").PointLight;
    assert.ok(techo && luz);
    assert.equal(world.children.filter((o) => (o as { isMesh?: boolean }).isMesh && o.name === "ancestros:techo").length, 1);
    techo.geometry.computeBoundingBox();
    const caja = techo.geometry.boundingBox!;
    assert.ok(Math.abs((caja.max.y - caja.min.y) - TECHO_GROSOR) < 1e-6);
    assert.ok(Math.abs(techo.position.y - (SALON.alto + TECHO_GROSOR / 2)) < 1e-6, "sits on top of the walls");
    assert.ok(caja.max.x - caja.min.x >= SALON.lado && caja.max.z - caja.min.z >= SALON.lado, "covers the hall");
    assert.equal(techo.userData.mapa, undefined, "a lid on the map would hide the room");
    assert.equal(luz.color.getHex(), LUZ_SALA.color); assert.equal(luz.castShadow, false);
    assert.ok(luz.intensity > 0 && luz.intensity <= 8, `dim: ${luz.intensity}`);
    assert.ok(luz.position.y < SALON.alto && luz.position.y > 0, "inside the room");
    // the light costs nothing far from the hall, and comes back near it
    s.actualizar(0.016, { x: SALON.x + LUZ_M + 10, z: SALON.z }); assert.equal(luz.intensity, 0);
    s.actualizar(0.016, { x: SALON.x, z: SALON.z + 8 }); assert.equal(luz.intensity, LUZ_SALA.intensidad);
    // the roof is a lid only from outside: inside the hall with the camera above it, it lifts; camera under it or you outside, it stays
    const dentro = { x: SALON.x, z: SALON.z };
    cam.position.set(0, 20, SALON.z); cam.updateMatrixWorld(true); s.actualizar(0.016, dentro); assert.equal(techo.visible, false, "inside, camera above: lifted");
    s.actualizar(0.016, { x: SALON.x + 30, z: SALON.z }); assert.equal(techo.visible, true, "you outside, camera above: the hall reads as closed");
    cam.position.set(0, 1.7, SALON.z); cam.updateMatrixWorld(true); s.actualizar(0.016, dentro); assert.equal(techo.visible, true, "inside, camera under the roof: shown (it shades the room)");
    const nPanel = world.children.length;
    s.paneles([{ id: "a-leyes", titulo: "Leyes", lineas: [...LEYES], x: 0, y: 2, z: -50, rumbo: 0 }, { id: "a-nuestras", titulo: "Nuestras", lineas: NUESTRAS.map((n) => n.texto), x: 2, y: 2, z: -50, rumbo: 0 }]);
    assert.equal(world.children.length, nPanel, "same panels again: nothing repainted");
    // asleep: does not turn, costs nothing
    s.actualizar(0.5, { x: H.x + 5, z: H.z });
    assert.equal(s.rumboDe("asimov"), 0); assert.equal(s.ocupado({ x: H.x + 5, z: H.z }), false);
    // lit, you at the east: it turns towards +x (yaw → 90°) over a few frames
    s.hologramas([{ ...holo, encendido: true }]);
    assert.equal(s.ocupado({ x: H.x + 5, z: H.z }), true);
    for (let i = 0; i < 60; i++) s.actualizar(1 / 60, { x: H.x + 5, z: H.z });
    assert.ok(Math.abs(s.rumboDe("asimov")! - 90) < 2, `turned to you: ${s.rumboDe("asimov")}`);
    // lit but you far beyond VIVO_M: still, free
    s.hologramas([{ ...holo, encendido: true, rumbo: 0 }]);
    const lejos = { x: H.x + VIVO_M + 5, z: H.z };
    assert.equal(s.ocupado(lejos), false);
    const r0 = s.rumboDe("asimov")!; s.actualizar(0.5, lejos); assert.equal(s.rumboDe("asimov"), r0);
    // it speaks: a plate for a while, then gone on its own
    s.dice("asimov", LEYES[0], 10);
    assert.equal(s.contar().placas, 1); assert.equal(s.ocupado(lejos), true);
    await new Promise((r) => setTimeout(r, 20)); s.actualizar(0.016, lejos);
    assert.equal(s.contar().placas, 0);
    // the hologram leaves the page's range: everything of it goes
    s.hologramas([]); s.muros([]); s.paneles([]);
    assert.deepEqual(s.contar(), { muros: 0, techo: false, luz: false, hologramas: 0, paneles: 0, encendidos: 0, placas: 0 });
    assert.equal(world.children.length, 0, "roof and light go with the walls");
  } finally { (globalThis as { document?: unknown }).document = antes; }
});

test("3D: the hall's light follows the device tier (none on tier D, the roof stays), and a tier change adds/removes it without touching the rest", async () => {
  const g = new Proxy({}, { get: (_, k) => (k === "measureText" ? () => ({ width: 10 }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  const antes = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  try {
    const THREE = await import("three/webgpu");
    const { crearSalon } = await import("../packages/render/src/ancestros.ts");
    const world = new THREE.Group(), cam = new THREE.PerspectiveCamera();
    let quiere = false;
    const s = crearSalon({ world, camara: () => cam, luz: () => quiere });
    s.muros(murosDelSalon().map((m) => ({ id: m.id, x0: m.x0, y0: 0, z0: m.z0, x1: m.x1, y1: SALON.alto, z1: m.z1 })));
    assert.deepEqual([s.contar().techo, s.contar().luz], [true, false], "tier D: a roof, no extra light");
    const n = world.children.length;
    quiere = true; s.actualizar(0.016, null);
    assert.equal(s.contar().luz, true); assert.equal(world.children.length, n + 1);
    s.actualizar(0.016, null); assert.equal(world.children.length, n + 1, "not twice");
    quiere = false; s.actualizar(0.016, null);
    assert.equal(s.contar().luz, false); assert.equal(world.children.length, n);
    s.muros([]); assert.equal(world.children.length, 0);
  } finally { (globalThis as { document?: unknown }).document = antes; }
});

// ---- the lienzo (work/plantillas/lienzo): a blank world must be able to leave the house hall out ----
test("MUNDO_DIR: ancestros.json with empty lists puts no hall and no hologram (a blank world); no file keeps the house's; a wrong shape says why", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { leerMundo } = await import("../packages/server/src/mundo.ts");
  const { conMundo } = await import("../features/mundo.ts");
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-ancestros-"));
  writeFileSync(join(dir, "ancestros.json"), JSON.stringify({ schema: "numinia-engine/ancestros@1", hologramas: [], muros: [] }));
  const partes = conMundo(funciones, leerMundo(dir, () => {}), () => {});
  const vacio = mundo(1, [partes.find((p) => p.feature.id === "ancestros")!]);
  vacio.pump(2);
  assert.equal(solidsFrom(vacio.inst.features.allState()).length, 0, "no walls");
  assert.equal(vacio.pages[0].a.hologramas().length, 0, "no hologram");
  assert.equal(vacio.pages[0].a.muros().length, 0);
  // the simulation footprint is the same as a world with no feature at all
  const sinNada = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [] });
  const sinNadaT = sinNada.join(0); sinNadaT.flush(); for (let i = 0; i < 2; i++) { sinNada.tick(); sinNadaT.flush(); }
  assert.equal(vacio.inst.hash(), sinNada.hash());
  // no file: the house hall, untouched
  const casa = conMundo(funciones, leerMundo(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-ancestros-casa-")), () => {}), () => {});
  assert.equal(casa.find((p) => p.feature.id === "ancestros"), funciones.find((p) => p.feature.id === "ancestros"));
  // valid JSON, wrong shape: said, house hall kept
  const mal = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-ancestros-mal-"));
  writeFileSync(join(mal, "ancestros.json"), JSON.stringify({ salon: "no" }));
  const log: string[] = [];
  const partesMal = conMundo(funciones, leerMundo(mal, (l) => log.push(l)), (l) => log.push(l));
  assert.match(log.join(" "), /ancestros\.json no tiene ninguna lista/);
  assert.equal(partesMal.find((p) => p.feature.id === "ancestros"), funciones.find((p) => p.feature.id === "ancestros"));
});
