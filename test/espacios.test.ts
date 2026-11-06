// espacios v1 (Y50 + Y51): own private spaces, headless (in-memory world, pages pumped by 20 Hz ticks). The file (wrong lines out
// with their reason), the pure placement rules in centimetres (support below, type, cap, no overlap, nothing removed with
// something on it), a scripted placement that gives the same result every time, the owner / guest / game-master rules, the
// privacy sweep, untrusted names, the cap published in limits.json, and the world's file through conMundo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { espacios, ESPACIO_OBJETOS_MAX, ESPACIO_INVITADOS_MAX, PASO_TICKS } from "../features/espacios/feature.ts";
import { leerEspacios, puedeColocar, puedeRetirar, cortar, TIPOS_DEFECTO } from "../features/espacios/esquema.ts";
import type { Cosa, EspacioFichero } from "../features/espacios/esquema.ts";
import { crearEspacios } from "../features/espacios/server.ts";
import { crearCliente } from "../features/espacios/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const RINCON: EspacioFichero = { id: "rincon", nombre: "Rincón", x: 0, z: 0, y: undefined, radio: 8, tope: 5 };
const OTRO: EspacioFichero = { id: "otro", nombre: "Otro", x: 40, z: 0, y: undefined, radio: 8, tope: 5 };

/** n pages; page 0 is the game master (the only one who «dirige»). */
function mundo(n: number, lista: EspacioFichero[] = [RINCON, OTRO]) {
  const log: string[] = [];
  let gm = -1;
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearEspacios({ espacios: lista })], log: (l) => log.push(l), identitySign: sign, puede: (_w, accion, e) => accion === "dirigir" && e === gm });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts, view: { label() {}, bounce() {}, tag() {} } });
    return { t, s, c: cli.espacios };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const at = (e: number) => ({ x: fxToFloat(inst.sim.tf.cols.x[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) });
  pump(4);
  gm = pages[0].s.entity;
  return { inst, pages, pump, place, at, log };
}

test("espacios: the declaration meets the plug's rules and is in the server list; the first-load page carries no client part of it (the catalog is enough)", () => {
  assert.deepEqual(espacios.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "espacios"));
  assert.ok(!paginas.some((f) => f.feature.id === "espacios"), "a lazy panel (Y50b) imports features/espacios/client.ts; the first load stays under limits.json first_load_br_bytes");
});

test("leerEspacios: each wrong line is left out WITH its reason; own kinds replace the house ones", () => {
  const r = leerEspacios({
    schema: "numinia-engine/espacios@1",
    cosas: { silla: { alto: 0.9, ancho: 0.5, sobre: ["suelo"] }, "Mal": { alto: 1, ancho: 1, sobre: ["suelo"] }, vacia: { alto: 1, ancho: 1, sobre: [] } },
    espacios: [
      { id: "a", x: 0, z: 0 },
      { id: "b", nombre: "Bé", x: 5, z: 5, radio: 4, tope: 10 },
      { id: "A", x: 0, z: 0 }, { id: "a", x: 1, z: 1 }, { id: "sin-x", z: 1 },
      { id: "radio", x: 0, z: 0, radio: 500 }, { id: "tope", x: 0, z: 0, tope: ESPACIO_OBJETOS_MAX + 1 }, "no es un objeto",
    ],
  });
  assert.deepEqual(r.valor.map((e) => e.id), ["a", "b"]);
  assert.equal(r.valor[0].tope, ESPACIO_OBJETOS_MAX); assert.equal(r.valor[0].radio, 8); assert.equal(r.valor[0].nombre, "Espacio a");
  assert.deepEqual(Object.keys(r.tipos), ["silla"]); assert.deepEqual(r.tipos.silla, { alto: 90, ancho: 50, sobre: ["suelo"] });
  const paths = r.problemas.map((p) => p.path);
  assert.ok(paths.includes("espacios.cosas.Mal") && paths.includes("espacios.cosas.vacia.sobre"), paths.join(", "));
  for (const i of [2, 3, 4, 5, 6, 7]) assert.ok(paths.some((p) => p.startsWith(`espacios.espacios[${i}]`)), `line ${i} is said: ${paths.join(", ")}`);
  assert.ok(r.problemas.find((p) => p.path.endsWith("[6].tope"))!.message.includes("space_objects_max"));
  assert.deepEqual(leerEspacios(undefined), { valor: [], tipos: { ...TIPOS_DEFECTO }, problemas: [] });
});

