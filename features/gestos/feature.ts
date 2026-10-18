// gestos — declaration (pure data: shared by the server, the page and any agent that reads the catalog).
// A gesture is a move from a closed list (movimientos.ts: wave, dance, sit, …) that the people nearby see played on your
// avatar (J7b, the movement wheel). It does not touch the simulation: walking ends it, on every screen at once.
import { defineFeature } from "../../packages/feature/src/index.ts";
import { GESTOS } from "./movimientos.ts";

export { GESTOS };

export const gestos = defineFeature({
  id: "gestos",
  version: 2, // J7b: from two gestures to the moves of the wheel, plus «parar»
  level: "base",
  describe: "Movimientos (saludar, bailar, sentarse, …) que ven quienes están cerca; andar los termina.",
  intents: {
    hacer: {
      describe: "Hacer un movimiento de la lista, o «parar» el que estás haciendo. Lo ven quienes estén a menos de 30 m.",
      spoken: "hacer un gesto",
      fields: { gesto: { kind: "enum", values: GESTOS } },
      rate: { perSecond: 1, burst: 3 }, // nobody needs more than one move a second
    },
  },
  events: {
    hecho: {
      describe: "Alguien cercano (o tú) ha hecho un movimiento (o ha parado: gesto «parar»).",
      fields: { quien: { kind: "int", min: 0, max: 65535 }, gesto: { kind: "enum", values: GESTOS } },
      announce: { text: "Gesto: {gesto}", sound: "suave", importance: 1, who: "quien" },
    },
  },
});
