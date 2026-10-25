// A HELD Space keeps climbing while you fly (the page used to send BTN_JUMP once per key press and ignore the browser's key-repeat,
// so a held Space climbed one step); a held Ctrl keeps descending; on the ground a held Space is still ONE jump per press.
// The page's rule is apps/plaza/vuelo-teclas.ts; the climb is read back from a real client session + instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { BTN_JUMP, BTN_BAJAR, TICK_HZ } from "../packages/sim/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearVuelo } from "../features/vuelo/server.ts";
import vueloCliente from "../features/vuelo/client.ts";
import { botonesDeVuelo } from "../apps/plaza/vuelo-teclas.ts";

const teclas = (...k: string[]) => new Set(k);

test("vuelo-teclas: Space adds BTN_JUMP only while flying; Ctrl adds BTN_BAJAR; nothing held, nothing sent", () => {
  assert.equal(botonesDeVuelo(teclas("Space"), true), BTN_JUMP, "held Space while flying climbs");
  assert.equal(botonesDeVuelo(teclas("Space"), false), 0, "on foot the held Space adds nothing (the page's one jump per press stays as it was)");
  assert.equal(botonesDeVuelo(teclas("ControlLeft"), true), BTN_BAJAR);
  assert.equal(botonesDeVuelo(teclas("ControlRight"), false), BTN_BAJAR, "Ctrl was never gated on the page (the simulation ignores it on foot)");
  assert.equal(botonesDeVuelo(teclas("Space", "ControlLeft"), true), BTN_JUMP | BTN_BAJAR);
  assert.equal(botonesDeVuelo(teclas("KeyW", "ShiftLeft"), true), 0);
  assert.equal(botonesDeVuelo(teclas(), true), 0);
});

test("vuelo-teclas: a page that sends the rule's buttons each tick keeps climbing while Space is held and stops when it is let go; Ctrl keeps descending", () => {
  const log: string[] = [], reloj = { ms: Date.parse("2026-10-25T22:00:00Z") };
  const keeper: GuestKeeper = (() => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; })();
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearVuelo()], log: (l) => log.push(l), identitySign: signer("una-clave-de-prueba-larga"), vuelo: "todos" });
  const t = inst.join(0), c = crearChat(() => reloj.ms);
  const s = new ClientSession(t, { features: [c.part, vueloCliente], identity: keeper, view: { label() {}, bounce() {}, lleva() {} } });
  const held = new Set<string>();
  const pump = (ticks: number) => { for (let k = 0; k < ticks; k++) { s.tick(0, 0, botonesDeVuelo(held, s.volando())); t.flush(); inst.tick(); t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const y = () => fxToFloat(inst.sim.tf.cols.y[s.entity]);
  pump(4);
  assert.equal(s.volando(), false);
  held.add("Space"); pump(TICK_HZ);
  assert.ok(y() < 3, `on foot a held Space is not a climb (y ${y().toFixed(2)})`);
  held.delete("Space"); pump(TICK_HZ * 2);
  const suelo = y();
  assert.deepEqual(c.chat.decir("/volar"), { ok: true }); pump(TICK_HZ + 2);
  assert.equal(s.volando(), true, "the page knows it flies");
  const medidas: number[] = [];
  held.add("Space");
  for (let i = 0; i < 4; i++) { pump(TICK_HZ / 2); medidas.push(y()); }
  assert.ok(medidas.every((m, i) => m > (i ? medidas[i - 1] : suelo) + 0.5), `held Space keeps climbing, half a second after half a second (${medidas.map((m) => m.toFixed(2)).join(", ")})`);
  held.delete("Space"); pump(2); const parada = y(); pump(TICK_HZ);
  assert.ok(Math.abs(y() - parada) < 0.05, "let go: it holds its height");
  held.add("ControlLeft"); pump(TICK_HZ);
  assert.ok(y() < parada - 1.4, `held Ctrl keeps descending (${parada.toFixed(2)} → ${y().toFixed(2)})`);
});
