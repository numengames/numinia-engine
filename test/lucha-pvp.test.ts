// lucha L8 — the player's Estado ladder (server side, no UI): a blow on `p:<entity>` raises one rung of ninguno →
// desestabilizado → confundido → colapsado → aletargado; it settles by itself; PVP is off unless the world turns it on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { ENFRIAMIENTO_TICKS } from "../features/lucha/feature.ts";
import { crearLucha, HZ } from "../features/lucha/server.ts";
import { crearCliente } from "../features/lucha/client.ts";
import { crearEscalera, ESCALERA, CALMA_TICKS, INCAPACITADO_S } from "../features/lucha/estados.ts";
import funciones from "../features/servidor.ts";

const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** n people in a headless world with the lucha server (`pvp` as the world says), a pump by ticks. */
function mundo(n = 2, pvp = true) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas: [], semilla: 7, pvp })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), cli = crearCliente((event, msg) => eventos.push({ event, msg })), k = keeper();
    const s = new ClientSession(t, { features: [cli.part], identity: k, view: {} });
    return { t, s, l: cli.lucha, eventos };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  return { inst, pages, pump, place, evs, log };
}

test("estados: the ladder is pure — one rung per blow, stops at aletargado, settles one rung per CALMA_TICKS, aletargado does not settle", () => {
  assert.deepEqual([...ESCALERA], ["ninguno", "desestabilizado", "confundido", "colapsado", "aletargado"]);
  const L = crearEscalera();
  assert.equal(L.estado(5, 0), "ninguno");
  const subidas = [1, 2, 3, 4, 4, 4].map((_, i) => L.subir(5, i));
  assert.deepEqual(subidas, [1, 2, 3, 4, 4, 4]);
  assert.equal(L.estado(5, 10_000_000), "aletargado", "aletargado is left by reappearing, not by waiting");
  L.reiniciar(5); assert.equal(L.size, 0);
  L.subir(6, 0); L.subir(6, 0); // confundido
  assert.equal(L.estado(6, CALMA_TICKS - 1), "confundido");
  assert.equal(L.estado(6, CALMA_TICKS), "desestabilizado");
  assert.equal(L.estado(6, 2 * CALMA_TICKS), "ninguno");
  assert.equal(L.size, 0, "a settled player takes no memory");
});

test("lucha pvp: hitting a person in a loop climbs the four rungs and then stops; everyone near hears each rung; no health number anywhere", () => {
  assert.ok(funciones.some((f) => f.feature.id === "lucha"));
  const W = mundo(2);
  W.pump(2);
  const [a, b] = W.pages;
  W.place(a.s.entity, 0, 0); W.place(b.s.entity, 1, 0);
  W.pump(12);
  const visto: string[] = [];
  for (let i = 0; i < 6; i++) { assert.deepEqual(a.l.golpear(`p:${b.s.entity}`), { ok: true }); W.pump(ENFRIAMIENTO_TICKS + 1); }
  for (const m of W.evs(a, "estado")) visto.push(String(m.estado));
  assert.deepEqual(visto, ["desestabilizado", "confundido", "colapsado", "aletargado"].slice(0, visto.length));
  // a (the attacker) is not hurt: three rungs on b and the fourth blow lands only while a is not colapsado — a is ninguno
  assert.equal(visto.length, 4, `rungs seen: ${visto.join(",")}`);
  assert.equal(W.evs(b, "estado").length, 4, "the target hears its own rungs");
  assert.equal(W.evs(a, "estado")[0].objetivo, `p:${b.s.entity}`);
  assert.equal(W.evs(a, "golpe").length, 0, "a person has no coherence/damage number");
  assert.ok(W.evs(a, "rechazado").some((m) => String(m.motivo).includes("aletargada")), "the 5th blow on an Aletargado person is refused");
});

