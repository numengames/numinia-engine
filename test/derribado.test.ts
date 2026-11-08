// derribado v1 (Y45 + Y46 + Y47), headless and deterministic (in-memory world, pages pumped by 20 Hz ticks, lucha's seeded blows).
// Falling is not dying: a person whose life hits 0 (lucha) is DERRIBADO when the world has the piece on; a companion lifts them
// (no item, no cost, in reach, never themselves, never from the floor), or the clock / `rendirse` puts them on the world's
// reappearance spot; nothing is lost; a world without derribado.json behaves exactly as before (the 5 s fall); the same seed
// gives the same events and the same simulation hash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { stateHash } from "../packages/sim/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearLucha } from "../features/lucha/server.ts";
import { crearCliente } from "../features/lucha/client.ts";
import { ENFRIAMIENTO_TICKS, REAPARICION_JUGADOR_TICKS } from "../features/lucha/feature.ts";
import { derribado, TIEMPO_S } from "../features/derribado/feature.ts";
import { crearDerribado, leerDerribado, HZ } from "../features/derribado/server.ts";
import funciones from "../features/servidor.ts";

const sign = signer("una-clave-de-prueba-larga");
const G = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0, fija: true, reaparicion: 0.05 };
const KEY = "c:guardian-1";
const PUNTO = { x: -20, y: 0, z: 5 };
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

/** n pages; the piece on (`opts`) or absent (null). Page 0 fights; the others stand where `poner` puts them. */
function mundo(n: number, opts: Parameters<typeof crearDerribado>[0], semilla = 7) {
  const log: string[] = [], archivos = new Map<string, unknown>();
  const io = { leer: (f: string) => archivos.get(f), escribir: (f: string, d: unknown) => { archivos.set(f, JSON.parse(JSON.stringify(d))); } };
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas: [G], semilla }), crearDerribado(opts, io)], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { f: string; event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), cli = crearCliente(() => {});
    const s = new ClientSession(t, { features: [cli.part], identity: keeper(), view: { label() {}, bounce() {}, place() {}, tag() {} } });
    s.features.tap((f, event, msg) => { eventos.push({ f, event, msg: msg as Record<string, unknown> }); });
    return { t, s, l: cli.lucha, eventos };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const donde = (e: number) => ({ x: fxToFloat(inst.sim.tf.cols.x[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) });
  const evs = (p: (typeof pages)[number], f: string, event: string) => p.eventos.filter((x) => x.f === f && x.event === event).map((x) => x.msg);
  const estado = (): string[] => [...inst.features.allState()].map(([k]) => k).filter((k) => k.startsWith("derribado:"));
  /** Page 0 fights the guardian until its life is 0 (lucha's seeded blows) and is down. */
  const caer = () => {
    const p = pages[0];
    pump(2); place(p.s.entity, 11, 0); pump(12);
    for (let n = 0; n < 80 && evs(p, "lucha", "jugadorCaido").length === 0; n++) { p.l.golpear(KEY); pump(ENFRIAMIENTO_TICKS); }
    pump(2);
    assert.equal(evs(p, "lucha", "jugadorCaido").length, 1, "la secuencia debe terminar con la persona caída");
  };
  return { inst, pages, pump, place, donde, evs, estado, caer, log, archivos };
}
const levantar = (p: { s: ClientSession }, quien: number) => p.s.features.send("derribado", "levantar", { cosa: `d:${quien}` });

test("derribado: the declaration meets the plug's rules, is in the server list, and every action has its accessible path", () => {
  assert.deepEqual(derribado.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "derribado"));
  for (const v of ["levantar", "pedirAyuda", "rendirse", "encender"]) assert.ok(derribado.intents?.[v]?.spoken, `${v} tiene nombre hablado`);
  assert.ok(derribado.state?.card, "lo puesto en el mundo lleva tarjeta");
  assert.equal(derribado.state?.card?.interact?.intent, "levantar", "«E» junto al derribado levanta: sin gesto especial");
});

