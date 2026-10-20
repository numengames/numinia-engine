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
  // Interruptor (H8, R-1): quien puede construir enciende o apaga el espacio base desde dentro; el servidor escribe `activa` en espacio-base.json (el
  // fichero manda) y todas las páginas dibujan o quitan la malla en vivo. «restaurar» deja el fichero como el de un mundo nuevo.
  intents: {
    encender: { describe: "Encender (activa true) o apagar (false) el espacio base del mundo. Solo quien tiene permiso de construir; el servidor escribe «activa» en espacio-base.json (si no existe, lo crea con la semilla por defecto y no pisa la que ya hay) y todas las páginas lo aplican sin reiniciar. Si la naturaleza también está encendida, gana la naturaleza: apágala antes.", spoken: "encender o apagar el espacio base", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 3 } },
    semilla: { describe: "Cambiar la semilla del espacio base (el relieve de alrededor de la meseta; el mismo número da el mismo relieve). Solo quien tiene permiso de construir; el servidor escribe «semilla» en espacio-base.json y todas las páginas lo aplican sin reiniciar.", spoken: "cambiar la semilla del espacio base", fields: { semilla: { kind: "int", min: 0, max: 2147483647 } }, rate: { perSecond: 2, burst: 4 } },
    restaurar: { describe: "Dejar espacio-base.json como el de un mundo nuevo: encendido y con la semilla por defecto. Solo quien tiene permiso de construir. Lo construido (objetos, elementos) lo quitan sus propias piezas.", spoken: "restaurar el espacio base", fields: {}, rate: { perSecond: 1, burst: 3 } },
  },
  events: {
    cambiado: { describe: "El espacio base del mundo se ha encendido o apagado.", fields: { estado: { kind: "enum", values: ["encendido", "apagado"] } }, announce: { text: "El espacio base del mundo está {estado}", sound: "suave", importance: 0 } },
    rechazado: { describe: "Tu cambio del espacio base no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
