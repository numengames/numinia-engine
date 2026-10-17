// Vertical worlds (the Alchemists' Tower): where people appear (entorno@1 `aparicion`), people and things with a height
// (pnj@1 / cosa@1 `posicion.y`), reach that minds the height (`api.within`, the page's `reachable`, ALCANCE_ALTURA_M)
// and `llega_a` steps with a `y`. Every format only grows: files written without these keys load as before, and a
// world without `aparicion` spawns exactly as before (the reference fingerprint is pinned in engine.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, SPAWN_RADIO_M } from "../packages/sim/src/index.ts";
import { ALCANCE_ALTURA_M, alAlcanceEnAltura, buildCatalog } from "../packages/feature/src/index.ts";
import type { PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerMundo } from "../packages/server/src/mundo.ts";
import { aparicionDelMundo } from "../features/mundo.ts";
import { ESQUEMA, leerAparicion, validarEntorno } from "../features/entorno/esquema.ts";
import { baseDelMundo } from "../features/entorno/server.ts";
import { cargarAventura, leerMision, leerPnj } from "../features/misiones/formato.ts";
import { aceptar, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import { pnj, misiones } from "../features/misiones/feature.ts";
import { crearMisiones, LLEGADA_CADA } from "../features/misiones/server.ts";
import { ALTO_NOMBRE, crearCliente } from "../features/misiones/client.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const AREA = { x: 100, z: -100, radio: 5 };
const dentro = (v: number, c: number, r: number) => v >= c - r && v <= c + r;

// ---------- 1. where people appear ----------

test("entorno@1 aparicion: optional, checked with its path; a world without it spawns bit for bit as before", () => {
  assert.deepEqual(leerAparicion({ schema: ESQUEMA }), { ok: true, value: null }, "absent = the house square");
  assert.deepEqual(leerAparicion(undefined), { ok: true, value: null });
  assert.deepEqual(leerAparicion({ aparicion: { x: 3, z: -9, radio: 6 } }), { ok: true, value: { x: 3, z: -9, radio: 6 } });
  const malos = [leerAparicion({ aparicion: { x: 0, z: 0, radio: 0.5 } }), leerAparicion({ aparicion: { x: 0, z: 0, radio: 41 } }), leerAparicion({ aparicion: { x: 500, z: 0, radio: 1 } }), leerAparicion({ aparicion: { x: 0, radio: 2 } }), leerAparicion({ aparicion: 7 })];
  assert.deepEqual(malos.map((r) => (r.ok ? "ok" : r.issues[0].path)), ["entorno.aparicion.radio", "entorno.aparicion.radio", "entorno.aparicion.x", "entorno.aparicion.z", "entorno.aparicion"]);
  // the whole file's check sees it too (one log line says where), and it never enters the flat state
  const r = validarEntorno({ schema: ESQUEMA, preset: "noche", aparicion: { x: 3, z: -9, radio: 6 } });
  assert.ok(r.ok && r.value.preset === "noche" && !("aparicion" in r.value));
  const mal = validarEntorno({ schema: ESQUEMA, aparicion: { x: 0, z: 0, radio: 99 } });
  assert.ok(!mal.ok && mal.issues.some((i) => i.path === "entorno.aparicion.radio"));
  const log: string[] = [];
  assert.equal(baseDelMundo({ aparicion: { x: 0, z: 0, radio: 99 } }, (l) => log.push(l)).preset, baseDelMundo(undefined).preset);
  assert.match(log.join(" "), /aparicion\.radio/);
  // from the world folder: the value, or null and a line that says why
  const dir = tmp("aparicion-");
  writeFileSync(join(dir, "entorno.json"), JSON.stringify({ schema: ESQUEMA, preset: "atardecer", aparicion: AREA }));
  assert.deepEqual(aparicionDelMundo(leerMundo(dir)), AREA);
  const dir2 = tmp("aparicion-mal-"), log2: string[] = [];
  writeFileSync(join(dir2, "entorno.json"), JSON.stringify({ schema: ESQUEMA, aparicion: { x: 0, z: 0 } }));
  assert.equal(aparicionDelMundo(leerMundo(dir2), (l) => log2.push(l)), null);
  assert.match(log2.join(" "), /aparicion\.radio/);
  assert.equal(aparicionDelMundo(leerMundo(tmp("sin-entorno-"))), null, "no file = the house square, no noise");
  // the sim: no area, null and the house square spelled out give the same draws (so the pinned fingerprint stands)
  const pos = (area?: { x: number; z: number; radio: number } | null) => { const s = createSim(4, 42); const e = spawnAvatar(s, 0, area); return [s.tf.cols.x[e], s.tf.cols.y[e], s.tf.cols.z[e], s.rng[0]]; };
  assert.deepEqual(pos(), pos(null));
  assert.deepEqual(pos(), pos({ x: 0, z: 0, radio: SPAWN_RADIO_M }));
  assert.notDeepEqual(pos(), pos(AREA));
  assert.equal(pos(AREA)[3], pos()[3], "an area costs the same two RNG draws");
});

test("a world whose entorno declares aparicion spawns everyone inside its square and never outside; absent = ±40 m", () => {
  const con = new Instance({ seed: 1, capacity: 64, k: 50, snapshotEvery: 2, aparicion: AREA });
  const sin = new Instance({ seed: 1, capacity: 64, k: 50, snapshotEvery: 2 });
  for (let i = 0; i < 40; i++) {
    const t = con.join(i), e = con.conns[i].entity;
    const s = new ClientSession(t); t.flush();
    const x = fxToFloat(con.sim.tf.cols.x[e]), z = fxToFloat(con.sim.tf.cols.z[e]);
    assert.ok(dentro(x, AREA.x, AREA.radio) && dentro(z, AREA.z, AREA.radio), `(${x}, ${z}) inside the 10 m square at (100, -100)`);
    assert.equal(con.sim.tf.cols.y[e], 0, "standing on the flat ground");
    const p = s.selfPosition(1);
    assert.ok(dentro(p.x, AREA.x, AREA.radio) && dentro(p.z, AREA.z, AREA.radio), "the welcome puts the page there too");
    sin.join(i);
    const e2 = sin.conns[i].entity, x2 = fxToFloat(sin.sim.tf.cols.x[e2]), z2 = fxToFloat(sin.sim.tf.cols.z[e2]);
    assert.ok(dentro(x2, 0, SPAWN_RADIO_M) && dentro(z2, 0, SPAWN_RADIO_M), "without an area: the house square");
  }
  const xs = con.conns.map((c) => con.sim.tf.cols.x[c.entity]);
  assert.ok(new Set(xs).size > 20, "random spots, not one point");
});

test("startServer passes the world's spawn area to the instance and says so", async () => {
  const lines: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", sesiones: null, version: "prueba", aparicion: AREA, log: (l) => lines.push(l) });
  try {
    assert.deepEqual(srv.inst.opts.aparicion, AREA);
    assert.ok(lines.some((l) => l.includes("la gente aparece en el cuadrado de 10 m centrado en (100, -100)")), lines.join("\n"));
    srv.inst.join(0);
    const e = srv.inst.conns[0].entity, x = fxToFloat(srv.inst.sim.tf.cols.x[e]), z = fxToFloat(srv.inst.sim.tf.cols.z[e]);
    assert.ok(dentro(x, AREA.x, AREA.radio) && dentro(z, AREA.z, AREA.radio));
  } finally { await srv.close(); }
});

// ---------- 2 and 3. people and things with a height; reach that minds it ----------

/** A two-floor tower: Iria on the ground, the Supervisora on the crown (y 12) with a thing at hand; a quest that climbs. */
const TORRE = {
  pnj: [
    { fichero: "pnj/iria.json", texto: JSON.stringify({ formato: "pnj@1", id: "iria", nombre: "Iria", posicion: { x: -4, z: 20 }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Sube.", opciones: [{ texto: "Acepto.", accion: { tipo: "dar_mision", mision: "subir" } }, { texto: "Adiós.", accion: { tipo: "despedir" } }] } } } }) },
    { fichero: "pnj/supervisora.json", texto: JSON.stringify({ formato: "pnj@1", id: "supervisora", nombre: "La Supervisora", posicion: { x: 3, z: 9, y: 12 }, apariencia: { escala: 1 }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Arriba.", opciones: [{ texto: "Adiós.", accion: { tipo: "despedir" } }] } } } }) },
  ],
  cosas: [{ fichero: "cosas/sello.json", texto: JSON.stringify({ formato: "cosa@1", id: "sello", nombre: "Sello", posicion: { x: -2, z: -12, y: 13 }, radio: 2, aviso: "pulsar el sello" }) }],
  misiones: [{ fichero: "misiones/subir.json", texto: JSON.stringify({ formato: "mision@1", id: "subir", titulo: "Subir", descripcion: "A la corona.", pasos: [
    { id: "corona", tipo: "llega_a", texto: "Sube a la corona", x: 0, z: -8, y: 12, radio: 4, lugar: "Corona" },
    { id: "sello", tipo: "usa", texto: "Pulsa el sello", cosa: "sello" },
    { id: "pie", tipo: "llega_a", texto: "Baja al pie", x: 20, z: 20, radio: 4, lugar: "Pie" },
  ] }) }],
};

function torre() {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: TORRE }), log: (l) => log.push(l) });
  const t = inst.join(0), cli = crearCliente(), drawn = new Map<string, PlacedObject>(), tags = new Map<string, { text: string; y: number }>();
  const s = new ClientSession(t, { features: cli.parts, view: { label() {}, bounce() {}, place: (key, o) => { if (o) drawn.set(key, o); else drawn.delete(key); }, tag: (key, x) => { if (x) tags.set(key, { text: x.text, y: x.y }); else tags.delete(key); } } });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { t.flush(); inst.tick(); t.flush(); } };
  const place = (x: number, z: number, y = 0) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); inst.sim.tf.cols.y[s.entity] = fx(y); };
  pump(3);
  return { inst, s, m: cli.misiones, drawn, tags, pump, place, log };
}

