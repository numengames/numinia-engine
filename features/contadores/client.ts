// contadores — client part (v1, D-044). Keeps the counters near you as the server publishes them (once a second, only
// inside their zone) and asks for orders; never counts on its own. The 3D sign (`donde` cartel or ambos) is the
// cheapest text the page already has: the sprite label over a thing (`api.view.tag`, a canvas redrawn only when its
// text changes — once a second while running, never while stopped). The HTML panel lives in apps/plaza/contadores.ts.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { contadores as decl, formato } from "./feature.ts";
import type { Donde, Manda, Tipo } from "./feature.ts";

export { formato };
export type Contador = { id: string; nombre: string; tipo: Tipo; x: number; y: number; z: number; radio: number; valor: number; inicio: number; tope: number; marcha: boolean; donde: Donde; evento: string; manda: Manda; equipo: string };
export type Que = "lista" | "llegada" | "hito" | "aviso";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función contadores no está en este servidor" };
/** Height of the sign over the counter's ground point (m): readable over heads. */
export const CARTEL_ALTO_M = 2.4;

export function crearCliente() {
  let A: ClientApi | null = null;
  let aviso = "", ultimaLlegada: { id: string; nombre: string; evento: string; texto: string; equipo: string } | null = null;
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  const leer = (k: string, m: Msg): Contador => ({ id: k, nombre: String(m.nombre), tipo: String(m.tipo) as Tipo, x: Number(m.x), y: Number(m.y), z: Number(m.z), radio: Number(m.radio), valor: Number(m.valor), inicio: Number(m.inicio), tope: Number(m.tope), marcha: m.marcha === true, donde: String(m.donde) as Donde, evento: String(m.evento ?? ""), manda: String(m.manda) as Manda, equipo: String(m.equipo ?? "") });

  const contadores = {
    /** The counters this page knows (within their zone), as last published. A team counter's `id` is `id:equipo`. */
    lista: (): Contador[] => (A ? A.state.keys().map((k) => leer(k, A!.state.get(k) as Msg)) : []),
    uno: (id: string): Contador | null => { const m = A?.state.get(id); return m ? leer(id, m) : null; },
    aviso: (): string => aviso,
    llegada: () => ultimaLlegada,
    arranca: (id: string, equipo?: string): Res => (A ? A.send("arranca", equipo === undefined ? { id } : { id, equipo }) : SIN),
    para: (id: string, equipo?: string): Res => (A ? A.send("para", equipo === undefined ? { id } : { id, equipo }) : SIN),
    suma: (id: string, cuanto = 1, equipo?: string): Res => (A ? A.send("suma", equipo === undefined ? { id, cuanto } : { id, cuanto, equipo }) : SIN),
    reinicia: (id: string, equipo?: string): Res => (A ? A.send("reinicia", equipo === undefined ? { id } : { id, equipo }) : SIN),
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((k, v) => {
      const tag = api.view.tag;
      if (tag) {
        const c = v ? leer(k, v) : null;
        if (c && c.donde !== "panel") tag(`contador:${k}`, { text: formato(c.tipo, c.valor, c.tope), x: c.x, y: c.y + CARTEL_ALTO_M, z: c.z, sub: c.equipo ? `${c.nombre} (${c.equipo})` : c.nombre });
        else tag(`contador:${k}`, null);
      }
      avisar("lista");
    });
    api.on("llegada", (m) => { ultimaLlegada = { id: String(m.id), nombre: String(m.nombre), evento: String(m.evento ?? ""), texto: String(m.texto), equipo: String(m.equipo ?? "") }; avisar("llegada"); });
    api.on("hito", () => avisar("hito"));
    api.on("rechazado", (m) => { aviso = String(m.motivo); avisar("aviso"); });
  });
  return { parts: [parte], contadores };
}

const pagina = crearCliente();
export const contadores = pagina.contadores;
export default pagina.parts[0];
