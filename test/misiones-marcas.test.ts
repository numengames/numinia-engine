// U14 (4): marks over people and quest things for each player («!» = has something for you now, «✓» = you are done
// with them), decided by the server from your progress and sent only to you; and a person's trade (pnj@1 `oficio`)
// under the name. The rule (pure: before and after accepting, inside a block, after it, after completing, its edges),
// the format, and the whole thing over the real plug: two guests on one server never see each other's marks, both tabs
// of one guest see theirs, a label is drawn again only when its mark changes, quest things get one only while marked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerPnj } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { abandonar, aceptar, enTexto, marcas, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import type { Progreso, Suceso } from "../features/misiones/maquina.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

// the TRG26 quest in small (as in misiones-grupo.test.ts), its people with their trades
const G = "Piezas reunidas";
const PASOS = [
  { id: "bastidor", tipo: "recibe", texto: "Recoge el bastidor de Cosimo", pnj: "cosimo", cosa: "bastidor", grupo: G },
  { id: "telas", tipo: "recibe", texto: "Recoge las telas de Bianca", pnj: "bianca", cosa: "telas", grupo: G },
  { id: "plano", tipo: "recibe", texto: "Recoge el plano de Artemisia", pnj: "artemisia", cosa: "plano", grupo: G },
  { id: "entrega", tipo: "entrega", texto: "Entrega las tres piezas a Leonardo", pnj: "leonardo", cosas: ["bastidor", "telas", "plano"] },
  { id: "cofre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" },
];
const VUELO = { formato: "mision@1", id: "vuelo", titulo: "El vuelo del Maestro", descripcion: "Reúne las tres piezas y llévaselas a Leonardo.", pasos: PASOS };
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const persona = (id: string, nombre: string, oficio: string, x: number, z: number, dialogo: unknown) => ({ formato: "pnj@1", id, nombre, oficio, posicion: { x, z }, dialogo });
const charla = (texto: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto, opciones: [adios] } } });
const da = (mision: string) => ({ entradas: [{ si: { mision, estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision } }] }, hola: { texto: "Hola.", opciones: [adios] } } });
const PNJ = [
  persona("pietro", "Pietro", "Aprendiz", 0, 0, da("vuelo")),
  persona("cosimo", "Cosimo", "Carpintero", 10, 0, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "bastidor" }, nodo: "da" }, { nodo: "hola" }], nodos: { da: { texto: "Aquí tienes el bastidor.", opciones: [{ texto: "Recibir bastidor", accion: { tipo: "avanzar_paso", mision: "vuelo" } }] }, hola: { texto: "Sin madera firme, nada vuela.", opciones: [adios] } } }),
  persona("bianca", "Bianca", "Tejedora", -10, 0, charla("Llévale estas telas al maestro.")),
  persona("artemisia", "Artemisia", "Humanista", 0, 10, charla("Aquí tienes el plano.")),
  persona("leonardo", "Leonardo", "Maestro", 0, -10, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "entrega" }, nodo: "listo" }, { nodo: "antes" }], nodos: { listo: { texto: "¡Magnífico!", opciones: [{ texto: "Entregar piezas", accion: { tipo: "entregar", mision: "vuelo" } }] }, antes: { texto: "Aún faltan piezas.", opciones: [adios] } } }),
];
const cosa = (id: string, nombre: string, x: number, z: number) => ({ formato: "cosa@1", id, nombre, posicion: { x, z }, aviso: `usar ${id}` });
const COSAS = [cosa("bastidor", "Bastidor de madera", 11, 1), cosa("telas", "Telas ligeras", -11, 1), cosa("plano", "Plano de equilibrio", 1, 11), cosa("cofre", "Cofre de la bottega", 2, -12)];
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [VUELO], pnj: Doc[] = PNJ, cosas: Doc[] = COSAS) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", pnj), cosas: ficheros("cosas", cosas) });
const cargar = (misiones?: Doc[], pnj?: Doc[], cosas?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones, pnj, cosas)); assert.deepEqual(r.issues, []); return r.aventura; };
const recibir = (quien: string): Suceso => (quien === "cosimo" ? { tipo: "avanzar", pnj: "cosimo", mision: "vuelo" } : { tipo: "habla", pnj: quien });
const hacer = (p: Progreso, A: Aventura, x: Suceso) => assert.equal(registrar(p, A, x).length, 1, JSON.stringify(x));

