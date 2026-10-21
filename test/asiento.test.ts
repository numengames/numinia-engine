// asiento v1: sitting down for real, headless (in-memory world, pages pumped by 20 Hz ticks, the world's roles for real).
// Sit (the simulation puts the avatar on the seat, still, SENTADO), an occupied seat (one seat, one person; the name shows),
// stand up («E»/levantar, /levantar, a stick or a jump, leaving the world), a director or moderator stands another up, a world with
// no asientos.json does nothing at cost 0 (same simulation fingerprint), a world whose ONLY change is asientos.json shows the
// seats (R-1), the switch (who may, the file written, off stands people up) and its persistence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ, getMotionExtra, MODO_PIE, MODO_SENTADO } from "../packages/sim/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearDirector } from "../features/director/server.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearBaculo } from "../features/baculo/server.ts";
import { crearCliente as crearClienteBaculo } from "../features/baculo/client.ts";
import { asiento, COGER_M, LIBRE, ATRAS_M } from "../features/asiento/feature.ts";
import { crearAsiento, leerAsientos } from "../features/asiento/server.ts";
import { crearCliente, banqueta, rotulo } from "../features/asiento/client.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const SITIOS = [
  { id: "j1", x: 10, y: 0, z: 0, mira: 90, etiqueta: "Jugador 1", dibujo: false },
  { id: "j2", x: 10, y: 0, z: 4, mira: 180, etiqueta: "Jugador 2", dibujo: false },
];
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
type Archivos = Map<string, unknown>;

/** A headless world: n people (each with chat, the seats and the staff's page), the world's roles; seats from `sitios` (null = no asientos.json). */
function mundo(n: number, o: { sitios?: typeof SITIOS | null; archivos?: Archivos; iniciales?: Record<string, unknown> } = {}) {
  const archivos: Archivos = o.archivos ?? new Map();
  for (const [k, v] of Object.entries(o.iniciales ?? {})) archivos.set(k, v);
  const log: string[] = [], reloj = { ms: Date.parse("2026-10-21T22:00:00Z") };
  const io = { leer: (f: string) => archivos.get(f), escribir: (f: string, d: unknown) => { archivos.set(f, JSON.parse(JSON.stringify(d))); } };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const crudo = archivos.get("asientos.json");
  const sitios = o.sitios === undefined ? SITIOS : o.sitios;
  const as = crearAsiento(crudo ? leerAsientos(crudo)!.valor : sitios ? { sitios } : null, io);
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "hierba" } }), crearDirector({ escenas: [] }), crearBaculo(null), as, roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion) });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), a = crearCliente(), b = crearClienteBaculo();
    const vistas: string[] = [], rech: string[] = [], rumbos = new Map<number, number | undefined>(), poses = new Map<number, string | null>();
    const s = new ClientSession(t, { features: [c.part, a.parts[0], b.parts[0]], identity: keeper(), view: {
      label() {}, bounce() {}, lleva() {},
      place: (k, p) => { vistas.push(`${k}:${p ? "puesto" : "quitado"}`); },
      tag: (k, p) => { vistas.push(`${k}:tag:${p ? p.text : "quitado"}`); },
      movimiento: (e, m) => { poses.set(e, m ? m.id : null); return true; },
      orientar: (e, r) => { rumbos.set(e, r); },
    } });
    s.features.tap((f, e, m) => { if (f === "asiento" && e === "rechazado") rech.push(String(m.motivo)); });
    return { t, s, chat: c.chat, asiento: a.asiento, baculo: b.baculo, rech, vistas, rumbos, poses };
  });
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  const modo = (p: { s: ClientSession }) => getMotionExtra(inst.sim, p.s.entity).modo;
  const donde = (p: { s: ClientSession }) => ({ x: fxToFloat(inst.sim.tf.cols.x[p.s.entity]), y: fxToFloat(inst.sim.tf.cols.y[p.s.entity]), z: fxToFloat(inst.sim.tf.cols.z[p.s.entity]) });
  /** Who sits in each seat, as the SERVER's state says (not a page). */
  const ocupantes = () => Object.fromEntries([...((inst.features as unknown as { shared: Map<string, Map<string, { value: { ocupante: number } }>> }).shared.get("asiento") ?? new Map()).entries()].map(([k, v]) => [k, v.value.ocupante]));
  return { inst, gente, pump, poner, decir, modo, donde, log, archivos, roles, ocupantes, nombre: (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre };
}
const ocupa = (p: { asiento: ReturnType<typeof crearCliente>["asiento"] }, k = "j1") => p.asiento.lista().find((s) => s.id === k)?.ocupante;

