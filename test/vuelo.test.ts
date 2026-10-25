// vuelo (H2): flying with permission — the SERVER decides. The world's `vuelo` (entorno.json: nadie · constructores · todos)
// or a grant from a feature says who may; chat `/volar` and `/aterrizar` and the intent `volar` only ask. Headless: an
// in-memory world, pages pumped by 20 Hz ticks, the real chat; the simulation's own mode (MODO_VOLANDO) is read back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ, getMotionExtra, stateHash, MODO_PIE, MODO_VOLANDO, BTN_JUMP, BTN_RUN, BTN_BAJAR, createSim, spawnAvatar, getBody } from "../packages/sim/src/index.ts";
import { encodeSnapshot, decodeSnapshot } from "../packages/net/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { vuelo } from "../features/vuelo/feature.ts";
import { crearVuelo, NO_SE_VUELA } from "../features/vuelo/server.ts";
import vueloCliente from "../features/vuelo/client.ts";
import { leerVuelo, validarEntorno } from "../features/entorno/esquema.ts";
import { vueloDelMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

/** A headless world with chat and `vuelo`: n people; `constructores` = the entities `puede(…, "construir")` says yes to. */
function mundo(n: number, o: { vuelo?: "nadie" | "constructores" | "todos"; constructores?: Set<number> } = {}) {
  const log: string[] = [], reloj = { ms: Date.parse("2026-10-25T22:00:00Z") }, sign = signer("una-clave-de-prueba-larga");
  const constructores = o.constructores ?? new Set<number>();
  const inst = new Instance({
    seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearVuelo()], log: (l) => log.push(l), identitySign: sign,
    ...(o.vuelo ? { vuelo: o.vuelo } : {}), puede: (_who, accion, entity) => accion === "construir" && constructores.has(entity),
  });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms);
    const avisos: string[] = [], vuela: boolean[] = [];
    const s = new ClientSession(t, { features: [c.part, vueloCliente], identity: keeper(), view: { label() {}, bounce() {}, lleva() {} } });
    s.features.tap((f, e, m) => { if (f === "vuelo" && e === "rechazado") avisos.push(String(m.motivo)); if (f === "vuelo" && e === "vuela") vuela.push(m.activa === true); });
    return { t, s, chat: c.chat, avisos, vuela };
  });
  const pump = (ticks = 2, botones = 0) => { for (let k = 0; k < ticks; k++) { for (const c of gente) { c.s.tick(0, 0, botones); c.t.flush(); } inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  const modo = (p: { s: ClientSession }) => getMotionExtra(inst.sim, p.s.entity).modo;
  const y = (p: { s: ClientSession }) => fxToFloat(inst.sim.tf.cols.y[p.s.entity]);
  return { inst, gente, pump, decir, modo, y, log, constructores };
}

test("vuelo: declared for people and agents, in both lists; entorno.json `vuelo` reads nadie · constructores · todos, a wrong one says how to fix it", () => {
  assert.deepEqual(vuelo.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "vuelo") && paginas.some((f) => f.feature.id === "vuelo"));
  assert.deepEqual(leerVuelo({}), { ok: true, value: null }, "no key = nothing written (the world keeps 'nadie')");
  for (const v of ["nadie", "constructores", "todos"] as const) assert.deepEqual(leerVuelo({ vuelo: v }), { ok: true, value: v });
  const ko = leerVuelo({ vuelo: "siempre" });
  assert.ok(!ko.ok && ko.issues[0].path === "entorno.vuelo" && /nadie/.test(ko.issues[0].message));
  const v = validarEntorno({ vuelo: 3 });
  assert.ok(!v.ok && v.issues.some((i) => i.path === "entorno.vuelo"), "the whole file's check reports it too");
  const dicho: string[] = [];
  assert.equal(vueloDelMundo(() => ({ vuelo: "todos" })), "todos");
  assert.equal(vueloDelMundo(() => ({ vuelo: "ay" }), (l) => dicho.push(l)), null);
  assert.match(dicho.join(), /nadie vuela/);
});

