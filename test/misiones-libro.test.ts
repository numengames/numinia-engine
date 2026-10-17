// U14 (3): the quest book's three states (the TRG26 spec, §3) — done; to do now (every step still to do of the current
// block: a grupo has several); locked (still to do, after that block) — and the same marks on the VR panel; when the
// book opens by itself (a quest accepted, once its conversation has closed; never in VR; never on loading a book); which
// notes carry the item icon; the done check on a light tema surface. Then over the real plug: the TRG26 quest at the
// moments the photos show (accepted, one piece, three pieces, delivered, done).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { ahoraDe, crearCliente } from "../features/misiones/client.ts";
import type { MisionVista, PasoVista } from "../features/misiones/client.ts";
import { abrirSolo, ahorasDe, esObjeto, estadoPaso, ESTADOS } from "../apps/plaza/misiones.ts";
import type { EstadoPaso } from "../apps/plaza/misiones.ts";
import { montarXR } from "../apps/plaza/xr.ts";
import { icono } from "../apps/plaza/iconos.ts";
import { aplicarTema } from "../apps/plaza/tema-mundo.ts";

const G = "Piezas reunidas";
/** The states of a quest's steps as the page computes them: «ahora» from the controller's objetivos() (here, the same
 * ahoraDe it is built from). */
const estadosDe = (m: MisionVista, otras: MisionVista[] = []): EstadoPaso[] => {
  const ahoras = ahorasDe([m, ...otras].flatMap((x) => ahoraDe(x).map((s) => ({ mision: x.id, paso: s.n }))));
  return m.lista.map((s) => estadoPaso(m, s, ahoras));
};
const paso = (n: number, texto: string, o: Partial<PasoVista> = {}): PasoVista => ({ n, texto, tipo: "recibe", hecho: false, x: 0, z: 0, donde: "", que: "", grupo: "", ...o });
const TRG = [paso(0, "bastidor", { grupo: G }), paso(1, "telas", { grupo: G }), paso(2, "plano", { grupo: G }), paso(3, "entrega", { tipo: "entrega" }), paso(4, "cofre", { tipo: "usa" })];
/** A quest as the book holds it: `paso` = the first step still to do (the server's), `hechos` = the steps done. */
const vista = (pasos: PasoVista[], primero: number, hechos: number[], estado: "activa" | "hecha" = "activa", id = "vuelo"): MisionVista => ({
  id, titulo: id, descripcion: "", estado, paso: primero, pasos: pasos.length, seguida: true, recompensa: "", lista: pasos.map((s) => ({ ...s, hecho: hechos.includes(s.n) })),
});
const A = "ahora", H = "hecho", B = "bloqueado";

test("estadoPaso: a grupo's block is «ahora» all at once, what follows it is locked, done stays done; a done quest is all done", () => {
  assert.deepEqual(estadosDe(vista(TRG, 0, [])), [A, A, A, B, B], "accepted: the three pieces at once, the delivery and the chest locked");
  assert.deepEqual(estadosDe(vista(TRG, 0, [1])), [A, H, A, B, B], "one piece (in any order)");
  assert.deepEqual(estadosDe(vista(TRG, 1, [0, 2])), [H, A, H, B, B], "two pieces: the first still to do is the server's paso");
  assert.deepEqual(estadosDe(vista(TRG, 3, [0, 1, 2])), [H, H, H, A, B], "the three: the delivery opens, the chest waits");
  assert.deepEqual(estadosDe(vista(TRG, 4, [0, 1, 2, 3])), [H, H, H, H, A]);
  assert.deepEqual(estadosDe(vista(TRG, 5, [0, 1, 2, 3, 4], "hecha")), [H, H, H, H, H], "completed: all checks");
  assert.deepEqual(estadosDe(vista(TRG, 5, [], "hecha")), [H, H, H, H, H], "a completed quest is done whatever its steps say");
});

