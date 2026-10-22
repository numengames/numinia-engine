// dardos — declaration (v2: duel). A dartboard is a thing of the world (state entry WITH `at`, a card and `interact`, like
// pesca's fishing spot): you stand at its throwing line, start a turn (`jugar`) and throw three darts (`lanzar`). Each
// dart carries what the PLAYER chose — where they aimed on the board's face (x, y in board radii) and how hard they
// threw (fuerza, 0-1: the mouse held down on a PC, the speed of a flick on a phone, the trigger held in AR) — and the
// SERVER decides where it lands: a weak throw drops, a hard one climbs and scatters, and a small hand tremor taken from
// the tick the throw arrived on moves every dart a little, so aiming well raises your score without guaranteeing it.
// The server scores (sector, ring, points), keeps the turn and the per-guest scoreboard; the page only asks and draws.
// Same verbs on a flat screen, a phone and AR (the board on your real wall: packages/render/src/dardos-ar.ts).
// v2 adds the DUEL: a board with `duelo: true` takes a second player and plays a match (rounds of three darts, turns
// alternate, the higher total wins); `remoto: true` lets a player join from a real wall (AR) far from the board, and
// both players get every dart and the score whatever the distance. A board without those fields behaves as in v1.
// Recipe: docs/EXTENDER.md «Dardos».
import { defineFeature } from "../../packages/feature/src/index.ts";
import { EQUIPOS_DEFECTO, EQUIPOS_MAX } from "./equipos.ts";

/** Who gets a dartboard in the shared state, from afar (m): a landmark, same reach as pesca's pond. */
export const ALCANCE_M = 120;
/** Who sees a dart land besides the thrower (m). */
export const CERCA_M = 40;
/** Darts in a turn. */
export const DARDOS_TURNO = 3;
/** A turn nobody throws in for this long (s) closes by itself, so a board is never held forever. */
export const TURNO_INACTIVO_S = 60;
/** The throw that flies straight to where you aimed (0-1). Weaker drops, harder climbs a little and scatters more. */
export const FUERZA_IDEAL = 0.65;
/** v4: how the dart was thrown (the `via` of `lanzar`; a missing one is `raton`, so a client of v3 keeps working). */
export const VIAS = ["raton", "teclado", "tactil", "vr", "ar"] as const;
export type Via = (typeof VIAS)[number];
/** v4: the half-width of the straight-throw window around FUERZA_IDEAL (strength, 0-1) PER WAY OF THROWING. Inside it the dart
 *  neither drops nor scatters more; outside it pays (server.ts `aterrizaje`). The PC bar, the phone, VR and the AR wall bar
 *  draw THIS number, so what you see is what the server judges. A mouse or key is exact (narrow); a flick or a hand is noisier (wider). */
