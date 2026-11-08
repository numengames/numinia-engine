// derribado — declaration (v1, Y45 + Y46 + Y47). Falling is not dying: the third state of a person's life, decided by the
// SERVER. When a person falls (today: the creature's strike-back takes their life to 0, lucha `jugadorCaido`) and the world has
// the piece on, they are «derribado» for a while: held still, with THREE verbs of their own (`pedirAyuda`, `rendirse`, and being
// the target of `levantar`) and nothing else. They leave it in one of two ways: a companion lifts them (`levantar`: no item, no
// cost, within 2,5 m, «E» on the card, a button or an agent through the same verb) or the time runs out / they give up
// (`rendirse`) and the server puts them on the world's reappearance spot. NOTHING is lost either way (Y49: no penalty by
// default). The world declares in `entorno/derribado.json` where people reappear and whether death is «segura» (nothing is
// lost): without the file the piece is OFF, costs nothing and lucha behaves as before. Recipe: docs/EXTENDER.md «Derribado».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Seconds a person stays down before the server brings them back (default; a world may set 5–120 in derribado.json). */
export const TIEMPO_S = 30;
export const TIEMPO_MIN_S = 5, TIEMPO_MAX_S = 120;
/** How near a companion must be to lift (m, plus the engine's interaction slack) and who sees a fall, a call or a lift (m). */
export const ALCANCE_LEVANTAR_M = 2.5;
export const VER_M = 40;
/** The person is held still in chunks of this many seconds, renewed while down (an order of the simulation cannot be undone, so a lift frees them within this). */
export const QUIETO_TROZO_S = 1;
/** Seconds between two calls for help of one person. */
export const ENFRIAMIENTO_AYUDA_S = 5;

const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const SEG = { kind: "int", min: 0, max: TIEMPO_MAX_S } as const;

export const derribado = defineFeature({
  id: "derribado",
  version: 1,
  level: "base",
  describe: "Caer no es morir. Si el mundo lo tiene encendido, quien cae (hoy: la criatura le quita toda la vida) queda derribado: quieto, sin perder nada, con tres cosas por hacer: pedir ayuda, rendirse (volver ya al punto de reaparición) o esperar a que un compañero le levante. Levantar a un compañero (`levantar`, «E» junto a él, un botón o un agente) no pide objeto ni cuesta nada. Si nadie llega, a los 30 s el servidor le pone en el punto de reaparición que declara el mundo (derribado.json) con todo lo suyo intacto. El servidor decide quién está derribado, quién alcanza y cuándo se sale; la página solo pide y muestra. Es una pieza con interruptor (Entorno): apagada, no hay derribados y la lucha se comporta como siempre.",
  store: { describe: "Sin carpeta del mundo donde escribir derribado.json: si la pieza está encendida, para que sobreviva al reinicio. Con carpeta lo guarda derribado.json. Nada de esto va a las páginas." },
  state: {
    describe: "Un derribado por clave (`d:<entidad>`): su nombre, dónde está (x, y, z), hasta dónde alcanza quien le levanta (radio, m) y si en este mundo la muerte es segura (seguro: nada se pierde al caer). Existe solo mientras dura el estado.",
    fields: {
      nombre: { kind: "text", maxBytes: 40 }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 0, max: 16, step: 0.1, default: ALCANCE_LEVANTAR_M },
      seguro: { kind: "bool", default: true },
    },
    card: { role: "persona", name: "{nombre}", description: "Derribado: se le puede levantar con «E» sin objeto ni coste; si nadie llega, vuelve solo al punto de reaparición", at: ["x", "z"], actions: ["levantar"], interact: { intent: "levantar", prompt: "levantar a {nombre}", radius: "radio", key: "cosa" } },
    radius: 64,
  },
  intents: {
    levantar: { describe: "Levantar a un compañero derribado (cosa = su clave `d:<entidad>`). Hay que estar a 2,5 m y no estar derribado tú. No pide objeto ni cuesta nada: el derribado se pone en pie donde está.", spoken: "levantar a un compañero", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
    pedirAyuda: { describe: "Estando derribado: pedir ayuda. A quien está a 40 m le llega un aviso con tu nombre. Una vez cada 5 s.", spoken: "pedir ayuda", fields: {}, rate: { perSecond: 1, burst: 2 } },
    rendirse: { describe: "Estando derribado: no esperar más y volver ya al punto de reaparición del mundo. No pierdes nada.", spoken: "volver al punto de reaparición", fields: {}, rate: { perSecond: 1, burst: 2 } },
    encender: { describe: "Encender o apagar el estado derribado del mundo (activa = true/false). Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda. Apagarlo pone en pie a quien esté derribado.", spoken: "encender o apagar el estado derribado", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 6 } },
  },
  events: {
    derribado: { describe: "A ti solo: has caído y estás derribado. segundos = lo que tardarás en volver por tu cuenta; seguro = en este mundo no pierdes nada.", fields: { segundos: SEG, seguro: { kind: "bool", default: true } }, announce: { text: "Estás derribado. Un compañero puede levantarte; si no, vuelves al punto de reaparición en {segundos} s. No pierdes nada.", sound: "error", importance: 2 } },
    cae: { describe: "Alguien ha caído y se le puede levantar (quien = su entidad; x, z = dónde). A quien está a 40 m.", fields: { quien: QUIEN, x: X, z: X }, announce: { text: "Alguien ha caído: se le puede levantar.", sound: "aviso", importance: 2 } },
    ayuda: { describe: "Un derribado pide ayuda (quien = su entidad; x, z = dónde está). A quien está a 40 m.", fields: { quien: QUIEN, x: X, z: X }, announce: { text: "Alguien derribado pide ayuda.", sound: "aviso", importance: 2 } },
    levanta: { describe: "Un compañero (por) ha levantado a quien estaba derribado (quien). A quien está a 40 m.", fields: { quien: QUIEN, por: QUIEN }, announce: { text: "Levantan a un compañero.", sound: "magia", importance: 2 } },
    reaparece: { describe: "Quien estaba derribado (quien) vuelve al punto de reaparición del mundo, por tiempo o porque se rindió, con todo lo suyo intacto. A quien está a 40 m del sitio donde estaba y a la propia persona.", fields: { quien: QUIEN, seguro: { kind: "bool", default: true } }, announce: { text: "Alguien reaparece en el punto de reaparición.", sound: "aviso", importance: 1 } },
    rechazado: { describe: "No se hizo, y por qué (lejos, no hay nadie derribado ahí, estás derribado, pieza apagada…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    permiso: { describe: "A ti solo: si puedes encender y apagar piezas del mundo (quien dirige o manda). Con eso la página muestra o no su interruptor.", fields: { encender: { kind: "bool" } }, announce: "silent" },
  },
});
