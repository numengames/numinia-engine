// objetos — client part (H1): draw every object of the zone (view.place) and a small builder the page can show
// (apps/plaza/constructor.ts). The builder only asks: the server decides and every page sees the result.
// M22: the selection and the tool (coger, mover, girar, escalar) live here too, so the page's gizmo, its inspector
// and an agent (window.__numinia.constructor) share one state; `escuchar` tells the page when it changes.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { objetos, LIMITES } from "./feature.ts";
import biblioteca from "./biblioteca.json" with { type: "json" };

export const aDibujo = (v: Msg): PlacedObject => ({
  model: String(v.modelo), x: Number(v.x), y: Number(v.y), z: Number(v.z), rx: Number(v.rx), ry: Number(v.ry), rz: Number(v.rz),
  sx: Number(v.sx), sy: Number(v.sy), sz: Number(v.sz), animate: v.animar !== false,
});

/** M22: the builder's tools. "" = only select (click), like Hyperfy2 before choosing one. */
export const MODOS = ["", "coger", "mover", "girar", "escalar"] as const;
export type Modo = (typeof MODOS)[number];
export type Donde = Record<"x" | "y" | "z" | "rx" | "ry" | "rz" | "sx" | "sy" | "sz", number>;
type Res = { ok: true } | { ok: false; why: string };

const entre = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));
/** Degrees into [-180, 180] (what the server keeps). */
export const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
/** A transform inside the declared limits (feature.ts LIMITES): positions and scales clamped, turns wrapped. */
export const acotarDonde = (t: Donde): Donde => ({
  x: entre(t.x, LIMITES.x), y: entre(t.y, LIMITES.y), z: entre(t.z, LIMITES.z),
  rx: envolver(t.rx), ry: envolver(t.ry), rz: envolver(t.rz),
  sx: entre(t.sx, LIMITES.escala), sy: entre(t.sy, LIMITES.escala), sz: entre(t.sz, LIMITES.escala),
});
const CAMPOS = ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"] as const;
export const dondeDe = (o: Msg): Donde => Object.fromEntries(CAMPOS.map((k) => [k, Number(o[k])])) as Donde;

