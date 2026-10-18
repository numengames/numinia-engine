// D-045 («suelo de la muerte»): back to the last safe spot after a fall. Headless: a world whose floor is a solid
// platform 3 m high with the void (sueloMinimo 1 m) under it; the person walks off, falls to the flat ground (0 m < 1 m)
// and within a second is standing again where they last had the platform under their feet. The order the instance gives
// goes INSIDE the simulation step (recorded with the inputs: a replay reproduces it), and a world without sueloMinimo
// steps exactly as before (the reference fingerprint is pinned in test/engine.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, step, stateHash, replay, referenceRecording, replayFingerprint, REFERENCE, setSolids, solidsFrom, onFloor, ORDER_STRIDE, ORDER_PONER } from "../packages/sim/src/index.ts";
import { Instance, SEGURO_CADA } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { encodeInput } from "../packages/net/src/index.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerPart, ClientPart } from "../packages/feature/src/index.ts";
import { crearSuelo } from "../features/suelo/server.ts";
import sueloClient from "../features/suelo/client.ts";
import { leerSuelo, validarEntorno } from "../features/entorno/esquema.ts";

/** A feature that only puts a solid platform in the world (x −6…6, y 0…3, z −6…6): the floor people stand on. */
const plataforma = defineFeature({ id: "plataforma", version: 1, level: "base", describe: "una plataforma sólida", intents: {}, events: {},
  state: { describe: "cajas", fields: { solido: { kind: "bool" }, bx0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, by0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bz0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bx1: { kind: "fixed", min: -100, max: 100, step: 0.01 }, by1: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bz1: { kind: "fixed", min: -100, max: 100, step: 0.01 } } } });
const plataformaServer: ServerPart = serverPart(plataforma, (api) => { api.state.set("p", { solido: true, bx0: -6, by0: 0, bz0: -6, bx1: 6, by1: 3, bz1: 6 }); });

function mundo(suelo: Parameters<typeof crearSuelo>[0], n = 1, parts: ClientPart[] = [sueloClient]) {
  const log: string[] = [];
  const inst = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [plataformaServer, crearSuelo(suelo)], log: (l) => log.push(l), suelo, aparicion: { x: 0, z: 0, radio: 1 } });
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i); const fundidos: number[] = [];
    const s = new ClientSession(t, { features: parts, view: { label() {}, bounce() {}, fundido: (ms) => fundidos.push(ms) } });
    return { t, s, fundidos };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); } };
  return { inst, clients, pump, log };
}
const pos = (inst: Instance, e: number) => ({ x: fxToFloat(inst.sim.tf.cols.x[e]), y: fxToFloat(inst.sim.tf.cols.y[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) });
/** Lift an avatar onto the platform and let the sim settle it (the spawn area is on the flat ground, under the platform's top). */
function subir(inst: Instance, e: number, x = 0, z = 0) { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); inst.sim.tf.cols.y[e] = fx(3); }

test("sim: an order puts the avatar there, still; a replay with the same orders gives the same hashes; without orders the reference fingerprint stands", () => {
  const s = createSim(4, 1); const e = spawnAvatar(s, 0);
  step(s, new Int32Array([e, 0, 0, 0]), new Int32Array([e, ORDER_PONER, fx(5), fx(2), fx(-3), 0]));
  assert.deepEqual([s.tf.cols.x[e], s.tf.cols.z[e]], [fx(5), fx(-3)]);
  assert.ok(s.tf.cols.y[e] < fx(2) && s.tf.cols.y[e] > fx(1.9), "placed at 2 m and then the input's gravity step applied (in the air, falling)");
  assert.equal(s.mo.cols.air[e], 0);
  const rec = referenceRecording(99, 200, 3);
  const orders = rec.ticks.map((_, t) => (t % 37 === 0 ? new Int32Array([1, ORDER_PONER, fx(t), fx(1), fx(-t), 0]) : undefined));
  const a = replay({ ...rec, orders }), b = replay({ ...rec, orders });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, replay(rec), "the orders change the run");
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965, "reference fingerprint (sim 3) unchanged");
  assert.equal(ORDER_STRIDE, 6);
});

