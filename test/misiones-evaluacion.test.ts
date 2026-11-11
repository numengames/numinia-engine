// P13: the end evaluation of a quest (mision@1 `evaluacion`): time of the whole quest and of each block, counters by name, a score.
// Formats good and bad, the pure arithmetic (weights, reference time, floor, a missing counter = 0), the times kept in the progress
// (per block, saved and read back), `desmarcados_correctos`, "a world without `evaluacion` changes nothing", and the whole thing over
// the real plug (server clock, the card on the page, a second tab, a restart).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerMision } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { bloques, calcular, duracion, filas, restaTiempo, resumen } from "../features/misiones/evaluacion.ts";
import { aceptar, cuentaDe, desmarcar, evaluacionDe, leerProgreso, marcados, marcar, nuevoProgreso, registrar } from "../features/misiones/maquina.ts";
import type { Progreso } from "../features/misiones/maquina.ts";
import { misiones as misionesDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";
import { fijarIdioma } from "../packages/client/src/idioma.ts";

const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const da = (mision: string) => ({ entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayuda?", opciones: [{ texto: "Acepto.", accion: { tipo: "dar_mision", mision } }, adios] } } });
const jefa = { formato: "pnj@1", id: "jefa", nombre: "Jefa", posicion: { x: 0, z: 0 }, dialogo: da("escena") };
const cosa = (id: string, x: number) => ({ formato: "cosa@1", id, nombre: id.toUpperCase(), descripcion: `Un indicio: ${id}.`, posicion: { x, z: 20 }, aviso: `inspeccionar ${id}`, marcable: true });
const IDS = ["pisada", "vaso", "movil", "correo", "guantes", "gafas"];
const RELEVANTES = ["pisada", "vaso", "movil"];
const COSAS = IDS.map((id, i) => cosa(id, 20 + 5 * i));
const EVAL = { titulo: "Evaluación de la inspección", base: 100, minimo: 0, resta: { fotos_erroneas: 5, marcas_erroneas: 10, desmarcados_correctos: 10 }, tiempo: { referencia_min: 1, resta_por_minuto: 1 }, muestra: ["tiempo", "fotos_erroneas", "marcas_erroneas", "desmarcados_correctos"] };
const ESCENA = {
  formato: "mision@1", id: "escena", titulo: "La escena", descripcion: "Marque los indicios.",
  pasos: [{ id: "indicios", tipo: "marca", texto: "Marque los indicios", cosas: RELEVANTES }, { id: "informe", tipo: "habla_con", texto: "Informe a la jefa", pnj: "jefa" }],
};
const CON = { ...ESCENA, evaluacion: EVAL };
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [CON]) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", [jefa]), cosas: ficheros("cosas", COSAS as Doc[]) });
const cargar = (misiones?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones)); assert.deepEqual(r.issues, []); return r.aventura; };
const quien = (r: { ok: boolean; issues?: { path: string; message: string }[] }) => (r.ok ? [] : (r.issues ?? []).map((i) => `${i.path}: ${i.message}`));
const con = (ev: unknown) => quien(leerMision({ ...ESCENA, evaluacion: ev }));
const T0 = Date.parse("2026-11-04T10:00:00Z");

