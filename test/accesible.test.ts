// V1: accessibility is part of a feature's declaration. Every verb has a spoken name, every event says what a
// person hears and reads (or that it is silent), and whatever a feature puts in the world carries a card.
// Screen readers, the engine's voice (V3) and AI agents read the same data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { defineFeature, serverPart, clientPart, buildCatalog, fillTemplate, SOUNDS } from "../packages/feature/src/index.ts";
import type { ServerPart, ClientPart, Announcement } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import gestosServer from "../features/gestos/server.ts";
import gestosClient from "../features/gestos/client.ts";
import servidor from "../features/servidor.ts";
import cliente from "../features/cliente.ts";

function world(features: ServerPart[], n: number, parts: ClientPart[] = []) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features, log: (l) => log.push(l) });
  const heard: Announcement[][] = [];
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i);
    const mine: Announcement[] = []; heard.push(mine);
    const s = new ClientSession(t, { features: parts, view: { label() {}, bounce() {}, announce: (a) => mine.push(a) } });
    return { t, s };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, clients, pump, place, log, heard };
}

test("every feature the server and the page run meets the accessibility rules", () => {
  for (const p of [...servidor, ...cliente]) assert.deepEqual(p.feature.issues, [], p.feature.id);
});

test("a verb without a spoken name is refused, and the message says how to fix it", () => {
  const f = defineFeature({ id: "muda", version: 1, describe: "Sin nombre hablado.", intents: { tocar: { describe: "Toca.", fields: {} } as never } });
  const i = f.issues.find((x) => x.path === "muda.intents.tocar.spoken");
  assert.ok(i, "issue on .spoken");
  assert.match(i!.message, /spoken: "saludar"/);
  const { log, clients, pump } = world([serverPart(f, () => {}), gestosServer], 1);
  pump();
  assert.deepEqual(clients[0].s.features.catalog?.features.map((x) => x.id), ["gestos"]);
  assert.ok(log.some((l) => l.includes("'muda' no se carga") && l.includes("spoken")));
});

test("an event must say what a person hears and reads, or declare itself silent; holes must be fields", () => {
  const sin = defineFeature({ id: "sorda", version: 1, describe: "x", events: { pasa: { describe: "Pasa.", fields: {} } as never } });
  assert.ok(sin.issues.some((x) => x.path === "sorda.events.pasa.announce" && x.message.includes('"silent"')));
  const mala = defineFeature({ id: "mala", version: 1, describe: "x", events: { pasa: { describe: "Pasa.", fields: { n: { kind: "int", min: 0, max: 9 } }, announce: { text: "Pasa {m}", sound: "trompeta" as never, importance: 7 as never, at: ["n", "q"] } } } });
  const paths = mala.issues.map((x) => x.path).sort();
  assert.deepEqual(paths, ["mala.events.pasa.announce.at", "mala.events.pasa.announce.importance", "mala.events.pasa.announce.sound", "mala.events.pasa.announce.text"]);
  assert.match(mala.issues.find((x) => x.path.endsWith(".text"))!.message, /\{m\} is not a field here \(fields: n\)/);
  const callada = defineFeature({ id: "callada", version: 1, describe: "x", events: { pulso: { describe: "Técnico.", fields: {}, announce: "silent" } } });
  assert.deepEqual(callada.issues, []);
  assert.ok(SOUNDS.includes("suave"));
});

test("gestos: whoever is near hears it as text + sound, located on the person who did it", () => {
  const W = world([gestosServer], 2, [gestosClient]);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 10, 0);
  A.s.features.send("gestos", "hacer", { gesto: "saludar" });
  W.pump();
  const want = { feature: "gestos", event: "hecho", text: "Gesto: saludar", sound: "suave", importance: 1, who: A.s.entity };
  assert.deepEqual(W.heard[1], [want]);                      // the view's announce hook (aria-live, V3 voice)
  assert.deepEqual(B.s.features.announcements, [want]);      // and the log an agent or a test reads
});

test("the catalog carries spoken names and announcements: an agent reads the same as a screen reader", () => {
  const cat = buildCatalog([gestosServer.feature]).catalog;
  const g = cat.features[0];
  assert.equal(g.intents[0].spoken, "hacer un gesto");
  assert.deepEqual(g.events[0].announce, { text: "Gesto: {gesto}", sound: "suave", importance: 1, who: "quien" });
});

const puertas = defineFeature({
  id: "puertas", version: 1, describe: "Puertas que se abren (prueba de fichas).",
  intents: { abrir: { describe: "Abre una puerta.", spoken: "abrir", fields: { puerta: { kind: "text", maxBytes: 16 } } } },
  state: {
    describe: "Cada puerta: abierta o no, dónde.",
    fields: { abierta: { kind: "bool" }, x: { kind: "fixed", min: -100, max: 100, step: 0.25 }, z: { kind: "fixed", min: -100, max: 100, step: 0.25 } },
    card: { role: "puerta", name: "Puerta {key}", description: "Abierta: {abierta}", importance: 2, actions: ["abrir"], at: ["x", "z"] },
  },
});

test("a thing in the world carries a card: role, name, description, actions and where it is", () => {
  assert.deepEqual(puertas.issues, []);
  const srv = serverPart(puertas, (api) => {
    api.onJoin(() => { if (!api.state.get("norte")) api.state.set("norte", { abierta: false, x: 2, z: -8 }, { at: { x: 2, z: -8 } }); });
  });
  const W = world([srv], 1, [clientPart(puertas, () => {})]);
  W.pump();
  assert.deepEqual(W.clients[0].s.features.cards(), [
    { feature: "puertas", key: "norte", role: "puerta", name: "Puerta norte", description: "Abierta: false", importance: 2, actions: ["abrir"], at: { x: 2, z: -8 } },
  ]);
});

test("putting something in the world without a card is refused (an unnamed object is invisible to a blind player)", () => {
  const sinFicha = defineFeature({ id: "cosas", version: 1, describe: "Cosas sin ficha.", state: { describe: "x", fields: { n: { kind: "int", min: 0, max: 9 } } } });
  let ok = true;
  const W = world([serverPart(sinFicha, (api) => { api.onJoin(() => { ok = api.state.set("a", { n: 1 }, { at: { x: 0, z: 0 } }); }); })], 1);
  W.pump();
  assert.equal(ok, false);
  assert.ok(W.log.some((l) => l.includes("necesita su ficha") && l.includes("state.card")));
  const bad = defineFeature({ id: "fichamal", version: 1, describe: "x", state: { describe: "x", fields: {}, card: { role: "nave" as never, name: "Nave {nombre}", actions: ["volar"] } } });
  assert.deepEqual(bad.issues.map((x) => x.path).sort(), ["fichamal.state.card.actions", "fichamal.state.card.name", "fichamal.state.card.role"]);
});

test("fillTemplate puts values in holes and leaves unknown holes visible", () => {
  assert.equal(fillTemplate("Puerta {key}: {estado} {nada}", { key: "norte", estado: "abierta" }), "Puerta norte: abierta {nada}");
});
