// sucesos — declaration (v1, Y48: «un evento de mundo que se anuncia, avanza solo y premia a todos»). A piece (pieza) any
// world turns on with a file: `entorno/sucesos.json` lists its events. The SERVER runs them (R-1: the page decides
// nothing). An event has three phases and NO failure state:
//   anunciado → everyone near hears it is coming (no «!» above a head, no quest to accept) and a count runs down;
//   en curso  → it moves by itself, with nobody there: nobody is needed for it to finish. Whoever stands in its zone
//               makes it go faster, by whole numbers (`ayuda` % per person, up to `ayudaMax` people);
//   hecho     → EVERY participant gets the whole reward (not split), and the result CHAINS another event
//               (`siguiente`, weighted draw from the world's integer RNG) — it never ends in «you failed».
// Taking part is standing in the zone: no verb needed (a keyboard, a phone, VR or an agent walk in the same way). The
// verbs `mirar` (what is going on) and `lanzar` (who directs starts it now) also exist as chat orders (/evento).
// Numbers are integers: progress runs 0..PROGRESO_ESCALA, per second `floor(ESCALA·(100+ayuda·k)/(100·duracion))`.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who gets an event in the shared state / hears its announcement, from afar (m). */
export const ALCANCE_M = 60;
/** Most events one world lists. */
export const SUCESOS_MAX = 32;
/** Progress is an integer out of this (a millionth is the unit, so a one-hour event still moves every second). */
export const PROGRESO_ESCALA = 1_000_000;
/** The server ticks at 20 Hz: an event is stepped once a second. */
export const PASO_TICKS = 20;
export const DURACION_MAX = 3600, AVISO_MAX = 600, AYUDA_MAX_PCT = 100, PERSONAS_MAX = 32, CUANTO_MAX = 1_000_000, PESO_MAX = 100;
export const FASES = ["dormido", "anunciado", "curso"] as const;
export type Fase = (typeof FASES)[number];

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;
const TEXTO = { kind: "text", maxBytes: 120 } as const;
const COSA = { kind: "text", maxBytes: 24, default: "" } as const;
const CUANTOS = { kind: "int", min: 0, max: 1000 } as const;

export const sucesos = defineFeature({
  id: "sucesos",
  version: 1,
  level: "base",
  describe: "Sucesos del mundo que se anuncian a quien está cerca, avanzan solos y premian a todos: nadie tiene que aceptar nada ni hay misiones con «!». Mientras corre, cada persona en su zona lo acelera un poco (números enteros); si no hay nadie, termina igual, más despacio. No tiene fallo: al acabar, cada participante recibe la recompensa entera y el resultado encadena otro evento que el mundo ha declarado. Los lleva el servidor; órdenes: mirar (qué pasa) y lanzar (quien dirige lo empieza ya).",
  state: {
    describe: "Un evento por clave (su id): nombre; dónde (x, z; y = altura del suelo, m) y radio de su zona (m); fase (dormido, anunciado, curso); quedan = segundos para que empiece (solo anunciado); progreso = por mil de lo hecho (0 a 1000); ayudan = personas en su zona ahora; texto = la frase que se lee en su ficha.",
    fields: {
      nombre: NOMBRE, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 2, max: 60, step: 0.1, default: 12 },
      fase: { kind: "enum", values: [...FASES] },
      quedan: { kind: "int", min: 0, max: AVISO_MAX }, progreso: { kind: "int", min: 0, max: 1000 }, ayudan: CUANTOS,
      texto: TEXTO,
    },
    card: { role: "lugar", name: "{nombre}", description: "Suceso del mundo: lo lleva el servidor, avanza solo y premia a todos los que están en su zona", at: ["x", "z"], actions: ["mirar", "lanzar"], interact: { intent: "mirar", prompt: "ver qué pasa en el evento", radius: "radio", key: "id" } },
    radius: ALCANCE_M,
  },
  intents: {
    mirar: { describe: "Preguntar qué pasa en un evento (id): si duerme, cuánto falta para que empiece o cuánto lleva y cuánta gente ayuda. Te contesta solo a ti, sin moverte ni gastar nada.", spoken: "mirar el evento", fields: { id: ID }, rate: { perSecond: 2, burst: 4 } },
    lanzar: { describe: "Empezar ya un evento dormido (id): se anuncia a quien esté cerca y corre su cuenta atrás de siempre. Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda.", spoken: "lanzar el evento", fields: { id: ID }, rate: { perSecond: 1, burst: 3 } },
  },
  events: {
    anuncio: {
      describe: "Un evento se anuncia o empieza: a quien esté a ALCANCE_M de él. Lleva su nombre y la frase del mundo; la página lo dice en voz alta y suena una campana, sin marcas sobre nadie.",
      fields: { id: ID, nombre: NOMBRE, texto: TEXTO, quedan: { kind: "int", min: 0, max: AVISO_MAX } },
      announce: { text: "{texto}", sound: "campana", importance: 2 },
    },
    hito: {
      describe: "Un evento va por la cuarta parte, la mitad o tres cuartas partes: a quien está cerca. Dice cuánta gente ayuda.",
      fields: { id: ID, nombre: NOMBRE, texto: TEXTO, progreso: { kind: "int", min: 0, max: 1000 }, ayudan: CUANTOS },
      announce: { text: "{texto}", sound: "suave", importance: 1 },
    },
    termina: {
      describe: "Un evento acabó (siempre acaba bien): a quien está cerca. Dice cuánta gente tomó parte y qué evento viene después, si lo hay.",
      fields: { id: ID, nombre: NOMBRE, texto: TEXTO, participantes: CUANTOS, siguiente: { kind: "text", maxBytes: 16, default: "" } },
      announce: { text: "{texto}", sound: "campana", importance: 2 },
    },
    recompensa: {
      describe: "A ti solo, si tomaste parte: tu recompensa ENTERA (la misma para cada participante, no se reparte). cosa = qué (vacío = solo la frase), cuanto = cuántas unidades.",
      fields: { id: ID, nombre: NOMBRE, texto: TEXTO, cosa: COSA, cuanto: { kind: "int", min: 0, max: CUANTO_MAX } },
      announce: { text: "{texto}", sound: "campana", importance: 2 },
    },
    estado: {
      describe: "A ti solo, la respuesta a `mirar`: la frase de cómo está el evento.",
      fields: { id: ID, texto: TEXTO },
      announce: { text: "{texto}", sound: "suave", importance: 1 },
    },
    otorga: {
      describe: "Solo para el servidor (no llega a ninguna página): una recompensa dada a una persona, para que otra pieza (inventario, bienes, el cable) la anote. quien = su entidad.",
      fields: { id: ID, quien: { kind: "int", min: 0, max: 65535 }, cosa: COSA, cuanto: { kind: "int", min: 0, max: CUANTO_MAX } },
      announce: "silent",
    },
    cadena: {
      describe: "Solo para el servidor: un evento acabó y encadena otro (siguiente, vacío = ninguno). Lo oye el cable por si quiere hacer algo más.",
      fields: { id: ID, siguiente: { kind: "text", maxBytes: 16, default: "" }, participantes: CUANTOS },
      announce: "silent",
    },
    rechazado: { describe: "La orden que diste a un evento no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});