test("formats: pnj@1 `oficio` — valid, too long, not text, absent; the plug's declarations grew (pnj v3, misiones v4 + marcas)", () => {
  const base = { formato: "pnj@1", id: "cosimo", nombre: "Cosimo", posicion: { x: 0, z: 0 }, dialogo: charla("Hola.") };
  const ok = leerPnj({ ...base, oficio: "  Carpintero " });
  assert.ok(ok.ok && ok.value.oficio === "Carpintero", "trimmed, like every text");
  const sin = leerPnj(base);
  assert.ok(sin.ok && sin.value.oficio === "", "absent = no trade (the label has one line)");
  const largo = leerPnj({ ...base, oficio: "á".repeat(21) }); // 42 bytes
  assert.ok(!largo.ok && largo.issues.some((i) => i.path === "oficio" && /40 bytes en UTF-8/.test(i.message)), JSON.stringify(largo));
  assert.ok(leerPnj({ ...base, oficio: "x".repeat(40) }).ok, "40 bytes fit");
  const numero = leerPnj({ ...base, oficio: 7 });
  assert.ok(!numero.ok && numero.issues.some((i) => i.path === "oficio" && /un texto de 1 a 40 bytes/.test(i.message)));
  const raro = leerPnj({ ...base, oficios: "Carpintero" });
  assert.ok(!raro.ok && raro.issues.some((i) => i.path === "oficios" && /aquí van: .*oficio/.test(i.message)), "a typo lists the fields, oficio among them");
  assert.deepEqual([pnjDecl.issues, misionesDecl.issues], [[], []]);
  assert.equal(pnjDecl.version, 3);
  assert.deepEqual(pnjDecl.state!.fields.oficio, { kind: "text", maxBytes: 40, default: "" });
  assert.equal(misionesDecl.version, 6); // v6 (N10): the server-only `concedido` for «objeto» rewards
  const ev = misionesDecl.events!.marcas;
  assert.deepEqual(Object.keys(ev.fields), ["tiene", "hecho", "cosas"]);
  assert.ok(Object.values(ev.fields).every((f) => f.kind === "text" && f.maxBytes === 256), "three short id lists");
  assert.equal(ev.announce, "silent", "the labels and the map say it; nothing to read aloud");
});

