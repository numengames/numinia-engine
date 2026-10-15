// J3: chat (near 20 m and zone), bubbles, names over heads and `/` commands — headless, over the in-memory transport.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fx } from "../packages/core/src/index.ts";
import { defineFeature, serverPart, ServerRuntime, LISTEN_DEPTH } from "../packages/feature/src/index.ts";
import type { Msg, ServerApi, ServerPart } from "../packages/feature/src/index.ts";
import { BitWriter, writeFields, MSG } from "../packages/net/src/index.ts";
import { Instance, Bot } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { chat, TEXTO_MAX, CERCA_M, NOMBRES_M, HISTORIAL_MAX, RITMO_CERCA, RITMO_ZONA, RITMO_ZONA_TODOS, NOMBRES_MAX } from "../features/chat/feature.ts";
import chatServer, { AYUDA, NOMBRES_CADA_TICKS, ROBOT_TRAS_TICKS } from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import { limpiar, cortar, bytesDe } from "../features/chat/texto.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

/** A headless world with the chat feature: n pages, each with its own chat client, a clock for the page's pace. */
function world(n: number, o: { identidad?: boolean; extra?: ServerPart[]; capacity?: number } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: o.capacity ?? 64, k: 50, snapshotEvery: 2, features: [chatServer, ...(o.extra ?? [])], log: (l) => log.push(l), identitySign: o.identidad ? sign : undefined });
  const reloj = { ms: 0 };
  const join = (i: number) => {
    const t = inst.join(i), seen: string[] = [], c = crearCliente(() => reloj.ms);
    const s = new ClientSession(t, {
      features: [c.part], identity: o.identidad ? keeper() : undefined,
      view: { label() {}, bounce() {}, nameTag: (e, txt) => seen.push(`nombre ${e} ${txt}`), bubble: (e, txt, ms) => seen.push(`bocadillo ${e} ${txt} ${ms}`) },
    });
    return { t, s, chat: c.chat, seen };
  };
  const clients = Array.from({ length: n }, (_, i) => join(i));
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, clients, pump, place, log, reloj, join };
}
const textos = (c: { chat: { lineas: readonly { tipo: string; texto: string }[] } }, tipo?: string) => c.chat.lineas.filter((l) => !tipo || l.tipo === tipo).map((l) => l.texto);

test("text: one clean line — trimmed, no control or direction characters, cut on a character, empty = nothing", () => {
  assert.equal(limpiar("  hola\n\tqué\u0000 tal  "), "hola qué tal");
  assert.equal(limpiar("a\u202Eb\u2066c\u007f\u0085d"), "a b c d");            // bidi overrides, DEL, C1: out
  assert.equal(limpiar(" \n\u0007 "), "");
  const largo = "ñ".repeat(150);                                                  // 300 bytes
  assert.equal(bytesDe(limpiar(largo)), TEXTO_MAX);
  assert.equal(cortar("a€", 3), "a", "a 3-byte character never cut in two");
  assert.equal(limpiar("\uD800x"), "\uFFFDx", "a lone surrogate becomes a replacement character");
});

test("near chat: within 20 m you read it and see the bubble; at 25 m nothing arrives; the simulation never notices", () => {
  const W = world(3);
  const [A, B, C] = W.clients;
  W.pump(2);
  W.place(A.s.entity, 0, 0); W.place(B.s.entity, 15, 0); W.place(C.s.entity, 0, 25);
  assert.deepEqual(A.chat.decir("hola"), { ok: true });
  W.pump();
  assert.deepEqual(textos(A), ["hola"]);
  assert.deepEqual(textos(B), ["hola"]);
  assert.deepEqual(textos(C), [], "25 m: farther than the 20 m of near chat");
  assert.ok(B.seen.includes(`bocadillo ${A.s.entity} hola 6000`));
  assert.equal(A.chat.lineas[0].tuyo, true);
  assert.equal(B.chat.lineas[0].tuyo, false);
  assert.equal(B.s.features.announcements.at(-1)?.text, `Robot ${A.s.entity}: hola`, "screen readers get «who: text» (a robot until it has an identity)");
  assert.equal(CERCA_M, 20);
});