test("derribado.json: wrong fields are left out with how to fix them; no file = off", () => {
  assert.equal(leerDerribado(undefined), null);
  const ok = leerDerribado({ reaparicion: { x: 3, z: -4 }, muerteSegura: true, tiempoS: 45 })!;
  assert.deepEqual(ok.problemas, []);
  assert.deepEqual(ok.valor, { activa: true, reaparicion: { x: 3, y: 0, z: -4 }, seguro: true, tiempoS: 45 });
  const mal = leerDerribado({ activa: false, reaparicion: { x: "a" }, muerteSegura: "si", tiempoS: 1 })!;
  assert.equal(mal.problemas.length, 3);
  assert.equal(mal.valor.activa, false);
  assert.deepEqual([mal.valor.reaparicion, mal.valor.seguro, mal.valor.tiempoS], [null, true, TIEMPO_S], "lo que no vale se queda en su valor por defecto");
});

test("derribado: the fall is held open, a companion in reach lifts for nothing, the fighter comes back whole where they stand", () => {
  const W = mundo(3, { reaparicion: PUNTO });
  W.caer();
  const [A, B, C] = W.pages, a = A.s.entity;
  const d = W.evs(A, "derribado", "derribado");
  assert.equal(d.length, 1, "a él: «Estás derribado»");
  assert.deepEqual([d[0].segundos, d[0].seguro], [TIEMPO_S, true]);
  assert.deepEqual(W.estado(), [`derribado:d:${a}`], "la tarjeta del derribado existe en el estado del servidor");
  // lucha's 5 s timer no longer ends the fall: still down well after it
  W.pump(REAPARICION_JUGADOR_TICKS + 20);
  assert.equal(W.evs(A, "lucha", "jugadorVuelve").length, 0, "derribado manda sobre el temporizador de 5 s");
  A.l.golpear(KEY); W.pump(2);
  assert.ok(W.evs(A, "lucha", "rechazado").some((r) => String(r.motivo).includes("caído")), "caído no golpea");
  // refused: nobody there, far away, from the floor, himself
  W.place(B.s.entity, 40, 40); W.place(C.s.entity, 12, 0);
  levantar(B, a); W.pump(2);
  assert.ok(W.evs(B, "derribado", "rechazado").some((r) => String(r.motivo).includes("Acércate")), "lejos");
  levantar(B, 999); W.pump(2);
  assert.ok(W.evs(B, "derribado", "rechazado").some((r) => String(r.motivo).includes("nadie derribado")), "nadie");
  levantar(A, a); W.pump(2);
  assert.ok(W.evs(A, "derribado", "rechazado").some((r) => String(r.motivo).includes("Estás derribado")), "desde el suelo no se levanta a nadie");
  assert.equal(W.estado().length, 1, "nada de eso lo levantó");
  // the companion in reach lifts: no item, no cost
  const antes = W.donde(a);
  levantar(C, a); W.pump(2);
  assert.equal(W.evs(C, "derribado", "levanta").length, 1, "quien está cerca lo ve");
  assert.equal(W.evs(A, "derribado", "levanta")[0].por, C.s.entity);
  assert.deepEqual(W.estado(), [], "ya no hay derribado");
  assert.equal(W.evs(A, "lucha", "jugadorVuelve").length, 1, "la lucha le devuelve la vida entera");
  assert.deepEqual(W.donde(a), antes, "se pone en pie donde estaba");
  assert.equal(W.evs(A, "derribado", "reaparece").length, 0, "levantado no es reaparecer");
  A.l.golpear(KEY); W.pump(2);
  assert.ok(W.evs(A, "lucha", "golpe").length > 0 || W.evs(A, "lucha", "aire").length > 0, "puede volver a pelear");
});

