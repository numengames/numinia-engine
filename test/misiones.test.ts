// J5 (quests, people who give them, the book) and the generic core of J4 (things used from close by): formats with
// schema, the state machine through the real plug, no cheating, out-of-range refusals, progress only to its owner,
// persistence by guest across a restart, and what the per-tick checks cost with 1,000 players.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { defineFeature, ServerRuntime, buildCatalog } from "../packages/feature/src/index.ts";
import type { PlacedObject, Saved } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { cargarAventura, leerMision, leerPnj, leerCosa, corta } from "../features/misiones/formato.ts";
import { nuevoProgreso, registrar, aceptar, leerProgreso } from "../features/misiones/maquina.ts";
import { pnj, misiones } from "../features/misiones/feature.ts";
import { crearMisiones, LLEGADA_CADA } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const EJEMPLO_DIR = new URL("../aventuras/ejemplo", import.meta.url).pathname;
const leer = lectorAventura(EJEMPLO_DIR);
const EJEMPLO = { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") };
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A headless plaza with the example adventure; each page has its own book (crearCliente) and records what it draws. */
function world(opts: { storage?: FileStorage } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: EJEMPLO }), log: (l) => log.push(l), storage: opts.storage, identitySign: sign, now: () => Date.parse("2026-10-15T12:00:00Z") });
  type Page = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"]; drawn: Map<string, PlacedObject>; tags: Map<string, string>; k: Keeper };
  const pages: Page[] = [];
  const add = (k: Keeper = keeper()) => {
    const t = inst.join(pages.length), cli = crearCliente(), drawn = new Map<string, PlacedObject>(), tags = new Map<string, string>();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place: (key, o) => { if (o) drawn.set(key, o); else drawn.delete(key); }, tag: (key, x) => { if (x) tags.set(key, x.text); else tags.delete(key); } } });
    const p = { s, t, m: cli.misiones, drawn, tags, k };
    pages.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  const place = (p: Page, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const events = (p: Page, feature: string) => p.s.features.log.filter((e) => e.feature === feature).map((e) => e.event);
  return { inst, pages, add, pump, place, events, log };
}

test("formats: the engine's example adventure loads clean, and both declarations meet the plug's rules", () => {
  const r = cargarAventura(EJEMPLO);
  assert.deepEqual(r.issues, []);
  assert.deepEqual([...r.aventura.misiones.keys()], ["primeros-pasos"]);
  assert.deepEqual([...r.aventura.pnjs.keys()], ["alma", "bruno"]);
  assert.deepEqual([...r.aventura.cosas.keys()], ["caja-de-bruno"]);
  assert.deepEqual(r.aventura.misiones.get("primeros-pasos")!.pasos.map((p) => p.tipo), ["llega_a", "habla_con", "coge"]);
  assert.deepEqual(r.aventura.dadores.get("primeros-pasos"), ["alma"]);
  assert.ok(r.aventura.explicitos.get("bruno")!.avanza.has("primeros-pasos"));
  assert.deepEqual(pnj.issues, []);
  assert.deepEqual(misiones.issues, []);
  const cat = buildCatalog([pnj, misiones]).catalog;
  assert.deepEqual(cat.features.map((f) => f.state?.card?.interact?.intent), ["hablar", "usar"], "agents read how each thing is used");
});

