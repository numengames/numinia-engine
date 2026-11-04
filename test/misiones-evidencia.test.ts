// P4: evidence markers (cosa@1 `marcable`, step `marca`, numbered yellow plates for the player alone, counters for an evaluation).
// Formats good and bad, the pure machine (mark / unmark / renumber / exact set / counters / persistence), "without the new fields nothing
// changes", and the whole thing over the real plug (server + two pages of the same guest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerCosa, leerMision, MARCABLE_POR_DEFECTO } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { aceptar, callan, cuentaDe, desmarcar, leerProgreso, marcablesAhora, marcados, marcar, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import type { Progreso } from "../features/misiones/maquina.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const da = (mision: string) => ({ entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayuda?", opciones: [{ texto: "Acepto.", accion: { tipo: "dar_mision", mision } }, adios] } } });
const jefa = { formato: "pnj@1", id: "jefa", nombre: "Jefa", posicion: { x: 0, z: 0 }, dialogo: da("escena") };
const cosa = (id: string, x: number, extra: object = {}) => ({ formato: "cosa@1", id, nombre: id.toUpperCase(), descripcion: `Un indicio: ${id}.`, posicion: { x, z: 20 }, aviso: `inspeccionar ${id}`, ...extra });
// the phase-3 scene in small: six things; the footprint, the glass and the phone are the relevant ones; the glass has a card of its own
const IDS = ["pisada", "vaso", "movil", "correo", "guantes", "gafas"];
const RELEVANTES = ["pisada", "vaso", "movil"];
const COSAS = IDS.map((id, i) => cosa(id, 20 + 5 * i, { marcable: true, ...(id === "vaso" ? { dialogo: { entradas: [{ nodo: "ver" }], nodos: { ver: { texto: "Un vaso con restos.", opciones: [adios] } } } } : {}) }));
const ESCENA = {
  formato: "mision@1", id: "escena", titulo: "La escena", descripcion: "Marque los indicios.", pistas: false,
  pasos: [{ id: "indicios", tipo: "marca", texto: "Marque los indicios", cosas: RELEVANTES }, { id: "informe", tipo: "habla_con", texto: "Informe a la jefa", pnj: "jefa" }],
};
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [ESCENA], cosas: Doc[] = COSAS as Doc[]) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", [jefa]), cosas: ficheros("cosas", cosas) });
const cargar = (misiones?: Doc[], cosas?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones, cosas)); assert.deepEqual(r.issues, []); return r.aventura; };
const problemas = (misiones?: Doc[], cosas?: Doc[]): string => cargarAventura(aventura(misiones, cosas)).issues.map((i) => `${i.path}: ${i.message}`).join("\n");
const quien = (r: { ok: boolean; issues?: { path: string; message: string }[] }) => (r.ok ? [] : (r.issues ?? []).map((i) => `${i.path}: ${i.message}`));