test("lucha pvp: refused when the world has no PVP, on yourself, on nobody; out of reach = aire; the cooldown swallows a repeat; a colapsado person cannot strike", () => {
  const off = mundo(2, false);
  off.pump(2);
  off.place(off.pages[0].s.entity, 0, 0); off.place(off.pages[1].s.entity, 1, 0); off.pump(12);
  off.pages[0].l.golpear(`p:${off.pages[1].s.entity}`); off.pump(2);
  assert.ok(off.evs(off.pages[0], "rechazado").some((m) => String(m.motivo).includes("no se lucha entre personas")));
  assert.equal(off.evs(off.pages[1], "estado").length, 0);

  const W = mundo(2);
  W.pump(2);
  const [a, b] = W.pages;
  W.place(a.s.entity, 0, 0); W.place(b.s.entity, 30, 0); W.pump(12);
  a.l.golpear(`p:${b.s.entity}`); W.pump(2);
  assert.equal(W.evs(a, "aire").length, 1, "30 m away");
  a.l.golpear(`p:${a.s.entity}`); W.pump(6); a.l.golpear("p:999"); W.pump(6);
  assert.equal(W.evs(a, "rechazado").length, 2, "yourself and nobody");
  W.place(b.s.entity, 1, 0); W.pump(12);
  a.l.golpear(`p:${b.s.entity}`); W.pump(1); a.l.golpear(`p:${b.s.entity}`); W.pump(2);
  assert.equal(W.evs(b, "estado").length, 1, "the second blow is swallowed by the cooldown");
  // b gets colapsado (3 rungs) and then cannot strike a
  for (let i = 0; i < 2; i++) { W.pump(ENFRIAMIENTO_TICKS + 1); a.l.golpear(`p:${b.s.entity}`); W.pump(1); }
  W.pump(ENFRIAMIENTO_TICKS + 1);
  b.l.golpear(`p:${a.s.entity}`); W.pump(2);
  assert.ok(W.evs(b, "rechazado").some((m) => String(m.motivo).includes("colapsado")));
  assert.ok(W.evs(a, "estado").every((m) => m.objetivo === `p:${b.s.entity}`), "a was never hit");
});

test("lucha pvp: reaching Aletargado freezes the person, then the server puts them on their last safe spot with Estado ninguno — nothing else of theirs is touched", () => {
  const W = mundo(2);
  W.pump(2);
  const [a, b] = W.pages;
  W.place(a.s.entity, 0, 0); W.place(b.s.entity, 1, 0);
  W.pump(12);                                                   // b stands on the ground: that is its safe spot
  const seguro = { x: 1, z: 0 };
  for (let i = 0; i < 4; i++) { a.l.golpear(`p:${b.s.entity}`); W.pump(ENFRIAMIENTO_TICKS + 1); }
  assert.equal(W.evs(b, "estado").at(-1)!.estado, "aletargado");
  assert.equal(W.evs(b, "reaparece").length, 0, "not yet: still for a while");
  W.place(b.s.entity, 6, 0); W.inst.sim.tf.cols.y[b.s.entity] = fx(40); // knocked off the floor meanwhile (e.g. by a world's mover): not a safe spot
  W.pump(INCAPACITADO_S * HZ + 4);
  assert.equal(W.evs(b, "reaparece").length, 1);
  assert.equal(W.evs(a, "reaparece").length, 1, "the attacker, near, sees it too");
  const x = W.inst.sim.tf.cols.x[b.s.entity] / 65536, z = W.inst.sim.tf.cols.z[b.s.entity] / 65536;
  assert.ok(Math.hypot(x - seguro.x, z - seguro.z) < 2, `back on the safe spot, at ${x},${z}`);
  // Estado is ninguno again: b can strike and be struck from the first rung
  b.l.golpear(`p:${a.s.entity}`); W.pump(2);
  assert.equal(W.evs(a, "estado").filter((m) => m.objetivo === `p:${a.s.entity}`).at(-1)?.estado, "desestabilizado");
});
