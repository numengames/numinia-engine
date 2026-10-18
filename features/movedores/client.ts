// movedores — client part (v1, D-043). Draws each movedor with its model wherever the server says, right now
// (`view.place`): it never computes a position on its own, it just redraws when a new pose arrives (5 Hz while
// moving, once when it stops). Asks only `activa`, for an `interruptor` nearby; a `vaiven` needs no order at all.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { movedores as decl } from "./feature.ts";
import type { Tipo } from "./feature.ts";

export type Movedor = {
  id: string; nombre: string; modelo: string; tipo: Tipo;
  ax: number; ay: number; az: number; arx: number; ary: number; arz: number;
  bx: number; by: number; bz: number; brx: number; bry: number; brz: number;
  sx: number; sy: number; sz: number; duracion: number; espera: number; radio: number; evento: string;
  x: number; y: number; z: number; rx: number; ry: number; rz: number; lado: "a" | "b" | "entre"; marcha: boolean;
};
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función movedores no está en este servidor" };

/** Where the model goes right now, as the server published it. Pure: the test checks it. */
export function colocado(v: Pick<Movedor, "modelo" | "x" | "y" | "z" | "rx" | "ry" | "rz" | "sx" | "sy" | "sz">): PlacedObject {
  return { model: v.modelo, x: v.x, y: v.y, z: v.z, rx: v.rx, ry: v.ry, rz: v.rz, sx: v.sx, sy: v.sy, sz: v.sz, animate: false };
}

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  const leer = (k: string, m: Msg): Movedor => ({ id: k, ...(m as unknown as Omit<Movedor, "id">) });
  const movedores = {
    lista: (): Movedor[] => (A ? A.state.keys().map((k) => leer(k, A!.state.get(k) as Msg)) : []),
    uno: (id: string): Movedor | null => { const m = A?.state.get(id); return m ? leer(id, m) : null; },
    activa: (id: string): Res => (A ? A.send("activa", { id }) : SIN),
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      api.view.place?.(`movedores:${key}`, v ? colocado(leer(key, v)) : null); // J4 style: <feature>:<key>
      for (const fn of oyentes) fn(key);
    });
  });
  return { parts: [parte], movedores };
}

const pagina = crearCliente();
export const movedores = pagina.movedores;
export default pagina.parts[0];
