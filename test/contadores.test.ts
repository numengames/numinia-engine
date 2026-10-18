// contadores v1 (D-044): timers and counters everyone sees, headless (in-memory world, pages pumped by 20 Hz ticks).
// The file (wrong lines out with their reason), the server's clock (one value a second, not one per tick), the zone
// (only who is near gets the value), reaching zero / the cap (the `llegada` event with the cable's name), the orders
// (arranca, para, suma, reinicia, pulsar), who may give them (todos / dirige) and the chat order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { contadores, leerContadores, formato, ALCANCE_M, PUBLICA_CADA_TICKS, CONTADORES_MAX } from "../features/contadores/feature.ts";
import type { ContadorFichero } from "../features/contadores/feature.ts";
import { crearContadores, hitoDe } from "../features/contadores/server.ts";
import { crearCliente } from "../features/contadores/client.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerPart } from "../packages/feature/src/index.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const SALA: ContadorFichero = { id: "sala", nombre: "Sala 1", tipo: "cuenta_atras", x: 0, z: 0, inicio: 5, tope: 0, donde: "ambos", evento: "sala-a-cero", manda: "todos" };
const MARCADOR: ContadorFichero = { id: "marcador", nombre: "Equipo rojo", tipo: "contador", x: 10, z: 0, inicio: 0, tope: 3, donde: "panel", evento: "rojo-gana", manda: "todos" };
const RELOJ: ContadorFichero = { id: "reloj", nombre: "Reloj del mundo", tipo: "reloj", x: 0, z: 10, inicio: 0, tope: 0, donde: "cartel", evento: "", manda: "dirige" };

/** A stand-in for the cable (D-041): a server part that hears ("contadores", "llegada") and keeps the event names. */
const cable = (oidos: string[]): ServerPart => serverPart(defineFeature({ id: "cable-prueba", version: 1, level: "base", describe: "oye llegadas", intents: {}, events: {} }), (api) => { api.listen("contadores", "llegada", (m) => { oidos.push(String(m.evento)); return true; }); });

function mundo(n: number, lista = [SALA, MARCADOR, RELOJ], dirige = (_who: unknown, accion: string) => accion === "dirigir") {
  const log: string[] = [], oidos: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearContadores({ contadores: lista }), cable(oidos)], log: (l) => log.push(l), identitySign: sign, puede: dirige });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const cambios: string[] = [];
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts, view: { label() {}, bounce() {}, tag: (k, v) => { cambios.push(`${k}=${v ? `${v.text}|${v.sub}` : "null"}`); } } });
    return { t, s, c: cli.contadores, cambios };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log, oidos };
}

test("contadores: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(contadores.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "contadores"));
  assert.ok(paginas.some((f) => f.feature.id === "contadores"));
});

test("formato / hitoDe: what a person reads", () => {
  assert.equal(formato("cuenta_atras", 725), "12:05");
  assert.equal(formato("reloj", 3661), "1:01:01");
  assert.equal(formato("cuenta_atras", 0), "0:00");
  assert.equal(formato("contador", 2, 3), "2 / 3");
  assert.equal(formato("contador", -4), "-4");
  assert.equal(hitoDe(300), "quedan 5 minutos");
  assert.equal(hitoDe(60), "quedan 1 minuto");
  assert.equal(hitoDe(10), "quedan 10 segundos");
  assert.equal(hitoDe(11), "");
});