test("formats: mision@1 `evaluacion` — the author's example loads with its defaults; each mistake says where and how to fix it", () => {
  const A = cargar(), ev = A.misiones.get("escena")!.evaluacion!;
  assert.deepEqual(ev, { ...EVAL, etiquetas: {} });
  // everything optional: only the score's base counts
  const m = leerMision({ ...ESCENA, evaluacion: {} });
  assert.ok(m.ok);
  if (m.ok) assert.deepEqual(m.value.evaluacion, { titulo: "Evaluación", base: 100, minimo: 0, resta: {}, muestra: [], etiquetas: {} });
  // own labels for a counter the engine does not know (and for one it does)
  const e2 = leerMision({ ...ESCENA, evaluacion: { resta: { pistas_pedidas: 2, marcas_erroneas: 3 }, etiquetas: { pistas_pedidas: "Pistas que pidió", marcas_erroneas: "Se equivocó" } } });
  assert.ok(e2.ok);
  if (e2.ok) assert.deepEqual([e2.value.evaluacion!.muestra, e2.value.evaluacion!.etiquetas], [["pistas_pedidas", "marcas_erroneas"], { pistas_pedidas: "Pistas que pidió", marcas_erroneas: "Se equivocó" }]);
  // absent = the quest is read exactly as before
  const sin = leerMision(ESCENA);
  assert.ok(sin.ok && !("evaluacion" in sin.value));
  // mistakes
  assert.ok(con("sí").some((s) => s.startsWith("evaluacion:") && /objeto/.test(s)));
  assert.ok(con({ nota: 1 }).some((s) => s.startsWith("evaluacion.nota:") && /campo desconocido/.test(s)));
  assert.ok(con({ base: 0 }).some((s) => s.startsWith("evaluacion.base:")));
  assert.ok(con({ base: 10.5 }).some((s) => s.startsWith("evaluacion.base:") && /entero/.test(s)));
  assert.ok(con({ base: 10, minimo: 20 }).some((s) => s.startsWith("evaluacion.minimo:") && /base/.test(s)));
  assert.ok(con({ resta: { fotos: 2.5 } }).some((s) => s.startsWith("evaluacion.resta.fotos:") && /entero/.test(s)));
  assert.ok(con({ resta: { fotos: 0 } }).some((s) => s.startsWith("evaluacion.resta.fotos:")), "a weight of 0 takes nothing: leave it out");
  assert.ok(con({ resta: { "Foto Mala": 1 } }).some((s) => s.startsWith("evaluacion.resta.Foto Mala:") && /minúsculas/.test(s)));
  assert.ok(con({ resta: { tiempo: 1 } }).some((s) => s.startsWith("evaluacion.resta.tiempo:") && /referencia_min/.test(s)));
  assert.ok(con({ tiempo: { referencia_min: 5 } }).some((s) => s.startsWith("evaluacion.tiempo.resta_por_minuto:")));
  assert.ok(con({ tiempo: { referencia_min: 5, resta_por_minuto: 1, extra: 1 } }).some((s) => s.startsWith("evaluacion.tiempo.extra:")));
  assert.ok(con({ muestra: ["tiempo", "tiempo"] }).some((s) => s.startsWith("evaluacion.muestra[1]:") && /una vez/.test(s)));
  assert.ok(con({ muestra: ["Tiempo"] }).some((s) => s.startsWith("evaluacion.muestra[0]:")));
  assert.ok(con({ resta: { fotos_erroneas: 5 }, muestra: ["tiempo"], etiquetas: {} }).some((s) => s.startsWith("evaluacion.muestra:") && /resta puntos/.test(s)), "what takes points must be seen");
  assert.ok(con({ muestra: ["pistas_pedidas"] }).some((s) => s.startsWith("evaluacion.etiquetas.pistas_pedidas:") && /no conoce/.test(s)), "an unknown counter needs its label");
  assert.ok(con({ muestra: ["tiempo"], etiquetas: { marcas: "x" } }).some((s) => s.startsWith("evaluacion.etiquetas.marcas:") && /no está en/.test(s)));
  assert.ok(con({ muestra: ["tiempo"], etiquetas: { tiempo: "x".repeat(41) } }).some((s) => s.startsWith("evaluacion.etiquetas.tiempo:")));
  // the counters of the `marca` steps need such a step
  const sinMarca = leerMision({ formato: "mision@1", id: "m", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "habla_con", texto: "t", pnj: "jefa" }], evaluacion: { muestra: ["marcas_erroneas"] } });
  assert.ok(quien(sinMarca).some((s) => s.startsWith("evaluacion.muestra[0]:") && /paso marca/.test(s)));
  // a bad evaluacion fails the quest, not just the field
  assert.equal(con({ base: 0 }).length > 0, true);
});

test("pure: points = base − Σ counter × weight − whole minutes over the reference; between minimo and base; a missing counter is 0", () => {
  const A = cargar(), m = A.misiones.get("escena")!, ev = m.evaluacion!;
  // the time: nothing up to the reference, then one weight per WHOLE minute over
  assert.deepEqual([0, 60_000, 119_999, 120_000, 185_000, 600_000].map((t) => restaTiempo(ev, t)), [0, 0, 0, 1, 2, 9]);
  const p = (cuenta: Record<string, number | undefined>, ms: number) => calcular(m, ev, cuenta, 0, [], ms).puntos;
  assert.equal(p({}, 30_000), 100, "no counters at all, in time");
  assert.equal(p({ marcas_erroneas: 2 }, 30_000), 80);
  assert.equal(p({ marcas_erroneas: 2, desmarcados_correctos: 1, fotos_erroneas: 3 }, 30_000), 55);
  assert.equal(p({ marcas_erroneas: 2 }, 5 * 60_000), 80 - 4, "4 whole minutes over");
  assert.equal(p({ marcas_erroneas: 99 }, 30_000), 0, "never below minimo");
  assert.equal(calcular(m, { ...ev, minimo: 20 }, { marcas_erroneas: 99 }, 0, [], 30_000).puntos, 20);
  assert.equal(p({ marcas_erroneas: undefined, otra_cosa: 7 }, 30_000), 100, "undefined and unknown counters count 0");
  assert.equal(p({ marcas_erroneas: -3 }, 30_000), 100, "a negative counter is read as 0");
  assert.equal(p({ marcas_erroneas: 1e9 }, 30_000), 0, "capped, still an integer");
  // without a clock (a quest taken before the world had an evaluacion): no time, no time penalty
  const sin = calcular(m, ev, { marcas_erroneas: 1 }, undefined, [], 99_999_999);
  assert.deepEqual([sin.ms, sin.puntos], [undefined, 90]);
  // a world with no `tiempo` takes nothing for it
  assert.equal(calcular(m, { ...ev, tiempo: undefined }, {}, 0, [], 9_999_999).puntos, 100);
});

