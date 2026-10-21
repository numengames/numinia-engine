// funciones — declaration (f1, decision R-1: every piece of the engine switches on without touching code). The server keeps ONE switch per piece
// of the world — `normas` (the gate of the conditions of entry), `dardos`, `pesca` — in the world's `funciones.json` (`numinia-engine/funciones@1`,
// esquema.ts) and tells every page, on arrival and on each change, so a panel can draw them (f3/v3). Whoever may build flips them live, no restart.
// f1 stores and publishes; f2 makes `dardos` and `pesca` obey: their servers refuse every action and close what is running, their pages draw nothing (`encendida`, `verSi`). Nothing here touches the simulation or the fingerprint.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The pieces that have a switch, in the order a panel lists them. */
export const FUNCIONES = ["normas", "dardos", "pesca"] as const;
export type Funcion = (typeof FUNCIONES)[number];

/** funciones/f2: is this piece on, given its entry in the `funciones` state ({ activa, fija })? No entry — a server without the switches, or a world
 * that lacks the piece — means on, exactly as before f1. Pure: the servers of dardos and pesca and the pages ask it with whatever they read. */
export const encendida = (v: { activa?: unknown } | undefined): boolean => v?.activa !== false;
/** funciones/f2: what a page may draw of a piece's things (boards, ponds, floats): all of them while the piece is on, none while it is off. Pure. */
export const verSi = <T>(cosas: readonly T[], v: { activa?: unknown } | undefined): T[] => (encendida(v) ? [...cosas] : []);

export const funciones = defineFeature({
  id: "funciones",
  version: 1,
  level: "base",
  describe: "Interruptores de funciones del mundo (normas de entrada, dardos, pesca): quien puede construir los enciende y apaga en caliente; se guardan en funciones.json y sobreviven al reinicio.",
  state: {
    describe: "Una entrada por función que este mundo tiene («normas», «dardos», «pesca»): activa (encendida ahora) y fija (true = la fija el entorno del servidor, MOTOR_CONDICIONES_PUERTA o la opción de arranque, y el interruptor no la cambia). «normas» solo está si el mundo tiene condiciones de entrada.",
    fields: {
      activa: { kind: "bool" },
      fija: { kind: "bool" },
    },
  },
  intents: {
    poner: {
      describe: "Encender (activa true) o apagar (false) una función del mundo: normas (la puerta de condiciones de entrada), dardos o pesca. Solo quien tiene permiso de construir; el servidor escribe funciones.json y avisa a todas las páginas, sin reiniciar. Apagar las normas deja entrar a quien las estaba leyendo; encenderlas solo afecta a quien llegue después (nadie que ya esté dentro sale).",
      spoken: "encender o apagar una función del mundo",
      fields: { funcion: { kind: "enum", values: [...FUNCIONES] }, activa: { kind: "bool" } },
      rate: { perSecond: 1, burst: 3 },
    },
  },
  events: {
    cambiada: { describe: "Una función del mundo se ha encendido o apagado.", fields: { funcion: { kind: "enum", values: [...FUNCIONES] }, estado: { kind: "enum", values: ["encendida", "apagada"] } }, announce: { text: "La función {funcion} del mundo está {estado}", sound: "suave", importance: 0 } },
    rechazado: { describe: "Tu cambio de una función no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