test("pace: near 1/s burst 3 and the server drops the rest; the page says «wait» before sending", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0);
  for (let i = 0; i < 10; i++) A.s.features.send("chat", "decir", { texto: `m${i}` }); // straight to the wire: the server decides
  W.pump();
  assert.deepEqual(textos(B), ["m0", "m1", "m2"]);
  const dropped = W.inst.features.stats.dropped;
  assert.equal(dropped, 7);
  const r = [...Array(5)].map((_, i) => B.chat.decir(`b${i}`));                       // through the page helper
  assert.deepEqual(r.map((x) => x.ok), [true, true, true, false, false]);
  assert.match((r[3] as { why: string }).why, /deprisa/);
  W.pump(TICK_HZ);                                                                    // a second later: one more
  assert.equal(B.chat.decir("otra").ok, true);
  assert.deepEqual(RITMO_CERCA, { perSecond: 1, burst: 3 });
});

test("length: over 200 bytes never leaves the page, and the wire cannot carry more than 200", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0);
  const r = A.chat.decir("x".repeat(300));
  assert.equal(r.ok, false);
  assert.match((r as { why: string }).why, /300 de 200 bytes/);
  assert.equal(A.s.features.send("chat", "decir", { texto: "x".repeat(300) }).ok, false, "the plug refuses it too");
  // a forged message that claims a longer text: the server reads its own 200-byte schema, so at most 200 arrive
  const idx = A.s.features.catalog!.features.find((f) => f.id === "chat")!.intents.find((i) => i.name === "decir")!.index;
  const w = new BitWriter(64); w.write(MSG.FEATURE, 8); w.write(idx, 16); writeFields(w, { texto: { kind: "text", maxBytes: 512 } }, { texto: "y".repeat(300) });
  A.t.send(w.finish(), true);
  W.pump();
  for (const l of B.chat.lineas) assert.ok(bytesDe(l.texto) <= TEXTO_MAX);
  assert.deepEqual(textos(A, "cerca").filter((t) => t.length > TEXTO_MAX), []);
  assert.deepEqual(A.chat.decir("   ").ok, false, "only spaces: nothing to say");
});

test("zone channel: reaches the whole zone (even 500 m away), 1 every 5 s per person, 6 in a row for the zone together", () => {
  const W = world(8);
  const [A, B] = W.clients;
  W.pump();
  W.place(A.s.entity, 0, 0); W.place(B.s.entity, 500, 0);
  assert.equal(A.chat.decir("hola zona", "zona").ok, true);
  W.pump();
  assert.deepEqual(textos(B, "zona"), ["hola zona"]);
  assert.deepEqual(textos(B, "cerca"), []);
  for (let i = 0; i < 3; i++) B.s.features.send("chat", "decirZona", { texto: `b${i}` });
  W.pump();
  assert.deepEqual(textos(A, "zona"), ["hola zona", "b0", "b1"], "per person: burst 2");
  const before = textos(A, "zona").length;
  for (const c of W.clients.slice(2)) c.s.features.send("chat", "decirZona", { texto: `de ${c.s.entity}` }); // 6 more people at once
  W.pump();
  assert.equal(textos(A, "zona").length - before, 3, "the zone had 3 tokens left of its burst of 6");
  const refused = W.clients.slice(2).filter((c) => c.chat.lineas.some((l) => l.tipo === "aviso" && /zona va muy deprisa/.test(l.texto)));
  assert.equal(refused.length, 3, "who was refused is told why, only them");
  assert.deepEqual(RITMO_ZONA, { perSecond: 0.2, burst: 2 });
  assert.deepEqual(RITMO_ZONA_TODOS, { perSecond: 2, burst: 6 });
});

