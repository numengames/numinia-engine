// espacios — client part (v1, Y50+Y51). Keeps the spaces near you as the server publishes them and the last thing it told
// you; asks the verbs and decides nothing. The server's notices are spoken and sounded by the engine's announce path
// (feature.ts), so a page without a panel still hears them. Names inside are untrusted text: paint them as text only.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { espacios as decl } from "./feature.ts";

export type Espacio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; estado: "libre" | "privado"; duenoNombre: string; cosas: number; tope: number; invitados: number };
export type Que = "lista" | "aviso" | "concedido" | "rechazado";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función espacios no está en este servidor" };

export function crearCliente() {
  let A: ClientApi | null = null;
  let ultimoAviso = "", ultimoRechazo = "", ultimoConcedido = "";
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  const leer = (k: string, m: Msg): Espacio => ({ id: k, nombre: String(m.nombre), x: Number(m.x), y: Number(m.y), z: Number(m.z), radio: Number(m.radio), estado: m.estado === "privado" ? "privado" : "libre", duenoNombre: String(m.duenoNombre ?? ""), cosas: Number(m.cosas), tope: Number(m.tope), invitados: Number(m.invitados) });
  const enviar = (intent: string, msg: Msg): Res => (A ? A.send(intent, msg) : SIN);
  const espacios = {
    /** The spaces this page knows (within their area of interest), as last published. */
    lista: (): Espacio[] => (A ? A.state.keys().map((k) => leer(k, A!.state.get(k) as Msg)) : []),
    uno: (id: string): Espacio | null => { const m = A?.state.get(id); return m ? leer(id, m) : null; },
    ultimoAviso: (): string => ultimoAviso,
    ultimoRechazo: (): string => ultimoRechazo,
    ultimoConcedido: (): string => ultimoConcedido,
    asignar: (id: string, quien: number): Res => enviar("asignar", { id, quien }),
    liberar: (id: string): Res => enviar("liberar", { id }),
    nombrar: (id: string, nombre: string): Res => enviar("nombrar", { id, nombre }),
    invitar: (id: string, quien: number): Res => enviar("invitar", { id, quien }),
    quitar: (id: string, nombre: string): Res => enviar("quitar", { id, nombre }),
    entrar: (id: string): Res => enviar("entrar", { id }),
    colocar: (id: string, tipo: string, x: number, z: number, sobre = 0): Res => enviar("colocar", { id, tipo, x, z, sobre }),
    retirar: (id: string, n: number): Res => enviar("retirar", { id, n }),
    mirar: (id: string): Res => enviar("mirar", { id }),
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange(() => avisar("lista"));
    api.on("aviso", (m) => { ultimoAviso = String(m.texto); avisar("aviso"); });
    api.on("concedido", (m) => { ultimoConcedido = String(m.texto); avisar("concedido"); });
    api.on("rechazado", (m) => { ultimoRechazo = String(m.motivo); avisar("rechazado"); });
  });
  return { parts: [parte], espacios };
}

const pagina = crearCliente();
export const espacios = pagina.espacios;
export default pagina.parts[0];
