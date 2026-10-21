// T1: the mission step `hace` (the builder DOES something) and `senala` (the page button the arrow will point at).
// Formats (valid, unknown action, `modelo` only with coloca, `disparador` only with the cable actions, `senala` shape),
// then over the real plug (objetos + disparadores + misiones, pages pumped by ticks): the step advances when the author
// really placed / moved / turned / scaled / hid / deleted an object or created / edited / deleted / fired a cable; a `hace`
// that is not the current step does not count; the three page actions come as the intent `hace` and nothing else does;
// no permission to build = nothing counts; and a world with these missions hashes like one without them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import chatServer from "../features/chat/server.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente as clienteObjetos } from "../features/objetos/client.ts";
import { crearDisparadores, leerDisparadores } from "../features/disparadores/server.ts";
import { crearCliente as clienteDisparadores } from "../features/disparadores/client.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };
import { ACCIONES_HACE, ACCIONES_PAGINA, cargarAventura, leerMision, TIPOS_PASO } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { misiones as misionesDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";
import { objetos as objetosDecl } from "../features/objetos/feature.ts";
import { disparadores as disparadoresDecl } from "../features/disparadores/feature.ts";

const sha = (id: string) => biblioteca.modelos.find((m) => m.id === id)!.modelo;
const BLOQUE = sha("bloque"), FAROLILLO = sha("farolillo");

// ---------- formats ----------
const mision = (pasos: unknown[]) => ({ formato: "mision@1", id: "t1", titulo: "Taller", descripcion: "Un recado de prueba.", pasos });
const valida = (paso: unknown) => leerMision(mision([paso]));
const quePaso = (paso: unknown) => { const r = valida(paso); assert.ok(!r.ok, JSON.stringify(paso)); return r.ok ? [] : r.issues; };

test("T1 formats: a `hace` step reads (every action), `modelo` only with coloca (a library id), `disparador` only with cable actions, `senala` for any step; mistakes say where and how to fix", () => {
  assert.equal(TIPOS_PASO.at(-1), "hace", "the new kind goes at the end (the wire's enum)");
  assert.deepEqual(misionesDecl.issues, []); assert.deepEqual(objetosDecl.issues, []); assert.deepEqual(disparadoresDecl.issues, []);
  for (const accion of ACCIONES_HACE) {
    const r = valida({ id: "p", tipo: "hace", texto: "Haz algo", accion });
    assert.ok(r.ok, `${accion}: ${JSON.stringify(r)}`);
    assert.equal(r.value.pasos[0].tipo, "hace");
  }
  const completo = valida({ id: "p", tipo: "hace", texto: "Pon un farolillo", accion: "coloca", modelo: "farolillo", senala: "dock-anadir", grupo: "g", espera: 3 });
  assert.ok(completo.ok, JSON.stringify(completo));
  assert.deepEqual(completo.value.pasos[0], { id: "p", tipo: "hace", texto: "Pon un farolillo", accion: "coloca", modelo: "farolillo", senala: "dock-anadir", grupo: "g", espera: 3 });
  const cable = valida({ id: "p", tipo: "hace", texto: "Pulsa el rojo", accion: "dispara_cable", disparador: "rojo" });
  assert.ok(cable.ok && cable.value.pasos[0].tipo === "hace" && cable.value.pasos[0].disparador === "rojo");
  const llega = valida({ id: "p", tipo: "habla_con", texto: "Habla", pnj: "bruno", senala: "construir" });
  assert.ok(llega.ok && llega.value.pasos[0].senala === "construir", "`senala` is valid on any step type");

  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "vuela" }).some((i) => i.path === "pasos[0].accion" && /una de: coloca, mueve/.test(i.message)), "an unknown action is refused saying the list");
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x" }).some((i) => i.path === "pasos[0].accion"), "no action");
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "mueve", modelo: "farolillo" }).some((i) => i.path === "pasos[0].modelo" && /solo va con la acción "coloca"/.test(i.message)));
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "coloca", modelo: "no-existe" }).some((i) => i.path === "pasos[0].modelo" && /biblioteca/.test(i.message)));
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "coloca", modelo: FAROLILLO }).some((i) => i.path === "pasos[0].modelo"), "a sha256 is not a library id");
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "coloca", disparador: "rojo" }).some((i) => i.path === "pasos[0].disparador" && /cable/.test(i.message)));
  for (const mal of ["Dock Cable", "", "a".repeat(33), 7, "con_guion"]) assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "abre_cable", senala: mal }).some((i) => i.path === "pasos[0].senala"), `senala ${JSON.stringify(mal)}`);
  assert.ok(quePaso({ id: "p", tipo: "hace", texto: "x", accion: "abre_cable", cosa: "caja" }).some((i) => i.path === "pasos[0].cosa" && /campo desconocido/.test(i.message)), "a hace has no cosa");

  // the loader keeps it (no pnj, no thing needed), and its wire fields exist
  const r = cargarAventura({ misiones: [{ fichero: "t1.json", texto: JSON.stringify(mision([{ id: "p", tipo: "hace", texto: "Abre Construir", accion: "abre_construir", senala: "construir" }])) }], pnj: [], cosas: [] });
  assert.deepEqual(r.issues, []);
  assert.ok(r.aventura.misiones.has("t1"));
  assert.ok(misionesDecl.version >= 7);
  assert.deepEqual(misionesDecl.events!.paso.fields.senala, { kind: "text", maxBytes: 32, default: "" });
  assert.ok(misionesDecl.intents!.hace, "the intent for the page's three actions");
});

