// movedores v1 (D-043): «mover y girar objetos del mundo con duración, igual para todos» — headless (in-memory
// world, pages pumped by 20 Hz ticks). The file (wrong lines out with their reason), the pure pose math (poseDe,
// lerpPose), the server's ride (published a few times a second, not every tick, only to who is near), `vaiven`
// looping on its own, `interruptor` waiting for `activa` within reach, and the `llegada` event with the cable's name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { movedores, leerMovedores, poseDe, lerpPose, PUBLICA_CADA_TICKS, MOVEDORES_MAX } from "../features/movedores/feature.ts";
import type { MovedorFichero } from "../features/movedores/feature.ts";
import { crearMovedores } from "../features/movedores/server.ts";
import { crearCliente } from "../features/movedores/client.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerPart } from "../packages/feature/src/index.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const MODELO = "hash-de-prueba";
const PLATAFORMA: MovedorFichero = { id: "plat1", nombre: "Plataforma", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, arx: 0, ary: 0, arz: 0, bx: 0, by: 4, bz: 0, brx: 0, bry: 0, brz: 0, sx: 1, sy: 1, sz: 1, duracion: 2, espera: 0, radio: 2.5, evento: "plat-llega", empiezaEn: "a" };
const PUERTA: MovedorFichero = { id: "puerta1", nombre: "Puerta corredera", modelo: MODELO, tipo: "interruptor", ax: 0, ay: 0, az: 10, arx: 0, ary: 0, arz: 0, bx: 2, by: 0, bz: 10, brx: 0, bry: 0, brz: 0, sx: 1, sy: 1, sz: 1, duracion: 1, espera: 0, radio: 2.5, evento: "puerta-llega", empiezaEn: "a" };

/** A stand-in for the cable (D-041): a server part that hears ("movedores", "llegada") and keeps the event names. */
const cable = (oidos: string[]): ServerPart => serverPart(defineFeature({ id: "cable-prueba", version: 1, level: "base", describe: "oye llegadas", intents: {}, events: {} }), (api) => { api.listen("movedores", "llegada", (m) => { oidos.push(String(m.evento)); return true; }); });

function mundo(n: number, lista = [PLATAFORMA, PUERTA]) {
  const log: string[] = [], oidos: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearMovedores({ movedores: lista }), cable(oidos)], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const placed = new Map<string, unknown>();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts, view: { label() {}, bounce() {}, place: (k, o) => { if (o) placed.set(k, o); else placed.delete(k); } } });
    return { t, s, m: cli.movedores, placed };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log, oidos };
}

test("movedores: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(movedores.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "movedores"));
  assert.ok(paginas.some((f) => f.feature.id === "movedores"));
});