const ESP = { cx: 0, cz: 0, radio: 800, tope: 5 };
test("puedeColocar: the floor, a supporter with room under the spot, the type's own rules, the edge and the cap", () => {
  const caja = puedeColocar(ESP, [], TIPOS_DEFECTO, "caja", 100, 100, 0);
  assert.deepEqual(caja, { ok: true, y: 0 });
  const mesa: Cosa = { n: 1, t: "mesa", x: 0, z: 0, y: 0, s: 0 };
  assert.deepEqual(puedeColocar(ESP, [mesa], TIPOS_DEFECTO, "taza", 70, -70, 1), { ok: true, y: 80 }, "a cup on a table rests at the table's height");
  const sobreNada = puedeColocar(ESP, [mesa], TIPOS_DEFECTO, "taza", 90, 0, 1);
  assert.ok(!sobreNada.ok && /nada debajo/.test(sobreNada.motivo), "beyond the table's half width (80 cm) there is nothing under it");
  const taza = puedeColocar(ESP, [], TIPOS_DEFECTO, "taza", 0, 0, 0);
  assert.ok(!taza.ok && /no va en el suelo/.test(taza.motivo), "a cup only goes on a table");
  const tazaSobreCaja = puedeColocar(ESP, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "taza", 0, 0, 1);
  assert.ok(!tazaSobreCaja.ok && /no puede ir sobre caja/.test(tazaSobreCaja.motivo));
  const mesaSobreCaja = puedeColocar(ESP, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "mesa", 0, 0, 1);
  assert.ok(!mesaSobreCaja.ok, "a table does not go on a crate");
  const nadie = puedeColocar(ESP, [], TIPOS_DEFECTO, "caja", 0, 0, 9);
  assert.ok(!nadie.ok && /ninguna cosa número 9/.test(nadie.motivo));
  const fuera = puedeColocar(ESP, [], TIPOS_DEFECTO, "caja", 900, 0, 0);
  assert.ok(!fuera.ok && /fuera de tu espacio/.test(fuera.motivo));
  const solapa = puedeColocar(ESP, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "caja", 99, 0, 0);
  assert.ok(!solapa.ok && /ya está caja 1/.test(solapa.motivo));
  assert.ok(puedeColocar(ESP, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "caja", 100, 0, 0).ok, "100 cm between centres of two 100 cm crates is enough");
  assert.deepEqual(puedeColocar(ESP, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "caja", 0, 0, 1), { ok: true, y: 100 }, "crates stack");
  const lleno = puedeColocar({ ...ESP, tope: 1 }, [{ n: 1, t: "caja", x: 0, z: 0, y: 0, s: 0 }], TIPOS_DEFECTO, "caja", 300, 0, 0);
  assert.ok(!lleno.ok && /lleno: 1 de 1/.test(lleno.motivo));
  const sobreTope = puedeColocar({ ...ESP, tope: 999 }, Array.from({ length: ESPACIO_OBJETOS_MAX }, (_, i) => ({ n: i + 1, t: "caja", x: i * 100, z: 0, y: 0, s: 0 })), TIPOS_DEFECTO, "caja", 0, 500, 0);
  assert.ok(!sobreTope.ok && /lleno/.test(sobreTope.motivo), "a tope above the engine's cap is cut to the cap");
  assert.ok(!puedeColocar(ESP, [], TIPOS_DEFECTO, "dragon", 0, 0, 0).ok);
});

test("puedeRetirar: not while something rests on it", () => {
  const cosas: Cosa[] = [{ n: 1, t: "mesa", x: 0, z: 0, y: 0, s: 0 }, { n: 2, t: "taza", x: 0, z: 0, y: 80, s: 1 }, { n: 3, t: "taza", x: 50, z: 0, y: 80, s: 1 }];
  const no = puedeRetirar(cosas, 1);
  assert.ok(!no.ok && /2 cosas encima \(2, 3\)/.test(no.motivo));
  assert.deepEqual(puedeRetirar(cosas, 2), { ok: true });
  assert.ok(!puedeRetirar(cosas, 7).ok);
  assert.deepEqual(puedeRetirar(cosas.filter((c) => c.s !== 1), 1), { ok: true });
});