test("estadoPaso outside a block: a linear quest has one «ahora»; a grupo after a plain step stays locked until its turn; two quests do not mix", () => {
  const lineal = [paso(0, "Ve al pilar", { tipo: "llega_a" }), paso(1, "Habla con Bruno", { tipo: "habla_con" }), paso(2, "Coge la caja", { tipo: "coge" })];
  assert.deepEqual(estadosDe(vista(lineal, 0, [])), [A, B, B]);
  assert.deepEqual(estadosDe(vista(lineal, 1, [0])), [H, A, B]);
  const despues = [paso(0, "Habla con Pietro", { tipo: "habla_con" }), paso(1, "a", { grupo: G }), paso(2, "b", { grupo: G }), paso(3, "Entrega", { tipo: "entrega" })];
  assert.deepEqual(estadosDe(vista(despues, 0, [])), [A, B, B, B], "the block is not reachable yet: locked, both of it");
  assert.deepEqual(estadosDe(vista(despues, 1, [0])), [H, A, A, B]);
  // two active quests: the set is keyed by quest, so the other's «ahora» (its step 2) never lights this one's step 2
  const una = vista(lineal, 0, [], "activa", "una"), otra = vista(lineal, 2, [0, 1], "activa", "otra");
  assert.deepEqual(estadosDe(una, [otra]), [A, B, B]);
  assert.deepEqual(estadosDe(otra, [una]), [H, H, A]);
});

