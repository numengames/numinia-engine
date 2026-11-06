// mundo-hermes · historia 4: `usar` / `pedir` on the espejo piece. The page only asks; the SERVER checks who / what / where / which verb /
// which switch / how often, and only then forwards a `peticion` outwards (never runs anything). `resultado` closes it; no answer in
// 30 s expires it. Headless: real Instance + real ClientSession; the outside source is played by the test through the seam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { fx } from "../packages/core/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearClienteChat } from "../features/chat/client.ts";
import { conEspejo } from "../features/espejo/server.ts";
import type { EnlaceEspejo, Peticion } from "../features/espejo/server.ts";
import { CADUCA_S, PETICIONES_POR_PERSONA } from "../features/espejo/feature.ts";
import { ESQUEMA } from "../features/espejo/esquema.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const agentes = signer("otra-clave-de-agentes-larga");
const llavero = (token: string): GuestKeeper => ({ load: () => token, save: () => {} });
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const ESPEJO = { schema: ESQUEMA, funciones: { cron: true, sesiones: false }, acciones: { "cron.pausar": "confirmar" }, zonas: [
  { id: "z7", nombre: "El reloj", centro: { x: 40, z: -10 }, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"] },
] };
const cron = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", x: 40, z: -10, acciones: ["cron.pausar", "cron.ejecutar"], ...extra });

function mundo(n: number, o: { sinFuente?: boolean } = {}) {
  const archivos = new Map<string, unknown>([["espejo.json", ESPEJO]]);
  const log: string[] = [], reloj = { ms: Date.parse("2026-11-05T10:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l));
  const inst: Instance = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a), agentes: { sign: agentes, nombre: (id: string) => (id === "lia" ? "Lía" : null) } });
  const entrar = (i: number, llave: GuestKeeper = keeper()) => {
    const t = inst.join(i), c = crearClienteChat(() => reloj.ms);
    const s = new ClientSession(t, { features: [c.part], identity: llave });
    const dicho: { event: string; msg: Record<string, unknown> }[] = [];
    s.features.tap((f, e, m) => { if (f === "espejo") dicho.push({ event: e, msg: m as Record<string, unknown> }); });
    return { t, s, chat: c.chat, dicho, ultimo: (ev: string) => dicho.filter((d) => d.event === ev).at(-1)?.msg };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { for (const p of gente) p.t.flush(); inst.tick(); for (const p of gente) p.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  const enlace = lista.find(conEspejo)!.enlace as EnlaceEspejo;
  const salidas: Peticion[] = [];
  if (!o.sinFuente) { enlace.alPedir((p) => salidas.push(p)); enlace.conectada(true); }
  pump(2);
  return { inst, gente, pump, poner, decir, log, enlace, salidas, entrar };
}
/** Two people at the clock; `dueno` has said /dueño <code>, `otro` has no role. Both stand 2 m from the thing. */
function dos() {
  const W = mundo(2);
  const [dueno, otro] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`);
  W.poner(dueno, 40, -8); W.poner(otro, 38, -10); W.pump(3);
  assert.equal(W.enlace.alta(cron("8bc0")).ok, true); W.pump(3);
  return { W, dueno, otro };
}
const pedir = (p: { s: ClientSession }, objeto: string, verbo: string) => p.s.features.send("espejo", "pedir", { objeto, verbo });

test("pedir: `@todos` (no role) asking to pause ⇒ `rechazado`, nothing goes out", () => {
  const { W, otro } = dos();
  assert.equal(pedir(otro, "cron/8bc0", "cron.pausar").ok, true); W.pump(3);
  assert.match(String(otro.ultimo("rechazado")?.motivo), /es cosa de quien dirige aquí o de quien manda/);
  assert.equal(W.salidas.length, 0);
  assert.equal(W.enlace.esperando(), 0);
});

test("pedir: the owner ⇒ a `peticion` leaves through the seam (unique id, who, safety from the file, expiry), the person hears «pedido»", () => {
  const { W, dueno } = dos();
  assert.equal(pedir(dueno, "cron/8bc0", "cron.pausar").ok, true); W.pump(3);
  assert.equal(W.salidas.length, 1);
  const p = W.salidas[0];
  assert.deepEqual([p.objeto, p.verbo, p.seguridad], ["cron/8bc0", "cron.pausar", "confirmar"], "the owner lowered pausar to confirmar in espejo.json");
  assert.match(p.id, /^p[0-9a-z]+-[0-9a-z]+$/); assert.ok(p.quien.id.length > 0 && p.quien.nombre.length > 0);
  assert.ok(p.caduca > W.inst.sim.tick && p.caduca - W.inst.sim.tick <= CADUCA_S * TICK_HZ, "expires within CADUCA_S seconds of the tick it was asked");
  assert.equal(W.enlace.esperando(), 1);
  assert.match(String(dueno.ultimo("pedido")?.texto), /Pedido «cron\.pausar» sobre «Tarea 8bc0»/);
  assert.equal(dueno.ultimo("rechazado"), undefined);
  // a verb that asks for more (ejecutar) carries the default safety: aprobar
  pedir(dueno, "cron/8bc0", "cron.ejecutar"); W.pump(3);
  assert.equal(W.salidas[1].seguridad, "aprobar");
});

test("pedir: `resultado` closes the request and tells only the asker; an unknown or repeated id is ignored", () => {
  const { W, dueno, otro } = dos();
  pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(3);
  const id = W.salidas[0].id;
  assert.equal(W.enlace.resultado("nada", true, "x"), false);
  assert.equal(W.enlace.resultado(id, true, "Tarea en pausa.\n<b>listo</b>"), true); W.pump(3);
  assert.equal(W.enlace.esperando(), 0);
  const r = dueno.ultimo("resultado")!;
  assert.deepEqual([r.ok, r.verbo, r.objeto], [true, "cron.pausar", "cron/8bc0"]);
  assert.equal(String(r.texto).includes("\n"), false, "the text from outside is cleaned");
  assert.equal(otro.ultimo("resultado"), undefined, "the other person heard nothing");
  assert.equal(W.enlace.resultado(id, true, "otra vez"), false, "already closed");
  // a failure also reaches the asker
  pedir(dueno, "cron/8bc0", "cron.reanudar"); W.pump(3); // not offered by this thing ⇒ rejected, nothing waits
  assert.equal(W.enlace.esperando(), 0);
  pedir(dueno, "cron/8bc0", "cron.ejecutar"); W.pump(3);
  W.enlace.resultado(W.salidas.at(-1)!.id, false, "El aprobador de Hermes dijo que no."); W.pump(3);
  assert.deepEqual([dueno.ultimo("resultado")!.ok, dueno.ultimo("resultado")!.texto], [false, "El aprobador de Hermes dijo que no."]);
});

test("pedir: no answer in 30 s ⇒ it expires, the person hears «Hermes no ha respondido», and a late answer is ignored", () => {
  const { W, dueno } = dos();
  pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(3);
  const id = W.salidas[0].id;
  W.pump(CADUCA_S * TICK_HZ - 20);
  assert.equal(W.enlace.esperando(), 1, "still waiting just before the 30 s");
  W.pump(40);
  assert.equal(W.enlace.esperando(), 0);
  const r = dueno.ultimo("resultado")!;
  assert.deepEqual([r.ok], [false]); assert.match(String(r.texto), /Hermes no ha respondido a tiempo/);
  assert.equal(W.enlace.resultado(id, true, "tarde"), false, "a late answer finds nobody waiting");
});

test("pedir: far away, wrong verb, unknown verb, unknown thing — each says why and sends nothing", () => {
  const { W, dueno } = dos();
  const motivo = () => String(dueno.ultimo("rechazado")?.motivo);
  const probar = (objeto: string, verbo: string, re: RegExp) => { dueno.dicho.length = 0; pedir(dueno, objeto, verbo); W.pump(TICK_HZ + 2); assert.match(motivo(), re); }; // one a second: the intent's own rate (1/s) is not what is under test
  W.poner(dueno, 0, 40); W.pump(3);
  probar("cron/8bc0", "cron.pausar", /demasiado lejos/);
  W.poner(dueno, 40, -8); W.pump(3);
  probar("cron/8bc0", "cron.reanudar", /no ofrece la acción «cron\.reanudar»/);
  probar("cron/8bc0", "cron.borrar-todo", /no es una acción que conozca/);
  probar("cron/no-existe", "cron.pausar", /ya no está en el mundo/);
  assert.equal(W.salidas.length, 0);
});

test("pedir: a thing of a function that is OFF was never placed, so asking for it is refused as «ya no está»", () => {
  // espejo.json here has sesiones OFF
  const { W, dueno } = dos();
  assert.equal(W.enlace.alta({ tipo: "sesion", id: "s1", titulo: "Charla", zona: "z7" }).ok, false);
  pedir(dueno, "sesion/s1", "sesion.nueva"); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /ya no está en el mundo/);
  assert.equal(W.salidas.length, 0);
});

test("pedir: a verb of a thing is only valid if the thing offers it, even when the verb exists for another function (sesion.nueva on a cron)", () => {
  const { W, dueno } = dos();
  pedir(dueno, "cron/8bc0", "sesion.nueva"); W.pump(3);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /no ofrece la acción «sesion\.nueva»/);
  assert.equal(W.salidas.length, 0);
});

test("pedir: without a connected source nothing goes out and the person is told; when it connects, it works", () => {
  const W = mundo(1, { sinFuente: true });
  const [dueno] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`); W.poner(dueno, 40, -8); W.pump(3);
  W.enlace.alta(cron("8bc0")); W.pump(3);
  pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(3);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /fuente de fuera no está conectada/);
  W.enlace.alPedir((p) => W.salidas.push(p)); W.enlace.conectada(true); W.pump(3);
  assert.match(String(dueno.ultimo("aviso")?.texto), /se ha conectado/);
  pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(3);
  assert.equal(W.salidas.length, 1);
  // the source drops: what waited is closed with «no sé si se hizo»
  W.enlace.conectada(false); W.pump(3);
  assert.equal(W.enlace.esperando(), 0);
  assert.match(String(dueno.ultimo("resultado")?.texto), /conexión con la fuente se cortó/);
});

