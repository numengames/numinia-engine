// disparadores — declaration (v1, D-041 «el cable»). A world wires «when this happens, do that» with DATA, no code:
// MUNDO_DIR/disparadores.json lists triggers (a `zona` you walk into, or a `boton` you press: «E: pulsar») each with a
// cooldown, whether it fires once only, and a list of receivers (`muestra`, `oculta`, `teletransporta`, `da_paso`,
// `abre_enlace`, `suena`). The SERVER decides every firing: it watches who enters a zone (api.onTick), checks the reach
// of a press (api.within), counts the cooldown in ticks, tells whoever is near (`disparado`) and emits one server-only
// `accion` per receiver, which the feature that owns that action hears (`api.listen("disparadores", "accion", …)`):
// features/objetos answers `muestra`/`oculta` today; the rest come in their own stories. Recipe: docs/EXTENDER.md «El cable».
import { defineFeature } from "../../packages/feature/src/index.ts";

export const ALCANCE_M = 64;
export const CERCA_M = 30;
/** The world may wire at most this many triggers (every zone is one distance per player per tick). */
export const DISPARADORES_MAX = 64;
/** Receivers per trigger (one `accion` each when it fires). */
export const RECEPTORES_MAX = 8;
export const COOLDOWN_MAX_S = 3600;
export const TICK_HZ = 20;
export const ACCIONES = ["muestra", "oculta", "teletransporta", "da_paso", "abre_enlace", "suena", "vuelve_a_seguro"] as const;
export type Accion = (typeof ACCIONES)[number];

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;

export const disparadores = defineFeature({
  id: "disparadores",
  version: 1,
  level: "base",
  describe: "El cable del mundo: disparadores que un constructor escribe en disparadores.json (una zona en la que se entra o un botón que se pulsa, «E: pulsar»), con tiempo de espera entre usos y, si quiere, de un solo uso. El servidor decide cada disparo, avisa a los cercanos y da una acción por receptor a la función que la hace (mostrar u ocultar un objeto, teletransportar, dar paso de misión, abrir enlace, sonar).",
  state: {
    describe: "Un disparador por clave: nombre, tipo (zona o boton), dónde (x, z; y = altura, m), radio de la zona (m), desde cuánto se pulsa un botón (alcance, m; 0 = no se ofrece), la frase del botón, cooldown (s), si es de un solo uso, cuántas veces ha disparado (usos), si está en espera ahora (enEspera) y si ya se agotó (agotado).",
    fields: {
      nombre: NOMBRE, tipo: { kind: "enum", values: ["zona", "boton"] }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 0.5, max: 64, step: 0.1, default: 3 },
      alcance: { kind: "fixed", min: 0, max: 16, step: 0.1, default: 0 },
      frase: NOMBRE,
      cooldown: { kind: "int", min: 0, max: COOLDOWN_MAX_S, default: 0 },
      unSoloUso: { kind: "bool", default: false },
      usos: { kind: "int", min: 0, max: 1_000_000_000, default: 0 },
      enEspera: { kind: "bool", default: false },
      agotado: { kind: "bool", default: false },
    },
    card: { role: "boton", name: "{nombre}", description: "Disparador del cable: una zona o un botón; el servidor decide qué pasa", at: ["x", "z"], actions: ["pulsar"], interact: { intent: "pulsar", prompt: "{frase}", radius: "alcance", key: "disparador" } },
    radius: ALCANCE_M,
  },
  intents: {
    pulsar: { describe: "Pulsar un disparador de tipo botón. Hay que estar a su alcance; el servidor lo comprueba, y también el cooldown y el un solo uso.", spoken: "pulsar el botón", fields: { disparador: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    disparado: {
      describe: "Un disparador ha saltado: quién (0 = nadie en concreto), cuál, su nombre, el disparo que hace (n) y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, disparador: ID, nombre: NOMBRE, n: { kind: "int", min: 1, max: 1_000_000_000 }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "campana", importance: 1, who: "quien" },
    },
    senal: {
      describe: "Solo para las funciones del servidor (alcance «server»): un disparador ha saltado (quién, cuál, nombre, tipo).",
      fields: { quien: QUIEN, disparador: ID, nombre: NOMBRE, tipo: { kind: "enum", values: ["zona", "boton"] } },
      announce: "silent",
    },
    accion: {
      describe: "Solo para las funciones del servidor (alcance «server»): una acción de un receptor del cable, una por receptor y disparo. `accion` dice cuál; los demás campos van según la acción (objeto para muestra/oculta; x, y, z para teletransporta; mision y paso para da_paso; enlace para abre_enlace; sonido para suena). La función que hace esa acción la oye con api.listen y devuelve true.",
      fields: { quien: QUIEN, disparador: ID, accion: { kind: "enum", values: ACCIONES }, objeto: NOMBRE, x: X, y: Y, z: X, mision: { kind: "text", maxBytes: 32 }, paso: { kind: "int", min: 0, max: 999, default: 0 }, enlace: { kind: "text", maxBytes: 200 }, sonido: { kind: "text", maxBytes: 32 } },
      announce: "silent",
    },
    rechazado: { describe: "No disparó, y por qué (lejos, todavía no, ya se usó, no hay tal disparador).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    // D-041 historias 3-4: the cable's own actions (no other feature owns moving someone or sounding a note); `da_paso`
    // goes to features/misiones instead (api.listen), so it has no event here.
    teletransportado: {
      describe: "El receptor «teletransporta» te ha puesto en otro sitio del mundo. Solo para quien se movió.",
      fields: { quien: QUIEN, x: X, y: Y, z: X },
      announce: { text: "Has aparecido en otro sitio.", sound: "magia", importance: 1, who: "quien" },
    },
    enlace: {
      describe: "El receptor «abre_enlace» te pregunta si quieres abrir una dirección web en una pestaña nueva. Solo para quien lo disparó; la página pregunta antes de abrir nada.",
      fields: { quien: QUIEN, enlace: { kind: "text", maxBytes: 200 } },
      announce: { text: "¿Abrir este enlace? {enlace}", sound: "aviso", importance: 1, who: "quien" },
    },
    sonido: {
      describe: "El receptor «suena» ha sonado, para quien esté cerca del disparador (CERCA_M). El motor hoy tiene un aviso fijo; el nombre que pidió el mundo viaja en el texto para quien lee en vez de oír.",
      fields: { sonido: { kind: "text", maxBytes: 32 } },
      announce: { text: "Suena: {sonido}.", sound: "aviso", importance: 0 },
    },
  },
});
