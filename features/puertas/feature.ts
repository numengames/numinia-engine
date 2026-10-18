// puertas — declaration (v1, J4). A door is a thing of the world the SERVER opens and closes: you ask `usar {puerta}`
// from close by (the same «E: abrir Puerta norte» on a PC, the button on a phone, the ray and trigger in VR) and the
// server flips it for everyone near; a door may close itself after `cierraEn` seconds. A world brings its doors in
// MUNDO_DIR/interacciones.json (`puertas`); without the file there is none. The page only draws the slab turned on its
// hinge. Recipe: docs/EXTENDER.md «Puertas, botones y cosas que se cogen».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who gets a door in the shared state, from afar (m). */
export const ALCANCE_M = 64;
/** Who hears a door move besides who used it (m). */
export const CERCA_M = 30;
/** Longest a door stays open on its own before closing (s); 0 = it stays as left. */
export const CIERRA_MAX_S = 120;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;

export const puertas = defineFeature({
  id: "puertas",
  version: 1,
  level: "base",
  describe: "Puertas que abre y cierra el servidor: «E: abrir» o «E: cerrar» al lado (lo mismo en el ordenador, el móvil y el visor), todos los cercanos la ven moverse; una puerta puede cerrarse sola pasados unos segundos. Un botón puede abrirla a distancia.",
  state: {
    describe: "Una puerta por clave: nombre, dónde está su bisagra (x, z; y = altura del suelo, m), hacia dónde mira cerrada (ry, grados), su hoja (ancho, alto, m), desde cuánto se usa (radio, m), si está abierta, cuántos segundos tarda en cerrarse sola (cierraEn; 0 = no) y la palabra del aviso (aviso: abrir o cerrar).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      ry: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 },
      ancho: { kind: "fixed", min: 0.5, max: 6, step: 0.01, default: 1 },
      alto: { kind: "fixed", min: 0.5, max: 8, step: 0.01, default: 2.2 },
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 2.5 },
      abierta: { kind: "bool", default: false },
      cierraEn: { kind: "int", min: 0, max: CIERRA_MAX_S, default: 0 },
      aviso: { kind: "enum", values: ["abrir", "cerrar"] },
    },
    card: { role: "puerta", name: "{nombre}", description: "Puerta: se abre y se cierra desde cerca; lo decide el servidor", at: ["x", "z"], actions: ["usar"], interact: { intent: "usar", prompt: "{aviso} {nombre}", radius: "radio", key: "puerta" } },
    radius: ALCANCE_M,
  },
  intents: {
    usar: {
      describe: "Abrir la puerta si está cerrada, cerrarla si está abierta. Hay que estar a su alcance; el servidor lo comprueba.",
      spoken: "abrir o cerrar la puerta",
      fields: { puerta: ID },
      rate: { perSecond: 2, burst: 4 },
    },
  },
  events: {
    cambio: {
      describe: "Una puerta se ha movido: quién (0 = sola, al cerrarse), cuál, cómo queda y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, puerta: ID, nombre: { kind: "text", maxBytes: 60 }, abierta: { kind: "bool" }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "paso", importance: 1, who: "quien" },
    },
    rechazado: { describe: "No se hizo lo que pediste, y por qué (lejos, no hay tal puerta).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