test("pedir: rate limit and per-person cap — a flood is refused; the cap of waiting requests says so", () => {
  const { W, dueno } = dos();
  for (let i = 0; i < PETICIONES_POR_PERSONA + 1; i++) { pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(TICK_HZ + 2); } // slow enough for the rate limit, so the CAP is what stops it
  assert.equal(W.salidas.length, PETICIONES_POR_PERSONA);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /Ya tiene 3 peticiones esperando/);
  // a burst faster than the intent's own rate is dropped by the engine before the piece (no extra requests)
  const antes = W.salidas.length;
  for (let i = 0; i < 40; i++) pedir(dueno, "cron/8bc0", "cron.ejecutar");
  W.pump(3);
  assert.equal(W.salidas.length, antes, "nothing more goes out: capped and rate-limited");
});

test("pedir: a person who leaves takes their waiting requests with them", () => {
  const { W, dueno } = dos();
  pedir(dueno, "cron/8bc0", "cron.pausar"); W.pump(3);
  assert.equal(W.enlace.esperando(), 1);
  W.inst.disconnect(dueno.s.entity); W.pump(3);
  assert.equal(W.enlace.esperando(), 0);
});

test("usar: near the thing you are told, only you, what it is, how it is and what can be asked; far away you are refused", () => {
  const { W, dueno, otro } = dos();
  assert.equal(otro.s.features.send("espejo", "usar", { objeto: "cron/8bc0" }).ok, true); W.pump(3);
  assert.match(String(otro.ultimo("ficha")?.texto), /^Tarea 8bc0: programado\. Se le puede pedir: cron\.pausar, cron\.ejecutar\.$/);
  assert.equal(dueno.ultimo("ficha"), undefined, "only the one who looked is told");
  W.poner(otro, 0, 40); W.pump(3);
  otro.s.features.send("espejo", "usar", { objeto: "cron/8bc0" }); W.pump(3);
  assert.match(String(otro.ultimo("rechazado")?.motivo), /demasiado lejos/);
  // looking needs no permission and sends nothing outside
  assert.equal(W.salidas.length, 0);
});