test("asiento: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(asiento.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "asiento"));
  assert.ok(paginas.some((f) => f.feature.id === "asiento"));
});

test("asientos.json: a wrong line is left out with its reason; the rest is used", () => {
  assert.equal(leerAsientos(undefined), null, "no file, no seats");
  assert.deepEqual(leerAsientos({ sitios: [{ id: "a", x: 1, z: 2, mira: 270 }, { x: 3, y: 1, z: 4, etiqueta: "Dos" }] })!.valor.sitios, [
    { id: "a", x: 1, z: 2, y: 0, mira: -90, etiqueta: "Asiento 1", dibujo: false },
    { id: "s2", x: 3, z: 4, y: 1, mira: 0, etiqueta: "Dos", dibujo: false }]);
  const ko = leerAsientos({ sitios: [{ id: "a", x: 1 }, { id: "malo id!", x: 1, z: 1 }, { id: "b", x: 1, z: 1 }, { id: "b", x: 2, z: 2 }] })!;
  assert.deepEqual(ko.valor.sitios.map((s) => s.id), ["b"]);
  assert.match(ko.problemas.join("\n"), /sitios\[0\].*x y z/);
  assert.match(ko.problemas.join("\n"), /no vale/);
  assert.match(ko.problemas.join("\n"), /repetido/);
  assert.deepEqual(leerAsientos({})!.valor, { activa: true, sitios: [] });
  assert.equal(leerAsientos({ activa: false, sitios: [] })!.valor.activa, false);
  assert.ok(leerAsientos("hola")!.problemas.length);
});

test("asiento: «E» beside a free seat sits you there — put on it, facing it, still (SENTADO); the seat says who sits and one seat holds one person", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.poner(A, 9.2, 0.6); W.poner(B, 9.5, 3.5);
  W.pump(3);
  assert.equal(ocupa(A), LIBRE);
  assert.ok(A.s.features.reachable(9.2, 0.6, 0).some((r) => r.feature === "asiento" && r.key === "j1" && r.prompt === "sentarte"), "the page offers «E: sentarte»");
  assert.deepEqual(A.s.features.use("asiento", "j1"), { ok: true }); W.pump(4);
  assert.equal(W.modo(A), MODO_SENTADO);
  assert.deepEqual(W.donde(A), { x: 10, y: 0, z: 0 }, "put on the seat");
  assert.equal(ocupa(A), A.s.entity);
  assert.equal(ocupa(B), A.s.entity, "everyone near sees who sits");
  assert.equal(W.ocupantes().j1, A.s.entity, "and the SERVER says the same");
  assert.equal(W.ocupantes().j2, LIBRE);
  assert.equal(B.asiento.lista().find((s) => s.id === "j1")!.quien, W.nombre(A));
  assert.equal(B.asiento.lista().find((s) => s.id === "j1")!.radio, 0, "an occupied seat is not offered");
  assert.ok(!B.s.features.reachable(10, 0.5, 0).some((r) => r.feature === "asiento" && r.key === "j1"));
  // what a page draws: the pose held on the sitter, facing where the seat looks (90° = +x), the name on the seat
  assert.equal(B.poses.get(A.s.entity), "sentarse");
  assert.ok(Math.abs((B.rumbos.get(A.s.entity) ?? 99) - Math.PI / 2) < 1e-9);
  assert.ok(B.vistas.includes(`asiento:j1:tag:${rotulo({ nombre: "Jugador 1", quien: W.nombre(A) })}`));
  // a second person cannot take the same seat; the sitter cannot take a second seat
  B.s.features.use("asiento", "j1"); W.pump(3);
  assert.match(B.rech.at(-1) ?? "", /Jugador 1 lo ocupa/);
  assert.equal(W.modo(B), MODO_PIE);
  W.poner(A, 10, 0); // (still on the seat) the stick is the only way out: ask for the other seat from here
  A.s.features.send("asiento", "sentar", { cosa: "j2" }); W.pump(3);
  assert.match(A.rech.at(-1) ?? "", /Ya estás sentado|Acércate/);
  assert.equal(ocupa(A, "j2"), LIBRE);
  // B sits on the other one
  assert.deepEqual(B.s.features.use("asiento", "j2"), { ok: true }); W.pump(4);
  assert.equal(W.modo(B), MODO_SENTADO);
  assert.deepEqual(W.donde(B), { x: 10, y: 0, z: 4 });
  assert.ok(Math.abs((A.rumbos.get(B.s.entity) ?? 99) - Math.PI) < 1e-9, "facing 180°");
  assert.match(W.log.join("\n"), /\[asiento\] .* se sienta \(j1\)/);
});

