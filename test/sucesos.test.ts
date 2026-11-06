// sucesos v1 (Y48): world events that announce themselves, advance alone and reward every participant, headless
// (in-memory world, pages pumped by 20 Hz ticks). The file (wrong lines out with their reason, the chain checked), the
// integer pace, the weighted draw with the RNG (same seed → same chain), an event that finishes with nobody there, the
// whole reward to each participant, the announcement only to who is near, the verbs `mirar` / `lanzar` and the chat order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { sucesos, PASO_TICKS, ALCANCE_M, SUCESOS_MAX, PROGRESO_ESCALA } from "../features/sucesos/feature.ts";
import { leerSucesos, ritmo, elegirSiguiente } from "../features/sucesos/esquema.ts";
import type { SucesoFichero } from "../features/sucesos/esquema.ts";
import { crearSucesos, fraseDe } from "../features/sucesos/server.ts";
import { crearCliente } from "../features/sucesos/client.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerPart } from "../packages/feature/src/index.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const base = { y: undefined, radio: 12, aviso: 2, ayuda: 50, ayudaMax: 4, final: "", siguiente: [], empieza: false };
const LLUVIA: SucesoFichero = { ...base, id: "lluvia", nombre: "Lluvia de estrellas", x: 0, z: 0, anuncio: "Se acerca una lluvia de estrellas", duracion: 10, recompensa: { texto: "Recoges polvo de estrella", cosa: "polvo", cuanto: 3 }, empieza: true, siguiente: [{ id: "calma", peso: 1 }] };
const CALMA: SucesoFichero = { ...base, id: "calma", nombre: "La calma", x: 0, z: 0, anuncio: "Vuelve la calma", duracion: 4, aviso: 30, recompensa: { texto: "Respiras hondo", cosa: "", cuanto: 0 } };

/** A stand-in for the cable and the inventory: a server part that hears ("sucesos", "otorga") and ("sucesos", "cadena"). */
const oyente = (otorgas: string[], cadenas: string[]): ServerPart => serverPart(defineFeature({ id: "oyente-prueba", version: 1, level: "base", describe: "oye sucesos", intents: {}, events: {} }), (api) => {
  api.listen("sucesos", "otorga", (m) => { otorgas.push(`${m.id}:${m.quien}:${m.cosa}:${m.cuanto}`); });
  api.listen("sucesos", "cadena", (m) => { cadenas.push(`${m.id}>${m.siguiente}:${m.participantes}`); });
});

function mundo(n: number, lista: SucesoFichero[] = [LLUVIA, CALMA], dirige: (_w: unknown, accion: string) => boolean = (_w, accion) => accion === "dirigir", semilla = 1) {
  const log: string[] = [], otorgas: string[] = [], cadenas: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearSucesos({ sucesos: lista, semilla }), oyente(otorgas, cadenas)], log: (l) => log.push(l), identitySign: sign, puede: dirige });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts, view: { label() {}, bounce() {}, tag() {} } });
    return { t, s, c: cli.sucesos };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log, otorgas, cadenas };
}
/** Pump until `listo` holds (at most `max` ticks); returns the ticks it took. */
const hasta = (m: ReturnType<typeof mundo>, listo: () => boolean, max = 4000): number => { let t = 0; while (!listo() && t < max) { m.pump(1); t++; } return t; };

test("sucesos: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(sucesos.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "sucesos"));
  assert.ok(paginas.some((f) => f.feature.id === "sucesos"));
});

