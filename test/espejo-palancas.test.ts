// mundo-hermes · lane M3 story 1: the switch panel's lamps are controls. `encender { funcion, activa }` flips `funciones.<funcion>` of
// entorno/espejo.json from INSIDE the world: only an identified person who directs or rules, a known function, the whole new file checked
// with the schema before it is written (atomically), applied live without a restart, the things of a function switched off leave the world,
// everyone hears it and the source is told (`funciones` frame). Bad cases: unknown name, non-owner, an AI with the owner's role, a file broken
// by hand, a write that fails. A world WITHOUT espejo.json stays byte-identical. Headless: real Instance + real ClientSession.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { escribirMundo, leerMundo } from "../packages/server/src/mundo.ts";
import { fx } from "../packages/core/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { stateHash } from "../packages/sim/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearCliente as crearClienteChat } from "../features/chat/client.ts";
import { crearCliente as crearClienteEspejo } from "../features/espejo/client.ts";
import { conEspejo } from "../features/espejo/server.ts";
import type { EnlaceEspejo, Peticion } from "../features/espejo/server.ts";
import { ESQUEMA, FUNCIONES, leerEspejo, vistaPublica } from "../features/espejo/esquema.ts";

const sign = signer("una-clave-de-prueba-larga");
const agentes = signer("otra-clave-de-agentes-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const llavero = (token: string): GuestKeeper => ({ load: () => token, save: () => {} });
const ESPEJO = {
  schema: ESQUEMA, activa: true, notas: "una nota que debe sobrevivir",
  funciones: { salud: true, cron: false, sesiones: false },
  zonas: [
    { id: "z0", nombre: "El umbral", centro: { x: 0, z: 0 }, ancho: 20, fondo: 14, alto: 4, tipos: ["salud"] },
    { id: "z7", nombre: "El reloj", centro: { x: 30, z: 0 }, ancho: 24, fondo: 16, alto: 6, tipos: ["cron"] },
    { id: "z3", nombre: "Las sesiones", centro: { x: -30, z: 0 }, ancho: 24, fondo: 16, alto: 6, tipos: ["sesion"] },
  ],
  acciones: { "cron.pausar": "confirmar" },
};
const cron = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", x: 30, z: 0, acciones: ["cron.pausar"], ...extra });

type Opciones = { escribir?: (f: string, d: unknown, o?: { nuevo?: boolean }) => void; archivos?: Map<string, unknown> };
function mundo(n: number, o: Opciones = {}) {
  const archivos = o.archivos ?? new Map<string, unknown>([["espejo.json", structuredClone(ESPEJO)]]);
  const escritos: { fichero: string; datos: unknown }[] = [];
  const escribir = o.escribir ?? ((fichero: string, datos: unknown) => { escritos.push({ fichero, datos: structuredClone(datos) }); archivos.set(fichero, structuredClone(datos)); });
  const log: string[] = [], reloj = { ms: Date.parse("2026-11-05T10:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l), escribir);
  const inst: Instance = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a), agentes: { sign: agentes, nombre: (id: string) => (id === "lia" ? "Lía" : null) } });
  const entrar = (i: number, llave: GuestKeeper = keeper()) => {
    const t = inst.join(i), c = crearClienteChat(() => reloj.ms), e = crearClienteEspejo();
    const cfg = leerEspejo(ESPEJO);
    if (cfg.ok) e.espejo.configurar(vistaPublica(cfg.value));
    const s = new ClientSession(t, { features: [c.part, ...e.parts], identity: llave });
    const dicho: { event: string; msg: Record<string, unknown> }[] = [];
    s.features.tap((f, ev, m) => { if (f === "espejo") dicho.push({ event: ev, msg: m as Record<string, unknown> }); });
    return { t, s, chat: c.chat, espejo: e.espejo, dicho, ultimo: (ev: string) => dicho.filter((d) => d.event === ev).at(-1)?.msg };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { for (const p of gente) p.t.flush(); inst.tick(); for (const p of gente) p.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  const enlace = lista.find(conEspejo)!.enlace as EnlaceEspejo;
  const salidas: Peticion[] = [], frames: string[][] = [];
  enlace.alPedir((p) => salidas.push(p)); enlace.alFunciones?.((f) => frames.push(f)); enlace.conectada(true);
  pump(2);
  return { inst, gente, pump, poner, decir, log, enlace, salidas, frames, archivos, escritos, entrar };
}
const encender = (p: { s: ClientSession }, funcion: string, activa: boolean) => p.s.features.send("espejo", "encender", { funcion, activa });
const estado = (W: ReturnType<typeof mundo>) => W.gente[0].s.features.stateOf("espejo");
const funcionesDe = (W: ReturnType<typeof mundo>) => (W.archivos.get("espejo.json") as { funciones: Record<string, boolean> }).funciones;

test("encender: the owner switches «cron» on — written to espejo.json (every other key kept), applied live, heard by everyone, told to the source", () => {
  const W = mundo(2);
  const [dueno, otro] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`); W.pump(3);
  assert.equal(dueno.espejo.interruptor.estado.puede, true, "the owner is told they may (permiso)");
  assert.equal(otro.espejo.interruptor.estado.puede, false, "and the other person is told they may not");
  assert.equal(W.enlace.alta(cron("a")).ok, false, "cron starts off: its things are refused");
  assert.deepEqual(estado(W).get("salud/panel")?.subtitulo, "Encendido: salud. Apagado: cron, sesiones.");
  assert.equal(dueno.espejo.interruptor.poner(true, "cron").ok, true); W.pump(4);
  // the file: one key changed, the rest verbatim
  assert.equal(W.escritos.length, 1);
  const w = W.escritos[0].datos as typeof ESPEJO;
  assert.equal(W.escritos[0].fichero, "espejo.json");
  assert.deepEqual(w.funciones, { salud: true, cron: true, sesiones: false });
  assert.equal(w.notas, ESPEJO.notas); assert.deepEqual(w.zonas, ESPEJO.zonas); assert.deepEqual(w.acciones, ESPEJO.acciones); assert.equal(w.schema, ESQUEMA);
  assert.equal(leerEspejo(w).ok, true, "what was written is a valid file");
  // live: no restart
  assert.deepEqual(W.enlace.funciones(), ["salud", "cron"]);
  assert.equal(W.enlace.alta(cron("a")).ok, true); W.pump(3);
  assert.ok(estado(W).get("cron/a"));
  assert.equal(estado(W).get("salud/panel")?.subtitulo, "Encendido: salud, cron. Apagado: sesiones.", "the panel says what is on and off");
  // everyone hears it; the page's lamps follow
  for (const p of W.gente) assert.deepEqual([p.ultimo("funcion")?.funcion, p.ultimo("funcion")?.activa], ["cron", true]);
  assert.equal(otro.espejo.interruptor.activa("cron"), true, "the other page's lamp follows the event");
  assert.equal(otro.espejo.vista()!.funciones.cron, true);
  // the source is told the new full list
  assert.deepEqual(W.frames, [["salud", "cron"]]);
  assert.ok(W.log.some((l) => /enciende la función «cron»/.test(l)));
});

test("encender: switching OFF removes the things of that function, closes what waited on them, keeps the panel (to switch back on) and the file's data; on again accepts them", () => {
  const W = mundo(1, { archivos: new Map([["espejo.json", { ...structuredClone(ESPEJO), funciones: { salud: true, cron: true, sesiones: false } }]]) });
  const [dueno] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`); W.poner(dueno, 30, 2); W.pump(3);
  assert.equal(W.enlace.alta(cron("a")).ok, true); W.pump(3);
  dueno.s.features.send("espejo", "pedir", { objeto: "cron/a", verbo: "cron.pausar" }); W.pump(3);
  assert.equal(W.enlace.esperando(), 1);
  assert.equal(encender(dueno, "cron", false).ok, true); W.pump(4);
  assert.equal(estado(W).get("cron/a"), undefined, "the clock left the world");
  assert.equal(W.enlace.esperando(), 0, "the request that waited on it is closed");
  assert.match(String(dueno.ultimo("resultado")?.texto), /función se apagó/);
  assert.equal(funcionesDe(W).cron, false);
  assert.ok(estado(W).get("salud/panel"), "the panel stays: its lamps are how the world is switched back on");
  assert.equal(estado(W).get("salud/panel")?.subtitulo, "Encendido: salud. Apagado: cron, sesiones.");
  const rechazada = W.enlace.alta(cron("a")); assert.equal(rechazada.ok, false);
  assert.deepEqual(W.frames.at(-1), ["salud"]);
  // the zones in the file are untouched ("saved data" stays) and switching on again works
  assert.equal(((W.archivos.get("espejo.json") as typeof ESPEJO).zonas).length, 3);
  assert.equal(encender(dueno, "cron", true).ok, true); W.pump(4);
  assert.equal(W.enlace.alta(cron("a")).ok, true);
});

test("encender: «salud» off keeps the panel and on again works even from a file that started with salud off (the panel is made then)", () => {
  const W = mundo(1, { archivos: new Map([["espejo.json", { ...structuredClone(ESPEJO), funciones: { salud: false } }]]) });
  const [dueno] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`);
  assert.equal(estado(W).get("salud/panel"), undefined, "salud off at start: no panel");
  assert.equal(dueno.espejo.interruptor.poner(true).ok, true); W.pump(4);
  assert.ok(estado(W).get("salud/panel"), "salud on: the panel appears");
  assert.equal(encender(dueno, "salud", false).ok, true); W.pump(4);
  assert.ok(estado(W).get("salud/panel"), "salud off again: the panel stays");
});

test("encender (bad): not the owner, an AI with the owner's role, an unknown name, no change at all — each says why and writes nothing", () => {
  const W = mundo(2);
  const [dueno, otro] = W.gente;
  const lia = W.entrar(5, llavero(emitirAgente(agentes, "lia", today())));
  W.gente.push(lia); W.pump(4);
  W.decir(dueno, `/dueño ${ADMIN}`); W.decir(lia, `/dueño ${ADMIN}`);
  assert.equal(lia.espejo.interruptor.estado.puede, false, "an AI is not told it may");
  encender(otro, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(otro.ultimo("rechazado")?.motivo), /cosa de una persona identificada que dirige aquí o manda/);
  encender(lia, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(lia.ultimo("rechazado")?.motivo), /persona identificada/);
  encender(dueno, "reactor", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /no es una función que conozca \(son: salud, cron/);
  encender(dueno, "", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /no es una función que conozca/);
  encender(dueno, "salud", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /ya está encendida/);
  assert.equal(W.escritos.length, 0, "nothing was written");
  assert.equal(W.frames.length, 0, "the source was told nothing");
  assert.equal(W.enlace.alta(cron("a")).ok, false, "and cron is still off");
  assert.equal(otro.dicho.some((d) => d.event === "funcion"), false, "nobody heard a change");
  // the interruptor's own rejection is what the Entorno panel shows
  dueno.espejo.interruptor.estado.ultimoRechazo = "";
  assert.equal(dueno.espejo.interruptor.poner(true, "salud").ok, true); W.pump(TICK_HZ + 2);
  assert.match(dueno.espejo.interruptor.estado.ultimoRechazo, /ya está encendida/);
});

test("encender (bad): a file somebody broke by hand is never replaced; a file the schema would refuse is never written; the good one stays", () => {
  const W = mundo(1);
  const [dueno] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`);
  // (a) unreadable now (leerMundo says undefined for a file that is not JSON)
  W.archivos.delete("espejo.json");
  encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /no se puede leer ahora o no es un objeto JSON/);
  // (b) not an object
  W.archivos.set("espejo.json", ["roto"]);
  encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /no es un objeto JSON/);
  assert.deepEqual(W.archivos.get("espejo.json"), ["roto"], "left as found");
  // (c) funciones is not an object
  W.archivos.set("espejo.json", { ...ESPEJO, funciones: [1] });
  encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /«funciones» no es un objeto/);
  // (d) the file has an error elsewhere: the whole result is checked, so it is refused and not written
  const mala = { ...structuredClone(ESPEJO), zonas: [{ id: "Z!", nombre: "", centro: 1 }] };
  W.archivos.set("espejo.json", mala);
  encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /tiene un error \(espejo\.zonas\[0\]/);
  assert.deepEqual(W.archivos.get("espejo.json"), mala, "the broken file is not touched either");
  assert.equal(W.escritos.length, 0);
  assert.equal(W.enlace.funciones().includes("cron"), false, "and nothing changed live");
});

