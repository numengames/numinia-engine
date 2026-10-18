// N6: the Game Director (features/director): the escena@1 format, who may direct (STD-052 manage-rituals), scenes
// that put the look over the world's own environment, the narrator's line, and summonses nobody is forced to follow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearCliente as crearAmbiente } from "../features/entorno/client.ts";
import { crearDirector, limpiar } from "../features/director/server.ts";
import { crearCliente as crearDirectorCliente } from "../features/director/client.ts";
import { leerEscena, cargarEscenas, buscarEscena, idDeFichero, ESCENAS_CASA } from "../features/director/escena.ts";
import { director, NARRACION_MAX } from "../features/director/feature.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { tiene, acceso, plantilla } from "../packages/server/src/roles.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

const TABERNA = JSON.stringify({ schema: "numinia-engine/escena@1", nombre: "La taberna", preset: "atardecer", entorno: { niebla: { cerca: 8, lejos: 60, color: "#3a2a20" } }, narracion: "Huele a vino especiado." });
const CRIPTA = JSON.stringify({ schema: "numinia-engine/escena@1", nombre: "La cripta", entorno: { tono: { exposicion: 0.4 }, niebla: { lejos: 25 } } });

test("escena@1: a scene is a preset and/or a partial environment plus a line; wrong files say where and how to fix", () => {
  const r = leerEscena("taberna.json", TABERNA);
  assert.ok(r.ok);
  assert.deepEqual({ ...r.value, entorno: JSON.parse(r.value.entorno) }, { id: "taberna", nombre: "La taberna", preset: "atardecer", entorno: { niebla: { cerca: 8, lejos: 60, color: "#3a2a20" } }, narracion: "Huele a vino especiado.", casa: false });
  assert.equal(idDeFichero("escenas/Fiesta-Neon.json"), "fiesta-neon");
  assert.equal(idDeFichero("la taberna.json"), null, "a space is not an id");
  const ko = leerEscena("mal.json", JSON.stringify({ schema: "numinia-engine/escena@1", nombre: "", preset: "verano", entorno: { suelo: { tipo: "hierba" }, niebla: { lejos: "mucho" } }, narracion: "x".repeat(NARRACION_MAX + 1) }));
  assert.ok(!ko.ok);
  assert.deepEqual(ko.issues.map((i) => i.path).sort(), ["escena.entorno.niebla.lejos", "escena.entorno.suelo", "escena.narracion", "escena.nombre", "escena.preset"].sort());
  assert.match(ko.issues.find((i) => i.path === "escena.entorno.suelo")!.message, /no cambia el suelo/);
  const vacia = leerEscena("nada.json", JSON.stringify({ schema: "numinia-engine/escena@1", nombre: "Nada" }));
  assert.ok(!vacia.ok && vacia.issues.some((i) => /necesita un "preset" o un "entorno"/.test(i.message)));
  assert.ok(!leerEscena("roto.json", "{ no es json").ok);
  // a wrong file is left out and logged; the rest load, sorted by file name; the house presets come after
  const log: string[] = [];
  const escenas = cargarEscenas([{ fichero: "taberna.json", texto: TABERNA }, { fichero: "LEEME.md", texto: "#" }, { fichero: "mal.json", texto: "{" }, { fichero: "cripta.json", texto: CRIPTA }], (l) => log.push(l));
  assert.deepEqual(escenas.map((e) => e.id), ["cripta", "taberna"]);
  assert.match(log.join("\n"), /escenas\/mal\.json no se usa/);
  const todas = [...escenas, ...ESCENAS_CASA];
  assert.equal(buscarEscena(todas, "TABERNA")?.id, "taberna");
  assert.equal(buscarEscena(todas, "la cripta")?.id, "cripta", "by its name too");
  assert.equal(buscarEscena(todas, "2")?.id, "taberna", "by its number in /escenas");
  assert.equal(buscarEscena(todas, "dia")?.id, "día", "accents optional");
  assert.equal(buscarEscena(todas, "verano"), null);
});

test("director: declared for people and agents; directing is STD-052 manage-rituals, which Moderación holds", () => {
  assert.deepEqual(director.issues, []);
  assert.ok(director.describe.includes("Nadie se mueve sin decir que sí"));
  const r = plantilla(false);
  assert.equal(tiene(acceso(r, null), "dirigir"), false, "a visitor does not direct");
  assert.ok(r.find((x) => x.nombre === "Moderación")!.permisos.includes("manage-rituals"));
  assert.equal(limpiar("a\u0000b\n  c", 10), "a b c");
  assert.equal(new TextEncoder().encode(limpiar("ñ".repeat(200), 40)).length <= 40, true, "cut by bytes, never inside a character");
});

/** A headless world with chat, the environment, the director and the world's roles: n people with identities. */
function mundo(n: number) {
  const log: string[] = [];
  const reloj = { ms: Date.parse("2026-10-18T22:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const mundoEntorno = { schema: "numinia-engine/entorno@1", cielo: { arriba: "#102030" }, suelo: { tipo: "hierba" } };
  const dj = crearDirector({ escenas: [{ fichero: "taberna.json", texto: TABERNA }, { fichero: "cripta.json", texto: CRIPTA }] });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno(mundoEntorno), dj, roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion) });
  const entrar = (i: number) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), a = crearAmbiente(), d = crearDirectorCliente();
    const balizas: string[] = [];
    const s = new ClientSession(t, { features: [c.part, a.part, d.part], identity: keeper(), view: { label() {}, bounce() {}, beacon: (_x, _z, text) => { balizas.push(text); } } });
    return { t, s, chat: c.chat, ambiente: a.ambiente, dj: d.director, balizas };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const nombre = (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre;
  const avisos = (p: (typeof gente)[number]) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto);
  const ultimo = (p: (typeof gente)[number]) => avisos(p).at(-1) ?? "";
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  return { inst, gente, pump, nombre, ultimo, decir, log };
}

