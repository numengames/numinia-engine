// P3: things that are inspected (cosa@1 `dialogo`), people and things that say nothing outside their phase (the last
// entrada with a `si`), quests that point at nothing (mision@1 `pistas: false`), the notice of a step tried too early
// (`antes`, at most once every 5 s) and the book that opens when the notebook is picked up (`coge` + `abreLibro`).
// Formats good and bad, the pure machine, and the whole thing over the real plug (server + two pages).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerCosa, leerMision, leerPnj } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { aceptar, bloqueados, callan, marcas, nodoInicial, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import type { Suceso } from "../features/misiones/maquina.ts";
import { crearMisiones, ANTES_CADA_MS } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const persona = (id: string, nombre: string, x: number, z: number, dialogo: unknown) => ({ formato: "pnj@1", id, nombre, posicion: { x, z }, dialogo });
const charla = (texto: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto, opciones: [adios] } } });
const da = (...ms: string[]) => ({ entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayuda?", opciones: [...ms.map((mision) => ({ texto: `Acepto ${mision}.`, accion: { tipo: "dar_mision", mision } })), adios] } } });
const cosa = (id: string, nombre: string, x: number, z: number, extra: object = {}) => ({ formato: "cosa@1", id, nombre, posicion: { x, z }, aviso: `usar ${id}`, ...extra });

// the crime scene in small: a notebook to pick up (opens the book), a stain to inspect (counts), a window to inspect (never counts),
// the cordon to reach (only after the stain: `antes`), a corporal who speaks only while the stain is the step
const CASO = {
  formato: "mision@1", id: "caso", titulo: "La escena", descripcion: "Examine la escena.", pistas: false,
  pasos: [
    { id: "cuaderno", tipo: "coge", texto: "Recoja el cuaderno", cosa: "cuaderno", abreLibro: true },
    { id: "mancha", tipo: "usa", texto: "Examine la mancha", cosa: "mancha" },
    { id: "precinto", tipo: "llega_a", texto: "Llegue al precinto", x: 30, z: 0, lugar: "el precinto", antes: "Recoja antes el cuaderno de investigación." },
  ],
};
const OTRA = { formato: "mision@1", id: "otra", titulo: "Un recado", descripcion: "Hable con Ana.", pasos: [{ id: "ana", tipo: "habla_con", texto: "Hable con Ana", pnj: "ana" }] };
const INSPECCION = (conAvance: boolean) => ({
  entradas: [{ nodo: "ver" }],
  nodos: { ver: { texto: "Una mancha oscura.", opciones: [...(conAvance ? [{ texto: "Tomar nota.", accion: { tipo: "avanzar_paso", mision: "caso" } }] : []), adios] } },
});
const PNJ = [
  persona("jefe", "Jefa", 0, 0, da("caso", "otra")),
  persona("ana", "Ana", -10, 0, charla("Hola.")),
  // speaks only while «caso» is at its stain step: the LAST entrada has a `si`
  persona("cabo", "Cabo", 10, 0, { entradas: [{ si: [{ mision: "caso", estado: "activa", paso: "mancha" }], nodo: "hola" }], nodos: { hola: { texto: "Yo vi algo.", opciones: [adios] } } }),
];
const COSAS = [
  cosa("cuaderno", "Cuaderno", 5, 5),
  cosa("mancha", "Mancha", 12, 12, { aviso: "inspeccionar la mancha", dialogo: INSPECCION(true) }),
  cosa("ventana", "Ventana", 14, 12, { aviso: "inspeccionar la ventana", dialogo: INSPECCION(false) }),
];
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [CASO, OTRA], pnj: Doc[] = PNJ, cosas: Doc[] = COSAS) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", pnj), cosas: ficheros("cosas", cosas) });
const cargar = (misiones?: Doc[], pnj?: Doc[], cosas?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones, pnj, cosas)); assert.deepEqual(r.issues, []); return r.aventura; };
const problemas = (misiones?: Doc[], pnj?: Doc[], cosas?: Doc[]): string => cargarAventura(aventura(misiones, pnj, cosas)).issues.map((i) => `${i.path}: ${i.message}`).join("\n");

