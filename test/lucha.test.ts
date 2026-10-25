// lucha v1 (L1): the whole slice headless (in-memory world, two pages, pump by 20 Hz ticks). The server decides: reach
// through `within`, one blow per 0,6 s per player, damage 3-5 from the seeded PRNG, coherence down in the shared state,
// dissolution at 0 (the creature stops being a solid box: `solidsFrom` drops it), return after REAPARICION_S with full
// coherence; the same seed gives the same blows; the page draws through view.place and paints the blow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { solidsFrom } from "../packages/sim/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lucha, DANO_BASE, DANO_VAR, ENFRIAMIENTO_TICKS, REAPARICION_S, VIDA_JUGADOR_MAX, REAPARICION_JUGADOR_TICKS } from "../features/lucha/feature.ts";
import { crearLucha, valorDe, tirarDano, HZ, CRIATURAS_DEFECTO } from "../features/lucha/server.ts";
import { crearCliente, tinte, aspecto } from "../features/lucha/client.ts";
import { BESTIARIO } from "../features/lucha/bestiario.ts";
import funciones from "../features/servidor.ts";
import clientes from "../features/cliente.ts";

const G = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0, fija: true }; // pinned: these tests are about blows, not about the walk (test/lucha-persigue.test.ts)
const KEY = "c:guardian-1";
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

/** A headless arena: the lucha server with a known seed, n pages each with its own controller, a pump by ticks. */
function mundo(n = 2, semilla = 7, criaturas = [G]) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas, semilla })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), cli = crearCliente((event, msg) => eventos.push({ event, msg })), seen: string[] = [], k = keeper();
    const s = new ClientSession(t, { features: [cli.part], identity: k, view: {
      label: (e, text) => seen.push(`label ${e} ${text}`), bounce: (e) => seen.push(`bounce ${e}`),
      place: (key, o) => seen.push(`place ${key} ${o ? `${o.sx}x${o.sy}x${o.sz} ${(o as { color?: string }).color}` : "null"}`),
      tag: (key, t) => seen.push(`tag ${key} ${t ? t.text : "null"}`),
    } });
    return { t, s, l: cli.lucha, seen, eventos, k };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  const estado = () => { for (const [k, v] of inst.features.allState()) if (k === `lucha:${KEY}`) return v; throw new Error("sin criatura"); };
  return { inst, pages, pump, place, evs, estado, log };
}

/** Abilities are struck back now: a long loop can fell the player. Wait out a fall (jugadorCaido without its jugadorVuelve) so a loop tests what it means to. */
function sano(W: ReturnType<typeof mundo>, p: ReturnType<typeof mundo>["pages"][number]) {
  if (W.evs(p, "jugadorCaido").length > W.evs(p, "jugadorVuelve").length) W.pump(REAPARICION_JUGADOR_TICKS + 2);
}

test("lucha: the declaration meets the plug's rules and is in both lists; the sheet is sane", () => {
  assert.deepEqual(lucha.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "lucha") && clientes.some((f) => f.feature.id === "lucha"));
  const f = BESTIARIO["guardian-crisalida"];
  assert.ok(f && f.coherenciaMax > 0 && f.caja.ancho > 0 && f.caja.alto > 0 && f.caja.largo > 0 && /^#[0-9a-f]{6}$/i.test(f.color));
  assert.ok(CRIATURAS_DEFECTO.every((c) => BESTIARIO[c.especie]));
  assert.equal(valorDe({ id: "x", especie: "no-existe", x: 0, z: 0 }), null);
});

test("lucha: the creature's value is a solid box the simulation picks up; a dissolved one is not", () => {
  const v = valorDe(G)!;
  assert.equal(v.solido, true);
  assert.ok(Math.abs(Number(v.bx1) - Number(v.bx0) - BESTIARIO[G.especie].caja.ancho) < 1e-9);
  const cajas = solidsFrom([[KEY, v]]);
  assert.equal(cajas.length, 6);
  assert.equal(solidsFrom([[KEY, { ...v, solido: false }]]).length, 0);
});

