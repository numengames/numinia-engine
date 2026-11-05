// mundo-hermes · M2: the client side of the espejo and the seeded layout of the Hermes template.
//   · plantillas/hermes/entorno/espejo.json is valid, ONLY `salud` is on, the six zones are there and `vistaPublica` tells the page just what it needs
//   · things that come WITHOUT x/z are laid on their zone's grid (the first at the centre), keep their slot, and the world's own switch panel
//     (salud/panel) is never removed or replaced by the source
//   · the page draws a flat shape by `tipo` in the house language of states (off/starting/on/fail), with the Spanish label, follows a change, takes it away,
//     and touching (`usar` → card, `pedir` → pedido → resultado) works through the controller
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { ViewHooks } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { fx } from "../packages/core/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearCliente as crearClienteChat } from "../features/chat/client.ts";
import { conEspejo } from "../features/espejo/server.ts";
import type { EnlaceEspejo, Peticion } from "../features/espejo/server.ts";
import { leerEspejo, vistaPublica } from "../features/espejo/esquema.ts";
import { crearCliente, estadoDeForma, manoDe, TEXTO_ESTADO } from "../features/espejo/client.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const PLANTILLA = JSON.parse(readFileSync(new URL("../plantillas/hermes/entorno/espejo.json", import.meta.url), "utf8"));
const conCron = { ...PLANTILLA, funciones: { ...PLANTILLA.funciones, cron: true, sesiones: true } };
const cron = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", acciones: ["cron.pausar"], ...extra });

test("the template's espejo.json is valid, has the six zones and ONLY salud is on", () => {
  const r = leerEspejo(PLANTILLA);
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(r.value.zonas.map((z) => z.id), ["z0", "z7", "z3", "z8", "z6", "z2"]);
  assert.deepEqual(Object.entries(r.value.funciones).filter(([, on]) => on).map(([f]) => f), ["salud"]);
  const v = vistaPublica(r.value)!;
  assert.deepEqual(v.funciones, { salud: true, cron: false, sesiones: false, chat: false, perfiles: false, uso: false });
  assert.equal(v.zonas.length, 6);
  assert.deepEqual(Object.keys(v.zonas[0]).sort(), ["ancho", "cartel", "fondo", "id", "nombre", "tipos", "x", "z"], "no keys, no verbs, no source: only what draws the floors");
  assert.equal(vistaPublica({ ...r.value, activa: false }), null);
});

// the zones of the template must not overlap each other (the floors are drawn side by side)
test("the template's zone rectangles do not overlap and the new ones carry their own names", () => {
  const r = leerEspejo(PLANTILLA); assert.ok(r.ok); if (!r.ok) return;
  const zs = r.value.zonas;
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
    const a = zs[i], b = zs[j], sepX = Math.abs(a.x - b.x) >= (a.ancho + b.ancho) / 2, sepZ = Math.abs(a.z - b.z) >= (a.fondo + b.fondo) / 2;
    assert.ok(sepX || sepZ, `${a.id} and ${b.id} overlap`);
  }
  assert.deepEqual(zs.filter((z) => z.id === "z6" || z.id === "z2").map((z) => [z.id, z.nombre, z.tipos.join()]), [["z6", "La torre de control", "perfil"], ["z2", "La sala de máquinas", "uso"]]);
});

function mundo(n: number, espejo: unknown, o: { clientes?: ReturnType<typeof crearCliente>[]; vistas?: ViewHooks[] } = {}) {
  const archivos = new Map<string, unknown>([["espejo.json", espejo]]);
  const log: string[] = [], reloj = { ms: Date.parse("2026-11-05T10:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l));
  const inst: Instance = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a) });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearClienteChat(() => reloj.ms), e = o.clientes?.[i];
    const s = new ClientSession(t, { features: [c.part, ...(e ? e.parts : [])], identity: keeper(), view: o.vistas?.[i] });
    return { t, s, chat: c.chat };
  });
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { for (const p of gente) p.t.flush(); inst.tick(); for (const p of gente) p.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const enlace = lista.find(conEspejo)!.enlace as EnlaceEspejo;
  const salidas: Peticion[] = [];
  enlace.alPedir((p) => salidas.push(p)); enlace.conectada(true);
  pump(2);
  return { inst, gente, pump, poner, enlace, salidas, reloj };
}
const lugar = (W: ReturnType<typeof mundo>, k: string) => { const v = W.gente[0].s.features.stateOf("espejo").get(k); return v ? [Number(v.x), Number(v.z)] : null; };

