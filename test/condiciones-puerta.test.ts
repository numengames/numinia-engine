// condiciones/c2: the server does not let anyone in without accepting the norms. The gate (condiciones-puerta.ts + Instance.cerrada)
// freezes a person where they arrived and ignores their chat, voice and every feature message (build, play) until they have accepted
// every mandatory `norma` of the CURRENT version; a `datos` point never closes it. Off by default: then nothing changes at all.
// Headless over the in-memory transport (the same Instance the server runs), plus a real WebSocket server for the wire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import {
  ACEPTAR_MAX, MSG, VOZ_MULAW, WIRE_FORMAT, decodeAceptar, decodeCondiciones, encodeAceptar, encodeCondiciones, encodePedirCondiciones, webSocketClient,
} from "../packages/net/src/index.ts";
import type { FeatureStorage, Saved, StorageOp } from "../packages/feature/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import objetosServer from "../features/objetos/server.ts";
import { crearCliente as crearObjetos } from "../features/objetos/client.ts";
import objetosCliente from "../features/objetos/client.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { CONDICIONES_CASA, puertaDeEntorno, PUERTA_POR_DEFECTO } from "../packages/server/src/condiciones.ts";
import type { Condiciones } from "../packages/server/src/condiciones.ts";
import { crearPuertaCondiciones } from "../packages/server/src/condiciones-puerta.ts";
import { startServer } from "../packages/server/src/server.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the server's datos/ keeps, in memory: a restart = a new instance over the same object. */
class MemoryStorage implements FeatureStorage {
  private readonly d = new Map<string, Saved>();
  load(f: string): Saved | null { return this.d.get(f) ?? null; }
  record(f: string, version: number, op: StorageOp): void {
    const s = this.d.get(f) ?? { version, state: [], store: [] };
    if (op.op === "k") s.store = [...s.store.filter(([k]) => k !== op.key), [op.key, op.value]];
    if (op.op === "kd") s.store = s.store.filter(([k]) => k !== op.key);
    if (op.op === "s") s.state = [...s.state.filter(([k]) => k !== op.key), [op.key, { value: op.value, at: op.at }]];
    if (op.op === "sd") s.state = s.state.filter(([k]) => k !== op.key);
    this.d.set(f, s);
  }
}

const punto = (id: string, obligatorio: boolean, tipo: "norma" | "datos" = "norma") => ({ id, titulo: id, texto: `texto ${id}`, obligatorio, tipo });
/** Two layers: the house has one mandatory norma and one data point; the community one mandatory norma, an optional norma and a data point. */
const dos = (casa = "1", comunidad = "A"): Condiciones => ({
  formato: "condiciones@1",
  capas: [
    { capa: "casa", version: casa, puntos: [punto("uso", true), punto("informe", false, "datos")] },
    { capa: "comunidad", version: comunidad, puntos: [punto("normas", true), punto("sorteo", false), punto("avisos", false, "datos")] },
  ],
});
const SOLO_CASA = (v = "1"): Condiciones => ({ formato: "condiciones@1", capas: [{ capa: "casa", version: v, puntos: [punto("uso", true), punto("informe", false, "datos")] }] });
const TODO = (c: Condiciones) => Object.fromEntries(c.capas.map((l) => [l.capa, l.version]));