/** A fixed order list, run twice on two fresh worlds: the same things at the same heights, and the same refusals. */
test("a scripted placement gives the same result every time (deterministic)", () => {
  const guion: [string, number, number, number][] = [["mesa", 0, 0, 0], ["taza", 0.5, 0, 1], ["caja", 3, 3, 0], ["caja", 3, 3, 3], ["caja", 3.2, 3, 0], ["taza", 0, 0, 1], ["silla", 0, 0, 0], ["caja", -3, 3, 0], ["caja", -6, 3, 0], ["caja", -3, -3, 0]];
  const correr = () => {
    const m = mundo(2, [{ ...RINCON, tope: 6 }]);
    const [gm, due] = m.pages;
    gm.c.asignar("rincon", due.s.entity); m.pump(2); m.place(due.s.entity, 0, 4); m.pump(2);
    for (const [t, x, z, s] of guion) { due.c.colocar("rincon", t, x, z, s); m.pump(2); }
    due.c.retirar("rincon", 2); m.pump(2); due.c.retirar("rincon", 1); m.pump(2);
    due.c.mirar("rincon"); m.pump(2);
    return { mirar: due.c.ultimoAviso(), estado: { ...due.c.uno("rincon")!, duenoNombre: "" }, log: m.log.filter((l) => l.includes("rincon")) };
  };
  const a = correr(), b = correr();
  assert.deepEqual(a, b);
  assert.equal(a.mirar, "Rincón. Invitados: nadie. Cosas (5 de 6): 1 mesa; 3 caja; 4 caja sobre 3; 5 taza sobre 1; 6 caja.", a.mirar);
});

test("the game master assigns and frees; one space per person; only who directs may", () => {
  const { pages: [gm, a, b], pump } = mundo(3);
  a.c.asignar("rincon", a.s.entity); pump(2);
  assert.match(a.c.ultimoRechazo(), /cosa de quien dirige/);
  assert.equal(a.c.uno("rincon")!.estado, "libre");
  assert.ok(gm.c.asignar("rincon", a.s.entity).ok); pump(2);
  assert.equal(a.c.uno("rincon")!.estado, "privado");
  assert.match(a.c.ultimoConcedido(), /Te han dado un espacio propio: rincon/);
  assert.equal(a.c.uno("rincon")!.duenoNombre, a.s.who?.nombre ?? a.c.uno("rincon")!.duenoNombre);
  gm.c.asignar("rincon", b.s.entity); pump(2);
  assert.match(gm.c.ultimoRechazo(), /ya tiene dueño/);
  gm.c.asignar("otro", a.s.entity); pump(2);
  assert.match(gm.c.ultimoRechazo(), /solo uno por persona/);
  gm.c.asignar("nada", a.s.entity); pump(2);
  assert.match(gm.c.ultimoRechazo(), /No hay ningún espacio «nada»/);
  gm.c.asignar("otro", 999); pump(2);
  assert.match(gm.c.ultimoRechazo(), /no está conectada/);
  b.c.liberar("rincon"); pump(2);
  assert.match(b.c.ultimoRechazo(), /cosa de quien dirige/);
  gm.c.liberar("rincon"); pump(2);
  assert.equal(b.c.uno("rincon")!.estado, "libre");
  gm.c.liberar("rincon"); pump(2);
  assert.match(gm.c.ultimoRechazo(), /ya está libre/);
});

test("privacy: a stranger inside is put back outside with the reason; the owner, a guest and the game master stay; entrar is refused to strangers", () => {
  const { pages: [gm, due, inv, ext], pump, place, at } = mundo(4);
  gm.c.asignar("rincon", due.s.entity); pump(2);
  for (const p of [gm, due, inv, ext]) place(p.s.entity, 1, 1);
  pump(PASO_TICKS * 2 + 2);
  const lejos = (e: number) => Math.hypot(at(e).x, at(e).z) > RINCON.radio;
  assert.ok(lejos(ext.s.entity), "the stranger was put outside the edge");
  assert.ok(lejos(inv.s.entity), "a guest not yet invited is a stranger too");
  assert.ok(!lejos(due.s.entity) && !lejos(gm.s.entity), "owner and game master stay");
  assert.match(ext.c.ultimoRechazo(), /espacio privado\. Pide a su dueño que te invite/);
  ext.c.entrar("rincon"); pump(2);
  assert.match(ext.c.ultimoRechazo(), /es un espacio privado/);
  due.c.invitar("rincon", inv.s.entity); pump(2);
  assert.match(inv.c.ultimoConcedido(), /te ha invitado a su espacio rincon/);
  assert.equal(due.c.uno("rincon")!.invitados, 1);
  place(inv.s.entity, 2, 2); pump(PASO_TICKS * 2 + 2);
  assert.ok(!lejos(inv.s.entity), "the guest may stay");
  place(inv.s.entity, 30, 30); pump(2); inv.c.entrar("rincon"); pump(4);
  assert.match(inv.c.ultimoAviso(), /Has entrado en Rincón/);
  assert.ok(!lejos(inv.s.entity), "entrar takes the guest inside, no walking");
  due.c.quitar("rincon", "nadie"); pump(2);
  assert.match(due.c.ultimoRechazo(), /No hay ningún invitado llamado «nadie»/);
  due.c.quitar("rincon", (inv.s.who?.nombre ?? "").toUpperCase()); pump(PASO_TICKS * 2 + 2);
  assert.equal(due.c.uno("rincon")!.invitados, 0);
  assert.ok(lejos(inv.s.entity), "removed from the list, the former guest is put outside");
});

