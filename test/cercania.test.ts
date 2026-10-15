// J9: things a feature puts in the world (state set with `at`) reach only the players near them; as people
// move, each gets what comes near and forgets what goes far (with a margin, so nothing flickers at the edge).
// Global state (no `at`) still reaches everyone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { defineFeature, serverPart, clientPart, ServerRuntime, NearIndex, STATE_RADIUS_M, STATE_REFRESH_TICKS, FORGET_FACTOR } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const cosas = defineFeature({
  id: "cosas", version: 1, describe: "Cosas en el mundo (prueba de J9).",
  state: {
    describe: "Cada cosa y su color.", radius: 40,
    fields: { color: { kind: "int", min: 0, max: 9 }, x: { kind: "fixed", min: -1000, max: 1000, step: 0.25 }, z: { kind: "fixed", min: -1000, max: 1000, step: 0.25 } },
    card: { role: "objeto", name: "Cosa {key}", at: ["x", "z"] },
  },
});

function world(n: number) {
  let api!: ServerApi;
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [serverPart(cosas, (a) => { api = a; })] });
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = { t, cambios: 0, s: null as unknown as ClientSession };
    c.s = new ClientSession(t, { features: [clientPart(cosas, (api) => api.state.onChange(() => { c.cambios++; }))] });
    return c;
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const has = (c: (typeof clients)[number]) => [...c.s.features.stateOf("cosas").keys()].sort();
  const thing = (key: string, x: number, z: number) => api.state.set(key, { color: 1, x, z }, { at: { x, z } });
  return { inst, clients, pump, place, has, thing, api: () => api };
}

test("a thing reaches only who is within its radius; global state reaches everyone; the catalog says the radius", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 300, 0);
  W.thing("cerca", 10, 0); W.thing("lejos", 290, 0);
  W.pump();
  assert.deepEqual(W.has(A), ["cerca"]);
  assert.deepEqual(W.has(B), ["lejos"]);
  W.api().state.set("anuncio", { color: 3, x: 0, z: 0 }); // no `at`: global
  W.pump();
  assert.deepEqual(W.has(A), ["anuncio", "cerca"]);
  assert.deepEqual(W.has(B), ["anuncio", "lejos"]);
  assert.equal(A.s.features.catalog?.features[0].state?.radius, 40);
  assert.deepEqual(A.s.features.cards().map((c) => c.name).sort(), ["Cosa anuncio", "Cosa cerca"]);
});

test("walking: what comes near arrives; what goes past radius × FORGET_FACTOR is forgotten; in between it stays", () => {
  const W = world(1);
  const [A] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0);
  W.thing("fuente", 100, 0);
  W.pump(STATE_REFRESH_TICKS);
  assert.deepEqual(W.has(A), []);
  W.place(A.s.entity, 70, 0);                 // 30 m: inside 40
  W.pump(STATE_REFRESH_TICKS);
  assert.deepEqual(W.has(A), ["fuente"]);
  W.place(A.s.entity, 55, 0);                 // 45 m: past the radius, inside 40 × 1.25 = 50
  W.pump(STATE_REFRESH_TICKS);
  assert.deepEqual(W.has(A), ["fuente"], "no flicker at the edge");
  W.place(A.s.entity, 40, 0);                 // 60 m: forgotten
  W.pump(STATE_REFRESH_TICKS);
  assert.deepEqual(W.has(A), []);
  assert.equal(FORGET_FACTOR, 1.25);
});

test("a thing that moves away is forgotten by who had it; deleting it reaches only who had it", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 500, 0);
  W.thing("bola", 5, 0);
  W.pump();
  assert.deepEqual(W.has(A), ["bola"]);
  W.thing("bola", 495, 0);                    // moved next to B
  W.pump();
  assert.deepEqual(W.has(A), []);
  assert.deepEqual(W.has(B), ["bola"]);
  const before = A.cambios;
  W.api().state.delete("bola");
  W.pump();
  assert.deepEqual(W.has(B), []);
  assert.equal(A.cambios, before, "A no longer had it: it hears nothing");
});

test("a late joiner gets only the near things, and a global entry that becomes a placed thing leaves the far players", () => {
  const W = world(1);
  const [A] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0);
  W.api().state.set("cartel", { color: 1, x: 0, z: 0 });   // global first
  W.pump();
  assert.deepEqual(W.has(A), ["cartel"]);
  W.thing("cartel", 800, 0);                               // now a thing far away
  W.pump();
  assert.deepEqual(W.has(A), []);
  for (let i = 0; i < 30; i++) W.thing(`t${i}`, i * 30, 0); // 0..870 m along x
  const t = W.inst.join(9);
  const late = new ClientSession(t, { features: [clientPart(cosas, () => {})] });
  t.flush();                                               // joins at spawn (near 0, 0)
  const got = [...late.features.stateOf("cosas").keys()];
  assert.ok(got.length > 0 && got.length <= 4, `only near things on join, got ${got.length}`);
});

test(`cost: 1,000 players and 2,000 things over 1 km² — one refresh pass (every ${STATE_REFRESH_TICKS} ticks)`, () => {
  // a bare runtime with a fake host: no sockets, only the bookkeeping that runs every 0.5 s
  const N = 1000, T = 2000, pos: { x: number; z: number }[] = [];
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = 0; i < N; i++) pos.push({ x: rnd() * 1000 - 500, z: rnd() * 1000 - 500 });
  let sent = 0, api!: ServerApi;
  const rt = new ServerRuntime([serverPart(cosas, (a) => { api = a; })], { players: () => [...Array(N).keys()], position: (e) => pos[e], send: () => { sent++; }, tick: () => 0, log: () => {} });
  for (let i = 0; i < T; i++) { const x = rnd() * 1000 - 500, z = rnd() * 1000 - 500; api.state.set(`c${i}`, { color: 1, x, z }, { at: { x, z } }); }
  rt.refreshNear();                                        // first pass fills everyone
  for (const p of pos) { p.x += 2; p.z += 1; }             // everyone walks ~2 m
  sent = 0;
  const t0 = performance.now(); rt.refreshNear(); const ms = performance.now() - t0;
  const t1 = performance.now(); rt.refreshNear(3); const slice = performance.now() - t1;
  console.log(`[J9] refresh with ${N} players × ${T} things (radius 40 m): all ${ms.toFixed(1)} ms (${sent} messages) · per tick (a tenth) ${slice.toFixed(2)} ms`);
  assert.ok(ms < 100, `a refresh pass took ${ms.toFixed(1)} ms`);
  assert.ok(slice < 20, `a tenth took ${slice.toFixed(1)} ms`);
  assert.ok(new NearIndex(STATE_RADIUS_M).around(0, 0).length === 0);
});
