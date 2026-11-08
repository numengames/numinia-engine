// Y29: fixed phrases — the list (data, ids that never change), the server (decides, paces, sends the id), the page (translates).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { frases, CERCA_M, RITMO, GRUPOS_IDS, ID_BYTES, TEXTO_FRASE_MAX } from "../features/frases/feature.ts";
import { LISTA, IDIOMAS, FRASES_MAX, idiomaDe, leerFrases, textoDe } from "../features/frases/frases.ts";
import frasesServer from "../features/frases/server.ts";
import { crearFrases } from "../features/frases/pagina.ts";
import clienteLigero, { VERSION, cargar } from "../features/frases/client.ts";
import servidor from "../features/servidor.ts";
import cliente from "../features/cliente.ts";

const fijados = JSON.parse(readFileSync(new URL("./frases-ids.json", import.meta.url), "utf8")) as { ids: string[] };
const crudo = JSON.parse(readFileSync(new URL("../features/frases/frases.json", import.meta.url), "utf8")) as { retiradas: string[] };

test("the list: about 20 phrases, every id once, every language present, in groups", () => {
  const r = leerFrases(crudo);
  assert.deepEqual(r.problemas, []);
  assert.ok(LISTA.frases.length >= 18 && LISTA.frases.length <= FRASES_MAX, `${LISTA.frases.length} phrases`);
  assert.equal(new Set(LISTA.frases.map((f) => f.id)).size, LISTA.frases.length, "no repeated id");
  for (const f of LISTA.frases) {
    for (const l of IDIOMAS) assert.ok(f[l].length > 0, `${f.id} in ${l}`);
    assert.ok(LISTA.grupos.some((g) => g.id === f.grupo), `${f.id} has a group`);
  }
  assert.deepEqual(LISTA.frases.map((f) => f.orden), LISTA.frases.map((_, i) => i), "fixed order");
  assert.deepEqual(LISTA.grupos.map((g) => g.id), [...GRUPOS_IDS], "feature.ts lists the same groups as the file (the start bundle does not import the file)");
  assert.ok(LISTA.frases.every((f) => new TextEncoder().encode(f.id).length <= ID_BYTES && f.en.length <= TEXTO_FRASE_MAX && f.es.length <= TEXTO_FRASE_MAX));
});

test("stability: the pinned ids are all still there, in the same place; a retired id stays reserved", () => {
  const ahora = LISTA.frases.map((f) => f.id);
  assert.deepEqual(ahora.slice(0, fijados.ids.length), fijados.ids, "an id was removed, renamed or moved: add new phrases at the END instead");
  for (const r of LISTA.retiradas) assert.ok(!ahora.includes(r), `${r} is retired: its id stays reserved`);
  const vuelta = leerFrases({ ...crudo, retiradas: ["hello"] });
  assert.ok(vuelta.problemas.some((p) => /retired/.test(p.message)), "reusing a retired id is refused, with the reason");
});

test("the reader leaves a wrong line out WITH its reason and never throws", () => {
  const malo = leerFrases({ schema: "numinia-engine/frases@1", grupos: [{ id: "g", en: "G", es: "G" }], frases: [
    { id: "ok", grupo: "g", en: "Ok", es: "Vale" },
    { id: "ok", grupo: "g", en: "Ok", es: "Vale" },
    { id: "Bad Id", grupo: "g", en: "x", es: "x" },
    { id: "nogroup", grupo: "zzz", en: "x", es: "x" },
    { id: "noes", grupo: "g", en: "x" },
  ] });
  assert.deepEqual(malo.valor.frases.map((f) => f.id), ["ok"]);
  assert.equal(malo.problemas.length, 4);
  assert.ok(malo.problemas.some((p) => /repeated/.test(p.message)));
  assert.ok(malo.problemas.some((p) => p.path.endsWith(".es")));
  assert.equal(leerFrases(null).problemas.length, 1);
  assert.equal(leerFrases(42).valor.frases.length, 0);
});

test("language: English by default, Spanish as a translation, region and case ignored", () => {
  assert.equal(idiomaDe("es-ES"), "es"); assert.equal(idiomaDe("EN"), "en"); assert.equal(idiomaDe(""), "en"); assert.equal(idiomaDe("fr"), "en"); assert.equal(idiomaDe(undefined), "en");
  assert.equal(textoDe("hello", "es"), "Hola"); assert.equal(textoDe("hello", "en"), "Hello"); assert.equal(textoDe("hello", "xx"), "Hello");
  assert.equal(textoDe("nope", "en"), null);
});

function world(n: number, langs: string[] = []) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [frasesServer], log: (l) => log.push(l) });
  const reloj = { ms: 0 };
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), seen: string[] = [], said: string[] = [];
    const idioma = { v: langs[i] ?? "en" };
    const c = crearFrases(() => reloj.ms, () => idioma.v);
    const s = new ClientSession(t, { features: [c.part], view: { label() {}, bounce() {}, bubble: (e, txt, ms) => seen.push(`${e} ${txt} ${ms}`), announce: (a) => said.push(a.text) } });
    return { t, s, f: c.frases, seen, said, idioma };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, clients, pump, place, log, reloj };
}