test("formats: cosa@1 `marcable` and the step `marca` — good, and each mistake says where and how to fix it", () => {
  const A = cargar();
  assert.deepEqual(A.cosas.get("pisada")!.marcable, MARCABLE_POR_DEFECTO, "true = the house labels");
  const marca = A.misiones.get("escena")!.pasos[0];
  assert.equal(marca.tipo === "marca" && marca.cosas.join(), RELEVANTES.join());
  // own labels and offset
  const c = leerCosa(cosa("x", 0, { marcable: { marcar: "Fijar", dejar: "Dejarlo", offset: { x: 0.1, y: 1, z: -0.2 } } }));
  assert.ok(c.ok);
  if (c.ok) assert.deepEqual(c.value.marcable, { marcar: "Fijar", desechar: "Desechar", desmarcar: "Desmarcar", dejar: "Dejarlo", offset: { x: 0.1, y: 1, z: -0.2 } });
  // «without the new fields nothing changes»: no key appears
  const vieja = leerCosa({ formato: "cosa@1", id: "c", nombre: "C", posicion: { x: 0, z: 0 }, aviso: "usar" });
  assert.ok(vieja.ok && !("marcable" in vieja.value));
  const falsa = leerCosa(cosa("c", 0, { marcable: false }));
  assert.ok(falsa.ok && !("marcable" in falsa.value), "false = as if absent");
  // mistakes
  assert.ok(quien(leerCosa(cosa("c", 0, { marcable: "sí" }))).some((s) => s.startsWith("marcable:") && /true/.test(s)));
  assert.ok(quien(leerCosa(cosa("c", 0, { marcable: { marcar: "x".repeat(41) } }))).some((s) => s.startsWith("marcable.marcar:")));
  assert.ok(quien(leerCosa(cosa("c", 0, { marcable: { nada: 1 } }))).some((s) => s.startsWith("marcable.nada:") || s.startsWith("marcable:")));
  assert.ok(quien(leerCosa(cosa("c", 0, { marcable: { offset: { y: 9 } } }))).some((s) => s.startsWith("marcable.offset.y:")));
  const paso = (x: object) => leerMision({ ...ESCENA, pasos: [{ id: "i", tipo: "marca", texto: "t", ...x }] });
  assert.ok(quien(paso({})).some((s) => s.startsWith("pasos[0].cosas:")), "cosas is required");
  assert.ok(quien(paso({ cosas: [] })).some((s) => s.startsWith("pasos[0].cosas:")), "at least one");
  assert.ok(quien(paso({ cosas: ["a", "a"] })).some((s) => s.startsWith("pasos[0].cosas[1]:") && /una vez/.test(s)));
  assert.ok(quien(paso({ cosas: Array.from({ length: 17 }, (_, i) => `c${i}`) })).some((s) => s.startsWith("pasos[0].cosas:")), "at most 16");
  assert.ok(quien(paso({ cosas: ["a"], pnj: "x" })).some((s) => s.startsWith("pasos[0].pnj:") && /aquí van/.test(s)));
  // across files: a thing that is not marcable, one that does not exist, a card too full
  assert.match(problemas([{ ...ESCENA, pasos: [{ id: "i", tipo: "marca", texto: "t", cosas: ["pisada", "correo"] }] }], (COSAS as Doc[]).map((c) => (c.id === "correo" ? { ...c, marcable: undefined } : c))), /cosas\[1\]: «correo» no se puede marcar.*"marcable": true/);
  assert.match(problemas([{ ...ESCENA, pasos: [{ id: "i", tipo: "marca", texto: "t", cosas: ["pisada", "nadie"] }] }]), /cosas\[1\]: no hay ninguna cosa «nadie»/);
  const lleno = { entradas: [{ nodo: "ver" }], nodos: { ver: { texto: "T.", opciones: [adios, adios, adios] } } };
  assert.match(problemas(undefined, (COSAS as Doc[]).map((c) => (c.id === "vaso" ? { ...c, dialogo: lleno } : c))), /dialogo\.nodos\.ver\.opciones: .*2 opciones como mucho/);
  assert.equal(problemas(), "");
});

// ---------- the pure machine ----------
function conEscena(): { A: Aventura; p: Progreso } {
  const A = cargar(), p = nuevoProgreso();
  assert.ok(aceptar(p, A.misiones.get("escena")!, A, 0).ok);
  return { A, p };
}
const hecho = (A: Aventura, p: Progreso) => registrar(p, A, { tipo: "marca", marcados: marcados(p, A), ahora: 0 });

test("machine: mark A, B → 1, 2; unmark A → B is 1 (always consecutive); the cap and the repeats", () => {
  const { A, p } = conEscena();
  assert.deepEqual(marcados(p, A), []);
  assert.ok(marcar(p, A, "correo").ok); assert.ok(marcar(p, A, "vaso").ok); assert.ok(marcar(p, A, "gafas").ok);
  assert.deepEqual(marcados(p, A), ["correo", "vaso", "gafas"], "the number of each is its place + 1");
  assert.equal(marcar(p, A, "vaso").ok, false, "twice");
  assert.ok(desmarcar(p, A, "correo").ok);
  assert.deepEqual(marcados(p, A), ["vaso", "gafas"], "vaso is 1 now, gafas 2");
  assert.equal(desmarcar(p, A, "correo").ok, false, "what is not marked cannot be unmarked");
  assert.equal(marcar(p, A, "nadie").ok, false);
  assert.equal(marcar(p, A, "jefa").ok, false);
  assert.ok(desmarcar(p, A, "vaso").ok && desmarcar(p, A, "gafas").ok);
  assert.equal("marcados" in p, false, "an empty list is not kept");
  // up to 16 (the format's cap on a step); the 17th is refused
  const muchas = Array.from({ length: 17 }, (_, i) => cosa(`c${i}`, i, { marcable: true }));
  const B = cargar([{ ...ESCENA, pasos: [{ id: "i", tipo: "marca", texto: "t", cosas: ["c0"] }] }], muchas as Doc[]), q = nuevoProgreso();
  aceptar(q, B.misiones.get("escena")!, B, 0);
  for (let i = 0; i < 16; i++) assert.ok(marcar(q, B, `c${i}`).ok, `c${i}`);
  assert.equal(marcar(q, B, "c16").ok, false);
});

