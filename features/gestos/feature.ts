// gestos — declaration (pure data: shared by the server, the page and any agent that reads the catalog).
// A gesture is a short sign (wave, dance) that the people nearby see. It does not touch the simulation.
import { defineFeature } from "../../packages/feature/src/index.ts";

export const GESTOS = ["saludar", "bailar"] as const;

export const gestos = defineFeature({
  id: "gestos",
  version: 1,
  level: "base",
  describe: "Gestos cortos (saludar, bailar) que ven quienes están cerca.",
  intents: {
    hacer: {
      describe: "Hacer un gesto. Lo ven quienes estén a menos de 30 m.",
      spoken: "hacer un gesto",
      fields: { gesto: { kind: "enum", values: GESTOS } },
      rate: { perSecond: 1, burst: 3 }, // nobody needs more than one gesture a second
    },
  },
  events: {
    hecho: {
      describe: "Alguien cercano (o tú) ha hecho un gesto.",
      fields: { quien: { kind: "int", min: 0, max: 65535 }, gesto: { kind: "enum", values: GESTOS } },
      announce: { text: "Gesto: {gesto}", sound: "suave", importance: 1, who: "quien" },
    },
  },
});
