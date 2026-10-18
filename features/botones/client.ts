// botones — client part (v1, J4). Draws each button as a small block on a post (the house block, scaled); lit = it
// rises a little and bounces who pressed it. Asks nothing but `pulsar`; the server decides.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { botones as decl } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0). */
const MODELO = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";

export const LADO_M = 0.3, ALTURA_M = 1.0, PULSADO_M = -0.06;
export type Boton = { id: string; nombre: string; x: number; y: number; z: number; radio: number; pulsado: boolean; pulsaciones: number; puerta: string };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función botones no está en este servidor" };

/** The button's cap: a small block at hand height, sunk a little while lit. Pure. */
export const tapa = (v: Pick<Boton, "x" | "y" | "z" | "pulsado">): PlacedObject =>
  ({ model: MODELO, x: v.x, y: v.y + ALTURA_M + (v.pulsado ? PULSADO_M : 0), z: v.z, rx: 0, ry: 0, rz: 0, sx: LADO_M, sy: LADO_M * 0.5, sz: LADO_M, animate: false });

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  const botones = {
    lista: (): Boton[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Boton) : []),
    pulsar: (id: string): Res => (A ? A.send("pulsar", { boton: id }) : SIN),
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      api.view.place?.(`botones:${key}`, v ? tapa(v as unknown as Boton) : null);
      api.view.place?.(`botones:${key}:poste`, v ? { model: MODELO, x: Number(v.x), y: Number(v.y) + ALTURA_M / 2, z: Number(v.z), rx: 0, ry: 0, rz: 0, sx: 0.08, sy: ALTURA_M, sz: 0.08, animate: false } : null);
      api.view.tag?.(`botones:${key}`, v ? { text: String(v.nombre), x: Number(v.x), y: Number(v.y) + ALTURA_M + 0.5, z: Number(v.z) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("pulsado", (m) => api.view.bounce(Number(m.quien), 300));
  });
  return { parts: [parte], botones };
}

const pagina = crearCliente();
export const botones = pagina.botones;
export default pagina.parts[0];