test("formats: problems come back with a path that says how to fix them; nothing throws", () => {
  const m = leerMision({ formato: "mision@2", id: "Mal Id", titulo: "", pasos: [{ id: "a", tipo: "volar", texto: "x" }], descripcion: "d", extra: 1 });
  assert.equal(m.ok, false);
  const paths = m.ok ? [] : m.issues.map((i) => i.path);
  for (const p of ["formato", "id", "titulo", "pasos[0].tipo", "extra"]) assert.ok(paths.includes(p), `${p} in ${paths.join(", ")}`);
  const larga = leerMision({ formato: "mision@1", id: "x", titulo: "á".repeat(41), descripcion: "d", pasos: [{ id: "a", tipo: "llega_a", texto: "t", x: 0, z: 0, lugar: "aquí" }] });
  assert.match(larga.ok ? "" : larga.issues[0].message, /bytes en UTF-8/, "limits are UTF-8 bytes, as on the wire");
  const p = leerPnj({ formato: "pnj@1", id: "p", nombre: "P", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ si: { mision: "m", estado: "hecha" }, nodo: "hola" }], nodos: { hola: { texto: "Hola", opciones: [{ texto: "x", ir: "nada" }] } } } });
  const pp = p.ok ? [] : p.issues.map((i) => `${i.path}: ${i.message}`);
  assert.ok(pp.some((s) => s.startsWith("dialogo.entradas[0].si:") && /última entrada/.test(s)), pp.join("\n"));
  assert.ok(pp.some((s) => s.startsWith("dialogo.nodos.hola.opciones[0].ir:")), pp.join("\n"));
  assert.equal(leerCosa("no soy un objeto").ok, false);
  // references: a quest that talks to nobody known is left out, and so is a person that gives it
  const malos = cargarAventura({
    misiones: [{ fichero: "misiones/m.json", texto: JSON.stringify({ formato: "mision@1", id: "m", titulo: "M", descripcion: "d", pasos: [{ id: "a", tipo: "habla_con", texto: "t", pnj: "nadie" }] }) }, { fichero: "misiones/roto.json", texto: "{ no" }],
    pnj: [{ fichero: "pnj/p.json", texto: JSON.stringify({ formato: "pnj@1", id: "p", nombre: "P", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ nodo: "h" }], nodos: { h: { texto: "Hola", opciones: [{ texto: "Toma", accion: { tipo: "dar_mision", mision: "m" } }] } } } }) }],
    cosas: [],
  });
  const t = malos.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
  assert.match(t, /misiones\/roto\.json: no es JSON válido/);
  assert.match(t, /misiones\/m: pasos\[0\]\.pnj: no hay ningún pnj «nadie» \(hay: p\)/);
  assert.match(t, /pnj\/p: dialogo\.nodos\.h\.opciones\[0\]\.accion\.mision: no hay ninguna misión «m»/);
  assert.equal(malos.aventura.misiones.size + malos.aventura.pnjs.size, 0);
  assert.equal(corta("añadir", 5), "a...", "cut on a character, never inside one");
});

test("the J4 plug: an interactive card is checked (verb, key field, reach); the page lists what is in reach", () => {
  const mala = defineFeature({
    id: "puertas", version: 1, describe: "Puertas.", intents: { abrir: { describe: "Abrir.", spoken: "abrir", fields: { n: { kind: "int", min: 0, max: 9 } } } },
    state: { describe: "Puertas.", fields: { x: { kind: "fixed", min: -10, max: 10, step: 0.1 }, z: { kind: "fixed", min: -10, max: 10, step: 0.1 } }, card: { role: "puerta", name: "Puerta", at: ["x", "z"], interact: { intent: "abrir", prompt: "abrir {color}", radius: 99, key: "n" } } },
  });
  const paths = mala.issues.map((i) => i.path);
  assert.deepEqual(paths.sort(), ["puertas.state.card.interact.key", "puertas.state.card.interact.prompt", "puertas.state.card.interact.radius"].sort());
  const W = world();
  const a = W.add();
  W.pump(3);
  W.place(a, 2, -2); W.pump(12);
  const enReach = a.s.features.reachable(2, -2);
  assert.equal(enReach[0]?.key, "alma");
  assert.equal(enReach[0]?.prompt, "hablar con Alma, la guía");
  assert.deepEqual(a.s.features.reachable(30, 30), []);
  assert.equal(a.drawn.get("pnj:alma")?.animate, false, "people stand still: phones stay cool");
  assert.equal(a.tags.get("pnj:alma"), "Alma, la guía", "a name floats over each person");
  const card = a.s.features.cards().find((c) => c.key === "alma")!;
  assert.deepEqual([card.role, card.name, card.actions], ["persona", "Alma, la guía", ["hablar"]]);
});