test("pure: the rows of the card — the author's order, house labels or the author's own, phases after the time; one line for agents", () => {
  const A = cargar(), m = A.misiones.get("escena")!, ev = m.evaluacion!;
  assert.deepEqual(bloques(m), [{ desde: 0, hasta: 1 }, { desde: 1, hasta: 2 }]);
  const r = calcular(m, ev, { marcas_erroneas: 2, desmarcados_correctos: 1 }, 1000, [61_000, 125_000], 130_000);
  assert.deepEqual([r.ms, r.fases, r.cont, r.puntos], [124_000, [60_000, 64_000], { fotos_erroneas: 0, marcas_erroneas: 2, desmarcados_correctos: 1 }, 69]);
  const fs = filas(m, ev, r);
  assert.deepEqual(fs.map((f) => [f.tipo, f.etiqueta, f.texto, f.resta]), [
    ["tiempo", "Tiempo de la misión", "2 min 04 s", 1], ["fase", "Fase 1: Marque los indicios", "1 min 00 s", 0], ["fase", "Fase 2: Informe a la jefa", "1 min 04 s", 0],
    ["contador", "Fotos no relevantes", "0", 0], ["contador", "Marcas erróneas", "2", 20], ["contador", "Indicios correctos desmarcados", "1", 10],
  ]);
  assert.equal(resumen(fs), "Tiempo de la misión: 2 min 04 s; Fotos no relevantes: 0; Marcas erróneas: 2; Indicios correctos desmarcados: 1");
  // the author's wording and order win; an unknown counter shows by its label
  const propio = { ...ev, muestra: ["marcas_erroneas", "pistas_pedidas", "tiempo"], etiquetas: { marcas_erroneas: "Se equivocó", pistas_pedidas: "Pistas que pidió", tiempo: "Tardó" } };
  const r2 = calcular(m, propio, { marcas_erroneas: 1, pistas_pedidas: 4 }, 0, [10_000, 45_000], 45_000);
  assert.deepEqual(filas(m, propio, r2).filter((f) => f.tipo !== "fase").map((f) => [f.etiqueta, f.texto]), [["Se equivocó", "1"], ["Pistas que pidió", "4"], ["Tardó", "45 s"]]);
  // times as people read them
  assert.deepEqual([0, 45_000, 60_000, 845_000, 3_720_000].map(duracion), ["0 s", "45 s", "1 min 00 s", "14 min 05 s", "1 h 02 min"]);
  // no clock kept: the time row is left out, not invented
  assert.deepEqual(filas(m, ev, calcular(m, ev, {}, undefined, [], 5)).map((f) => f.clave), ["fotos_erroneas", "marcas_erroneas", "desmarcados_correctos"]);
});

// ---------- the machine: times in the progress, the counter, saving ----------
const hecho = (A: Aventura, p: Progreso, ahora: number) => registrar(p, A, { tipo: "marca", marcados: marcados(p, A), ahora });

