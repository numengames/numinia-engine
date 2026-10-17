// U14 (2): quest steps in any order (`grupo`), a person gives you a thing (`recibe`) and several things delivered at
// once (`entrega.cosas`) — the TRG26 quest «El vuelo del Maestro» in small: three artisans each give you a piece, in
// any order, then Leonardo takes the three, then a chest. Formats and their paths, the machine (every order, no double
// counting, a reload mid-block), dialogue conditions, old saved progress, and the whole thing over the real plug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerMision } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { aceptar, cumple, esperaLlegada, leerProgreso, nodoInicial, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import type { Progreso, Suceso } from "../features/misiones/maquina.ts";
import { misiones as misionesDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const G = "Piezas reunidas";
const PASOS = [
  { id: "bastidor", tipo: "recibe", texto: "Recoge el bastidor de Cosimo", pnj: "cosimo", cosa: "bastidor", grupo: G },
  { id: "telas", tipo: "recibe", texto: "Recoge las telas de Bianca", pnj: "bianca", cosa: "telas", grupo: G },
  { id: "plano", tipo: "recibe", texto: "Recoge el plano de Artemisia", pnj: "artemisia", cosa: "plano", grupo: G },
  { id: "entrega", tipo: "entrega", texto: "Entrega las tres piezas a Leonardo", pnj: "leonardo", cosas: ["bastidor", "telas", "plano"] },
  { id: "cofre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" },
];
const VUELO = { formato: "mision@1", id: "vuelo", titulo: "El vuelo del Maestro", descripcion: "Reúne las tres piezas y llévaselas a Leonardo.", pasos: PASOS, textos: { aceptada: "Busca a los tres artesanos.", completada: "¡Eureka!" } };
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const persona = (id: string, nombre: string, x: number, z: number, dialogo: unknown) => ({ formato: "pnj@1", id, nombre, posicion: { x, z }, dialogo });
const PNJ = [
  persona("pietro", "Pietro, el aprendiz", 0, 0, { entradas: [{ si: { mision: "vuelo", estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "vuelo" } }] }, hola: { texto: "Busca a los artesanos.", opciones: [adios] } } }),
  // Cosimo gives only through his option (and only while his piece is still to get); Bianca and Artemisia, just by talking
  persona("cosimo", "Cosimo, el carpintero", 10, 0, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "bastidor" }, nodo: "da" }, { nodo: "hola" }], nodos: { da: { texto: "Aquí tienes el bastidor.", opciones: [{ texto: "Recibir bastidor", accion: { tipo: "avanzar_paso", mision: "vuelo" } }] }, hola: { texto: "Sin madera firme, nada vuela.", opciones: [adios] } } }),
  persona("bianca", "Bianca, la tejedora", -10, 0, { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Llévale estas telas al maestro.", opciones: [adios] } } }),
  persona("artemisia", "Artemisia, la humanista", 0, 10, { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Aquí tienes el plano.", opciones: [adios] } } }),
  persona("leonardo", "Leonardo", 0, -10, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "entrega" }, nodo: "listo" }, { nodo: "antes" }], nodos: { listo: { texto: "¡Magnífico!", opciones: [{ texto: "Entregar piezas", accion: { tipo: "entregar", mision: "vuelo" } }] }, antes: { texto: "Aún faltan piezas.", opciones: [adios] } } }),
];
const cosa = (id: string, nombre: string, x: number, z: number) => ({ formato: "cosa@1", id, nombre, posicion: { x, z }, aviso: `usar ${id}` });
const COSAS = [cosa("bastidor", "Bastidor de madera", 11, 1), cosa("telas", "Telas ligeras", -11, 1), cosa("plano", "Plano de equilibrio", 1, 11), cosa("cofre", "Cofre de la bottega", 2, -12)];
type Doc = { id: string; [campo: string]: unknown }; // one file as an author writes it
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [VUELO], pnj: Doc[] = PNJ, cosas: Doc[] = COSAS) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", pnj), cosas: ficheros("cosas", cosas) });
const cargar = (misiones?: Doc[], pnj?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones, pnj)); assert.deepEqual(r.issues, []); return r.aventura; };
const problemas = (misiones: Doc[], pnj: Doc[] = PNJ) => cargarAventura(aventura(misiones, pnj)).issues.map((i) => `${i.path}: ${i.message}`);
const soloCon = (...ids: string[]) => PNJ.filter((n) => ids.includes(n.id));
/** «vuelo» with other steps, and only the people it needs (Cosimo's and Leonardo's trees point at its own steps). */
const otraVuelo = (pasos: unknown[], ...gente: string[]) => cargar([{ ...VUELO, pasos }], soloCon("pietro", ...gente));

