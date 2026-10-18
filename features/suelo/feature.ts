// suelo — declaration (D-045, «suelo de la muerte»: back to the last safe spot after a fall). A world says in its
// entorno.json the height under which you have fallen into the void (`sueloMinimo`, metres) and, if it wants, a fixed
// point to come back to (`vuelta: { x, y, z, siempre? }`). The INSTANCE does the work (packages/instance: it keeps your
// last spot standing on a floor every half second and, under the minimum, orders the return inside the simulation step,
// recorded with the inputs so a replay reproduces it); this feature only tells the page («vuelta») and takes the one verb
// the cable (D-041) and a stuck person can use: `volver` (the cable's action «vuelve_a_seguro» = intent `suelo.volver`;
// names on the wire carry no underscore). Without `sueloMinimo` the world has no void: nobody is
// moved on their own, and the reference fingerprint stands.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The state's only key: what this world says. */
export const MUNDO = "mundo";
/** How long the page's fade lasts (ms): dark at once, back to the world in this time. */
export const FUNDIDO_MS = 900;

const quien = { kind: "int", min: 0, max: 65535 } as const;
const XZ = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -500, max: 500, step: 0.01 } as const;

export const suelo = defineFeature({
  id: "suelo",
  version: 1,
  level: "base",
  describe: "Volver a la última posición segura al caer al vacío (D-045). El mundo dice en entorno.json bajo qué altura se cae (sueloMinimo) y, si quiere, un punto fijo de vuelta; el servidor guarda cada medio segundo dónde pisabas suelo y, al caer, te recoloca dentro de la simulación (grabado, reproducible). «volver» lo pide a propósito (la acción «vuelve_a_seguro» del cable, o quien se queda atascado).",
  state: {
    describe: "Una entrada, «mundo»: si este mundo tiene vacío (activo) y bajo qué altura se cae (minimo, metros).",
    fields: { activo: { kind: "bool" }, minimo: Y },
  },
  intents: {
    volver: { describe: "Volver al último sitio donde pisabas suelo (o al punto de vuelta del mundo). Para el cable (D-041) y para quien se queda atascado; como mucho una vez cada 5 s.", spoken: "volver a un sitio seguro", fields: {}, rate: { perSecond: 0.2, burst: 1 } },
  },
  events: {
    vuelta: { describe: "El servidor te ha puesto (o a alguien cerca) en un sitio seguro: dónde y por qué (caida = bajo el suelo mínimo, pedido = lo pidió).", fields: { quien, x: XZ, y: Y, z: XZ, motivo: { kind: "enum", values: ["caida", "pedido"] } }, announce: { text: "Has vuelto a un sitio seguro", sound: "aviso", importance: 2, who: "quien" } },
  },
});
