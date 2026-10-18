// botones — declaration (v1, J4). A button is a thing of the world you press from close by (`pulsar {boton}`: «E:
// pulsar Botón rojo» on a PC, the button on a phone, the ray and trigger in VR). The SERVER counts the press, lights
// the button for a moment, tells whoever is near, and fires a server-only signal (`senal`) other features hear: a
// button whose `puerta` names a door (features/puertas) opens it. A world brings its buttons in
// MUNDO_DIR/interacciones.json (`botones`). Recipe: docs/EXTENDER.md «Puertas, botones y cosas que se cogen».
import { defineFeature } from "../../packages/feature/src/index.ts";

export const ALCANCE_M = 64;
export const CERCA_M = 30;
/** How long a pressed button stays lit (ticks at 20 Hz: 1 s). */
export const LUZ_TICKS = 20;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;

export const botones = defineFeature({
  id: "botones",
  version: 1,
  level: "base",
  describe: "Botones que se pulsan de cerca («E: pulsar», lo mismo en el ordenador, el móvil y el visor). El servidor cuenta la pulsación, enciende el botón un segundo, avisa a los cercanos y dispara una señal que oyen las demás funciones: un botón puede abrir una puerta.",
  state: {
    describe: "Un botón por clave: nombre, dónde (x, z; y = altura a la que está, m), desde cuánto se pulsa (radio, m), si está encendido ahora (pulsado), cuántas veces lo han pulsado (pulsaciones) y la puerta que abre (puerta; vacío = ninguna).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 2 },
      pulsado: { kind: "bool", default: false },
      pulsaciones: { kind: "int", min: 0, max: 1_000_000_000, default: 0 },
      puerta: ID,
    },
    card: { role: "boton", name: "{nombre}", description: "Botón: se pulsa desde cerca; el servidor dispara lo que hace", at: ["x", "z"], actions: ["pulsar"], interact: { intent: "pulsar", prompt: "pulsar {nombre}", radius: "radio", key: "boton" } },
    radius: ALCANCE_M,
  },
  intents: {
    pulsar: { describe: "Pulsar el botón. Hay que estar a su alcance; el servidor lo comprueba.", spoken: "pulsar el botón", fields: { boton: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    pulsado: {
      describe: "Alguien ha pulsado un botón: quién, cuál, su nombre, la pulsación que hace (n) y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, boton: ID, nombre: { kind: "text", maxBytes: 60 }, n: { kind: "int", min: 1, max: 1_000_000_000 }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "campana", importance: 1, who: "quien" },
    },
    senal: {
      describe: "Solo para las funciones del servidor (alcance «server»): un botón ha sonado; `puerta` dice qué puerta abre (vacío = ninguna).",
      fields: { quien: QUIEN, boton: ID, nombre: { kind: "text", maxBytes: 60 }, puerta: ID },
      announce: "silent",
    },
    rechazado: { describe: "No se pulsó, y por qué (lejos, no hay tal botón).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