/** A headless world with chat, objetos and roles (everyone builds), the gate on or off, n people with identities. */
function mundo(n: number, o: { activa?: boolean; condiciones?: Condiciones; storage?: MemoryStorage; sinOpcion?: boolean; guardados?: GuestKeeper[] } = {}) {
  const condiciones = o.condiciones ?? SOLO_CASA(), activa = o.activa ?? true, log: string[] = [];
  const roles = crearRoles({ construir: true, admin: "codigo-de-administracion-largo", firmar: sign, cerrar: () => {}, log: (l) => log.push(l) });
  const puerta = crearPuertaCondiciones({ condiciones, activa, log: (l) => log.push(l), ahora: () => Date.parse("2026-10-20T12:00:00Z") });
  const inst: Instance = new Instance({
    seed: 1, capacity: 32, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign, storage: o.storage,
    features: [chatServer, objetosServer, roles.part, ...(activa ? [puerta.part] : [])],
    puede: (who, accion) => roles.puede(who, accion), sinVoz: () => false, oye: () => true,
    ...(o.sinOpcion ? {} : { condiciones: puerta }),
  });
  const reloj = { ms: Date.parse("2026-10-20T12:00:00Z") };
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearCliente(() => reloj.ms), ob = crearObjetos();
    const s = new ClientSession(t, { features: [c.part, ob.part], identity: o.guardados?.[i] ?? keeper(), view: { label() {}, bounce() {} } });
    const oido: number[] = [];
    s.onVoice = (v) => oido.push(v.entidad);
    return { t, s, chat: c.chat, obras: ob.constructor, oido };
  });
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const juntos = () => { gente.forEach((p, i) => { inst.sim.tf.cols.x[p.s.entity] = fx(1 + i); inst.sim.tf.cols.z[p.s.entity] = fx(1); }); };
  const pos = (p: { s: ClientSession }) => ({ x: fxToFloat(inst.sim.tf.cols.x[p.s.entity]), z: fxToFloat(inst.sim.tf.cols.z[p.s.entity]) });
  const andar = (p: { s: ClientSession }, ticks = 30) => { for (let k = 0; k < ticks; k++) { p.s.tick(127, 0); pump(1); } };
  const objetos = () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).length;
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }); pump(TICK_HZ + 2); };
  const aceptar = (p: { s: ClientSession }, versiones: Record<string, string>, datos: string[] = []) => { assert.ok(p.s.aceptar(versiones, datos)); pump(2); };
  const habla = (p: (typeof gente)[number]) => { for (const q of gente) q.oido.length = 0; assert.ok(p.s.sendVoice(VOZ_MULAW, new Uint8Array(40).fill(7))); pump(2); };
  return { inst, puerta, gente, pump, juntos, pos, andar, objetos, decir, aceptar, habla, log, condiciones, roles };
}
type M = ReturnType<typeof mundo>;
const ver = (_M: M, p: M["gente"][number]) => p.chat.lineas.map((l) => l.texto);

// ---------- the wire ----------
test("wire: CONDICIONES (13) and ACEPTAR (14) are additive types — the wire format number stays; garbage is refused without throwing", () => {
  assert.equal(MSG.CONDICIONES, 13); assert.equal(MSG.ACEPTAR, 14); assert.equal(WIRE_FORMAT, 2);
  assert.deepEqual([...encodePedirCondiciones()], [13]);
  const a = encodeAceptar({ versiones: { casa: "1" }, datos: ["informe"] })!;
  assert.equal(a[0], 14); assert.deepEqual(decodeAceptar(a), { versiones: { casa: "1" }, datos: ["informe"] });
  assert.deepEqual(decodeAceptar(encodeAceptar({ versiones: {}, datos: [] })!), { versiones: {}, datos: [] }, "refusing everything is a valid message");
  const crudo = (o: unknown) => { const j = new TextEncoder().encode(JSON.stringify(o)); const b = new Uint8Array(j.length + 1); b[0] = 14; b.set(j, 1); return b; };
  for (const mal of [null, [], "x", { versiones: [] }, { versiones: { casa: 1 } }, { versiones: { casa: "1" }, datos: "informe" }, { versiones: { casa: "1" }, datos: [3] },
    { versiones: { a: "1", b: "1", c: "1", d: "1", e: "1" } }, { versiones: { casa: "x".repeat(41) } }, { versiones: {}, datos: Array(41).fill("a") }]) {
    assert.equal(decodeAceptar(crudo(mal)), null, JSON.stringify(mal));
  }
  assert.equal(decodeAceptar(new Uint8Array([14])), null); assert.equal(decodeAceptar(new Uint8Array([14, 0xc3, 0x28])), null);
  assert.equal(encodeAceptar({ versiones: { casa: "1" }, datos: Array(40).fill("x".repeat(40)) }), null, `over ${ACEPTAR_MAX} bytes`);
  assert.equal(decodeCondiciones(new Uint8Array([13])), null); assert.equal(decodeCondiciones(new Uint8Array([13, 123])), null);
  const m = { formato: "condiciones-estado@1" as const, puerta: true, abierta: false, faltan: ["casa"], aceptado: null };
  assert.deepEqual(decodeCondiciones(encodeCondiciones(m)), m);
});

