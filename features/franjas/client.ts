// franjas — client part (Y37). Keeps the band the server published and asks `consultar`; decides nothing. The notice of a
// change is spoken and sounded by the engine's announce path (feature.ts), so a page with no panel, a screen reader, a
// phone and VR all get the same text. The button is the touch/VR way to ask; the card is what screen readers and agents read.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { franjas as decl, ZONA } from "./feature.ts";

export type FranjaVista = { franja: string; siguiente: string; desde: number; activa: boolean; texto: string };
type Res = { ok: true } | { ok: false; why: string };

export function crearCliente() {
  let A: ClientApi | null = null;
  let ultimo = "", cambios = 0;
  const leer = (m: Msg): FranjaVista => ({ franja: String(m.franja), siguiente: String(m.siguiente), desde: Number(m.desde), activa: m.activa === true, texto: String(m.texto) });
  const franjas = {
    /** The band now and when the next starts, as last published; null when this server has no franjas or no environment. */
    actual: (): FranjaVista | null => { const m = A?.state.get(ZONA); return m ? leer(m) : null; },
    /** The last answer to `consultar` (or the last notice of a change). */
    ultimoAviso: (): string => ultimo,
    /** How many changes this page has been told of. */
    cambios: (): number => cambios,
    consultar: (): Res => (A ? A.send("consultar", {}) : { ok: false, why: "the page has not started yet" }),
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.on("franja", (m) => { ultimo = String(m.texto); cambios++; });
    api.on("estado", (m) => { ultimo = String(m.texto); });
    api.action({ id: "consultar", label: "Time of day", describe: "Ask which band of the day it is and when the next one starts", run: () => { franjas.consultar(); }, disponible: () => franjas.actual() !== null });
  });
  return { parts: [parte], franjas };
}

const pagina = crearCliente();
export const franjas = pagina.franjas;
export default pagina.parts[0];
