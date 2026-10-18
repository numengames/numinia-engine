// ancestros — client part (v1). Keeps the hall and the holograms this page knows, what the last hologram said (for the
// page's panel and for agents) and asks «hablar»; never decides anything. One small controller for the page
// (apps/plaza/ancestros.ts: the 3D hall through view.ancestros, the panel with the law and our rule) and for agents.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { ancestros as decl, AVISO, LEMA, LEYES, NUESTRAS } from "./feature.ts";

export { AVISO, LEMA, LEYES, NUESTRAS };
export type Holograma = { id: string; nombre: string; x: number; y: number; z: number; rumbo: number; radio: number; encendido: boolean };
export type Muro = { id: string; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
export type Dicho = { quien: number; pnj: string; ley: number; texto: string; regla: string; nuestra: string; mia: boolean; cuando: number };
export type Que = "cosas" | "dice" | "despierta" | "aviso";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función ancestros no está en este servidor" };
const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function crearCliente() {
  let A: ClientApi | null = null;
  let ultimo: Dicho | null = null, aviso = "", despierto = "";
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  const entradas = (): [string, Msg][] => (A ? A.state.keys().map((k) => [k, A!.state.get(k) as Msg]) : []);

  const ancestros = {
    /** The holograms this page knows (within ALCANCE_M), lit or not. */
    hologramas: (): Holograma[] => entradas().filter(([, v]) => v.tipo === "holograma").map(([id, v]) => ({ id, nombre: String(v.nombre), x: Number(v.x), y: Number(v.y), z: Number(v.z), rumbo: Number(v.rumbo), radio: Number(v.radio), encendido: v.encendido === true })),
    /** The hall's solid walls (boxes in metres), for whoever draws them. */
    muros: (): Muro[] => entradas().filter(([, v]) => v.tipo === "muro").map(([id, v]) => ({ id, x0: Number(v.bx0), y0: Number(v.by0), z0: Number(v.bz0), x1: Number(v.bx1), y1: Number(v.by1), z1: Number(v.bz1) })),
    /** What a hologram said last (yours or someone's near), or null. */
    ultimo: (): Dicho | null => ultimo,
    /** The hologram that lit up for you last (its key), "" if none yet. */
    despierto: (): string => despierto,
    aviso: (): string => aviso,
    /** Speak to a hologram by its key (the page does it with E; an agent, here). */
    hablar: (pnj: string): Res => (A ? A.send("hablar", { pnj: String(pnj).slice(0, 16) }) : SIN),
    /** The texts, so a page or an agent can show the whole tribute without asking the server. */
    textos: { leyes: LEYES, nuestras: NUESTRAS, lema: LEMA, aviso: AVISO },
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange(() => avisar("cosas"));
    api.on("despierta", (m) => { despierto = String(m.pnj); avisar("despierta"); });
    api.on("dice", (m) => {
      ultimo = { quien: Number(m.quien), pnj: String(m.pnj), ley: Number(m.ley), texto: String(m.texto), regla: String(m.regla), nuestra: String(m.nuestra), mia: Number(m.quien) === api.self(), cuando: ahora() };
      avisar("dice");
    });
    api.on("rechazado", (m) => { aviso = String(m.motivo); avisar("aviso"); });
  });
  return { parts: [parte], ancestros };
}

const pagina = crearCliente();
export const ancestros = pagina.ancestros;
export default pagina.parts[0];
