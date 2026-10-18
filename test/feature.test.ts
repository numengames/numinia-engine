// J7: the plug for game features. Everything here runs headless over the in-memory transport,
// except the HTTP test, which starts a real server on a free port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { defineSchema, validate, fieldBits } from "../packages/schema/src/index.ts";
import { BitWriter, BitReader, writeFields, readFields, MSG } from "../packages/net/src/index.ts";
import type { Fields } from "../packages/net/src/index.ts";
import { defineFeature, serverPart, clientPart, buildCatalog, encodeCatalog, decodeCatalog, DEFAULT_RATE, NEAR_RADIUS_M, QUEUE_PER_PLAYER } from "../packages/feature/src/index.ts";
import type { ServerPart, ClientPart } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { gestos, GESTOS } from "../features/gestos/feature.ts";
import gestosServer from "../features/gestos/server.ts";
import gestosClient from "../features/gestos/client.ts";
import funciones from "../features/servidor.ts";

/** A headless world: one instance, n clients with the given client parts, and a pump that moves bytes. */
function world(features: ServerPart[], n: number, parts: ClientPart[] = [], seed = 1) {
  const log: string[] = [];
  const inst = new Instance({ seed, capacity: 16, k: 50, snapshotEvery: 2, features, log: (l) => log.push(l) });
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i);
    const seen: string[] = [];
    const s = new ClientSession(t, { features: parts, view: { label: (e, text) => seen.push(`label ${e} ${text}`), bounce: (e) => seen.push(`bounce ${e}`) } });
    return { t, s, seen };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, clients, pump, place, log };
}

