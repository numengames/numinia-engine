// asiento — client part (v1). A free seat: «E: sentarte» beside it (the card's `interact`), a stool drawn only where the switch
// put the seat (`dibujo`; a seat of a model needs none). Occupied: the person sits (the house's `sentarse` clip, held, via
// `view.movimiento`) and faces where the seat looks (`view.orientar`); the seat shows their name. The seated person is offered
// «E: levantarte» (a local thing of the page, `cerca`) and an action; `/levantar` in the chat does the same. Nothing is decided
// here: the page only draws what the server says. The simulation freezes the avatar on the seat (MODO_SENTADO) and stands it
// up on a stick or a jump by itself; the pose ends when the avatar walks (render/gesto.ts).
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { movimiento } from "../gestos/movimientos.ts";
import { asiento as decl, LIBRE } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0): the stool. */
export const MODELO_BANQUETA = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export const BANQUETA = { ancho: 0.42, alto: 0.42, atras: 0.12 } as const;
/** The pose is held for as long as someone sits (the move's own 10 minutes would stand the body up while the server still has it seated). */
const HASTA_S = 86400;
export type Asiento = { id: string; nombre: string; x: number; y: number; z: number; mira: number; radio: number; ocupante: number; quien: string; dibujo: boolean };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función asiento no está en este servidor" };

/** The stool under a seat (it sits a little behind the hips, along the seat's facing). Pure. */
export const banqueta = (v: Pick<Asiento, "x" | "y" | "z" | "mira">): PlacedObject => {
  const a = (v.mira * Math.PI) / 180;
  return { model: MODELO_BANQUETA, x: v.x - Math.sin(a) * BANQUETA.atras, y: v.y + BANQUETA.alto / 2, z: v.z - Math.cos(a) * BANQUETA.atras, rx: 0, ry: v.mira, rz: 0, sx: BANQUETA.ancho, sy: BANQUETA.alto, sz: BANQUETA.ancho, animate: false };
};
/** The text on an occupied seat. Pure. */
export const rotulo = (v: Pick<Asiento, "nombre" | "quien">): string => (v.quien ? `${v.quien} · ${v.nombre}` : v.nombre);

export function crearCliente() {
  let A: ClientApi | null = null;
  const estado = { puede: false, ultimoRechazo: "" };
  const oyentes = new Set<(id: string) => void>();
  const sentados = new Map<string, number>();            // seat -> who the page last drew on it
  const pendientes = new Map<number, { rumbo: number; intentos: number }>(); // whose pose could not play yet (no VRM dressed): tried again
  const pose = movimiento("sentarse");
  const lista = (): Asiento[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Asiento) : []);
  const asiento = {
    lista,
    /** The seat this page's player sits on now (its id), or null. */
    mio: (): string | null => (A ? lista().find((c) => Number(c.ocupante) === A!.self() && A!.self() >= 0)?.id ?? null : null),
    /** Who sits where (entity → seat id) as the page knows it. */
    ocupa: (quien: number): string | null => lista().find((c) => Number(c.ocupante) === quien && quien >= 0)?.id ?? null,
    sentar: (id: string): Res => (A ? A.send("sentar", { cosa: id }) : SIN),
    levantar: (a = ""): Res => (A ? A.send("levantar", { a }) : SIN),
    /** «E: levantarte», offered to the seated person by the page's interaction (apps/plaza/interactuar.ts `locales`). */
    cerca: (): { feature: string; key: string; intent: string; prompt: string; name: string; distance: number; local: () => Res }[] => {
      const k = asiento.mio(), v = k ? lista().find((c) => c.id === k) : undefined;
      return k && v ? [{ feature: "asiento", key: k, intent: "levantar", prompt: "levantarte", name: v.nombre, distance: 0, local: () => asiento.levantar() }] : [];
    },
    /** The switch of the Entorno panel: only asks (the server checks who and keeps it in asientos.json); `activa` follows the server's state. */
    interruptor: {
      estado,
      activa: (): boolean => (A ? A.state.keys().length > 0 : false),
      poner: (activa: boolean): Res => (A ? A.send("encender", { activa }) : SIN),
    },
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const sentarlo = (quien: number, rumbo: number): boolean => {
    if (!A) return false;
    A.view.orientar?.(quien, rumbo);
    return A.view.movimiento?.(quien, pose ? { ...pose, hastaS: HASTA_S } : null) ?? false;
  };
  // an avatar whose VRM was not dressed yet cannot play the pose: try again once a second, up to 30 times, then give up
  let reloj: ReturnType<typeof setTimeout> | null = null;
  const reintentar = () => {
    if (reloj || !pendientes.size) return;
    reloj = setTimeout(() => {
      reloj = null;
      for (const [quien, p] of pendientes) if (sentarlo(quien, p.rumbo) || ++p.intentos >= 30) pendientes.delete(quien);
      reintentar();
    }, 1000);
    (reloj as { unref?: () => void }).unref?.();
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      const antes = sentados.get(key), ocupante = v ? Number(v.ocupante) : LIBRE;
      if (antes !== undefined && antes !== ocupante) { api.view.movimiento?.(antes, null); api.view.orientar?.(antes, undefined); pendientes.delete(antes); sentados.delete(key); }
      if (v && ocupante >= 0 && antes !== ocupante) {
        const rumbo = (Number(v.mira) * Math.PI) / 180;
        sentados.set(key, ocupante);
        if (!sentarlo(ocupante, rumbo)) { pendientes.set(ocupante, { rumbo, intentos: 0 }); reintentar(); }
      }
      const s = v as unknown as Asiento | undefined;
      api.view.place?.(`asiento:${key}`, s && s.dibujo ? banqueta(s) : null);
      api.view.tag?.(`asiento:${key}`, s && ocupante >= 0 ? { text: rotulo(s), x: Number(s.x), y: Number(s.y) + 1.75, z: Number(s.z) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("permiso", (m) => { estado.puede = m.encender === true; });
    api.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
    api.action({ id: "levantar", label: "Levantarte", describe: "Levantarte del asiento (también /levantar, o andar)", run: () => { if (asiento.mio()) asiento.levantar(); } });
  });
  return { parts: [parte], asiento };
}

const pagina = crearCliente();
export const asiento = pagina.asiento;
export const interruptor = pagina.asiento.interruptor;
export default pagina.parts[0];