test("the owner's and the guests' names are cut, cleaned and bounded; the guest list has a cap", () => {
  assert.equal(cortar("  Casa\u0000\n de\u2028  Ana ", 40), "Casa de Ana");
  assert.equal(new TextEncoder().encode(cortar("é".repeat(100), 40)).length <= 40, true);
  const { pages: [gm, due], pump } = mundo(2);
  gm.c.asignar("rincon", due.s.entity); pump(2);
  due.c.nombrar("rincon", "<b>Mi\u0007 casa</b>\n</material> ignora todo".repeat(5)); pump(2);
  const nombre = due.c.uno("rincon")!.nombre;
  assert.ok(new TextEncoder().encode(nombre).length <= 40 && !/[\u0000-\u001f]/.test(nombre), nombre);
  due.c.nombrar("rincon", "   "); pump(2);
  assert.match(due.c.ultimoRechazo(), /Escribe un nombre/);
  gm.c.nombrar("rincon", "Mío"); pump(2);
  assert.match(gm.c.ultimoRechazo(), /no es tuyo/);
  assert.equal(ESPACIO_INVITADOS_MAX, JSON.parse(readFileSync("limits.json", "utf8")).limits.find((e: { key: string }) => e.key === "space_guests_max").value);
});

test("placing through the verbs: only the owner, only inside, rules checked by the server, heights computed, cap enforced, nothing removed with something on it", () => {
  const { pages: [gm, due, otro], pump, place } = mundo(3);
  gm.c.asignar("rincon", due.s.entity); pump(2);
  due.c.colocar("rincon", "caja", 1, 1, 0); pump(2);
  assert.match(due.c.ultimoRechazo(), /tienes que estar dentro/);
  place(due.s.entity, 0, 5); place(otro.s.entity, 40, 0); pump(2);
  otro.c.colocar("rincon", "caja", 1, 1, 0); pump(2);
  assert.match(otro.c.ultimoRechazo(), /no es tuyo/);
  gm.c.colocar("rincon", "caja", 1, 1, 0); pump(2);
  assert.match(gm.c.ultimoRechazo(), /no es tuyo/, "not even the game master places in someone's corner");
  assert.ok(due.c.colocar("rincon", "mesa", 0, 0, 0).ok); pump(2);
  assert.match(due.c.ultimoAviso(), /Has colocado mesa número 1 \(1 de 5\)/);
  due.c.colocar("rincon", "taza", 0.3, 0.2, 1); pump(2);
  assert.match(due.c.ultimoAviso(), /taza número 2 \(2 de 5\)/);
  due.c.colocar("rincon", "taza", 5, 5, 1); pump(2);
  assert.match(due.c.ultimoRechazo(), /nada debajo/);
  due.c.retirar("rincon", 1); pump(2);
  assert.match(due.c.ultimoRechazo(), /mesa 1 tiene 1 cosa encima \(2\)/);
  assert.equal(due.c.uno("rincon")!.cosas, 2);
  due.c.retirar("rincon", 2); pump(2);
  due.c.retirar("rincon", 1); pump(2);
  assert.equal(due.c.uno("rincon")!.cosas, 0);
  for (let i = 0; i < 6; i++) { due.c.colocar("rincon", "caja", -6 + i * 2, 3, 0); pump(2); }
  assert.equal(due.c.uno("rincon")!.cosas, 5, "the 6th is refused: the space's tope is 5");
  assert.match(due.c.ultimoRechazo(), /lleno: 5 de 5/);
  gm.c.liberar("rincon"); pump(2);
  assert.equal(gm.c.uno("rincon")!.cosas, 0, "freeing empties the space");
});

