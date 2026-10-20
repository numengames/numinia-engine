// naturaleza — client part (N4): hand the world's nature to the view (`view.naturaleza`, apps/plaza/main.ts → render's
// naturaleza.ts), which builds the landscape. Nothing is drawn here; with no state (a world without naturaleza.json) the view is
// never called and the page is exactly as before. No DOM.
// Interruptor: a small controller (`interruptor`) the builder's «Entorno» section (apps/plaza/entorno.ts) and agents use to
// ask the server to turn the nature on or off. It only asks: the server checks who, writes the world's file, and every page
// (this one too) applies the new state through the same `onChange` as on arrival.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { naturaleza, MUNDO } from "./feature.ts";

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { ultimoRechazo: "", cambios: 0 };
  const interruptor = {
    estado,
    /** Is the world's nature on, as the server last said (no state = a world without nature = off). */
    activa: (): boolean => api?.state.get(MUNDO)?.activa === true,
    /** Ask the server to turn it on (true) or off (false). */
    poner: (activa: boolean) => api?.send("encender", { activa }) ?? { ok: false as const, why: "la página aún no ha arrancado" },
  };
  const part = clientPart(naturaleza, (a) => {
    api = a;
    a.state.onChange((key, v) => { if (key === MUNDO && v) { estado.cambios++; a.view.naturaleza?.(v); } });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, interruptor };
}

const pagina = crearCliente();
export const interruptor = pagina.interruptor;
export default pagina.part;