// ---------- over the real plug ----------
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const fichero = (dir: string, x: { id: string }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const GUIA = {
  formato: "pnj@1", id: "guia", nombre: "Guía", posicion: { x: 0, z: 0 },
  dialogo: { entradas: [{ si: { mision: "t1", estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: {
    pide: { texto: "¿Construimos?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "t1" } }] },
    hola: { texto: "Hola.", opciones: [{ texto: "Adiós.", accion: { tipo: "despedir" } }] } } },
};
const ROJO = { id: "rojo", nombre: "Botón rojo", tipo: "boton", x: 0, z: 0, frase: "E: pulsar", receptores: [{ accion: "suena", sonido: "campana" }] };
const AZUL = { id: "azul", nombre: "Botón azul", tipo: "boton", x: 1, z: 1, frase: "E: pulsar", receptores: [{ accion: "suena", sonido: "campana" }] };

function mundo(pasos: unknown[], opts: { puede?: () => boolean; sinMisiones?: boolean } = {}) {
  const log: string[] = [];
  const leido = leerDisparadores({ disparadores: [ROJO, AZUL] });
  const aventura = opts.sinMisiones ? { misiones: [], pnj: [], cosas: [] } : { misiones: [fichero("misiones", mision(pasos))], pnj: [fichero("pnj", GUIA)], cosas: [] };
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign,
    features: [chatServer, crearObjetos(), crearDisparadores({ disparadores: leido.disparadores }), ...crearMisiones({ aventura })],
    puede: (_w, accion) => accion === "construir" && (opts.puede ? opts.puede() : true),
  });
  const t = inst.join(0), m = crearCliente(), d = clienteDisparadores(), o = clienteObjetos();
  const eventos: Record<string, number> = {}, avisos: string[] = [];
  const s = new ClientSession(t, { identity: keeper(), features: [...m.parts, ...d.parts, o.part], view: { label() {}, bounce() {}, tag() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
  s.features.tap((f, ev, msg) => { eventos[`${f}.${ev}`] = (eventos[`${f}.${ev}`] ?? 0) + 1; if (f === "misiones" && ev === "rechazado") avisos.push(String(msg.motivo)); });
  const pump = (n = 3) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  const place = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); };
  const send = (f: string, intent: string, msg: Record<string, unknown>) => { s.features.send(f, intent, msg); pump(); };
  const avances = () => eventos["misiones.avance"] ?? 0;
  /** the step the book says is next (its index), or -1 when the quest is done */
  const paso = () => { const q = m.misiones.libro().find((x) => x.id === "t1"); return !q ? -2 : q.estado === "hecha" ? -1 : q.paso; };
  const aceptar = () => { place(0, 0); pump(); send("pnj", "hablar", { pnj: "guia" }); send("pnj", "elegir", { pnj: "guia", opcion: 1 }); send("pnj", "adios", { pnj: "guia" }); pump(); assert.equal(paso(), 0, "the quest is in the book at its first step"); };
  const colocar = (modelo = BLOQUE, x = 2) => { send("objetos", "colocar", { modelo, x, y: 0, z: 2, ry: 0, nombre: "", decorado: true, tipo: "modelo", ext: "glb" }); return [...s.features.stateOf("objetos").keys()].at(-1)!; };
  const mover = (id: string, v: Partial<Record<"x" | "y" | "z" | "rx" | "ry" | "rz" | "sx" | "sy" | "sz", number>>) => { const o0 = s.features.stateOf("objetos").get(id)!; send("objetos", "mover", { id, lote: "", x: o0.x, y: o0.y, z: o0.z, rx: o0.rx, ry: o0.ry, rz: o0.rz, sx: o0.sx, sy: o0.sy, sz: o0.sz, ...v }); };
  return { inst, s, m, pump, place, send, avances, paso, aceptar, colocar, mover, eventos, avisos, log };
}
const H = (id: string, accion: string, extra: Record<string, unknown> = {}) => ({ id, tipo: "hace", texto: `Haz: ${accion}`, accion, ...extra });

test("T1 machine: coloca (with `modelo` only that model counts), mueve, crea_cable and an intent action advance in order, exactly like any other step", () => {
  const w = mundo([H("a", "coloca", { modelo: "farolillo" }), H("b", "mueve"), H("c", "crea_cable"), H("d", "abre_construir", { senala: "construir" })]);
  w.pump(3); w.aceptar();
  const otro = w.colocar(BLOQUE);
  assert.equal(w.avances(), 0, "another model does not count when `modelo` is named");
  assert.equal(w.paso(), 0);
  const id = w.colocar(FAROLILLO);
  assert.equal(w.avances(), 1, "the named model does");
  assert.equal(w.paso(), 1);
  w.colocar(BLOQUE);
  assert.equal(w.avances(), 1, "a `coloca` is no longer the current step: it does not count");
  w.mover(otro, { x: 9 }); // moves a block: mueve is the step now, and any object counts
  assert.equal(w.avances(), 2, "mueve advances when the author moved an object");
  assert.equal(w.paso(), 2);
  w.mover(id, { x: 7 });
  assert.equal(w.avances(), 2, "a `mueve` that is not the current step does not count");
  w.send("disparadores", "crearDisparador", { disparador: "luz-1", nombre: "Luz", tipo: "zona", x: 5, y: 0, z: 5, radio: 3, receptores: JSON.stringify([{ accion: "suena", sonido: "campana" }]) });
  assert.equal(w.avances(), 3, "crea_cable advances");
  assert.equal(w.paso(), 3);
  assert.equal(w.m.misiones.senala(), "construir", "`senala` travels with the step to the page");
  assert.equal(w.m.misiones.libro()[0].lista[3].accion, "abre_construir");
  assert.deepEqual(w.m.misiones.objetivos(), [], "a `hace` step has no place: no beacon, no map pin");
  // the page's own action, through the client controller (the page asks only while a step wants it)
  assert.deepEqual(w.m.misiones.hace("abre_cable"), { ok: false, why: "ningún paso de tus misiones pide eso ahora" }, "no noise: the page sends nothing for another action");
  assert.equal(w.m.misiones.hace("coloca").ok, false, "the page cannot send what the server sees itself");
  assert.ok(w.m.misiones.hace("abre_construir").ok); w.pump();
  assert.equal(w.avances(), 4);
  assert.equal(w.paso(), -1, "the quest is done");
  assert.equal(w.eventos["misiones.completada"], 1);
  assert.equal(w.m.misiones.senala(), "");
});

test("T1 machine: gira (girar and a mover that turns), escala (a mover that scales), oculta (only when it ends hidden), borra; and edita_cable / borra_cable", () => {
  const w = mundo([H("g", "gira"), H("e", "escala"), H("o", "oculta"), H("b", "borra"), H("ec", "edita_cable", { disparador: "rojo" }), H("bc", "borra_cable")]);
  w.pump(3);
  const id = w.colocar(BLOQUE); // before the quest: it only prepares the world
  w.aceptar();
  w.mover(id, { x: 6 });
  assert.equal(w.avances(), 0, "moving is not turning");
  w.mover(id, { sx: 2, sy: 2, sz: 2 });
  assert.equal(w.avances(), 0, "scaling is not turning");
  w.send("objetos", "girar", { id, grados: 45 });
  assert.equal(w.avances(), 1, "girar turns");
  w.mover(id, { ry: 90 });
  assert.equal(w.avances(), 1, "turning is not the current step any more");
  w.mover(id, { sx: 3, sy: 3, sz: 3 });
  assert.equal(w.avances(), 2, "a mover that changes the scale is `escala`");
  w.send("objetos", "ajustar", { id, oculto: false });
  assert.equal(w.avances(), 2, "ajustar that leaves it visible does not count");
  w.send("objetos", "ajustar", { id, oculto: true });
  assert.equal(w.avances(), 3, "oculta counts when the object ends hidden");
  w.send("objetos", "borrar", { id, lote: "" });
  assert.equal(w.avances(), 4, "borra");
  w.send("disparadores", "editarReceptores", { disparador: "azul", receptores: JSON.stringify([{ accion: "suena", sonido: "din" }]) });
  assert.equal(w.avances(), 4, "edita_cable with `disparador` counts only that cable");
  w.send("disparadores", "editarReceptores", { disparador: "rojo", receptores: JSON.stringify([{ accion: "suena", sonido: "din" }]) });
  assert.equal(w.avances(), 5);
  w.send("disparadores", "borrarDisparador", { disparador: "azul" });
  assert.equal(w.avances(), 6);
  assert.equal(w.paso(), -1);
});

test("T1 machine: dispara_cable (with `disparador` only that cable), by the one who presses it", () => {
  const w = mundo([H("p", "dispara_cable", { disparador: "rojo" })]);
  w.pump(3); w.aceptar(); w.place(0.5, 0.5); w.pump();
  w.send("disparadores", "pulsar", { disparador: "azul" });
  assert.equal(w.avances(), 0, "another cable does not count");
  w.send("disparadores", "pulsar", { disparador: "rojo" });
  assert.equal(w.avances(), 1);
  assert.equal(w.paso(), -1);
});

test("T1 machine: the intent `hace` is only for abre_construir, abre_cable, abre_biblioteca — what the server sees itself is refused, and a step that is not the current one ignores it", () => {
  assert.deepEqual([...ACCIONES_PAGINA], ["abre_construir", "abre_cable", "abre_biblioteca"]);
  const w = mundo([H("a", "coloca"), H("b", "abre_biblioteca")]);
  w.pump(3); w.aceptar();
  w.send("misiones", "hace", { accion: "coloca" });
  assert.equal(w.avances(), 0, "`coloca` by intent is refused: a page cannot say it placed something");
  assert.ok(w.avisos.some((a) => /lo ve el servidor solo/.test(a)), "and the refusal says why");
  w.send("misiones", "hace", { accion: "abre_biblioteca" });
  assert.equal(w.avances(), 0, "a page action that is not the current step does not count");
  w.colocar();
  assert.equal(w.avances(), 1);
  w.send("misiones", "hace", { accion: "abre_cable" });
  assert.equal(w.avances(), 1, "the wrong page action does not count");
  w.send("misiones", "hace", { accion: "abre_biblioteca" });
  assert.equal(w.avances(), 2);
  assert.equal(w.paso(), -1);
});

test("T1 machine: without permission to build nothing `hace` counts (the page's actions either); with `espera` it waits like any step", () => {
  let puede = false;
  const w = mundo([H("a", "abre_construir"), H("b", "crea_cable")], { puede: () => puede });
  w.pump(3); w.aceptar();
  w.send("misiones", "hace", { accion: "abre_construir" });
  assert.equal(w.avances(), 0, "no permission to build: the page action does not count");
  w.send("disparadores", "crearDisparador", { disparador: "luz-1", nombre: "Luz", tipo: "zona", x: 5, y: 0, z: 5, radio: 3, receptores: JSON.stringify([{ accion: "suena", sonido: "campana" }]) });
  assert.equal(w.avances(), 0);
  puede = true;
  w.send("misiones", "hace", { accion: "abre_construir" });
  assert.equal(w.avances(), 1, "with permission it does");
  w.send("disparadores", "crearDisparador", { disparador: "luz-2", nombre: "Luz 2", tipo: "zona", x: 5, y: 0, z: 5, radio: 3, receptores: JSON.stringify([{ accion: "suena", sonido: "campana" }]) });
  assert.equal(w.avances(), 2);
});

test("T1 determinism: a world whose missions have `hace` steps hashes like a world without them, and without any such mission the pieces say nothing extra", () => {
  const con = mundo([H("a", "coloca"), H("b", "mueve"), H("c", "abre_construir")]);
  const sin = mundo([], { sinMisiones: true });
  for (const w of [con, sin]) { w.pump(3); w.place(0, 0); w.pump(2); }
  con.aceptar(); sin.pump(15); // the same number of ticks (talking to the guide takes 15)
  for (const w of [con, sin]) { w.place(2, 2); w.pump(2); }
  const id = con.colocar(); sin.colocar();
  con.mover(id, { x: 4 }); sin.mover(id, { x: 4 });
  con.send("misiones", "hace", { accion: "abre_construir" }); sin.pump(3);
  assert.equal(con.paso(), -1);
  assert.equal(con.inst.hash(), sin.inst.hash());
  // a world with missions but none `hace`: the listeners do nothing (no quest, no progress touched)
  assert.equal(sin.eventos["misiones.avance"] ?? 0, 0);
  assert.deepEqual(sin.log.filter((l) => /^\[misiones\] listen\(/.test(l)), [], "every event it listens to exists on this server");
});