test("machine: `desmarcados_correctos` — unmarking a thing the step DOES ask for; a wrong one counts only as a wrong mark and an unmark", () => {
  const A = cargar(), p = nuevoProgreso();
  assert.ok(aceptar(p, A.misiones.get("escena")!, A, T0).ok);
  marcar(p, A, "correo"); marcar(p, A, "pisada"); marcar(p, A, "vaso");
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 3, marcas_erroneas: 1, desmarcados: 0 }, "no key until it happens: the saved counters do not change");
  desmarcar(p, A, "correo");
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 3, marcas_erroneas: 1, desmarcados: 1 }, "unmarking a wrong one adds nothing more");
  desmarcar(p, A, "pisada");
  assert.deepEqual(cuentaDe(p, "escena"), { marcas: 3, marcas_erroneas: 1, desmarcados: 2, desmarcados_correctos: 1 });
  marcar(p, A, "pisada"); desmarcar(p, A, "pisada");
  assert.equal(cuentaDe(p, "escena").desmarcados_correctos, 2, "each time");
  assert.equal(desmarcar(p, A, "movil").ok, false);
  assert.equal(cuentaDe(p, "escena").desmarcados_correctos, 2, "a refused unmark counts for nothing");
  // saved and read back
  assert.deepEqual(leerProgreso(JSON.parse(JSON.stringify(p))).cuenta, p.cuenta);
  // the other counters by name survive a reload too (another piece may add its own), garbage does not
  const v = leerProgreso({ ...JSON.parse(JSON.stringify(p)), cuenta: { escena: { marcas: 1, marcas_erroneas: 0, desmarcados: 0, fotos_erroneas: 3, "Mal Nombre": 2, raro: "x", negativo: -1 } } });
  assert.deepEqual(v.cuenta, { escena: { marcas: 1, marcas_erroneas: 0, desmarcados: 0, fotos_erroneas: 3 } });
});

test("machine: the clock — accepted, each block done, finished; the result is kept; it round-trips through the store; a new attempt forgets it", () => {
  const A = cargar([{ ...CON, repetible: true }]), m = A.misiones.get("escena")!, p = nuevoProgreso();
  assert.ok(aceptar(p, m, A, T0).ok);
  assert.equal(p.activas.escena.t0, T0);
  marcar(p, A, "correo"); marcar(p, A, "pisada"); marcar(p, A, "vaso"); marcar(p, A, "movil");
  desmarcar(p, A, "correo");
  assert.equal(registrar(p, A, { tipo: "marca", marcados: marcados(p, A), ahora: T0 + 60_000 }).length, 1);
  assert.deepEqual(p.activas.escena.tb, [T0 + 60_000], "the first block closed at its own moment");
  // mid-quest: the progress goes to the store and comes back with the clock
  const vuelta = leerProgreso(JSON.parse(JSON.stringify(p)));
  assert.deepEqual([vuelta.activas.escena.t0, vuelta.activas.escena.tb], [T0, [T0 + 60_000]]);
  assert.equal(evaluacionDe(p, "escena"), undefined, "not completed: no card yet");
  const h = registrar(vuelta, A, { tipo: "habla", pnj: "jefa", ahora: T0 + 125_000 });
  assert.equal(h[0].completada, true);
  assert.deepEqual(evaluacionDe(vuelta, "escena"), { ms: 125_000, fases: [60_000, 65_000], cont: { fotos_erroneas: 0, marcas_erroneas: 1, desmarcados_correctos: 0 }, puntos: 100 - 10 - 1 });
  assert.equal(vuelta.activas.escena, undefined, "the clock goes with the active quest");
  // and saved and read back again once done
  assert.deepEqual(leerProgreso(JSON.parse(JSON.stringify(vuelta))).evaluaciones, vuelta.evaluaciones);
  // garbage in the store is dropped, never thrown
  const sucio = leerProgreso({ ...JSON.parse(JSON.stringify(vuelta)), evaluaciones: { escena: { puntos: 1.5, cont: {} }, "mal id": { puntos: 1, cont: {} }, otra: { puntos: 5, ms: "x", fases: [1, "x", -1, 2.5, 3], cont: { a: 1, "B": 2, c: -4 } } } });
  assert.deepEqual(sucio.evaluaciones, { otra: { fases: [1, 3], cont: { a: 1 }, puntos: 5 } });
  // a repeatable quest done again: accepting forgets the old card and starts a new clock
  assert.ok(aceptar(vuelta, m, A, T0 + 900_000).ok);
  assert.equal(vuelta.evaluaciones, undefined);
  const otra = vuelta.activas["escena"] as { t0?: number; tb?: number[] };
  assert.deepEqual([otra.t0, otra.tb], [T0 + 900_000, undefined]);
});