test("formats: pnj@1 posicion.y (0-30) and llega_a y (0-30) are optional and checked; unknown-field lists name y", () => {
  const r = cargarAventura(TORRE);
  assert.deepEqual(r.issues, []);
  assert.equal(r.aventura.pnjs.get("supervisora")!.posicion.y, 12);
  assert.equal(r.aventura.pnjs.get("iria")!.posicion.y, 0, "absent = the ground, as before");
  assert.equal(r.aventura.cosas.get("sello")!.posicion.y, 13);
  const pasos = r.aventura.misiones.get("subir")!.pasos;
  assert.equal(pasos[0].tipo === "llega_a" && pasos[0].y, 12);
  assert.ok(pasos[2].tipo === "llega_a" && pasos[2].y === undefined, "a step without y is reached from any height");
  const base = { formato: "pnj@1", id: "p", nombre: "P", dialogo: { entradas: [{ nodo: "h" }], nodos: { h: { texto: "Hola", opciones: [] } } } };
  const alto = leerPnj({ ...base, posicion: { x: 0, z: 0, y: 40 } });
  assert.ok(!alto.ok && alto.issues.some((i) => i.path === "posicion.y" && /0 y 30/.test(i.message)));
  const raro = leerPnj({ ...base, posicion: { x: 0, z: 0, altura: 2 } });
  assert.ok(!raro.ok && raro.issues.some((i) => i.path === "posicion.altura" && /aquí van: x, z, y\)/.test(i.message)), JSON.stringify(!raro.ok && raro.issues));
  const m = (paso: Record<string, unknown>) => leerMision({ formato: "mision@1", id: "m", titulo: "M", descripcion: "d", pasos: [{ id: "a", tipo: "llega_a", texto: "t", x: 0, z: 0, lugar: "L", ...paso }] });
  assert.ok(m({ y: 12 }).ok);
  const fuera = m({ y: -1 });
  assert.ok(!fuera.ok && fuera.issues.some((i) => i.path === "pasos[0].y"));
  const desconocido = m({ altura: 12 });
  assert.ok(!desconocido.ok && desconocido.issues.some((i) => i.path === "pasos[0].altura" && /aquí van: id, tipo, texto, x, z, radio, lugar, y, grupo\)/.test(i.message)), JSON.stringify(!desconocido.ok && desconocido.issues));
  // the declarations grew: pnj v2 carries y (0-30), misiones v2 lets a thing stand on an upper floor (v3: U14's grupo / recibe)
  assert.deepEqual([pnj.issues, misiones.issues], [[], []]);
  const cat = buildCatalog([pnj, misiones]).catalog;
  assert.deepEqual(cat.features.map((f) => [f.id, f.version, (f.state!.fields.y as { max: number }).max]), [["pnj", 2, 30], ["misiones", 3, 30]]);
});