test("lucha: a blow within reach lowers coherence by 3-5 and everyone near hears it; out of reach = aire and nothing changes", () => {
  const W = mundo(2);
  W.pump();
  W.pump(2); W.place(W.pages[0].s.entity, 11, 0); W.place(W.pages[1].s.entity, 12, 1); // 1-2 m from the creature's centre
  W.pump(12);
  assert.equal(W.estado().coherencia, 40);
  assert.deepEqual(W.pages[0].l.golpear(), { ok: true });
  W.pump(2);
  const g = W.evs(W.pages[0], "golpe");
  assert.equal(g.length, 1);
  assert.ok(Number(g[0].dano) >= DANO_BASE && Number(g[0].dano) < DANO_BASE + DANO_VAR, `daño ${g[0].dano}`);
  assert.equal(W.estado().coherencia, 40 - Number(g[0].dano));
  assert.equal(W.estado().modo, "alerta");
  assert.equal(W.evs(W.pages[1], "golpe").length, 1, "the neighbour sees the blow");
  // far away: aire, coherence untouched
  W.place(W.pages[1].s.entity, 40, 40);
  W.pump(12);
  const antes = W.estado().coherencia;
  W.pages[1].l.golpear(KEY);
  W.pump(2);
  assert.equal(W.evs(W.pages[1], "aire").length, 1);
  assert.equal(W.estado().coherencia, antes);
});

test("lucha: two blows in a row — the second is swallowed by the cooldown; after ENFRIAMIENTO_TICKS it counts", () => {
  const W = mundo(1);
  W.pump(2);
  W.place(W.pages[0].s.entity, 11, 0);
  W.pump(12);
  W.pages[0].l.golpear(KEY); W.pump(1);
  W.pages[0].l.golpear(KEY); W.pump(2);
  assert.equal(W.evs(W.pages[0], "golpe").length, 1);
  W.pump(ENFRIAMIENTO_TICKS);
  W.pages[0].l.golpear(KEY); W.pump(2);
  assert.equal(W.evs(W.pages[0], "golpe").length, 2);
});

test("lucha: at 0 coherence the creature dissolves (not solid, no prompt), and returns whole after REAPARICION_S", () => {
  const W = mundo(1);
  W.pump(2);
  W.place(W.pages[0].s.entity, 11, 0);
  W.pump(12);
  let n = 0;
  while (W.estado().modo !== "disuelta" && n < 40) { W.pages[0].l.golpear(KEY); W.pump(ENFRIAMIENTO_TICKS); n++; }
  assert.ok(n >= 8 && n <= 14, `${n} golpes para 40 de coherencia con 3-5 por golpe`);
  const v = W.estado();
  assert.equal(v.coherencia, 0); assert.equal(v.solido, false);
  assert.equal(W.evs(W.pages[0], "disuelta").length, 1);
  assert.equal(solidsFrom(W.inst.features.allState()).length, 0, "the box is gone from the simulation's solids");
  assert.equal(W.pages[0].l.ofrece("lucha", KEY), false);
  W.pages[0].l.golpear(KEY); W.pump(2);
  assert.equal(W.evs(W.pages[0], "rechazado").length, 1, "nothing to hit");
  W.pump(REAPARICION_S * HZ + 2);
  const w = W.estado();
  assert.equal(w.modo, "quieta"); assert.equal(w.coherencia, 40); assert.equal(w.solido, true);
  assert.equal(W.evs(W.pages[0], "vuelve").length, 1);
  assert.equal(solidsFrom(W.inst.features.allState()).length, 6);
});

test("lucha: same seed, same blows (tirarDano is pure; two worlds with the same inputs give the same damage)", () => {
  assert.equal(tirarDano(new Uint32Array([42])), tirarDano(new Uint32Array([42])));
  const run = () => { const W = mundo(1, 99); W.pump(2); W.place(W.pages[0].s.entity, 11, 0); W.pump(12); const d: number[] = []; for (let i = 0; i < 5; i++) { W.pages[0].l.golpear(KEY); W.pump(ENFRIAMIENTO_TICKS); } for (const g of W.evs(W.pages[0], "golpe")) d.push(Number(g.dano)); return d; };
  const a = run(), b = run();
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
});

