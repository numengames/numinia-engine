// lucha MIS-245: the beast walks and strikes first, and there are more of them. The SERVER decides every step and every
// blow (features/lucha/persecucion.ts is pure; server.ts calls it every MOVER_CADA_TICKS ticks); the page only draws.
// Deterministic: the same seed and the same inputs give the same walk and the same blows (a hash of the trace).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { solidsFrom } from "../packages/sim/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { VIDA_JUGADOR_MAX, REAPARICION_JUGADOR_TICKS } from "../features/lucha/feature.ts";
import { crearLucha, valorDe } from "../features/lucha/server.ts";
import type { Criatura } from "../features/lucha/server.ts";
import { crearCliente, aspecto, COLOR_ATAQUE, SUAVIZAR_PASOS } from "../features/lucha/client.ts";
import { BESTIARIO } from "../features/lucha/bestiario.ts";
import { MOVER_CADA_TICKS, PARAR_FRACCION, elegirObjetivo, pasoDeCriatura, intermedios } from "../features/lucha/persecucion.ts";
import type { Conducta } from "../features/lucha/persecucion.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x: string) => { t = x; } }; };
const G: Criatura = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0 };
const KEY = "c:guardian-1";
const K = BESTIARIO["guardian-crisalida"].conducta!;

/** A headless arena: the lucha server, n pages, a pump by ticks; `place` puts a person where the test says (as the sim would have). */
function mundo(n = 1, criaturas: Criatura[] = [G], semilla = 7) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas, semilla })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [], seen: string[] = [];
    const t = inst.join(i), cli = crearCliente((event, msg) => eventos.push({ event, msg }));
    const s = new ClientSession(t, { features: [cli.part], identity: keeper(), view: { place: (key, o) => seen.push(`place ${key} ${o ? `${o.x},${o.z} ${(o as { color?: string }).color}` : "null"}`), tag: () => {}, label: () => {}, bounce: () => {} } });
    return { t, s, l: cli.lucha, eventos, seen };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  const criatura = (key = KEY) => { for (const [k, v] of inst.features.allState()) if (k === `lucha:${key}`) return v as Record<string, number | string | boolean>; throw new Error("sin criatura"); };
  return { inst, pages, pump, place, evs, criatura, log };
}
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z));

test("persecucion (pure): it steps towards the nearest person it sees, never closer than 90 % of its reach, and says when the blow reaches", () => {
  const casa = { x: 0, z: 0 }, gente = [{ entidad: 3, x: 6, z: 0 }, { entidad: 2, x: 0, z: 8 }];
  const p = pasoDeCriatura(casa, casa, K, gente, MOVER_CADA_TICKS / 20);
  assert.equal(p.objetivo, 3); assert.equal(p.modo, "alerta");
  assert.ok(Math.abs(p.x - K.velocidad * 0.2) < 0.011 && p.z === 0, `un paso de ${K.velocidad * 0.2} m: ${p.x}`);
  assert.equal(p.alcanza, false);
  // already close: it stops at the parar distance and strikes
  const cerca = pasoDeCriatura({ x: 2, z: 0 }, casa, K, [{ entidad: 3, x: 5, z: 0 }], 1);
  assert.ok(Math.abs(5 - cerca.x - K.alcance * PARAR_FRACCION) < 0.011, `se para a ${K.alcance * PARAR_FRACCION} m, no encima: ${cerca.x}`);
  assert.equal(cerca.alcanza, true);
  // same inputs, same answer
  assert.deepEqual(pasoDeCriatura(casa, casa, K, gente, 0.2), pasoDeCriatura(casa, casa, K, [...gente].reverse(), 0.2));
});

test("persecucion (pure): the leash and the sight — who is outside is not chased; with nobody it walks home and calms down there", () => {
  const casa = { x: 0, z: 0 };
  assert.equal(elegirObjetivo(casa, casa, K, [{ entidad: 1, x: K.vision + 1, z: 0 }]), null, "farther than it sees");
  assert.equal(elegirObjetivo({ x: 8, z: 0 }, casa, K, [{ entidad: 1, x: K.correa + 1, z: 0 }]), null, "inside its sight but out of its territory (no persigue a quien abandona el territorio)");
  assert.equal(elegirObjetivo(casa, casa, K, [{ entidad: 9, x: 3, z: 0 }, { entidad: 4, x: 0, z: 3 }])?.entidad, 4, "a tie goes to the lowest entity");
  const vuelta = pasoDeCriatura({ x: 5, z: 0 }, casa, K, [], 0.2);
  assert.equal(vuelta.modo, "alerta"); assert.ok(vuelta.x < 5 && vuelta.x > 4);
  const llega = pasoDeCriatura({ x: 0.3, z: 0 }, casa, K, [], 0.2);
  assert.deepEqual([llega.x, llega.z, llega.modo], [0, 0, "quieta"]);
  assert.deepEqual(intermedios({ x: 0, z: 0 }, { x: 4, z: 8 }, 4).at(-1), { x: 4, z: 8 }, "the last in-between frame is the real place");
  assert.equal(intermedios({ x: 0, z: 0 }, { x: 4, z: 8 }, 4).length, 4);
});

