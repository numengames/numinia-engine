// objetos — client part (H1): draw every object of the zone (view.place) and a small builder the page can show
// (apps/plaza/constructor.ts). The builder only asks: the server decides and every page sees the result.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { objetos } from "./feature.ts";
import biblioteca from "./biblioteca.json" with { type: "json" };

export const aDibujo = (v: Msg): PlacedObject => ({
  model: String(v.modelo), x: Number(v.x), y: Number(v.y), z: Number(v.z), rx: Number(v.rx), ry: Number(v.ry), rz: Number(v.rz),
  sx: Number(v.sx), sy: Number(v.sy), sz: Number(v.sz), animate: v.animar !== false,
});

/** One per page (tests make one per client). `constructor` is what a builder UI or an agent's helper calls. */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, seleccionado: "", ultimoRechazo: "" };
  const enviar = (intent: string, msg: Msg) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const aqui = () => api?.view.here?.() ?? { x: 0, y: 0, z: 0 };
  const lista = () => (api ? api.state.keys().map((id) => ({ id, ...api!.state.get(id)! })) : []);
  /** The selected thing, or the nearest one within 8 m. */
  const seleccion = (): (Msg & { id: string }) | null => {
    const sel = estado.seleccionado && api?.state.get(estado.seleccionado);
    if (sel) return { id: estado.seleccionado, ...sel };
    const p = aqui();
    let mejor: (Msg & { id: string }) | null = null, d2 = 64;
    for (const o of lista()) { const d = (Number(o.x) - p.x) ** 2 + (Number(o.z) - p.z) ** 2; if (d <= d2) { d2 = d; mejor = o; } }
    return mejor;
  };
  const conSeleccion = (fn: (o: Msg & { id: string }) => ReturnType<typeof enviar>) => { const o = seleccion(); return o ? fn(o) : { ok: false as const, why: "no hay nada seleccionado ni cerca" }; };
  const transformar = (o: Msg & { id: string }, cambio: Partial<Record<"x" | "y" | "z" | "rx" | "ry" | "rz" | "sx" | "sy" | "sz", number>>) =>
    enviar("mover", { id: o.id, x: o.x, y: o.y, z: o.z, rx: o.rx, ry: o.ry, rz: o.rz, sx: o.sx, sy: o.sy, sz: o.sz, ...cambio });
  const acotar = (v: number) => Math.min(50, Math.max(0.05, v));

  const constructor = {
    estado,
    biblioteca: biblioteca.modelos.map(({ id, nombre, modelo }) => ({ id, nombre, modelo })),
    lista,
    seleccion,
    /** Put a library model 3 m in front of you (the camera looks along -z), named after the model. */
    colocar: (id: string) => {
      const m = biblioteca.modelos.find((x) => x.id === id);
      if (!m) return { ok: false as const, why: `no hay «${id}» en la biblioteca` };
      const p = aqui();
      return enviar("colocar", { modelo: m.modelo, x: p.x, y: 0, z: p.z - 3, ry: 0, nombre: m.nombre, decorado: false });
    },
    girar: (grados: number) => conSeleccion((o) => enviar("girar", { id: o.id, grados })),
    subir: (metros: number) => conSeleccion((o) => transformar(o, { y: Math.max(-100, Math.min(500, Number(o.y) + metros)) })),
    desplazar: (dx: number, dz: number) => conSeleccion((o) => transformar(o, { x: Number(o.x) + dx, z: Number(o.z) + dz })),
    escalar: (factor: number) => conSeleccion((o) => transformar(o, { sx: acotar(Number(o.sx) * factor), sy: acotar(Number(o.sy) * factor), sz: acotar(Number(o.sz) * factor) })),
    duplicar: () => conSeleccion((o) => enviar("duplicar", { id: o.id })),
    borrar: () => conSeleccion((o) => enviar("borrar", { id: o.id })),
    fijar: () => conSeleccion((o) => enviar("fijar", { id: o.id, fijado: !o.fijado })),
    deshacer: () => enviar("deshacer", {}),
  };

  const part = clientPart(objetos, (a) => {
    api = a;
    a.state.onChange((key, v) => a.view.place?.(key, v ? aDibujo(v) : null));
    a.on("permiso", (m) => { estado.puede = m.construir === true; });
    a.on("hecho", (m) => { estado.seleccionado = m.accion === "borrar" ? "" : String(m.id); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, constructor };
}

const pagina = crearCliente();
export const constructor = pagina.constructor;
export default pagina.part;