test("vuelo: a world that says nothing — nobody flies: /volar and the intent are refused, nothing is ordered, and the person is told why", () => {
  const W = mundo(1);
  const [A] = W.gente;
  W.pump(4);
  W.decir(A, "/volar");
  assert.equal(W.modo(A), MODO_PIE);
  assert.deepEqual(A.avisos, [NO_SE_VUELA]);
  A.s.features.send("vuelo", "volar", { activa: true }); W.pump(TICK_HZ);
  assert.equal(W.modo(A), MODO_PIE, "a page that asks on its own gets nothing");
  assert.equal(A.avisos.length, 2);
  assert.match(W.log.join("\n"), /VOLAR rechazado \(sin permiso\)/);
});

test("vuelo: `todos` — /volar lifts the gravity (the height holds), Espacio climbs, BAJAR descends, /aterrizar puts you back on your feet", () => {
  const W = mundo(1, { vuelo: "todos" });
  const [A] = W.gente;
  W.pump(4);
  const suelo = W.y(A);
  W.decir(A, "/volar");
  assert.equal(W.modo(A), MODO_VOLANDO);
  assert.deepEqual(A.vuela, [true]);
  W.pump(TICK_HZ); assert.ok(Math.abs(W.y(A) - suelo) < 0.05, "flying, still: no gravity, no sinking");
  W.pump(TICK_HZ, BTN_JUMP); const alto = W.y(A);
  assert.ok(alto > suelo + 1.4, `Espacio climbs (${alto.toFixed(2)} m)`);
  W.pump(TICK_HZ / 2, BTN_BAJAR); assert.ok(W.y(A) < alto - 0.6, "BAJAR descends");
  W.pump(TICK_HZ * 2, BTN_JUMP); const mas = W.y(A);
  W.decir(A, "/aterrizar");
  assert.equal(W.modo(A), MODO_PIE);
  W.pump(TICK_HZ * 6);
  assert.ok(W.y(A) < mas - 2 && Math.abs(W.y(A) - suelo) < 0.05, "gravity is back: you land where the floor is");
  assert.deepEqual(A.vuela, [true, false]);
  assert.equal(A.avisos.length, 0);
});

test("vuelo: `constructores` — whoever may build flies, a visitor does not; a feature's grant (concederVuelo) lets one visitor fly in a world that says `nadie`", () => {
  const W = mundo(2, { vuelo: "constructores" });
  const [A, B] = W.gente;
  W.pump(4);
  W.constructores.add(A.s.entity);
  W.decir(A, "/volar"); W.decir(B, "/volar");
  assert.equal(W.modo(A), MODO_VOLANDO, "the builder flies");
  assert.equal(W.modo(B), MODO_PIE, "the visitor does not");
  assert.deepEqual(B.avisos, [NO_SE_VUELA]);
  const N = mundo(2); // the world says nothing
  const [C, D] = N.gente;
  N.pump(4);
  N.inst.concederVuelo(C.s.entity);
  N.decir(C, "/volar"); N.decir(D, "/volar");
  assert.equal(N.modo(C), MODO_VOLANDO, "the grant");
  assert.equal(N.modo(D), MODO_PIE, "nobody else");
  N.inst.concederVuelo(C.s.entity, false);
  N.decir(C, "/aterrizar"); N.decir(C, "/volar");
  assert.equal(N.modo(C), MODO_PIE, "the grant taken back: no new flight (landing is always allowed)");
});

test("vuelo: the order is recorded in the simulation — two worlds with the same script end on the same fingerprint, and flying changes it", () => {
  const corre = (volando: boolean) => {
    const W = mundo(1, { vuelo: "todos" });
    const [A] = W.gente;
    W.pump(4);
    if (volando) { W.decir(A, "/volar"); W.pump(TICK_HZ, BTN_JUMP); } else { W.pump(TICK_HZ + 2 + TICK_HZ, BTN_JUMP); }
    return stateHash(W.inst.sim);
  };
  assert.equal(corre(true), corre(true));
  assert.notEqual(corre(true), corre(false));
});

