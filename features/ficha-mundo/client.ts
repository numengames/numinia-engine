// ficha-mundo — client part (H7): the world's settings as the server last said them, who may change them, and a way to ask. The page
// (apps/plaza/main.ts) listens with `alCambiar` to put the title in the tab; the panel (apps/plaza/ficha-mundo.ts) draws the form. It only asks:
// the server checks who, writes aventura/ficha.json and every page — this one too — applies the new state through the same `onChange`.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { AJUSTES, fichaMundo } from "./feature.ts";

export type Ajustes = { nombre: string; portada: string; avatar: string; aforo: number; capacidad: number; guardado: boolean };
type Entrada = { nombre: string; portada: string; avatar: string; aforo: number };

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const oyentes: ((a: Ajustes) => void)[] = [];
  const estado = { puede: false, ultimoRechazo: "", cambios: 0, ultimoAviso: "" };
  const leer = (): Ajustes | null => {
    const v = api?.state.get(AJUSTES);
    return v ? { nombre: String(v.nombre ?? ""), portada: String(v.portada ?? ""), avatar: String(v.avatar ?? ""), aforo: Number(v.aforo ?? 0), capacidad: Number(v.capacidad ?? 1000), guardado: v.guardado !== false } : null;
  };
  const ajustes = {
    estado,
    /** The world's settings as the server last said (null = a server without the piece). */
    actual: leer,
    /** Ask the server to set them all (the message carries the whole form). */
    guardar: (c: Entrada) => api?.send("ajustar", c) ?? { ok: false as const, why: "la página aún no ha arrancado" },
    /** Be told when they change (on arrival and after every save, from anybody). Returns the way to stop. */
    alCambiar: (fn: (a: Ajustes) => void) => { oyentes.push(fn); const a = leer(); if (a) fn(a); return () => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; },
  };
  const part = clientPart(fichaMundo, (a) => {
    api = a;
    a.state.onChange((key) => { if (key !== AJUSTES) return; estado.cambios++; const v = leer(); if (v) for (const fn of oyentes) { try { fn(v); } catch { /* a listener never breaks the others */ } } });
    a.on("permiso", (m) => { estado.puede = m.ajustar === true; });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
    a.on("cambiado", (m) => { estado.ultimoAviso = String(m.nombre); });
  });
  return { part, ajustes };
}

const pagina = crearCliente();
export const ajustes = pagina.ajustes;
export default pagina.part;