test("a pnj with posicion.y reaches the page with y and is drawn at that height, its name above its head", () => {
  const W = torre();
  W.place(3, 9, 12); W.pump(12);
  assert.equal(W.s.features.stateOf("pnj").get("supervisora")?.y, 12);
  assert.equal(W.s.features.stateOf("pnj").get("iria")?.y, 0);
  assert.equal(W.drawn.get("pnj:supervisora")?.y, 12);
  assert.equal(W.tags.get("pnj:supervisora")?.y, 12 + ALTO_NOMBRE);
  assert.equal(W.drawn.get("misiones:sello")?.y, 13, "a thing on the crown");
});

test("reach minds the height: within true at the same height, false 5 m above; the page's prompt likewise", () => {
  assert.equal(alAlcanceEnAltura(12, 12), true);
  assert.equal(alAlcanceEnAltura(12 + ALCANCE_ALTURA_M, 12), true);
  assert.equal(alAlcanceEnAltura(17, 12), false);
  assert.equal(alAlcanceEnAltura(5, undefined), true, "a thing without y is in reach at any height");
  assert.equal(alAlcanceEnAltura(undefined, 0), true, "a player of unknown height stands on the ground");
  assert.equal(alAlcanceEnAltura(undefined, 12), false);
  const W = torre();
  // from the vestibule floor, right under her: the page offers nothing and the server refuses
  W.place(3, 9, 0); W.pump(12);
  assert.deepEqual(W.s.features.reachable(3, 9, 0), []);
  assert.equal(W.s.features.reachable(3, 9)[0]?.key, "supervisora", "without a height the page lists as before");
  W.s.features.use("pnj", "supervisora"); W.pump(2);
  assert.match(W.s.features.announcements.at(-1)?.text ?? "", /Acércate a La Supervisora/);
  assert.equal(W.m.dialogo(), null);
  // on the crown: in reach; 5 m above her: not
  W.place(3, 9, 12); W.pump(2);
  assert.equal(W.s.features.reachable(3, 9, 12)[0]?.prompt, "hablar con La Supervisora");
  W.s.features.use("pnj", "supervisora"); W.pump(2);
  assert.equal(W.m.dialogo()?.nombre, "La Supervisora");
  W.m.adios(); W.pump(2);
  W.place(3, 9, 17); W.pump(2);
  assert.deepEqual(W.s.features.reachable(3, 9, 17), []);
  W.s.features.use("pnj", "supervisora"); W.pump(2);
  assert.equal(W.m.dialogo(), null);
  // a person on the ground, from the ground: as before
  W.place(-4, 20, 0); W.pump(12);
  assert.equal(W.s.features.reachable(-4, 20, 0)[0]?.key, "iria");
});