test("lucha walks: the Guardián goes for a person 5 m away, its solid box goes with it, and it stops next to them — not on top", async () => {
  const W = mundo(1);
  W.pump(2);
  const e = W.pages[0].s.entity;
  W.place(e, 14, 0); W.pump(1);
  const antes = W.criatura();
  assert.equal(antes.x, 10); assert.equal(antes.modo, "quieta");
  W.pump(MOVER_CADA_TICKS * 2 + 1);
  const mitad = W.criatura();
  assert.ok(Number(mitad.x) > 10 && Number(mitad.x) < 14, `ha echado a andar hacia la persona: x ${mitad.x}`);
  assert.equal(mitad.modo, "alerta");
  assert.ok(Math.abs((Number(mitad.bx0) + Number(mitad.bx1)) / 2 - Number(mitad.x)) < 0.02, "its box is centred on where it stands now");
  assert.equal(solidsFrom([[KEY, mitad]]).length, 6);
  W.pump(80);
  const c = W.criatura(), yo = { x: 14, z: 0 };
  assert.ok(dist(c, yo) <= K.alcance && dist(c, yo) >= K.alcance * PARAR_FRACCION - 0.02, `parada junto a la persona (a ${dist(c, yo).toFixed(2)} m), sin pisarla`);
  assert.ok(Number(c.bx1) < 14 - 0.3, "su caja no cubre a la persona");
  // the page saw it walk: it glides (timers) and its last drawing is at the real place
  await new Promise((r) => setTimeout(r, 400));
  const lugares = W.pages[0].seen.filter((s) => s.startsWith("place ") && !s.endsWith("null"));
  const [lx, lz] = lugares.at(-1)!.split(" ")[2].split(",").map(Number);
  assert.ok(lugares.length > 8 && Math.abs(lx - Number(c.x)) < 0.01 && Math.abs(lz - Number(c.z)) < 0.01, `${lugares.length} drawings, last at the real place: ${lugares.at(-1)} vs ${c.x},${c.z}`);
});

test("lucha strikes first: in reach it hits on its own cooldown with ITS damage, the player's life falls, at 0 they fall and are left alone until they come back", () => {
  const W = mundo(1);
  W.pump(2);
  const p = W.pages[0], e = p.s.entity;
  W.place(e, 13, 0);
  W.pump(MOVER_CADA_TICKS * 3);
  W.place(e, 13, 0);
  W.pump(16 * 3 + 2);
  const heridos = W.evs(p, "jugadorHerido");
  assert.ok(heridos.length >= 2 && heridos.length <= 4, `un golpe cada ${K.enfriamiento} ticks, sin que nadie le toque (hubo ${heridos.length})`);
  for (const h of heridos) assert.ok(Number(h.dano) >= K.dano && Number(h.dano) < K.dano + K.variacion, `daño de su ficha ${K.dano}..${K.dano + K.variacion - 1}: ${h.dano}`);
  const ataques = W.evs(p, "ataca");
  assert.equal(ataques.length, heridos.length, "one `ataca` per wound, for the others to see");
  assert.equal(ataques[0].objetivo, KEY); assert.equal(ataques[0].a, e);
  // keep standing there until they fall
  let n = 0;
  while (W.evs(p, "jugadorCaido").length === 0 && n++ < 400) W.pump(MOVER_CADA_TICKS);
  assert.equal(W.evs(p, "jugadorCaido").length, 1, "the beast alone can fell a player");
  let vida = VIDA_JUGADOR_MAX; for (const h of W.evs(p, "jugadorHerido")) { vida = Math.max(0, vida - Number(h.dano)); assert.equal(Number(h.vida), vida); }
  assert.equal(vida, 0);
  const total = W.evs(p, "jugadorHerido").length;
  W.pump(REAPARICION_JUGADOR_TICKS - 10);
  assert.equal(W.evs(p, "jugadorHerido").length, total, "a fallen person is not hit again");
  W.pump(40);
  assert.equal(W.evs(p, "jugadorVuelve").length, 1);
  W.pump(40);
  assert.ok(W.evs(p, "jugadorHerido").length > total, "back on their feet, in reach: it goes for them again");
});