test("schema: enum and text fields validate (UTF-8 bytes, not characters) and cost what they say", () => {
  const S = defineSchema("Prueba", 1, { g: { kind: "enum", values: ["saludar", "bailar"] }, t: { kind: "text", maxBytes: 4 } });
  assert.ok(validate(S, { g: "bailar", t: "ññ" }).ok);                  // ñ is 2 bytes: 4 in total
  const bad = validate(S, { g: "volar", t: "ñññ" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.issues.map((i) => i.path), ["Prueba.g", "Prueba.t"]);
  assert.equal(fieldBits(S.fields.g), 1);
  assert.equal(fieldBits(S.fields.t), 3 + 32);                         // length in 3 bits + 4 bytes
});

test("codec: every field kind survives a round trip; long text is cut on a character; bad bits give null", () => {
  const F: Fields = {
    a: { kind: "int", min: -5, max: 5 }, b: { kind: "fixed", min: -10, max: 10, step: 0.5 }, c: { kind: "bool" },
    d: { kind: "enum", values: ["x", "y", "z"] }, e: { kind: "text", maxBytes: 8 },
  };
  const w = new BitWriter(); writeFields(w, F, { a: -3, b: 2.5, c: true, d: "z", e: "añ€" }); // 1 + 2 + 3 bytes
  const bytes = w.finish();
  assert.deepEqual(readFields(new BitReader(bytes), F), { a: -3, b: 2.5, c: true, d: "z", e: "añ€" });
  assert.equal(readFields(new BitReader(bytes.subarray(0, bytes.length - 1)), F), null); // truncated

  const T: Fields = { e: { kind: "text", maxBytes: 8 } };
  const w2 = new BitWriter(); writeFields(w2, T, { e: "€€€" });          // 9 bytes: cut to 6, never mid-character
  assert.deepEqual(readFields(new BitReader(w2.finish()), T), { e: "€€" });

  const w3 = new BitWriter(); w3.write(3, 2);                             // int 0..2 holds 2 bits: 3 is impossible
  assert.equal(readFields(new BitReader(w3.finish()), { n: { kind: "int", min: 0, max: 2 } }), null);
  const w4 = new BitWriter(); w4.write(3, 2);                             // enum of 3 words: index 3 is impossible
  assert.equal(readFields(new BitReader(w4.finish()), { d: F.d }), null);
});

test("catalog: fixed numbering, schemas and descriptions inside; what agents read as verbs", () => {
  const { catalog, entries } = buildCatalog(funciones.map((f) => f.feature));
  const g = catalog.features.find((f) => f.id === "gestos")!;
  assert.equal(g.intents[0].name, "hacer");
  assert.deepEqual(g.intents[0].fields.gesto, { kind: "enum", values: GESTOS }); // J7b: the moves of the wheel + «parar»
  assert.deepEqual(GESTOS.slice(0, 3), ["saludar", "hablar", "bailar"]);
  assert.equal(GESTOS.at(-1), "parar");
  assert.ok(g.describe && g.intents[0].describe && g.events[0].describe);
  assert.deepEqual(entries.map((e) => e.index), entries.map((_, i) => i));
  assert.deepEqual(decodeCatalog(encodeCatalog(catalog)), catalog);
  assert.equal(encodeCatalog(catalog)[0], MSG.CATALOG);
});

test("a broken declaration is skipped with a reason; the other features still load", () => {
  const rota = defineFeature({ id: "Mal Nombre", version: 0, describe: "", intents: { "X-y": { describe: "", fields: { n: { kind: "int", min: 5, max: 1 } } } } });
  assert.ok(rota.issues.length >= 4);
  const { clients, pump, log } = world([serverPart(rota, () => {}), gestosServer], 1, [gestosClient]);
  pump();
  assert.deepEqual(clients[0].s.features.catalog?.features.map((f) => f.id), ["gestos"]);
  assert.ok(log.some((l) => l.includes("no se carga") && l.includes("lowercase id")));
});

test("gestos, end to end: A waves, B (10 m) sees it, C (200 m) does not; the simulation never notices", () => {
  const W = world([gestosServer], 3, [gestosClient]);
  const [A, B, C] = W.clients;
  W.pump();
  W.place(A.s.entity, 0, 0); W.place(B.s.entity, 10, 0); W.place(C.s.entity, 200, 0);
  const plain = world([], 3);                       // same seed, same joins, no features
  plain.pump();
  plain.place(0, 0, 0); plain.place(1, 10, 0); plain.place(2, 200, 0);

  A.s.features.actions().find((a) => a.id === "saludar")!.run(); // the G key / the touch button
  W.pump(); plain.pump();
  const heard = (c: typeof A) => c.s.features.log.filter((e) => e.event === "hecho").map((e) => e.msg);
  assert.deepEqual(heard(B), [{ quien: A.s.entity, gesto: "saludar" }]);
  assert.deepEqual(heard(A), [{ quien: A.s.entity, gesto: "saludar" }]); // you see your own gesture
  assert.deepEqual(heard(C), []);
  assert.deepEqual(B.seen, [`label ${A.s.entity} ¡Hola!`]);

  assert.equal(B.s.features.send("gestos", "hacer", { gesto: "bailar" }).ok, true);
  W.pump(40); plain.pump(40);
  assert.ok(A.seen.includes(`bounce ${B.s.entity}`));
  assert.equal(W.inst.hash(), plain.inst.hash(), "features must never change the simulation");
});

test("limits: rate per player and intent, malformed messages counted, nothing thrown", () => {
  const W = world([gestosServer], 2, [gestosClient]);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0);
  for (let i = 0; i < 10; i++) A.s.features.send("gestos", "hacer", { gesto: "saludar" });
  W.pump();
  assert.equal(W.inst.features.stats.received, 10);
  assert.equal(W.inst.features.stats.dropped, 7);   // burst 3 for gestures
  assert.equal(B.s.features.log.length, 3);

  assert.equal(A.s.features.send("gestos", "hacer", { gesto: "volar" }).ok, false); // refused before the wire
  assert.equal(A.s.features.send("gestos", "nadar", {}).ok, false);
  for (const raw of [[MSG.FEATURE], [MSG.FEATURE, 0xff, 0xff], [MSG.FEATURE, 0, 1], [MSG.FEATURE, 0, 0]]) A.t.send(new Uint8Array(raw), true);
  W.pump();                                          // unknown index, an event index, a truncated intent
  assert.equal(W.inst.conns[0].bad, 4);
  assert.equal(W.inst.features.stats.bad, 4);
});