test("lucha: the page draws the creature as the house block scaled to its box, in its colour, with its name; a blow flashes white and shows −N; dissolved = taken away", async () => {
  assert.equal(tinte("#ffffff", 40, 40), "#ffffff");
  assert.equal(tinte("#ffffff", 0, 40), "#6e6e6e");
  const v = valorDe(G)!, a = aspecto(v);
  assert.equal(a.sx, 2.4); assert.equal(a.sy, 1.2); assert.equal(a.sz, 1.4); assert.equal(a.color, BESTIARIO[G.especie].color);
  const W = mundo(1);
  W.pump(2);
  const p = W.pages[0];
  assert.ok(p.seen.some((s) => s.startsWith(`place lucha:${KEY} 2.4x1.2x1.4 ${BESTIARIO[G.especie].color}`)), p.seen.join("\n"));
  assert.ok(p.seen.some((s) => s === `tag lucha:${KEY} Guardián de Crisálida`));
  W.place(p.s.entity, 11, 0); W.pump(12);
  p.l.golpear(KEY); W.pump(2);
  const d = W.evs(p, "golpe")[0].dano;
  assert.ok(p.seen.some((s) => s === `place lucha:${KEY} 2.4x1.2x1.4 #ffffff`), "flash");
  assert.ok(p.seen.some((s) => s === `tag lucha:${KEY} Guardián de Crisálida  −${d}`), "−N in the name");
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(p.seen.at(-1)!.startsWith(`place lucha:${KEY} 2.4x1.2x1.4 #`) && !p.seen.at(-1)!.endsWith("#ffffff"), "the flash ends in its faded colour");
  let n = 0;
  while (W.estado().modo !== "disuelta" && n < 40) { p.l.golpear(KEY); W.pump(ENFRIAMIENTO_TICKS); n++; }
  assert.ok(p.seen.includes(`place lucha:${KEY} null`) && p.seen.includes(`tag lucha:${KEY} null`));
  await new Promise((r) => setTimeout(r, 800)); // the −N timer must not bring a dissolved creature back
  assert.equal(p.seen.at(-1), `tag lucha:${KEY} null`);
});

test("lucha: a world's lucha.json with an unknown species places nothing and says so; the simulation footprint never notices the feature", () => {
  const W = mundo(1, 7, [{ id: "raro", especie: "no-existe", x: 0, z: 0 }]);
  W.pump();
  assert.ok(W.log.some((l) => l.includes("no está en el bestiario")));
  assert.equal([...W.inst.features.allState()].length, 0);
});

test("lucha L2 trozo 1: every blow lands, the creature strikes back — herido, then caído at 0, then reaparece whole after REAPARICION_JUGADOR_TICKS", () => {
  // a tiny respawn (1 tick) so the same creature keeps fighting back long enough to fell VIDA_JUGADOR_MAX
  const W = mundo(1, 7, [{ ...G, reaparicion: 0.05 }]);
  W.pump(2);
  W.place(W.pages[0].s.entity, 11, 0);
  W.pump(12);
  let n = 0;
  while (W.evs(W.pages[0], "jugadorCaido").length === 0 && n < 60) {
    if (W.estado().modo === "disuelta") { W.pump(2); continue; } // wait out the instant respawn
    W.pages[0].l.golpear(KEY);
    W.pump(ENFRIAMIENTO_TICKS);
    n++;
  }
  const heridos = W.evs(W.pages[0], "jugadorHerido");
  assert.ok(heridos.length >= 10, `varios golpes para bajar ${VIDA_JUGADOR_MAX} de vida con 3-5 por golpe (fueron ${heridos.length})`);
  // vida suma: cada golpe resta lo mismo que sufrió la criatura, y nunca baja de 0
  let vidaEsperada = VIDA_JUGADOR_MAX;
  for (const h of heridos) { vidaEsperada = Math.max(0, vidaEsperada - Number(h.dano)); assert.equal(Number(h.vida), vidaEsperada); }
  assert.equal(vidaEsperada, 0, "la secuencia debe terminar con el jugador caído");
  assert.equal(W.evs(W.pages[0], "jugadorCaido").length, 1);
  // caído: no puede golpear
  W.pages[0].l.golpear(KEY); W.pump(2);
  const rechazos = W.evs(W.pages[0], "rechazado");
  assert.ok(rechazos.some((r) => String(r.motivo).includes("caído")));
  // reaparece tras REAPARICION_JUGADOR_TICKS, entero, y vuelve a poder golpear
  W.pump(REAPARICION_JUGADOR_TICKS + 2);
  assert.equal(W.evs(W.pages[0], "jugadorVuelve").length, 1);
  if (W.estado().modo === "disuelta") W.pump(2);
  W.pages[0].l.golpear(KEY); W.pump(2);
  assert.equal(W.evs(W.pages[0], "jugadorHerido").length, heridos.length + 1, "puede golpear (y le golpean) otra vez");
});