test("puertaDeEntorno: si|sí|1|true = on, no|0|false = off, anything else = not said; the engine default is off", () => {
  assert.equal(PUERTA_POR_DEFECTO, false);
  for (const v of ["si", "SÍ", " 1 ", "true"]) assert.equal(puertaDeEntorno(v), true, v);
  for (const v of ["no", "0", "False"]) assert.equal(puertaDeEntorno(v), false, v);
  for (const v of [undefined, "", "quizá"]) assert.equal(puertaDeEntorno(v), undefined, String(v));
});

// ---------- the gate on ----------
test("gate on: before accepting, a person gets the offer by itself and cannot move, chat, speak or build", () => {
  const M = mundo(2, { condiciones: dos() });
  const [A, B] = M.gente;
  M.pump(3); M.juntos(); M.pump(2);
  // the offer: both layers with the whole text and each point's kind, identity first
  const o = A.s.condiciones!;
  assert.ok(o, "the offer arrives by itself after IDENTITY"); assert.equal(o.puerta, true); assert.equal(o.abierta, false);
  assert.deepEqual(o.faltan, ["casa", "comunidad"]); assert.equal(o.aceptado, null);
  assert.deepEqual(o.capas!.map((c) => [c.capa, c.version]), [["casa", "1"], ["comunidad", "A"]]);
  assert.deepEqual(o.capas![1].puntos.map((p) => [p.id, p.obligatorio, p.tipo]), [["normas", true, "norma"], ["sorteo", false, "norma"], ["avisos", false, "datos"]]);
  assert.equal(o.capas![0].puntos[0].texto, "texto uso");
  // movement: frozen where it arrived
  const antes = M.pos(A);
  M.andar(A);
  assert.deepEqual(M.pos(A), antes, "its inputs are ignored");
  assert.ok(M.inst.puertaStats.entradas >= 30);
  // chat: nobody reads it (B has accepted nothing either, but reading is not gated)
  const n = B.chat.lineas.length;
  assert.deepEqual(A.chat.decir("¿hay alguien?"), { ok: true }); M.pump(TICK_HZ + 2);
  assert.equal(B.chat.lineas.length, n, "B reads nothing from A"); assert.ok(M.inst.puertaStats.funciones >= 1);
  // voice: not relayed (the speaker is not even counted as heard)
  M.habla(A);
  assert.deepEqual(B.oido, []); assert.equal(M.inst.vozStats.recibidas, 0, "its microphone is not read at all"); assert.ok(M.inst.puertaStats.voz >= 1);
  // building: the thing is not placed
  const cosas = M.objetos();
  assert.ok(A.obras.colocar("bloque").ok); M.pump(3);
  assert.equal(M.objetos(), cosas, "nothing placed"); assert.equal(M.inst.puertaCerrada(A.s.entity), true);
  // none of it is a «bad» message: the page just has not accepted yet
  assert.equal(M.inst.conns.find((c) => c.entity === A.s.entity)!.bad, 0);
});

