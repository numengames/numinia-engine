// baculo — client part (v1). Free: a pedestal (the house block) with the staff floating over it, a label with its name. In
// someone's hand: `view.lleva` on that person (the same hook cogibles and bienes use) and nothing on the pedestal but the
// pedestal itself. «E» beside a free staff takes it (the card's `interact`); «Soltar el báculo» and «Pasar el báculo» ask the
// server (/baculo soltar, /baculo pasar <nombre> in the chat do too). Nothing is decided here: the page only draws what the
// server says and offers `lleva(quien)` to the panels («Gente» shows a staff badge next to who holds one).
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { baculo as decl, LIBRE } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0): the pedestal. */
export const MODELO_PEDESTAL = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export const PEDESTAL = { ancho: 0.5, alto: 0.9 } as const;
/** How high the staff floats above the pedestal's top (m). */
export const FLOTA_M = 0.35;
export type Baculo = { id: string; nombre: string; x: number; y: number; z: number; hx: number; hy: number; hz: number; modelo: string; radio: number; portador: number };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función baculo no está en este servidor" };

/** The pedestal where the staff lives (always there, even when someone holds the staff). Pure. */
export const pedestal = (v: Pick<Baculo, "hx" | "hy" | "hz">): PlacedObject =>
  ({ model: MODELO_PEDESTAL, x: v.hx, y: v.hy + PEDESTAL.alto / 2, z: v.hz, rx: 0, ry: 0, rz: 0, sx: PEDESTAL.ancho, sy: PEDESTAL.alto, sz: PEDESTAL.ancho, animate: false });
/** The staff floating over its pedestal (the model stands on its foot). Pure. */
export const flotando = (v: Pick<Baculo, "hx" | "hy" | "hz" | "modelo">): PlacedObject =>
  v.modelo
    ? { model: v.modelo, x: v.hx, y: v.hy + PEDESTAL.alto + FLOTA_M, z: v.hz, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, animate: false }
    : { model: MODELO_PEDESTAL, x: v.hx, y: v.hy + PEDESTAL.alto + FLOTA_M + 0.6, z: v.hz, rx: 0, ry: 0, rz: 0, sx: 0.06, sy: 1.2, sz: 0.06, animate: false }; // a server without the model: a plain rod

export function crearCliente() {
  let A: ClientApi | null = null;
  const estado = { puede: false, ultimoRechazo: "" };
  const oyentes = new Set<(id: string) => void>();
  const enMano = new Map<string, number>(); // staff → who the page last drew it on
  const baculo = {
    lista: (): Baculo[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Baculo) : []),
    /** The staff this page's player holds now (ids). */
    mias: (): string[] => (A ? baculo.lista().filter((c) => Number(c.portador) === A!.self()).map((c) => c.id) : []),
    /** Does this entity hold a staff? («Gente» draws a badge when it does.) */
    lleva: (quien: number): boolean => baculo.lista().some((c) => Number(c.portador) === quien && quien >= 0),
    coger: (id: string): Res => (A ? A.send("coger", { cosa: id }) : SIN),
    soltar: (): Res => (A ? A.send("soltar", {}) : SIN),
    /** To a named person within reach; no name = whoever is nearest. */
    pasar: (a = ""): Res => (A ? A.send("pasar", { a }) : SIN),
    recuperar: (): Res => (A ? A.send("recuperar", {}) : SIN),
    cantidad: (n: number): Res => (A ? A.send("cantidad", { n }) : SIN),
    /** The switch of the Entorno panel: only asks (the server checks who and keeps it in baculos.json); `activa` follows the server's state. */
    interruptor: {
      estado,
      activa: (): boolean => (A ? A.state.keys().length > 0 : false),
      poner: (activa: boolean): Res => (A ? A.send("encender", { activa }) : SIN),
    },
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      const antes = enMano.get(key), portador = v ? Number(v.portador) : LIBRE;
      if (antes !== undefined && antes !== portador) { api.view.lleva?.(antes, null); enMano.delete(key); }
      if (v && portador >= 0) { api.view.lleva?.(portador, { model: String(v.modelo) || MODELO_PEDESTAL, donde: "mano", nombre: String(v.nombre) }); enMano.set(key, portador); }
      const b = v as unknown as Baculo | undefined;
      api.view.place?.(`baculo:${key}:pedestal`, b ? pedestal(b) : null);
      api.view.place?.(`baculo:${key}`, b && portador < 0 ? flotando(b) : null);
      api.view.tag?.(`baculo:${key}`, b && portador === LIBRE ? { text: String(b.nombre), x: Number(b.hx), y: Number(b.hy) + PEDESTAL.alto + FLOTA_M + 1.7, z: Number(b.hz) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("permiso", (m) => { estado.puede = m.encender === true; });
    api.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
    api.on("cambio", (m) => { api.view.bounce(Number(m.quien), 300); if (Number(m.a) >= 0) api.view.bounce(Number(m.a), 300); });
    api.action({ id: "soltar", label: "Soltar el báculo", describe: "Soltar el báculo que llevas: vuelve a su sitio", run: () => { if (baculo.mias().length) baculo.soltar(); }, disponible: () => baculo.mias().length > 0 });
    api.action({ id: "pasar", label: "Pasar el báculo", describe: "Pasar el báculo a quien tengas más cerca (a 6 m o menos): pasa a dirigir esa persona", run: () => { if (baculo.mias().length) baculo.pasar(); }, disponible: () => baculo.mias().length > 0 });
  });
  return { parts: [parte], baculo };
}

const pagina = crearCliente();
export const baculo = pagina.baculo;
export const interruptor = pagina.baculo.interruptor;
export default pagina.parts[0];