test("encender (bad): a write that fails changes nothing — not the file, not the world, not the source", () => {
  const W = mundo(1, { escribir: () => { throw Object.assign(new Error("disco lleno"), { code: "ENOSPC" }); } });
  const [dueno] = W.gente;
  W.decir(dueno, `/dueño ${ADMIN}`);
  encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
  assert.match(String(dueno.ultimo("rechazado")?.motivo), /No he podido guardar espejo\.json \(ENOSPC/);
  assert.equal(W.enlace.alta(cron("a")).ok, false, "cron is still off in the live world");
  assert.deepEqual(W.enlace.funciones(), ["salud"]);
  assert.equal(W.frames.length, 0);
  assert.equal(dueno.dicho.some((d) => d.event === "funcion"), false);
  assert.ok(W.log.some((l) => /no pude escribir espejo\.json: disco lleno/.test(l)));
  assert.deepEqual((W.archivos.get("espejo.json") as typeof ESPEJO).funciones, ESPEJO.funciones, "the good file stays");
});

test("encender with a real world folder: atomic write (no temp file left), schema-valid, and a broken file on disk is not overwritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "palancas-"));
  try {
    writeFileSync(join(dir, "espejo.json"), JSON.stringify(ESPEJO, null, 2));
    const log: string[] = [], leer = leerMundo(dir, (l) => log.push(l));
    const archivos = { get: (f: string) => leer(f) } as unknown as Map<string, unknown>;
    const W = mundo(1, { archivos, escribir: escribirMundo(dir, (l) => log.push(l)) });
    const [dueno] = W.gente;
    W.decir(dueno, `/dueño ${ADMIN}`);
    encender(dueno, "sesiones", true); W.pump(TICK_HZ + 2);
    const en = JSON.parse(readFileSync(join(dir, "espejo.json"), "utf8"));
    assert.deepEqual(en.funciones, { salud: true, cron: false, sesiones: true });
    assert.equal(en.notas, ESPEJO.notas);
    assert.deepEqual(readdirSync(dir), ["espejo.json"], "no temp file is left behind");
    assert.equal(leerEspejo(en).ok, true);
    // somebody breaks it by hand while the world runs
    writeFileSync(join(dir, "espejo.json"), "{ esto no es json");
    encender(dueno, "cron", true); W.pump(TICK_HZ + 2);
    assert.match(String(dueno.ultimo("rechazado")?.motivo), /no se puede leer ahora/);
    assert.equal(readFileSync(join(dir, "espejo.json"), "utf8"), "{ esto no es json", "the broken file is left for its owner to fix");
    assert.deepEqual(readdirSync(dir), ["espejo.json"]);
    assert.equal(existsSync(join(dir, "espejo.json.tmp")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a world WITHOUT espejo.json: `encender` does nothing, no permiso is sent, and the shared state and the simulation are byte-identical to a world without the piece", () => {
  const armar = (sinPieza: boolean) => {
    const log: string[] = [];
    const base = sinPieza ? funciones.filter((f) => f.feature.id !== "espejo") : funciones;
    const lista = conMundo(base, () => undefined, (l) => log.push(l), () => { throw new Error("nothing may be written"); });
    const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
    const t = inst.join(0), e = crearClienteEspejo();
    const s = new ClientSession(t, { features: sinPieza ? [] : e.parts, identity: keeper() });
    const dicho: string[] = [];
    s.features.tap((f, ev) => { if (f === "espejo") dicho.push(ev); });
    const pump = (k: number) => { for (let i = 0; i < k; i++) { t.flush(); inst.tick(); t.flush(); } };
    return { inst, s, pump, dicho, e, log };
  };
  const con = armar(false), sin = armar(true);
  con.pump(6); sin.pump(6);
  assert.deepEqual(con.s.features.send("espejo", "encender", { funcion: "cron", activa: true }).ok, true);
  con.pump(TICK_HZ + 2); sin.pump(TICK_HZ + 2);
  assert.deepEqual(con.dicho, [], "no events at all: no permiso, no rechazado, no funcion");
  assert.equal(con.e.espejo.interruptor.estado.puede, false);
  assert.equal(con.s.features.stateOf("espejo").size, 0);
  const huella = (s: ClientSession) => JSON.stringify([...(s.features.catalog?.features ?? [])].filter((f) => f.id !== "espejo").map((f) => [f.id, f.version, [...s.features.stateOf(f.id)]]));
  assert.equal(huella(con.s), huella(sin.s));
  assert.equal(con.inst.sim.tick, sin.inst.sim.tick);
  assert.equal(stateHash(con.inst.sim), stateHash(sin.inst.sim));
  assert.equal(con.log.some((l) => /espejo/.test(l)), false, "and it says nothing in the log");
});

test("the schema keeps FUNCIONES the intent accepts: every function name is switchable, and the intent's field is short enough for every name", () => {
  for (const f of FUNCIONES) assert.ok(new TextEncoder().encode(f).length <= 24, f);
});
