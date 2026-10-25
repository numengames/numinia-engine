// director — declaration (N6, corte 1): the Game Director (Director de Juego, DJ, in the house's canon: a facilitator
// who presents scenes, gives the world a voice and calls people together; never moves anyone who did not say yes).
// Directing is NOT a new role: it is the action `dirigir`, which the world's roles map to STD-052 `manage-rituals`
// (a ritual = a gathering with a convener, STD-026). What a scene is lives in the adventure's files
// (`aventura/escenas/<id>.json`, escena@1, escena.ts); the environment applies it (features/entorno listens to
// `aplicar`). Design: work/noche-20261018/N6-director-de-juego.md (outside the repo).
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Longest line the director narrates (characters of UTF-8 bytes: the field is bytes). */
export const NARRACION_MAX = 280;
/** Longest text of a summons. */
export const CONVOCATORIA_MAX = 120;
/** Longest scene name; scene ids are 1-32 lowercase letters, digits and hyphens (the file's name). */
export const NOMBRE_MAX = 40;
export const ID_MAX = 32;
/** Most scenes an adventure ships (the panel lists them all; each is one small event to each director). */
export const ESCENAS_MAX = 40;
/** The state's only key: the scene on now. */
export const ACTUAL = "actual";

const ID = { kind: "text", maxBytes: ID_MAX } as const;
const NOMBRE = { kind: "text", maxBytes: NOMBRE_MAX } as const;
/** t_scene_ambiente: a scene's own ambient bed on the wire. `ambiente`: "" = the world's own (ficha.json), "-" = silence, else a
 * catalogue id; `ganancia`: -1 = the default volume, else ×0…4 (the same range as ficha.json `audio.ambiente_ganancia`). */
export const AMBIENTE_MUNDO = "", AMBIENTE_SILENCIO = "-", GANANCIA_DEF = -1, GANANCIA_MAX = 4;
const AMBIENTE = { kind: "text", maxBytes: 32 } as const;
const GANANCIA = { kind: "fixed", min: -1, max: GANANCIA_MAX, step: 0.001 } as const;
/** What the page asks of the sound door while a scene is on: the scene's own bed over the world's. `actual` = the scene's wire
 * fields (null or `ambiente` "" = no scene / a scene without a sound → the world's own bed, and its volume); `mundo` = the
 * world's `audio` (ficha.json). The synthesised beds always stay the world's. A volume of -1 is «the default». */
export function ambienteDeEscena(actual: { ambiente: string; ganancia: number } | null, mundo?: { ambiente?: string | null; ambiente_ganancia?: number; ambiente_sintetizado?: string[] } | null): { id: string | null; ganancia: number | undefined; sintetizado: string[] | undefined } {
  const m = mundo ?? {};
  if (!actual || actual.ambiente === AMBIENTE_MUNDO) return { id: m.ambiente ?? null, ganancia: m.ambiente_ganancia, sintetizado: m.ambiente_sintetizado };
  return { id: actual.ambiente === AMBIENTE_SILENCIO ? null : actual.ambiente, ganancia: actual.ganancia < 0 ? undefined : actual.ganancia, sintetizado: m.ambiente_sintetizado };
}

const POS = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;