test("machine: a grupo is one block (one phase) and its pause is not part of the time; a quest without a clock gets no time", () => {
  const grupo = { formato: "mision@1", id: "trio", titulo: "Trío", descripcion: "D", evaluacion: { muestra: ["tiempo"] },
    pasos: [{ id: "a", tipo: "usa", texto: "Use a", cosa: "pisada", grupo: "Piezas" }, { id: "b", tipo: "usa", texto: "Use b", cosa: "vaso", grupo: "Piezas" }, { id: "c", tipo: "habla_con", texto: "Hable", pnj: "jefa" }] };
  const A = cargar([grupo, ESCENA]), m = A.misiones.get("trio")!, p = nuevoProgreso();
  assert.deepEqual(bloques(m), [{ desde: 0, hasta: 2 }, { desde: 2, hasta: 3 }]);
  assert.ok(aceptar(p, m, A, T0).ok);
  registrar(p, A, { tipo: "usa", cosa: "pisada", ahora: T0 + 10_000 });
  assert.equal(p.activas.trio.tb, undefined, "half a block is not a block");
  registrar(p, A, { tipo: "usa", cosa: "vaso", ahora: T0 + 20_000 }); // the grupo is done: it stays on screen 2 s
  assert.deepEqual(p.activas.trio.tb, [T0 + 20_000]);
  registrar(p, A, { tipo: "habla", pnj: "jefa", ahora: T0 + 90_000 });
  const r = evaluacionDe(p, "trio")!;
  assert.deepEqual([r.ms, r.fases], [90_000, [20_000, 70_000]]);
  // accepted with no clock (an old server call): nothing to measure, and no time on the card
  const q = nuevoProgreso();
  assert.ok(aceptar(q, m, A).ok);
  assert.equal(q.activas.trio.t0, undefined);
  registrar(q, A, { tipo: "usa", cosa: "pisada" }); registrar(q, A, { tipo: "usa", cosa: "vaso" }); registrar(q, A, { tipo: "habla", pnj: "jefa" });
  assert.equal(evaluacionDe(q, "trio")!.ms, undefined);
});

test("without `evaluacion` nothing changes byte for byte: no key in the progress, no event, the plug's old events keep their shape", () => {
  const A = cargar([ESCENA]), p = nuevoProgreso();
  assert.ok(aceptar(p, A.misiones.get("escena")!, A, T0).ok);
  marcar(p, A, "pisada"); marcar(p, A, "vaso"); marcar(p, A, "movil");
  hecho(A, p, T0 + 1000); registrar(p, A, { tipo: "habla", pnj: "jefa", ahora: T0 + 2000 });
  const json = JSON.stringify(p);
  assert.ok(p.hechas.includes("escena"));
  assert.doesNotMatch(json, /t0|tb|evaluaciones|desmarcados_correctos/, json);
  assert.equal(JSON.stringify(leerProgreso(JSON.parse(json))), json, "reading and saving it again gives the same text");
  assert.equal(evaluacionDe(p, "escena"), undefined);
  assert.equal(misionesDecl.version, 12);
  assert.deepEqual(misionesDecl.issues, []);
  for (const ev of ["evaluacion", "evaluacionFila"]) assert.equal(misionesDecl.events![ev].announce, "silent", ev);
  assert.notEqual(misionesDecl.events!.abrirEvaluacion.announce, "silent", "the card is announced to agents and screen readers");
});

// ---------- over the real plug: server clock + pages ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
function plaza(o: { storage?: FileStorage; reloj?: { ms: number }; misiones?: Doc[] } = {}) {
  const T = o.reloj ?? { ms: T0 };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura(o.misiones), reloj: () => T.ms }), log: () => {}, identitySign: sign, storage: o.storage, now: () => T0 });
  type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"]; k: Keeper };
  const paginas: Pagina[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag() {}, marcador() {} } });
    const p = { s, t, m: cli.misiones, k };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.feature === "misiones" && e.event === nombre);
  const tarjeta = (p: Pagina, id: string, texto: string) => {
    const i = IDS.indexOf(id);
    ir(p, 20 + 5 * i, 19); p.m.usar(id); pump(3);
    const d = p.m.dialogo(), n = d ? d.opciones.indexOf(texto) + 1 : 0;
    if (!d || !n) return false;
    p.m.elegir(n); pump(3); p.m.adios(); pump(2);
    return true;
  };
  const empezar = (p: Pagina) => { ir(p, 1, 0); p.m.hablar("jefa"); pump(2); p.m.elegir(1); pump(3); p.m.adios(); pump(2); };
  /** Play the whole quest: a wrong mark, then the three right ones, one right one taken back; 1 min to mark, 65 s more to report. */
  const jugar = (p: Pagina, reloj: { ms: number }) => {
    empezar(p);
    assert.ok(tarjeta(p, "correo", "Marcar"));
    assert.ok(tarjeta(p, "pisada", "Marcar")); assert.ok(tarjeta(p, "pisada", "Desmarcar")); assert.ok(tarjeta(p, "pisada", "Marcar"));
    assert.ok(tarjeta(p, "vaso", "Marcar"));
    reloj.ms += 60_000;
    assert.ok(tarjeta(p, "correo", "Desmarcar"));
    assert.ok(tarjeta(p, "movil", "Marcar"));
    reloj.ms += 65_000;
    ir(p, 1, 0); p.m.hablar("jefa"); pump(3);
  };
  return { inst, abrir, pump, ir, eventos, jugar, empezar };
}