test("director: only who may direct puts scenes; a scene goes over the world's own environment, and anyone sees the line", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  assert.equal(A.dj.estado.puede, false);
  assert.deepEqual(B.dj.escena("taberna"), { ok: true });
  W.pump(2);
  assert.match(B.dj.estado.ultimoRechazo, /Gestionar rituales/, "a visitor cannot direct");
  W.decir(B, "/escena taberna");
  assert.match(W.ultimo(B), /Gestionar rituales/, "nor from the chat");
  assert.equal(A.dj.actual(), null);
  // A becomes owner and gives B Moderación (manage-rituals): B now directs, and gets the scene list
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);
  W.pump(3);
  assert.equal(B.dj.estado.puede, true);
  assert.deepEqual(B.dj.estado.escenas.slice(0, 3).map((e) => [e.id, e.casa]), [["cripta", false], ["taberna", false], ["día", true]]);
  assert.equal(C.dj.estado.puede, false);
  assert.deepEqual(C.dj.estado.escenas, [], "the list only goes to who directs");
  // the scene: the preset over the world's environment, then the scene's own changes
  assert.deepEqual(B.dj.escena("taberna"), { ok: true });
  W.pump(3);
  const v = C.ambiente.valores()!;
  assert.equal(v.nieblaLejos, 60);
  assert.equal(v.nieblaCerca, 8);
  assert.equal(v.suelo, "hierba", "the ground is the world's");
  assert.deepEqual(C.dj.actual(), { id: "taberna", nombre: "La taberna", quien: W.nombre(B) });
  assert.deepEqual(C.dj.estado.narraciones.at(-1), { texto: "Huele a vino especiado.", quien: W.nombre(B) }, "the scene's line");
  // another scene leaves nothing of the first: the tavern's fog colour goes with it
  W.decir(B, "/escena la cripta");
  assert.match(W.ultimo(B), /Escena puesta: La cripta/);
  const c = C.ambiente.valores()!;
  assert.equal(c.nieblaLejos, 25);
  assert.notEqual(c.nieblaCerca, 8, "no leftovers of the tavern");
  assert.equal(c.cieloArriba, 0x102030, "the world's own sky under the scene");
  // the house presets are scenes too; an unknown one says how to see the list
  W.decir(B, "/escena noche");
  assert.equal(C.ambiente.valores()!.preset, "noche");
  W.decir(B, "/escena verano");
  assert.match(W.ultimo(B), /No hay ninguna escena «verano».*\/escenas/);
  W.decir(B, "/escenas");
  assert.match(W.ultimo(B), /1\. La cripta · 2\. La taberna · 3\. Día/);
  // the director moves light and fog live (the environment's own intent, now also for who directs)
  assert.deepEqual(B.ambiente.ajustar({ nieblaLejos: 40 }), { ok: true });
  W.pump(3);
  assert.equal(C.ambiente.valores()!.nieblaLejos, 40);
  assert.ok(C.chat.lineas.every((l) => !/escena|cripta/i.test(l.texto) || l.tipo !== "aviso"), "orders are answered only to who typed them");
});

test("director: narrate goes to everyone; a summons is an invitation each person answers, and only the caller sees the count", () => {
  const W = mundo(4);
  const [A, B, C, D] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  W.pump(3);
  W.decir(A, "/narrar   Cae la noche sobre el puerto.  ");
  for (const p of [B, C, D]) assert.deepEqual(p.dj.estado.narraciones.at(-1), { texto: "Cae la noche sobre el puerto.", quien: W.nombre(A) });
  W.decir(A, "/narrar");
  assert.match(W.ultimo(A), /¿Qué narras\?/);
  W.decir(B, "/narrar hola");
  assert.match(W.ultimo(B), /Gestionar rituales/);
  assert.equal(C.dj.estado.narraciones.length, 1, "a refused line reaches nobody");
  // summon: everyone but the caller gets a card; nobody moves
  const pos = (e: number) => [W.inst.sim.tf.cols.x[e], W.inst.sim.tf.cols.z[e]];
  const antes = pos(C.s.entity);
  W.decir(A, "/convocar Al escenario: empieza el pitch");
  assert.match(W.ultimo(A), /Convocatoria enviada a 3 persona/);
  assert.equal(A.dj.estado.convocatorias.length, 0, "the caller gets no card");
  const [conv] = C.dj.estado.convocatorias;
  assert.equal(conv.texto, "Al escenario: empieza el pitch");
  assert.equal(conv.de, W.nombre(A));
  assert.deepEqual(pos(C.s.entity), antes, "a summons never moves anyone");
  C.dj.acudir(conv.id, true);
  D.dj.acudir(conv.id, false);
  B.dj.acudir(conv.id, true);
  B.dj.acudir(conv.id, false); // changed their mind: counts once, the last answer
  W.pump(3);
  assert.deepEqual(A.dj.estado.respuestas.get(conv.id), { vienen: 1, no: 2 });
  assert.equal(C.dj.estado.convocatorias.length, 0, "answered = the card goes");
  assert.equal(B.dj.estado.respuestas.size, 0, "only the caller sees the count");
  // the panel's path (intents) does the same as the chat
  assert.deepEqual(A.dj.convocar(""), { ok: true });
  W.pump(3);
  assert.equal(D.dj.estado.convocatorias.at(-1)!.texto, "ven aquí");
});