test("how each state reads: the words for screen readers, house icons that exist, VR marks without an emoji font", () => {
  assert.deepEqual(Object.values(ESTADOS).map((e) => e.dice), ["Hecho", "Ahora", "Bloqueado"]);
  assert.deepEqual(Object.values(ESTADOS).map((e) => e.vr), ["✓", "→", "□"]);
  for (const n of [ESTADOS.hecho.icono, ESTADOS.bloqueado.icono, "package"]) assert.match(icono(n, 16), /^<svg class="icono" .*aria-hidden="true".*<path d="M/, n);
  for (const e of Object.values(ESTADOS)) assert.doesNotMatch(e.vr, /\p{Emoji}|\p{Extended_Pictographic}/u, `${e.vr}: a plain glyph, never an emoji (🔒 would need a colour-emoji font in the headset)`);
});

test("abrirSolo: opens after an acceptance once no conversation is open, once; never in VR; a loaded book alone opens nothing", () => {
  const s = abrirSolo();
  assert.equal(s.toca({ dialogo: false, vr: false }), false, "nothing accepted: a page that loads with quests stays shut");
  s.aceptada();
  assert.equal(s.toca({ dialogo: true, vr: false }), false, "the conversation that gave it is still open: wait");
  assert.equal(s.toca({ dialogo: false, vr: false }), true, "it closed: open now");
  assert.equal(s.toca({ dialogo: false, vr: false }), false, "only once per acceptance");
  s.aceptada();
  assert.equal(s.toca({ dialogo: false, vr: true }), false, "in VR the panel lists the steps: no book…");
  assert.equal(s.toca({ dialogo: false, vr: false }), false, "…nor later, out of VR");
});

test("esObjeto: «Has recibido: …» and a coge step's own text carry the item icon; other steps do not", () => {
  const lista = [{ n: 0, texto: "Coge la regadera", hecho: false, donde: "", tipo: "coge" }, { n: 1, texto: "Ve al pilar", hecho: false, donde: "", tipo: "llega_a" }];
  assert.equal(esObjeto("Has recibido: Telas ligeras", undefined), true);
  assert.equal(esObjeto("Coge la regadera", { lista }), true);
  assert.equal(esObjeto("Ve al pilar", { lista }), false);
  assert.equal(esObjeto("Coge la regadera", undefined), false, "a quest the book does not know: no guess");
});

test("the done check stays readable on any tema: a light surface gets the dark success green; a dark one keeps the house green", () => {
  const raiz = () => { const puestas = new Map<string, string>(); return { puestas, style: { setProperty: (k: string, v: string) => { puestas.set(k, v); } }, dataset: {} as Record<string, string | undefined> }; };
  const claro = raiz(), oscuro = raiz();
  aplicarTema({ superficie: "#f9ebdc", texto: "#14110f" }, claro);
  aplicarTema({ superficie: "#160a1a" }, oscuro); // the TRG26's
  assert.equal(claro.puestas.get("--n-hecho"), "#1f6b5f");
  assert.equal(oscuro.puestas.has("--n-hecho"), false);
});

// ---------- over the real plug: server + page controller (the TRG26 quest, as in test/misiones-grupo.test.ts) ----------
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const persona = (id: string, nombre: string, x: number, z: number, dialogo: unknown) => ({ formato: "pnj@1", id, nombre, posicion: { x, z }, dialogo });
const solo = (texto: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto, opciones: [adios] } } });
const PNJ = [
  persona("pietro", "Pietro, el aprendiz", 0, 0, { entradas: [{ si: { mision: "vuelo", estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "vuelo" } }] }, hola: { texto: "Busca a los artesanos.", opciones: [adios] } } }),
  persona("cosimo", "Cosimo, el carpintero", 10, 0, solo("Aquí tienes el bastidor.")),
  persona("bianca", "Bianca, la tejedora", -10, 0, solo("Llévale estas telas al maestro.")),
  persona("artemisia", "Artemisia, la humanista", 0, 10, solo("Aquí tienes el plano.")),
  persona("leonardo", "Leonardo", 0, -10, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "entrega" }, nodo: "listo" }, { nodo: "antes" }], nodos: { listo: { texto: "¡Magnífico!", opciones: [{ texto: "Entregar piezas", accion: { tipo: "entregar", mision: "vuelo" } }] }, antes: { texto: "Aún faltan piezas.", opciones: [adios] } } }),
];
const PASOS = [
  { id: "bastidor", tipo: "recibe", texto: "Recoge el bastidor de Cosimo", pnj: "cosimo", cosa: "bastidor", grupo: G },
  { id: "telas", tipo: "recibe", texto: "Recoge las telas de Bianca", pnj: "bianca", cosa: "telas", grupo: G },
  { id: "plano", tipo: "recibe", texto: "Recoge el plano de Artemisia", pnj: "artemisia", cosa: "plano", grupo: G },
  { id: "entrega", tipo: "entrega", texto: "Entrega las tres piezas a Leonardo", pnj: "leonardo", cosas: ["bastidor", "telas", "plano"] },
  { id: "cofre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" },
];
const VUELO = { formato: "mision@1", id: "vuelo", titulo: "El vuelo del Maestro", descripcion: "Reúne las tres piezas y llévaselas a Leonardo.", pasos: PASOS, textos: { aceptada: "Busca a los tres artesanos.", completada: "¡Eureka!" } };
const cosa = (id: string, nombre: string, x: number, z: number) => ({ formato: "cosa@1", id, nombre, posicion: { x, z }, aviso: `usar ${id}` });
const COSAS = [cosa("bastidor", "Bastidor de madera", 11, 1), cosa("telas", "Telas ligeras", -11, 1), cosa("plano", "Plano de equilibrio", 1, 11), cosa("cofre", "Cofre de la bottega", 2, -12)];
const ficheros = (dir: string, xs: { id: string }[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function world() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: { misiones: ficheros("misiones", [VUELO]), pnj: ficheros("pnj", PNJ), cosas: ficheros("cosas", COSAS) } }), log: () => {}, identitySign: signer("una-clave-de-prueba-larga"), now: () => Date.parse("2026-10-17T12:00:00Z") });
  const t = inst.join(0), cli = crearCliente();
  const s = new ClientSession(t, { features: cli.parts, identity: keeper(), view: { label() {}, bounce() {}, place() {}, tag() {} } });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { t.flush(); inst.tick(); t.flush(); } };
  const ir = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); pump(12); };
  return { s, m: cli.misiones, pump, ir };
}