test("lucha L2 trozo 1: mismo hash en dos mundos — misma semilla, mismos golpes, mismo rastro de vida del jugador", () => {
  const run = () => {
    const W = mundo(1, 55, [{ ...G, reaparicion: 0.05 }]);
    W.pump(2);
    W.place(W.pages[0].s.entity, 11, 0);
    W.pump(12);
    for (let i = 0; i < 20; i++) {
      if (W.estado().modo === "disuelta") { W.pump(2); continue; }
      W.pages[0].l.golpear(KEY);
      W.pump(ENFRIAMIENTO_TICKS);
    }
    const heridos = W.evs(W.pages[0], "jugadorHerido");
    const caido = W.evs(W.pages[0], "jugadorCaido").length;
    if (caido) W.pump(REAPARICION_JUGADOR_TICKS + 2);
    const vuelve = W.evs(W.pages[0], "jugadorVuelve").length;
    return { heridos, caido, vuelve };
  };
  const hash = (r: ReturnType<typeof run>) => createHash("sha256").update(JSON.stringify(r)).digest("hex");
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.caido === 1, "la vida debe caer a 0 en esta carrera para que la comparación demuestre herido → caído → reaparece");
  assert.equal(hash(a), hash(b), "el mismo seguimiento (herido → caído → reaparece) da el mismo hash en dos mundos");
});


// ---- combate nivel 2, h1: the Eclipse Mnémico kit (server-side; no UI) ----
import { ECLIPSE, cargaTras, CARGA_MAX } from "../features/lucha/habilidades.ts";

test("lucha h1: the kit table matches the design (damage / cooldown / cost / Carga generated)", () => {
  const f = (k: string) => { const h = ECLIPSE[k]; return [h.dano, h.enfriamiento, h.coste, h.genera]; };
  assert.deepEqual(f("corte-breve"), [12, 1, 0, 12]);
  assert.deepEqual(f("incision-semantica"), [30, 4, 30, 0]);
  assert.deepEqual(f("discontinuidad"), [55, 8, 55, 0]);
  assert.equal(cargaTras(95, ECLIPSE["corte-breve"]), CARGA_MAX, "Carga caps at 100");
  assert.equal(cargaTras(40, ECLIPSE["incision-semantica"]), 10);
  assert.ok(lucha.issues.length === 0);
});

test("lucha h1: abilities in a loop respect their own cooldown and need Carga", () => {
  const big = { ...G, reaparicion: 0.05 };           // comes back whole a tick after dissolving: the dummy never runs out
  const W = mundo(1, 7, [big]);
  const p = W.pages[0], hab = (c: string) => { sano(W, p); p.l.habilidad(c); W.pump(1); };
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  const usos = (c: string) => W.evs(p, "habilidad").filter((m) => m.cual === c).length;
  // no Carga: both spenders are refused with a reason, nothing happens
  hab("incision-semantica"); hab("discontinuidad"); W.pump(2);
  assert.equal(W.evs(p, "habilidad").length, 0);
  assert.equal(W.evs(p, "rechazado").length, 2);
  assert.equal(p.l.carga(), 0);
  // Corte Breve: 1 s cooldown (20 ticks). Spam 60 ticks → exactly 3 uses (ticks 0, 20, 40), +12 Carga each
  for (let i = 0; i < 60; i++) hab("corte-breve");
  W.pump(2);
  assert.equal(usos("corte-breve"), 3);
  assert.equal(p.l.carga(), 36);
  // Incisión: costs 30 → Carga 6; the second try (no Carga, then cooldown) does nothing
  hab("incision-semantica"); W.pump(2);
  assert.equal(usos("incision-semantica"), 1);
  assert.equal(p.l.carga(), 6);
  hab("incision-semantica"); W.pump(2);
  assert.equal(usos("incision-semantica"), 1);
  // refill past 55 with Corte Breve (6 + 12*5 = 66), then Discontinuidad: 66 − 55 = 11, damage 55
  for (let i = 0; i < 5; i++) { hab("corte-breve"); W.pump(20); }
  assert.equal(p.l.carga(), 66);
  hab("discontinuidad"); W.pump(2);
  const d = W.evs(p, "habilidad").filter((m) => m.cual === "discontinuidad");
  assert.equal(d.length, 1);
  assert.equal(d[0].dano, 55);
  assert.equal(p.l.carga(), 11);
  // Discontinuidad cooldown 8 s = 160 ticks; with Carga 59 (4 cortes: few enough that the strike-backs do not fell the player and
  // stretch the clock) it is still refused silently until then
  for (let i = 0; i < 4; i++) { hab("corte-breve"); W.pump(20); }
  assert.equal(W.evs(p, "jugadorCaido").length, 0, "this section is about the cooldown, not about a fall");
  assert.ok(p.l.carga() >= 55);
  hab("discontinuidad"); W.pump(2);
  assert.equal(usos("discontinuidad"), 1, "still cooling down");
  W.pump(80);                                                       // 4 × 20 + 80 ≥ 160: the cooldown is over
  hab("discontinuidad"); W.pump(2);
  assert.equal(usos("discontinuidad"), 2);
});

