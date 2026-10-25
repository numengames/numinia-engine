// Lote 5 · «nadie enterrado en el suelo de la plaza»: a person (pnj@1) and a thing (cosa@1) carry `posicion.y` = metres ABOVE THE GROUND.
// With relieve (the nature or the espacio base) the page draws them at the absolute `y` the state gives, and `api.within` compares the player's
// feet with it: published at y 0 on a hill they stood buried and out of the player's reach. Over the real plug (server + page):
//  - flat world: the state's y is posicion.y, as always;
//  - nature on: y = the hill's height + posicion.y, for a person and for a thing, and a player standing on that hill can talk to the person;
//  - the nature switched off while running: they stand on the flat ground again (y = posicion.y), and on again: back on the hill;
//  - a sequence's keys follow the ground too (pure: eventosDe).
import { test } from "node:test";
import assert from "node:assert/strict";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";
import { eventosDe } from "../features/misiones/secuencia.ts";
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
const PNJ = { formato: "pnj@1", id: "pietro", nombre: "Pietro", posicion: { x: HX, z: HZ }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Hola.", opciones: [adios] } } } };
const PNJ_ALTO = { ...PNJ, id: "alto", nombre: "Alto", posicion: { x: HX + 40, z: HZ, y: 2 } };
const COSA = { formato: "cosa@1", id: "caja", nombre: "Caja", posicion: { x: HX, z: HZ + 3, y: 0.5 }, aviso: "usar caja" };
const doc = (dir: string, x: { id: string }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const aventura = () => ({ misiones: [], pnj: [doc("pnj", PNJ), doc("pnj", PNJ_ALTO)], cosas: [doc("cosas", COSA)] });

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

test("flat world: a person and a thing keep y = posicion.y (nothing changes without relieve)", () => {
  const w = mundo(false);
  assert.equal(w.estado("pietro")?.y, 0);
  assert.equal(w.estado("alto")?.y, 2);
  assert.equal(w.estado("caja")?.y, 0.5);
});

test("nature on: people and things stand on the hill (ground + posicion.y), and a player on that hill can talk to the person", () => {
  const w = mundo(true);
  const h = nat(HX, HZ);
  assert.ok(h > 4, `the fixture is a real hill (${h})`);
  assert.ok(Math.abs(w.estado("pietro")!.y - h) < 0.01, `pietro y=${w.estado("pietro")?.y} ground=${h}`);
  assert.ok(Math.abs(w.estado("alto")!.y - (nat(HX + 40, HZ) + 2)) < 0.01, "posicion.y counts ABOVE the ground");
  assert.ok(Math.abs(w.estado("caja")!.y - (nat(HX, HZ + 3) + 0.5)) < 0.01, "a thing too");
  // the player stands beside Pietro on the hill: within reach (before, y 0 vs a hill over 4 m: out of the 2.5 m height reach)
  const e = w.s.entity, c = w.inst.sim.tf.cols;
  c.x[e] = fx(HX + 1); c.z[e] = fx(HZ); c.y[e] = fx(nat(HX + 1, HZ)); w.inst.sim.mo.cols.vy[e] = 0;
  w.pump(6);
  w.m.hablar("pietro"); w.pump(3);
  assert.equal(w.m.dialogo()?.pnj, "pietro", `the conversation opens (rechazo: ${w.m.estado.ultimoRechazo})`);
});

test("the ground changes while running: people and things follow it (off → flat, on → the hill)", () => {
  const w = mundo(true);
  const h = nat(HX, HZ);
  w.s.features.send("naturaleza", "encender", { activa: false }); w.pump(6);
  assert.equal(w.estado("pietro")?.y, 0, "nature off: back on the flat ground");
  assert.equal(w.estado("caja")?.y, 0.5);
  w.s.features.send("naturaleza", "encender", { activa: true }); w.pump(6);
  assert.ok(Math.abs(w.estado("pietro")!.y - h) < 0.01, "nature on again: on the hill");
});

test("a sequence's keys are over the ground they stand on (flat: unchanged)", () => {
  const r = cargarAventura({ misiones: [], pnj: [doc("pnj", PNJ)], cosas: [], secuencias: [doc("secuencias", { formato: "secuencia@1", id: "paseo", duracion: 4, pistas: [{ tipo: "mueve", pnj: "pietro", claves: [{ t: 0 }, { t: 2, x: HX + 2, z: HZ, y: 0.25 }] }] })] });
  assert.deepEqual(r.issues, []);
  const s = r.aventura.secuencias.get("paseo")!;
  const claves = (evs: ReturnType<typeof eventosDe>) => evs.filter(([ev]) => ev === "clave").map(([, m]) => m as Record<string, number>);
  const plano = claves(eventosDe(s, r.aventura.pnjs));
  assert.deepEqual(plano.map((k) => k.y), [0, 0.25], "flat world: as before");
  const sobre = claves(eventosDe(s, r.aventura.pnjs, nat));
  assert.ok(Math.abs(sobre[0].y - nat(HX, HZ)) < 0.01 && Math.abs(sobre[1].y - (nat(HX + 2, HZ) + 0.25)) < 0.01, JSON.stringify(sobre));
});