test("defaults (limits.json): burst of 8 per intent, 32 waiting per player and tick, 32 m reach, text up to 512 bytes", () => {
  assert.deepEqual(DEFAULT_RATE, { perSecond: 4, burst: 8 });
  assert.equal(NEAR_RADIUS_M, 32);
  assert.equal(QUEUE_PER_PLAYER, 32);
  const eco = defineFeature({
    id: "eco", version: 1, describe: "Prueba de los valores por defecto.",
    intents: {
      uno: { describe: "Sin ritmo propio.", spoken: "uno", fields: {} },
      muchos: { describe: "Con ritmo alto.", spoken: "muchos", fields: {}, rate: { perSecond: 100, burst: 100 } },
    },
    events: { oido: { describe: "Eco para quien esté cerca.", fields: {}, announce: { text: "Eco", sound: "suave" } } },
  });
  let muchos = 0;
  const ecoServer = serverPart(eco, (api) => {
    api.on("uno", (from) => api.emit("oido", {}, { near: from })); // no radius: the default reach
    api.on("muchos", () => { muchos++; });
  });
  const W = world([ecoServer], 3);
  const [A, B, C] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 31, 0); W.place(C.s.entity, 0, 33);
  for (let i = 0; i < 12; i++) A.s.features.send("eco", "uno", {});
  W.pump();
  assert.equal(W.inst.features.stats.dropped, 4);
  assert.equal(B.s.features.log.length, 8);          // 31 m: inside
  assert.equal(C.s.features.log.length, 0);          // 33 m: outside
  for (let i = 0; i < 40; i++) B.s.features.send("eco", "muchos", {});
  W.pump();
  assert.equal(muchos, 32);
  assert.equal(W.inst.features.stats.dropped, 4 + 8);
  const larga = defineFeature({ id: "larga", version: 1, describe: "Texto demasiado largo.", intents: { decir: { describe: "Dice.", spoken: "decir", fields: { t: { kind: "text", maxBytes: 513 } } } } });
  assert.ok(larga.issues.some((i) => i.message.includes("between 1 and 512")));
});

const marcador = defineFeature({
  id: "marcador", version: 1, describe: "Puntos por nombre (prueba del estado compartido).",
  intents: {
    sumar: { describe: "Suma un punto.", spoken: "sumar un punto", fields: { quien: { kind: "text", maxBytes: 16 } }, rate: { perSecond: 20, burst: 20 } },
    borrar: { describe: "Borra un nombre.", spoken: "borrar", fields: { quien: { kind: "text", maxBytes: 16 } } },
  },
  state: { describe: "Puntos de cada nombre.", fields: { puntos: { kind: "int", min: 0, max: 100 } } },
});
const marcadorServer = serverPart(marcador, (api) => {
  api.on("sumar", (_from, m) => {
    const k = String(m.quien);
    if (k === "trampa") { api.state.set(k, { puntos: 500 }); return; } // out of range: refused
    api.state.set(k, { puntos: Number(api.state.get(k)?.puntos ?? 0) + 1 });
  });
  api.on("borrar", (_from, m) => api.state.delete(String(m.quien)));
});
const marcadorClient = clientPart(marcador, () => {});

test("shared state: everyone gets changes, a late joiner gets what exists, deletes travel, bad values stay out", () => {
  const W = world([marcadorServer], 2, [marcadorClient]);
  const [A, B] = W.clients;
  W.pump();
  A.s.features.send("marcador", "sumar", { quien: "ana" });
  A.s.features.send("marcador", "sumar", { quien: "ana" });
  A.s.features.send("marcador", "sumar", { quien: "trampa" });
  W.pump();
  const mine = (c: typeof A, k: string) => c.s.features.stateOf("marcador").get(k);
  assert.deepEqual(mine(B, "ana"), { puntos: 2 });
  assert.equal(mine(B, "trampa"), undefined);
  assert.ok(W.log.some((l) => l.includes("[marcador] state.set('trampa') no cumple su esquema")));

  const t = W.inst.join(9);                          // a late joiner
  const late = new ClientSession(t, { features: [marcadorClient] });
  t.flush();
  assert.deepEqual(late.features.stateOf("marcador").get("ana"), { puntos: 2 });

  B.s.features.send("marcador", "borrar", { quien: "ana" });
  W.pump(); t.flush();
  assert.equal(mine(A, "ana"), undefined);
});

