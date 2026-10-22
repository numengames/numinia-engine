// entorno — declaration (H4, parity with Hyperfy2's Sky + Wind, plus the ground of H4/«tierra» and tone/exposure
// of H12). One state entry per zone (key "zona", no `at`: the sky is seen from everywhere), saved (S4). The format of
// the files a world ships (`entorno@1`, nested and readable) lives in esquema.ts; on the wire it is these flat fields.
// Whoever may build (api.puede "construir") changes it live with a preset or fine values; every page applies it at once.
import { defineFeature } from "../../packages/feature/src/index.ts";
import type { Fields } from "../../packages/feature/src/index.ts";

/** Named environments (presets.json). «propio» = adjusted by hand after a preset. */
/** «jardín» is the house look (STD-023: the Mediterranean garden — Verdemar sky over an Arena horizon, a warm haze). */
export const PRESETS = ["día", "amanecer", "atardecer", "noche", "niebla", "tormenta", "nublado", "jardín"] as const;
export const SUELOS = ["hierba", "tierra", "arena", "roca", "nieve", "liso"] as const;
export const CIELOS = ["atmosfera", "degradado", "color"] as const;
export const TONOS = ["agx", "aces", "neutro", "ninguno"] as const;
/** The zone's only state key (M16 will bring several zones per world). */
export const ZONA = "zona";

const COLOR = { kind: "int", min: 0, max: 0xffffff } as const;
const FICHERO = { kind: "text", maxBytes: 72, default: "" } as const; // "<sha256>.<ext>" of a file in /a/, or ""
/** U14: the highest map cut (m above the ground). The map's camera flies at 80 m: a cut stays well under it. */
export const CORTE_MAX = 60;

/** The environment as it travels and is saved. Names are the contract with render (packages/render/src/entorno.ts). */
export const CAMPOS: Fields = {
  preset: { kind: "enum", values: [...PRESETS, "propio"], default: "día" },
  cielo: { kind: "enum", values: CIELOS, default: "atmosfera" },
  cieloArriba: { ...COLOR, default: 0x5d8fc9 },
  cieloHorizonte: { ...COLOR, default: 0xc9d8e4 },
  imagen: FICHERO,
  hdr: FICHERO,
  turbidez: { kind: "fixed", min: 0, max: 20, step: 0.1, default: 2 },
  nubes: { kind: "fixed", min: 0, max: 1, step: 0.01, default: 0.3 },
  hora: { kind: "fixed", min: 0, max: 24, step: 0.05, default: 12 },
  solHora: { kind: "bool", default: false },
  ciclo: { kind: "fixed", min: 0, max: 1440, step: 0.5, default: 0 },
  solAltura: { kind: "fixed", min: -90, max: 90, step: 0.1, default: 45 },
  solRumbo: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 30 },
  solIntensidad: { kind: "fixed", min: 0, max: 20, step: 0.01, default: 3 },
  solColor: { ...COLOR, default: 0xfff4e0 },
  ambiente: { kind: "fixed", min: 0, max: 10, step: 0.01, default: 1 },
  ambienteCielo: { ...COLOR, default: 0xbcd6ee },
  ambienteSuelo: { ...COLOR, default: 0x6b5a45 },
  nieblaCerca: { kind: "fixed", min: 0, max: 5000, step: 0.5, default: 60 },
  nieblaLejos: { kind: "fixed", min: 0, max: 5000, step: 0.5, default: 380 },
  nieblaColor: { ...COLOR, default: 0xc9d8e4 },
  nieblaAuto: { kind: "bool", default: true },
  vientoRumbo: { kind: "fixed", min: -180, max: 180, step: 1, default: 45 },
  vientoFuerza: { kind: "fixed", min: 0, max: 40, step: 0.1, default: 2 },
  suelo: { kind: "enum", values: SUELOS, default: "hierba" },
  sueloColor: { ...COLOR, default: 0xffffff },
  sueloEscala: { kind: "fixed", min: 0.1, max: 20, step: 0.05, default: 1 },
  tono: { kind: "enum", values: TONOS, default: "neutro" },
  exposicion: { kind: "fixed", min: 0.05, max: 8, step: 0.01, default: 1 },
  hitos: { kind: "bool", default: true },
  rejilla: { kind: "bool", default: false },
  // U14: the maps cut the world at this height (m), like an architect's floor plan; 0 = not cut (the roofs show)
  mapaCorte: { kind: "fixed", min: 0, max: CORTE_MAX, step: 0.1, default: 0 },
};

export const entorno = defineFeature({
  id: "entorno",
  version: 1,
  level: "base",
  describe: "El entorno de la zona: cielo, sol, luz, niebla, viento, suelo y exposición. Llega a todos al entrar; quien tiene permiso de construir lo cambia en directo con un preset (día, atardecer, noche, niebla, tormenta…) o con valores finos.",
  state: {
    describe: "Una sola entrada, «zona». Colores en entero 0xRRGGBB; ángulos en grados (altura del sol sobre el horizonte, rumbo desde el norte hacia el este); niebla en metros (lejos 0 = sin niebla; nieblaAuto = su color sale del horizonte del cielo); viento en m/s; sueloEscala 1 = cada textura a su tamaño (suelos.json); imagen y hdr = «<sha256>.<ext>» de /a/ o vacío (vacío: la luz sale del propio cielo); mapaCorte = altura en metros a la que el minimapa y el mapa cortan el mundo, como el plano de un edificio (0 = sin corte: se ven los tejados).",
    fields: CAMPOS,
    persist: true,
  },
  intents: {
    preset: { describe: "Poner un entorno con nombre (día, amanecer, atardecer, noche, niebla, tormenta, nublado, jardín). El suelo se queda como estaba.", spoken: "cambiar el entorno", fields: { nombre: { kind: "enum", values: PRESETS } } },
    ajustar: { describe: "Poner el entorno con todos sus valores (lo que muestran los deslizadores). Para cambiar uno, lee el estado «zona», cambia ese campo y envíalo entero.", spoken: "ajustar el entorno", fields: CAMPOS, rate: { perSecond: 10, burst: 20 } },
    restaurar: { describe: "Volver al entorno con el que viene el mundo.", spoken: "restaurar el entorno", fields: {} },
  },
  events: {
    permiso: { describe: "Si puedes cambiar el entorno (llega al entrar y al identificarte).", fields: { construir: { kind: "bool" } }, announce: "silent" },
    cambiado: { describe: "El entorno de la zona ha cambiado.", fields: { preset: { kind: "enum", values: [...PRESETS, "propio"] } }, announce: { text: "El entorno cambia: {preset}", sound: "suave", importance: 0 } },
    rechazado: { describe: "Tu cambio de entorno no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