/** A flight script with sticks and buttons: climb, forward, run, descend, strafe up — `ticks` client ticks long, never still. */
const guion = (i: number): [number, number, number] => {
  const f = i % 60;
  if (f < 15) return [0, 0, BTN_JUMP];                    // straight up
  if (f < 30) return [0, -127, BTN_JUMP | BTN_RUN];       // forward and up, running
  if (f < 45) return [100, -60, BTN_BAJAR];               // diagonal and down
  return [-127, 0, 0];                                    // sideways at the same height
};

test("vuelo: the wire carries «vuela» (snapshot flags bit 3) and the page's one-avatar sim takes it", () => {
  const sim = createSim(1, 0); spawnAvatar(sim, 0);
  const antes = decodeSnapshot(encodeSnapshot(sim, 0, 0, []))!;
  assert.equal(antes.self.vuela, 0);
  sim.mo.cols.modo[0] = MODO_VOLANDO;
  const volando = decodeSnapshot(encodeSnapshot(sim, 0, 0, []))!;
  assert.equal(volando.self.vuela, 1);
  assert.deepEqual({ ...volando.self, id: undefined, vuela: undefined }, { ...antes.self, id: undefined, vuela: undefined }, "the other flag bits keep their place");
  assert.equal(getBody(sim, 0).vuela, 1);
});

for (const [nombre, retraso] of [["snapshots on time", 1], ["snapshots arriving in bursts every 4 ticks, 3+ inputs always pending", 4]] as const) {
  test(`vuelo: prediction flies with the server — no corrections over 400 ticks of climbing, running and descending (${nombre})`, () => {
    const W = mundo(2, { vuelo: "todos" });
    const [A, B] = W.gente;
    W.pump(4);
    W.decir(A, "/volar");
    assert.equal(W.modo(A), MODO_VOLANDO);
    const antes = A.s.stats.corrections, suelo = W.y(A);
    let maxAlto = suelo, minAlto = suelo;
    for (let i = 0; i < 400; i++) {
      const [mx, mz, b] = guion(i);
      A.s.tick(mx, mz, b); B.s.tick(0, 0, 0); B.t.flush();
      W.inst.tick(); B.t.flush();
      if ((i + 1) % retraso === 0) A.t.flush(); // what the server said arrives late and all at once; the page keeps predicting meanwhile
      const alto = A.s.selfPosition(1).y;
      maxAlto = Math.max(maxAlto, alto); minAlto = Math.min(minAlto, alto);
    }
    for (let k = 0; k < retraso + 2; k++) { A.s.tick(0, 0, 0); W.inst.tick(); A.t.flush(); }
    assert.equal(A.s.stats.corrections - antes, 0, "the server never had to move a flying player");
    assert.ok(maxAlto > suelo + 3, `it really climbed (${maxAlto.toFixed(1)} m)`);
    assert.ok(A.s.stats.snapshots > 100, "the server did answer");
  });
}

test("vuelo: landing — the flag goes back to 0 and the page walks again (gravity) with no correction either", () => {
  const W = mundo(1, { vuelo: "todos" });
  const [A] = W.gente;
  W.pump(4);
  W.decir(A, "/volar");
  W.pump(TICK_HZ, BTN_JUMP);
  W.decir(A, "/aterrizar");
  const antes = A.s.stats.corrections;
  W.pump(TICK_HZ * 8);
  assert.equal(W.modo(A), MODO_PIE);
  assert.ok(A.s.selfPosition(1).grounded, "back on the floor");
  assert.ok(A.s.stats.corrections - antes <= 1, `at most the one correction of the landing order itself (${A.s.stats.corrections - antes})`);
});
