// burbujas — declaration (v1). The voice bubble: a sphere of the world (a table, a room) where only those inside hear each other.
// The voice relay (packages/instance, `relayVoice`) asks this piece, per frame, which bubble the speaker and the listener are in
// (each person is in at most one, worked out ONCE per tick from where they stand — a seated person is where their seat is, so
// sitting in a seat inside the bubble counts) and decides there, on the server: nothing is «muted» by a page.
//   modo «aislada» (default): inside ↔ same bubble hear each other (no 30 m cap inside the radius); inside ↔ outside hear nobody,
//     in either direction (the game is private and whoever sits at the table does not hear the square); outside ↔ outside as
//     always (nearness); two different bubbles do not hear each other.
//   modo «abierta»: inside hear everyone inside; the near people outside also hear those inside (a bubble that only widens).
// It is PRIVACY OF HEARING, not encryption: the server still relays the frames it receives and never decodes, records or stores
// them; nothing here opens a microphone. A world turns it on with `entorno/burbujas.json`; without the file nothing changes (no
// bubbles, cost 0, the relay as before). It is a piece with a switch (Entorno panel). Recipe: docs/EXTENDER.md «Burbujas de voz».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** How many bubbles a world may have, and the radius range (m). */
export const BURBUJAS_MAX = 16;
export const RADIO_MIN = 0.5, RADIO_MAX = 50, RADIO_DEFECTO = 3.5;
export const MODOS = ["aislada", "abierta"] as const;
export type Modo = (typeof MODOS)[number];
/** Outside every bubble. */
export const FUERA = -1;

const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01, default: 0 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;

export const burbujas = defineFeature({
  id: "burbujas",
  version: 1,
  level: "base",
  describe: "Burbuja de voz: una esfera del mundo (una mesa, una sala) donde solo se oyen entre sí los que están dentro. Dentro ↔ dentro se oyen; dentro ↔ fuera no se oye nadie, en ningún sentido (modo «aislada», por defecto; en «abierta» los de fuera cercanos también oyen a los de dentro). Cada persona está en una burbuja como mucho, según dónde está (sentado en un asiento de la burbuja cuenta). Lo decide el servidor al reenviar la voz; es privacidad de oído, no cifrado, y no graba nada. Es una pieza con interruptor (Entorno): apagada, la voz es la de siempre.",
  store: { describe: "Sin carpeta del mundo donde escribir burbujas.json: si están encendidas y sus sitios (`estado`), para que sobrevivan al reinicio. Con carpeta lo guarda burbujas.json. Nada de esto va a las páginas." },
  state: {
    describe: "Dos clases de entrada. «b:<id>» es una burbuja: su nombre (etiqueta), dónde está (x, y, z; m), su radio (m) y su modo (aislada/abierta). «p:<entidad>» es una persona que está dentro de una (burbuja = su id): lo ven todas las páginas, para el icono de «Gente».",
    fields: {
      etiqueta: { kind: "text", maxBytes: 40 },
      x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 0, max: RADIO_MAX, step: 0.1, default: RADIO_DEFECTO },
      modo: { kind: "enum", values: MODOS, default: "aislada" },
      burbuja: { kind: "text", maxBytes: 16 },
    },
  },
  intents: {
    encender: { describe: "Encender o apagar las burbujas de voz del mundo (activa = true/false). Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda. Encendido por primera vez sin burbujas: el servidor pone una de radio 3,5 m donde está quien lo enciende y la guarda en burbujas.json. Apagarlas las quita (los sitios se guardan).", spoken: "encender o apagar las burbujas de voz", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 6 } },
  },
  events: {
    dentro: { describe: "A ti solo: entras en una burbuja (burbuja = su id, etiqueta, modo) o sales de ella (burbuja vacía). `aviso` es el texto que se lee.", fields: { burbuja: { kind: "text", maxBytes: 16 }, etiqueta: { kind: "text", maxBytes: 40 }, modo: { kind: "enum", values: MODOS, default: "aislada" }, aviso: { kind: "text", maxBytes: 160 } }, announce: { text: "{aviso}", sound: "suave", importance: 0 } },
    rechazado: { describe: "No se hizo, y por qué (no puedes encender o apagar las burbujas, ya están así…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    permiso: { describe: "A ti solo: si puedes encender y apagar piezas del mundo (asientos, dados, burbujas…): quien dirige o manda. Con eso la página muestra o no su interruptor.", fields: { encender: { kind: "bool" } }, announce: "silent" },
  },
});
