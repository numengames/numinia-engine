// sucesos — client part (v1, Y48). Keeps the events near you as the server publishes them and the last things it told
// you (announcement, milestone, ending, YOUR reward); asks `mirar` and `lanzar`, decides nothing. The announcements are
// spoken and sounded by the engine's announce path (feature.ts), so a page without a panel still hears them.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { sucesos as decl } from "./feature.ts";
import type { Fase } from "./feature.ts";

export type Suceso = { id: string; nombre: string; x: number; y: number; z: number; radio: number; fase: Fase; quedan: number; progreso: number; ayudan: number; texto: string };
export type Que = "lista" | "anuncio" | "termina" | "recompensa" | "aviso";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función sucesos no está en este servidor" };

export function crearCliente() {
  let A: ClientApi | null = null;
  let aviso = "", ultimoAnuncio = "", ultimaRecompensa: { id: string; texto: string; cosa: string; cuanto: number } | null = null;
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  const leer = (k: string, m: Msg): Suceso => ({ id: k, nombre: String(m.nombre), x: Number(m.x), y: Number(m.y), z: Number(m.z), radio: Number(m.radio), fase: String(m.fase) as Fase, quedan: Number(m.quedan), progreso: Number(m.progreso), ayudan: Number(m.ayudan), texto: String(m.texto) });
  const sucesos = {
    /** The events this page knows (within their area of interest), as last published. */
    lista: (): Suceso[] => (A ? A.state.keys().map((k) => leer(k, A!.state.get(k) as Msg)) : []),
    uno: (id: string): Suceso | null => { const m = A?.state.get(id); return m ? leer(id, m) : null; },
    aviso: (): string => aviso,
    ultimoAnuncio: (): string => ultimoAnuncio,
    ultimaRecompensa: () => ultimaRecompensa,
    mirar: (id: string): Res => (A ? A.send("mirar", { id }) : SIN),
    lanzar: (id: string): Res => (A ? A.send("lanzar", { id }) : SIN),
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange(() => avisar("lista"));
    api.on("anuncio", (m) => { ultimoAnuncio = String(m.texto); avisar("anuncio"); });
    api.on("hito", () => avisar("lista"));
    api.on("termina", () => avisar("termina"));
    api.on("recompensa", (m) => { ultimaRecompensa = { id: String(m.id), texto: String(m.texto), cosa: String(m.cosa ?? ""), cuanto: Number(m.cuanto) }; avisar("recompensa"); });
    api.on("estado", (m) => { aviso = String(m.texto); avisar("aviso"); });
    api.on("rechazado", (m) => { aviso = String(m.motivo); avisar("aviso"); });
  });
  return { parts: [parte], sucesos };
}

const pagina = crearCliente();
export const sucesos = pagina.sucesos;
export default pagina.parts[0];
