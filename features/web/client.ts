// web — client part (N17): the screens as data (url, place, size, what the site says about framing) and whether this
// page may put or take them. It only asks: the server decides. Drawing them (the iframe in CSS3D, the VR card) is the
// view's (packages/render/src/web.ts) and the page's (apps/plaza/web.ts); agents and tests use the controller below.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { web } from "./feature.ts";

export type Pantalla = { id: string; url: string; titulo: string; texto: string; x: number; y: number; z: number; ry: number; ancho: number; alto: number; marco: string; fichero: boolean };
export type Cambio = "pantallas" | "permiso" | "hecho" | "rechazado";
export type Poner = { id?: string; url: string; titulo?: string; texto?: string; x: number; y?: number; z: number; ry?: number; ancho?: number; alto?: number };

/** The wire's fixed point back to the numbers the server wrote (2 decimals, no float noise). */
const r = (v: unknown) => Math.round(Number(v) * 100) / 100;

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, ultimoRechazo: "", ultimoHecho: "" };
  const oyentes = new Set<(que: Cambio) => void>();
  const avisar = (q: Cambio) => { for (const f of oyentes) { try { f(q); } catch { /* a page's listener must not stop the rest */ } } };
  const enviar = (intent: string, msg: Record<string, unknown>) => api?.send(intent, msg as never) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const ctl = {
    estado,
    /** Every screen of the world, as the server last said. */
    pantallas(): Pantalla[] {
      if (!api) return [];
      return api.state.keys().sort().map((id) => {
        const v = api!.state.get(id)!;
        return { id, url: String(v.url), titulo: String(v.titulo), texto: String(v.texto ?? ""), x: r(v.x), y: r(v.y), z: r(v.z), ry: r(v.ry), ancho: r(v.ancho), alto: r(v.alto), marco: String(v.marco ?? "?"), fichero: v.fichero === true };
      });
    },
    poner: (p: Poner) => enviar("poner", { id: "", texto: "", titulo: "", y: 1.6, ry: 0, ancho: 3.2, alto: 1.8, ...p }),
    quitar: (id: string) => enviar("quitar", { id }),
    alCambiar: (f: (que: Cambio) => void) => { oyentes.add(f); return () => oyentes.delete(f); },
  };
  const part = clientPart(web, (a) => {
    api = a;
    a.on("permiso", (m) => { estado.puede = m.poner === true; avisar("permiso"); });
    a.on("hecho", (m) => { estado.ultimoHecho = `${String(m.accion)} ${String(m.id)}`; avisar("hecho"); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("rechazado"); });
    a.state.onChange(() => avisar("pantallas"));
  });
  return { part, web: ctl };
}

const pagina = crearCliente();
export const pantallasWeb = pagina.web;
export default pagina.part;