test("leerContadores: each wrong line is left out WITH its reason; the right ones are used", () => {
  const r = leerContadores({
    schema: "numinia-engine/contadores@1",
    contadores: [
      { id: "sala", nombre: "Sala 1", tipo: "cuenta_atras", segundos: 900, x: 0, z: 0, evento: "sala-a-cero" },
      { id: "Sala", nombre: "mayúscula", tipo: "cuenta_atras", segundos: 9, x: 0, z: 0 },
      { id: "sala", nombre: "repetido", tipo: "cuenta_atras", segundos: 9, x: 0, z: 0 },
      { id: "sin-nombre", nombre: "", tipo: "contador", x: 0, z: 0 },
      { id: "tipo", nombre: "tipo raro", tipo: "cronometro", x: 0, z: 0 },
      { id: "sin-x", nombre: "sin x", tipo: "contador", z: 0 },
      { id: "largo", nombre: "demasiado", tipo: "cuenta_atras", segundos: 90_000, x: 0, z: 0 },
      { id: "medio", nombre: "medio segundo", tipo: "cuenta_atras", segundos: 1.5, x: 0, z: 0 },
      { id: "marcador", nombre: "Equipo rojo", tipo: "contador", inicio: 0, tope: 10, x: 1, z: 2, donde: "panel", manda: "todos" },
      { id: "tope-igual", nombre: "tope = inicio", tipo: "contador", inicio: 3, tope: 3, x: 0, z: 0 },
      { id: "donde", nombre: "donde raro", tipo: "reloj", x: 0, z: 0, donde: "techo" },
      { id: "manda", nombre: "manda raro", tipo: "reloj", x: 0, z: 0, manda: "nadie" },
      { id: "evento", nombre: "evento raro", tipo: "reloj", x: 0, z: 0, evento: "Con Espacios" },
      { id: "radio", nombre: "radio raro", tipo: "reloj", x: 0, z: 0, radio: 40 },
      "no es un objeto",
      { id: "reloj", nombre: "Reloj", tipo: "reloj", x: 0, z: 0 },
    ],
  });
  assert.deepEqual(r.valor.map((c) => c.id), ["sala", "marcador", "reloj"]);
  assert.equal(r.valor[0].inicio, 900); assert.equal(r.valor[0].donde, "ambos"); assert.equal(r.valor[0].manda, "dirige");
  assert.equal(r.valor[1].tope, 10); assert.equal(r.valor[1].manda, "todos");
  const paths = r.problemas.map((p) => p.path);
  for (const i of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14]) assert.ok(paths.some((p) => p.startsWith(`contadores.contadores[${i}]`)), `line ${i} is said: ${paths.join(", ")}`);
  assert.equal(r.problemas.length, 13);
  assert.match(r.problemas.find((p) => p.path.startsWith("contadores.contadores[2]"))!.message, /repetido/);
  assert.match(r.problemas.find((p) => p.path.startsWith("contadores.contadores[7]"))!.message, /entero de 1 a 86400/);
  // the whole file wrong, in a sentence that shows the shape
  assert.match(leerContadores([1, 2]).problemas[0].message, /contadores\.json es un objeto/);
  assert.match(leerContadores({ contadores: "x" }).problemas[0].message, /una lista/);
  assert.deepEqual(leerContadores(undefined), { valor: [], problemas: [] });
  // the cap on how many
  const muchos = leerContadores({ contadores: Array.from({ length: CONTADORES_MAX + 2 }, (_, i) => ({ id: `c${i}`, nombre: `C ${i}`, tipo: "reloj", x: 0, z: 0 })) });
  assert.equal(muchos.valor.length, CONTADORES_MAX);
  assert.match(muchos.problemas.at(-1)!.message, new RegExp(`como mucho ${CONTADORES_MAX}`));
});

test("a world's contadores.json goes through conMundo: used lines in, wrong ones logged with their path", () => {
  const log: string[] = [];
  const ficheros: Record<string, unknown> = { "contadores.json": { contadores: [{ id: "sala", nombre: "Sala", tipo: "cuenta_atras", segundos: 60, x: 0, z: 0 }, { id: "mal", nombre: "mal", tipo: "nada", x: 0, z: 0 }] } };
  const partes = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const parte = partes.find((p) => p.feature.id === "contadores")!;
  assert.ok(parte && parte !== funciones.find((p) => p.feature.id === "contadores"), "the part was rebuilt with the world's counters");
  assert.ok(log.some((l) => l.includes("[mundo] contadores.json: contadores.contadores[1].tipo") && l.includes("esa línea no se usa")), log.join("\n"));
  // a world without the file keeps the house part (no counters)
  assert.equal(conMundo(funciones, () => undefined).find((p) => p.feature.id === "contadores"), funciones.find((p) => p.feature.id === "contadores"));
});