test("over the plug: completing the quest sends the card (with the book), tells the page to open it, and a second tab and a restart keep it", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "evaluacion-"));
  const s1 = new FileStorage(dir), reloj = { ms: T0 };
  const W = plaza({ storage: s1, reloj });
  const a = W.abrir(); W.pump(3);
  W.empezar(a);
  assert.equal(a.m.evaluacion("escena"), null, "not done: no card");
  assert.equal(W.eventos(a, "evaluacion").length, 0);
  W.jugar(a, reloj);
  assert.equal(a.m.libro()[0].estado, "hecha");
  const ev = a.m.evaluacion("escena")!;
  assert.ok(ev, "the card is on the page");
  assert.equal(ev.titulo, "Evaluación de la inspección");
  // 125 s+ of the server's clock (the walking between marks takes ticks, not clock): the quest was taken at T0 and done 125 s later
  assert.deepEqual([ev.puntos, ev.base, ev.minimo], [100 - 10 - 10 - 1, 100, 0]);
  assert.deepEqual(ev.filas.map((f) => [f.tipo, f.clave, f.texto, f.resta]), [
    ["tiempo", "tiempo", "2 min 05 s", 1], ["fase", "fase-1", "1 min 00 s", 0], ["fase", "fase-2", "1 min 05 s", 0],
    ["contador", "fotos_erroneas", "0", 0], ["contador", "marcas_erroneas", "1", 10], ["contador", "desmarcados_correctos", "1", 10],
  ]);
  assert.equal(ev.resumen, "Tiempo de la misión: 2 min 05 s; Fotos no relevantes: 0; Marcas erróneas: 1; Indicios correctos desmarcados: 1");
  assert.deepEqual(a.m.libro()[0].evaluacion, ev, "the same data inside libro()[i]");
  // the page is told to open it once, after the book; agents hear it as an announcement
  const abre = W.eventos(a, "abrirEvaluacion");
  assert.equal(abre.length, 1);
  assert.match(a.s.features.announcements.map((x) => x.text).join("\n"), /Evaluación de la inspección: 79 puntos\. Tiempo de la misión: 2 min 05 s/);
  const orden = a.s.features.log.map((e) => e.event);
  assert.ok(orden.lastIndexOf("evaluacionFila") < orden.indexOf("abrirEvaluacion"), "after the book, so the card is whole when it opens");
  // a second tab of the same guest gets the card with its book, but is not told to open it (it did not complete anything)
  const b = W.abrir(a.k); W.pump(6);
  assert.deepEqual(b.m.evaluacion("escena"), ev);
  assert.equal(W.eventos(b, "abrirEvaluacion").length, 0);
  // an unrelated change of the book (leaving and coming back) does not reopen it, and the card is whole again
  W.inst.disconnect(a.s.entity); W.pump(2);
  const c = W.abrir(a.k); W.pump(6);
  assert.deepEqual(c.m.evaluacion("escena"), ev);
  assert.equal(W.eventos(c, "abrirEvaluacion").length, 0);
  // a restart, much later: the card is part of the saved progress
  await s1.flush();
  reloj.ms += 3_600_000;
  const W2 = plaza({ storage: new FileStorage(dir), reloj });
  const d = W2.abrir(a.k); W2.pump(6);
  assert.deepEqual(d.m.evaluacion("escena"), ev, "the time is the one measured, not the one since");
});

test("over the plug: a restart in the middle of the quest keeps the clock — the time counts the stop", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "evaluacion-"));
  const s1 = new FileStorage(dir), reloj = { ms: T0 };
  const W = plaza({ storage: s1, reloj });
  const a = W.abrir(); W.pump(3);
  W.empezar(a);
  reloj.ms += 30_000;
  assert.ok(W.eventos(a, "aceptada").length === 1);
  await s1.flush();
  reloj.ms += 30_000; // the server was down for 30 s
  const W2 = plaza({ storage: new FileStorage(dir), reloj });
  const b = W2.abrir(a.k); W2.pump(6);
  for (const id of RELEVANTES) { W2.ir(b, 20 + 5 * IDS.indexOf(id), 19); b.m.usar(id); W2.pump(3); b.m.elegir(b.m.dialogo()!.opciones.indexOf("Marcar") + 1); W2.pump(3); b.m.adios(); W2.pump(2); }
  reloj.ms += 30_000;
  W2.ir(b, 1, 0); b.m.hablar("jefa"); W2.pump(3);
  const ev = b.m.evaluacion("escena")!;
  assert.equal(ev.filas[0].texto, "1 min 30 s", "30 s + 30 s with the server down + 30 s");
  assert.deepEqual(ev.filas.filter((f) => f.tipo === "contador").map((f) => f.texto), ["0", "0", "0"]);
  assert.equal(ev.puntos, 100, "90 s is under 2 whole minutes");
});

