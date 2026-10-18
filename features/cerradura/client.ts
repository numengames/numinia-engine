// cerradura — client part (D-042): locks as data (what a page needs to draw and use them) and the controller a page
// module (apps/plaza/cerradura.ts) or an agent drives. It only asks: the server decides. The numeric keypad for a
// code lock, and the interact wiring (huecos' `local()` trick, U12), live on the page; this file never touches the DOM.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { cerradura } from "./feature.ts";
import type { Metodo } from "./feature.ts";

export type Cerradura = { id: string; metodo: Metodo; abierta: boolean; nombre: string; x: number; y: number; z: number; evento: string };
export type Cambio = "cerraduras" | "permiso" | "abierta" | "llave" | "hecho" | "rechazado";
export type Res = { ok: true } | { ok: false; why: string };

const r = (v: unknown) => Math.round(Number(v) * 100) / 100;

export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, ultimaAbierta: "", ultimaLlave: "", ultimoHecho: "", ultimoRechazo: "" };
  const oyentes = new Set<(q: Cambio) => void>();
  const avisar = (q: Cambio) => { for (const f of oyentes) { try { f(q); } catch { /* a page's listener must not stop the rest */ } } };
  const enviar = (intent: string, msg: Record<string, unknown>): Res => api?.send(intent, msg as never) ?? { ok: false, why: "la página aún no ha arrancado" };
  const ctl = {
    estado,
    /** Every lock of the world, as the server last said (the code never comes with it). */
    cerraduras(): Cerradura[] {
      if (!api) return [];
      return api.state.keys().sort().map((id) => {
        const v = api!.state.get(id)!;
        return { id, metodo: String(v.metodo) as Metodo, abierta: v.abierta === true, nombre: String(v.nombre), x: r(v.x), y: r(v.y), z: r(v.z), evento: String(v.evento ?? "") };
      });
    },
    cerradura(id: string): Cerradura | null { return ctl.cerraduras().find((c) => c.id === id) ?? null; },
    /** A code lock: send the digits typed on the keypad. A key lock: nothing to type, just try. */
    abrir: (id: string, codigo = "") => enviar("abrir", { id, codigo }),
    poner: (p: { id: string; metodo: Metodo; codigo?: string; llave?: string; nombre?: string; x: number; y?: number; z: number; evento?: string }) =>
      enviar("poner", { codigo: "", llave: "", nombre: "Cerradura", y: 0, evento: "", ...p }),
    quitar: (id: string) => enviar("quitar", { id }),
    dar: (llave: string) => enviar("dar", { llave }),
    alCambiar: (f: (q: Cambio) => void) => { oyentes.add(f); return () => oyentes.delete(f); },
  };
  const part = clientPart(cerradura, (a) => {
    api = a;
    a.on("permiso", (m) => { estado.puede = m.construir === true; avisar("permiso"); });
    a.on("abierta", (m) => { estado.ultimaAbierta = String(m.id); avisar("abierta"); });
    a.on("tuLlave", (m) => { estado.ultimaLlave = String(m.llave); avisar("llave"); });
    a.on("hecho", (m) => { estado.ultimoHecho = `${String(m.accion)} ${String(m.id)}`; avisar("hecho"); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("rechazado"); });
    a.state.onChange(() => avisar("cerraduras"));
  });
  return { part, cerradura: ctl };
}

const pagina = crearCliente();
export const cerraduras = pagina.cerradura;
export default pagina.part;
