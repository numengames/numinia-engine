// cogibles — client part (v1, J4). On the floor: `view.place` at its spot. In someone's hand: `view.lleva` on that
// person (the same hook that wears a good, features/bienes) and nothing on the floor. The action «Soltar» (Q on a
// keyboard, a button on a touch screen) asks the server; nothing is decided here.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { cogibles as decl, NADIE } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0) when a thing has no model of its own. */
export const MODELO_CAJA = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export type Cosa = { id: string; nombre: string; x: number; y: number; z: number; modelo: string; escala: number; radio: number; portador: number };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función cogibles no está en este servidor" };

/** How it lies on the floor. Pure. */
export const enElSuelo = (v: Pick<Cosa, "x" | "y" | "z" | "modelo" | "escala">): PlacedObject =>
  ({ model: v.modelo || MODELO_CAJA, x: v.x, y: v.y + v.escala / 2, z: v.z, rx: 0, ry: 0, rz: 0, sx: v.escala, sy: v.escala, sz: v.escala, animate: false });

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  const enMano = new Map<string, number>(); // thing → who the page last drew it on
  const cogibles = {
    lista: (): Cosa[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Cosa) : []),
    /** What this page's player carries now (ids). */
    mias: (): string[] => (A ? cogibles.lista().filter((c) => Number(c.portador) === A!.self()).map((c) => c.id) : []),
    coger: (id: string): Res => (A ? A.send("coger", { cosa: id }) : SIN),
    soltar: (id = ""): Res => (A ? A.send("soltar", { cosa: id }) : SIN),
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      const antes = enMano.get(key);
      const portador = v ? Number(v.portador) : NADIE;
      if (antes !== undefined && antes !== portador) { api.view.lleva?.(antes, null); enMano.delete(key); }
      if (v && portador !== NADIE) { api.view.lleva?.(portador, { model: String(v.modelo) || MODELO_CAJA, donde: "mano", nombre: String(v.nombre) }); enMano.set(key, portador); }
      api.view.place?.(`cogibles:${key}`, v && portador === NADIE ? enElSuelo(v as unknown as Cosa) : null);
      api.view.tag?.(`cogibles:${key}`, v && portador === NADIE ? { text: String(v.nombre), x: Number(v.x), y: Number(v.y) + Number(v.escala) + 0.3, z: Number(v.z) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("cambio", (m) => api.view.bounce(Number(m.quien), 300));
    api.action({ id: "soltar", label: "Soltar", key: "KeyQ", describe: "Soltar lo que llevas en la mano", run: () => { if (cogibles.mias().length) cogibles.soltar(); } });
  });
  return { parts: [parte], cogibles };
}

const pagina = crearCliente();
export const cogibles = pagina.cogibles;
export default pagina.parts[0];