/** What the server would see when the player gets the piece from this artisan (Cosimo: his option; the others: talking). */
const recibir = (quien: string): Suceso => (quien === "cosimo" ? { tipo: "avanzar", pnj: "cosimo", mision: "vuelo" } : { tipo: "habla", pnj: quien });
const empezar = (A: Aventura): Progreso => { const p = nuevoProgreso(); assert.deepEqual(aceptar(p, A.misiones.get("vuelo")!, A), { ok: true }); return p; };
const ARTESANOS = ["cosimo", "bianca", "artemisia"], INDICE: Record<string, number> = { cosimo: 0, bianca: 1, artemisia: 2 };
const permutaciones = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

test("formats: recibe, grupo and entrega.cosas load; the plug's declaration grew (v3, the paso event's grupo)", () => {
  const A = cargar();
  const m = A.misiones.get("vuelo")!;
  assert.deepEqual(m.pasos.map((p) => [p.tipo, p.grupo ?? ""]), [["recibe", G], ["recibe", G], ["recibe", G], ["entrega", ""], ["usa", ""]]);
  assert.deepEqual(m.pasos[3], { id: "entrega", tipo: "entrega", texto: "Entrega las tres piezas a Leonardo", cosas: ["bastidor", "telas", "plano"], pnj: "leonardo" });
  assert.ok(A.explicitos.get("cosimo")!.avanza.has("vuelo"), "an avanzar_paso option may point at a recibe step");
  assert.ok(A.explicitos.get("leonardo")!.entrega.has("vuelo"));
  assert.deepEqual(misionesDecl.issues, []);
  assert.ok(misionesDecl.version >= 3, "v3 brought grupo and recibe");
  assert.ok((misionesDecl.events!.paso.fields.tipo as { values: readonly string[] }).values.includes("recibe"));
  assert.deepEqual(misionesDecl.events!.paso.fields.grupo, { kind: "text", maxBytes: 40, default: "" });
});