test("gate on: accepting ONLY the norms (no data point) opens everything — refusing data never keeps anyone out", () => {
  const M = mundo(2, { condiciones: dos() });
  const [A, B] = M.gente;
  M.pump(3); M.juntos(); M.pump(2);
  M.aceptar(B, TODO(M.condiciones));                    // B accepts the two layers, ticks no data point
  assert.equal(B.s.condiciones!.abierta, true); assert.deepEqual(B.s.condiciones!.faltan, []);
  assert.deepEqual(B.s.condiciones!.aceptado!.datos, [], "the data permissions stay unticked");
  assert.deepEqual(B.s.condiciones!.aceptado!.versiones, { casa: "1", comunidad: "A" });
  assert.ok(B.s.condiciones!.capas, "the text stays in the page's copy for the bubble");
  assert.equal(M.inst.puertaCerrada(A.s.entity), true, "A is still held"); assert.equal(M.inst.puertaCerrada(B.s.entity), false);
  const antes = M.pos(B);
  M.andar(B, 30);
  assert.ok(M.pos(B).x > antes.x + 1, "B walks now");
  M.decir(B, "hola a todos");
  assert.ok(ver(M, A)!.some((t) => t.includes("hola a todos")), "A (held) reads B: only what A sends is gated");
  M.habla(B);
  assert.ok(A.oido.includes(B.s.entity), "B's voice is relayed");
  const cosas = M.objetos();
  assert.ok(B.obras.colocar("bloque").ok); M.pump(3);
  assert.equal(M.objetos(), cosas + 1, "B builds");
  assert.equal(M.inst.puertaStats.malas, 0);
});

test("gate on: a data point alone, an old version, an unknown layer or a norma id given as data never open the gate; a half acceptance does not either", () => {
  const M = mundo(1, { condiciones: dos("2", "B") });
  const [A] = M.gente;
  M.pump(3);
  M.aceptar(A, {}, ["informe", "avisos"]);
  assert.equal(A.s.condiciones!.abierta, false, "ticking every data point is not accepting the norms");
  assert.deepEqual(A.s.condiciones!.aceptado!.datos, ["informe", "avisos"]);
  M.aceptar(A, { casa: "1", comunidad: "A" });          // the old versions
  assert.equal(A.s.condiciones!.abierta, false); assert.deepEqual(A.s.condiciones!.faltan, ["casa", "comunidad"]);
  assert.deepEqual(A.s.condiciones!.aceptado!.versiones, {}, "text that is not the current one is not recorded as accepted");
  M.aceptar(A, { casa: "2", otra: "9" }, ["uso", "normas", "no-existe", "informe", "informe"]); // one layer of two; norma ids and strangers are not data
  assert.equal(A.s.condiciones!.abierta, false); assert.deepEqual(A.s.condiciones!.faltan, ["comunidad"]);
  assert.deepEqual(A.s.condiciones!.aceptado!.datos, ["informe"], "exactly the data points that exist, once each");
  const quieto = M.pos(A); M.andar(A); assert.deepEqual(M.pos(A), quieto, "half accepted = still frozen");
  M.aceptar(A, { comunidad: "B" });                      // the second layer: the first stays accepted
  assert.equal(A.s.condiciones!.abierta, true); assert.deepEqual(A.s.condiciones!.aceptado!.versiones, { casa: "2", comunidad: "B" });
  assert.deepEqual(A.s.condiciones!.aceptado!.datos, [], "a later message replaces the ticked data points (unticking = withdrawing)");
  assert.equal(M.inst.puertaCerrada(A.s.entity), false);
});

test("gate on: a layer with no mandatory norma asks nothing; a world whose only mandatory points are optional lets everyone in", () => {
  const sinObligatorio: Condiciones = { formato: "condiciones@1", capas: [{ capa: "casa", version: "1", puntos: [punto("a", false), punto("informe", false, "datos")] }] };
  const M = mundo(1, { condiciones: sinObligatorio });
  M.pump(3); const x0 = M.pos(M.gente[0]).x; M.andar(M.gente[0]);
  assert.ok(M.pos(M.gente[0]).x > x0 + 1, "nothing to accept = nothing held");
  const soloComunidadPide: Condiciones = { formato: "condiciones@1", capas: [{ capa: "casa", version: "1", puntos: [punto("a", false)] }, { capa: "comunidad", version: "A", puntos: [punto("n", true)] }] };
  const N = mundo(1, { condiciones: soloComunidadPide });
  N.pump(3); assert.deepEqual(N.gente[0].s.condiciones!.faltan, ["comunidad"]);
});