test("things without x/z are laid on the zone's grid, the first at the centre; a slot is kept through cambio and lote and freed by baja", () => {
  const W = mundo(1, conCron);
  W.poner(W.gente[0], 30, 0); W.pump(3);
  assert.deepEqual(W.enlace.lote([cron("a"), cron("b"), cron("c")]), { ok: true, puestas: 3, quitadas: 0 }); W.pump(4);
  const [a, b, c] = ["a", "b", "c"].map((i) => lugar(W, `cron/${i}`)!);
  assert.deepEqual(a, [30, 0], "the first one at the zone's centre");
  assert.equal(new Set([a, b, c].map(String)).size, 3, "no two on the same spot");
  for (const [x, z] of [a, b, c]) assert.ok(Math.abs(x - 30) <= 12 && Math.abs(z) <= 8, `inside the zone: ${x},${z}`);
  W.enlace.cambio(cron("b", { estado: "pausado", acciones: ["cron.reanudar"] })); W.pump(3);
  assert.deepEqual(lugar(W, "cron/b"), b, "a change does not move it");
  W.enlace.lote([cron("c"), cron("b"), cron("a")]); W.pump(3); // same things, other order: nobody moves
  assert.deepEqual([lugar(W, "cron/a"), lugar(W, "cron/b"), lugar(W, "cron/c")], [a, b, c]);
  W.enlace.baja({ tipo: "cron", id: "a" }); W.enlace.alta(cron("d")); W.pump(3);
  assert.deepEqual(lugar(W, "cron/d"), a, "the freed slot is the next one used");
  W.enlace.alta(cron("e", { x: 33, z: 2 })); W.pump(3);
  assert.deepEqual(lugar(W, "cron/e"), [33, 2], "a source that DOES say where keeps its place");
});

test("the switch panel (salud/panel) is the world's own: it sits on the threshold, says what is on and off, and the source can neither remove nor replace it", () => {
  const W = mundo(1, PLANTILLA);
  W.poner(W.gente[0], 0, -4); W.pump(3);
  const s = W.gente[0].s.features.stateOf("espejo");
  const p = s.get("salud/panel")!;
  assert.ok(p, "the panel is there from the start");
  assert.equal(p.titulo, "Panel de interruptores");
  assert.equal(p.subtitulo, "Encendido: salud. Apagado: cron, sesiones, chat, perfiles, uso.");
  assert.deepEqual([p.zona, p.x, p.z], ["z0", 0, -4.5]);
  assert.equal(W.enlace.lote([]).ok, true); W.pump(3);
  assert.ok(s.get("salud/panel"), "an empty lote from the source leaves the panel");
  const intento = W.enlace.alta({ tipo: "salud", id: "panel", titulo: "Falso", zona: "z0" });
  assert.equal(intento.ok, false); if (!intento.ok) assert.match(intento.motivo, /es de este mundo/);
  assert.equal(W.enlace.baja({ tipo: "salud", id: "panel" }).ok, false); W.pump(3);
  assert.ok(s.get("salud/panel"), "nor can it be taken away");
});

/** A view that records what the page asked to draw. */
function vistaGrabadora() {
  const formas = new Map<string, Record<string, unknown>>(), tags = new Map<string, Record<string, unknown>>();
  const view = { label() {}, bounce() {}, forma: (k: string, f: Record<string, unknown> | null) => { if (f) formas.set(k, f); else formas.delete(k); }, tag: (k: string, t: Record<string, unknown> | null) => { if (t) tags.set(k, t); else tags.delete(k); } } as unknown as ViewHooks;
  return { view, formas, tags };
}