test("the rule: only Pietro before accepting; the three artisans after (Pietro ✓); mid-block; after the block; the chest; all ✓ when done", () => {
  const A = cargar();
  const p = nuevoProgreso();
  assert.deepEqual(marcas(p, A), { tiene: ["pietro"], hecho: [], cosas: [] }, "no «!» on the artisans before the quest is accepted");
  assert.deepEqual(aceptar(p, A.misiones.get("vuelo")!, A), { ok: true });
  assert.deepEqual(marcas(p, A), { tiene: ["cosimo", "bianca", "artemisia"], hecho: ["pietro"], cosas: [] }, "the giver gave you what he had: ✓");
  hacer(p, A, recibir("bianca"));
  assert.deepEqual(marcas(p, A), { tiene: ["cosimo", "artemisia"], hecho: ["bianca", "pietro"], cosas: [] }, "inside the block, the one done is ✓ at once");
  hacer(p, A, recibir("cosimo")); hacer(p, A, recibir("artemisia"));
  assert.deepEqual(marcas(p, A), { tiene: ["leonardo"], hecho: ["cosimo", "bianca", "artemisia", "pietro"], cosas: [] }, "past the block: Leonardo");
  hacer(p, A, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" });
  assert.deepEqual(marcas(p, A), { tiene: [], hecho: ["cosimo", "bianca", "artemisia", "leonardo", "pietro"], cosas: ["cofre"] }, "a thing to use now: «!» on it");
  hacer(p, A, { tipo: "usa", cosa: "cofre" });
  assert.deepEqual(p.hechas, ["vuelo"]);
  assert.deepEqual(marcas(p, A), { tiene: [], hecho: ["cosimo", "bianca", "artemisia", "leonardo", "pietro"], cosas: [] }, "done: nobody points at you any more");
});

test("the rule's edges: a step later with the same person keeps ✓ away; repeatable, required and abandoned quests; coge and habla_con; no repeats", () => {
  // Bianca: talk to her, take the cloth, give it back to her — after the first step she still waits for you: no ✓ yet
  const ida = { ...VUELO, id: "ida", pasos: [
    { id: "hola", tipo: "habla_con", texto: "Saluda a Bianca", pnj: "bianca" },
    { id: "telas", tipo: "coge", texto: "Coge las telas", cosa: "telas" },
    { id: "vuelta", tipo: "entrega", texto: "Dáselas a Bianca", pnj: "bianca", cosa: "telas" },
  ] };
  const A = cargar([ida, VUELO], [...PNJ, persona("nonna", "Nonna", "Abuela", 5, 5, da("ida"))]);
  const p = nuevoProgreso();
  assert.deepEqual(marcas(p, A).tiene, ["nonna", "pietro"], "the givers of what you may take now, in the adventure's order of quests");
  aceptar(p, A.misiones.get("ida")!, A);
  assert.deepEqual(marcas(p, A), { tiene: ["bianca", "pietro"], hecho: ["nonna"], cosas: [] }, "a step to do now comes before an offer");
  hacer(p, A, { tipo: "habla", pnj: "bianca" });
  assert.deepEqual(marcas(p, A), { tiene: ["pietro"], hecho: ["nonna"], cosas: ["telas"] }, "Bianca has a step later in the quest: neither «!» nor ✓");
  hacer(p, A, { tipo: "usa", cosa: "telas" });
  assert.deepEqual(marcas(p, A), { tiene: ["bianca", "pietro"], hecho: ["nonna"], cosas: [] });
  hacer(p, A, { tipo: "habla", pnj: "bianca" });
  assert.deepEqual(marcas(p, A), { tiene: ["pietro"], hecho: ["bianca", "nonna"], cosas: [] });
  // abandoning gives the offer back, and what was done in it is forgotten
  aceptar(p, A.misiones.get("vuelo")!, A); hacer(p, A, recibir("bianca"));
  assert.ok(abandonar(p, "vuelo"));
  assert.deepEqual(marcas(p, A), { tiene: ["pietro"], hecho: ["bianca", "nonna"], cosas: [] }, "Bianca is ✓ for «ida», not for the quest left");
  // a repeatable quest offers again once done; a quest that requires another is offered only after it
  const otra = { ...VUELO, id: "otra", requisitos: { misiones: ["vuelo"] }, pasos: [{ id: "x", tipo: "habla_con", texto: "Habla con Leonardo", pnj: "leonardo" }] };
  const B = cargar([{ ...VUELO, repetible: true }, otra], [...PNJ, persona("guido", "Guido", "Mercader", 5, 5, da("otra"))]);
  const q = nuevoProgreso();
  assert.deepEqual(marcas(q, B).tiene, ["pietro"], "Guido's quest asks for «vuelo» first");
  aceptar(q, B.misiones.get("vuelo")!, B);
  for (const s of ["cosimo", "bianca", "artemisia"]) hacer(q, B, recibir(s));
  hacer(q, B, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" }); hacer(q, B, { tipo: "usa", cosa: "cofre" });
  assert.deepEqual(marcas(q, B), { tiene: ["pietro", "guido"], hecho: ["cosimo", "bianca", "artemisia", "leonardo"], cosas: [] }, "repeatable: Pietro offers again (not ✓); Guido's turn");
  // the same person giving two quests at once is marked once
  const C = cargar([VUELO, { ...otra, requisitos: { misiones: [] } }], [persona("pietro", "Pietro", "Aprendiz", 0, 0, { entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Cuál?", opciones: [{ texto: "Vuelo", accion: { tipo: "dar_mision", mision: "vuelo" } }, { texto: "Otra", accion: { tipo: "dar_mision", mision: "otra" } }] } } }), ...PNJ.slice(1)]);
  assert.deepEqual(marcas(nuevoProgreso(), C), { tiene: ["pietro"], hecho: [], cosas: [] });
});

test("the wire: an id list cut on a whole id at the byte cap", () => {
  assert.equal(enTexto(["aa", "bb", "cc"], 8), "aa,bb,cc");
  assert.equal(enTexto(["aa", "bb", "cc"], 7), "aa,bb");
  assert.equal(enTexto(["aa", "bb", "cc"], 2), "aa");
  assert.equal(enTexto(["largo"], 4), "");
  assert.equal(enTexto([], 256), "");
  const muchos = Array.from({ length: 40 }, (_, i) => `persona-${String(i).padStart(2, "0")}`); // 40 × 10 bytes
  const t = enTexto(muchos, 256);
  assert.ok(t.length <= 256 && t.split(",").length === 23 && muchos.slice(0, 23).join(",") === t, "the first ones (the most useful) stay");
});

// ---------- over the real plug: server + pages ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
type Rotulo = { text: string; sub?: string; mark?: string; x: number; y: number; z: number };
function plaza() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura() }), log: () => {}, identitySign: sign, now: () => Date.parse("2026-10-17T12:00:00Z") });
  type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"]; rotulos: Map<string, Rotulo>; llamadas: string[] };
  const paginas: Pagina[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente(), rotulos = new Map<string, Rotulo>(), llamadas: string[] = [];
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag: (key, x) => { llamadas.push(key); if (x) rotulos.set(key, { ...x }); else rotulos.delete(key); } } });
    const p = { s, t, m: cli.misiones, rotulos, llamadas };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.feature === "misiones" && e.event === nombre).length;
  return { abrir, pump, ir, eventos };
}