test("the server keeps the clock: one published value a second (not one per tick), only to who is in the zone", () => {
  const { pages: [a, lejos], pump, place, log } = mundo(2);
  pump(3);
  place(a.s.entity, 1, 1); place(lejos.s.entity, ALCANCE_M * 3, 0); pump(12); // who has which things is recomputed every STATE_REFRESH_TICKS
  assert.ok(log.some((l) => l.includes("contadores: 3 contador(es)")));
  assert.deepEqual(a.c.lista().map((c) => c.id).sort(), ["marcador", "reloj", "sala"]);
  assert.deepEqual(lejos.c.lista(), [], "far away: no counter in the state at all");
  const sala = a.c.uno("sala")!;
  assert.equal(sala.valor, 5); assert.equal(sala.marcha, false); assert.equal(sala.evento, "sala-a-cero"); assert.equal(sala.donde, "ambos");
  // the sign: a label sprite (text = the value, sub = the name) for cartel/ambos, none for panel
  assert.ok(a.cambios.includes("contador:sala=0:05|Sala 1"), a.cambios.join(" "));
  assert.ok(a.cambios.includes("contador:reloj=0:00|Reloj del mundo"));
  assert.ok(!a.cambios.some((c) => c.startsWith("contador:marcador=0")), "panel only: no sign");

  assert.ok(a.c.arranca("sala").ok); pump(2);
  assert.equal(a.c.uno("sala")!.marcha, true);
  assert.equal(a.c.uno("sala")!.valor, 5, "the first second has not passed");
  let vistos = 0; a.c.alCambiar((q) => { if (q === "lista") vistos++; });
  pump(PUBLICA_CADA_TICKS - 5);
  assert.equal(a.c.uno("sala")!.valor, 5, "under a second: still 5");
  pump(6);
  assert.equal(a.c.uno("sala")!.valor, 4, "a second after the start: one gone");
  const antes = vistos;
  pump(PUBLICA_CADA_TICKS * 2);
  assert.equal(a.c.uno("sala")!.valor, 2);
  assert.ok(vistos - antes <= 3, `two seconds = about two state changes, not ${vistos - antes} (one per tick would be 40)`);
  assert.ok(a.cambios.includes("contador:sala=0:02|Sala 1"), "the sign is redrawn with the new value");
  assert.deepEqual(lejos.c.lista(), [], "still nothing for who is far");
});

test("a countdown reaches zero: stops, publishes 0 and emits llegada with the cable's event name (zone + server listeners)", () => {
  const { pages: [a], pump, place, oidos } = mundo(1, [SALA]);
  pump(3); place(a.s.entity, 0, 1); pump(2);
  a.c.arranca("sala"); pump(2);
  pump(PUBLICA_CADA_TICKS * 5 + 2);
  const sala = a.c.uno("sala")!;
  assert.equal(sala.valor, 0); assert.equal(sala.marcha, false);
  assert.equal(a.c.llegada()?.evento, "sala-a-cero");
  assert.equal(a.c.llegada()?.texto, "Sala 1: tiempo");
  assert.ok(a.s.features.announcements.some((x) => x.event === "llegada" && x.text === "Sala 1: tiempo" && x.importance === 2), "announced (aria-live) with weight");
  assert.ok(a.s.features.announcements.some((x) => x.event === "hito" && x.text === "Sala 1: arranca"), "the start is said aloud");
  pump(PUBLICA_CADA_TICKS * 2);
  assert.equal(a.c.uno("sala")!.valor, 0, "stays at zero: no negative time");
  // starting a finished countdown starts it over from the top
  a.c.arranca("sala"); pump(2);
  assert.equal(a.c.uno("sala")!.valor, 5); assert.equal(a.c.uno("sala")!.marcha, true);
  assert.deepEqual(oidos, ["sala-a-cero"], "the cable on the server heard the event name");
});