test("zone history: whoever enters gets the last 50 zone messages, in order, without bubbles", () => {
  const W = world(4);
  W.pump();
  let llegadas = 0;
  W.clients[0].chat.alLlegar((l) => { if (l.tipo === "zona") llegadas++; });
  for (let i = 0; i < 60; i++) { W.clients[i % 4].s.features.send("chat", "decirZona", { texto: `z${i}` }); W.pump(5 * TICK_HZ / 4); }
  assert.equal(llegadas, 60, "every zone message passed its limits");
  const late = W.join(9);
  late.t.flush();
  const antes = late.chat.lineas.filter((l) => l.tipo === "antes");
  assert.equal(HISTORIAL_MAX, 50);
  assert.equal(antes.length, 30, "the page keeps its last 30 lines");
  assert.equal(late.s.features.log.filter((e) => e.event === "historial").length, 32, "the plug's log keeps 32");
  assert.equal(antes.at(-1)?.texto, "z59");
  assert.equal(antes[0].texto, "z30");
  const raw = W.inst.join(10), got: number[] = [];                                     // a bare page: count what arrives
  raw.onMessage((b) => { if (b[0] === MSG.FEATURE) got.push(b.length); });
  raw.flush();
  assert.equal(got.length, 50, "exactly 50 history messages on entering");
  assert.ok(!late.seen.some((s) => s.startsWith("bocadillo")), "history draws no bubbles");
});

test("`/` commands are never published: features hear `orden`; /ayuda answers; nobody listening says so", () => {
  const oidas: Msg[] = [];
  const cercanas: Msg[] = [];
  const ordenes = defineFeature({ id: "ordenes", version: 1, describe: "Prueba: oye las órdenes del chat." });
  const extra = serverPart(ordenes, (api) => {
    api.listen("chat", "orden", (m) => { oidas.push(m); return String(m.texto).startsWith("nombre"); });
    api.listen("chat", "dicho", (m) => { cercanas.push(m); });
  });
  const W = world(2, { extra: [extra] });
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0);
  A.chat.decir("/nombre Pablo");
  W.pump();
  assert.deepEqual(oidas, [{ quien: A.s.entity, texto: "nombre Pablo" }]);
  assert.deepEqual(textos(B), [], "B reads nothing");
  assert.deepEqual(textos(A), [], "handled: no answer needed");
  assert.ok(!B.s.features.log.some((e) => e.event === "orden") && !A.s.features.log.some((e) => e.event === "orden"), "`orden` never reaches a page");
  W.pump(TICK_HZ);
  A.chat.decir("/volar"); W.pump(TICK_HZ);
  assert.match(textos(A, "aviso").at(-1)!, /Nadie atiende «\/volar»/);
  A.chat.decir("/ayuda", "zona"); W.pump();
  assert.equal(textos(A, "aviso").at(-1), AYUDA);
  assert.deepEqual(textos(B), []);
  A.chat.decir("hola B"); W.pump();
  assert.deepEqual(cercanas.map((m) => m.texto), ["hola B"], "server features hear near chat (the AI inhabitant, P5)");
});

test("listen: a missing event is logged; a throwing listener does not stop the chat; loops are cut", () => {
  const malas = defineFeature({ id: "malas", version: 1, describe: "Prueba: oyentes que fallan.", events: { eco: { describe: "Eco.", fields: {}, announce: "silent" } } });
  let api!: ServerApi;
  const extra = serverPart(malas, (a) => {
    api = a;
    a.listen("chat", "no-existe", () => {});
    a.listen("chat", "dicho", () => { throw new Error("roto"); });
    a.listen("malas", "eco", () => { a.emit("eco", {}, "server"); });             // an echo that triggers itself
  });
  const W = world(2, { extra: [extra] });
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0);
  A.chat.decir("sigue"); W.pump();
  assert.deepEqual(textos(B), ["sigue"]);
  assert.ok(W.log.some((l) => l.includes("no tiene ese evento")));
  assert.ok(W.log.some((l) => l.includes("falló en listen('chat.dicho')")));
  api.emit("eco", {}, "server");
  assert.ok(W.log.some((l) => l.includes(`más de ${LISTEN_DEPTH} eventos encadenados`)));
});