test("the example quest end to end over the plug: talk, accept, arrive, talk, take; the server checks every step", () => {
  const W = world();
  const a = W.add(), b = W.add();
  W.pump(3);
  assert.ok(a.s.who && b.s.who && a.s.who.id !== b.s.who.id, "two different guests");
  // far from Alma: refused, said why
  W.place(a, 30, 30); W.pump(2);
  assert.ok(a.s.features.use("pnj", "alma").ok); W.pump(2);
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /Acércate a Alma/);
  assert.equal(a.m.dialogo(), null);
  // a page cannot accept from afar, nor take the box, nor choose without a conversation
  a.m.aceptar("primeros-pasos"); a.m.usar("caja-de-bruno"); a.s.features.send("pnj", "elegir", { pnj: "alma", opcion: 1 }); W.pump(2);
  assert.equal(a.m.libro().length, 0);
  // next to Alma: E (use) opens the conversation; the options arrive as text; 1 → the errand; 1 → accept
  W.place(a, 2, -2); W.pump(12);
  a.s.features.use("pnj", "alma"); W.pump(2);
  assert.equal(a.m.dialogo()?.nombre, "Alma, la guía");
  assert.deepEqual(a.m.dialogo()?.opciones, ["Sí. ¿Me enseñas la plaza?", "Ahora no, gracias."]);
  a.m.elegir(1); W.pump(2);
  assert.match(a.m.dialogo()?.texto ?? "", /pilar dorado/);
  a.m.elegir(1); W.pump(2);
  assert.match(a.m.dialogo()?.texto ?? "", /libro de misiones/);
  const libro = a.m.libro();
  assert.deepEqual(libro.map((m) => [m.id, m.estado, m.paso, m.seguida]), [["primeros-pasos", "activa", 0, true]], "accepted and tracked");
  assert.deepEqual(a.m.objetivos(), [{ mision: "primeros-pasos", paso: 0, nombre: "Pilar dorado", texto: "Visita el pilar dorado del este", x: 18, z: 0, seguida: true }]);
  assert.ok(a.s.features.announcements.some((x) => x.text.startsWith("Misión nueva: Primeros pasos en la plaza")));
  a.m.elegir(1); W.pump(2);
  assert.equal(a.m.dialogo(), null, "goodbye closes it");
  // no cheating: the box near Alma is refused (too far), Bruno's step does not complete from afar
  a.m.usar("caja-de-bruno"); a.m.hablar("bruno"); W.pump(2);
  assert.equal(a.m.libro()[0].paso, 0);
  // the pillar: the server sees the position (checked every LLEGADA_CADA ticks)
  W.place(a, 16, 1); W.pump(LLEGADA_CADA + 1);
  assert.equal(a.m.libro()[0].paso, 1);
  assert.equal(a.m.objetivos()[0].nombre, "Bruno, el farolero");
  assert.ok(a.s.features.announcements.some((x) => x.text === "Hecho: Visita el pilar dorado del este"));
  // the box is not offered yet (its step is not the current one); talking to Bruno: the explicit option completes it
  assert.equal(a.m.ofrece("misiones", "caja-de-bruno"), false);
  W.place(a, 10, 10); W.pump(12);
  a.m.hablar("bruno"); W.pump(2);
  assert.match(a.m.dialogo()?.texto ?? "", /Te manda Alma/);
  assert.equal(a.m.libro()[0].paso, 1, "talking alone does not complete it: Bruno's tree has the explicit option");
  a.m.elegir(1); W.pump(2);
  assert.equal(a.m.libro()[0].paso, 2);
  assert.equal(a.m.ofrece("misiones", "caja-de-bruno"), true);
  a.m.elegir(1); W.pump(2);
  // the box: from afar no, from close by yes; that completes the quest
  W.place(a, 4, 18); W.pump(12);
  a.s.features.use("misiones", "caja-de-bruno"); W.pump(2);
  assert.equal(a.m.libro()[0].estado, "activa");
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /Acércate más/);
  W.place(a, 4, 15); W.pump(2);
  assert.equal(a.s.features.reachable(4, 15)[0]?.prompt, "coger la caja");
  a.s.features.use("misiones", "caja-de-bruno"); W.pump(2);
  assert.deepEqual(a.m.libro().map((m) => [m.id, m.estado, m.lista.every((s) => s.hecho)]), [["primeros-pasos", "hecha", true]]);
  assert.deepEqual(a.m.objetivos(), []);
  assert.deepEqual(a.m.resumen().insignias, ["Insignia «Conoce la plaza»"]);
  assert.ok(a.s.features.announcements.some((x) => x.importance === 2 && x.text.startsWith("Misión completada: Primeros pasos en la plaza")));
  // done: Alma says thanks; accepting again is refused
  W.place(a, 2, -2); W.pump(12);
  a.m.hablar("alma"); W.pump(2);
  assert.match(a.m.dialogo()?.texto ?? "", /Ya conoces la plaza/);
  a.m.aceptar("primeros-pasos"); W.pump(2);
  assert.match(a.m.estado.ultimoRechazo, /Ya completaste/);
  // B, another guest, never got any of A's quest events (progress goes only to its owner)
  assert.deepEqual(W.events(b, "misiones").filter((e) => e !== "libro"), []);
  assert.equal(b.m.libro().length, 0);
});