/** One per page (tests make one per client). `constructor` is what a builder UI or an agent's helper calls. */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, seleccionado: "", ultimoRechazo: "", modo: "" as Modo };
  const oyentes = new Set<(que: string) => void>();
  const avisar = (que: string) => { for (const fn of oyentes) { try { fn(que); } catch { /* a listener's error is its own */ } } };
  const enviar = (intent: string, msg: Msg): Res => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
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
  const transformar = (o: Msg & { id: string }, cambio: Partial<Donde>) =>
    enviar("mover", { id: o.id, ...acotarDonde({ ...dondeDe(o), ...cambio }) });
  const acotar = (v: number) => entre(v, LIMITES.escala);
  const elegir = (id: string) => { if (estado.seleccionado !== id) { estado.seleccionado = id; avisar("seleccion"); } };

  const constructor = {
    estado,
    biblioteca: biblioteca.modelos.map(({ id, nombre, modelo }) => ({ id, nombre, modelo })),
    limites: LIMITES,
    lista,
    seleccion,
    /** M22: one thing by its id (with its id), or null. */
    objeto: (id: string): (Msg & { id: string }) | null => { const o = id ? api?.state.get(id) : undefined; return o ? { id, ...o } : null; },
    /** Put a library model 3 m in front of you (the camera looks along -z), named after the model. */
    colocar: (id: string) => {
      const m = biblioteca.modelos.find((x) => x.id === id);
      if (!m) return { ok: false as const, why: `no hay «${id}» en la biblioteca` };
      const p = aqui();
      return enviar("colocar", { modelo: m.modelo, x: p.x, y: 0, z: p.z - 3, ry: 0, nombre: m.nombre, decorado: false });
    },
    /** M22: put a library model at a point (where the pointer is), turned `ry` degrees. */
    colocarEn: (id: string, p: { x: number; y: number; z: number }, ry = 0) => {
      const m = biblioteca.modelos.find((x) => x.id === id);
      if (!m) return { ok: false as const, why: `no hay «${id}» en la biblioteca` };
      return enviar("colocar", { modelo: m.modelo, x: entre(p.x, LIMITES.x), y: entre(p.y, LIMITES.y), z: entre(p.z, LIMITES.z), ry: envolver(ry), nombre: m.nombre, decorado: false });
    },
    girar: (grados: number) => conSeleccion((o) => enviar("girar", { id: o.id, grados })),
    subir: (metros: number) => conSeleccion((o) => transformar(o, { y: Number(o.y) + metros })),
    desplazar: (dx: number, dz: number) => conSeleccion((o) => transformar(o, { x: Number(o.x) + dx, z: Number(o.z) + dz })),
    escalar: (factor: number) => conSeleccion((o) => transformar(o, { sx: acotar(Number(o.sx) * factor), sy: acotar(Number(o.sy) * factor), sz: acotar(Number(o.sz) * factor) })),
    duplicar: () => conSeleccion((o) => enviar("duplicar", { id: o.id })),
    borrar: () => conSeleccion((o) => enviar("borrar", { id: o.id })),
    fijar: () => conSeleccion((o) => enviar("fijar", { id: o.id, fijado: !o.fijado })),
    /** M22: name the selected thing (what screen readers say and agents read), or mark it as decoration. */
    nombrar: (nombre: string, decorado = false) => conSeleccion((o) => enviar("nombrar", { id: o.id, nombre, decorado })),
    deshacer: () => enviar("deshacer", {}),
    /** M22: redo what you last undid (until you make a new change). */
    rehacer: () => enviar("rehacer", {}),
    /** M22: select a thing by its id ("" = nothing). The page's gizmo and inspector follow. */
    seleccionar: (id: string): Res => {
      if (id && !api?.state.get(id)) return { ok: false, why: `no hay ningún objeto «${id}»` };
      elegir(id);
      return { ok: true };
    },
    /** M22: move, turn or scale a thing by its id; only the fields given change (metres, degrees, factor). */
    transformar: (id: string, cambio: Partial<Donde>): Res => {
      const o = api?.state.get(id);
      if (!o) return { ok: false, why: `no hay ningún objeto «${id}»` };
      for (const [k, v] of Object.entries(cambio)) if (!(CAMPOS as readonly string[]).includes(k) || !Number.isFinite(v)) return { ok: false, why: `«${k}» no es un número de x y z rx ry rz sx sy sz` };
      return transformar({ id, ...o }, cambio);
    },
    /** M22: the tool: "coger" (follows the pointer), "mover", "girar", "escalar" (gizmo) or "" (only select). */
    modo: (m: string): Res => {
      if (!(MODOS as readonly string[]).includes(m)) return { ok: false, why: `modos: ${MODOS.filter(Boolean).join(", ")} o "" (solo seleccionar)` };
      if (estado.modo !== m) { estado.modo = m as Modo; avisar("modo"); }
      return { ok: true };
    },
    /** M22: hear what changes ("seleccion", "modo", "estado" of a thing, "hecho", "rechazado", "permiso"). Returns how to stop. */
    escuchar: (fn: (que: string) => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
  };

  const part = clientPart(objetos, (a) => {
    api = a;
    a.state.onChange((key, v) => {
      a.view.place?.(key, v ? aDibujo(v) : null);
      if (!v && key === estado.seleccionado) elegir("");
      avisar("estado");
    });
    a.on("permiso", (m) => { estado.puede = m.construir === true; avisar("permiso"); });
    // the state of a change arrives before its `hecho` (same ordered channel): what is gone is not selected
    a.on("hecho", (m) => { elegir(m.accion === "borrar" || !a.state.get(String(m.id)) ? "" : String(m.id)); avisar("hecho"); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("rechazado"); });
  });
  return { part, constructor };
}

const pagina = crearCliente();
export const constructor = pagina.constructor;
export default pagina.part;