test("llega_a with y: the arrival needs the right floor (±2.5 m); without y, any height", () => {
  const A = cargarAventura(TORRE).aventura, p = nuevoProgreso();
  assert.deepEqual(aceptar(p, A.misiones.get("subir")!, A), { ok: true });
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 0, z: -8, y: 0 }), [], "under the crown, on the ground floor");
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 0, z: -8 }), [], "a caller without heights stands on the ground");
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 0, z: -8, y: 14.6 }), []);
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 0, z: -8, y: 14.4 }), [{ mision: "subir", paso: 0, completada: false }]);
  assert.deepEqual(registrar(p, A, { tipo: "usa", cosa: "sello" }), [{ mision: "subir", paso: 1, completada: false }]);
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 20, z: 20, y: 12 }), [{ mision: "subir", paso: 2, completada: true }], "a step without y completes from any height");
  // through the plug: the server reads the player's height every LLEGADA_CADA ticks
  const W = torre();
  W.place(-4, 20, 0); W.pump(12);
  W.m.hablar("iria"); W.pump(2);
  W.m.elegir(1); W.pump(2);
  assert.deepEqual(W.m.libro().map((m) => [m.id, m.paso]), [["subir", 0]]);
  W.place(0, -8, 0); W.pump(LLEGADA_CADA * 2 + 1);
  assert.equal(W.m.libro()[0].paso, 0, "standing under the crown does not count");
  W.place(0, -8, 12); W.pump(LLEGADA_CADA * 2 + 1);
  assert.equal(W.m.libro()[0].paso, 1);
  assert.ok(W.s.features.announcements.some((x) => x.text === "Hecho: Sube a la corona"));
});
