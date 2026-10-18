// H2 historia 5: api.ordenar — queues orders on a connected avatar; the queue is capped per tick (ORDENES_TICK_MAX),
// VOLAR checks permission, teletransportar/volverASeguro keep working as shortcuts (the same `ordenes` queue).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fxToFloat, fx } from "../packages/core/src/index.ts";
import { Instance, ORDENES_TICK_MAX } from "../packages/instance/src/index.ts";
import { getMotionExtra, MODO_QUIETO, MODO_VOLANDO, ORDER_STRIDE } from "../packages/sim/src/index.ts";

function instancia(opts: Partial<Parameters<typeof Instance>[0]> = {}) {
  const log: string[] = [];
  return new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, log: (l) => log.push(l), ...opts } as any);
}
const noInputs = () => new Int32Array(0);

test("api.ordenar: an unknown entity, or a non-finite value, returns false and queues nothing", () => {
  const inst = instancia();
  assert.equal(inst.ordenar(99, { poner: { x: 0, y: 0, z: 0 } }), false);
  const e = inst.connect({ onMessage() {}, send() {} } as any);
  assert.equal(inst.ordenar(e, { quieto: NaN }), false);
  assert.equal(inst.ordenar(e, { quieto: 0 }), false);
});

test("api.ordenar: poner/quieto/empujar/sentar queue a sextuple; the instance applies it at the next tick", () => {
  const inst = instancia();
  const e = inst.connect({ onMessage() {}, send() {} } as any);
  assert.equal(inst.ordenar(e, { poner: { x: 3, y: 1, z: -2 } }), true);
  inst.tick();
  assert.deepEqual([fxToFloat(inst.sim.tf.cols.x[e]), fxToFloat(inst.sim.tf.cols.z[e])], [3, -2]);

  assert.equal(inst.ordenar(e, { quieto: 0.5 }), true); // 10 ticks
  inst.tick();
  assert.equal(getMotionExtra(inst.sim, e).modo, MODO_QUIETO);
  assert.equal(getMotionExtra(inst.sim, e).cnt, 10);
});

test("api.ordenar: VOLAR with no permission is refused and logged; «todos» and a feature's own grant let it through", () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, log: (l) => log.push(l) } as any);
  const e = inst.connect({ onMessage() {}, send() {} } as any);
  assert.equal(inst.ordenar(e, { volar: true }), false);
  assert.ok(log.some((l) => l.includes("VOLAR") && l.includes("rechazado")));
  inst.concederVuelo(e, true);
  assert.equal(inst.ordenar(e, { volar: true }), true);
  inst.tick();
  assert.equal(getMotionExtra(inst.sim, e).modo, MODO_VOLANDO);

  const inst2 = instancia({ vuelo: "todos" } as any);
  const e2 = inst2.connect({ onMessage() {}, send() {} } as any);
  assert.equal(inst2.ordenar(e2, { volar: true }), true);
});

test("ORDENES_TICK_MAX: 100 orders in one go apply 64 now, the other 36 on the next tick, in order", () => {
  const inst = instancia({ capacity: 128 } as any);
  const es = Array.from({ length: 100 }, () => inst.connect({ onMessage() {}, send() {} } as any));
  for (const e of es) assert.equal(inst.ordenar(e, { poner: { x: 1, y: 0, z: 0 } }), true);
  inst.tick();
  const movedAfterFirst = es.filter((e) => fxToFloat(inst.sim.tf.cols.x[e]) === 1).length;
  assert.equal(movedAfterFirst, ORDENES_TICK_MAX);
  inst.tick();
  const movedAfterSecond = es.filter((e) => fxToFloat(inst.sim.tf.cols.x[e]) === 1).length;
  assert.equal(movedAfterSecond, 100);
  void ORDER_STRIDE; void fx;
});
