// despertar — declaration (R1). A real-world QR opens a signed URL; the server turns it into one event
// that everyone sees as a column of light over the point. Nobody on the page can ask for it: no intents.
import { defineFeature } from "../../packages/feature/src/index.ts";

export const despertar = defineFeature({
  id: "despertar",
  version: 1,
  level: "frontera",
  describe: "Un QR real despierta un punto de la plaza: columna de luz y texto para todos durante unos segundos.",
  events: {
    despertado: {
      describe: "Un punto de la plaza se ha despertado (alguien escaneó su QR). Dibuja una columna de luz en (x, z).",
      fields: {
        punto: { kind: "text", maxBytes: 32 },
        texto: { kind: "text", maxBytes: 96 },
        x: { kind: "fixed", min: -2000, max: 2000, step: 0.25 },
        z: { kind: "fixed", min: -2000, max: 2000, step: 0.25 },
        ms: { kind: "int", min: 500, max: 60000 },
      },
      announce: { text: "{texto}", sound: "magia", importance: 2, at: ["x", "z"] },
    },
  },
});