export const director = defineFeature({
  id: "director",
  version: 1,
  level: "base",
  describe: "El Director de juego (DJ): quien puede dirigir (permiso de la organización «gestionar rituales») pone escenas de la aventura (cielo, luz y niebla de golpe, con una línea de narración), narra una línea para todos y convoca a la gente a donde está: cada persona elige «Ir» o «Ahora no». Nadie se mueve sin decir que sí.",
  state: {
    describe: "Una sola entrada, «actual»: la escena puesta (id y nombre; vacío = ninguna todavía), quién la puso y el sonido de ambiente que trae (vacío = el del mundo).",
    fields: { id: ID, nombre: NOMBRE, quien: NOMBRE, ambiente: AMBIENTE, ganancia: GANANCIA },
    persist: true,
  },
  intents: {
    escena: { describe: "Poner una escena: una de la aventura (aventura/escenas/<id>.json) o un entorno de la casa (día, noche, niebla…). Solo quien puede dirigir.", spoken: "poner una escena", fields: { id: ID }, rate: { perSecond: 2, burst: 4 } },
    narrar: { describe: "Decir una línea del narrador a todo el mundo (en el centro de la pantalla y en voz alta para el lector). Solo quien puede dirigir.", spoken: "narrar", fields: { texto: { kind: "text", maxBytes: NARRACION_MAX } }, rate: { perSecond: 0.5, burst: 3 } },
    convocar: { describe: "Convocar a todos a donde estás, con un texto opcional; cada uno elige si va. Solo quien puede dirigir.", spoken: "convocar", fields: { texto: { kind: "text", maxBytes: CONVOCATORIA_MAX } }, rate: { perSecond: 0.2, burst: 2 } },
    acudir: { describe: "Responder a una convocatoria: ir (sí) o ahora no.", spoken: "responder a la convocatoria", fields: { id: { kind: "int", min: 0, max: 1_000_000 }, si: { kind: "bool" } }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    permiso: { describe: "Si puedes dirigir aquí (llega al entrar, al identificarte y cuando cambian tus roles).", fields: { dirigir: { kind: "bool" } }, announce: "silent" },
    escenaDisponible: { describe: "Una escena que puedes poner (solo a quien dirige, una por mensaje, en orden; n empieza en 0). Las de la casa llevan casa = sí.", fields: { id: ID, nombre: NOMBRE, n: { kind: "int", min: 0, max: 255 }, total: { kind: "int", min: 0, max: 255 }, casa: { kind: "bool" } }, announce: "silent" },
    puesta: { describe: "Ha cambiado la escena (con su sonido de ambiente, si trae: vacío = el del mundo, «-» = silencio).", fields: { nombre: NOMBRE, quien: NOMBRE, ambiente: AMBIENTE, ganancia: GANANCIA }, announce: { text: "Escena: {nombre}", sound: "suave", importance: 1 } },
    narracion: { describe: "El narrador dice una línea a todos.", fields: { texto: { kind: "text", maxBytes: NARRACION_MAX }, quien: NOMBRE }, announce: { text: "{texto}", sound: "aviso", importance: 2 } },
    convocatoria: { describe: "Alguien que dirige te convoca a su sitio. Responde con acudir (sí: la página pone una baliza allí; ahora no: nada).", fields: { id: { kind: "int", min: 0, max: 1_000_000 }, de: NOMBRE, quien: { kind: "int", min: -1, max: 1_000_000 }, texto: { kind: "text", maxBytes: CONVOCATORIA_MAX }, x: POS, z: POS }, announce: { text: "{de} te convoca: {texto}", sound: "campana", importance: 2 } },
    respuestas: { describe: "Cuántos vienen y cuántos dicen «ahora no» a tu convocatoria (solo a quien convocó).", fields: { id: { kind: "int", min: 0, max: 1_000_000 }, vienen: { kind: "int", min: 0, max: 100_000 }, no: { kind: "int", min: 0, max: 100_000 } }, announce: "silent" },
    rechazado: { describe: "Lo que pediste como director no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    // server-scope events (never reach a page): the environment applies a scene's look; the chat answers an order
    aplicar: { describe: "Para el entorno (solo en el servidor): poner el aspecto de una escena sobre el entorno del mundo. preset = uno de la casa o vacío; entorno = entorno@1 parcial en JSON, o vacío.", fields: { preset: { kind: "text", maxBytes: 16 }, entorno: { kind: "text", maxBytes: 512 } }, announce: "silent" },
    aviso: { describe: "Para el chat (solo en el servidor): la respuesta a una orden /escena, /escenas, /narrar o /convocar, solo para quien la escribió.", fields: { quien: { kind: "int", min: 0, max: 1_000_000 }, texto: { kind: "text", maxBytes: 300 } }, announce: "silent" },
  },
});
