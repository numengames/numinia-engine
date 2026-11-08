// franjas v1 (Y37): the band of the day as a world event. The pure function over the 24 h, the file reader, and the piece
// running headless (in-memory world, pages pumped by 20 Hz ticks) on top of entorno's day cycle: one notice per change
// (also across midnight), none at start-up or on arrival, none without a cycle, only the asker hears `consultar`, and a
// feature that hooks on to it without touching entorno.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { Announcement, ServerPart } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { crearEntorno, CICLO_TICKS } from "../features/entorno/server.ts";
import { crearCliente as crearClienteEntorno } from "../features/entorno/client.ts";
import { franjas, ZONA } from "../features/franjas/feature.ts";
import { DESDE_CASA, FRANJAS, PASOS_DIA, franjaDeHora, frase, horaEnTexto, leerDesde, pasosHastaSiguiente, siguienteDe } from "../features/franjas/esquema.ts";
import { crearFranjas } from "../features/franjas/server.ts";
import { crearCliente } from "../features/franjas/client.ts";
import casa from "../features/franjas/franjas.json" with { type: "json" };
import servidor from "../features/servidor.ts";
import cliente from "../features/cliente.ts";

test("franjaDeHora covers the 24 h in steps of 0.05 with no gaps and no overlaps, in day order", () => {
  const vistas: string[] = [];
  for (let p = 0; p < PASOS_DIA; p++) {
    const f = franjaDeHora(p / 20);
    assert.ok((FRANJAS as readonly string[]).includes(f), `step ${p}`);
    if (vistas[vistas.length - 1] !== f) vistas.push(f);
  }
  // starting at 0:00 we are in the night; the bands then follow in order and end back in the night
  assert.deepEqual(vistas, ["noche", "amanecer", "dia", "ocaso", "noche"]);
  for (const [h, f] of [[4.95, "noche"], [5, "amanecer"], [6.95, "amanecer"], [7, "dia"], [17.95, "dia"], [18, "ocaso"], [19.95, "ocaso"], [20, "noche"], [23.95, "noche"], [0, "noche"], [24, "noche"]] as const) assert.equal(franjaDeHora(h), f, `hour ${h}`);
  assert.equal(siguienteDe("noche"), "amanecer");
});

test("the limits are data: the house file is valid, custom hours move the bands, mistakes say where and how to fix them", () => {
  assert.deepEqual(casa.desde, DESDE_CASA);
  assert.ok(leerDesde(casa.desde).ok);
  const corto = leerDesde({ amanecer: 6, dia: 8, ocaso: 17, noche: 23 });
  assert.ok(corto.ok);
  if (corto.ok) { assert.equal(franjaDeHora(22.95, corto.value), "ocaso"); assert.equal(franjaDeHora(23, corto.value), "noche"); }
  // a band that crosses midnight, the whole day still covered
  const giro = leerDesde({ amanecer: 23, dia: 2, ocaso: 10, noche: 15 });
  assert.ok(giro.ok);
  if (giro.ok) { assert.equal(franjaDeHora(23.5, giro.value), "amanecer"); assert.equal(franjaDeHora(1.95, giro.value), "amanecer"); assert.equal(franjaDeHora(2, giro.value), "dia"); assert.equal(franjaDeHora(14.95, giro.value), "ocaso"); }
  const mal = (o: unknown) => { const r = leerDesde(o); assert.equal(r.ok, false); return r.ok ? [] : r.issues; };
  assert.equal(mal({ dia: 25 })[0].path, "franjas.desde.dia");
  assert.equal(mal({ dia: 7.03 })[0].path, "franjas.desde.dia");
  assert.equal(mal({ mediodia: 12 })[0].path, "franjas.desde.mediodia");
  assert.match(mal({ amanecer: 5, dia: 7, ocaso: 6, noche: 20 })[0].message, /each starting later/);
  assert.match(mal({ amanecer: 5, dia: 5 })[0].message, /no ties/);
  assert.equal(mal([])[0].path, "franjas.desde");
  assert.deepEqual(leerDesde(undefined), { ok: true, value: DESDE_CASA });
});

test("hours until the next band, and the sentence a card reads (English by default, Spanish as a translation)", () => {
  assert.equal(pasosHastaSiguiente(6.5), 10);   // 0.5 h = 10 steps to 7:00
  assert.equal(pasosHastaSiguiente(23), 120);   // 6 h across midnight to 5:00
  assert.equal(pasosHastaSiguiente(7), 220);    // a band that has just started: the whole band ahead
  assert.equal(horaEnTexto(18), "18:00");
  assert.equal(horaEnTexto(5.05), "05:03");
  assert.equal(frase("en", "ocaso"), "It is dusk. Next: Night at 20:00.");
  assert.equal(frase("es", "noche"), "Es de noche. Después: Amanecer a las 05:00.");
  assert.equal(frase("fr", "dia"), frase("en", "dia"), "an unknown language falls back to English");
  for (const idioma of Object.keys(casa.textos)) {
    const t = (casa.textos as Record<string, { franjas: Record<string, { nombre: string; anuncio: string; estado: string }> }>)[idioma];
    assert.deepEqual(Object.keys(t.franjas), [...FRANJAS], `${idioma}: same bands`);
  }
});