test("pedir: an AI inhabitant cannot ask even if the world gave it the owner's role (STD-050: what people write never reaches Hermes through an AI)", () => {
  const W = mundo(1);
  const [a] = W.gente;
  const lia = W.entrar(5, llavero(emitirAgente(agentes, "lia", today())));
  W.gente.push(lia); W.pump(4);
  assert.equal(W.inst.who(lia.s.entity)?.id, "ia-lia");
  W.decir(a, `/dueño ${ADMIN}`); W.decir(lia, `/dueño ${ADMIN}`);
  W.poner(a, 40, -8); W.poner(lia, 38, -10); W.pump(3);
  W.enlace.alta(cron("8bc0")); W.pump(3);
  pedir(lia, "cron/8bc0", "cron.pausar"); W.pump(TICK_HZ + 2);
  assert.match(String(lia.ultimo("rechazado")?.motivo), /Solo una persona identificada/);
  assert.equal(W.salidas.length, 0, "the AI's request never left");
  pedir(a, "cron/8bc0", "cron.pausar"); W.pump(3);
  assert.equal(W.salidas.length, 1, "the person (owner) can");
  // looking is allowed to anyone near, an AI included (it only reads)
  lia.s.features.send("espejo", "usar", { objeto: "cron/8bc0" }); W.pump(TICK_HZ + 2);
  assert.match(String(lia.ultimo("ficha")?.texto), /^Tarea 8bc0/);
});
