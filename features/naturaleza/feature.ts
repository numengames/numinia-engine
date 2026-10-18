// naturaleza — declaration (N4, decision R-1: the engine is made of reusable pieces). A world that wants relief, trees and grass
// brings `naturaleza.json` (`numinia-engine/naturaleza@1`, esquema.ts) next to its entorno.json; the SERVER only validates it and
// publishes it (one state entry, «mundo»); the PAGE builds the landscape from the same seed (packages/render/src/naturaleza/):
// terrain with five zones, trees that sway, grass, a pond. Nothing here touches the simulation or the fingerprint. Without the
// file the feature publishes nothing and the page draws exactly what it drew before. Terrain collision is a later story (N5):
// until then people still stand at the old flat ground height.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The state's only key: what this world says. */
export const MUNDO = "mundo";
export const PALETAS = ["verano", "otono", "primavera"] as const;

export const naturaleza = defineFeature({
  id: "naturaleza",
  version: 1,
  level: "base",
  describe: "Naturaleza low poly de un mundo: relieve con zonas (prado, bosque, arena, roca, orilla), árboles con ramas que se mueven con el viento, hierba y un estanque, todo a partir de una semilla. El mundo la enciende con naturaleza.json (semilla, tamaño, plaza, densidad de árboles y de hierba, estanque, paleta de verano, otoño o primavera); sin ese fichero no cambia nada. El servidor solo guarda y envía el fichero ya comprobado; cada página construye el mismo paisaje.",
  state: {
    describe: "Una entrada, «mundo»: activa (si la página dibuja la naturaleza), semilla (entero: mismo número = mismo paisaje), tamano y plaza (metros), arboles y hierba (densidad 0 a 1), estanque (si hay agua) y paleta (verano, otono o primavera: solo el color de los prados y las hojas).",
    fields: {
      activa: { kind: "bool" },
      semilla: { kind: "int", min: 0, max: 2147483647 },
      tamano: { kind: "int", min: 100, max: 400 },
      plaza: { kind: "int", min: 4, max: 40 },
      arboles: { kind: "fixed", min: 0, max: 1, step: 0.01 },
      hierba: { kind: "fixed", min: 0, max: 1, step: 0.01 },
      estanque: { kind: "bool" },
      paleta: { kind: "enum", values: PALETAS },
    },
  },
  intents: {},
  events: {},
});
