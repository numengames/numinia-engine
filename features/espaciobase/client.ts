// espacio-base — client part (H2, H8): hand the world's espacio base to the view (`view.espacioBase`, apps/plaza/main.ts → render's
// espacio-base/espacio-base.ts), which draws the mesh. Nothing is drawn here; with no state (a world without espacio-base.json) the view
// is never called and the page is exactly as before. No DOM.
// Interruptor (H8): a small controller (`interruptor`) the builder's «Entorno» section (apps/plaza/entorno.ts) and agents use to ask the
// server to turn the espacio base on or off, or to put the file back as a new world's. It only asks: the server checks who, writes the file,
// and every page applies the new state through the same `onChange` as on arrival.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { espacioBase, MUNDO } from "./feature.ts";

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { ultimoRechazo: "", cambios: 0 };
  const enviar = (intent: string, msg: Record<string, unknown>) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const interruptor = {
    estado,
    /** Is the world's espacio base on, as the server last said (no state = a world without it = off). */
    activa: (): boolean => api?.state.get(MUNDO)?.activa === true,
    /** Ask the server to turn it on (true) or off (false). */
    poner: (activa: boolean) => enviar("encender", { activa }),
    /** The seed the world has now, as the server last said (the default when it says none). */
    semilla: (): number => Number(api?.state.get(MUNDO)?.semilla ?? 42),
    /** Ask the server to change the seed (the relief around the plateau; same number = same relief). */
    ponerSemilla: (semilla: number) => enviar("semilla", { semilla }),
    /** Ask the server to put espacio-base.json back as a new world's (on, default seed). */
    restaurar: () => enviar("restaurar", {}),
  };
  const part = clientPart(espacioBase, (a) => {
    api = a;
    a.state.onChange((key, v) => { if (key === MUNDO && v) { estado.cambios++; a.view.espacioBase?.(v); } });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, interruptor };
}

const pagina = crearCliente();
export const interruptor = pagina.interruptor;
export default pagina.part;