test("poseDe / lerpPose: pure pose math", () => {
  const f = PLATAFORMA;
  assert.deepEqual(poseDe(f, "a"), { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  assert.deepEqual(poseDe(f, "b"), { x: 0, y: 4, z: 0, rx: 0, ry: 0, rz: 0 });
  assert.deepEqual(lerpPose(poseDe(f, "a"), poseDe(f, "b"), 0.5), { x: 0, y: 2, z: 0, rx: 0, ry: 0, rz: 0 });
  assert.deepEqual(lerpPose(poseDe(f, "a"), poseDe(f, "b"), -1), poseDe(f, "a"), "clamped below 0");
  assert.deepEqual(lerpPose(poseDe(f, "a"), poseDe(f, "b"), 2), poseDe(f, "b"), "clamped above 1");
});

test("leerMovedores: each wrong line is left out WITH its reason; the right ones are used", () => {
  const r = leerMovedores({
    schema: "numinia-engine/movedores@1",
    movedores: [
      { id: "plat1", nombre: "Plataforma", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "Plat", nombre: "mayúscula", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "plat1", nombre: "repetido", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "sin-nombre", nombre: "", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "sin-modelo", nombre: "sin modelo", modelo: "", tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "tipo", nombre: "tipo raro", modelo: MODELO, tipo: "vuelo", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 },
      { id: "sin-b", nombre: "sin b", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, duracion: 2 },
      { id: "duracion-mala", nombre: "duracion mala", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 999 },
      { id: "puerta1", nombre: "Puerta", modelo: MODELO, tipo: "interruptor", ax: 0, ay: 0, az: 10, bx: 2, by: 0, bz: 10, duracion: 1, radio: 3, evento: "puerta-llega" },
      "no es un objeto",
    ],
  });
  assert.deepEqual(r.valor.map((m) => m.id), ["plat1", "puerta1"]);
  assert.equal(r.valor[0].duracion, 2);
  assert.equal(r.valor[1].radio, 3); assert.equal(r.valor[1].evento, "puerta-llega");
  const paths = r.problemas.map((p) => p.path);
  for (const i of [1, 2, 3, 4, 5, 6, 7]) assert.ok(paths.some((p) => p.startsWith(`movedores.movedores[${i}]`)), `line ${i} is said: ${paths.join(", ")}`);
  assert.match(r.problemas.find((p) => p.path.startsWith("movedores.movedores[2]"))!.message, /repetido/);
  assert.match(leerMovedores([1, 2]).problemas[0].message, /movedores\.json es un objeto/);
  assert.deepEqual(leerMovedores(undefined), { valor: [], problemas: [] });
  const muchos = leerMovedores({ movedores: Array.from({ length: MOVEDORES_MAX + 2 }, (_, i) => ({ id: `m${i}`, nombre: `M ${i}`, modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, duracion: 1 })) });
  assert.equal(muchos.valor.length, MOVEDORES_MAX);
});

test("a world's movedores.json goes through conMundo: used lines in, wrong ones logged with their path", () => {
  const log: string[] = [];
  const ficheros: Record<string, unknown> = { "movedores.json": { movedores: [{ id: "plat1", nombre: "Plataforma", modelo: MODELO, tipo: "vaiven", ax: 0, ay: 0, az: 0, bx: 0, by: 4, bz: 0, duracion: 2 }, { id: "mal", nombre: "mal", modelo: MODELO, tipo: "nada", ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, duracion: 1 }] } };
  const partes = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const parte = partes.find((p) => p.feature.id === "movedores")!;
  assert.ok(parte && parte !== funciones.find((p) => p.feature.id === "movedores"), "the part was rebuilt with the world's movedores");
  assert.ok(log.some((l) => l.includes("[mundo] movedores.json: movedores.movedores[1].tipo") && l.includes("esa línea no se usa")), log.join("\n"));
  assert.equal(conMundo(funciones, () => undefined).find((p) => p.feature.id === "movedores"), funciones.find((p) => p.feature.id === "movedores"));
});

test("vaiven: rides A→B over its duration (published a few times a second, not every tick), waits, then back, emits llegada with the cable's event name", () => {
  // espera = 1 s gives a 20-tick pause at each end: plenty of slack to read a stable pose without racing the tick
  // that starts the next leg (duracion = 2 s = 40 ticks of riding).
  const PLAT_EXP: MovedorFichero = { ...PLATAFORMA, espera: 1 };
  const { pages: [a, lejos], pump, place, log, oidos } = mundo(2, [PLAT_EXP]);
  pump(3);
  place(a.s.entity, 0, 0); place(lejos.s.entity, 1000, 1000); pump(12); // area of interest is recomputed every STATE_REFRESH_TICKS
  assert.ok(log.some((l) => l.includes("movedores: 1 movedor(es)")));
  // still in its first pause: at A, not moving
  assert.equal(a.m.uno("plat1")!.y, 0); assert.equal(a.m.uno("plat1")!.lado, "a"); assert.equal(a.m.uno("plat1")!.marcha, false);
  assert.deepEqual(lejos.m.lista(), [], "far away: no movedor in the state at all");

  let vistos = 0; a.m.alCambiar((id) => { if (id === "plat1") vistos++; });
  const antes = vistos;
  pump(55); // 0.25 s left of the wait + 2 s ride (45 ticks); stop 10 ticks into the pause at B (inside its 20-tick window)
  const llegado = a.m.uno("plat1")!;
  assert.equal(llegado.lado, "b"); assert.equal(llegado.marcha, false); assert.equal(llegado.y, 4);
  assert.ok(vistos - antes < 55, `fewer state changes than ticks (5 Hz, not 20 Hz): got ${vistos - antes}`);
  assert.ok(vistos - antes >= 2, "at least a couple of published poses while it rides");
  assert.deepEqual(oidos, ["plat-llega"]);
  assert.equal(a.placed.get("movedores:plat1")?.y, 4);

  pump(60); // another 1 s wait + 2 s ride (60 ticks) lands 10 ticks into the pause back at A
  assert.equal(a.m.uno("plat1")!.lado, "a"); assert.equal(a.m.uno("plat1")!.y, 0);
  assert.deepEqual(oidos, ["plat-llega", "plat-llega"]);
});

test("interruptor: stays put until `activa` from within reach; ignores a second order mid-ride; goes back on the next one", () => {
  const { pages: [a, lejos], pump, place } = mundo(2);
  pump(3); place(a.s.entity, 0, 11); place(lejos.s.entity, 1000, 1000); pump(2);
  assert.equal(a.m.uno("puerta1")!.lado, "a");

  const lejosRes = lejos.m.activa("puerta1");
  assert.ok(lejosRes.ok); // the call always succeeds client-side; the server is the one that may refuse
  pump(2);
  assert.equal(a.m.uno("puerta1")!.marcha, false, "lejos has no movedor in its state: the server found nothing to move for it either way");

  a.m.activa("puerta1"); pump(2);
  assert.equal(a.m.uno("puerta1")!.marcha, true);
  a.m.activa("puerta1"); pump(2); // mid-ride: ignored (still riding to b)
  pump(20); // duracion = 1 s
  const llegado = a.m.uno("puerta1")!;
  assert.equal(llegado.lado, "b"); assert.equal(llegado.marcha, false); assert.equal(llegado.x, 2);

  a.m.activa("puerta1"); pump(20);
  assert.equal(a.m.uno("puerta1")!.lado, "a"); assert.equal(a.m.uno("puerta1")!.x, 0);
});