test("gate on: ACEPTAR before IDENTITY or malformed is counted and ignored; more than 5 a second are cut; asking never costs and works before IDENTITY", () => {
  const M = mundo(1, { condiciones: dos() });
  const [A] = M.gente;
  const crudo = M.inst.join(1); M.pump(1); crudo.flush();       // a bare connection: no ClientSession, never identified
  const conn = M.inst.conns.find((c) => c.entity !== A.s.entity)!;
  const recibido: Uint8Array[] = []; crudo.onMessage((b) => recibido.push(b));
  crudo.send(encodePedirCondiciones(), true); M.inst.tick(); crudo.flush();
  const estado = decodeCondiciones(recibido.find((b) => b[0] === 13)!)!;
  assert.equal(estado.abierta, false); assert.equal(estado.capas?.length, 2, "the offer also to who has not identified");
  crudo.send(encodeAceptar({ versiones: TODO(M.condiciones), datos: [] })!, true); M.inst.tick();
  assert.equal(conn.bad, 1, "nobody to keep it for"); assert.equal(M.inst.puertaCerrada(conn.entity), true);
  crudo.send(new Uint8Array([13, 1]), true); crudo.send(new Uint8Array([14, 0x7b]), true); M.inst.tick();
  assert.equal(conn.bad, 3);
  M.pump(3);
  for (let i = 0; i < 8; i++) assert.ok(A.s.aceptar({ casa: "nada" }, []));
  M.pump(2);
  assert.equal(M.inst.conns.find((c) => c.entity === A.s.entity)!.bad, 3, "5 pass, 3 cut");
  assert.equal(M.inst.puertaStats.aceptaciones, 5);
  assert.equal(A.s.pedirCondiciones(), true); M.pump(2);
});

test("gate on: what a person accepted is kept by their id — a restart keeps it, a new version of the text asks again", () => {
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = mundo(1, { condiciones: dos("1", "A"), storage, guardados: [tarjeta] });
  M.pump(3);
  const id = M.inst.who(M.gente[0].s.entity)!.id;
  M.aceptar(M.gente[0], TODO(M.condiciones), ["informe"]);
  const r = M.puerta.registro(id)!;
  assert.deepEqual(r.v, { casa: "1", comunidad: "A" }); assert.deepEqual(r.d, ["informe"]); assert.equal(r.en, "2026-10-20T12:00:00.000Z");
  // same text after a restart: the same guest (same token) walks in with nothing to accept
  M = mundo(1, { condiciones: dos("1", "A"), storage, guardados: [tarjeta] });
  M.pump(3);
  assert.equal(M.inst.who(M.gente[0].s.entity)!.id, id, "same guest");
  assert.equal(M.gente[0].s.condiciones!.abierta, true); assert.deepEqual(M.gente[0].s.condiciones!.aceptado!.datos, ["informe"]);
  const x0 = M.pos(M.gente[0]).x; M.andar(M.gente[0]); assert.ok(M.pos(M.gente[0]).x > x0 + 1);
  // the community publishes a new version: the guest is held again, and the server still knows what they had accepted (c6 shows only the change)
  M = mundo(1, { condiciones: dos("1", "B"), storage, guardados: [tarjeta] });
  M.pump(3);
  assert.equal(M.gente[0].s.condiciones!.abierta, false); assert.deepEqual(M.gente[0].s.condiciones!.faltan, ["comunidad"]);
  assert.deepEqual(M.gente[0].s.condiciones!.aceptado!.versiones, { casa: "1", comunidad: "A" });
  const quieto = M.pos(M.gente[0]); M.andar(M.gente[0]); assert.deepEqual(M.pos(M.gente[0]), quieto); assert.ok(M.inst.puertaStats.entradas > 0);
});

