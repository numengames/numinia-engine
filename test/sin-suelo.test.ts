// A world with no ground (entorno `suelo: "ninguno"`, floating islands: sky above and below). The file says it, the flat state
// carries it, and BOTH the server's sim and the page's prediction drop the flat floor at y = 0 — the world's own geometry (a platform,
// a GLB mesh) is the only floor — and a fall ends in D-045's void, not on thin air. A world that never says it is untouched: ground
// present, `piso` 0, and the reference fingerprint (pinned in test/engine.test.ts) is the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, step, setMesh, setSolids, solidsFrom, onFloor, groundHeight, sinSueloDelEstado, replayFingerprint, referenceRecording, REFERENCE, PISO_SIN_SUELO, SUELO_MINIMO_SIN_SUELO, CLAVE_ENTORNO } from "../packages/sim/src/index.ts";
import { Instance, SEGURO_CADA } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { encodeInput } from "../packages/net/src/index.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerPart, ClientPart } from "../packages/feature/src/index.ts";
import { crearSuelo } from "../features/suelo/server.ts";
import sueloClient from "../features/suelo/client.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import entornoClient from "../features/entorno/client.ts";
import { ESQUEMA, aFichero, porDefecto, validarEntorno } from "../features/entorno/esquema.ts";
import { SUELOS, ZONA } from "../features/entorno/feature.ts";
import catalogo from "../features/entorno/suelos.json" with { type: "json" };

test("entorno.json: suelo.tipo «ninguno» is a ground like the others (flat field `suelo`); the default is still the grass; the file round-trips", () => {
  assert.ok((SUELOS as readonly string[]).includes("ninguno"));
  assert.equal(SUELOS[0], "hierba", "the first value is the enum's default: it must stay the grass");
  assert.equal(porDefecto().suelo, "hierba");
  assert.ok(catalogo.suelos.ninguno, "the Entorno panel lists it by name");
  const r = validarEntorno({ schema: ESQUEMA, suelo: { tipo: "ninguno" } });
  assert.ok(r.ok); assert.equal(r.ok && r.value.suelo, "ninguno");
  assert.equal(((aFichero(r.ok ? r.value : porDefecto()).suelo) as { tipo: string }).tipo, "ninguno");
  const vuelta = validarEntorno(aFichero(r.ok ? r.value : porDefecto()));
  assert.deepEqual(vuelta.ok && vuelta.value, r.ok && r.value, "file → flat → file is lossless");
  const mal = validarEntorno({ schema: ESQUEMA, suelo: { tipo: "lava" } });
  assert.ok(!mal.ok && mal.issues.some((i) => i.path === "entorno.suelo.tipo"), "a wrong value still names its path");
});

test("sim: sinSueloDelEstado reads only the entorno zone's `suelo`; with no flat floor a body falls through y = 0; the reference fingerprint stands", () => {
  const zona = (suelo: unknown): [string, Record<string, unknown>][] => [["otra:cosa", { suelo: "ninguno" }], [CLAVE_ENTORNO, { suelo }]];
  assert.equal(CLAVE_ENTORNO, `entorno:${ZONA}`);
  assert.equal(sinSueloDelEstado(zona("ninguno")), true);
  for (const v of ["hierba", "liso", "", undefined]) assert.equal(sinSueloDelEstado(zona(v)), false, String(v));
  assert.equal(sinSueloDelEstado([]), false, "a world without the entorno feature has its ground");

  // the same world, with and without the flat floor: nothing but `piso` differs
  const quieto = new Int32Array(4);
  const conSuelo = createSim(4, 1), sin = createSim(4, 1);
  const a = spawnAvatar(conSuelo, 0), b = spawnAvatar(sin, 0);
  setMesh(sin, null, PISO_SIN_SUELO);
  for (let t = 0; t < 30; t++) { quieto[0] = a; step(conSuelo, quieto); quieto[0] = b; step(sin, quieto); }
  assert.equal(conSuelo.tf.cols.y[a], 0, "default: the flat plaza holds you at y = 0");
  assert.ok(sin.tf.cols.y[b] < fx(-1), `no ground: you fall, got ${fxToFloat(sin.tf.cols.y[b])}`);
  assert.ok(!onFloor(sin, b));
  assert.equal(groundHeight(0, 0, sin, 0), PISO_SIN_SUELO, "the ground under (0, 0) is the world's far floor, not y = 0");
  assert.equal(groundHeight(0, 0), 0, "the pure flat answer (no state) is as it always was");
  // a platform is still a floor when the flat one is gone
  const isla = createSim(4, 1); setSolids(isla, solidsFrom([["p", { solido: true, bx0: -6, by0: 0, bz0: -6, bx1: 6, by1: 3, bz1: 6 }]])); setMesh(isla, null, PISO_SIN_SUELO);
  const c = spawnAvatar(isla, 0); isla.tf.cols.x[c] = 0; isla.tf.cols.z[c] = 0; isla.tf.cols.y[c] = fx(3);
  for (let t = 0; t < 30; t++) { quieto[0] = c; step(isla, quieto); }
  assert.equal(isla.tf.cols.y[c], fx(3)); assert.ok(onFloor(isla, c));

  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965, "reference fingerprint (sim 3) unchanged: `piso` is 0 unless a world says otherwise");
});