test("over the plug: a world whose quest has no `evaluacion` sends none of the new events", () => {
  const W = plaza({ misiones: [ESCENA] }), reloj = { ms: T0 };
  const a = W.abrir(); W.pump(3);
  W.jugar(a, reloj);
  assert.equal(a.m.libro()[0].estado, "hecha");
  assert.equal(a.m.evaluacion("escena"), null);
  assert.equal("evaluacion" in a.m.libro()[0], false);
  for (const n of ["evaluacion", "evaluacionFila", "abrirEvaluacion"]) assert.equal(W.eventos(a, n).length, 0, n);
});

// ---- `fases`: the card groups the blocks into the author's named phases ----
const CUATRO = {
  formato: "mision@1", id: "cuatro", titulo: "Cuatro", descripcion: "D",
  pasos: [
    { id: "a", tipo: "usa", texto: "Use a", cosa: "pisada", grupo: "Piezas" }, { id: "b", tipo: "usa", texto: "Use b", cosa: "vaso", grupo: "Piezas" },
    { id: "c", tipo: "usa", texto: "Use c", cosa: "movil" }, { id: "d", tipo: "usa", texto: "Use d", cosa: "correo" }, { id: "e", tipo: "habla_con", texto: "Hable", pnj: "jefa" },
  ],
};
const FASES = [{ nombre: "Fase 1 · Datos preliminares", hasta: "b" }, { nombre: "Fase 2 · La escena", hasta: "d" }, { nombre: "Fase 3 · El informe", hasta: "e" }];
const conFases = (fases: unknown) => quien(leerMision({ ...CUATRO, evaluacion: { muestra: ["tiempo"], tiempo: { referencia_min: 5, resta_por_minuto: 1 }, fases } }));

test("formats: `evaluacion.fases` — named phases closed by a step; each mistake says the path and how to fix it", () => {
  const ok = leerMision({ ...CUATRO, evaluacion: { muestra: ["tiempo"], fases: FASES } });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value.evaluacion!.fases, FASES);
  const sin = leerMision({ ...CUATRO, evaluacion: { muestra: ["tiempo"] } });
  assert.ok(sin.ok && !("fases" in sin.value.evaluacion!), "no `fases`: the key does not even exist");
  assert.deepEqual(conFases(FASES), []);
  assert.deepEqual(conFases([{ nombre: "Todo", hasta: "a" }]), [], "a step of a grupo closes with its block, and that is fine for one phase");
  const m1 = conFases([{ nombre: "X", hasta: "zeta" }]);
  assert.ok(m1.some((s) => s.startsWith("evaluacion.fases[0].hasta:") && /«zeta» no es un paso de esta misión/.test(s) && /a, b, c, d, e/.test(s)), m1.join("|"));
  assert.ok(conFases([{ nombre: "X" }]).some((s) => s.startsWith("evaluacion.fases[0].hasta:") && /el id del paso/.test(s)));
  assert.ok(conFases([{ hasta: "a" }]).some((s) => s.startsWith("evaluacion.fases[0].nombre:")));
  assert.ok(conFases([{ nombre: "X", hasta: "a", otro: 1 }]).some((s) => s.startsWith("evaluacion.fases[0].otro:") && /campo desconocido/.test(s)));
  const igual = conFases([{ nombre: "A", hasta: "a" }, { nombre: "B", hasta: "b" }]);
  assert.ok(igual.some((s) => s.startsWith("evaluacion.fases[1].hasta:") && /mismo bloque/.test(s) && /posterior/.test(s)), igual.join("|"));
  const orden = conFases([{ nombre: "A", hasta: "d" }, { nombre: "B", hasta: "c" }]);
  assert.ok(orden.some((s) => s.startsWith("evaluacion.fases[1].hasta:") && /va antes que «d»/.test(s) && /ordene/.test(s)), orden.join("|"));
  assert.ok(conFases([]).some((s) => s.startsWith("evaluacion.fases:") && /de 1 a 8/.test(s)));
  assert.ok(conFases(Array.from({ length: 9 }, (_, i) => ({ nombre: `F${i}`, hasta: "e" }))).some((s) => s.startsWith("evaluacion.fases:") && /de 1 a 8/.test(s)));
  assert.ok(conFases("sí").some((s) => s.startsWith("evaluacion.fases:")));
  assert.ok(conFases([{ nombre: "x".repeat(61), hasta: "a" }]).some((s) => s.startsWith("evaluacion.fases[0].nombre:")));
});