test("asiento: far from the seat you cannot sit; the server decides (a page cannot sit you from afar)", () => {
  const W = mundo(1);
  const [A] = W.gente;
  W.pump(4);
  W.poner(A, 10 + COGER_M + 3, 0);
  W.pump(3);
  A.s.features.send("asiento", "sentar", { cosa: "j1" }); W.pump(3);
  assert.match(A.rech.at(-1) ?? "", /Acércate a Jugador 1/);
  assert.equal(W.modo(A), MODO_PIE);
  A.s.features.send("asiento", "sentar", { cosa: "no-existe" }); W.pump(3);
  assert.match(A.rech.at(-1) ?? "", /No hay ningún asiento/);
  assert.equal(W.ocupantes().j1, LIBRE);
});

test("asiento: «E» again (the page's «levantarte») and /levantar stand you up, a little behind the seat, on your feet; the seat is free", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.poner(A, 9.5, 0); W.poner(B, 9.5, 4); W.pump(3);
  A.asiento.lista(); A.s.features.use("asiento", "j1"); W.pump(4);
  assert.equal(W.modo(A), MODO_SENTADO);
  const l = A.asiento.cerca();
  assert.equal(l.length, 1);
  assert.equal(l[0].prompt, "levantarte");
  assert.equal(B.asiento.cerca().length, 0, "only the sitter is offered it");
  assert.deepEqual(l[0].local(), { ok: true }); W.pump(4);
  assert.equal(W.modo(A), MODO_PIE);
  assert.equal(ocupa(B), LIBRE);
  const d = W.donde(A);
  assert.ok(Math.abs(d.x - (10 - ATRAS_M)) < 0.02 && Math.abs(d.z) < 0.02, `behind the seat (${d.x}, ${d.z})`);
  assert.equal(B.poses.get(A.s.entity), null, "the pose ends on every page");
  assert.equal(B.rumbos.get(A.s.entity), undefined, "and it faces by itself again");
  // /levantar with nobody sitting there says so; sit again and use the chat command
  W.decir(A, "/levantar");
  assert.match(A.rech.at(-1) ?? "", /No estás sentado/);
  W.poner(A, 9.5, 0); W.pump(2);
  A.s.features.use("asiento", "j1"); W.pump(4);
  assert.equal(W.modo(A), MODO_SENTADO);
  W.decir(A, "/levantar");
  assert.equal(W.modo(A), MODO_PIE);
  assert.equal(ocupa(B), LIBRE);
});

test("asiento: a stick or a jump stands you up (the simulation does it, the server sees it and frees the seat); frozen until then", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.poner(A, 9.5, 0); W.poner(B, 9.5, 4); W.pump(3);
  A.s.features.use("asiento", "j1"); W.pump(4);
  for (let i = 0; i < 10; i++) { A.s.tick(0, 0, 0); W.pump(1); }
  assert.equal(W.modo(A), MODO_SENTADO, "no input = still seated");
  assert.deepEqual(W.donde(A), { x: 10, y: 0, z: 0 }, "frozen on the seat");
  A.s.tick(-1, 0, 0); W.pump(3);
  assert.equal(W.modo(A), MODO_PIE, "the stick");
  W.pump(3);
  assert.equal(W.ocupantes().j1, LIBRE, "the server freed the seat");
  assert.equal(B.poses.get(A.s.entity), null);
  // and a jump
  B.s.features.use("asiento", "j2"); W.pump(4);
  assert.equal(W.modo(B), MODO_SENTADO);
  B.s.tick(0, 0, 1); W.pump(3); // BTN_JUMP
  assert.equal(W.modo(B), MODO_PIE, "a jump");
  W.pump(3);
  assert.equal(W.ocupantes().j2, LIBRE);
});

