// cogibles — declaration (v1, J4). A thing you pick up and put down: `coger {cosa}` from close by («E: coger Caja» on a
// PC, the button on a phone, the ray and trigger in VR) and the SERVER hands it to you: every page then draws it in your
// hand (view.lleva) instead of on the floor; `soltar` (Q, the button, or /soltar) leaves it where you stand; leaving the
// world drops it too. One thing in hand per person. A world brings them in MUNDO_DIR/interacciones.json (`cosas`).
// Not a quest item (those are cosa@1 of features/misiones) nor a good you own (features/bienes): just a thing of the
// world anyone may carry. Recipe: docs/EXTENDER.md «Puertas, botones y cosas que se cogen».
import { defineFeature } from "../../packages/feature/src/index.ts";

export const ALCANCE_M = 64;
export const CERCA_M = 30;
/** Things one person carries at a time. */
export const EN_MANOS_MAX = 1;
/** Nobody carries it. */
export const NADIE = -1;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;

export const cogibles = defineFeature({
  id: "cogibles",
  version: 1,
  level: "base",
  describe: "Cosas del mundo que se cogen y se sueltan: «E: coger» al lado (igual en el ordenador, el móvil y el visor); el servidor te la da y todos la ven en tu mano; «Soltar» (Q, el botón o /soltar) la deja donde estás, y al salir del mundo se suelta sola. Una cosa en la mano por persona.",
  state: {
    describe: "Una cosa por clave: nombre, dónde está en el suelo (x, z; y = altura, m), su modelo (sha256 de un .glb del servidor; vacío = la caja de la casa), su tamaño (escala), desde cuánto se coge (radio, m; 0 mientras alguien la lleva) y quién la lleva (portador: la entidad, -1 = nadie).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      modelo: { kind: "text", maxBytes: 64 },
      escala: { kind: "fixed", min: 0.05, max: 4, step: 0.01, default: 0.4 },
      radio: { kind: "fixed", min: 0, max: 16, step: 0.1, default: 2 },
      portador: { kind: "int", min: NADIE, max: 65535, default: NADIE },
    },
    card: { role: "objeto", name: "{nombre}", description: "Cosa que se coge y se suelta; el servidor decide quién la lleva", at: ["x", "z"], actions: ["coger", "soltar"], interact: { intent: "coger", prompt: "coger {nombre}", radius: "radio", key: "cosa" } },
    radius: ALCANCE_M,
  },
  intents: {
    coger: { describe: "Coger la cosa. Hay que estar a su alcance, nadie debe llevarla y tú no llevas otra; el servidor lo comprueba.", spoken: "coger la cosa", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
    soltar: { describe: "Soltar lo que llevas donde estás (cosa vacía = lo que lleves).", spoken: "soltar la cosa", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    cambio: {
      describe: "Una cosa cambia de manos: quién, cuál, su nombre, si la cogió o la soltó, y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, cosa: ID, nombre: { kind: "text", maxBytes: 60 }, que: { kind: "enum", values: ["cogida", "soltada"] }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "suave", importance: 1, who: "quien" },
    },
    rechazado: { describe: "No se hizo, y por qué (lejos, la lleva otro, ya llevas una).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
