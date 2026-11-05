// espejo — declaration (mundo-hermes, v1). A MIRROR of objects that live outside the world: an outside source (a Hermes plugin, a CI, a
// home panel…) publishes a list of «things» (id, type, title, state, zone, verbs) and the SERVER puts them in the world as things with a
// card; a person near one may ask for a verb on it (`pedir`) and the server only forwards the request outwards — it never runs anything
// and never trusts what comes back beyond showing it. A world turns it on with `entorno/espejo.json` (numinia-engine/espejo@1,
// esquema.ts); without the file this piece is inert: it puts nothing, says nothing and costs nothing. The truth lives outside: nothing
// here persists. Texts that come from outside are UNTRUSTED (cut, stripped of control characters, painted escaped, never in an AI's
// instructions: STD-050). Recipe: docs/EXTENDER.md. Reusable (R-1): it does not know what Hermes is.
import { defineFeature } from "../../packages/feature/src/index.ts";
import { ESTADOS, LIMITES } from "./esquema.ts";

/** Who gets a thing in the shared state, from afar (m). A zone is up to 200 m wide: things are told to people inside it. */
export const ALCANCE_M = 96;
/** How far a person may be from a thing to ask for something on it (m), on top of the engine's own slack. */
export const RADIO_USO_M = 6;
/** A request nobody answers in this many seconds expires, and the person hears «no ha respondido». */
export const CADUCA_S = 30;
/** Requests one person may have waiting at once, and the world in total. */
export const PETICIONES_POR_PERSONA = 3, PETICIONES_MAX = 20;

const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01, default: 0 } as const;
const OBJ = { kind: "text", maxBytes: 64 } as const;

export const espejo = defineFeature({
  id: "espejo",
  version: 1,
  level: "base",
  describe: "Espejo de cosas de fuera: una fuente externa (por una conexión local) publica cosas con título, estado, zona y acciones, y el servidor las pone en el mundo con su ficha. Quien manda en el mundo, desde cerca, puede pedir una acción sobre una cosa; el servidor comprueba distancia, permiso, que el verbo sea de esa cosa y el ritmo, y solo entonces lo manda fuera como petición: no ejecuta nada. Lo de fuera manda; aquí no se guarda nada. Apagada (sin entorno/espejo.json) no hace nada.",
  state: {
    describe: "Una cosa por clave «<tipo>/<id>»: título (≤ 60 bytes) y subtítulo (≤ 120), su estado (programado, pausado, fallo…), la zona donde está, dónde (x, z; m), si tiene luz encendida y las acciones que ofrece (verbos separados por espacios). Todo texto viene de fuera y no es fiable: se pinta escapado.",
    fields: {
      titulo: { kind: "text", maxBytes: LIMITES.titulo },
      subtitulo: { kind: "text", maxBytes: LIMITES.subtitulo },
      estado: { kind: "enum", values: ESTADOS, default: "desconocido" },
      zona: { kind: "text", maxBytes: 32 },
      x: X, z: X,
      luz: { kind: "bool", default: false },
      acciones: { kind: "text", maxBytes: 160 },
      // M6: `documento` → url (checked against the world's allowlist), `habilidad` → grupo + descripcion, `tablero` → tablero (JSON of the 3 columns). Empty on every other kind.
      url: { kind: "text", maxBytes: LIMITES.url },
      grupo: { kind: "text", maxBytes: LIMITES.grupo },
      descripcion: { kind: "text", maxBytes: LIMITES.descripcion },
      tablero: { kind: "text", maxBytes: LIMITES.tablero },
    },
    card: { role: "objeto", name: "{titulo}", description: "{subtitulo}", at: ["x", "z"], actions: ["pedir"], interact: { intent: "usar", prompt: "mirar {titulo}", radius: RADIO_USO_M, key: "objeto" } },
    radius: ALCANCE_M,
  },
  intents: {
    usar: {
      describe: "Acercarse a una cosa del espejo y mirarla: el servidor comprueba que está a su alcance y le dice, solo a usted, qué es, cómo está y qué acciones ofrece.",
      spoken: "mirar la cosa",
      fields: { objeto: OBJ },
      rate: { perSecond: 2, burst: 4 },
    },
    pedir: {
      describe: "Pedir una acción (verbo) sobre una cosa del espejo, p. ej. «cron.pausar». Solo quien manda en el mundo, estando cerca, y solo un verbo que la cosa ofrece. El servidor la manda fuera como petición y no ejecuta nada; la respuesta llega después.",
      spoken: "pedir una acción",
      fields: { objeto: OBJ, verbo: { kind: "text", maxBytes: 32 } },
      rate: { perSecond: 1, burst: 3 },
    },
    encender: {
      describe: "Encender o apagar una función del espejo (p. ej. «cron») para todo el mundo, desde dentro: las lámparas del panel de interruptores. Solo una persona identificada que dirige aquí o manda (nunca una IA). El servidor escribe `funciones.<nombre>` en entorno/espejo.json (con permiso, atómico y sin sustituir un fichero malo), lo aplica al momento sin reiniciar, quita del mundo las cosas de la función apagada y se lo cuenta a la fuente de fuera.",
      spoken: "encender o apagar una función del espejo",
      fields: { funcion: { kind: "text", maxBytes: 24 }, activa: { kind: "bool" } },
      rate: { perSecond: 1, burst: 4 },
    },
  },
  events: {
    permiso: { describe: "A usted solo (al entrar, al identificarse y al cambiar sus roles): si puede encender o apagar funciones del espejo.", fields: { encender: { kind: "bool" } }, announce: "silent" },
    funcion: { describe: "A todos: una función del espejo se encendió o se apagó (`texto` es lo que se lee).", fields: { funcion: { kind: "text", maxBytes: 24 }, activa: { kind: "bool" }, texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    cambiado: { describe: "Una cosa del espejo cambió (para quien la tiene cerca): `texto` es lo que se lee, p. ej. «Tarea Resumen diario: en pausa».", fields: { objeto: OBJ, texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "suave", importance: 0 } },
    ficha: { describe: "A usted solo, tras `usar`: qué es la cosa, cómo está y qué se le puede pedir.", fields: { objeto: OBJ, texto: { kind: "text", maxBytes: 240 } }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    rechazado: { describe: "A usted solo: no se hizo, y por qué (lejos, sin permiso, verbo que la cosa no ofrece, demasiado rápido, función apagada…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    pedido: { describe: "A usted solo: su petición salió hacia la fuente y espera respuesta; `espera` son los segundos que se le dan.", fields: { objeto: OBJ, verbo: { kind: "text", maxBytes: 32 }, espera: { kind: "int", min: 1, max: 120 }, texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    resultado: { describe: "A usted solo: la fuente respondió a su petición (o caducó sin respuesta). `ok` dice si se hizo; `texto` es lo que se lee.", fields: { objeto: OBJ, verbo: { kind: "text", maxBytes: 32 }, ok: { kind: "bool" }, texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "aviso", importance: 2 } },
    aviso: { describe: "A todos: la fuente de fuera se conectó o se desconectó; mientras no esté, las acciones se rechazan.", fields: { conectada: { kind: "bool" }, texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "aviso", importance: 2 } },
  },
});