test("near: whoever is within 20 m reads it in THEIR language; the far one reads nothing; the wire carries the id", () => {
  const W = world(3, ["en", "es", "es"]);
  const [A, B, C] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 5, 0); W.place(C.s.entity, 25, 0);
  assert.equal(A.f.decir("hello").ok, true);
  W.pump();
  assert.ok(A.seen.includes(`${A.s.entity} « Hello » 6000`), "the speaker sees it in English");
  assert.ok(B.seen.includes(`${A.s.entity} « Hola » 6000`), "the neighbour in Spanish");
  assert.deepEqual(C.seen, [], "25 m: out of reach");
  assert.deepEqual(B.f.lineas.map((l) => l.id), ["hello"], "what arrived is the id");
  assert.equal(B.f.leer()[0].texto, "Hola");
  assert.ok(B.said.some((t) => t.endsWith(": Hola")), "the announcement is in the reader's language");
  assert.equal(B.s.features.announcements.at(-1)?.text.endsWith("says: hello"), true, "the server's own line names the id, never text");
  assert.equal(CERCA_M, 20);
});

test("changing language changes what is already shown, without resending", () => {
  const W = world(2, ["en", "en"]);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 3, 0);
  A.f.decir("thanks"); W.pump();
  const enviados = W.inst.features.stats.received;
  B.idioma.v = "es-ES"; B.f.repintar();
  assert.ok(B.seen.at(-1)!.includes("« Gracias »"), "the bubble is redrawn in Spanish");
  assert.equal(B.f.leer()[0].texto, "Gracias");
  assert.equal(W.inst.features.stats.received, enviados, "nothing was sent");
  W.reloj.ms += 7000; const n = B.seen.length; B.f.repintar();
  assert.equal(B.seen.length, n, "a bubble that is gone is not redrawn");
});

test("the server refuses an unknown id with the reason", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 3, 0);
  assert.equal(A.f.decir("bogus").ok, false, "the page refuses it first");
  A.s.features.send("frases", "frase", { id: "bogus" }); // straight to the wire: the server decides
  W.pump();
  assert.ok(A.said.some((t) => /Unknown phrase «bogus»/.test(t)), "A hears why");
  assert.deepEqual(B.f.lineas, [], "nobody else heard anything");
});

test("pace: one a second, three in a row; the server says why, the page says «wait» before sending", () => {
  const W = world(2);
  const [A, B] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 3, 0);
  for (let i = 0; i < 6; i++) A.s.features.send("frases", "frase", { id: "hello" }); // straight to the wire
  W.pump();
  assert.equal(B.f.lineas.length, RITMO.burst, "three get through");
  assert.ok(A.s.features.announcements.some((a) => /Too fast/.test(a.text)), "the speaker is told why");
  const r = [...Array(5)].map(() => B.f.decir("yes"));
  assert.deepEqual(r.map((x) => x.ok), [true, true, true, false, false]);
  assert.match((r[3] as { why: string }).why, /wait/i);
  W.reloj.ms += 1000; assert.equal(B.f.decir("yes").ok, true, "a second later one more");
});

test("the list is shared state: every page gets it in order, and agents read it as cards", () => {
  const W = world(1);
  W.pump(2);
  const [A] = W.clients;
  assert.deepEqual(A.f.lista().map((f) => f.id), LISTA.frases.map((f) => f.id));
  const cards = A.s.features.cards().filter((c) => c.feature === "frases");
  assert.equal(cards.length, LISTA.frases.length);
  assert.equal(cards[0].name, "Hello");
  assert.match(cards[0].description ?? "", /`frase`/);
  assert.deepEqual(cards[0].actions, ["frase"]);
});

test("the light door: same id and version as the declaration; hears a phrase, loads the page logic, paints it in order", async () => {
  assert.equal(VERSION, frases.version);
  assert.equal(clienteLigero.feature.id, frases.id);
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [frasesServer], log: (l) => log.push(l) });
  const seen: string[] = [], acts: string[] = [];
  const mk = (i: number, parts: typeof cliente) => { const t = inst.join(i); return { t, s: new ClientSession(t, { features: parts, view: { label() {}, bounce() {}, bubble: (e, txt) => seen.push(`${e} ${txt}`) } }) }; };
  const A = mk(0, [crearFrases().part]), B = mk(1, [clienteLigero]);
  const pump = (k = 1) => { for (let i = 0; i < k; i++) { A.t.flush(); B.t.flush(); inst.tick(); A.t.flush(); B.t.flush(); } };
  pump();
  for (const e of [A.s.entity, B.s.entity]) { inst.sim.tf.cols.x[e] = fx(0); inst.sim.tf.cols.z[e] = fx(0); }
  for (const x of B.s.features.actions()) acts.push(`${x.id}:${x.key}`);
  assert.deepEqual(acts, ["frases:Backquote"], "the key and the button exist at once");
  A.s.features.send("frases", "frase", { id: "hello" }); A.s.features.send("frases", "frase", { id: "yes" });
  pump(); await cargar(); await new Promise((r) => setTimeout(r, 0));
  const { frasesDePagina } = await import("../features/frases/pagina.ts");
  assert.deepEqual(frasesDePagina.lineas.map((l) => l.id), ["hello", "yes"], "heard before the load finished, painted after it, in order");
});

test("accessible: spoken verb, announced events, a card for the list; registered in the server and the page", () => {
  assert.deepEqual(frases.issues, []);
  assert.ok(servidor.some((p) => p.feature.id === "frases") && cliente.some((p) => p.feature.id === "frases"));
  const W = world(1); W.pump();
  assert.equal(W.clients[0].s.features.catalog!.features.find((f) => f.id === "frases")!.intents[0].spoken, "say a fixed phrase");
});