test("a feature that throws is isolated: logged once, counted, the instance and the others keep going", () => {
  const roto = defineFeature({ id: "roto", version: 1, describe: "Falla a propósito.", intents: { romper: { describe: "Rompe.", spoken: "romper", fields: {} } } });
  const rotoServer = serverPart(roto, (api) => {
    api.on("romper", () => { throw new Error("adrede"); });
    api.onTick(() => { throw new Error("en cada tick"); });
  });
  const W = world([rotoServer, gestosServer], 2, [gestosClient]);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 3, 0);
  assert.equal(A.s.features.send("roto", "romper", {}).ok, true); // the page needs no part to use a verb
  A.s.features.send("gestos", "hacer", { gesto: "saludar" });
  W.pump(5);
  assert.equal(B.s.features.log.length, 1);
  assert.ok(W.inst.features.stats.errors >= 6);
  assert.equal(W.log.filter((l) => l.includes("'roto' falló en onTick")).length, 1, "logged once, not every tick");
  assert.ok(W.log.some((l) => l.includes("'roto' falló en on('romper'): adrede")));
});

test("versions and absences: a newer page reads the server's messages; no features = the pre-J7 wire", () => {
  const v2 = clientPart(defineFeature({ ...gestos, version: gestos.version + 1 }), (api) => api.on("hecho", () => {})); // J7b: gestos is 2 now
  const W = world([gestosServer], 1, [v2]);
  W.pump();
  W.clients[0].s.features.send("gestos", "hacer", { gesto: "bailar" });
  W.pump();
  assert.ok(W.clients[0].s.features.warnings.some((w) => w.includes(`versión ${gestos.version + 1}, en el servidor ${gestos.version}`)));
  assert.equal(W.clients[0].s.features.log.length, 1);

  const bare = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2 });
  const t = bare.join(0), types: number[] = [];
  t.onMessage((b) => types.push(b[0]));
  for (let i = 0; i < 4; i++) { bare.tick(); t.flush(); }
  assert.deepEqual([...new Set(types)].sort(), [MSG.SNAPSHOT, MSG.WELCOME]);
  const lone = new ClientSession(bare.join(1), { features: [gestosClient] });
  assert.equal(lone.features.send("gestos", "hacer", { gesto: "saludar" }).ok, false);
});

test("HTTP: a feature's routes answer on the instance's port; engine paths stay the engine's", async () => {
  const prueba = defineFeature({ id: "prueba", version: 1, describe: "Rutas de prueba." });
  const pruebaServer = serverPart(prueba, (api) => {
    api.route("GET", "/prueba/hola/:nombre", (req) => ({ body: { saludo: `hola ${req.params.nombre}` } }));
    api.route("POST", "/prueba/eco", (req) => ({ type: "text", body: req.body }));
    api.route("GET", "/health", () => ({ body: "no" }));          // refused: the engine's
    api.route("GET", "/prueba/roto", () => { throw new Error("adrede"); });
  });
  const lines: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, features: [pruebaServer], log: (l) => lines.push(l) });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    assert.deepEqual(await (await fetch(`${base}/prueba/hola/Jos%C3%A9`)).json(), { saludo: "hola José" });
    const eco = await fetch(`${base}/prueba/eco`, { method: "POST", body: "abc" });
    assert.equal(eco.status, 200); assert.equal(await eco.text(), "abc");
    assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
    assert.equal((await fetch(`${base}/prueba/roto`)).status, 500);
    const nf = await fetch(`${base}/nada`);
    assert.equal(nf.status, 404);
    assert.ok((await nf.json()).hay.includes("GET /prueba/hola/:nombre (prueba)"));
    assert.equal((await fetch(`${base}/prueba/eco`, { method: "POST", body: "x".repeat(5000) })).status, 413);
    assert.ok(lines.some((l) => l.includes("/health es del motor")));
  } finally { await srv.close(); }
});
