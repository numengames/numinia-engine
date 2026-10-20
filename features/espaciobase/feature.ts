// espacio-base — declaration (H2, decision R-1: the engine is made of reusable pieces). A world that wants the «espacio base» (an empty
// night world whose ground is a mesh of luminous lines) brings `espacio-base.json` (`numinia-engine/espacio-base@1`, esquema.ts) next to
// its entorno.json; the SERVER only validates it and publishes it (one state entry, «mundo»); the PAGE draws the mesh from the same seed
// (packages/render/src/espacio-base/) and the collision mesh follows the same height (sim/terreno-malla.ts). Nothing here touches the
// simulation or the fingerprint. Without the file the feature publishes nothing and the page draws exactly what it drew before.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The state's only key: what this world says. */
export const MUNDO = "mundo";

export const espacioBase = defineFeature({
  id: "espacio-base",
  version: 1,
  level: "base",
  describe: "El espacio base: un mundo vacío y nocturno cuyo suelo es una malla de líneas luminosas sobre casi negro, con estrellas y luna. Lo enciende espacio-base.json; sin él no cambia nada. Todos nacen en el centro de su meseta llana.",
  state: {
    describe: "Una entrada, «mundo»: activa y semilla (el relieve de alrededor de la meseta). El día y la noche son los del entorno (su hora), no de esta pieza.",
    fields: {
      activa: { kind: "bool" },
      semilla: { kind: "int", min: 0, max: 2147483647 },
    },
  },
});