test("the page draws a flat shape by tipo in the house language of states, with its Spanish label, follows a change and takes it away", () => {
  assert.deepEqual([["cron", "programado"], ["cron", "pausado"], ["cron", "activo"], ["cron", "fallo"], ["sesion", "activo"], ["sesion", "apagado"]].map(([t, e]) => estadoDeForma(t, e as never)), ["on", "off", "starting", "fail", "on", "off"]);
  assert.equal(manoDe("cron/a"), manoDe("cron/a")); assert.notEqual(manoDe("cron/a"), manoDe("cron/b"));
  const g = vistaGrabadora(), pagina = crearCliente();
  pagina.espejo.configurar(vistaPublica(leerEspejo(conCron).ok ? (leerEspejo(conCron) as { ok: true; value: never }).value : (null as never)));
  const W = mundo(1, conCron, { clientes: [pagina], vistas: [g.view] });
  W.poner(W.gente[0], 30, 0); W.pump(3);
  assert.ok(g.formas.get("espejo:zona:z7"), "the zone's floor is drawn when the page knows the zones");
  assert.equal(g.formas.get("espejo:zona:z7")!.discontinuo, false, "cron is on: solid edge"); assert.equal(g.formas.get("espejo:zona:z3")!.discontinuo, false);
  assert.equal(g.formas.get("espejo:zona:z8")!.discontinuo, true, "chat is off: dashed edge");
  assert.equal(g.formas.get("espejo:salud/panel")!.forma, "losa");
  assert.deepEqual(g.formas.get("espejo:salud/panel")!.luces, [true, true, true, false, false, false], "one lamp per switch: salud, cron, sesiones, chat, perfiles, uso");
  W.enlace.lote([cron("8bc0"), { tipo: "sesion", id: "s1", titulo: "Charla con Hermes", estado: "activo", zona: "z3" }]); W.pump(4);
  const reloj = g.formas.get("espejo:cron/8bc0")!, cubo = g.formas.get("espejo:sesion/s1")!;
  assert.deepEqual([reloj.forma, reloj.estado], ["reloj", "on"]); assert.deepEqual([cubo.forma, cubo.estado], ["cubo", "on"]);
  assert.deepEqual([g.tags.get("espejo:cron/8bc0")!.text, g.tags.get("espejo:cron/8bc0")!.sub], ["Tarea 8bc0", TEXTO_ESTADO.programado], "the label is the card's name and the state in Spanish");
  assert.equal(reloj.rumbo, 0, "everything faces +z: the way a visitor looks when it arrives (the default view)");
  W.enlace.cambio(cron("8bc0", { estado: "pausado", acciones: ["cron.reanudar"] })); W.pump(3);
  assert.equal(g.formas.get("espejo:cron/8bc0")!.estado, "off", "paused = outline");
  assert.equal(g.tags.get("espejo:cron/8bc0")!.sub, "en pausa");
  W.enlace.baja({ tipo: "cron", id: "8bc0" }); W.pump(3);
  assert.equal(g.formas.has("espejo:cron/8bc0") || g.tags.has("espejo:cron/8bc0"), false, "taken away");
});

