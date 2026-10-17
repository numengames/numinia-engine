// director — client part (N6, corte 1): what a page needs to direct (the scene list, whether it may) and what every
// player sees (the narrator's line, a summons with «Ir / Ahora no»). It only asks: the server decides. The panel and
// the cards are the page's (apps/plaza/director.ts); agents and tests use the controller below.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { director, ACTUAL } from "./feature.ts";

export type EscenaVista = { id: string; nombre: string; casa: boolean };
/** What changed, for the page to redraw only that. */
export type Cambio = "permiso" | "escenas" | "actual" | "narracion" | "convocatoria" | "respuestas" | "rechazado";
export type Convocatoria = { id: number; de: string; quien: number; texto: string; x: number; z: number };

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = {
    puede: false, escenas: [] as EscenaVista[], ultimoRechazo: "",
    narraciones: [] as { texto: string; quien: string }[], convocatorias: [] as Convocatoria[],
    respuestas: new Map<number, { vienen: number; no: number }>(),
  };
  const oyentes = new Set<(que: Cambio) => void>();
  const avisar = (q: Cambio) => { for (const f of oyentes) { try { f(q); } catch { /* a page's listener must not stop the rest */ } } };
  const enviar = (intent: string, msg: Msg) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const ctl = {
    estado,
    /** The scene on now (or null). */
    actual: (): { id: string; nombre: string; quien: string } | null => {
      const v = api?.state.get(ACTUAL);
      return v && v.id ? { id: String(v.id), nombre: String(v.nombre), quien: String(v.quien) } : null;
    },
    escena: (id: string) => enviar("escena", { id }),
    narrar: (texto: string) => enviar("narrar", { texto }),
    convocar: (texto = "") => enviar("convocar", { texto }),
    /** Answer a summons: true = go (the page shows the way), false = not now. */
    acudir: (id: number, si: boolean) => {
      estado.convocatorias = estado.convocatorias.filter((c) => c.id !== id);
      return enviar("acudir", { id, si });
    },
    alCambiar: (f: (que: Cambio) => void) => { oyentes.add(f); return () => oyentes.delete(f); },
  };
  const part = clientPart(director, (a) => {
    api = a;
    a.on("permiso", (m) => { estado.puede = m.dirigir === true; if (!estado.puede) estado.escenas = []; avisar("permiso"); });
    a.on("escenaDisponible", (m) => {
      const n = Number(m.n), total = Number(m.total);
      if (n === 0) estado.escenas = [];
      estado.escenas[n] = { id: String(m.id), nombre: String(m.nombre), casa: m.casa === true };
      if (n === total - 1) { estado.escenas = estado.escenas.filter(Boolean); avisar("escenas"); }
    });
    a.state.onChange((k) => { if (k === ACTUAL) avisar("actual"); });
    a.on("narracion", (m) => { estado.narraciones = [...estado.narraciones.slice(-19), { texto: String(m.texto), quien: String(m.quien) }]; avisar("narracion"); });
    a.on("convocatoria", (m) => {
      if (Number(m.quien) === a.self()) return; // whoever calls does not get their own card
      const c: Convocatoria = { id: Number(m.id), de: String(m.de), quien: Number(m.quien), texto: String(m.texto), x: Number(m.x), z: Number(m.z) };
      estado.convocatorias = [...estado.convocatorias.filter((x) => x.id !== c.id).slice(-4), c];
      avisar("convocatoria");
    });
    a.on("respuestas", (m) => { estado.respuestas.set(Number(m.id), { vienen: Number(m.vienen), no: Number(m.no) }); avisar("respuestas"); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("rechazado"); });
  });
  return { part, director: ctl };
}

const pagina = crearCliente();
export const dirigir = pagina.director;
export default pagina.part;