test("machine: only while a `marca` step is the one to do", () => {
  const A = cargar(), p = nuevoProgreso();
  assert.equal(marcar(p, A, "pisada").ok, false, "no quest yet");
  assert.deepEqual(marcablesAhora(p, A), []);
  aceptar(p, A.misiones.get("escena")!, A, 0);
  assert.deepEqual(marcablesAhora(p, A), IDS, "every marcable thing, relevant or not");
  for (const id of RELEVANTES) marcar(p, A, id);
  assert.equal(hecho(A, p).length, 1, "done");
  assert.deepEqual(marcablesAhora(p, A), [], "the step is done and the next one is not a marca");
  assert.equal(marcar(p, A, "gafas").ok, false);
  assert.equal(desmarcar(p, A, "pisada").ok, false, "nor unmarked: the evidence stays as it was");
  assert.deepEqual(marcados(p, A), RELEVANTES);
});

test("machine: the step is done only when EXACTLY the relevant set is marked (3 right + 1 wrong ⇒ not; remove the wrong ⇒ done); order irrelevant", () => {
  const { A, p } = conEscena();
  for (const id of ["movil", "pisada"]) { marcar(p, A, id); assert.equal(hecho(A, p).length, 0, `${id}: still missing one`); }
  marcar(p, A, "gafas");
  assert.equal(hecho(A, p).length, 0, "two right and one wrong");
  marcar(p, A, "vaso");
  assert.equal(hecho(A, p).length, 0, "three right + one wrong: too many is not exact");
  assert.equal(p.activas.escena.paso, 0);
  desmarcar(p, A, "gafas");
  const h = hecho(A, p);
  assert.equal(h.length, 1, "remove the wrong one ⇒ done");
  assert.equal(h[0].paso, 0);
  assert.equal(p.activas.escena.paso, 1, "on to the next step");
  // a different suceso never completes it
  const { A: A2, p: p2 } = conEscena();
  for (const id of RELEVANTES) marcar(p2, A2, id);
  assert.equal(registrar(p2, A2, { tipo: "habla", pnj: "jefa", ahora: 0 }).length, 0, "talking does not mark");
  assert.equal(registrar(p2, A2, { tipo: "usa", cosa: "pisada", ahora: 0 }).length, 0, "nor does using");
});

