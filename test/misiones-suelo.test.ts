// Lote 5 · «nadie enterrado en el suelo de la plaza», backward compatible: `posicion.y` of a person (pnj@1) and a thing (cosa@1) stays ABSOLUTE
// (a tower floor, a balcony: every world written so far). With relieve (the nature or the espacio base) the page draws them at the `y` the state
// gives and `api.within` compares the player's feet with it, so one that would stand BELOW the ground at its x,z, or gave no `y`, is put ON the
// ground (y = ground); one above the ground never moves. Over the real plug (server + page):
//  - flat world: the state's y is posicion.y, as always;
//  - nature on: y omitted or under the hill → the hill's height; y above the hill → exactly as written; a player on the hill can talk to the person;
//  - the nature switched off while running and on again: the snapped ones follow the ground, the absolute ones do not;
//  - a sequence's keys obey the same rule (pure: eventosDe), also over a ground below 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";
import { alSuelo, eventosDe } from "../features/misiones/secuencia.ts";
import { cargarAventura } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { alturaEn } from "../packages/relieve/src/relieve.ts";
import { fx } from "../packages/core/src/index.ts";

const SEMILLA = 1234;
const nat = (x: number, z: number) => alturaEn(SEMILLA, x, z, { tamano: 200, plaza: 12, sinEstanque: false });
/** A point on the 4 m lattice where the nature is higher than `min` m (a hill: beyond ALCANCE_ALTURA_M of the flat ground). */
function colina(min: number): [number, number] {
  for (let x = -90; x <= 90; x += 4) for (let z = -90; z <= 90; z += 4) if (nat(x, z) > min) return [x, z];
  throw new Error("no hill");
}
const [HX, HZ] = colina(4);

const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const PNJ = { formato: "pnj@1", id: "pietro", nombre: "Pietro", posicion: { x: HX, z: HZ }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Hola.", opciones: [adios] } } } }; // no y
const PNJ_BAJO = { ...PNJ, id: "bajo", nombre: "Bajo", posicion: { x: HX, z: HZ - 4, y: 1 } };                 // y 1 under the hill (checked below)
const PNJ_TORRE = { ...PNJ, id: "torre", nombre: "Torre", posicion: { x: HX, z: HZ + 6, y: 30 } };       // a tower floor: above any ground of the fixture
const COSA = { formato: "cosa@1", id: "caja", nombre: "Caja", posicion: { x: HX, z: HZ + 3, y: 0.5 }, aviso: "usar caja" };
const ENCIMA = Math.min(30, Math.ceil(nat(HX + 4, HZ)) + 1);                                              // a table 1+ m over the hill, written as an absolute height
const COSA_ENCIMA = { ...COSA, id: "estante", nombre: "Estante", posicion: { x: HX + 4, z: HZ, y: ENCIMA } };
const doc = (dir: string, x: { id: string }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const aventura = () => ({ misiones: [], pnj: [doc("pnj", PNJ), doc("pnj", PNJ_BAJO), doc("pnj", PNJ_TORRE)], cosas: [doc("cosas", COSA), doc("cosas", COSA_ENCIMA)] });

function mundo(conNaturaleza: boolean) {
  const ficheros = new Map<string, unknown>(conNaturaleza ? [["naturaleza.json", { activa: true, semilla: SEMILLA }]] : []);
  const base = conMundo(funciones, ((f: string) => ficheros.get(f)) as never, () => {}, (f, d) => { ficheros.set(f, d); });
  const partes = [...base.filter((p) => p.feature.id !== "pnj" && p.feature.id !== "misiones"), ...crearMisiones({ aventura: aventura() })];
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, log: () => {}, puede: (_w, a) => a === "construir" });
  const t = inst.join(0), cli = crearCliente();
  const s = new ClientSession(t, { features: [...clientesSinMisiones(), ...cli.parts], view: new Proxy({}, { get: () => () => {} }) as never });
  const pump = (n = 1) => { for (let k = 0; k < n; k++) { t.flush(); s.tick(0, 0, 0); t.flush(); inst.tick(); t.flush(); } };
  pump(4);
  const estado = (id: string) => [...inst.features.allState()].find(([k]) => k.endsWith(`:${id}`))?.[1] as Record<string, number> | undefined;
  return { inst, s, pump, estado, m: cli.misiones };
}
import clientes from "../features/cliente.ts";
function clientesSinMisiones() { return clientes.filter((p) => p.feature.id !== "pnj" && p.feature.id !== "misiones"); }

const cerca = (a: number, b: number) => Math.abs(a - b) < 0.01;

test("flat world: a person and a thing keep y = posicion.y (nothing changes without relieve)", () => {
  const w = mundo(false);
  assert.equal(w.estado("pietro")?.y, 0);
  assert.equal(w.estado("bajo")?.y, 1);
  assert.equal(w.estado("torre")?.y, 30);
  assert.equal(w.estado("caja")?.y, 0.5);
  assert.equal(w.estado("estante")?.y, ENCIMA);
});

