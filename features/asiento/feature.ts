// asiento — declaration (v1). Sitting down for real: «E» beside a free seat and your avatar sits there (the house's
// `sentarse` clip, then `sentado`), facing where the seat looks, still; «E» again, `/levantar`, a stick or a jump stands
// you up. A seat is a thing of the world (state entry WITH `at`, a card and `interact`: «E: sentarte» beside it): free, or
// taken by one person (the occupied one shows their name). One seat, one person; one person, one seat. The SERVER decides
// everything: who may sit (a free seat within COGER_M, not already seated, not reading the norms), where the avatar is
// put (`api.ordenar({ sentar })`, H2: a recorded order of the simulation, so a world with no seat steps exactly as
// before) and when they leave (the simulation stands them up by itself on a stick or a jump; the server sees it with
// `api.sentado` and frees the seat). Whoever directs (a role, /dueño or the Director's staff), or may remove people, or
// rules the world, may stand another person up (`/levantar <nombre>`). A world turns the piece on with
// `entorno/asientos.json`; without the file nothing changes. It is a piece with a switch (Entorno panel).
// Recipe: docs/EXTENDER.md «Asiento».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** How near you must be to sit (m), and how many seats a world may have. */
export const COGER_M = 2;
export const SITIOS_MAX = 24;
/** The server waits this many ticks after seating someone before it believes `sentado() === false` (the order is applied at the next step). */
export const ESPERA_TICKS = 4;
/** Where you stand when «E» gets you up: this far behind the seat (m), away from where it looks. */
export const ATRAS_M = 0.8;
/** Nobody sits here. */
export const LIBRE = -1;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;

export const asiento = defineFeature({
  id: "asiento",
  version: 1,
  level: "base",
  describe: "Sentarse de verdad: «E» junto a un asiento libre y tu avatar se sienta ahí, mirando hacia donde mira el asiento, quieto (animación `sentarse`). «E» otra vez o /levantar te levanta; andar o saltar también. Un asiento, una persona; el asiento ocupado muestra el nombre de quien lo ocupa. Quien dirige (rol, /dueño o báculo), quien puede echar o quien manda puede levantar a otra persona (/levantar <nombre>). Desconectarse libera el asiento. Es una pieza con interruptor (Entorno): apagada, no hay asientos.",
  store: { describe: "Sin carpeta del mundo donde escribir asientos.json: si están encendidos y sus sitios (`estado`), para que sobrevivan al reinicio. Con carpeta lo guarda asientos.json. Nada de esto va a las páginas." },
  state: {
    describe: "Un asiento por clave (su id): su nombre (etiqueta), dónde está (x, z; y = altura de los pies sentado, m), hacia dónde mira (mira, grados: 0 = hacia +z, 90 = hacia +x), desde cuánto se usa (radio, m; 0 mientras está ocupado), quién lo ocupa (ocupante = su entidad; -1 = libre) y su nombre (quien), y si la página dibuja una banqueta (dibujo: solo en los sitios que puso el interruptor; los asientos de un modelo no la necesitan).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      mira: { kind: "fixed", min: -360, max: 360, step: 0.1, default: 0 },
      radio: { kind: "fixed", min: 0, max: 16, step: 0.1, default: COGER_M },
      ocupante: { kind: "int", min: LIBRE, max: 65535, default: LIBRE },
      quien: { kind: "text", maxBytes: 40 },
      dibujo: { kind: "bool", default: false },
    },
    card: { role: "objeto", name: "{nombre}", description: "Un asiento: «E» y te sientas; el servidor decide quién lo ocupa", at: ["x", "z"], actions: ["sentar", "levantar"], interact: { intent: "sentar", prompt: "sentarte", radius: "radio", key: "cosa" } },
    radius: 64,
  },
  intents: {
    sentar: { describe: "Sentarte en un asiento (cosa = cuál). Hay que estar a 2 m, que esté libre y que no estés ya sentado; el servidor te coloca en él, mirando hacia donde mira.", spoken: "sentarme", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
    levantar: { describe: "Levantarte del asiento (a vacío), o, quien dirige o puede echar o manda, levantar a otra persona (a = su nombre).", spoken: "levantarme", fields: { a: { kind: "text", maxBytes: 40 } }, rate: { perSecond: 1, burst: 4 } },
    encender: { describe: "Encender o apagar los asientos del mundo (activa = true/false). Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda. Encendido por primera vez sin sitios: el servidor pone un asiento junto a quien lo enciende y guarda el sitio en asientos.json. Apagarlo levanta a quien esté sentado y quita los asientos (los sitios se guardan).", spoken: "encender o apagar los asientos", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 6 } },
  },
  events: {
    rechazado: { describe: "No se hizo, y por qué (lejos, ocupado, ya estás sentado, no puedes levantar a otra persona…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    permiso: { describe: "A ti solo: si puedes encender y apagar piezas del mundo (asientos, dados, báculo…): quien dirige o manda. Con eso la página muestra o no su interruptor.", fields: { encender: { kind: "bool" } }, announce: "silent" },
  },
});