test("the chat order /espacio works like the verbs", () => {
  const { pages: [gm, due, otro], pump, place } = mundo(3);
  gm.c.asignar("rincon", due.s.entity); pump(2);
  const di = (p: typeof due, t: string) => { p.s.features.send("chat", "decir", { texto: t, alcance: "cerca" }); pump(30); }; // the chat has its own pace: let it recover between lines
  di(due, "/espacio");
  assert.match(due.c.ultimoAviso(), /Rincón\. Invitados: nadie\. Cosas \(0 de 5\): nada\./);
  di(due, "/espacio rincon nombre La cabaña");
  assert.equal(due.c.uno("rincon")!.nombre, "La cabaña");
  const nombreOtro = otro.s.who?.nombre ?? "";
  place(otro.s.entity, 40, 0); pump(2);
  di(due, `/espacio rincon invitar ${nombreOtro}`);
  assert.equal(due.c.uno("rincon")!.invitados, 1);
  di(due, `/espacio rincon quitar ${nombreOtro}`);
  assert.equal(due.c.uno("rincon")!.invitados, 0);
  di(due, "/espacio rincon invitar nadie-asi");
  assert.match(due.c.ultimoRechazo(), /No encuentro a nadie/);
  di(due, "/espacio rincon baila");
  assert.match(due.c.ultimoRechazo(), /Órdenes de \/espacio/);
  di(otro, "/espacio rincon entrar");
  assert.match(otro.c.ultimoRechazo(), /es un espacio privado/);
});

test("limits.json publishes the cap of objects the server enforces", () => {
  const e = JSON.parse(readFileSync("limits.json", "utf8")).limits.find((x: { key: string }) => x.key === "space_objects_max");
  assert.equal(e.value, ESPACIO_OBJETOS_MAX); assert.equal(e.state, "measured"); assert.equal(e.test, "test/espacios.test.ts");
});

test("a world's espacios.json goes through conMundo: used lines in, wrong ones logged with their path; without the file, the house part", () => {
  const log: string[] = [];
  const ficheros: Record<string, unknown> = { "espacios.json": { espacios: [{ id: "rincon", x: 0, z: 0 }, { id: "mal", x: 0 }] } };
  const partes = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const parte = partes.find((p) => p.feature.id === "espacios")!;
  assert.ok(parte && parte !== funciones.find((p) => p.feature.id === "espacios"), "the part was rebuilt with the world's spaces");
  assert.ok(log.some((l) => l.includes("[mundo] espacios.json: espacios.espacios[1]") && l.includes("esa línea no se usa")), log.join("\n"));
  assert.equal(conMundo(funciones, () => undefined).find((p) => p.feature.id === "espacios"), funciones.find((p) => p.feature.id === "espacios"));
});

test("the caps in limits.json are enforced by the server: the 41st object and the 13th guest are refused, and a full space still fits the store", () => {
  const m = mundo(2 + ESPACIO_INVITADOS_MAX + 1, [{ ...RINCON, radio: 12, tope: ESPACIO_OBJETOS_MAX }]);
  const [gm, due, ...otros] = m.pages;
  gm.c.asignar("rincon", due.s.entity); m.pump(2); m.place(due.s.entity, 0, 0); m.pump(2);
  for (let i = 0; i < ESPACIO_OBJETOS_MAX + 1; i++) { due.c.colocar("rincon", "caja", -7 + (i % 8) * 2, -5 + Math.floor(i / 8) * 2, 0); m.pump(6); }
  assert.equal(due.c.uno("rincon")!.cosas, ESPACIO_OBJETOS_MAX);
  assert.match(due.c.ultimoRechazo(), /lleno: 40 de 40/);
  for (const o of otros) { due.c.invitar("rincon", o.s.entity); m.pump(6); }
  assert.equal(due.c.uno("rincon")!.invitados, ESPACIO_INVITADOS_MAX);
  assert.match(due.c.ultimoRechazo(), /La lista está llena: 12 invitados/);
  assert.ok(!m.log.some((l) => l.includes("no pude guardar")), "40 things and 12 guests fit in one store key");
});
