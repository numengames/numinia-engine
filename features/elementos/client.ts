// elementos — client part (H4/H8): hand each element near me to the view (view.elemento) and a small controller the
// builder panel (apps/plaza/entorno.ts) and agents use. It only asks: the server decides, every page near sees it.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { elementos as decl, TIPOS } from "./feature.ts";

type Tipo = (typeof TIPOS)[number];
/** How each element starts when a builder puts one (the server rounds and names it). */
export const INICIO: Record<Tipo, Msg> = {
  agua: { ancho: 6, largo: 4, alto: 0, tamano: 1, giro: 0, color: 0x2f6f8f, intensidad: 1, y: 0.06 },
  fuego: { ancho: 1.2, largo: 1.2, alto: 2, tamano: 1, giro: 0, color: 0xff8a3a, intensidad: 1, y: 0 },
  humo: { ancho: 1, largo: 1, alto: 10, tamano: 1, giro: 0, color: 0x8c8c8c, intensidad: 1, y: 0 },
  polvo: { ancho: 14, largo: 14, alto: 3, tamano: 1, giro: 0, color: 0xd9c9a3, intensidad: 1, y: 0 },
};
const CAMPOS = ["x", "y", "z", "ancho", "largo", "alto", "tamano", "giro", "color", "intensidad", "nombre"] as const;
const acotar = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, seleccionado: "", ultimoRechazo: "" };
  const enviar = (intent: string, msg: Msg) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const aqui = () => api?.view.here?.() ?? { x: 0, y: 0, z: 0 };
  const lista = () => (api ? api.state.keys().map((id) => ({ id, ...api!.state.get(id)! })) : []);
  /** The selected element, or the nearest within 12 m. */
  const seleccion = (): (Msg & { id: string }) | null => {
    const sel = estado.seleccionado && api?.state.get(estado.seleccionado);
    if (sel) return { id: estado.seleccionado, ...sel };
    const p = aqui();
    let mejor: (Msg & { id: string }) | null = null, d2 = 144;
    for (const o of lista()) { const d = (Number(o.x) - p.x) ** 2 + (Number(o.z) - p.z) ** 2; if (d <= d2) { d2 = d; mejor = o; } }
    return mejor;
  };
  const todo = (o: Msg & { id: string }, cambios: Msg) => { const m: Msg = { id: o.id }; for (const k of CAMPOS) m[k] = o[k]; return { ...m, ...cambios }; };
  const conSeleccion = (fn: (o: Msg & { id: string }) => ReturnType<typeof enviar>) => { const o = seleccion(); return o ? fn(o) : { ok: false as const, why: "no hay ningún elemento seleccionado ni a menos de 12 m" }; };
  const controlador = {
    estado,
    tipos: TIPOS.slice(),
    lista,
    seleccion,
    /** Where I am (metres), for a page that puts things where the camera looks. */
    aqui: () => { const h = aqui(); return { x: h.x, z: h.z }; },
    /** Put an element at `donde` (metres) or 3 m in front of me (the camera looks along -z). */
    poner: (tipo: string, donde?: { x: number; y?: number; z: number }, extra: Msg = {}) => {
      if (!(TIPOS as readonly string[]).includes(tipo)) return { ok: false as const, why: `no hay ningún elemento «${tipo}» (hay: ${TIPOS.join(", ")})` };
      const p = donde ?? (() => { const h = aqui(); return { x: h.x, z: h.z - 3 }; })();
      const ini = INICIO[tipo as Tipo];
      return enviar("poner", { tipo, ...ini, x: p.x, z: p.z, y: p.y ?? ini.y, nombre: "", ...extra });
    },
    cambiar: (cambios: Msg) => conSeleccion((o) => enviar("cambiar", todo(o, cambios))),
    /** Bigger or smaller: the surface (water, dust) or the size (fire, smoke). */
    escalar: (f: number) => conSeleccion((o) => enviar("cambiar", todo(o, o.tipo === "agua" || o.tipo === "polvo"
      ? { ancho: acotar(Number(o.ancho) * f, 0.2, 200), largo: acotar(Number(o.largo) * f, 0.2, 200) }
      : { tamano: acotar(Number(o.tamano) * f, 0.1, 10), alto: acotar(Number(o.alto) * f, 0, 100) }))),
    desplazar: (dx: number, dz: number) => conSeleccion((o) => enviar("cambiar", todo(o, { x: Number(o.x) + dx, z: Number(o.z) + dz }))),
    /** H8: remove every element (part of «restaurar el mundo»). */
    vaciar: () => enviar("vaciar", {}),
    quitar: (id?: string) => (id ? enviar("quitar", { id }) : conSeleccion((o) => enviar("quitar", { id: o.id }))),
  };
  const part = clientPart(decl, (a) => {
    api = a;
    a.state.onChange((key, v) => a.view.elemento?.(key, v ?? null));
    a.on("permiso", (m) => { estado.puede = m.construir === true; });
    a.on("hecho", (m) => { estado.seleccionado = m.accion === "quitar" ? "" : String(m.id); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, elementos: controlador };
}

const pagina = crearCliente();
export const elementos = pagina.elementos;
export default pagina.part;