test("lucha h1: out of reach = aire and no Carga spent; unknown ability / creature are refused", () => {
  const W = mundo(1);
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 40, 40); W.pump(12);
  p.l.habilidad("corte-breve", KEY); W.pump(2);
  assert.equal(W.evs(p, "aire").length, 1);
  assert.equal(p.l.carga(), 0);
  p.l.habilidad("corte-breve", "c:nada"); W.pump(2);
  assert.equal(W.evs(p, "rechazado").length, 1);
});

// ---- combate nivel 2, h3: critical hits (20 % / x2), decided by the server's seeded PRNG ----
import { tirarCritico } from "../features/lucha/server.ts";
import { CRITICO_PCT, CRITICO_X } from "../features/lucha/habilidades.ts";
import { textoDano, COLOR_CRITICO } from "../features/lucha/client.ts";

/** Run n Corte Breve uses on a creature that returns at once; the list of [critico, dano] the page saw. */
function rafaga(semilla: number, n: number) {
  const W = mundo(1, semilla, [{ ...G, reaparicion: 0.05 }]);
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  for (let i = 0; i < n; i++) { sano(W, p); p.l.habilidad("corte-breve"); W.pump(20); }
  W.pump(2);
  return { W, p, hits: W.evs(p, "habilidad").map((m) => [m.critico === true, Number(m.dano)] as const) };
}

test("lucha h3: ~1 in 5 hits is critical and doubles the number; same seed = same crits", () => {
  const N = 300, { hits, W, p } = rafaga(11, N);
  assert.equal(hits.length, N);
  const crits = hits.filter(([c]) => c).length;
  assert.ok(crits >= N * 0.1 && crits <= N * 0.3, `crits ${crits}/${N} should be near ${CRITICO_PCT}%`);
  for (const [c, d] of hits) assert.equal(d, c ? 12 * CRITICO_X : 12);
  assert.equal(W.evs(p, "critico").length, crits, "one `critico` event per critical");
  assert.deepEqual(rafaga(11, 60).hits, hits.slice(0, 60), "replayable");
  assert.notDeepEqual(rafaga(12, 60).hits, hits.slice(0, 60), "another seed rolls other crits");
  // the roll is the pure PRNG function: 20 % of many draws
  const r = new Uint32Array([5]); let k = 0; for (let i = 0; i < 5000; i++) if (tirarCritico(r)) k++;
  assert.ok(k > 800 && k < 1200, `${k}/5000`);
});