test("gate on: an AI inhabitant or agent is never held (a signed ticket, no bubble to click)", () => {
  const M = mundo(1, { condiciones: dos() });
  M.pump(3);
  const conn = M.inst.conns[0];
  assert.equal(M.inst.puertaCerrada(conn.entity), true);
  conn.who = { id: "ia-lia", nombre: "Lía · IA", ia: true };
  assert.equal(M.inst.puertaCerrada(conn.entity), false);
  assert.equal(M.inst.puertaCerrada(999), false, "nobody there");
});

// ---------- the gate off: nothing changes ----------
test("gate off (the default): the same session gives the same simulation, the same bytes and the same chat as a world with no gate at all", () => {
  const sesion = (M: M) => {
    const [A, B] = M.gente;
    M.pump(4); M.juntos(); M.pump(2);
    M.andar(A, 25); M.decir(A, "hola"); M.habla(A);
    assert.ok(B.oido.includes(A.s.entity));
    assert.ok(B.obras.colocar("bloque").ok); M.pump(3);
    const bytes = M.gente.map((p) => (p.t as unknown as { peer: { sentBytes: number } }).peer.sentBytes); // what the server sent each page
    return { bytes, chat: B.chat.lineas.map((l) => l.texto), cosas: M.objetos(), pos: M.pos(A), voz: M.inst.vozStats.enviadas };
  };
  const sin = sesion(mundo(2, { sinOpcion: true, activa: false }));
  const apagada = mundo(2, { activa: false, condiciones: CONDICIONES_CASA });
  const con = sesion(apagada);
  assert.deepEqual(con, sin, "identical");
  assert.deepEqual(apagada.inst.puertaStats, { entradas: 0, funciones: 0, voz: 0, aceptaciones: 0, malas: 0 });
  assert.equal(apagada.gente[0].s.condiciones, null, "nothing is sent by itself");
  assert.equal(apagada.inst.conns.every((c) => c.bad === 0), true);
  assert.equal(apagada.log.some((l) => l.includes("condiciones")), false, "and no new feature registered");
});

test("gate off: asking works and says so (the page can tell a gate that is off), and accepting is kept in memory without opening anything new", () => {
  const M = mundo(1, { activa: false, condiciones: dos() });
  const [A] = M.gente;
  M.pump(3);
  assert.equal(A.s.pedirCondiciones(), true); M.pump(2);
  assert.equal(A.s.condiciones!.puerta, false); assert.equal(A.s.condiciones!.abierta, true, "off = nothing held");
  assert.deepEqual(A.s.condiciones!.faltan, ["casa", "comunidad"], "it still says what has not been accepted");
  assert.equal(M.inst.puertaCerrada(A.s.entity), false);
  M.aceptar(A, { casa: "1" }, ["informe"]);
  assert.deepEqual(A.s.condiciones!.aceptado!.datos, ["informe"]);
});