test("derribado: nobody comes → after TIEMPO_S the server puts them on the world's reappearance spot; `rendirse` does it at once", () => {
  const W = mundo(2, { reaparicion: PUNTO, tiempoS: 6 });
  W.caer();
  const A = W.pages[0], a = A.s.entity;
  W.pump(6 * HZ - 30);
  assert.equal(W.estado().length, 1, "todavía derribado un poco antes");
  W.pump(40);
  assert.equal(W.estado().length, 0);
  const r = W.evs(A, "derribado", "reaparece");
  assert.deepEqual([r.length, r[0].seguro], [1, true]);
  W.pump(3);
  const p = W.donde(a);
  assert.ok(Math.hypot(p.x - PUNTO.x, p.z - PUNTO.z) < 1, `en el punto de reaparición (${p.x}, ${p.z})`);
  assert.equal(W.evs(A, "lucha", "jugadorVuelve").length, 1);
  // a second fall, this time giving up
  W.place(a, 11, 0); W.pump(12);
  for (let n = 0; n < 80 && W.evs(A, "lucha", "jugadorCaido").length < 2; n++) { A.l.golpear(KEY); W.pump(ENFRIAMIENTO_TICKS); }
  W.pump(2);
  assert.equal(W.estado().length, 1);
  A.s.features.send("derribado", "rendirse", {}); W.pump(4);
  assert.equal(W.estado().length, 0);
  assert.equal(W.evs(A, "derribado", "reaparece").length, 2);
});

test("derribado: pedirAyuda is heard near, only by the downed, and not repeated every tick", () => {
  const W = mundo(2, { reaparicion: PUNTO });
  const [A, B] = W.pages;
  W.pump(3);
  A.s.features.send("derribado", "pedirAyuda", {}); W.pump(2);
  assert.ok(W.evs(A, "derribado", "rechazado").some((r) => String(r.motivo).includes("derribado")), "de pie no se pide ayuda");
  W.caer();
  W.place(B.s.entity, 14, 0); W.pump(2);
  A.s.features.send("derribado", "pedirAyuda", {}); A.s.features.send("derribado", "pedirAyuda", {}); W.pump(3);
  const ayuda = W.evs(B, "derribado", "ayuda");
  assert.equal(ayuda.length, 1, "una sola llamada seguida");
  assert.equal(ayuda[0].quien, A.s.entity);
});

test("derribado: a world without the piece falls as before (the 5 s timer), and the switch is for whoever rules", () => {
  const W = mundo(2, null);
  W.caer();
  const A = W.pages[0];
  assert.equal(W.evs(A, "derribado", "derribado").length, 0, "apagado: nadie queda derribado");
  assert.deepEqual(W.estado(), []);
  W.pump(REAPARICION_JUGADOR_TICKS + 2);
  assert.equal(W.evs(A, "lucha", "jugadorVuelve").length, 1, "la caída de siempre: se recupera a los 5 s");
  // someone with no role cannot switch it on
  W.pages[1].s.features.send("derribado", "encender", { activa: true }); W.pump(2);
  assert.ok(W.evs(W.pages[1], "derribado", "rechazado").length >= 1);
  assert.equal(W.archivos.has("derribado.json"), false, "nada escrito en la carpeta del mundo");
  assert.ok(!W.log.some((l) => l.includes("listen('lucha'") || l.includes("listen('derribado'")), `lucha y derribado se oyen entre sí: ${W.log.join(" | ")}`);
});

test("derribado: same seed, same events and the same simulation hash", () => {
  const corrida = () => {
    const W = mundo(3, { reaparicion: PUNTO, tiempoS: 8 });
    W.caer();
    W.place(W.pages[2].s.entity, 12, 0); W.pump(2);
    levantar(W.pages[2], W.pages[0].s.entity); W.pump(HZ * 3);
    return { h: stateHash(W.inst.sim), ev: W.pages.map((p) => p.eventos.map((x) => `${x.f}.${x.event}:${JSON.stringify(x.msg)}`)) };
  };
  const a = corrida(), b = corrida();
  assert.equal(a.h, b.h);
  assert.deepEqual(a.ev, b.ev);
  assert.ok(a.ev[0].some((l) => l.startsWith("derribado.derribado")));
});