test("formats: a grupo split in two places, a missing person or thing, a thing never got — each with a path that says how to fix it", () => {
  const mision = (pasos: unknown[]) => ({ ...VUELO, id: "m", pasos });
  // the same grupo in two places (not adjacent)
  const partido = leerMision(mision([PASOS[0], { id: "x", tipo: "habla_con", texto: "Habla con Pietro", pnj: "pietro" }, PASOS[1]]));
  assert.equal(partido.ok, false);
  const pp = partido.ok ? [] : partido.issues.map((i) => `${i.path}: ${i.message}`);
  assert.ok(pp.some((s) => s.startsWith("pasos[2].grupo: «Piezas reunidas» ya es el grupo de pasos[0]") && /van seguidos/.test(s)), pp.join("\n"));
  // the grupo is 1-40 bytes; an unknown field on recibe lists what goes there
  const largo = leerMision(mision([{ ...PASOS[0], grupo: "á".repeat(21) }]));
  assert.ok(!largo.ok && largo.issues.some((i) => i.path === "pasos[0].grupo" && /bytes/.test(i.message)));
  const raro = leerMision(mision([{ ...PASOS[0], cosas: ["telas"] }]));
  assert.ok(!raro.ok && raro.issues.some((i) => i.path === "pasos[0].cosas" && /aquí van: id, tipo, texto, pnj, cosa, grupo\)/.test(i.message)), JSON.stringify(raro));
  // entrega: cosa or cosas, never both, never neither; 1-8 things, each once
  const entrega = (x: object) => { const r = leerMision(mision([PASOS[0], { id: "e", tipo: "entrega", texto: "Entrega", pnj: "leonardo", ...x }])); return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`); };
  assert.ok(entrega({ cosa: "bastidor", cosas: ["bastidor"] }).some((s) => s.startsWith("pasos[1].cosa:") && /no las dos/.test(s)));
  assert.ok(entrega({}).some((s) => s.startsWith("pasos[1].cosa:") && /"cosas"/.test(s)));
  assert.ok(entrega({ cosas: [] }).some((s) => s.startsWith("pasos[1].cosas:") && /de 1 a 8/.test(s)));
  assert.ok(entrega({ cosas: Array.from({ length: 9 }, (_, i) => `c${i}`) }).some((s) => s.startsWith("pasos[1].cosas:")));
  assert.ok(entrega({ cosas: ["bastidor", "bastidor"] }).some((s) => s.startsWith("pasos[1].cosas[1]:") && /una vez/.test(s)));
  // references (the adventure): a recibe from nobody, of nothing; an entrega of something unknown or never got before
  const t = problemas([mision([
    { id: "a", tipo: "recibe", texto: "t", pnj: "nadie", cosa: "nada" },
    PASOS[1],
    { id: "e", tipo: "entrega", texto: "t", pnj: "leonardo", cosas: ["telas", "humo", "plano"] },
  ])]).join("\n");
  assert.match(t, /misiones\/m: pasos\[0\]\.pnj: no hay ningún pnj «nadie»/);
  assert.match(t, /misiones\/m: pasos\[0\]\.cosa: no hay ninguna cosa «nada»/);
  assert.match(t, /misiones\/m: pasos\[2\]\.cosas\[1\]: no hay ninguna cosa «humo»/);
  assert.match(t, /misiones\/m: pasos\[2\]\.cosas\[2\]: para entregar «plano» antes hay que tenerla: .*coge.*recibe/);
  assert.doesNotMatch(t, /cosas\[0\]/, "telas is received before: fine");
  // an avanzar_paso option needs a habla_con or a recibe step with that person
  const sinPaso = problemas([{ ...VUELO, pasos: PASOS.slice(1).map((p) => (p.id === "entrega" ? { ...p, cosas: ["telas", "plano"] } : p)) }]).join("\n");
  assert.match(sinPaso, /pnj\/cosimo: dialogo\.nodos\.da\.opciones\[0\]\.accion: la misión «vuelo» no tiene ningún paso habla_con ni recibe con «cosimo»/);
});

test("any order: the three pieces in each of the 6 orders, then the delivery takes all three, then the chest", () => {
  const A = cargar();
  const ordenes = permutaciones(ARTESANOS);
  assert.equal(ordenes.length, 6);
  for (const orden of ordenes) {
    const p = empezar(A), act = p.activas.vuelo;
    assert.equal(esperaLlegada(p, A), false);
    orden.forEach((quien, k) => {
      const ultimo = k === orden.length - 1;
      assert.deepEqual(registrar(p, A, recibir(quien)), [{ mision: "vuelo", paso: INDICE[quien], completada: false }], `${orden}: ${quien}`);
      assert.equal(act.paso, ultimo ? 3 : 0, "the quest stays on the block until all of it is done");
      assert.deepEqual(act.hechos, ultimo ? [] : orden.slice(0, k + 1).map((q) => PASOS[INDICE[q]].id));
      assert.deepEqual([...act.tiene].sort(), orden.slice(0, k + 1).map((q) => PASOS[INDICE[q]].cosa).sort());
    });
    assert.deepEqual(registrar(p, A, { tipo: "habla", pnj: "leonardo" }), [], "Leonardo takes them only through his option");
    assert.deepEqual(registrar(p, A, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" }), [{ mision: "vuelo", paso: 3, completada: false }]);
    assert.deepEqual([act.paso, act.tiene, act.hechos], [4, [], []], "all three given at once");
    assert.deepEqual(registrar(p, A, { tipo: "usa", cosa: "cofre" }), [{ mision: "vuelo", paso: 4, completada: true }]);
    assert.deepEqual([p.activas, p.hechas, p.seguida], [{}, ["vuelo"], ""]);
  }
});

test("no double counting: the same artisan twice, a reload mid-block, a thing already carried; one step per event", () => {
  const A = cargar();
  const p = empezar(A);
  assert.equal(registrar(p, A, recibir("bianca")).length, 1);
  assert.deepEqual(registrar(p, A, recibir("bianca")), [], "talking to Bianca again gives nothing more");
  assert.deepEqual(registrar(p, A, { tipo: "habla", pnj: "cosimo" }), [], "Cosimo gives only through his option");
  assert.deepEqual(p.activas.vuelo, { paso: 0, tiene: ["telas"], hechos: ["telas"] });
  // saved and loaded back in the middle of the block: the same, and it goes on from there
  const guardado = JSON.parse(JSON.stringify(p));
  assert.ok(JSON.stringify(guardado).length < 120, "the store value stays small");
  const q = leerProgreso(guardado);
  assert.deepEqual(q, p);
  assert.deepEqual(registrar(q, A, recibir("bianca")), []);
  assert.deepEqual(registrar(q, A, recibir("artemisia")), [{ mision: "vuelo", paso: 2, completada: false }]);
  assert.deepEqual(registrar(q, A, recibir("cosimo")), [{ mision: "vuelo", paso: 0, completada: false }]);
  assert.deepEqual(q.activas.vuelo, { paso: 3, tiene: ["telas", "plano", "bastidor"], hechos: [] });
  assert.deepEqual(registrar(q, A, recibir("cosimo")), [], "once past the block, the artisans give nothing more");
  // recibe puts the thing in what you carry once, even when it was already there
  const r = empezar(A);
  r.activas.vuelo.tiene.push("bastidor");
  registrar(r, A, recibir("cosimo"));
  assert.deepEqual(r.activas.vuelo.tiene, ["bastidor"]);
  // one event completes at most one step per quest: the first that matches, in file order
  const dos = otraVuelo([
    { id: "hola", tipo: "habla_con", texto: "Saluda a Bianca", pnj: "bianca", grupo: "Saludos" },
    { id: "telas", tipo: "recibe", texto: "Recoge las telas", pnj: "bianca", cosa: "telas", grupo: "Saludos" },
  ], "bianca");
  const d = nuevoProgreso();
  aceptar(d, dos.misiones.get("vuelo")!, dos);
  assert.deepEqual(registrar(d, dos, { tipo: "habla", pnj: "bianca" }), [{ mision: "vuelo", paso: 0, completada: false }]);
  assert.deepEqual(registrar(d, dos, { tipo: "habla", pnj: "bianca" }), [{ mision: "vuelo", paso: 1, completada: true }]);
});

test("entrega with cosas: refused with 2 of the 3, takes all 3 when you carry them", () => {
  const A = cargar();
  const p = empezar(A);
  p.activas.vuelo = { paso: 3, tiene: ["bastidor", "plano"], hechos: [] }; // e.g. saved before the block got its third piece
  assert.deepEqual(registrar(p, A, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" }), []);
  assert.deepEqual(p.activas.vuelo.tiene, ["bastidor", "plano"], "nothing is taken when something is missing");
  p.activas.vuelo.tiene.push("telas", "regadera");
  assert.deepEqual(registrar(p, A, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" }), [{ mision: "vuelo", paso: 3, completada: false }]);
  assert.deepEqual(p.activas.vuelo.tiene, ["regadera"], "the three go, what else you carry stays");
});

test("dialogue conditions: `paso` on a step of a block holds while it is to do and stops once done; esperaLlegada sees the whole block", () => {
  const A = cargar();
  const p = empezar(A);
  const pasoEs = (paso: string) => cumple(p, [{ mision: "vuelo", estado: "activa", paso }], A);
  assert.deepEqual(["bastidor", "telas", "plano", "entrega"].map(pasoEs), [true, true, true, false], "the whole block is to do now");
  assert.equal(nodoInicial(A.pnjs.get("cosimo")!, p, A), "da");
  registrar(p, A, recibir("cosimo"));
  assert.deepEqual(["bastidor", "telas", "plano", "entrega"].map(pasoEs), [false, true, true, false]);
  assert.equal(nodoInicial(A.pnjs.get("cosimo")!, p, A), "hola", "Cosimo does not offer his piece twice");
  registrar(p, A, recibir("bianca")); registrar(p, A, recibir("artemisia"));
  assert.deepEqual(["bastidor", "telas", "plano", "entrega"].map(pasoEs), [false, false, false, true]);
  assert.equal(nodoInicial(A.pnjs.get("leonardo")!, p, A), "listo");
  // a llega_a inside a block is waited for even when it is not the block's first step
  const B = otraVuelo([
    { id: "hola", tipo: "habla_con", texto: "Saluda a Bianca", pnj: "bianca", grupo: "Recados" },
    { id: "fuente", tipo: "llega_a", texto: "Ve a la fuente", x: 20, z: 20, radio: 3, lugar: "La fuente", grupo: "Recados" },
    { id: "fin", tipo: "habla_con", texto: "Vuelve con Pietro", pnj: "pietro" },
  ], "bianca");
  const q = nuevoProgreso();
  aceptar(q, B.misiones.get("vuelo")!, B);
  assert.equal(esperaLlegada(q, B), true);
  assert.deepEqual(registrar(q, B, { tipo: "llega", x: 20, z: 21 }), [{ mision: "vuelo", paso: 1, completada: false }]);
  assert.equal(esperaLlegada(q, B), false, "done: no more position checks for it");
});

test("saved progress: old saves without `hechos` load as nothing done in the block; junk is dropped; a linear quest never stores any", () => {
  const viejo = leerProgreso({ v: 1, activas: { vuelo: { paso: 0, tiene: ["telas"] } }, hechas: [], seguida: "vuelo" });
  assert.deepEqual(viejo.activas.vuelo, { paso: 0, tiene: ["telas"], hechos: [] });
  const sucio = leerProgreso({ v: 1, activas: { vuelo: { paso: 0, tiene: [], hechos: ["telas", 3, "Mal Id", "telas", ...Array.from({ length: 30 }, (_, i) => `p${i}`)] } }, hechas: [] });
  assert.deepEqual(sucio.activas.vuelo.hechos.slice(0, 2), ["telas", "p0"]);
  assert.ok(sucio.activas.vuelo.hechos.length <= 16);
  // the linear quests: each event moves one step on, in order, and nothing is kept in `hechos`
  const lineal = otraVuelo([
    { id: "pilar", tipo: "llega_a", texto: "Ve al pilar", x: 18, z: 0, radio: 4, lugar: "Pilar" },
    { id: "bianca", tipo: "habla_con", texto: "Habla con Bianca", pnj: "bianca" },
    { id: "telas", tipo: "coge", texto: "Coge las telas", cosa: "telas" },
    { id: "entrega", tipo: "entrega", texto: "Dáselas a Leonardo", pnj: "leonardo", cosa: "telas" },
  ], "bianca", "leonardo");
  const p = nuevoProgreso();
  aceptar(p, lineal.misiones.get("vuelo")!, lineal);
  assert.deepEqual(registrar(p, lineal, { tipo: "habla", pnj: "bianca" }), [], "not yet: the steps go in order");
  assert.deepEqual(registrar(p, lineal, { tipo: "usa", cosa: "telas" }), []);
  const hechos: unknown[] = [];
  for (const x of [{ tipo: "llega", x: 18, z: 1 }, { tipo: "habla", pnj: "bianca" }, { tipo: "usa", cosa: "telas" }, { tipo: "entregar", pnj: "leonardo", mision: "vuelo" }] as Suceso[]) {
    hechos.push(...registrar(p, lineal, x));
    if (p.activas.vuelo) assert.deepEqual(p.activas.vuelo.hechos, []);
  }
  assert.deepEqual(hechos, [0, 1, 2, 3].map((n) => ({ mision: "vuelo", paso: n, completada: n === 3 })));
});

// ---------- over the real plug: server + page controller ----------
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
function world() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura() }), log: () => {}, identitySign: sign, now: () => Date.parse("2026-10-17T12:00:00Z") });
  const t = inst.join(0), cli = crearCliente();
  const s = new ClientSession(t, { features: cli.parts, identity: keeper(), view: { label() {}, bounce() {}, place() {}, tag() {} } });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { t.flush(); inst.tick(); t.flush(); } };
  const ir = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); pump(12); };
  return { s, m: cli.misiones, pump, ir };
}

test("the TRG26 quest over the plug: three artisans at once on the map and the counter, «Has recibido», Leonardo takes the three, the chest", () => {
  const W = world(), { s, m } = W;
  W.pump(3);
  W.ir(1, 0); m.hablar("pietro"); W.pump(2); m.elegir(1); W.pump(2); // «Sí.» takes it (no `ir`: the talk ends)
  const libro = () => m.libro()[0];
  assert.deepEqual([libro().id, libro().estado, libro().paso], ["vuelo", "activa", 0]);
  assert.deepEqual(libro().lista.map((x) => [x.tipo, x.grupo]), [["recibe", G], ["recibe", G], ["recibe", G], ["entrega", ""], ["usa", ""]], "the book knows the grupo");
  assert.deepEqual(m.objetivos().map((o) => [o.paso, o.nombre, o.x, o.z]), [[0, "Cosimo, el carpintero", 10, 0], [1, "Bianca, la tejedora", -10, 0], [2, "Artemisia, la humanista", 0, 10]], "the map marks the three artisans at once");
  assert.deepEqual(m.resumen().seguida?.grupo, { nombre: G, hechos: 0, total: 3 });
  assert.equal(m.ofrece("misiones", "telas"), false, "a thing a person gives is not taken with E");
  // Bianca first (just talking): «Has recibido», counter 1/3, the book's first step to do is still Cosimo's
  W.ir(-9, 0); m.hablar("bianca"); W.pump(2);
  assert.ok(s.features.announcements.some((x) => x.text === "Hecho: Has recibido: Telas ligeras"), s.features.announcements.map((x) => x.text).join(" | "));
  assert.equal(m.estado.nota, "✓ Has recibido: Telas ligeras", "the note says what you got");
  assert.deepEqual([libro().paso, libro().lista.map((x) => x.hecho)], [0, [false, true, false, false, false]]);
  assert.deepEqual(m.objetivos().map((o) => o.paso), [0, 2]);
  assert.deepEqual(m.resumen().seguida?.grupo, { nombre: G, hechos: 1, total: 3 });
  const avisos = s.features.announcements.length;
  m.adios(); W.pump(2); m.hablar("bianca"); W.pump(2);
  assert.ok(!s.features.announcements.slice(avisos).some((x) => x.text.startsWith("Hecho:")), "talking again gives nothing more");
  m.adios(); W.pump(2);
  // Cosimo: only through his option; then Artemisia
  W.ir(9, 0); m.hablar("cosimo"); W.pump(2);
  assert.deepEqual(m.dialogo()?.opciones, ["Recibir bastidor"]);
  m.elegir(1); W.pump(2);
  assert.deepEqual([libro().paso, m.resumen().seguida?.grupo?.hechos], [2, 2]);
  W.ir(0, 9); m.hablar("artemisia"); W.pump(2); m.adios(); W.pump(2);
  assert.deepEqual([libro().paso, m.resumen().seguida?.grupo], [3, null], "past the block: no counter");
  assert.deepEqual(m.objetivos().map((o) => o.nombre), ["Leonardo"]);
  // Leonardo takes the three; then the chest
  W.ir(0, -9); m.hablar("leonardo"); W.pump(2);
  assert.deepEqual(m.dialogo()?.opciones, ["Entregar piezas"]);
  m.elegir(1); W.pump(2);
  assert.equal(libro().paso, 4);
  assert.equal(m.ofrece("misiones", "cofre"), true);
  W.ir(2, -11); m.usar("cofre"); W.pump(2);
  assert.deepEqual([libro().estado, m.objetivos()], ["hecha", []]);
});