// ---------- the server, over a real WebSocket ----------
test("WebSocket server: the option, the file and the default — off unless asked; asked, it holds a real client until it accepts", async () => {
  const carpeta = (puerta?: boolean) => {
    const d = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "puerta-")); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "condiciones.json"), JSON.stringify({ formato: "condiciones@1", ...(puerta === undefined ? {} : { puerta }), capas: [{ capa: "casa", version: "1", puntos: [punto("uso", true), punto("informe", false, "datos")] }] }));
    return d;
  };
  const logs: string[] = [];
  const abrir = (o: { condicionesPuerta?: boolean; aventura?: string | null }) => startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", ...o });
  const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 5000) await sleep(10); return f(); };
  const llegar = async (srv: Awaited<ReturnType<typeof abrir>>) => {
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`), s = new ClientSession(t, { identity: keeper() });
    await t.opened; assert.ok(await espera(() => s.who !== null), "identified");
    return { t, s };
  };
  const andar = async (c: Awaited<ReturnType<typeof llegar>>, srv: Awaited<ReturnType<typeof abrir>>) => {
    const x0 = fxToFloat(srv.inst.sim.tf.cols.x[c.s.entity]);
    for (let k = 0; k < 20; k++) { c.s.tick(127, 0); await sleep(55); }
    return fxToFloat(srv.inst.sim.tf.cols.x[c.s.entity]) - x0;
  };

  // 1) default: no option, the house example (no file): off
  const apagado = await abrir({});
  try {
    assert.ok(logs.some((l) => l.includes("[condiciones] puerta apagada")));
    const c = await llegar(apagado);
    assert.ok(await andar(c, apagado) > 1, "walks at once"); assert.equal(c.s.condiciones, null, "and was sent nothing");
    c.s.pedirCondiciones(); assert.ok(await espera(() => c.s.condiciones !== null)); assert.equal(c.s.condiciones!.puerta, false);
    c.t.close();
  } finally { await apagado.close(); }

  // 2) asked by the option: held until it accepts; the data point it leaves unticked does not matter
  const encendido = await abrir({ condicionesPuerta: true });
  try {
    assert.ok(logs.some((l) => l.includes("[condiciones] puerta ENCENDIDA")));
    const c = await llegar(encendido);
    assert.ok(await espera(() => c.s.condiciones !== null), "the offer comes by itself");
    assert.equal(c.s.condiciones!.abierta, false); assert.equal(c.s.condiciones!.capas![0].puntos[1].tipo, "datos");
    assert.ok(await andar(c, encendido) < 0.01, "held");
    assert.ok(c.s.aceptar({ casa: CONDICIONES_CASA.capas[0].version }, []));
    assert.ok(await espera(() => c.s.condiciones!.abierta === true), "the answer says the gate is open");
    assert.ok(await andar(c, encendido) > 1, "walks after accepting");
    assert.equal(encendido.inst.conns.find((k) => k.entity === c.s.entity)!.bad, 0);
    c.t.close();
  } finally { await encendido.close(); }

  // 3) asked by the world's own file; the server option wins over the file in both directions
  const delFichero = await abrir({ aventura: carpeta(true) });
  try {
    const c = await llegar(delFichero);
    assert.ok(await espera(() => c.s.condiciones !== null), "condiciones.json asked for the gate");
    assert.ok(await andar(c, delFichero) < 0.01); c.t.close();
  } finally { await delFichero.close(); }
  const forzadoApagado = await abrir({ aventura: carpeta(true), condicionesPuerta: false });
  try {
    const c = await llegar(forzadoApagado);
    assert.ok(await andar(c, forzadoApagado) > 1, "the operator's switch beats the file"); assert.equal(c.s.condiciones, null);
    c.t.close();
  } finally { await forzadoApagado.close(); }
  const ficheroSinPuerta = await abrir({ aventura: carpeta(undefined) });
  try {
    const c = await llegar(ficheroSinPuerta);
    assert.ok(await andar(c, ficheroSinPuerta) > 1, "a file that does not mention it: off"); c.t.close();
  } finally { await ficheroSinPuerta.close(); }
});

test("server: a file that makes a data point mandatory is not used (the house example stays) and the log says how to fix it", async () => {
  const d = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "puerta-")), logs: string[] = [];
  writeFileSync(join(d, "condiciones.json"), JSON.stringify({ formato: "condiciones@1", puerta: true, capas: [{ capa: "casa", version: "1", puntos: [punto("uso", true), punto("informe", true, "datos")] }] }));
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", aventura: d });
  try {
    assert.ok(logs.some((l) => l.includes("un punto de datos nunca puede ser obligatorio") && l.includes('"obligatorio": false')), logs.filter((l) => l.includes("condiciones")).join("\n"));
    assert.ok(logs.some((l) => l.includes("puerta apagada")), "and the house example does not ask for the gate");
  } finally { await srv.close(); }
});