test("leerSucesos: each wrong line is left out WITH its reason; a chain to nowhere is dropped, the event stays", () => {
  const ok = { id: "lluvia", nombre: "Lluvia", x: 0, z: 0, anuncio: "Llueve", duracion: 60, recompensa: { texto: "Polvo", cosa: "polvo", cuanto: 3 } };
  const r = leerSucesos({
    schema: "numinia-engine/sucesos@1",
    sucesos: [
      { ...ok, siguiente: [{ id: "calma", peso: 3 }, { id: "nada" }, { id: "lluvia", peso: 500 }] },
      { ...ok, id: "calma", nombre: "Calma", anuncio: "Calma", duracion: 30 },
      { ...ok, id: "Lluvia" },
      { ...ok, id: "calma" },
      { ...ok, id: "sin-duracion", duracion: undefined },
      { ...ok, id: "largo", duracion: 99_999 },
      { ...ok, id: "sin-anuncio", anuncio: "" },
      { ...ok, id: "sin-premio", recompensa: {} },
      { ...ok, id: "ayuda", ayuda: 250 },
      { ...ok, id: "radio", radio: 500 },
      "no es un objeto",
    ],
  });
  assert.deepEqual(r.valor.map((e) => e.id), ["lluvia", "calma"]);
  assert.deepEqual(r.valor[0].siguiente, [{ id: "calma", peso: 3 }], "unknown id and weight 500 are left out");
  assert.equal(r.valor[0].aviso, 10); assert.equal(r.valor[0].ayuda, 25); assert.equal(r.valor[0].ayudaMax, 8); assert.equal(r.valor[0].radio, 12);
  const paths = r.problemas.map((p) => p.path);
  for (const i of [2, 3, 4, 5, 6, 7, 8, 9, 10]) assert.ok(paths.some((p) => p.startsWith(`sucesos.sucesos[${i}]`)), `line ${i} is said: ${paths.join(", ")}`);
  assert.ok(paths.includes("sucesos.sucesos[0].siguiente[1].id") && paths.includes("sucesos.sucesos[0].siguiente[2].peso"));
  assert.match(r.problemas.find((p) => p.path.startsWith("sucesos.sucesos[3]"))!.message, /repetido/);
  assert.match(r.problemas.find((p) => p.path.startsWith("sucesos.sucesos[5]"))!.message, /entero de 1 a 3600/);
  assert.match(leerSucesos([1]).problemas[0].message, /sucesos\.json es un objeto/);
  assert.deepEqual(leerSucesos(undefined), { valor: [], problemas: [] });
  const muchos = leerSucesos({ sucesos: Array.from({ length: SUCESOS_MAX + 2 }, (_, i) => ({ ...ok, id: `e${i}` })) });
  assert.equal(muchos.valor.length, SUCESOS_MAX);
});

test("ritmo: whole numbers, nobody still moves, each person adds their % up to the cap", () => {
  const e = { duracion: 10, ayuda: 50, ayudaMax: 4 };
  assert.equal(ritmo(e, 0), PROGRESO_ESCALA / 10, "alone: the base pace, 10 s");
  assert.equal(ritmo(e, 2), (PROGRESO_ESCALA / 10) * 2, "two people: +100 % = twice as fast");
  assert.equal(ritmo(e, 4), ritmo(e, 40), "the cap: 4 people count, 40 count the same");
  assert.equal(ritmo({ ...e, ayuda: 0 }, 9), ritmo(e, 0), "ayuda 0: a crowd changes nothing");
  const hora = { duracion: 3600, ayuda: 33, ayudaMax: 7 };
  assert.ok(Number.isInteger(ritmo(hora, 5)) && ritmo(hora, 0) > 0, "one hour still moves every second");
});

test("elegirSiguiente: weighted, from the integer RNG; same state → same pick; no chain → empty", () => {
  const lista = [{ id: "a", peso: 1 }, { id: "b", peso: 3 }];
  const sacar = (semilla: number, n: number) => { const r = new Uint32Array([semilla]); return Array.from({ length: n }, () => elegirSiguiente(lista, r)); };
  assert.deepEqual(sacar(7, 40), sacar(7, 40));
  assert.notDeepEqual(sacar(7, 40), sacar(8, 40), "another seed, another run");
  const cuenta = sacar(7, 400).filter((x) => x === "b").length;
  assert.ok(cuenta > 240 && cuenta < 360, `b has 3 of 4 weights: ${cuenta}/400`);
  assert.equal(elegirSiguiente([], new Uint32Array([1])), "");
  assert.equal(elegirSiguiente([{ id: "solo", peso: 5 }], new Uint32Array([1])), "solo");
});

