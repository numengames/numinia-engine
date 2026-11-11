// entorno `suelo.tipo: "ninguno"`: a world of floating islands has no flat floor at y = 0. The file says it, the shared
// state carries it («entorno:zona».suelo), and the server's sim AND the page's prediction drop the y = 0 floor
// (`piso` = PISO_SIN_SUELO), so a fall goes on until D-045's void (sueloMinimo) brings you back. A world that does not say
// it is byte-identical (reference fingerprint pinned in test/suelo.test.ts and engine.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { encodeInput } from "../packages/net/src/index.ts";
import { sinSueloDelEstado, createSim, spawnAvatar, setMesh, groundHeight, PISO_SIN_SUELO } from "../packages/sim/src/index.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearSuelo } from "../features/suelo/server.ts";
import entornoClient from "../features/entorno/client.ts";
import sueloClient from "../features/suelo/client.ts";
import { validarEntorno } from "../features/entorno/esquema.ts";

function mundo(entorno: unknown, suelo: Parameters<typeof crearSuelo>[0]) {
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: [crearEntorno(entorno), crearSuelo(suelo)], suelo, aparicion: { x: 0, z: 0, radio: 1 } });
  const t = inst.join(0);
  const s = new ClientSession(t, { features: [entornoClient, sueloClient], view: { label() {}, bounce() {}, fundido() {} } });
  const pump = (n = 1) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  return { inst, s, t, pump };
}
const yDe = (inst: Instance, e: number) => fxToFloat(inst.sim.tf.cols.y[e]);

test("entorno.json: suelo.tipo «ninguno» is a valid value; the default stays «hierba»", () => {
  const v = validarEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "ninguno" } });
  assert.equal(v.ok, true, JSON.stringify(v));
  if (v.ok) assert.equal(v.value.suelo, "ninguno");
  const d = validarEntorno({ schema: "numinia-engine/entorno@1" });
  assert.equal(d.ok && d.value.suelo, "hierba");
  assert.equal(validarEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "lava" } }).ok, false);
});

test("sim: without the flat floor a body keeps falling; with it (the default) it stops at 0", () => {
  const s = createSim(4, 1); spawnAvatar(s, 0);
  assert.equal(groundHeight(0, 0, s, 0), 0);
  setMesh(s, null, PISO_SIN_SUELO);
  assert.equal(groundHeight(0, 0, s, 0), PISO_SIN_SUELO);
  setMesh(s, null, 0);
  assert.equal(groundHeight(0, 0, s, 0), 0);
  assert.equal(sinSueloDelEstado([["entorno:zona", { suelo: "ninguno" }]]), true);
  assert.equal(sinSueloDelEstado([["entorno:zona", { suelo: "hierba" }]]), false);
  assert.equal(sinSueloDelEstado([]), false);
});

test("instance + page: with suelo «ninguno» nobody stands at y = 0; the void brings them back to the fixed point; the page predicts the same", () => {
  const w = mundo({ schema: "numinia-engine/entorno@1", suelo: { tipo: "ninguno" } }, { minimo: -30, vuelta: { x: 0, y: 5, z: 0, siempre: true } });
  w.pump(2);
  const e = w.s.entity; assert.ok(e >= 0);
  assert.equal(w.inst.sim.piso, PISO_SIN_SUELO, "the server dropped the y = 0 floor");
  // put the body 10 m up over nothing and let it fall: it passes y = 0 and is only stopped by the void (-30 m)
  w.inst.sim.tf.cols.y[e] = fx(10);
  let minY = 10, seq = 0, volvio = false;
  for (let i = 0; i < 200 && !volvio; i++) {
    w.t.send(encodeInput(++seq & 0xffff, 0, 0, 0), false); w.pump(1);
    const y = yDe(w.inst, e); minY = Math.min(minY, y);
    if (minY < -25 && y > 0) volvio = true;
  }
  assert.ok(minY < -25, `fell through y = 0 and on, lowest ${minY}`);
  assert.ok(volvio, "the void (-30 m) returned the person to the fixed point (y 5 m)");
  // the page's local sim dropped the floor too (same shared state)
  (w.s as unknown as { tick(mx: number, mz: number): void }).tick(0, 0);
  assert.equal((w.s as unknown as { local: { piso: number } }).local.piso, PISO_SIN_SUELO);
});

test("a world that does not say it keeps the flat floor (nothing moves, fingerprint untouched)", () => {
  const w = mundo({ schema: "numinia-engine/entorno@1", suelo: { tipo: "arena" } }, null);
  w.pump(2);
  const e = w.s.entity; w.inst.sim.tf.cols.y[e] = fx(6);
  let seq = 0; for (let i = 0; i < 100; i++) { w.t.send(encodeInput(++seq & 0xffff, 0, 0, 0), false); w.pump(1); }
  assert.equal(w.inst.sim.piso, 0);
  assert.equal(yDe(w.inst, e), 0);
});