test("over the plug: marks only to their owner (both tabs), never to another guest; labels with the trade and the mark, redrawn only on change; quest things labelled only while marked", () => {
  const W = plaza(), k = keeper();
  const a = W.abrir(k), b = W.abrir();
  W.pump(3);
  const a2 = W.abrir(k); // a second tab of the same guest
  W.pump(3);
  assert.notEqual(a.s.who?.id, b.s.who?.id);
  assert.equal(a2.s.who?.id, a.s.who?.id);
  for (const p of [a, a2, b]) assert.deepEqual(p.m.marcas(), { tiene: ["pietro"], hecho: [], cosas: [] });
  // the label: the trade as a second line, the mark over the name
  assert.deepEqual(a.rotulos.get("pnj:pietro"), { text: "Pietro", sub: "Aprendiz", mark: "!", x: 0, y: 2.25, z: 0 });
  assert.deepEqual(a.rotulos.get("pnj:cosimo"), { text: "Cosimo", sub: "Carpintero", x: 10, y: 2.25, z: 0 }, "no mark: no `mark` at all");
  assert.equal([...a.rotulos.keys()].filter((key) => key.startsWith("misiones:")).length, 0, "quest things carry no label while unmarked");
  assert.deepEqual([a.m.marcaDe("pnj", "pietro"), a.m.marcaDe("pnj", "cosimo"), a.m.oficioDe("cosimo"), a.m.oficioDe("nadie")], ["!", "", "Carpintero", ""]);
  // A takes the quest from Pietro: A's two tabs see the artisans, B sees nothing new
  const marcasB = b.m.marcas(), eventosB = W.eventos(b, "marcas"), llamadasB = b.llamadas.length;
  W.ir(a, 1, 0); a.m.hablar("pietro"); W.pump(2);
  assert.deepEqual(a.m.dialogo()?.oficio, "Aprendiz", "the dialogue box knows the trade");
  a.m.elegir(1); W.pump(3);
  for (const p of [a, a2]) assert.deepEqual(p.m.marcas(), { tiene: ["cosimo", "bianca", "artemisia"], hecho: ["pietro"], cosas: [] });
  assert.equal(a2.rotulos.get("pnj:bianca")?.mark, "!");
  assert.equal(a2.rotulos.get("pnj:pietro")?.mark, "✓");
  assert.equal(b.m.marcas(), marcasB, "the other guest's marks did not even change identity");
  assert.equal(W.eventos(b, "marcas"), eventosB, "nothing was sent to the other guest");
  assert.equal(b.llamadas.length, llamadasB, "and nothing was drawn again there");
  assert.equal(b.rotulos.get("pnj:pietro")?.mark, "!");
  assert.equal(b.rotulos.get("pnj:bianca")?.mark, undefined);
  // Bianca gives the cloth: only her label is drawn again (! → ✓)
  let antes = a.llamadas.length;
  W.ir(a, -9, 0); a.m.hablar("bianca"); W.pump(3); a.m.adios(); W.pump(2);
  assert.deepEqual(a.llamadas.slice(antes), ["pnj:bianca"]);
  assert.equal(a.rotulos.get("pnj:bianca")?.mark, "✓");
  // the same marks again (following a quest resends the book): the same object, nothing drawn
  const mismas = a.m.marcas(); antes = a.llamadas.length;
  a.m.seguir("vuelo"); W.pump(3);
  assert.ok(W.eventos(a, "marcas") > 1);
  assert.equal(a.m.marcas(), mismas);
  assert.equal(a.llamadas.length, antes);
  // the rest of the block, then Leonardo, then the chest: it has a label only while it is marked
  W.ir(a, 9, 0); a.m.hablar("cosimo"); W.pump(2);
  assert.equal(a.m.dialogo()?.oficio, "Carpintero");
  a.m.elegir(1); W.pump(2);
  W.ir(a, 0, 9); a.m.hablar("artemisia"); W.pump(2); a.m.adios(); W.pump(2);
  assert.deepEqual(a.m.marcas(), { tiene: ["leonardo"], hecho: ["cosimo", "bianca", "artemisia", "pietro"], cosas: [] });
  W.ir(a, 0, -9); a.m.hablar("leonardo"); W.pump(2); a.m.elegir(1); W.pump(3);
  assert.deepEqual(a.m.marcas().cosas, ["cofre"]);
  assert.deepEqual(a.rotulos.get("misiones:cofre"), { text: "Cofre de la bottega", mark: "!", x: 2, y: 1.5, z: -12 }, "over the house block's top");
  assert.equal(a.m.marcaDe("misiones", "cofre"), "!");
  assert.equal(b.rotulos.has("misiones:cofre"), false, "not for the other guest");
  W.ir(a, 2, -11); a.m.usar("cofre"); W.pump(3);
  assert.equal(a.m.libro()[0].estado, "hecha");
  assert.equal(a.rotulos.has("misiones:cofre"), false, "used: the label goes");
  assert.deepEqual(a.m.marcas(), { tiene: [], hecho: ["cosimo", "bianca", "artemisia", "leonardo", "pietro"], cosas: [] });
  for (const id of ["pietro", "cosimo", "bianca", "artemisia", "leonardo"]) assert.equal(a2.rotulos.get(`pnj:${id}`)?.mark, "✓", id);
  assert.deepEqual(b.m.marcas(), { tiene: ["pietro"], hecho: [], cosas: [] }, "B still has it all ahead");
});