type Mundo = { hora: number; ciclo: number; opts?: Parameters<typeof crearFranjas>[0]; extra?: ServerPart[]; n?: number; abierto?: boolean };
function mundo(m: Mundo) {
  const log: string[] = [];
  const entorno = crearEntorno({ hora: { valor: m.hora, cicloMinutos: m.ciclo } });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [entorno, crearFranjas(m.opts), ...(m.extra ?? [])], log: (l) => log.push(l), puede: (_w, accion) => m.abierto === true && accion === "construir" });
  const paginas: { t: ReturnType<Instance["join"]>; s: ClientSession; oido: Announcement[]; f: ReturnType<typeof crearCliente>["franjas"]; amb: ReturnType<typeof crearClienteEntorno>["ambiente"] }[] = [];
  const entrar = () => {
    const t = inst.join(paginas.length), f = crearCliente(), e = crearClienteEntorno(), oido: Announcement[] = [];
    const s = new ClientSession(t, { features: [f.parts[0], e.part as never], view: { label() {}, bounce() {}, announce: (a) => oido.push(a) } });
    paginas.push({ t, s, oido, f: f.franjas, amb: e.ambiente });
    return paginas[paginas.length - 1];
  };
  for (let i = 0; i < (m.n ?? 1); i++) entrar();
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  return { inst, paginas, pump, entrar, log };
}
const avisos = (p: { oido: Announcement[] }) => p.oido.filter((a) => a.feature === "franjas" && a.event === "franja");

test("one notice per change as the day cycle runs (text + sound), a whole day round, across midnight too; none at start or on arrival", () => {
  // a 2-minute day: the clock moves 1 h every CICLO_TICKS ticks
  const { paginas, pump, entrar } = mundo({ hora: 6.5, ciclo: 2 });
  pump(3);
  const [A] = paginas;
  assert.equal(avisos(A).length, 0, "nothing at start-up");
  assert.equal(A.f.actual()?.franja, "amanecer");
  assert.equal(A.f.actual()?.activa, true);
  assert.equal(A.f.actual()?.siguiente, "dia");
  assert.equal(A.f.actual()?.desde, 7);
  assert.equal(A.s.features.cards().some((c) => c.feature === "franjas" && c.name === "Time of day" && c.description?.startsWith("It is dawn.")), true, "the card is readable");
  const B = entrar(); pump(3);
  assert.equal(avisos(B).length, 0, "nothing for someone who arrives: they read the card");
  assert.equal(B.f.actual()?.franja, "amanecer");
  // a full day and a bit more: 25 h = 25 steps
  const vistas: string[] = [];
  for (let h = 0; h < 25; h++) { pump(CICLO_TICKS); const n = avisos(A).length; if (n > vistas.length) vistas.push(A.f.actual()!.franja); }
  assert.deepEqual(vistas.slice(0, 4), ["dia", "ocaso", "noche", "amanecer"], `heard ${vistas.join(",")}`);
  const todos = avisos(A);
  assert.equal(todos.length, vistas.length, "exactly one notice per change");
  assert.ok(todos.length >= 4 && todos.length <= 5);
  assert.deepEqual(todos.slice(0, 4).map((a) => a.text), ["The day begins.", "Dusk falls.", "Night falls.", "Dawn breaks."]);
  for (const a of todos) { assert.equal(a.sound, "suave"); assert.equal(a.importance, 1); }
  assert.equal(avisos(B).length, todos.length, "everyone in the zone hears the same");
});

test("the change across 23.95 → 0 is no change (night goes on); and with other hours the midnight crossing announces once", () => {
  const { paginas, pump } = mundo({ hora: 22, ciclo: 2 });
  pump(3);
  for (let h = 0; h < 4; h++) pump(CICLO_TICKS); // 22 → 2, across midnight
  assert.equal(avisos(paginas[0]).length, 0);
  assert.equal(paginas[0].f.actual()?.franja, "noche");
  // a world whose night starts at 23 and whose dawn starts at 1: crossing midnight is one change (noche → amanecer) at 1:00
  const w = mundo({ hora: 22.5, ciclo: 2, opts: { desde: { amanecer: 1, dia: 7, ocaso: 18, noche: 22 } } });
  w.pump(3);
  for (let h = 0; h < 4; h++) w.pump(CICLO_TICKS);
  assert.deepEqual(avisos(w.paginas[0]).map((a) => a.text), ["Dawn breaks."]);
});

