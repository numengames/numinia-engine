// B4 · «asentar»: when the ground changes (the nature off, the base on…) people and things settle on the new ground.
// Headless over the in-memory transport; the real features through `conMundo` with a world folder kept in a Map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import clientes from "../features/cliente.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { alturaBase } from "../packages/relieve/src/espacio-base.ts";
import { alturaEn } from "../packages/relieve/src/relieve.ts";
import { groundHeight } from "../packages/sim/src/index.ts";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { sueloDe } from "../features/objetos/server.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };

const BLOQUE = biblioteca.modelos.find((m) => m.id === "bloque")!.modelo;
const SEMILLA = 1234, BASE = 42, /* the espacio base's default seed */ U = FX_ONE;
const nat = (x: number, z: number) => alturaEn(SEMILLA, x, z, { tamano: 200, plaza: 12, sinEstanque: false });

/** A world with the nature on (seed 1234); the espacio base is off until someone switches it on. `puede`: who may build. */
function mundo(opts: { construye: boolean }) {
  const permiso = { construye: opts.construye }, log: string[] = [];
  const ficheros = new Map<string, unknown>([["naturaleza.json", { activa: true, semilla: SEMILLA }]]);
  const partes = conMundo(funciones, ((f: string) => ficheros.get(f)) as never, () => {}, (f, d) => { ficheros.set(f, d); });
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, log: (l) => log.push(l), puede: (_w, a) => permiso.construye && a === "construir" });
  const t = inst.join(0);
  const s = new ClientSession(t, { features: clientes, view: new Proxy({}, { get: () => () => {} }) as never });
  const pump = (n = 1) => { for (let k = 0; k < n; k++) { t.flush(); s.tick(0, 0, 0); t.flush(); inst.tick(); t.flush(); } };
  pump(3);
  const objetos = () => new Map([...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([k, v]) => [k.slice(8), v])) as Map<string, Record<string, unknown>>;
  const mios = () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:"));
  const almacen = () => (inst.features as unknown as { almacenes: Map<string, { delete(k: string): void; get(k: string): unknown }> }).almacenes.get("objetos")!;
  return { inst, s, pump, ficheros, mios, objetos, permiso, log, almacen };
}
/** First point (on a 4 m lattice) where the nature is `lejos` m below (< 0) or above (> 0) the base. */
function punto(lejos: number): [number, number] {
  for (let x = -90; x <= 90; x += 4) for (let z = -90; z <= 90; z += 4) {
    const d = nat(x, z) - alturaBase(BASE, x, z);
    if (lejos < 0 ? d < lejos : d > lejos) return [x, z];
  }
  throw new Error("no such point");
}

test("avatars: nature off → base on: whoever is under the new ground is put on it (y == groundHeight, no vertical speed); whoever is above is left", () => {
  const w = mundo({ construye: true });
  const e = w.s.entity, c = w.inst.sim.tf.cols;
  assert.ok(w.inst.sim.mesh);
  const [vx, vz] = punto(-3); // a valley of the nature: the base is higher there
  c.x[e] = fx(vx); c.z[e] = fx(vz); c.y[e] = fx(nat(vx, vz)); w.inst.sim.mo.cols.vy[e] = 0;
  w.s.features.send("espacio-base", "encender", { activa: true }); w.pump(4);
  const Y = fx(alturaBase(BASE, vx, vz));
  assert.ok(c.y[e] > fx(nat(vx, vz)), "it went UP");
  const h = groundHeight(c.x[e], c.z[e], w.inst.sim, fx(400));
  assert.ok(Math.abs(c.y[e] - h) <= 2, `settled on the new ground: y=${c.y[e] / U} ground=${h / U}`); // the sim may take a gravity step
  assert.ok(Math.abs(c.y[e] - Y) < 2 * U, "and it is the base's height (4 m cells: bilinear gap)");
  assert.ok(w.inst.sim.mo.cols.vy[e] >= -FX_ONE, "no accumulated fall");
  w.pump(60);
  assert.ok(c.y[e] / U > alturaBase(BASE, vx, vz) - 1.2, "and it stays: it does not fall forever");

  // base off again → nature: the avatar high above the new ground is NOT touched (it falls by itself)
  const w2 = mundo({ construye: true }), e2 = w2.s.entity, c2 = w2.inst.sim.tf.cols;
  const [px, pz] = punto(3);
  c2.x[e2] = fx(px); c2.z[e2] = fx(pz); c2.y[e2] = fx(nat(px, pz) + 5);
  w2.s.features.send("espacio-base", "encender", { activa: true }); w2.pump(1);
  assert.ok(c2.y[e2] >= fx(nat(px, pz) + 5) - 2 * U, "above the new ground (or just a step of gravity): not moved up or down by the order");
});