test("talking to someone whose tree has no explicit option completes a habla_con step by itself; abandon and track", () => {
  const p = nuevoProgreso(), A = cargarAventura(EJEMPLO).aventura;
  const m = A.misiones.get("primeros-pasos")!;
  assert.deepEqual(aceptar(p, m, A), { ok: true });
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 50, z: 50 }), []);
  assert.deepEqual(registrar(p, A, { tipo: "llega", x: 18, z: 3.9 }), [{ mision: "primeros-pasos", paso: 0, completada: false }]);
  assert.deepEqual(registrar(p, A, { tipo: "habla", pnj: "bruno" }), [], "Bruno advances it only through his option");
  A.explicitos.get("bruno")!.avanza.clear();
  assert.deepEqual(registrar(p, A, { tipo: "habla", pnj: "bruno" }), [{ mision: "primeros-pasos", paso: 1, completada: false }]);
  assert.deepEqual(leerProgreso(JSON.parse(JSON.stringify(p))), p, "what is saved comes back the same");
  assert.deepEqual(leerProgreso({ activas: { "Mal": { paso: -1 } }, hechas: [3, "ok"], seguida: "nada" }), { v: 1, activas: {}, hechas: ["ok"], seguida: "" });
  const W = world();
  const a = W.add();
  W.pump(3);
  W.place(a, 2, -2); W.pump(12);
  a.m.aceptar("primeros-pasos"); W.pump(2);   // agents may accept by verb when the giver is at hand
  assert.equal(a.m.libro()[0]?.seguida, true);
  a.m.seguir(""); W.pump(2);
  assert.equal(a.m.libro()[0].seguida, false);
  a.m.seguir("primeros-pasos"); W.pump(2);
  assert.equal(a.m.objetivos()[0].seguida, true);
  a.m.abandonar("primeros-pasos"); W.pump(2);
  assert.equal(a.m.libro().length, 0);
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /Has dejado/);
});

test("progress survives a restart, by guest (I1 + S4), and a second tab of the same guest shares the book", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "misiones-"));
  const s1 = new FileStorage(dir);
  const W1 = world({ storage: s1 });
  const a = W1.add();
  W1.pump(3);
  W1.place(a, 2, -2); W1.pump(12);
  a.m.aceptar("primeros-pasos"); W1.pump(2);
  W1.place(a, 18, 0); W1.pump(LLEGADA_CADA + 1);
  assert.equal(a.m.libro()[0].paso, 1);
  const tab2 = W1.add(a.k); W1.pump(3);
  assert.equal(tab2.m.libro()[0]?.paso, 1, "the same guest in another tab gets the same book");
  await s1.flush();
  const W2 = world({ storage: new FileStorage(dir) });
  const again = W2.add(a.k); W2.pump(3);
  assert.equal(again.s.who?.id, a.s.who?.id);
  assert.deepEqual(again.m.libro().map((m) => [m.id, m.paso, m.seguida]), [["primeros-pasos", 1, true]]);
  assert.equal(again.m.objetivos()[0].nombre, "Bruno, el farolero");
  const other = W2.add(); W2.pump(3);
  assert.equal(other.m.libro().length, 0, "a new guest starts with an empty book");
});

test("per-tick cost: 1,000 players all waiting to arrive somewhere (limits: misiones tick)", () => {
  const N = 1000, players = Array.from({ length: N }, (_, i) => i);
  const pos = new Map(players.map((e) => [e, { x: -30 + (e % 60), z: -30 + Math.floor(e / 60) }]));
  const guardado: Saved = { version: 1, state: [], store: players.map((e) => [`p:g${e}`, { v: 1, activas: { "primeros-pasos": { paso: 0, tiene: [] } }, hechas: [], seguida: "primeros-pasos" }]) };
  let tick = 0, enviados = 0;
  const rt = new ServerRuntime(crearMisiones({ aventura: EJEMPLO }), {
    players: () => players, position: (e) => pos.get(e) ?? null, send: () => { enviados++; }, tick: () => tick, log: () => {},
    who: (e) => ({ id: `g${e}`, nombre: `Invitado ${e}` }), storage: { load: (f) => (f === "misiones" ? guardado : null), record: () => {} },
  });
  for (const e of players) { rt.join(e); rt.identify(e); }
  for (let i = 0; i < 40; i++) { tick++; rt.tick(); } // warm-up (JIT), as the plaza gate does
  const ms: number[] = [];
  for (let i = 0; i < 400; i++) { tick++; const t0 = performance.now(); rt.tick(); ms.push(performance.now() - t0); }
  ms.sort((x, y) => x - y);
  const p99 = ms[Math.floor(ms.length * 0.99)], p50 = ms[Math.floor(ms.length / 2)];
  console.log(`[misiones] 1.000 jugadores esperando llegar a un sitio: tick de las funciones p50 ${p50.toFixed(3)} ms · p99 ${p99.toFixed(3)} ms`);
  assert.ok(p99 < 5, `p99 ${p99} ms (the whole tick has 50 ms; the plaza gate allows 25)`);
  // those who stand on the pillar complete the step (each one only once)
  pos.set(5, { x: 18, z: 0 }); pos.set(6, { x: 19, z: 1 });
  enviados = 0;
  for (let i = 0; i < LLEGADA_CADA; i++) { tick++; rt.tick(); }
  assert.ok(enviados > 0 && enviados < 40, `${enviados} messages for two arrivals`);
});