test("machine: counters per quest — marks, wrong marks, unmarks; kept after the quest; reset by a new attempt", () => {
  const { A, p } = conEscena();
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 0, marcas_erroneas: 0, desmarcados: 0 });
  marcar(p, A, "pisada"); marcar(p, A, "correo"); marcar(p, A, "guantes");
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 3, marcas_erroneas: 2, desmarcados: 0 });
  desmarcar(p, A, "correo"); desmarcar(p, A, "guantes");
  marcar(p, A, "correo");
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 4, marcas_erroneas: 3, desmarcados: 2 }, "re-marking a wrong one counts again");
  assert.equal(marcar(p, A, "pisada").ok, false);
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 4, marcas_erroneas: 3, desmarcados: 2 }, "a refused mark counts for nothing");
  desmarcar(p, A, "correo"); marcar(p, A, "vaso"); marcar(p, A, "movil");
  assert.equal(hecho(A, p).length, 1);
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 6, marcas_erroneas: 3, desmarcados: 3 }, "the evaluation reads this once done");
  assert.deepEqual(p.cuenta!.escena, cuentaDe(p, "escena"), "and it is in the progress");
  // persistence: the progress round-trips through JSON (the store) with its list and counters; garbage is dropped
  const vuelta = leerProgreso(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(vuelta.marcados, RELEVANTES);
  assert.deepEqual(vuelta.cuenta, p.cuenta);
  const sucio = leerProgreso({ ...JSON.parse(JSON.stringify(p)), marcados: ["a", "a", 3, "b"], cuenta: { escena: { marcas: -1, marcas_erroneas: "x", desmarcados: 2.5 }, "mal id": { marcas: 1 } } });
  assert.deepEqual(sucio.marcados, ["a", "b"]);
  assert.deepEqual(sucio.cuenta, { escena: { marcas: 0, marcas_erroneas: 0, desmarcados: 0 } });
  // a new attempt of the quest (repeatable) starts clean: nothing marked, counters at zero
  const rep = cargar([{ ...ESCENA, repetible: true }]), q = nuevoProgreso();
  aceptar(q, rep.misiones.get("escena")!, rep, 0);
  for (const id of ["correo", ...RELEVANTES]) marcar(q, rep, id);
  desmarcar(q, rep, "correo"); registrar(q, rep, { tipo: "marca", marcados: marcados(q, rep), ahora: 0 }); registrar(q, rep, { tipo: "habla", pnj: "jefa", ahora: 0 });
  assert.ok(q.hechas.includes("escena"));
  assert.equal(cuentaDe(q, "escena").marcas, 4);
  assert.ok(aceptar(q, rep.misiones.get("escena")!, rep, 0).ok);
  assert.deepEqual(cuentaDe(q, "escena"), { marcas: 0, marcas_erroneas: 0, desmarcados: 0 });
  assert.deepEqual(marcados(q, rep), []);
});

test("machine: a marcable thing with a conversation that has nothing to say still opens its card while a step marks (callan)", () => {
  const cerrada = { entradas: [{ si: [{ mision: "otra", estado: "activa" }], nodo: "ver" }], nodos: { ver: { texto: "T.", opciones: [adios] } } };
  const OTRA = { formato: "mision@1", id: "otra", titulo: "Otra", descripcion: "D.", pasos: [{ id: "a", tipo: "habla_con", texto: "t", pnj: "jefa" }] };
  const A = cargar([ESCENA, OTRA], (COSAS as Doc[]).map((c) => (c.id === "vaso" ? { ...c, dialogo: cerrada } : c))), p = nuevoProgreso();
  assert.ok(callan(p, A).includes("vaso"), "silent outside its phase");
  aceptar(p, A.misiones.get("escena")!, A, 0);
  assert.ok(!callan(p, A).includes("vaso"), "but it can be marked now: its «E» is there");
});

test("without the new fields nothing changes byte for byte: no key in the files, the progress or the saved JSON", () => {
  const vieja = { formato: "mision@1", id: "m", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "usa", texto: "t", cosa: "c" }] };
  const r = cargarAventura({ misiones: ficheros("misiones", [vieja]), pnj: [], cosas: ficheros("cosas", [cosa("c", 0)] as Doc[]) });
  assert.deepEqual(r.issues, []);
  const A = r.aventura;
  assert.equal("marcable" in A.cosas.get("c")!, false);
  const p = nuevoProgreso();
  assert.ok(aceptar(p, A.misiones.get("m")!, A, 0).ok);
  assert.equal(registrar(p, A, { tipo: "usa", cosa: "c", ahora: 0 }).length, 1);
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, /marcados|cuenta/, json);
  assert.equal(JSON.stringify(leerProgreso(JSON.parse(json))), json, "reading and saving it again gives the same text");
  assert.deepEqual(marcablesAhora(p, A), []);
});