test("an event with nobody there finishes by itself, rewards nobody, and chains the next one", () => {
  const m = mundo(1), { pages: [lejos], pump, place, log, cadenas, otorgas } = m;
  pump(3); place(lejos.s.entity, ALCANCE_M * 3, 0); pump(12);
  assert.deepEqual(lejos.c.lista(), [], "far away: no event in the state at all");
  place(lejos.s.entity, 40, 0); pump(12); // inside the area of interest, outside the 12 m zone
  assert.ok(["anunciado", "curso"].includes(lejos.c.uno("lluvia")!.fase), "started with the server: a card tells whoever arrives");
  hasta(m, () => lejos.c.uno("lluvia")!.fase === "curso");
  pump(PASO_TICKS * 2);
  const l = lejos.c.uno("lluvia")!;
  assert.equal(l.fase, "curso"); assert.equal(l.ayudan, 0); assert.ok(l.progreso > 0, "it moves with nobody in the zone");
  hasta(m, () => lejos.c.uno("lluvia")!.fase === "dormido");
  assert.equal(lejos.c.uno("lluvia")!.fase, "dormido", "finished: nobody had to be there");
  assert.equal(lejos.c.uno("calma")!.fase, "anunciado", "the result chained the next event");
  assert.deepEqual(cadenas, ["lluvia>calma:0"]);
  assert.deepEqual(otorgas, [], "nobody took part: nothing to give");
  assert.ok(log.some((x) => x.includes("[sucesos] lluvia termina: 0 participante(s)")));
  assert.equal(lejos.c.ultimaRecompensa(), null);
});

test("everyone in the zone gets the WHOLE reward; who is far gets nothing; more people, faster", () => {
  const dura = (cerca: number) => { // ticks from «en curso» to «dormido»
    const m = mundo(3 + 0 * cerca);
    const [a, b, c] = m.pages;
    m.pump(3);
    m.place(a.s.entity, cerca >= 1 ? 1 : 40, 1); m.place(b.s.entity, cerca >= 2 ? -2 : 41, 2); m.place(c.s.entity, 40, 0); m.pump(12);
    hasta(m, () => a.c.uno("lluvia")!.fase === "curso");
    const t = hasta(m, () => a.c.uno("lluvia")!.fase === "dormido");
    return { m, t, a, b, c };
  };
  const nadie = dura(0), dos = dura(2);
  assert.ok(dos.t < nadie.t, `two people finish sooner (${dos.t} < ${nadie.t} ticks)`);
  assert.deepEqual(nadie.m.otorgas, []);
  const { m, a, b, c } = dos;
  assert.deepEqual([...m.otorgas].sort(), [`lluvia:${a.s.entity}:polvo:3`, `lluvia:${b.s.entity}:polvo:3`].sort(), "the same whole reward to each participant, none to who stood far");
  assert.deepEqual(a.c.ultimaRecompensa(), { id: "lluvia", texto: "Recoges polvo de estrella", cosa: "polvo", cuanto: 3 });
  assert.deepEqual(b.c.ultimaRecompensa(), a.c.ultimaRecompensa());
  assert.equal(c.c.ultimaRecompensa(), null);
  assert.deepEqual(m.cadenas, ["lluvia>calma:2"]);
});

test("the same seed gives the same chain; another seed another", () => {
  const cadena = (semilla: number) => {
    const ev = [{ ...LLUVIA, duracion: 2, aviso: 0, siguiente: [{ id: "a", peso: 1 }, { id: "b", peso: 1 }, { id: "lluvia", peso: 1 }] },
      { ...CALMA, id: "a", nombre: "A", duracion: 2, aviso: 0, siguiente: [{ id: "lluvia", peso: 1 }] }, { ...CALMA, id: "b", nombre: "B", duracion: 2, aviso: 0, siguiente: [{ id: "lluvia", peso: 1 }] }];
    const m = mundo(1, ev, undefined, semilla);
    m.pump(3); m.place(m.pages[0].s.entity, 40, 0); m.pump(PASO_TICKS * 60);
    return m.cadenas.join(" ");
  };
  assert.equal(cadena(5), cadena(5));
  assert.ok(cadena(5).split(" ").length >= 8, `the chain keeps going: ${cadena(5)}`);
  assert.notEqual(cadena(5), cadena(6));
});