test("instance: walking off the platform into the void brings you back to the last spot with floor under your feet; the page fades and hears it", () => {
  const { inst, clients, pump, log } = mundo({ minimo: 1 });
  const [c] = clients; pump(2);
  const e = c.s.entity; assert.ok(e >= 0);
  subir(inst, e, 0, 0); pump(SEGURO_CADA + 1); // settle on the platform top (3 m) and let the half-second keeper see it
  assert.equal(pos(inst, e).y, 3); assert.ok(onFloor(inst.sim, e));
  // walk +x at full stick: 12 ticks of 0.075 m take you from x≈0 past the edge at 6 m? no: 0.9 m. Run (4 m/s): 0.2 m a tick.
  let seq = 0; const run = 2;
  const avanzar = (n: number, mx = 127) => { for (let i = 0; i < n; i++) { c.t.send(encodeInput(++seq & 0xffff, mx, 0, run), false); pump(1); } }; // J2: no input, no gravity
  avanzar(28); // 5.6 m: still on the platform
  const antes = pos(inst, e); assert.ok(antes.y === 3 && antes.x > 5 && antes.x < 6, JSON.stringify(antes));
  avanzar(8); // 1.6 m more: over the edge (6 m), in the air; the keeper saw the last spot on the floor at the latest half second
  assert.ok(pos(inst, e).y < 3 && pos(inst, e).x > 6, JSON.stringify(pos(inst, e)));
  avanzar(50, 0); // stick released, 2.5 s: gravity takes you to the flat ground (0 m), under the minimum (1 m): the instance orders the return
  const despues = pos(inst, e);
  assert.equal(despues.y, 3, "standing on the platform again");
  assert.ok(despues.x <= 6 && despues.x > 4, `back on the last safe x, got ${despues.x}`);
  assert.ok(onFloor(inst.sim, e));
  assert.ok(log.some((l) => l.includes("[suelo] tick") && l.includes("orden(es)")), "the order went through the step (logged)");
  const v = c.s.features.log.filter((l) => l.feature === "suelo" && l.event === "vuelta");
  assert.ok(v.length >= 1 && v[0].msg.motivo === "caida" && Number(v[0].msg.quien) === e, JSON.stringify(v));
  assert.ok(c.fundidos.length >= 1, "the page faded");
  const an = c.s.features.announcements.find((a) => a.feature === "suelo");
  assert.ok(an && an.text === "Has vuelto a un sitio seguro" && an.importance === 2, JSON.stringify(an));
});

test("instance: the world's fixed point is used when no safe spot is known (or always, with siempre); vuelve_a_seguro works on request; a world without sueloMinimo never moves anyone", () => {
  // spawn on the flat ground (0 m) under a minimum of 1 m: nowhere safe known → the fixed point on the platform
  const a = mundo({ minimo: 1, vuelta: { x: 2, y: 3, z: 2 } }); a.pump(SEGURO_CADA + 2);
  const ea = a.clients[0].s.entity; assert.deepEqual(pos(a.inst, ea), { x: 2, y: 3, z: 2 });
  // `siempre`: even with a safe spot known, a request goes to the fixed point
  const b = mundo({ minimo: 1, vuelta: { x: -2, y: 3, z: -2, siempre: true } }); b.pump(2);
  const eb = b.clients[0].s.entity; subir(b.inst, eb, 1, 1); b.pump(SEGURO_CADA + 1); assert.equal(pos(b.inst, eb).y, 3);
  const r = b.clients[0].s.features.send("suelo", "volver", {}); assert.equal(r.ok, true, JSON.stringify(r)); b.pump(3);
  assert.deepEqual(pos(b.inst, eb), { x: -2, y: 3, z: -2 });
  assert.equal(b.clients[0].s.features.log.filter((l) => l.event === "vuelta").at(-1)?.msg.motivo, "pedido");
  // no void: the person stays on the flat ground, nothing is ordered, and the state says so
  const c = mundo(null); c.pump(SEGURO_CADA * 4);
  const ec = c.clients[0].s.entity; assert.equal(pos(c.inst, ec).y, 0);
  assert.ok(!c.log.some((l) => l.includes("[suelo] tick")));
  assert.deepEqual(c.clients[0].s.features.stateOf("suelo").get("mundo"), { activo: false, minimo: -500 });
  // but the verb still brings you back to where you last stood (a stuck person)
  c.inst.sim.tf.cols.y[ec] = fx(40); // thrown in the air by something
  assert.equal(c.clients[0].s.features.send("suelo", "volver", {}).ok, true); c.pump(3);
  assert.equal(pos(c.inst, ec).y, 0);
});

test("entorno.json: sueloMinimo and vuelta are read and checked; wrong values name their path; validarEntorno lists them", () => {
  assert.deepEqual(leerSuelo({}), { ok: true, value: null });
  assert.deepEqual(leerSuelo({ sueloMinimo: -4 }), { ok: true, value: { minimo: -4, vuelta: null } });
  assert.deepEqual(leerSuelo({ sueloMinimo: 1, vuelta: { x: 1, y: 3, z: 2 } }), { ok: true, value: { minimo: 1, vuelta: { x: 1, y: 3, z: 2, siempre: false } } });
  const bad = leerSuelo({ sueloMinimo: "hondo", vuelta: { x: 1, y: 900, z: 2, siempre: 1 } });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.issues.map((i) => i.path), ["entorno.sueloMinimo", "entorno.vuelta.y", "entorno.vuelta.siempre"]);
  const v = validarEntorno({ schema: "numinia-engine/entorno@1", sueloMinimo: 9999 });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.issues.some((i) => i.path === "entorno.sueloMinimo"));
  // stateHash is reachable (the fingerprint of a world with solids and orders is a number, like any other)
  const s = createSim(2, 3); setSolids(s, solidsFrom([["p", { solido: true, bx0: -1, by0: 0, bz0: -1, bx1: 1, by1: 1, bz1: 1 }]])); assert.equal(typeof stateHash(s), "number");
});