export const ZONA_FUERZA: Readonly<Record<Via, number>> = { raton: 0.04, teclado: 0.04, tactil: 0.07, vr: 0.06, ar: 0.06 };
/** The window of a `via`; an unknown or missing one is the mouse's (the narrowest: nobody gains by sending garbage). */
export const zonaDe = (via: unknown): number => ZONA_FUERZA[(VIAS as readonly unknown[]).includes(via) ? (via as Via) : "raton"];
/** How far a strength is from the straight one, to 6 decimals (so 0.69 - 0.65 is 0.04, not 0.04000000000000004, on both sides of the wire). Pure. */
export const desvioFuerza = (fuerza: number): number => Math.round((Math.max(0, Math.min(1, fuerza)) - FUERZA_IDEAL) * 1e6) / 1e6;
/** Rounds of a duel by default (every round: each player throws their DARDOS_TURNO darts) and the allowed range. */
export const RONDAS_DEFECTO = 3, RONDAS_MAX = 5;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
/** A point on the board's face, in board radii (1 = the outer edge of the double ring; the numbers ring is ~1.3). */
const CARA = { kind: "fixed", min: -3, max: 3, step: 0.001 } as const;
const SECTOR = { kind: "int", min: 0, max: 20 } as const;
const MULTIPLICADOR = { kind: "int", min: 0, max: 3 } as const;
const PUNTOS = { kind: "int", min: 0, max: 60 } as const; // the highest single dart: triple 20 = 60
const NUMERO = { kind: "int", min: 1, max: 3 } as const;
const NOMBRE = { kind: "text", maxBytes: 40 } as const; // a person's name: it travels only in fields declared `text`
const DUELO_PUNTOS = { kind: "int", min: 0, max: 900 } as const; // 5 rounds x 3 darts x 60
const TIRADA = { kind: "int", min: 0, max: 180 } as const;
/** v6: the world a player comes from when they join through a LINK (another world's page, on a wall): a short label for the sign. */
export const MUNDO_MAX_BYTES = 32;
const MUNDO = { kind: "text", maxBytes: MUNDO_MAX_BYTES } as const;
const MUNDOS = { mundoA: MUNDO, mundoB: MUNDO, mundoC: MUNDO, mundoD: MUNDO } as const;
export const ANILLO_VALUES = ["dobleBull", "bull", "simple", "triple", "doble", "fuera"] as const;