test("touching: usar ⇒ the card (alone), pedir by the owner ⇒ pedido ⇒ resultado in Spanish; nobody answers ⇒ «no ha respondido» after 30 s", () => {
  const pagina = crearCliente();
  const W = mundo(1, conCron, { clientes: [pagina], vistas: [vistaGrabadora().view] });
  const yo = W.gente[0];
  assert.deepEqual(yo.chat.decir(`/dueño ${ADMIN}`), { ok: true }); W.pump(TICK_HZ + 2);
  W.poner(yo, 30, 2); W.enlace.lote([cron("8bc0", { subtitulo: "cada día a las 9" })]); W.pump(4);
  const e = pagina.espejo;
  assert.equal(e.cosas().find((c) => c.clave === "cron/8bc0")?.acciones[0], "cron.pausar");
  assert.deepEqual(e.usar("cron/8bc0"), { ok: true }); W.pump(3);
  assert.match(e.estado.ficha!.texto, /Tarea 8bc0: programado\..*Se le puede pedir: cron\.pausar/);
  assert.deepEqual(e.pedir("cron/8bc0", "cron.pausar"), { ok: true }); W.pump(3);
  assert.equal(W.salidas.length, 1); assert.equal(W.salidas[0].verbo, "cron.pausar");
  assert.match(e.estado.pedido!.texto, /Pedido «cron\.pausar»/);
  W.enlace.resultado(W.salidas[0].id, true, "Tarea en pausa."); W.pump(3);
  assert.deepEqual([e.estado.resultado!.ok, e.estado.resultado!.texto], [true, "Tarea en pausa."]);
  assert.equal(e.estado.pedido, null);
  e.pedir("cron/8bc0", "cron.pausar"); W.pump(3); W.pump(30 * TICK_HZ + 2);
  assert.deepEqual([e.estado.resultado!.ok, e.estado.resultado!.texto], [false, "Hermes no ha respondido a tiempo: no sé si se hizo."]);
  e.pedir("cron/8bc0", "cron.borrar"); W.pump(3);
  assert.match(e.estado.rechazo, /no es una acción que conozca/);
});

test("a fresh Hermes world with perfiles and uso switched on takes a lote of 14 perfil + 1 uso without x/z and lays them on the 4 m grid, no overlap, inside their zones", () => {
  const conTodo = { ...PLANTILLA, funciones: { ...PLANTILLA.funciones, perfiles: true, uso: true } };
  const W = mundo(1, conTodo);
  const perfil = (i: number) => ({ tipo: "perfil", id: `p${i}`, titulo: `Perfil ${i}`, estado: i % 3 === 0 ? "activo" : "programado", zona: "z6", acciones: [] });
  const uso = { tipo: "uso", id: "total", titulo: "Uso total", subtitulo: "33,8 M tokens · $1,654.69 est.", estado: "activo", zona: "z2", acciones: [] };
  const lote = [...Array.from({ length: 14 }, (_, i) => perfil(i)), uso];
  assert.deepEqual(W.enlace.lote(lote), { ok: true, puestas: 15, quitadas: 0 });
  W.poner(W.gente[0], 30, -30); W.pump(4);
  const ps = Array.from({ length: 14 }, (_, i) => lugar(W, `perfil/p${i}`)!);
  assert.ok(ps.every(Boolean), "all 14 are in the world");
  assert.deepEqual(ps[0], [30, -30], "the first stands at the zone's centre");
  for (const [x, z] of ps) assert.ok(Math.abs(x - 30) <= 12 && Math.abs(z + 30) <= 12, `inside z6: ${x},${z}`);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]) >= 4 - 1e-9, `profiles ${i} and ${j} are closer than 4 m`);
  for (const [x, z] of ps) { assert.equal(Math.abs((x - 30) % 4), 0); assert.equal(Math.abs((z + 30) % 4), 0); }
  assert.deepEqual(lugar(W, "uso/total"), [-30, -30], "the meter at the centre of the machine room");
  // a second lote with the same things in another order moves nobody
  W.enlace.lote([...lote].reverse()); W.pump(3);
  assert.deepEqual(Array.from({ length: 14 }, (_, i) => lugar(W, `perfil/p${i}`)), ps);
});

test("with perfiles and uso off (the template as shipped) their things are refused, so a fresh world shows nothing of them", () => {
  const W = mundo(1, PLANTILLA);
  const r = W.enlace.alta({ tipo: "perfil", id: "a", titulo: "A", zona: "z6" });
  assert.equal(r.ok, false); assert.match(r.ok ? "" : r.motivo, /apagada/);
  assert.equal(W.enlace.alta({ tipo: "uso", id: "u", titulo: "U", zona: "z2" }).ok, false);
});