test("lucha walks home: when the person leaves its territory it stops chasing, walks back to its spot and calms down there", () => {
  const W = mundo(1);
  W.pump(2);
  const e = W.pages[0].s.entity;
  W.place(e, 14, 0); W.pump(60);
  assert.ok(Number(W.criatura().x) > 11);
  W.place(e, 10 + K.correa + 12, 0);                             // far beyond its leash (and its sight)
  W.pump(200);
  const c = W.criatura();
  assert.deepEqual([c.x, c.z, c.modo], [10, 0, "quieta"], "home and calm");
  assert.equal(W.evs(W.pages[0], "ataca").length > 0, true, "it did hit before");
});

test("lucha: a world pins a creature with fija: true — it never walks and never strikes first; the strike-back when you hit it is unchanged", () => {
  const W = mundo(1, [{ ...G, fija: true }]);
  W.pump(2);
  const e = W.pages[0].s.entity;
  W.place(e, 11.5, 0); W.pump(80);
  assert.deepEqual([W.criatura().x, W.criatura().modo], [10, "quieta"]);
  assert.equal(W.evs(W.pages[0], "jugadorHerido").length, 0);
  W.pages[0].l.golpear(KEY); W.pump(3);
  assert.equal(W.evs(W.pages[0], "jugadorHerido").length, 1, "hit it and it hits back");
});

test("lucha: the same seed and the same positions give the same walk and the same blows (hash of the trace)", () => {
  const trazo = () => {
    const W = mundo(1, [G], 11); W.pump(2);
    const e = W.pages[0].s.entity, t: string[] = [];
    W.place(e, 13, 2);
    for (let i = 0; i < 120; i++) { W.pump(1); const c = W.criatura(); t.push(`${c.x},${c.z},${c.modo}`); }
    t.push(JSON.stringify(W.evs(W.pages[0], "jugadorHerido")));
    return createHash("sha256").update(t.join("|")).digest("hex");
  };
  assert.equal(trazo(), trazo());
});

test("lucha: a dissolved walker comes back at HOME, whole, and walks again", () => {
  const W = mundo(1, [{ ...G, reaparicion: 5 }]);
  W.pump(2);
  const p = W.pages[0], e = p.s.entity;
  W.place(e, 13, 0); W.pump(60);
  assert.ok(Number(W.criatura().x) > 10.5, "it walked");
  let n = 0;
  while (W.criatura().modo !== "disuelta" && n++ < 80) { p.l.golpear(KEY); W.pump(12); if (W.evs(p, "jugadorCaido").length > W.evs(p, "jugadorVuelve").length) { W.pump(REAPARICION_JUGADOR_TICKS + 2); W.place(e, 13, 0); } }
  assert.equal(W.criatura().modo, "disuelta");
  W.place(e, 40, 40);
  W.pump(5 * 20 + 20);
  const c = W.criatura();
  assert.deepEqual([c.x, c.z, c.modo, c.coherencia], [10, 0, "quieta", c.coherenciaMax], "back at its spot, whole");
});

test("bestiario: every sheet makes a valid creature the shared state accepts, with its canon quote and — for the walkers — sane numbers", () => {
  assert.ok(Object.keys(BESTIARIO).length >= 4, "more creatures than the Guardián");
  for (const [id, f] of Object.entries(BESTIARIO)) {
    const v = valorDe({ id: "x", especie: id, x: 5, z: 5 });
    assert.ok(v && Number(v.bx1) > Number(v.bx0) && Number(v.coherenciaMax) === f.coherenciaMax, id);
    assert.ok(f.fuente.includes("«") || f.fuente.includes("\""), `${id}: cites its source`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(f.color) && f.caja.ancho > 0 && f.caja.alto > 0 && f.caja.largo > 0, id);
    const k: Conducta | undefined = f.conducta;
    if (k) assert.ok(k.velocidad > 0 && k.velocidad < 6 && k.vision >= 4 && k.correa >= 4 && k.alcance >= f.radio * 0.5 - 0.5 && k.enfriamiento >= 8 && k.dano >= 1 && k.variacion >= 1 && k.dano + k.variacion - 1 <= 20, `${id} numbers`);
    const W = mundo(1, [{ id: "bicho", especie: id, x: 5, z: 5 }]); W.pump(2);
    assert.equal(W.criatura("c:bicho").especie, id, `${id} placed in a world`);
  }
});

test("lucha page: a lunge flashes the creature red and a step is drawn as a glide that ends at the real place", () => {
  const W = mundo(1);
  W.pump(2);
  const p = W.pages[0], e = p.s.entity;
  W.place(e, 13, 0);
  W.pump(MOVER_CADA_TICKS * 3 + 1);
  const v = W.criatura();
  assert.equal(aspecto(v as never, COLOR_ATAQUE).color, COLOR_ATAQUE);
  W.place(e, 13, 0); W.pump(60);
  assert.ok(p.seen.some((s) => s.endsWith(`${COLOR_ATAQUE}`)), `the page painted the lunge: ${p.seen.slice(-4).join(" | ")}`);
  assert.ok(SUAVIZAR_PASOS >= 2);
});