test("mirar answers only to who asks; lanzar needs who directs and only wakes a sleeping event", () => {
  const { pages: [a, b], pump, place } = mundo(2, [CALMA]);
  pump(3); place(a.s.entity, 1, 1); place(b.s.entity, 2, 2); pump(12);
  assert.ok(a.c.mirar("calma").ok); pump(2);
  assert.equal(a.c.aviso(), fraseDe("La calma", "dormido", 0, 0, 0));
  assert.equal(b.c.aviso(), "", "the answer is for who asked");
  assert.ok(a.c.mirar("nada").ok); pump(2);
  assert.match(a.c.aviso(), /No hay ningún evento «nada»/);
  assert.ok(a.c.lanzar("calma").ok); pump(2);
  assert.equal(a.c.uno("calma")!.fase, "anunciado");
  assert.equal(b.c.uno("calma")!.fase, "anunciado");
  assert.match(b.c.ultimoAnuncio(), /Vuelve la calma/, "the announcement reached who was near");
  a.c.lanzar("calma"); pump(2);
  assert.match(a.c.aviso(), /ya está en marcha/);
});

test("lanzar is refused to who does not direct", () => {
  const { pages: [a], pump, place } = mundo(1, [CALMA], () => false);
  pump(3); place(a.s.entity, 1, 1); pump(12);
  a.c.lanzar("calma"); pump(2);
  assert.equal(a.c.uno("calma")!.fase, "dormido");
  assert.match(a.c.aviso(), /quien dirige/);
});

test("the chat order /evento <id> [lanzar] works like the verbs", () => {
  const { pages: [a], pump, place } = mundo(1, [CALMA]);
  pump(3); place(a.s.entity, 1, 1); pump(12);
  const di = (t: string) => { a.s.features.send("chat", "decir", { texto: t, alcance: "cerca" }); pump(3); };
  di("/evento calma");
  assert.equal(a.c.aviso(), fraseDe("La calma", "dormido", 0, 0, 0));
  di("/evento calma lanzar");
  assert.equal(a.c.uno("calma")!.fase, "anunciado");
  di("/evento");
  assert.match(a.c.aviso(), /Escribe \/evento y el nombre: calma/);
});

test("fraseDe: what a card and `mirar` say in each phase", () => {
  assert.equal(fraseDe("Lluvia", "dormido", 0, 0, 0), "Lluvia: ahora no pasa nada.");
  assert.equal(fraseDe("Lluvia", "anunciado", 7, 0, 0), "Lluvia: empieza en 7 s.");
  assert.equal(fraseDe("Lluvia", "curso", 0, 500, 0), "Lluvia: va por el 50 %, avanza solo, sin nadie.");
  assert.equal(fraseDe("Lluvia", "curso", 0, 250, 1), "Lluvia: va por el 25 %, 1 persona ayudando.");
});

test("a world's sucesos.json goes through conMundo: used lines in, wrong ones logged with their path; without the file, the house part", () => {
  const log: string[] = [];
  const ficheros: Record<string, unknown> = { "sucesos.json": { sucesos: [{ id: "lluvia", nombre: "Lluvia", x: 0, z: 0, anuncio: "Llueve", duracion: 60, recompensa: { texto: "Polvo" } }, { id: "mal", nombre: "mal", x: 0, z: 0, anuncio: "x", duracion: 0, recompensa: { texto: "x" } }] } };
  const partes = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const parte = partes.find((p) => p.feature.id === "sucesos")!;
  assert.ok(parte && parte !== funciones.find((p) => p.feature.id === "sucesos"), "the part was rebuilt with the world's events");
  assert.ok(log.some((l) => l.includes("[mundo] sucesos.json: sucesos.sucesos[1].duracion") && l.includes("esa línea no se usa")), log.join("\n"));
  assert.equal(conMundo(funciones, () => undefined).find((p) => p.feature.id === "sucesos"), funciones.find((p) => p.feature.id === "sucesos"));
});
