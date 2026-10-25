// ficha-mundo — declaration (H7, decision R-1: every setting of a world is something its owner sets without touching code). The world's
// settings — title, picture, everyone's default avatar and how many people fit — live in the world's folder as
// `aventura/ficha.json` (ficha@1, file over app). The owner changes them from the settings panel (apps/plaza/ficha-mundo.ts); the SERVER
// checks who (`mandar`: the administrator or an owner), validates with the same rules the file has at start, writes ONLY those keys and tells
// every page, so the title in the tab changes at once for everybody and the limit is enforced at the door (close code 4004 «lleno n/aforo»).
// Nothing here touches the simulation or the fingerprint; a world nobody edits behaves exactly as before.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The state's only key. */
export const AJUSTES = "ajustes";

export const fichaMundo = defineFeature({
  id: "ficha-mundo",
  version: 1,
  level: "base",
  describe: "Los ajustes del mundo: título, imagen, avatar por defecto y límite de personas. Se guardan en aventura/ficha.json; los cambia quien manda en el mundo y llegan a todos al momento.",
  state: {
    describe: "Una entrada, «ajustes»: nombre (1-60 caracteres), portada («<sha256>.png|jpg|webp» de una imagen que está en el servidor, o vacío), avatar (id de un avatar de la casa que llevan todos, o vacío; se aplica a quien entra después), aforo (personas a la vez, 1-1000; 0 = sin límite propio, el del motor), capacidad (lo más que admite este motor) y guardado (false = el mundo no tiene carpeta donde escribir: el cambio dura hasta reiniciar).",
    fields: {
      nombre: { kind: "text", maxBytes: 240, default: "" },
      portada: { kind: "text", maxBytes: 80, default: "" },
      avatar: { kind: "text", maxBytes: 40, default: "" },
      aforo: { kind: "int", min: 0, max: 1000, default: 0 },
      capacidad: { kind: "int", min: 1, max: 100000, default: 1000 },
      guardado: { kind: "bool", default: true },
    },
  },
  intents: {
    ajustar: {
      describe: "Poner los ajustes del mundo (todos a la vez, como los muestra el panel): nombre obligatorio; portada y avatar vacíos = sin valor; aforo 0 = sin límite propio. Solo quien manda en el mundo; el servidor los valida, escribe aventura/ficha.json y avisa a todas las páginas. Con el mundo ya lleno, nadie se echa: el siguiente que llegue lee el aviso.",
      spoken: "cambiar los ajustes del mundo",
      fields: {
        nombre: { kind: "text", maxBytes: 240, default: "" },
        portada: { kind: "text", maxBytes: 80, default: "" }, avatar: { kind: "text", maxBytes: 40, default: "" },
        aforo: { kind: "int", min: 0, max: 1000, default: 0 },
      },
      rate: { perSecond: 1, burst: 3 },
    },
  },
  events: {
    permiso: { describe: "Si puedes cambiar los ajustes del mundo (llega al entrar y al identificarte).", fields: { ajustar: { kind: "bool" } }, announce: "silent" },
    cambiado: { describe: "Los ajustes del mundo han cambiado.", fields: { nombre: { kind: "text", maxBytes: 240 } }, announce: { text: "Ajustes del mundo guardados: {nombre}", sound: "suave", importance: 0 } },
    rechazado: { describe: "Tu cambio de los ajustes del mundo no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