test("objects: placed on the nature, base on → y == alturaBase + height over the ground; an old object without `sobre` lands on the ground", () => {
  const w = mundo({ construye: true });
  const [x, z] = punto(-3);
  w.s.features.send("objetos", "colocar", { modelo: BLOQUE, x, y: nat(x, z) + 2, z, nombre: "Bloque", decorado: false }); w.pump(2);
  w.s.features.send("objetos", "colocar", { modelo: BLOQUE, x: x + 4, y: nat(x + 4, z) + 1, z, nombre: "Otro", decorado: false }); w.pump(2);
  const [[idA, a0], [idB]] = [...w.objetos()];
  assert.ok(Math.abs(Number(a0.y) - (nat(x, z) + 2)) < 0.011);
  w.s.features.send("espacio-base", "encender", { activa: true }); w.pump(3);
  const a = w.objetos().get(idA)!;
  assert.ok(Math.abs(Number(a.y) - (alturaBase(BASE, x, z) + 2)) < 0.011, `A keeps 2 m over the ground: ${a.y} vs ${alturaBase(BASE, x, z) + 2}`);
  const b = w.objetos().get(idB)!;
  assert.ok(Math.abs(Number(b.y) - (alturaBase(BASE, x + 4, z) + 1)) < 0.011);
  // and back: the nature's ground again
  w.s.features.send("espacio-base", "encender", { activa: false }); w.pump(3);
  assert.ok(Math.abs(Number(w.objetos().get(idA)!.y) - (nat(x, z) + 2)) < 0.011, "back to the nature: still 2 m over the ground");
});

test("an old object (no `sobre` in the store) settles ON the ground, and asentar is refused without permission", () => {
  const w = mundo({ construye: true });
  const [x, z] = punto(-3);
  w.s.features.send("objetos", "colocar", { modelo: BLOQUE, x, y: nat(x, z) + 4, z, nombre: "Viejo", decorado: false }); w.pump(2);
  const [[id]] = [...w.objetos()];
  // forget the height: what a store saved before B4 looks like
  assert.ok(Math.abs(Number(w.almacen().get(`s:${id}`)) - 4) < 0.011, "placed 4 m over the nature: `sobre` = 4");
  w.almacen().delete(`s:${id}`);
  w.s.features.send("espacio-base", "encender", { activa: true }); w.pump(3);
  assert.ok(Math.abs(Number(w.objetos().get(id)!.y) - alturaBase(BASE, x, z)) < 0.011, "no `sobre` = 0 → on the ground");

  // `asentar` needs «construir»: refused without it, done with it
  w.permiso.construye = false; w.log.length = 0;
  w.s.features.send("objetos", "asentar", {}); w.pump(2);
  assert.equal(w.log.some((l) => l.includes("asentados por la entidad")), false, "refused without permission");
  w.permiso.construye = true;
  w.s.features.send("objetos", "asentar", {}); w.pump(2);
  assert.equal(w.log.some((l) => l.includes("asentados por la entidad")), true);
});

test("sueloDe: the base wins over the nature (B1), the nature alone is the nature's relief, nothing is flat 0; keys differ", () => {
  const b = sueloDe({ activa: true, semilla: 7 }, { activa: true, semilla: 9 }), n = sueloDe(undefined, { activa: true, semilla: 9 }), p = sueloDe(undefined, undefined);
  assert.equal(b.altura(50, 30), alturaBase(7, 50, 30));
  assert.equal(n.altura(50, 30), alturaEn(9, 50, 30, { tamano: 200, plaza: 12, sinEstanque: false }));
  assert.equal(p.altura(50, 30), 0);
  assert.equal(new Set([b.clave, n.clave, p.clave, sueloDe({ activa: false }, undefined).clave]).size, 3);
});
