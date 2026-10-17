// dardos — declaration (v1). A dartboard is a thing of the world (state entry WITH `at`, a card and `interact`, like
// pesca's fishing spot): you stand at its throwing line, start a turn (`jugar`) and throw three darts (`lanzar`). Each
// dart carries what the PLAYER chose — where they aimed on the board's face (x, y in board radii) and how hard they
// threw (fuerza, 0-1: the mouse held down on a PC, the speed of a flick on a phone, the trigger held in AR) — and the
// SERVER decides where it lands: a weak throw drops, a hard one climbs and scatters, and a small hand tremor taken from
// the tick the throw arrived on moves every dart a little, so aiming well raises your score without guaranteeing it.
// The server scores (sector, ring, points), keeps the turn and the per-guest scoreboard; the page only asks and draws.
// Same verbs on a flat screen, a phone and AR (the board on your real wall: packages/render/src/dardos-ar.ts).
// Recipe: docs/EXTENDER.md «Dardos».
import { defineFeature } from "../../packages/feature/src/index.ts";

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
const TIRADA = { kind: "int", min: 0, max: 180 } as const;
export const ANILLO_VALUES = ["dobleBull", "bull", "simple", "triple", "doble", "fuera"] as const;

export const dardos = defineFeature({
  id: "dardos",
  version: 1,
  level: "base",
  describe: "Jugar a los dardos en una diana del mundo: una tirada son tres dardos; en cada uno eliges adónde apuntas y con qué fuerza lanzas, y el servidor decide dónde se clava (un tiro flojo cae, uno fuerte sube y se abre, y el pulso mueve un poco cada dardo), cuenta sector, anillo y puntos y guarda el marcador por invitado. Igual en el PC (ratón), el móvil (gesto de lanzar) y en AR (la diana en tu pared).",
  store: { describe: "Por invitado (`d:<id>`): dardos tirados, puntos totales, el mejor dardo, la mejor tirada (3 dardos) y cuántas dianas (dobleBull) ha hecho. Nunca va a las páginas; a su dueño le llega como evento `marcador`." },
  state: {
    describe: "Una diana por clave: nombre, dónde (x, z; y = altura del suelo, m), a qué distancia se tira (radio, m), hacia dónde mira su cara (rumbo, grados: 0 = mira a +z, 90 = a +x) y si alguien tira ahí ahora (ocupado).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 3 },
      rumbo: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 },
      ocupado: { kind: "bool", default: false },
    },
    card: { role: "lugar", name: "{nombre}", description: "Diana de dardos", at: ["x", "z"], actions: ["jugar"], interact: { intent: "jugar", prompt: "tirar dardos", radius: "radio", key: "sitio" } },
    radius: ALCANCE_M,
  },
  intents: {
    jugar: { describe: "Empezar una tirada de tres dardos en la diana que tienes al lado (su radio). Mientras tiras, la diana es tuya.", spoken: "jugar a los dardos", fields: { sitio: ID }, rate: { perSecond: 2, burst: 4 } },
    lanzar: {
      describe: "Lanzar un dardo de tu tirada: x, y = adónde apuntas en la cara de la diana, en radios (0, 0 = el centro; y hacia arriba; 1 = el borde del doble); fuerza 0-1 (0,65 va recto; menos cae, más sube y se abre). El servidor decide dónde se clava.",
      spoken: "lanzar un dardo", fields: { sitio: ID, x: CARA, y: CARA, fuerza: { kind: "fixed", min: 0, max: 1, step: 0.001 } }, rate: { perSecond: 3, burst: 4 },
    },
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
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