test("asiento: leaving the world frees the seat at once", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.poner(A, 9.5, 0); W.pump(3);
  A.s.features.use("asiento", "j1"); W.pump(4);
  assert.equal(ocupa(B), A.s.entity);
  W.inst.disconnect(A.s.entity); W.pump(3);
  assert.equal(ocupa(B), LIBRE);
  assert.equal(W.ocupantes().j1, LIBRE);
  assert.equal(B.poses.get(A.s.entity), null);
  W.poner(B, 9.5, 0); W.pump(2);
  B.s.features.use("asiento", "j1"); W.pump(4);
  assert.equal(ocupa(B), B.s.entity, "free for the next person");
});

test("asiento: who directs (the owner) or may remove people stands another person up; a player without those cannot", () => {
  const W = mundo(3);
  const [Lia, A, B] = W.gente;
  W.pump(4);
  W.decir(Lia, `/dueño ${ADMIN}`);
  W.poner(A, 9.5, 0); W.poner(B, 9.5, 4); W.poner(Lia, 20, 20); W.pump(3);
  A.s.features.use("asiento", "j1"); B.s.features.use("asiento", "j2"); W.pump(4);
  assert.equal(W.modo(A), MODO_SENTADO); assert.equal(W.modo(B), MODO_SENTADO);
  // B (no permission) cannot stand A up
  W.decir(B, `/levantar ${W.nombre(A)}`);
  assert.match(B.rech.at(-1) ?? "", /Levantar a otra persona es cosa de quien dirige/);
  assert.equal(W.modo(A), MODO_SENTADO);
  // Lía (owner), far from the table, stands A up by name; B stays seated
  W.decir(Lia, `/levantar ${W.nombre(A)}`);
  assert.equal(W.modo(A), MODO_PIE);
  assert.equal(W.modo(B), MODO_SENTADO);
  assert.equal(W.ocupantes().j1, LIBRE);
  assert.match(W.log.join("\n"), /lo levanta/);
  W.decir(Lia, "/levantar Nadie Aqui");
  assert.match(Lia.rech.at(-1) ?? "", /No hay nadie sentado llamado/);
  // the one who holds the Director's staff directs too: they may stand B up
  A.baculo.lista();
  W.decir(Lia, `/levantar ${W.nombre(B)}`);
  assert.equal(W.modo(B), MODO_PIE);
});

test("asiento: a world with no asientos.json does nothing — off, no state, nothing offered, /levantar says it is off", () => {
  const W = mundo(1, { sitios: null });
  const [A] = W.gente;
  W.pump(4);
  assert.equal(A.asiento.lista().length, 0);
  assert.equal(A.asiento.interruptor.activa(), false);
  assert.equal(W.archivos.size, 0, "nothing written");
  A.s.features.send("asiento", "sentar", { cosa: "j1" }); W.pump(3);
  assert.equal(W.modo(A), MODO_PIE, "nobody sits");
  W.decir(A, "/levantar");
  assert.match(A.rech.at(-1) ?? "", /Los asientos están apagados/);
  assert.deepEqual(A.vistas, []);
});