test("formats: dialogo on a cosa, a last entrada with `si`, pistas, antes, abreLibro — good, and each mistake says where and how to fix it", () => {
  const A = cargar();
  assert.equal(A.misiones.get("caso")!.pistas, false);
  const p0 = A.misiones.get("caso")!.pasos[0]; assert.equal(p0.tipo === "coge" && p0.abreLibro, true);
  assert.equal(A.misiones.get("caso")!.pasos[2].antes, "Recoja antes el cuaderno de investigación.");
  assert.ok(A.cosas.get("mancha")!.dialogo && !A.cosas.get("cuaderno")!.dialogo);
  // the last entrada may carry a `si` now, in a person and in a thing
  assert.ok(leerPnj(PNJ[2]).ok);
  // «without the new fields nothing changes»: no key appears
  const vieja = leerMision({ formato: "mision@1", id: "m", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "coge", texto: "t", cosa: "c" }] });
  assert.ok(vieja.ok);
  if (vieja.ok) { assert.equal("pistas" in vieja.value, false); assert.equal("abreLibro" in vieja.value.pasos[0], false); assert.equal("antes" in vieja.value.pasos[0], false); }
  const sinDialogo = leerCosa({ formato: "cosa@1", id: "c", nombre: "C", posicion: { x: 0, z: 0 }, aviso: "usar" });
  assert.ok(sinDialogo.ok && !("dialogo" in sinDialogo.value));
  // mistakes
  const m = (x: object) => leerMision({ ...CASO, ...x });
  const quien = (r: ReturnType<typeof m>) => (r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`));
  assert.ok(quien(m({ pistas: "no" })).some((s) => s.startsWith("pistas:") && /true|false/.test(s)));
  assert.ok(quien(m({ pasos: [{ ...CASO.pasos[0], abreLibro: "sí" }] })).some((s) => s.startsWith("pasos[0].abreLibro:")));
  assert.ok(quien(m({ pasos: [{ ...CASO.pasos[0], antes: "" }] })).some((s) => s.startsWith("pasos[0].antes:")), "empty");
  assert.ok(quien(m({ pasos: [CASO.pasos[0], { ...CASO.pasos[1], antes: "á".repeat(41) }, CASO.pasos[2]] })).some((s) => s.startsWith("pasos[1].antes:") && /bytes/.test(s)), "81 bytes");
  assert.ok(quien(m({ pasos: [{ ...CASO.pasos[0], antes: "Primero." }, CASO.pasos[1]] })).some((s) => s.startsWith("pasos[0].antes:") && /primeros/.test(s)), "a first step is never locked");
  assert.ok(quien(m({ pasos: [{ ...CASO.pasos[1], abreLibro: true }] })).some((s) => s.startsWith("pasos[0].abreLibro:")), "abreLibro is for coge");
  const d = (x: object) => problemas([CASO, OTRA], PNJ, [COSAS[0], { ...COSAS[1], dialogo: { ...INSPECCION(true), ...x } }, COSAS[2]]);
  assert.match(d({ entradas: [{ nodo: "nada" }] }), /cosas\/mancha\.json: dialogo\.entradas\[0\]\.nodo: no hay ningún nodo «nada»/);
  const sinAvance = problemas([CASO, OTRA], PNJ, [COSAS[0], COSAS[2], { ...COSAS[1], dialogo: INSPECCION(false) }]);
  assert.match(sinAvance, /cosas\/mancha: .*paso usa|misiones\/caso: pasos\[1\]\.cosa: .*avanzar_paso/, sinAvance);
  assert.match(problemas([CASO, OTRA], PNJ, [COSAS[0], { ...COSAS[1], dialogo: { entradas: [{ nodo: "ver" }], nodos: { ver: { texto: "x", opciones: [{ texto: "Dar", accion: { tipo: "dar_mision", mision: "otra" } }] } } } }, COSAS[2]]), /dialogo\.nodos\.ver\.opciones\[0\]\.accion\.tipo: una cosa no da misiones/);
  assert.match(problemas([CASO, OTRA], [...PNJ, persona("mancha", "Mancha", 1, 1, charla("x"))]), /ya es una persona/);
});

test("the machine: nodoInicial and callan — the first entrada that holds; the last with a `si` and none holding = nothing to say", () => {
  const A = cargar(), p = nuevoProgreso();
  const cabo = A.pnjs.get("cabo")!, mancha = A.cosas.get("mancha")!;
  assert.equal(nodoInicial(cabo, p, A), null, "before the quest");
  assert.deepEqual(callan(p, A), ["cabo"], "the thing with an always-valid entrada is not there");
  aceptar(p, A.misiones.get("caso")!, A);
  assert.equal(nodoInicial(cabo, p, A), null, "at the notebook step");
  assert.equal(nodoInicial({ dialogo: mancha.dialogo! }, p, A), "ver");
  registrar(p, A, { tipo: "usa", cosa: "cuaderno" });
  assert.equal(nodoInicial(cabo, p, A), "hola", "at the stain step");
  assert.deepEqual(callan(p, A), []);
  // a person whose last entrada has no `si` is never silent (today's rule)
  assert.equal(nodoInicial(A.pnjs.get("ana")!, nuevoProgreso(), A), "hola");
});

test("the machine: a usa step on a thing with a conversation is done only by its avanzar_paso option; the irrelevant one never completes it", () => {
  const A = cargar(), p = nuevoProgreso();
  aceptar(p, A.misiones.get("caso")!, A);
  registrar(p, A, { tipo: "usa", cosa: "cuaderno" });
  assert.equal(registrar(p, A, { tipo: "usa", cosa: "mancha" }).length, 0, "inspecting alone does not count");
  assert.equal(registrar(p, A, { tipo: "usa", cosa: "ventana", mision: "caso" }).length, 0, "the window is not the step");
  assert.equal(registrar(p, A, { tipo: "usa", cosa: "mancha", mision: "otra" }).length, 0, "nor another quest's option");
  assert.equal(registrar(p, A, { tipo: "usa", cosa: "mancha", mision: "caso" }).length, 1);
});

test("the machine: pistas:false leaves no marks of its own, and the other quests none the worse", () => {
  const A = cargar(), p = nuevoProgreso();
  aceptar(p, A.misiones.get("caso")!, A);
  assert.deepEqual(marcas(p, A), { tiene: ["jefe"], hecho: [], cosas: [] }, "only the giver of «otra», offered; «caso» points at nothing");
  aceptar(p, A.misiones.get("otra")!, A);
  assert.deepEqual(marcas(p, A), { tiene: ["ana"], hecho: ["jefe"], cosas: [] }, "«otra» still points");
  // the same quest with pistas on (default): the cuaderno is marked
  const B = cargar([{ ...CASO, pistas: undefined }, OTRA]), q = nuevoProgreso();
  aceptar(q, B.misiones.get("caso")!, B);
  assert.deepEqual(marcas(q, B).cosas, ["cuaderno"]);
});

test("the machine: bloqueados — a later step with `antes` that this event would complete; the first block never", () => {
  const A = cargar(), p = nuevoProgreso();
  aceptar(p, A.misiones.get("caso")!, A);
  const llega: Suceso = { tipo: "llega", x: 30, z: 0, y: 0, ahora: 0 };
  assert.deepEqual(bloqueados(p, A, llega), [{ mision: "caso", paso: 2, antes: "Recoja antes el cuaderno de investigación." }]);
  assert.deepEqual(bloqueados(p, A, { tipo: "llega", x: 0, z: 0, y: 0, ahora: 0 }), [], "elsewhere");
  registrar(p, A, { tipo: "usa", cosa: "cuaderno" });
  registrar(p, A, { tipo: "usa", cosa: "mancha", mision: "caso" });
  assert.deepEqual(bloqueados(p, A, llega), [], "unlocked: it is not locked any more");
});

// ---------- over the real plug: server + pages ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const RELOJ = { ms: Date.parse("2026-10-17T12:00:00Z") };
function plaza() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura(), reloj: () => RELOJ.ms }), log: () => {}, identitySign: sign, now: () => Date.parse("2026-10-17T12:00:00Z") });
  type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"]; rotulos: Map<string, { mark?: string }> };
  const paginas: Pagina[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente(), rotulos = new Map<string, { mark?: string }>();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag: (key, x) => { if (x) rotulos.set(key, { ...x }); else rotulos.delete(key); } } });
    const p = { s, t, m: cli.misiones, rotulos };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.feature === "misiones" && e.event === nombre);
  return { abrir, pump, ir, eventos };
}

test("over the plug: inspect — «E» on the stain opens its panel; only its option counts the step; the window opens but never counts", () => {
  const W = plaza(), a = W.abrir();
  W.pump(3);
  // the thing is declared inspectable; the book is empty yet: «E» only for what has something to say
  W.ir(a, 1, 0); a.m.hablar("jefe"); W.pump(2); a.m.elegir(1); W.pump(3); a.m.adios(); W.pump(2);
  assert.equal(a.m.libro().find((x) => x.id === "caso")?.estado, "activa");
  assert.equal(a.m.ofrece("misiones", "mancha"), true, "a thing with a conversation is offered");
  assert.equal(a.m.ofrece("misiones", "ventana"), true, "the irrelevant one, too: nothing gives the answer away");
  assert.equal(a.m.ofrece("misiones", "cuaderno"), true);
  // inspecting the stain BEFORE its turn opens the panel (the conversation is open to any) but counts nothing
  W.ir(a, 12, 11); a.m.usar("mancha"); W.pump(3);
  assert.equal(a.m.dialogo()?.pnj, "mancha");
  assert.equal(a.m.dialogo()?.nombre, "Mancha", "the title is the thing's name");
  assert.match(a.m.dialogo()?.texto ?? "", /mancha oscura/);
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 0, "still at the notebook");
  a.m.elegir(1); W.pump(3); // «Tomar nota» — not the step to do now: nothing moves
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 0);
  a.m.adios(); W.pump(2);
  // the notebook, then the stain counts through its option, the window never
  W.ir(a, 5, 4); a.m.usar("cuaderno"); W.pump(3);
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 1);
  W.ir(a, 14, 11); a.m.usar("ventana"); W.pump(3);
  assert.equal(a.m.dialogo()?.pnj, "ventana");
  assert.equal(a.m.dialogo()?.opciones.length, 1, "only «Adiós»");
  a.m.elegir(1); W.pump(3);
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 1);
  W.ir(a, 12, 11); a.m.usar("mancha"); W.pump(3); a.m.elegir(1); W.pump(3);
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 2, "the stain's option counted the step");
  // out of reach: refused
  W.ir(a, 0, 0); a.m.elegir(1); W.pump(2);
  assert.equal(a.m.dialogo(), null);
});

test("over the plug: a person with nothing to say outside its phase — no «E» offered, the server refuses; in phase it talks", () => {
  const W = plaza(), a = W.abrir();
  W.pump(3);
  W.ir(a, 9, 0);
  assert.equal(a.m.ofrece("pnj", "cabo"), false, "before: no «E»");
  a.m.hablar("cabo"); W.pump(3);
  assert.equal(a.m.dialogo(), null, "and the server refuses the talk");
  assert.ok(W.eventos(a, "rechazado").length + a.s.features.log.filter((e) => e.event === "rechazado").length > 0);
  W.ir(a, 1, 0); a.m.hablar("jefe"); W.pump(2); a.m.elegir(1); W.pump(3); a.m.adios(); W.pump(2);
  assert.equal(a.m.ofrece("pnj", "cabo"), false, "at the notebook step");
  W.ir(a, 5, 4); a.m.usar("cuaderno"); W.pump(3);
  assert.equal(a.m.ofrece("pnj", "cabo"), true, "at the stain step: it talks");
  W.ir(a, 9, 0); a.m.hablar("cabo"); W.pump(3);
  assert.equal(a.m.dialogo()?.pnj, "cabo");
  a.m.adios(); W.pump(2);
  // the others always talk (the last entrada has no `si`)
  assert.equal(a.m.ofrece("pnj", "ana"), true);
});

test("over the plug: pistas:false — the quest's step reaches the page without a place, its marks and the objective are not there; the other quest's are", () => {
  const W = plaza(), a = W.abrir();
  W.pump(3);
  W.ir(a, 1, 0); a.m.hablar("jefe"); W.pump(2); a.m.elegir(1); W.pump(3); a.m.adios(); W.pump(2);
  a.m.hablar("jefe"); W.pump(2); a.m.elegir(2); W.pump(3); a.m.adios(); W.pump(2);
  const lib = a.m.libro(), caso = lib.find((x) => x.id === "caso")!, otra = lib.find((x) => x.id === "otra")!;
  assert.equal(caso.pistas, false);
  assert.equal(otra.pistas, undefined, "the default stays as it was");
  assert.ok(caso.lista.every((s) => s.x === 0 && s.z === 0 && s.donde === ""), "no place for any step");
  assert.deepEqual(a.m.marcas().cosas, [], "no «!» over the notebook");
  assert.deepEqual(a.m.marcas().tiene, ["ana"], "but «otra» points at Ana");
  assert.equal(a.rotulos.get("pnj:ana")?.mark, "!");
  assert.equal(a.m.objetivos().filter((o) => o.mision === "caso").length, 1, "the book still tells the step to do now");
  assert.equal(a.m.senalados().filter((o) => o.mision === "caso").length, 0, "the map, the beacon and the top line read these: nothing of «caso»");
  assert.equal(a.m.senalados().filter((o) => o.mision === "otra").length, 1);
  a.m.seguir("caso"); W.pump(3);
  assert.equal(a.m.senala(), "", "no arrow for it");
});

test("over the plug: `antes` — the notice at the cordon before the stain, at most once every 5 s, and nothing once it is time", () => {
  const W = plaza(), a = W.abrir();
  W.pump(3);
  W.ir(a, 1, 0); a.m.hablar("jefe"); W.pump(2); a.m.elegir(1); W.pump(3); a.m.adios(); W.pump(2);
  const avisos = () => W.eventos(a, "aviso").map((e) => String((e as unknown as { data?: { texto?: string } }).data?.texto ?? JSON.stringify(e)));
  const antes = avisos().length;
  W.ir(a, 30, 0); W.pump(12); // arrive at the cordon too soon
  const nuevos = avisos().slice(antes).filter((t) => /Recoja antes el cuaderno/.test(t));
  assert.equal(nuevos.length, 1, "told once: " + JSON.stringify(avisos()));
  W.pump(40); // still standing there: not told again inside the window
  assert.equal(avisos().slice(antes).filter((t) => /Recoja antes/.test(t)).length, 1);
  RELOJ.ms += ANTES_CADA_MS + 1; W.ir(a, 29, 0); W.ir(a, 30, 0); W.pump(12);
  assert.equal(avisos().slice(antes).filter((t) => /Recoja antes/.test(t)).length, 2, "again after 5 s");
  assert.equal(a.m.libro().find((x) => x.id === "caso")!.paso, 0, "and nothing moved");
});

test("over the plug: abreLibro — picking up the notebook asks the page to open the book, once, to who picked it", () => {
  const W = plaza(), a = W.abrir(), b = W.abrir();
  W.pump(3);
  W.ir(a, 1, 0); a.m.hablar("jefe"); W.pump(2); a.m.elegir(1); W.pump(3); a.m.adios(); W.pump(2);
  assert.equal(W.eventos(a, "abrirLibro").length, 0);
  W.ir(a, 5, 4); a.m.usar("cuaderno"); W.pump(3);
  assert.equal(W.eventos(a, "abrirLibro").length, 1);
  assert.equal(W.eventos(b, "abrirLibro").length, 0, "nobody else");
  W.pump(10);
  assert.equal(W.eventos(a, "abrirLibro").length, 1, "once");
});
