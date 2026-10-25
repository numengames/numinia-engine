// vuelo — declaration (H2, «volar con permiso»). Flying is an order of the simulation (ORDER_VOLAR: no gravity, SALTAR climbs,
// BAJAR descends, recorded with the inputs so a replay gives the same fingerprint); WHO may fly is the server's decision, never
// the page's (R-1): the world's `vuelo` in entorno.json — "nadie" (the default: nothing written, nobody flies), "constructores"
// (whoever may build here) or "todos" — or a grant another feature makes for one avatar (`concederVuelo`). This feature is the
// door: `/volar`, `/aterrizar` in the chat (any device with a keyboard, VR included) and the intent `volar` (for the page and
// for agents) ask the instance, which answers yes or no. Without permission nothing moves and the person is told why.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The most flight switches one person may ask per second (a held key must not flood the order queue). */
export const VOLAR_POR_S = 1;
const quien = { kind: "int", min: 0, max: 65535 } as const;

export const vuelo = defineFeature({
  id: "vuelo",
  version: 1,
  level: "base",
  describe: "Volar con permiso. En el chat, /volar te levanta del suelo (sin gravedad: Espacio sube, Ctrl o C baja) y /aterrizar te devuelve a pie. El servidor decide quién puede volar: el mundo lo dice en entorno.json (`vuelo`: nadie, constructores o todos; por defecto nadie) o una pieza concede el vuelo a una persona. Sin permiso no se vuela y se dice por qué.",
  intents: {
    volar: { describe: "Empezar o dejar de volar (activa = true/false). Solo si el mundo o una pieza te lo permite; el servidor decide.", spoken: "volar o aterrizar", fields: { activa: { kind: "bool" } }, rate: { perSecond: VOLAR_POR_S, burst: 3 } },
  },
  events: {
    rechazado: { describe: "No se volará, y por qué (este mundo no deja volar, o aún no puedes).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    vuela: { describe: "A ti solo: ya vuelas (activa = true) o ya estás a pie.", fields: { quien, activa: { kind: "bool" } }, announce: "silent" },
  },
});