test("asiento: a world without asientos.json keeps the simulation fingerprint — the piece on the list changes nothing", () => {
  const sinElla = (con: boolean) => {
    const log: string[] = [];
    const lista = conMundo(con ? funciones : funciones.filter((f) => f.feature.id !== "asiento"), (_f: string) => undefined, (l) => log.push(l));
    const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
    const t = inst.join(0), s = new ClientSession(t, { identity: keeper(), features: paginas });
    for (let i = 0; i < 40; i++) { t.flush(); inst.tick(); t.flush(); }
    return { hash: inst.hash(), keys: s.features.stateKeys?.("asiento") ?? [], log };
  };
  const con = sinElla(true), sin = sinElla(false);
  assert.equal(con.hash, sin.hash, "the seats' piece leaves the simulation fingerprint alone");
  assert.deepEqual(con.keys, []);
  assert.deepEqual(con.log.filter((l) => /asiento:/i.test(l)), [], "and has nothing to announce");
  // and a run WITH an order is still reproducible: two worlds, the same person sits at the same tick, the same fingerprint
  const sentada = () => {
    const ficheros: Record<string, unknown> = { "asientos.json": { sitios: [{ id: "a", x: 1, z: 1, mira: 0 }] } };
    const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: conMundo(funciones, (f) => ficheros[f], () => {}), identitySign: sign });
    const t = inst.join(0), s = new ClientSession(t, { identity: keeper(), features: paginas });
    for (let i = 0; i < 20; i++) { t.flush(); inst.tick(); t.flush(); }
    inst.sim.tf.cols.x[s.entity] = fx(1); inst.sim.tf.cols.z[s.entity] = fx(1);
    s.features.use("asiento", "a");
    for (let i = 0; i < 20; i++) { t.flush(); inst.tick(); t.flush(); }
    assert.equal(getMotionExtra(inst.sim, s.entity).modo, MODO_SENTADO);
    return inst.hash();
  };
  assert.equal(sentada(), sentada(), "a run with an order is bit-for-bit repeatable");
});