export const dardos = defineFeature({
  id: "dardos",
  version: 6,
  level: "base",
  describe: "Jugar a los dardos en una diana del mundo: una tirada son tres dardos; en cada uno eliges adónde apuntas y con qué fuerza lanzas, y el servidor decide dónde se clava (un tiro flojo cae, uno fuerte sube y se abre, y el pulso mueve un poco cada dardo), cuenta sector, anillo y puntos y guarda el marcador por invitado. Igual en el PC (ratón), el móvil (gesto de lanzar) y en AR (la diana en tu pared).",
  store: { describe: "Por invitado (`d:<id>`): dardos tirados, puntos totales, el mejor dardo, la mejor tirada (3 dardos) y cuántas dianas (dobleBull) ha hecho. Nunca va a las páginas; a su dueño le llega como evento `marcador`." },
  state: {
    describe: "Una diana por clave: nombre, dónde (x, z; y = altura del suelo, m), a qué distancia se tira (radio, m), hacia dónde mira su cara (rumbo, grados: 0 = mira a +z, 90 = a +x) si alguien tira ahí ahora (ocupado) y, en una diana de duelo, si admite un rival (duelo), si se puede entrar desde lejos (remoto: una diana `remoto` la ve todo el mundo, esté donde esté; las demás solo quien está a ALCANCE_M), si hay alguien esperando rival (espera) y cuántos jugadores hay en el duelo (jugadores, 0-4) y cuántos equipos admite (equipos, 2-4; v3).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 3 },
      rumbo: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 },
      ocupado: { kind: "bool", default: false },
      duelo: { kind: "bool", default: false }, remoto: { kind: "bool", default: false },
      rondas: { kind: "int", min: 1, max: RONDAS_MAX, default: RONDAS_DEFECTO },
      espera: { kind: "bool", default: false }, jugadores: { kind: "int", min: 0, max: EQUIPOS_MAX, default: 0 },
      equipos: { kind: "int", min: 2, max: EQUIPOS_MAX, default: EQUIPOS_DEFECTO },
    },
    card: { role: "lugar", name: "{nombre}", description: "Diana de dardos", at: ["x", "z"], actions: ["jugar"], interact: { intent: "jugar", prompt: "tirar dardos", radius: "radio", key: "sitio" } },
    radius: ALCANCE_M,
  },
  intents: {
    jugar: { describe: "Empezar una tirada de tres dardos en la diana que tienes al lado (su radio). Mientras tiras, la diana es tuya. En una diana de duelo, el primero espera rival y el segundo empieza el duelo. `desde: \"pared\"` (solo en dianas `remoto`) te deja jugar desde una pared real lejos de la diana (AR) y `desde: \"lejos\"` (v5, también solo `remoto`) desde una pantalla lejos de la diana (página de PC o móvil). v6: `mundo` (opcional) es el nombre del mundo desde el que entras por un enlace (la página de otro mundo en tu pared): el letrero de la diana lo muestra («desde <mundo>»); `nombre` (opcional) = el nombre con que quieres salir en el marcador (el que tienes en tu mundo; solo desde pared o lejos).", spoken: "jugar a los dardos", fields: { sitio: ID, desde: { kind: "enum", values: ["sitio", "pared", "lejos"], default: "sitio" }, mundo: MUNDO, nombre: MUNDO }, rate: { perSecond: 2, burst: 4 } },
    lanzar: {
      describe: "Lanzar un dardo de tu tirada: x, y = adónde apuntas en la cara de la diana, en radios (0, 0 = el centro; y hacia arriba; 1 = el borde del doble); fuerza 0-1 (0,65 va recto dentro de una zona estrecha; fuera de ella, menos cae y más sube y se abre). v4: `via` (raton, teclado, tactil, vr, ar; si falta, raton) dice cómo lanzaste y fija el ancho de esa zona (ZONA_FUERZA). El servidor decide dónde se clava.",
      spoken: "lanzar un dardo", fields: { sitio: ID, x: CARA, y: CARA, fuerza: { kind: "fixed", min: 0, max: 1, step: 0.001 }, via: { kind: "enum", values: VIAS, default: "raton" } }, rate: { perSecond: 3, burst: 4 },
    },
    cambiar: { describe: "v3, duelo: pasar el turno. Tras tus 3 dardos (o antes, si quieres) la diana pide «retira los dardos»: nada puntúa hasta que quien tiene el turno pulsa cambiar (o pasan RETIRANDO_S segundos).", spoken: "cambiar de turno", fields: { sitio: ID }, rate: { perSecond: 2, burst: 4 } },
    empezar: { describe: "v3, duelo: el anfitrión arranca la partida cuando hay al menos 2 equipos sentados (la diana espera hasta que lo haga si el mundo declara `equipos`).", spoken: "empezar el duelo", fields: { sitio: ID }, rate: { perSecond: 2, burst: 4 } },
    salir: { describe: "Dejar la tirada donde esté: lo lanzado cuenta, la diana queda libre.", spoken: "dejar los dardos", fields: {}, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    turno: { describe: "Empieza tu tirada en esta diana: tienes tres dardos. Solo a ti.", fields: { sitio: ID }, announce: { text: "Tres dardos. Apunta y lanza.", sound: "suave", importance: 1 } },
    dardo: {
      describe: "Un dardo se clavó (o se fue fuera): de quién, en qué diana, cuál de la tirada, DÓNDE (x, y en radios de la cara), sector, anillo, multiplicador, puntos, lo que lleva la tirada y una frase. A ti y a quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, sitio: ID, numero: NUMERO, x: CARA, y: CARA, sector: SECTOR, anillo: { kind: "enum", values: ANILLO_VALUES }, multiplicador: MULTIPLICADOR, puntos: PUNTOS, tirada: TIRADA, texto: { kind: "text", maxBytes: 60 } },
      announce: { text: "{texto}", sound: "suave", importance: 1, who: "quien" },
    },
    fin: { describe: "Una tirada terminó (tres dardos, `salir`, alejarse, desconectar o un minuto sin tirar): de quién, cuántos dardos y cuántos puntos. A ti y a quien esté cerca.", fields: { quien: QUIEN, sitio: ID, dardos: { kind: "int", min: 0, max: 3 }, puntos: TIRADA }, announce: "silent" },
    marcador: {
      describe: "Tu marcador (al identificarte y tras cada `fin`): dardos tirados, puntos totales, mejor dardo, mejor tirada y dianas (dobleBull). Solo a ti.",
      fields: {
        dardos: { kind: "int", min: 0, max: 1000000 }, puntos: { kind: "int", min: 0, max: 60000000 },
        mejorDardo: PUNTOS, mejorTirada: TIRADA, dianas: { kind: "int", min: 0, max: 1000000 },
      },
      announce: "silent",
    },
    duelo: {
      describe: "El duelo cambió (turno nuevo o un dardo cayó): diana, ronda (0 = esperando rival), de quién es el turno (0 = de nadie aún) y los jugadores: entidad, nombre y puntos (a/b/c/d = equipos de 1 jugador; los no sentados valen 0; `plazas` = cuántos hay sentados, `equipos` = cuántos admite la diana, `turnoEq` 1-4 = equipo con turno (0 = nadie), `retirando` = fase «retira los dardos», `fueraX` = el equipo se fue) y si cada uno juega desde su pared de AR (paredA/paredB) y, v6, desde qué mundo entró por un enlace (mundoA…mundoD, vacío si no). A los dos jugadores, vean donde vean, y a quien esté cerca de la diana.",
      fields: { sitio: ID, ronda: { kind: "int", min: 0, max: RONDAS_MAX }, turnoDe: QUIEN, a: QUIEN, nombreA: NOMBRE, puntosA: DUELO_PUNTOS, b: QUIEN, nombreB: NOMBRE, puntosB: DUELO_PUNTOS, paredA: { kind: "bool", default: false }, paredB: { kind: "bool", default: false }, c: QUIEN, nombreC: NOMBRE, puntosC: DUELO_PUNTOS, d: QUIEN, nombreD: NOMBRE, puntosD: DUELO_PUNTOS, paredC: { kind: "bool", default: false }, paredD: { kind: "bool", default: false }, equipos: { kind: "int", min: 2, max: EQUIPOS_MAX, default: EQUIPOS_DEFECTO }, plazas: { kind: "int", min: 0, max: EQUIPOS_MAX, default: 0 }, turnoEq: { kind: "int", min: 0, max: EQUIPOS_MAX, default: 0 }, retirando: { kind: "bool", default: false }, fueraA: { kind: "bool", default: false }, fueraB: { kind: "bool", default: false }, fueraC: { kind: "bool", default: false }, fueraD: { kind: "bool", default: false }, ...MUNDOS },
      announce: "silent",
    },
    finduelo: {
      describe: "El duelo terminó: diana, ganador (entidad; 0 = empate), empate, abandono (el otro se fue o se quedó sin tirar y gana por defecto), los dos jugadores con sus puntos y una frase. A los dos jugadores y a quien esté cerca.",
      fields: { sitio: ID, ganador: QUIEN, empate: { kind: "bool", default: false }, abandono: { kind: "bool", default: false }, a: QUIEN, nombreA: NOMBRE, puntosA: DUELO_PUNTOS, b: QUIEN, nombreB: NOMBRE, puntosB: DUELO_PUNTOS, paredA: { kind: "bool", default: false }, paredB: { kind: "bool", default: false }, c: QUIEN, nombreC: NOMBRE, puntosC: DUELO_PUNTOS, d: QUIEN, nombreD: NOMBRE, puntosD: DUELO_PUNTOS, paredC: { kind: "bool", default: false }, paredD: { kind: "bool", default: false }, equipos: { kind: "int", min: 2, max: EQUIPOS_MAX, default: EQUIPOS_DEFECTO }, plazas: { kind: "int", min: 0, max: EQUIPOS_MAX, default: 0 }, turnoEq: { kind: "int", min: 0, max: EQUIPOS_MAX, default: 0 }, retirando: { kind: "bool", default: false }, fueraA: { kind: "bool", default: false }, fueraB: { kind: "bool", default: false }, fueraC: { kind: "bool", default: false }, fueraD: { kind: "bool", default: false }, ...MUNDOS, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "suave", importance: 2 },
    },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