test("without a day cycle nothing is ever announced, but the band follows the hour a builder sets (state and card only)", () => {
  const { paginas, pump } = mundo({ hora: 12, ciclo: 0, abierto: true });
  pump(3);
  const [A] = paginas;
  assert.equal(A.f.actual()?.franja, "dia");
  assert.equal(A.f.actual()?.activa, false);
  A.amb.ajustar({ hora: 21 });
  pump(CICLO_TICKS * 2);
  assert.equal(A.f.actual()?.franja, "noche");
  assert.equal(avisos(A).length, 0, "no cycle: no notice");
  pump(CICLO_TICKS * 3);
  assert.equal(avisos(A).length, 0);
  // the cycle is switched on mid-night: it is only a state change, the next real change is announced
  A.amb.ajustar({ ciclo: 2, hora: 3 });
  pump(CICLO_TICKS);
  assert.equal(avisos(A).length, 0, "switching the cycle on is not a change of band");
  assert.equal(A.f.actual()?.activa, true);
  pump(CICLO_TICKS * 2);
  assert.deepEqual(avisos(A).map((a) => a.text), ["Dawn breaks."]);
});

test("a world may keep it silent (avisar: false) or in Spanish (idioma: es); the query still answers", () => {
  const callado = mundo({ hora: 6.5, ciclo: 2, opts: { avisar: false } });
  callado.pump(3);
  for (let h = 0; h < 3; h++) callado.pump(CICLO_TICKS);
  assert.equal(avisos(callado.paginas[0]).length, 0);
  assert.equal(callado.paginas[0].f.actual()?.franja, "dia", "the state still moves");
  const es = mundo({ hora: 6.5, ciclo: 2, opts: { idioma: "es" } });
  es.pump(3);
  assert.equal(es.paginas[0].f.actual()?.texto, "Es el amanecer. Después: Día a las 07:00.");
  for (let h = 0; h < 1; h++) es.pump(CICLO_TICKS);
  assert.deepEqual(avisos(es.paginas[0]).map((a) => a.text), ["Empieza el día."]);
});

test("`consultar` answers only the asker, with the band and when the next one starts", () => {
  const { paginas, pump } = mundo({ hora: 19, ciclo: 0, n: 2 });
  pump(3);
  const [A, B] = paginas;
  assert.deepEqual(A.f.consultar(), { ok: true });
  pump(3);
  const dicho = (p: { oido: Announcement[] }) => p.oido.filter((a) => a.feature === "franjas" && a.event === "estado").map((a) => a.text);
  assert.deepEqual(dicho(A), ["It is dusk. Next: Night at 20:00."]);
  assert.deepEqual(dicho(B), []);
  assert.equal(A.f.ultimoAviso(), "It is dusk. Next: Night at 20:00.");
});

test("a server world with no environment says so and publishes nothing", () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [crearFranjas()], log: (l) => log.push(l) });
  const t = inst.join(0), f = crearCliente(), oido: Announcement[] = [];
  const s = new ClientSession(t, { features: [f.parts[0]], view: { label() {}, bounce() {}, announce: (a) => oido.push(a) } });
  for (let k = 0; k < 3; k++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(f.franjas.actual(), null);
  assert.deepEqual(f.franjas.consultar(), { ok: true });
  for (let k = 0; k < 3; k++) { t.flush(); inst.tick(); t.flush(); }
  assert.deepEqual(oido.map((a) => a.text), ["This world has no time of day."]);
  assert.ok(s);
});

test("wrong start hours are not used: the house hours apply and the log says why", () => {
  const { log, paginas, pump } = mundo({ hora: 12, ciclo: 0, opts: { desde: { dia: 30 } } });
  pump(3);
  assert.ok(log.some((l) => l.includes("franjas: the start hours are not used") && l.includes("franjas.desde.dia")));
  assert.equal(paginas[0].f.actual()?.desde, 18);
});

test("another feature hooks on without touching entorno: listens to `franja`, reads `franjas`' state, and cannot write it", () => {
  const visto: string[] = [], leido: string[] = [];
  const oyente = serverPart(defineFeature({ id: "oyente-franja", version: 1, level: "base", describe: "A stand-in for Y38: reacts to the band of the day.", intents: {}, events: {} }), (api) => {
    api.listen("franjas", "franja", (m) => { visto.push(`${m.anterior}>${m.franja}`); leido.push(String(api.estadoDe("franjas").get(ZONA)?.franja)); });
  });
  const { paginas, pump } = mundo({ hora: 17.5, ciclo: 2, extra: [oyente] });
  pump(3);
  for (let h = 0; h < 4; h++) pump(CICLO_TICKS);
  assert.deepEqual(visto, ["dia>ocaso", "ocaso>noche"]);
  assert.deepEqual(leido, ["ocaso", "noche"], "the state already says the new band when the event arrives");
  assert.equal(paginas[0].f.actual()?.franja, "noche");
});

test("the declaration meets the accessibility rules and is registered on the server", () => {
  assert.deepEqual(franjas.issues, []);
  assert.ok(servidor.some((p) => p.feature.id === "franjas"));
  assert.ok(!cliente.some((p) => p.feature.id === "franjas"), "like sucesos and espacios, its page part is not in the first-load bundle (the announce path needs no page part; `features/franjas/client.ts` is for a composition root that wants the button)");
});