test("names over heads: who your page draws within 24 m, the identity's name; forgotten past 30 m or on leaving", () => {
  const W = world(3, { identidad: true });
  const [A, B, C] = W.clients;
  W.pump(2);
  W.place(A.s.entity, 0, 0); W.place(B.s.entity, 10, 0); W.place(C.s.entity, 0, 100);
  W.pump(NOMBRES_CADA_TICKS + 2);
  const nombreA = A.s.who!.nombre;
  assert.match(nombreA, /^Invitado [A-Z2-7]{4}$/);
  assert.equal(B.chat.nombres.get(A.s.entity), nombreA);
  assert.ok(B.seen.includes(`nombre ${A.s.entity} ${nombreA}`), "the page is asked to draw it");
  assert.equal(C.chat.nombres.size, 0, "100 m: no names at all");
  assert.ok(!A.chat.nombres.has(A.s.entity), "never your own (the page knows it)");
  W.place(B.s.entity, 27, 0); W.pump(NOMBRES_CADA_TICKS);
  assert.equal(B.chat.nombres.get(A.s.entity), nombreA, "27 m: kept (forgotten only past 30)");
  W.place(B.s.entity, 35, 0); W.pump(NOMBRES_CADA_TICKS);
  assert.equal(B.chat.nombres.has(A.s.entity), false, "35 m: forgotten");
  assert.ok(B.seen.includes(`nombre ${A.s.entity} null`));
  W.place(B.s.entity, 5, 0); W.pump(NOMBRES_CADA_TICKS);
  assert.equal(B.chat.nombres.get(A.s.entity), nombreA, "back: named again");
  W.inst.disconnect(A.s.entity); W.pump();
  assert.equal(B.chat.nombres.has(A.s.entity), false, "left: forgotten at once (its number will be reused)");
  assert.equal(NOMBRES_M, 24);
});

test("names: robots (no identity) get «Robot N» after a second; the said name is the identity's", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(2); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 3, 0);
  W.pump(NOMBRES_CADA_TICKS);
  assert.equal(B.chat.nombres.size, 0, "not before a second: a person may still identify");
  W.pump(ROBOT_TRAS_TICKS);
  assert.equal(B.chat.nombres.get(A.s.entity), `Robot ${A.s.entity}`);
});

test(`cost: names for 1,000 players, everyone seeing 50 within 24 m — one tick of the chat (a tenth of the players)`, () => {
  const N = 1000, pos: { x: number; z: number }[] = [];
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = 0; i < N; i++) pos.push({ x: rnd() * 160 - 80, z: rnd() * 160 - 80 });   // everyone within 80 m (the plaza gate)
  // what each page draws: up to 50 others within 24 m (a grid of 24 m cells; the instance would pick by priority)
  const cell = (p: { x: number; z: number }) => `${Math.floor(p.x / 24)},${Math.floor(p.z / 24)}`, grid = new Map<string, number[]>();
  pos.forEach((p, i) => { const k = cell(p); grid.set(k, [...(grid.get(k) ?? []), i]); });
  const near = pos.map((p, i) => {
    const out: number[] = [], cx = Math.floor(p.x / 24), cz = Math.floor(p.z / 24);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) if (j !== i && out.length < 50 && (pos[j].x - p.x) ** 2 + (pos[j].z - p.z) ** 2 <= 24 * 24) out.push(j);
    return out;
  });
  let tick = 100, sent = 0, bytes = 0;
  const players = [...Array(N).keys()];
  const rt = new ServerRuntime([chatServer], { players: () => players, position: (e) => pos[e] ?? null, send: (_e, b) => { sent++; bytes += b.length; }, tick: () => tick, log: () => {}, visible: (e) => near[e], who: (e) => ({ id: `id${e}`, nombre: `Invitado ${e}` }) });
  for (const p of players) rt.join(p);
  sent = 0; bytes = 0;
  const times: number[] = [];
  let ticks = 0;
  for (let quiet = 0; quiet < NOMBRES_CADA_TICKS && ticks < 200; ticks++) { const before = sent; tick++; const t0 = performance.now(); rt.tick(); if (ticks >= 2) times.push(performance.now() - t0); quiet = sent === before ? quiet + 1 : 0; } // 2 ticks of JIT warm-up
  const first = { sent, kb: bytes / 1024, seconds: (ticks - NOMBRES_CADA_TICKS) / TICK_HZ };
  sent = 0; bytes = 0;
  const quietTimes: number[] = [];
  for (let k = 0; k < 2 * NOMBRES_CADA_TICKS; k++) { tick++; const t0 = performance.now(); rt.tick(); quietTimes.push(performance.now() - t0); }
  times.sort((a, b) => a - b); quietTimes.sort((a, b) => a - b);
  const worst = times.at(-1)!, p50 = times[times.length >> 1], p99 = times[Math.floor(times.length * 0.99)], calma = quietTimes[quietTimes.length >> 1];
  console.log(`[J3] names, ${N} players entering at once, 50 visible each: ${first.sent} messages (${(first.kb / N * 1024).toFixed(0)} B per player) over ${first.seconds} s, chat tick p50 ${p50.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms, worst ${worst.toFixed(2)} ms · then still: ${sent} messages, tick p50 ${calma.toFixed(2)} ms`);
  assert.ok(first.sent <= N * NOMBRES_MAX, "never more than 64 names per page");
  assert.equal(sent, 0, "nobody moved: no more names");
  assert.ok(p50 < 5, `a tick of names while 1,000 enter took ${p50.toFixed(2)} ms (p50)`); // other tests and agents share the cores: p99 is printed, not judged
  assert.ok(calma < 1, `a still tick of names took ${calma.toFixed(2)} ms (p50)`);
});