/** A feature that only puts a solid platform in the world (x −6…6, y 0…3, z −6…6): the island. */
const plataforma = defineFeature({ id: "plataforma", version: 1, level: "base", describe: "una plataforma sólida", intents: {}, events: {},
  state: { describe: "cajas", fields: { solido: { kind: "bool" }, bx0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, by0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bz0: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bx1: { kind: "fixed", min: -100, max: 100, step: 0.01 }, by1: { kind: "fixed", min: -100, max: 100, step: 0.01 }, bz1: { kind: "fixed", min: -100, max: 100, step: 0.01 } } } });
const plataformaServer: ServerPart = serverPart(plataforma, (api) => { api.state.set("p", { solido: true, bx0: -6, by0: 0, bz0: -6, bx1: 6, by1: 3, bz1: 6 }); });

function mundo(suelo: "ninguno" | "hierba", sueloMundo: Parameters<typeof crearSuelo>[0] = null) {
  const log: string[] = [];
  const inst = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2,
    features: [plataformaServer, crearSuelo(sueloMundo), crearEntorno({ schema: ESQUEMA, suelo: { tipo: suelo } })],
    log: (l) => log.push(l), puede: () => true, suelo: sueloMundo, aparicion: { x: 0, z: 0, radio: 1 } });
  const t = inst.join(0);
  const parts: ClientPart[] = [sueloClient, entornoClient];
  const s = new ClientSession(t, { features: parts, view: { label() {}, bounce() {}, fundido() {} } });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { t.flush(); inst.tick(); t.flush(); } };
  return { inst, t, s, pump, log };
}
const pos = (inst: Instance, e: number) => ({ x: fxToFloat(inst.sim.tf.cols.x[e]), y: fxToFloat(inst.sim.tf.cols.y[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) });

/** Stand on the island, run off its +x edge, let go of the stick and wait 2.5 s; returns the lowest height the SERVER body and the page's prediction reached. */
function caerse(w: ReturnType<typeof mundo>) {
  w.pump(2);
  const e = w.s.entity; assert.ok(e >= 0);
  w.inst.sim.tf.cols.x[e] = fx(0); w.inst.sim.tf.cols.z[e] = fx(0); w.inst.sim.tf.cols.y[e] = fx(3);
  w.pump(SEGURO_CADA + 1);
  assert.equal(pos(w.inst, e).y, 3); assert.ok(onFloor(w.inst.sim, e));
  let seq = 0, bajoServidor = Infinity, bajoPagina = Infinity;
  const avanzar = (n: number, mx: number) => { for (let i = 0; i < n; i++) {
    w.t.send(encodeInput(++seq & 0xffff, mx, 0, 2), false); w.s.tick(mx / 127, 0, 2); w.pump(1);
    bajoServidor = Math.min(bajoServidor, pos(w.inst, e).y); bajoPagina = Math.min(bajoPagina, w.s.selfPosition(1).y);
  } };
  avanzar(36, 127);   // 7.2 m at a run: over the edge (6 m)
  avanzar(140, 0);    // stick released, 7 s: a fall to the void at terminal speed and the return
  return { e, bajoServidor, bajoPagina };
}

test("instance + page: with `suelo: ninguno` walking off the island is a real fall past y = 0 (server and prediction agree) and the void brings you back", () => {
  const w = mundo("ninguno"); w.pump(2);
  assert.equal(w.s.features.stateOf("entorno").get(ZONA)?.suelo, "ninguno", "the page has the world's state");
  const { e, bajoServidor, bajoPagina } = caerse(w);
  assert.ok(bajoServidor < -1, `the server body went under y = 0, lowest ${bajoServidor}`);
  assert.ok(bajoPagina < -1, `the page predicts the same fall, lowest ${bajoPagina}`);
  assert.ok(bajoServidor > SUELO_MINIMO_SIN_SUELO - 20, `the void caught it near the default minimum (checked twice a second), lowest ${bajoServidor}`);
  const p = pos(w.inst, e);
  assert.equal(p.y, 3, "back on the island, standing"); assert.ok(p.x <= 6 && p.x > 4, `last safe x, got ${p.x}`);
  assert.ok(w.log.some((l) => l.includes("[suelo] tick") && l.includes("orden(es)")), "the return went through the step (recorded)");
  assert.ok(w.s.features.log.some((l) => l.feature === "suelo" && l.event === "vuelta" && l.msg.motivo === "caida"));
});

test("instance + page: the same world with the ground (the default) stops the fall at y = 0 and nobody is moved on their own", () => {
  const w = mundo("hierba");
  const { e, bajoServidor, bajoPagina } = caerse(w);
  assert.equal(bajoServidor >= 0, true, `server never under the flat floor, lowest ${bajoServidor}`);
  assert.equal(bajoPagina >= 0, true, `page never under the flat floor, lowest ${bajoPagina}`);
  assert.equal(pos(w.inst, e).y, 0, "standing on the flat ground");
  assert.ok(!w.log.some((l) => l.includes("[suelo] tick")));
});

test("instance: the world's own `sueloMinimo` and `vuelta` win over the default void of a world with no ground", () => {
  const w = mundo("ninguno", { minimo: -20, vuelta: { x: 1, y: 3, z: 1, siempre: true } });
  const { e, bajoServidor } = caerse(w);
  assert.ok(bajoServidor < -19 && bajoServidor > -40, `fell to its own minimum (−20), lowest ${bajoServidor}`);
  assert.deepEqual(pos(w.inst, e), { x: 1, y: 3, z: 1 });
});

test("instance: switching the ground off live (the Entorno panel) takes the flat floor away from the people already there, and back on puts it again", () => {
  const w = mundo("hierba");
  w.pump(2);
  const e = w.s.entity, plano = w.s.features.stateOf("entorno").get(ZONA)!;
  let seq = 0;
  const quieto = (n: number) => { for (let i = 0; i < n; i++) { w.t.send(encodeInput(++seq & 0xffff, 0, 0, 0), false); w.s.tick(0, 0, 0); w.pump(1); } }; // a body only moves on its own inputs
  quieto(5); assert.equal(pos(w.inst, e).y, 0);
  // the builder picks «ninguno» in the panel (the intent `ajustar` carries the whole flat state)
  const r = w.s.features.send("entorno", "ajustar", { ...plano, suelo: "ninguno" }); assert.equal(r.ok, true, JSON.stringify(r));
  quieto(30); assert.equal(w.s.features.stateOf("entorno").get(ZONA)?.suelo, "ninguno");
  assert.ok(pos(w.inst, e).y < -1, `no floor under them any more: they fell, got ${pos(w.inst, e).y}`);
  assert.ok(w.s.selfPosition(1).y < -1, "and the page predicts the fall too");
  w.s.features.send("entorno", "ajustar", { ...plano, suelo: "hierba" }); quieto(5);
  assert.equal(pos(w.inst, e).y, 0, "the flat floor is back and holds them at y = 0");
});
