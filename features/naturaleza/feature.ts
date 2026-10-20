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
  describe: "Naturaleza low poly de un mundo (relieve, árboles, hierba, estanque) a partir de una semilla. La enciende naturaleza.json; sin él no cambia nada. Quien puede construir la enciende o apaga desde dentro del mundo (interruptor «Naturaleza»).",
  state: {
    describe: "Una entrada, «mundo»: activa, semilla, tamano y plaza (metros), arboles y hierba (0 a 1), estanque y paleta (verano, otono, primavera); fauna (bool), faunaDensidad (0 a 1) y faunaEspecies (ids separados por comas; vacío = todas).",
    fields: {
      activa: { kind: "bool" },
      semilla: { kind: "int", min: 0, max: 2147483647 },
      tamano: { kind: "int", min: 100, max: 400 },
      plaza: { kind: "int", min: 4, max: 40 },
      arboles: { kind: "fixed", min: 0, max: 1, step: 0.01 },
      hierba: { kind: "fixed", min: 0, max: 1, step: 0.01 },
      estanque: { kind: "bool" },
      paleta: { kind: "enum", values: PALETAS },
      fauna: { kind: "bool", default: true },
      faunaDensidad: { kind: "fixed", min: 0, max: 1, step: 0.01, default: 1 },
      faunaEspecies: { kind: "text", maxBytes: 512, default: "" },
    },
  },
  // Interruptor (R-1): quien puede construir en el mundo enciende o apaga la naturaleza desde dentro; el servidor decide,
  // escribe `activa` en el naturaleza.json del mundo (el fichero manda) y todas las páginas la montan o la quitan en vivo.
  intents: {
    encender: { describe: "Encender (activa true) o apagar (false) la naturaleza del mundo. Solo quien tiene permiso de construir; el servidor escribe «activa» en naturaleza.json del mundo (si no existe, lo crea) y todas las páginas lo aplican sin reiniciar.", spoken: "encender o apagar la naturaleza", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 3 } },
  },
  events: {
    cambiado: { describe: "La naturaleza del mundo se ha encendido o apagado.", fields: { estado: { kind: "enum", values: ["encendida", "apagada"] } }, announce: { text: "La naturaleza del mundo está {estado}", sound: "suave", importance: 0 } },
    rechazado: { describe: "Tu cambio de naturaleza no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
