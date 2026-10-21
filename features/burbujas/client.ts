// burbujas — client part (v1). The page DRAWS nothing in the world and decides nothing: the server's relay only sends it the
// voices of who may be heard (a voice the server stops sending stops sounding; there is no «mute» here). This part keeps what the
// page knows to show it: which bubbles exist, which one this person is in (a discreet notice «En La mesa: solo te oyen los de la
// mesa» comes from the event; `apps/plaza/burbuja.ts` keeps a small label up while inside) and who else is inside («Gente» draws
// an icon next to them). The switch of the Entorno panel only asks; the server checks who may and keeps it in burbujas.json.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { burbujas as decl } from "./feature.ts";

export type Burbuja = { id: string; etiqueta: string; x: number; y: number; z: number; radio: number; modo: "aislada" | "abierta" };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función burbujas no está en este servidor" };

export function crearCliente() {
  let A: ClientApi | null = null;
  const estado = { puede: false, ultimoRechazo: "" };
  const oyentes = new Set<() => void>();
  const lista = (): Burbuja[] => (A ? A.state.keys().filter((k) => k.startsWith("b:")).map((k) => ({ id: k.slice(2), ...(A!.state.get(k) as Msg) }) as Burbuja) : []);
  const burbujas = {
    lista,
    /** The bubble this entity is in (its definition), or null. */
    de: (quien: number): Burbuja | null => {
      if (!A || quien < 0) return null;
      const id = A.state.get(`p:${quien}`)?.burbuja;
      return id ? lista().find((b) => b.id === id) ?? null : null;
    },
    /** The bubble this page's player is in, or null. */
    mia: (): Burbuja | null => (A ? burbujas.de(A.self()) : null),
    /** The switch of the Entorno panel: only asks (the server checks who and keeps it in burbujas.json); `activa` follows the server's state. */
    interruptor: {
      estado,
      activa: (): boolean => (A ? lista().length > 0 : false),
      poner: (activa: boolean): Res => (A ? A.send("encender", { activa }) : SIN),
    },
    alCambiar: (fn: () => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange(() => { for (const fn of oyentes) fn(); });
    api.on("dentro", () => { for (const fn of oyentes) fn(); });
    api.on("permiso", (m) => { estado.puede = m.encender === true; });
    api.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { parts: [parte], burbujas };
}

const pagina = crearCliente();
export const burbujas = pagina.burbujas;
export const interruptor = pagina.burbujas.interruptor;
export default pagina.parts[0];