test("machine: with `fases` the card shows the quest's time and the time of each named phase; without them, one row per block as before", () => {
  const con3 = { ...CUATRO, evaluacion: { muestra: ["tiempo"], fases: FASES } }, sin = { ...CUATRO, id: "sin", evaluacion: { muestra: ["tiempo"] } };
  const A = cargar([con3, sin, ESCENA]);
  const jugar = (id: string) => {
    const p = nuevoProgreso(), m = A.misiones.get(id)!;
    assert.ok(aceptar(p, m, A, T0).ok);
    registrar(p, A, { tipo: "usa", cosa: "pisada", ahora: T0 + 10_000 }); registrar(p, A, { tipo: "usa", cosa: "vaso", ahora: T0 + 20_000 });
    registrar(p, A, { tipo: "usa", cosa: "movil", ahora: T0 + 50_000 }); registrar(p, A, { tipo: "usa", cosa: "correo", ahora: T0 + 80_000 });
    registrar(p, A, { tipo: "habla", pnj: "jefa", ahora: T0 + 130_000 });
    return { m, r: evaluacionDe(p, id)!, p };
  };
  const a = jugar("cuatro");
  assert.deepEqual([a.r.ms, a.r.fases], [130_000, [20_000, 60_000, 50_000]]);
  assert.deepEqual(filas(a.m, a.m.evaluacion!, a.r).map((f) => [f.tipo, f.clave, f.etiqueta, f.texto]), [
    ["tiempo", "tiempo", "Tiempo de la misión", "2 min 10 s"], ["fase", "fase-1", "Fase 1 · Datos preliminares", "20 s"], ["fase", "fase-2", "Fase 2 · La escena", "1 min 00 s"], ["fase", "fase-3", "Fase 3 · El informe", "50 s"],
  ]);
  assert.equal(resumen(filas(a.m, a.m.evaluacion!, a.r)), "Tiempo de la misión: 2 min 10 s", "the one-line summary leaves the phases out, as before");
  // two phases that stop before the last step: the time after them belongs to no phase, the whole time stays whole
  const corta2 = { ...a.m, evaluacion: { ...a.m.evaluacion!, fases: FASES.slice(0, 2) } };
  const r2 = calcular(corta2, corta2.evaluacion, {}, T0, a.p.activas.cuatro?.tb ?? [T0 + 20_000, T0 + 50_000, T0 + 80_000, T0 + 130_000], T0 + 130_000);
  assert.deepEqual([r2.ms, r2.fases], [130_000, [20_000, 60_000]]);
  // without `fases`: one row per block, exactly as before
  const b = jugar("sin");
  assert.deepEqual(b.r.fases, [20_000, 30_000, 30_000, 50_000]);
  assert.deepEqual(filas(b.m, b.m.evaluacion!, b.r).filter((f) => f.tipo === "fase").map((f) => f.etiqueta), ["Fase 1: Piezas", "Fase 2: Use c", "Fase 3: Use d", "Fase 4: Hable"]);
  // a card saved with another number of phases (the author edited the quest since) shows the time only, never a wrong row
  const vieja = { ...a.r, fases: [1000, 2000] };
  assert.deepEqual(filas(a.m, a.m.evaluacion!, vieja).map((f) => f.tipo), ["tiempo"]);
  // it round-trips through the store
  assert.deepEqual(evaluacionDe(leerProgreso(JSON.parse(JSON.stringify(a.p))), "cuatro")!.fases, [20_000, 60_000, 50_000]);
});

test("page: the foot of the end card names the «J» key only where there is a keyboard — on a touch screen it names none (P13 b)", async () => {
  const { pieDeTarjeta } = await import("../apps/plaza/evaluacion-tarjeta.ts");
  assert.match(pieDeTarjeta(false), /quest book \(J\)\.$/);
  assert.equal(pieDeTarjeta(true), "You can see it again from the quest book.");
  fijarIdioma("es");
  assert.match(pieDeTarjeta(false), /libro de misiones \(J\)\.$/);
  assert.equal(pieDeTarjeta(true), "Puede volver a verla desde el libro de misiones.");
  fijarIdioma("en");
  assert.doesNotMatch(pieDeTarjeta(true), /\(J\)|\bJ\b/);
});