test("lucha h3: a critical applies the doubled damage to coherence, and the page paints it gold with ¡CRÍTICO!", () => {
  const W = mundo(1, 11, [{ ...G, reaparicion: 0.05 }]);
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  let visto = false;
  for (let i = 0; i < 40 && !visto; i++) {
    sano(W, p);
    const antes = Number(W.estado().coherencia);
    p.l.habilidad("corte-breve"); W.pump(2);
    const ult = W.evs(p, "habilidad").at(-1)!;
    assert.equal(Number(ult.queda), Math.max(0, antes - Number(ult.dano)), "queda = before − damage");
    if (Number(ult.queda) > 0) assert.equal(Number(W.estado().coherencia), Number(ult.queda));
    if (ult.critico && Number(ult.queda) > 0) {   // a killing blow dissolves the creature: nothing left to paint
      visto = true;
      assert.ok(p.seen.some((s) => s.startsWith(`tag lucha:${KEY} `) && s.includes("¡CRÍTICO! −24")), "damage tag");
      assert.ok(p.seen.some((s) => s.includes(`place lucha:${KEY}`) && s.endsWith(COLOR_CRITICO)), "gold flash");
    }
    W.pump(20);
  }
  assert.ok(visto, "a critical showed up within the first hits");
  assert.equal(textoDano(12, false), "  −12");
});

// ---- combate nivel 2, h2: the Carga bar follows the server's `carga` ----
import { vistaCarga } from "../features/lucha/habilidades.ts";

test("lucha h2: the bar view is clamped and says which abilities are affordable", () => {
  assert.deepEqual(vistaCarga(0), { pct: 0, texto: "Carga 0/100", listas: { "corte-breve": true, "incision-semantica": false, "discontinuidad": false } });
  assert.equal(vistaCarga(30).listas["incision-semantica"], true);
  assert.equal(vistaCarga(54).listas["discontinuidad"], false);
  assert.equal(vistaCarga(55).listas["discontinuidad"], true);
  assert.equal(vistaCarga(250).pct, 100);
  assert.equal(vistaCarga(NaN).pct, 0);
});

test("lucha h2: Corte Breve raises the page's bar by 12, Incisión Semántica lowers it by 30; the page is told on each change and knows there is fighting", () => {
  const W = mundo(1, 7, [{ ...G, reaparicion: 0.05 }]);
  const p = W.pages[0];
  let avisos = 0; p.l.alCambiar(() => { avisos++; });
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  assert.equal(p.l.activo(), true, "a creature reached the page");
  for (let i = 0; i < 3; i++) { p.l.habilidad("corte-breve"); W.pump(20); }
  assert.equal(vistaCarga(p.l.carga()).pct, 36);
  const antes = avisos;
  p.l.habilidad("incision-semantica"); W.pump(2);
  assert.equal(vistaCarga(p.l.carga()).pct, 6, "36 − 30");
  assert.ok(avisos > antes, "the bar is repainted");
});

test("lucha h2: the server's refusal reaches the page's listener in its own words, every time", () => {
  const W = mundo(1);
  const p = W.pages[0], dichos: string[] = [];
  p.l.alRechazar((m) => dichos.push(m));
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  p.l.habilidad("corte-breve", "c:nada"); W.pump(2);
  p.l.habilidad("corte-breve", "c:nada"); W.pump(2);
  assert.equal(dichos.length, 2);
  assert.ok(dichos.every((d) => d.length > 0 && d === p.l.aviso()));
});

test("lucha h2: a page with no creature and no Carga yet does not claim there is fighting (the HUD stays «Próximamente»)", () => {
  const W = mundo(1, 7, []);
  W.pump(4);
  assert.equal(W.pages[0].l.activo(), false);
  assert.equal(W.pages[0].l.estado(), undefined);
  assert.deepEqual(W.pages[0].l.habilidad("corte-breve"), { ok: false, why: "no hay ninguna criatura cerca" });
});


// ---- habilidad shares the creature's strike-back with `golpear` (Pablo 19-10, #145's life/fall) ----

test("lucha: an ability the creature survives is struck back like a blow — jugadorHerido, life down by the creature's roll (not the ability's damage)", () => {
  const W = mundo(1, 7);
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  p.l.habilidad("corte-breve"); W.pump(2);
  const h = W.evs(p, "habilidad");
  assert.equal(h.length, 1);
  const MAX = BESTIARIO[G.especie].coherenciaMax;
  assert.equal(h[0].queda, MAX - Number(h[0].dano), "the creature survives (a critical doubles the 12)");
  assert.ok(Number(h[0].queda) > 0);
  const heridos = W.evs(p, "jugadorHerido");
  assert.equal(heridos.length, 1, "one strike back for one ability");
  assert.ok(Number(heridos[0].dano) >= DANO_BASE && Number(heridos[0].dano) < DANO_BASE + DANO_VAR, `the creature's own roll ${DANO_BASE}..${DANO_BASE + DANO_VAR - 1}, not the ability's 12 (was ${heridos[0].dano})`);
  assert.equal(heridos[0].vida, VIDA_JUGADOR_MAX - Number(heridos[0].dano));
  // a second ability a cooldown later keeps subtracting from the same life
  W.pump(20);
  p.l.habilidad("corte-breve"); W.pump(2);
  const dos = W.evs(p, "jugadorHerido");
  assert.equal(dos.length, 2);
  assert.equal(dos[1].vida, VIDA_JUGADOR_MAX - Number(dos[0].dano) - Number(dos[1].dano));
});