test("the TRG26 quest over the plug: the states at each moment, the VR panel's marks, the book opening once after Pietro, the item notes", () => {
  const { s, m, pump, ir } = world();
  pump(3);
  // the page's wiring (montarLibro): «aceptada» and every closed conversation ask whether to open; the «avance» texts
  const ab = abrirSolo(), aperturas: string[] = [], avances: string[] = [];
  const quizas = (cuando: string) => { if (ab.toca({ dialogo: !!m.dialogo(), vr: false })) aperturas.push(cuando); };
  s.features.tap((f, e, msg) => {
    if (f !== "misiones") return;
    if (e === "aceptada") { ab.aceptada(); quizas("al aceptar"); }
    if (e === "avance") avances.push(`${esObjeto(String(msg.texto), m.libro().find((x) => x.id === String(msg.mision))) ? "objeto" : "paso"}: ${String(msg.texto)}`);
  });
  m.alCambiar((que) => { if (que === "dialogo") quizas("al cerrarse el diálogo"); });
  const vrVista = { vr: { active: true, pagina: "mision" as const, dialogo() {}, nota() {}, onElegir() {}, onAtras() {} }, ar: { state: "off" }, manos: { reglas() {}, on() {}, vibrar() {} }, llevar() {}, llevando: () => ({}) };
  const xr = montarXR({ session: { features: { use: () => ({ ok: true as const }) } }, view: vrVista, misiones: m, interaccion: { actual: () => null, usar: () => ({ ok: true as const }), mirar() {} } });
  const ahora = () => { const v = m.libro()[0]; return estadosDe(v); };
  const marcasVR = () => xr.lineasPanel().slice(1).map((l) => l.split(" ")[0]).join("");

  assert.equal(m.libro().length, 0);
  ir(1, 0); m.hablar("pietro"); pump(2); m.elegir(1); pump(2); // «Sí.»: accepted, and the conversation ends right after
  assert.deepEqual(aperturas, ["al cerrarse el diálogo"], "the acceptance came while Pietro's box was open: the book waits for it to close");
  assert.deepEqual(ahora(), [A, A, A, B, B]);
  assert.equal(marcasVR(), "→→→□□");
  assert.deepEqual(xr.lineasPanel().slice(0, 2), ["El vuelo del Maestro", "→ Recoge el bastidor de Cosimo"]);

  ir(-9, 0); m.hablar("bianca"); pump(2); m.adios(); pump(2);
  assert.deepEqual(ahora(), [A, H, A, B, B]);
  assert.equal(marcasVR(), "→✓→□□");
  ir(9, 0); m.hablar("cosimo"); pump(2); m.adios(); pump(2);
  ir(0, 9); m.hablar("artemisia"); pump(2); m.adios(); pump(2);
  assert.deepEqual(ahora(), [H, H, H, A, B], "the three pieces: the delivery is now");
  assert.equal(marcasVR(), "✓✓✓→□");
  ir(0, -9); m.hablar("leonardo"); pump(2); m.elegir(1); pump(2);
  assert.deepEqual(ahora(), [H, H, H, H, A]);
  ir(2, -11); m.usar("cofre"); pump(2);
  assert.equal(m.libro()[0].estado, "hecha");
  assert.deepEqual(ahora(), [H, H, H, H, H], "completed: all checks");
  assert.deepEqual(aperturas, ["al cerrarse el diálogo"], "talking to the others never opened it again");
  assert.deepEqual(avances, ["objeto: Has recibido: Telas ligeras", "objeto: Has recibido: Bastidor de madera", "objeto: Has recibido: Plano de equilibrio", "paso: Entrega las tres piezas a Leonardo", "paso: Abre el cofre"]);
});