// ---------- over the real plug: server + pages ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
function plaza() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura(), reloj: () => Date.parse("2026-10-17T12:00:00Z") }), log: () => {}, identitySign: sign, now: () => Date.parse("2026-10-17T12:00:00Z") });
  type Plaqueta = { n: number; x: number; y: number; z: number };
  type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"]; plaquetas: Map<string, Plaqueta> };
  const paginas: Pagina[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente(), plaquetas = new Map<string, Plaqueta>();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag() {}, marcador: (key, x) => { if (x) plaquetas.set(key, { ...x }); else plaquetas.delete(key); } } });
    const p = { s, t, m: cli.misiones, plaquetas };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.feature === "misiones" && e.event === nombre);
  const empezar = (p: Pagina) => { ir(p, 1, 0); p.m.hablar("jefa"); pump(2); p.m.elegir(1); pump(3); p.m.adios(); pump(2); };
  /** Go to a thing, open its card with «E» and choose the option whose text is `texto`. */
  const tarjeta = (p: Pagina, id: string, texto: string) => {
    const i = IDS.indexOf(id);
    ir(p, 20 + 5 * i, 19); p.m.usar(id); pump(3);
    const d = p.m.dialogo(), n = d ? d.opciones.indexOf(texto) + 1 : 0;
    if (!d || !n) return false;
    p.m.elegir(n); pump(3); p.m.adios(); pump(2);
    return true;
  };
  return { abrir, pump, ir, eventos, empezar, tarjeta };
}

test("over the plug: the card — «Marcar» / «Desechar» only while a step marks; «Desmarcar» / «Dejar marcado» when marked; numbers 1–3 and renumbering", () => {
  const W = plaza(), k = keeper(), a = W.abrir(k);
  W.pump(3);
  // before the quest: «E» on a marcable thing says it is not needed, and no card opens
  W.ir(a, 20, 19);
  assert.equal(a.m.ofrece("misiones", "pisada"), false, "no «E» before a step marks");
  a.m.usar("pisada"); W.pump(3);
  assert.equal(a.m.dialogo(), null);
  W.empezar(a);
  assert.equal(a.m.ofrece("misiones", "pisada"), true);
  assert.equal(a.m.ofrece("misiones", "gafas"), true, "the irrelevant ones too: nothing gives the answer away");
  // a thing without dialogo: a minimal card with its name and description, then the two buttons
  W.ir(a, 20, 19); a.m.usar("pisada"); W.pump(3);
  assert.equal(a.m.dialogo()?.nombre, "PISADA");
  assert.match(a.m.dialogo()?.texto ?? "", /Un indicio: pisada/);
  assert.deepEqual(a.m.dialogo()?.opciones, ["Marcar", "Desechar"]);
  a.m.elegir(2); W.pump(3); // «Desechar»: nothing is marked
  assert.equal(a.m.dialogo(), null, "the card closed");
  assert.deepEqual(a.m.marcados(), []);
  assert.equal(a.plaquetas.size, 0);
  assert.deepEqual(a.m.libro()[0].cuenta, { marcas: 0, marcas_erroneas: 0, desmarcados: 0 }, "discarding counts for nothing");
  // a thing with its own dialogo: the author's options, then the two buttons
  W.ir(a, 25, 19); a.m.usar("vaso"); W.pump(3);
  assert.match(a.m.dialogo()?.texto ?? "", /Un vaso con restos/);
  assert.deepEqual(a.m.dialogo()?.opciones, ["Adiós.", "Marcar", "Desechar"]);
  a.m.adios(); W.pump(2);
  // mark pisada (1), gafas (2: a wrong one), vaso (3)
  assert.ok(W.tarjeta(a, "pisada", "Marcar"));
  assert.ok(W.tarjeta(a, "gafas", "Marcar"));
  assert.ok(W.tarjeta(a, "vaso", "Marcar"));
  assert.deepEqual(a.m.marcados(), ["pisada", "gafas", "vaso"]);
  assert.deepEqual([...a.plaquetas].map(([key, v]) => [key, v.n]), [["misiones:pisada", 1], ["misiones:gafas", 2], ["misiones:vaso", 3]], "the plates 1–3 are on this page");
  assert.equal(a.m.numeroDe("vaso"), 3);
  const p1 = a.plaquetas.get("misiones:pisada")!;
  assert.deepEqual([p1.x, p1.y, p1.z], [20, 0.6, 20], "over the thing, at the offset (0.6 m by default)");
  assert.deepEqual(a.m.libro()[0].cuenta, { marcas: 3, marcas_erroneas: 1, desmarcados: 0 });
  assert.equal(a.m.libro()[0].paso, 0, "two right + one wrong: not done");
  // a marked thing offers «Desmarcar» / «Dejar marcado»
  W.ir(a, 20, 19); a.m.usar("pisada"); W.pump(3);
  assert.deepEqual(a.m.dialogo()?.opciones, ["Desmarcar", "Dejar marcado"]);
  a.m.elegir(2); W.pump(3);
  assert.deepEqual(a.m.marcados(), ["pisada", "gafas", "vaso"], "«Dejar marcado» leaves it");
  // unmark #1 → the others read 1–2
  assert.ok(W.tarjeta(a, "pisada", "Desmarcar"));
  assert.deepEqual(a.m.marcados(), ["gafas", "vaso"]);
  assert.deepEqual([...a.plaquetas].map(([key, v]) => [key, v.n]).sort(), [["misiones:gafas", 1], ["misiones:vaso", 2]], "renumbered, and #1's plate is gone");
  assert.deepEqual(a.m.libro()[0].cuenta, { marcas: 3, marcas_erroneas: 1, desmarcados: 1 });
  // the exact set: pisada back, movil, and the wrong gafas out ⇒ done
  assert.ok(W.tarjeta(a, "pisada", "Marcar")); assert.ok(W.tarjeta(a, "movil", "Marcar"));
  assert.equal(a.m.libro()[0].paso, 0, "vaso, pisada, movil + the wrong gafas: not exact");
  assert.deepEqual(a.m.marcados(), ["gafas", "vaso", "pisada", "movil"]);
  assert.ok(W.tarjeta(a, "gafas", "Desmarcar"));
  assert.deepEqual(a.m.marcados(), ["vaso", "pisada", "movil"]);
  assert.equal(a.m.libro()[0].paso, 1, "the step is done by removing the wrong one");
  assert.equal(W.eventos(a, "avance").length, 1);
  assert.deepEqual(a.m.libro()[0].cuenta, { marcas: 5, marcas_erroneas: 1, desmarcados: 2 });
  // the step is done: the options no longer appear, the plates stay with their numbers
  assert.equal(a.m.ofrece("misiones", "gafas"), false);
  W.ir(a, 45, 19); a.m.usar("gafas"); W.pump(3);
  assert.equal(a.m.dialogo(), null);
  assert.deepEqual([...a.plaquetas].map(([key, v]) => [key, v.n]).sort(), [["misiones:movil", 3], ["misiones:pisada", 2], ["misiones:vaso", 1]]);
  // a second tab of the same guest shows the same list and numbers (it is saved with the progress)
  const b = W.abrir(k);
  W.pump(6);
  assert.deepEqual(b.m.marcados(), ["vaso", "pisada", "movil"]);
  assert.deepEqual(b.m.libro()[0].cuenta, { marcas: 5, marcas_erroneas: 1, desmarcados: 2 });
});