test("nature on: y omitted or under the hill → on the hill; y above the hill → exactly as written; a player on that hill can talk to the person", () => {
  const w = mundo(true);
  const h = nat(HX, HZ);
  assert.ok(h > 4 && nat(HX, HZ - 4) > 1 && nat(HX, HZ + 3) > 0.5, `the fixture is a real hill (${h})`);
  assert.ok(cerca(w.estado("pietro")!.y, h), `no y → ground: y=${w.estado("pietro")?.y} ground=${h}`);
  assert.ok(cerca(w.estado("bajo")!.y, nat(HX, HZ - 4)), "y 1 under the hill → on the hill");
  assert.ok(cerca(w.estado("caja")!.y, nat(HX, HZ + 3)), "a thing under the hill too");
  assert.equal(w.estado("torre")?.y, 30, "a tower floor above the ground does not move");
  assert.equal(w.estado("estante")?.y, ENCIMA, "an absolute height over the hill does not move (no ground added)");
  // the player stands beside Pietro on the hill: within reach (before, y 0 vs a hill over 4 m: out of the 2.5 m height reach)
  const e = w.s.entity, c = w.inst.sim.tf.cols;
  c.x[e] = fx(HX + 1); c.z[e] = fx(HZ); c.y[e] = fx(nat(HX + 1, HZ)); w.inst.sim.mo.cols.vy[e] = 0;
  w.pump(6);
  w.m.hablar("pietro"); w.pump(3);
  assert.equal(w.m.dialogo()?.pnj, "pietro", `the conversation opens (rechazo: ${w.m.estado.ultimoRechazo})`);
});

test("the ground changes while running: the snapped ones follow it, the absolute ones do not (off → flat, on → the hill)", () => {
  const w = mundo(true);
  const h = nat(HX, HZ);
  w.s.features.send("naturaleza", "encender", { activa: false }); w.pump(6);
  assert.equal(w.estado("pietro")?.y, 0, "nature off: no-y person back on the flat ground");
  assert.equal(w.estado("bajo")?.y, 1, "nature off: an absolute y 1 over the flat ground is where it was written");
  assert.equal(w.estado("caja")?.y, 0.5);
  assert.equal(w.estado("torre")?.y, 30);
  assert.equal(w.estado("estante")?.y, ENCIMA);
  w.s.features.send("naturaleza", "encender", { activa: true }); w.pump(6);
  assert.ok(cerca(w.estado("pietro")!.y, h), "nature on again: on the hill");
  assert.ok(cerca(w.estado("bajo")!.y, nat(HX, HZ - 4)) && cerca(w.estado("caja")!.y, nat(HX, HZ + 3)), "under the hill again: snapped");
  assert.equal(w.estado("torre")?.y, 30);
  assert.equal(w.estado("estante")?.y, ENCIMA);
});

test("the rule itself: above the ground stays; under it (beyond 0.1 m) or omitted → the ground; also over a ground below 0", () => {
  assert.equal(alSuelo(4, 7), 7);
  assert.equal(alSuelo(4, 3.95), 3.95, "within the 0.1 m tolerance: left alone");
  assert.equal(alSuelo(4, 3.5), 4);
  assert.equal(alSuelo(4.123, 0), 4.12);
  assert.equal(alSuelo(4, 9, true), 4, "omitted y → the ground whatever its height");
  assert.equal(alSuelo(-3, 0), 0, "a written y 0 over a pit is where it was written");
  assert.equal(alSuelo(-3, 0, true), -3, "…but a person with no y stands in the pit, not above it");
});

test("a sequence's keys obey the same rule (flat: unchanged)", () => {
  const r = cargarAventura({ misiones: [], pnj: [doc("pnj", PNJ), doc("pnj", PNJ_TORRE)], cosas: [], secuencias: [doc("secuencias", { formato: "secuencia@1", id: "paseo", duracion: 4, pistas: [
    { tipo: "mueve", pnj: "pietro", claves: [{ t: 0 }, { t: 2, x: HX + 2, z: HZ, y: 0.25 }, { t: 3, x: HX + 2, z: HZ, y: 30 }] },
    { tipo: "mueve", pnj: "torre", claves: [{ t: 0 }, { t: 2, x: HX + 2, z: HZ }] }] })] });
  assert.deepEqual(r.issues, []);
  const s = r.aventura.secuencias.get("paseo")!;
  const claves = (evs: ReturnType<typeof eventosDe>) => evs.filter(([ev]) => ev === "clave").map(([, m]) => m as Record<string, number>);
  const plano = claves(eventosDe(s, r.aventura.pnjs));
  assert.deepEqual(plano.map((k) => k.y), [0, 0.25, 30, 30, 30], "flat world: as before");
  const sobre = claves(eventosDe(s, r.aventura.pnjs, nat));
  assert.ok(cerca(sobre[0].y, nat(HX, HZ)), "no y at its own place: the ground");
  assert.ok(cerca(sobre[1].y, nat(HX + 2, HZ)), "y 0.25 under the hill: the ground");
  assert.equal(sobre[2].y, 30, "y 30 above the hill: as written");
  assert.deepEqual([sobre[3].y, sobre[4].y], [30, 30], "the tower person keeps its own floor on the way");
});