test("lucha: abilities alone can fell the player (caído), and a fallen player's abilities are refused until jugadorVuelve", () => {
  const W = mundo(1, 7, [{ ...G, reaparicion: 0.05 }]);
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  for (let n = 0; n < 60 && W.evs(p, "jugadorCaido").length === 0; n++) {
    if (W.estado().modo === "disuelta") { W.pump(2); continue; }
    p.l.habilidad("corte-breve"); W.pump(20);
  }
  assert.equal(W.evs(p, "jugadorCaido").length, 1, "the strike-backs of abilities reach life 0");
  assert.equal(W.evs(p, "jugadorHerido").at(-1)!.vida, 0);
  const antes = W.evs(p, "habilidad").length;
  if (W.estado().modo === "disuelta") W.pump(2);
  p.l.habilidad("corte-breve"); W.pump(2);
  assert.equal(W.evs(p, "habilidad").length, antes, "fallen: the ability does nothing");
  assert.ok(W.evs(p, "rechazado").some((r) => String(r.motivo).includes("caído")));
  W.pump(REAPARICION_JUGADOR_TICKS + 2);
  assert.equal(W.evs(p, "jugadorVuelve").length, 1);
});

test("lucha: an ability that dissolves the creature (Discontinuidad 55 vs the Guardián's 40 coherence) is NOT struck back — it is gone", () => {
  const W = mundo(1, 7, [{ ...G, reaparicion: 0.05 }]);    // comes back whole a tick after dissolving, so Carga can be built
  const p = W.pages[0];
  W.pump(2); W.place(p.s.entity, 11, 0); W.pump(12);
  for (let n = 0; n < 40 && p.l.carga() < 55; n++) {      // Carga 55 for Discontinuidad, from Corte Breve
    if (W.estado().modo === "disuelta") { W.pump(2); continue; }
    p.l.habilidad("corte-breve"); W.pump(20);
  }
  assert.ok(p.l.carga() >= 55, `Carga ${p.l.carga()} should pay Discontinuidad`);
  for (let n = 0; n < 20 && Number(W.estado().coherencia) < BESTIARIO[G.especie].coherenciaMax; n++) {   // finish the creature off with Corte Breve; it comes back whole
    if (W.estado().modo !== "disuelta") { p.l.habilidad("corte-breve"); W.pump(20); } else W.pump(2);
  }
  W.pump(3);
  assert.equal(W.estado().coherencia, BESTIARIO[G.especie].coherenciaMax, "a creature whole again");
  assert.ok(p.l.carga() >= 55, "and the Carga is still there");
  const heridos = W.evs(p, "jugadorHerido").length, caidos = W.evs(p, "jugadorCaido").length;
  assert.equal(caidos, 0, "the player is still standing before the finisher");
  const vistas = W.evs(p, "disuelta").length;
  p.l.habilidad("discontinuidad"); W.pump(2);
  const d = W.evs(p, "habilidad").filter((m) => m.cual === "discontinuidad");
  assert.equal(d.length, 1);
  assert.ok(Number(d[0].dano) >= 55 && Number(d[0].dano) > BESTIARIO[G.especie].coherenciaMax, "55 (or 110 critical) against 40 coherence");
  assert.equal(d[0].queda, 0);
  assert.equal(W.evs(p, "disuelta").length, vistas + 1, "the creature dissolved");
  assert.equal(W.evs(p, "jugadorHerido").length, heridos, "a dissolved creature does not strike back: life untouched");
  assert.equal(W.evs(p, "jugadorCaido").length, 0);
});
