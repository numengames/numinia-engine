// sonido — declaration (S6, v1). La pieza que hace sonar la casa. R-1: un mundo la enciende sin escribir código — la
// cablea en `disparadores.json` (`{ "accion": "suena", "sonido": "<id del catálogo>" }`) y ya suena para quien está
// cerca; sin cable, no suena nada y nada falla.
//
// **El servidor manda**: qué id suena, con qué SEMILLA (de ella sale la variante y la variación de tono: todos oyen
// la misma en el mismo instante — `packages/render/src/audio/voces.ts`, `azarDe`), desde dónde y para quién. La
// página no pide sonidos: no hay ninguna intención aquí. Solo recibe el evento `suena` y lo toca por el bus que diga
// el catálogo (`features/sonido/catalogo.json`).
//
// Accesibilidad (XAUR, WCAG 2.2): **cada sonido lleva su texto**. El catálogo obliga a que cada id tenga `texto`, y
// viaja en el evento, así que quien no oye lo lee en la región en vivo de la página igual que cualquier otro aviso.
// Y el bus `interfaz` nunca se duckea ni baja de su suelo de volumen (`packages/render/src/audio/nucleo.ts`).
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Los ocho buses del núcleo de audio. Es la MISMA lista que `BUSES` en `packages/render/src/audio/nucleo.ts`: una
 *  función del motor no puede importar `packages/render` (tools/layers.json), así que se repite aquí y
 *  `test/sonidos.test.ts` comprueba que las dos listas no se separan nunca. */
export const BUSES_SONIDO = ["master", "musica", "ambiente", "efectos", "interfaz", "voz-gente", "voz-lector", "pasos-propios"] as const;
export type BusSonido = (typeof BUSES_SONIDO)[number];

/** Hasta dónde se oye un sonido del mundo cuando nadie dice otra cosa (m). El mismo `CERCA_M` del cable. */
export const OYE_M = 30;
/** Prioridad 0-100 (como Wwise). 100 = la interfaz: no se aparta nunca. */
export const PRIORIDAD_MAX = 100;
/** Nadie espera más de esto entre dos disparos del mismo id (ms). */
export const COOLDOWN_MAX_MS = 5000;
/** Variantes por id (el catálogo de hoy llega a 12 en `golpe-material`). */
export const VARIANTES_MAX = 16;
/** Ids del catálogo, como mucho. */
export const SONIDOS_MAX = 128;
/** Forma de un id del catálogo: lo mismo que acepta el receptor `suena` del cable. */
export const ID_SONIDO_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01, default: 0 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535, default: 0 } as const;

export const sonido = defineFeature({
  id: "sonido",
  version: 1,
  level: "base",
  describe: "Los sonidos de la casa: 27 ids CC0 con sus variantes, su bus, su prioridad y su texto accesible (features/sonido/catalogo.json), servidos por su sha256 en /a/<sha256>.opus. El servidor decide qué suena, con qué semilla (todos oyen la misma variante en el mismo instante) y desde dónde; la página solo mezcla. Un mundo lo enciende cableando «suena» en disparadores.json, sin escribir código (R-1). Un id que no existe, o un fichero cuyo sha256 no cuadra, se queda fuera con un aviso en el registro: el mundo sigue sonando con los demás.",
  events: {
    suena: {
      describe: "Suena un sonido del catálogo de la casa: su id, la semilla que eligió el servidor (de ella salen la variante y la variación de tono, iguales en todas las páginas), dónde (x, y, z, en metros) y si va en el espacio (espacial) o en la cabeza (los avisos y la interfaz), quién lo provocó (0 = nadie en concreto) y el texto que lee quien no oye.",
      fields: {
        sonido: { kind: "text", maxBytes: 32 },
        semilla: { kind: "int", min: 0, max: 4_294_967_295 },
        x: X, y: Y, z: X,
        espacial: { kind: "bool", default: true },
        quien: QUIEN,
        texto: { kind: "text", maxBytes: 120 },
      },
      // «silent» NO quiere decir callado: quiere decir que el aviso de la casa no se mete por medio. El sonido de
      // este evento ES el fichero del catálogo (que la página toca por `view.sonido`), y el texto accesible va en el
      // propio evento (`texto`): la página lo lleva a la región de avisos (`anunciar`, apps/plaza/paneles.ts) para
      // quien lee en vez de oír (XAUR, WCAG 2.2 — ningún sonido sin texto). Si aquí declarásemos `sound`, cada
      // sonido del catálogo se oiría dos veces: su fichero y un pitido de la casa encima.
      announce: "silent",
    },
    faltan: {
      describe: "Solo para las funciones del servidor (alcance «server»): al arrancar, cuántos ids del catálogo se quedaron fuera y por qué (un fichero que no está en este servidor, un sha256 que no cuadra, una línea mal escrita). El mundo suena igual con los que sí están.",
      fields: { cuantos: { kind: "int", min: 0, max: SONIDOS_MAX }, motivo: { kind: "text", maxBytes: 200 } },
      announce: "silent",
    },
  },
});