test("asiento (R-1): a world whose ONLY change is asientos.json shows the seats, where the file says, and seats whoever uses one", () => {
  const ficheros: Record<string, unknown> = { "asientos.json": { sitios: [{ id: "a", x: 4, y: 0, z: 6, mira: 0, etiqueta: "Mi silla", dibujo: true }, { id: "b", x: -3, z: 6, mira: 180 }] } };
  const log: string[] = [];
  const lista = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0), vistas: string[] = [], poses: string[] = [];
  const s = new ClientSession(t, { identity: keeper(), features: paginas, view: { label() {}, bounce() {}, place: (k, p) => { if (p) vistas.push(`${k}@${p.x.toFixed(2)},${p.z.toFixed(2)}`); }, tag() {}, movimiento: (e, m) => { poses.push(`${e}:${m?.id}`); return true; }, orientar() {} } });
  for (let i = 0; i < 40; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.match(log.join("\n"), /asiento: 2 asiento\(s\)/);
  assert.ok(vistas.some((v) => v.startsWith("asiento:a@")), "a stool where `dibujo` says: " + vistas.join(" "));
  assert.ok(!vistas.some((v) => v.startsWith("asiento:b@")), "no stool for a seat with its own model");
  assert.deepEqual(s.features.reachable(4, 6, 0).map((r) => [r.feature, r.key, r.prompt, r.name]), [["asiento", "a", "sentarte", "Mi silla"]]);
  inst.sim.tf.cols.x[s.entity] = fx(4.5); inst.sim.tf.cols.z[s.entity] = fx(6);
  s.features.use("asiento", "a");
  for (let i = 0; i < 10; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(getMotionExtra(inst.sim, s.entity).modo, MODO_SENTADO);
  assert.ok(poses.includes(`${s.entity}:sentarse`), poses.join(" "));
  // the stool: under the hips, along the seat's facing
  const b = banqueta({ x: 4, y: 0, z: 6, mira: 0 });
  assert.ok(b.y > 0 && b.sy < 0.6 && b.z < 6, "stands on the ground, a little behind the hips");
  // a wrong file is left out line by line and said
  ficheros["asientos.json"] = { sitios: [{ x: "a" }] };
  const log2: string[] = [];
  conMundo(funciones, (f) => ficheros[f], (l) => log2.push(l));
  assert.match(log2.join("\n"), /asientos\.json: sitios\[0\]/);
});

test("interruptor asiento: only who directs or rules may flip it; first time with no places, a seat appears beside who turns it on and asientos.json is written; off stands people up", () => {
  const W = mundo(3, { sitios: null });
  const [A, B, C] = W.gente;
  W.pump(4);
  // a person with no permission is refused and nothing is written
  B.asiento.interruptor.poner(true); W.pump(3);
  assert.match(B.asiento.interruptor.estado.ultimoRechazo || B.rech.at(-1) || "", /Encender o apagar una pieza/);
  assert.equal(W.archivos.size, 0);
  W.decir(A, `/dueño ${ADMIN}`);
  W.poner(A, 20, 5); W.poner(B, 21, 5); W.poner(C, 40, 40);
  W.pump(3);
  assert.deepEqual(A.asiento.interruptor.poner(true), { ok: true }); W.pump(4);
  const escrito = W.archivos.get("asientos.json") as { schema: string; activa: boolean; sitios: { id: string; x: number; z: number; mira: number; dibujo: boolean }[] };
  assert.equal(escrito.schema, "numinia-engine/asientos@1");
  assert.equal(escrito.activa, true);
  assert.deepEqual([escrito.sitios.length, escrito.sitios[0].x, escrito.sitios[0].z, escrito.sitios[0].dibujo], [1, 21.5, 5, true], "beside who turned it on, with a stool");
  assert.equal(A.asiento.interruptor.activa(), true);
  assert.ok(B.vistas.some((v) => v.startsWith("asiento:s1:puesto")), "the stool is drawn");
  // B sits there; A turns it off: B is on their feet, no seats, the places stay in the file
  W.poner(B, 21, 5); W.pump(2);
  B.s.features.use("asiento", "s1"); W.pump(4);
  assert.equal(W.modo(B), MODO_SENTADO);
  assert.deepEqual(A.asiento.interruptor.poner(false), { ok: true }); W.pump(4);
  assert.equal(W.modo(B), MODO_PIE);
  assert.equal(B.asiento.lista().length, 0, "gone");
  const apagado = W.archivos.get("asientos.json") as { activa: boolean; sitios: unknown[] };
  assert.equal(apagado.activa, false);
  assert.equal(apagado.sitios.length, 1, "the places are kept");
  assert.equal(C.asiento.interruptor.activa(), false);
  assert.match(W.log.join("\n"), /apaga los asientos/);
  // back on: the same place, no new one
  assert.deepEqual(A.asiento.interruptor.poner(true), { ok: true }); W.pump(4);
  assert.equal(B.asiento.lista().length, 1);
  assert.equal((W.archivos.get("asientos.json") as { sitios: unknown[] }).sitios.length, 1);
  A.asiento.interruptor.poner(true); W.pump(3);
  assert.match(A.rech.at(-1) ?? "", /ya están encendidos/);
});

test("asiento: the state survives a restart (from the file): off stays off, on stays on, and the seats are free again", () => {
  const W = mundo(2, { sitios: null });
  const [A, B] = W.gente;
  W.pump(4);
  W.decir(A, `/dueño ${ADMIN}`); W.poner(A, 0, 0); W.poner(B, 1.5, 0); W.pump(2);
  A.asiento.interruptor.poner(true); W.pump(4);
  B.s.features.use("asiento", "s1"); W.pump(4);
  assert.equal(W.modo(B), MODO_SENTADO);
  const R = mundo(1, { sitios: null, archivos: W.archivos }); // restart: new server, same folder
  R.pump(4);
  assert.equal(R.gente[0].asiento.lista().length, 1, "the seat was on");
  assert.equal(ocupa(R.gente[0], "s1"), LIBRE, "and free: nobody carries over");
  R.decir(R.gente[0], `/dueño ${ADMIN}`);
  R.gente[0].asiento.interruptor.poner(false); R.pump(4);
  const R2 = mundo(1, { sitios: null, archivos: R.archivos });
  R2.pump(4);
  assert.equal(R2.gente[0].asiento.lista().length, 0, "off stays off");
});

test("asiento: without a folder to write (no files), the switch lasts through a restart by the server's store; a broken file is not overwritten", () => {
  const roto = new Map<string, unknown>([["asientos.json", "esto no es un objeto"]]);
  const io = { leer: (f: string) => roto.get(f), escribir: (f: string, d: unknown) => { roto.set(f, d); } };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "hierba" } }), crearAsiento(null, io)], log: () => {}, identitySign: sign, puede: () => true });
  const t = inst.join(0), c = crearCliente(), s = new ClientSession(t, { features: [c.parts[0]], identity: keeper() });
  for (let i = 0; i < 6; i++) { t.flush(); inst.tick(); t.flush(); }
  c.asiento.interruptor.poner(true);
  for (let i = 0; i < 6; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(c.asiento.lista().length, 0, "refused");
  assert.equal(roto.get("asientos.json"), "esto no es un objeto", "kept verbatim");
  assert.match(c.asiento.interruptor.estado.ultimoRechazo, /asientos\.json no es un objeto JSON/);
  void s;
});
