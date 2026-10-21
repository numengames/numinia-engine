// funciones — client part (f1): what the world's switches say now and a way to ask the server to flip one. Draws nothing (the panel is f3/v3,
// `__numinia.funciones`); with no state (a server without the piece, a world without conditions for «normas») the answers are «none».
// Only asks: the server checks who, writes funciones.json, and every page applies the new state through the same `onChange` as on arrival.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { funciones, FUNCIONES } from "./feature.ts";
import type { Funcion } from "./feature.ts";

export type EstadoFunciones = Partial<Record<Funcion, boolean>>;

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { ultimoRechazo: "", cambios: 0 };
  const interruptores = {
    estado,
    /** The switches this world has, as the server last said: { normas?, dardos?, pesca? } (a function the world lacks is not a key). */
    actual: (): EstadoFunciones => {
      const o: EstadoFunciones = {};
      for (const f of FUNCIONES) { const v = api?.state.get(f); if (v) o[f] = v.activa === true; }
      return o;
    },
    /** True when the server decides this one from outside (MOTOR_CONDICIONES_PUERTA / startServer's option): the switch will refuse. */
    fija: (f: Funcion): boolean => api?.state.get(f)?.fija === true,
    /** Ask the server to turn a function on (true) or off (false). */
    ponerFuncion: (f: Funcion, si: boolean) => api?.send("poner", { funcion: f, activa: si }) ?? { ok: false as const, why: "la página aún no ha arrancado" },
  };
  const part = clientPart(funciones, (a) => {
    api = a;
    a.state.onChange(() => { estado.cambios++; });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, interruptores };
}

const pagina = crearCliente();
export const interruptores = pagina.interruptores;
export default pagina.part;