test("bandwidth with chat (K=50, 10 Hz): names and a chat line every 10 s per person stay far below 70 kbit/s", () => {
  const run = (features: ServerPart[]) => {
    const inst = new Instance({ seed: 42, capacity: 64, k: 50, snapshotEvery: 2, features });
    const bots: Bot[] = [];
    for (let i = 0; i < 50; i++) bots.push(new Bot(inst.join(i), (42 ^ (i * 0x9e3779b1)) >>> 0));
    const ticks = 600;
    const idx = features.length ? inst.features.catalog.features.find((f) => f.id === "chat")!.intents[0].index : -1;
    for (let t = 0; t < ticks; t++) {
      for (const b of bots) b.think();
      if (idx >= 0 && t % 4 === 0) { // one of the 50 says 60 bytes every 0.2 s = each person every 10 s
        const w = new BitWriter(96); w.write(MSG.FEATURE, 8); w.write(idx, 16); writeFields(w, chat.intents!.decir.fields, { texto: "a".repeat(60) });
        bots[(t / 4) % 50].t.send(w.finish(), true);
      }
      inst.tick();
    }
    return (inst.sentBytes() / 50 / (ticks / TICK_HZ)) * 8 / 1000;
  };
  const bare = run([]), withChat = run([chatServer]);
  console.log(`[J3] K=50 bandwidth: ${bare.toFixed(1)} kbit/s bare, ${withChat.toFixed(1)} kbit/s with names + chat (+${(withChat - bare).toFixed(1)})`);
  assert.ok(withChat <= 70, `${withChat.toFixed(1)} kbit/s`);
  assert.ok(withChat - bare <= 10, `chat and names add ${(withChat - bare).toFixed(1)} kbit/s`);
});

test("limits.json carries the chat limits from the feature itself", () => {
  const lim = JSON.parse(readFileSync("limits.json", "utf8")).limits as { key: string; value: unknown }[];
  const v = (k: string) => lim.find((e) => e.key === k)?.value;
  assert.equal(v("chat_text_max"), TEXTO_MAX);
  assert.equal(v("chat_near_reach"), CERCA_M);
  assert.equal(v("chat_near_rate"), RITMO_CERCA.perSecond);
  assert.equal(v("chat_zone_rate_person"), RITMO_ZONA.perSecond);
  assert.equal(v("chat_zone_rate_all"), RITMO_ZONA_TODOS.perSecond);
  assert.equal(v("chat_zone_history"), HISTORIAL_MAX);
  assert.equal(v("names_reach"), NOMBRES_M);
  assert.equal(v("names_per_page_max"), NOMBRES_MAX);
});