test("over the plug: the markers are for their player alone, and a world without marcable things never sends the new event", () => {
  const W = plaza(), a = W.abrir(), b = W.abrir();
  W.pump(3);
  W.empezar(a);
  assert.ok(W.tarjeta(a, "correo", "Marcar"));
  assert.deepEqual(a.m.marcados(), ["correo"]);
  assert.deepEqual(b.m.marcados(), [], "the other player marked nothing");
  assert.equal(b.plaquetas.size, 0);
  assert.equal(W.eventos(b, "marcados").every((e) => !String((e as unknown as { data?: { ids?: string } }).data?.ids ?? "")), true);
  // a quest without a marca step carries no counters on the wire
  const sin = W.eventos(a, "mision").filter((e) => "marcas" in ((e as unknown as { data: object }).data ?? {}));
  assert.ok(sin.every((e) => (e as unknown as { data: { id: string } }).data.id === "escena"));
  // the world without marcable things
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura([{ formato: "mision@1", id: "m", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "usa", texto: "t", cosa: "c" }] }], [cosa("c", 0)] as Doc[]) }), log: () => {}, identitySign: sign, now: () => 0 });
  const t = inst.join(0), cli = crearCliente(), s = new ClientSession(t, { features: cli.parts, identity: keeper(), view: { label() {}, bounce() {}, place() {}, tag() {} } });
  for (let i = 0; i < 4; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(s.features.log.filter((e) => e.event === "marcados").length, 0, "no event of the new kind");
  assert.deepEqual(cli.misiones.marcados(), []);
});
