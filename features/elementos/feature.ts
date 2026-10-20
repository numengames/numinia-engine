// elementos — declaration (H4 + H8: water, fire, air). Things of the world that move by themselves: a pond (agua), a
// campfire (fuego: flames, smoke, sparks and a flickering light), a smoke column (humo), dust blown by the wind
// (polvo). Each is a state entry WITH `at` (J9: it reaches players within `radius`), saved (S4), with a card so a
// blind player hears «Hoguera» or «Estanque» near; with an empty name it is decoration. Earth is the ground of
// features/entorno; height terrain waits for physics (M6).
import { defineFeature } from "../../packages/feature/src/index.ts";
import type { Fields } from "../../packages/feature/src/index.ts";

export const TIPOS = ["agua", "fuego", "humo", "polvo"] as const;
/** Most elements one zone holds. */
export const ELEMENTOS_MAX = 300;
/** Who receives an element (m): a pond or a fire is seen from afar; animation stops much nearer (render). */
export const ALCANCE_M = 160;
/** What an element is called when the builder gives no name ("" = decoration). */
export const NOMBRES: Record<(typeof TIPOS)[number], string> = { agua: "Estanque", fuego: "Hoguera", humo: "Columna de humo", polvo: "" };

const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const ID = { kind: "text", maxBytes: 16 } as const;
/** Shape and look: width × depth (water surface, dust area), height (smoke column, dust layer), size (fire, smoke),
 * turn (degrees), colour (0xRRGGBB: water, smoke, dust; the fire ignores it), strength (how much it emits, 0-4). */
const FORMA: Fields = {
  ancho: { kind: "fixed", min: 0.2, max: 200, step: 0.1, default: 6 },
  largo: { kind: "fixed", min: 0.2, max: 200, step: 0.1, default: 4 },
  alto: { kind: "fixed", min: 0, max: 100, step: 0.1, default: 6 },
  tamano: { kind: "fixed", min: 0.1, max: 10, step: 0.05, default: 1 },
  giro: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 },
  color: { kind: "int", min: 0, max: 0xffffff, default: 0x2f6f8f },
  intensidad: { kind: "fixed", min: 0, max: 4, step: 0.01, default: 1 },
  nombre: { kind: "text", maxBytes: 60, default: "" },
};

export const elementos = defineFeature({
  id: "elementos",
  version: 1,
  level: "base",
  describe: "Agua, fuego, humo y polvo en el mundo: un estanque, una hoguera con su luz, una columna de humo, polvo que lleva el viento. Quien tiene permiso de construir los pone, cambia y quita en directo; los ve quien está cerca y sobreviven a los reinicios.",
  store: { describe: "Por elemento, quién lo puso y cuándo (`a:<id>`), y el contador de ids (`siguiente`). Nunca va a las páginas." },
  state: {
    describe: "Una entrada por elemento (clave = su id). tipo = agua | fuego | humo | polvo; x, y, z en metros (y = altura de la superficie del agua o de la base); ancho × largo = superficie (agua, polvo); alto = altura (humo, polvo); tamano = escala (fuego, humo); giro en grados; color 0xRRGGBB; intensidad 0-4 (cuánto emite); nombre vacío = decorado.",
    fields: { tipo: { kind: "enum", values: TIPOS }, x: X, y: Y, z: X, ...FORMA },
    card: { role: "objeto", name: "{nombre}", description: "Elemento: {tipo}", at: ["x", "z"], actions: ["cambiar", "quitar"] },
    persist: true,
    radius: ALCANCE_M,
  },
  intents: {
    poner: { describe: "Poner agua, fuego, humo o polvo en un sitio. Sin nombre, el servidor le da el de su tipo (Estanque, Hoguera…); el polvo es decorado.", spoken: "poner un elemento", fields: { tipo: { kind: "enum", values: TIPOS }, x: X, y: Y, z: X, ...FORMA } },
    cambiar: { describe: "Mover, girar, agrandar o recolorear un elemento: se envían todos sus valores (los del estado con lo cambiado).", spoken: "cambiar un elemento", fields: { id: ID, x: X, y: Y, z: X, ...FORMA }, rate: { perSecond: 10, burst: 20 } },
    quitar: { describe: "Quitar un elemento del mundo.", spoken: "quitar un elemento", fields: { id: ID } },
    vaciar: { describe: "Quitar todos los elementos del mundo (parte de restaurar el mundo). Solo quien puede construir.", spoken: "quitar todos los elementos", fields: {}, rate: { perSecond: 1, burst: 2 } },
  },
  events: {
    permiso: { describe: "Si puedes poner elementos (llega al entrar y al identificarte).", fields: { construir: { kind: "bool" } }, announce: "silent" },
    hecho: { describe: "Tu cambio se hizo: el elemento que tocó.", fields: { id: ID, accion: { kind: "enum", values: ["poner", "cambiar", "quitar", "vaciar"] } }, announce: "silent" },
    rechazado: { describe: "Tu cambio no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
