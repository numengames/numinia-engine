// puertas — client part (v1, J4). Draws each door as a slab (the house block, scaled) turned on its hinge: closed it
// lies along the door's own `ry`, open it swings 90° inwards. Asks nothing but `usar`; the server decides.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { puertas as decl } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», 1 m, CC0) is the slab. */
export const MODELO_HOJA = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export const GROSOR_M = 0.08;
export const ABIERTA_GRADOS = 90;
export type Puerta = { id: string; nombre: string; x: number; y: number; z: number; ry: number; ancho: number; alto: number; radio: number; abierta: boolean; cierraEn: number; aviso: string };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función puertas no está en este servidor" };

/** Where the slab's centre goes for a hinge at (x, z) facing `ry` (degrees), closed or open. Pure: the test checks it. */
export function hoja(v: Pick<Puerta, "x" | "y" | "z" | "ry" | "ancho" | "alto" | "abierta">): PlacedObject {
  const giro = v.ry + (v.abierta ? ABIERTA_GRADOS : 0);
  const rad = (giro * Math.PI) / 180, medio = v.ancho / 2;
  // the slab runs along the door's local +x; yaw `giro` turns local +x to (cos, -sin) in the world's x, z
  return { model: MODELO_HOJA, x: v.x + Math.cos(rad) * medio, y: v.y + v.alto / 2, z: v.z - Math.sin(rad) * medio, rx: 0, ry: giro, rz: 0, sx: v.ancho, sy: v.alto, sz: GROSOR_M, animate: false };
}

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  const puertas = {
    lista: (): Puerta[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Puerta) : []),
    usar: (id: string): Res => (A ? A.send("usar", { puerta: id }) : SIN),
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      api.view.place?.(`puertas:${key}`, v ? hoja(v as unknown as Puerta) : null); // J4: <feature>:<key>, so a click is understood
      api.view.tag?.(`puertas:${key}`, v ? { text: String(v.nombre), x: Number(v.x), y: Number(v.y) + Number(v.alto) + 0.2, z: Number(v.z) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("cambio", (m) => { if (Number(m.quien) > 0) api.view.bounce(Number(m.quien), 300); });
  });
  return { parts: [parte], puertas };
}

const pagina = crearCliente();
export const puertas = pagina.puertas;
export default pagina.parts[0];