test("a counter: suma up to its cap (llegada), never past it; reinicia goes back to the start; para/arranca a clock", () => {
  const { pages: [a, b], pump, place } = mundo(2);
  pump(3); place(a.s.entity, 10, 1); place(b.s.entity, 0, 11); pump(2);
  a.c.suma("marcador"); pump(2);
  assert.equal(a.c.uno("marcador")!.valor, 1);
  assert.equal(b.c.uno("marcador")!.valor, 1, "the other page in the zone sees the same value");
  a.c.suma("marcador", 5); pump(2);
  assert.equal(a.c.uno("marcador")!.valor, 3, "capped at tope");
  assert.equal(a.c.llegada()?.evento, "rojo-gana");
  assert.equal(a.c.llegada()?.texto, "Equipo rojo: 3 / 3, tope alcanzado");
  a.c.suma("marcador", -2); pump(2);
  assert.equal(a.c.uno("marcador")!.valor, 1, "a negative cuanto subtracts");
  a.c.reinicia("marcador"); pump(2);
  assert.equal(a.c.uno("marcador")!.valor, 0);
  // the clock is `manda: dirige`: b (who directs in this test world) starts it, it climbs a second per second, stops where told
  b.c.arranca("reloj"); pump(PUBLICA_CADA_TICKS * 2 + 2);
  assert.equal(b.c.uno("reloj")!.valor, 2);
  b.c.para("reloj"); pump(PUBLICA_CADA_TICKS + 2);
  assert.equal(b.c.uno("reloj")!.valor, 2, "stopped: no longer climbs");
  assert.equal(b.c.uno("reloj")!.marcha, false);
  // pulsar (the E key): toggles a clock, adds one to a counter
  b.c.arranca("reloj"); pump(2);
  assert.equal(b.c.uno("reloj")!.marcha, true);
  a.s.features.send("contadores", "pulsar", { id: "marcador" }); pump(2);
  assert.equal(a.c.uno("marcador")!.valor, 1);
});

test("who may order: `todos` needs to be within reach; `dirige` needs the permission; a wrong id is refused", () => {
  const { pages: [a], pump, place } = mundo(1, [SALA, MARCADOR, RELOJ], () => false);
  pump(3); place(a.s.entity, 30, 0); pump(2); // inside the zone (sees them), not within reach of any
  a.c.arranca("sala"); pump(2);
  assert.match(a.c.aviso(), /Acércate a Sala 1/);
  assert.equal(a.c.uno("sala")!.marcha, false);
  a.c.arranca("reloj"); pump(2);
  assert.match(a.c.aviso(), /quien dirige/);
  a.c.arranca("nada"); pump(2);
  assert.match(a.c.aviso(), /No hay ningún contador «nada»/);
  place(a.s.entity, 1, 0); pump(2);
  a.c.arranca("sala"); pump(2);
  assert.equal(a.c.uno("sala")!.marcha, true, "within reach: allowed");
});

test("the chat order: /contador <id> arranca|para|suma n|reinicia, and /contadores lists them", () => {
  const { pages: [a], pump, place } = mundo(1);
  pump(3); place(a.s.entity, 10, 1); pump(2);
  const di = (t: string) => { a.s.features.send("chat", "decir", { texto: t, alcance: "cerca" }); pump(3); };
  di("/contador marcador suma 2");
  assert.equal(a.c.uno("marcador")!.valor, 2);
  di("/contador marcador resta 1");
  assert.equal(a.c.uno("marcador")!.valor, 1);
  di("/contador marcador baila");
  assert.match(a.c.aviso(), /No entiendo «baila»/);
  pump(40); // the chat's own rate limit
  di("/contadores");
  assert.match(a.c.aviso(), /marcador \(Equipo rojo\): 1 \/ 3/);
});
