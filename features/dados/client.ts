// dados — client part (v1). Keeps the rolls this page heard (the last few, anyone's) and the dice towers near you; asks
// for a roll and never decides one. One small controller for the page (apps/plaza/dados.ts: the dice card everyone
// sees, the dice buttons beside a tower) and for agents.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { dados as decl, CARAS, DADOS_MAX } from "./feature.ts";

export { CARAS, DADOS_MAX };
export type Tirada = { quien: number; sitio: string; n: number; dados: string; valores: number[]; mod: number; total: number; oculta: boolean; texto: string; mia: boolean; cuando: number };
export type Torre = { id: string; nombre: string; x: number; y: number; z: number; radio: number; dados: string; ultima: string; bandejaDx?: number; bandejaDz?: number; bandejaAlto?: number; bandejaAncho?: number; bandejaFondo?: number };
export type Que = "tirada" | "torres" | "aviso";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función dados no está en este servidor" };
const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Rolls a page remembers (the dice card shows the last; the rest is for agents and tests). */
export const RECUERDA = 12;

export function crearCliente() {
  let A: ClientApi | null = null;
  const tiradas: Tirada[] = [];
  let aviso = "";
  const estado = { puede: false, ultimoRechazo: "" };
  let encendida = false;
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };

  const dados = {
    /** The rolls heard, oldest first (yours and of who was near). */
    tiradas: (): readonly Tirada[] => tiradas,
    ultima: (): Tirada | null => tiradas.at(-1) ?? null,
    aviso: (): string => aviso,
    /** The dice towers this page knows (within the area of interest). */
    torres: (): Torre[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Torre) : []),
    /** Roll: an expression («2d6+1»; empty = the tower's or 1d20), at a tower (its key; none = where you are), hidden or not. */
    tirar: (expresion = "", sitio = "", oculta = false): Res => (A ? A.send("tirar", { sitio, dados: String(expresion).slice(0, 16), oculta }) : SIN),
    /** The switch of the Entorno panel (asks; the server checks who and keeps it in dados.json). `activa` = there are towers or /tirar works: the server's state. */
    interruptor: {
      estado,
      activa: (): boolean => encendida,
      poner: (activa: boolean): Res => (A ? A.send("encender", { activa }) : SIN),
    },
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange(() => avisar("torres"));
    api.on("permiso", (m) => { estado.puede = m.encender === true; });
    api.on("encendido", (m) => { encendida = m.activa === true; });
    api.on("tirada", (m) => {
      const t: Tirada = { quien: Number(m.quien), sitio: String(m.sitio), n: Number(m.n), dados: String(m.dados), valores: String(m.valores).split(" ").filter(Boolean).map(Number), mod: Number(m.mod), total: Number(m.total), oculta: m.oculta === true, texto: String(m.texto), mia: Number(m.quien) === api.self(), cuando: ahora() };
      tiradas.push(t); while (tiradas.length > RECUERDA) tiradas.shift();
      const lectura = / — (.+)$/.exec(t.texto)?.[1]; // a pool of d6: the house reading, not a sum
      if (t.valores.length && lectura) api.view.label(t.quien, `${t.dados}: ${t.valores.join(" · ")} — ${lectura}`, 6000);
      else if (t.valores.length) api.view.label(t.quien, `${t.dados}: ${t.valores.length > 1 || t.mod ? `${t.valores.join(" · ")}${t.mod ? ` ${t.mod > 0 ? "+" : ""}${t.mod}` : ""} = ` : ""}${t.total}`, 6000);
      else api.view.label(t.quien, `${t.dados} en secreto`, 4000);
      avisar("tirada");
    });
    api.on("rechazado", (m) => { aviso = String(m.motivo); estado.ultimoRechazo = aviso; avisar("aviso"); });
  });
  return { parts: [parte], dados };
}

const pagina = crearCliente();
export const dados = pagina.dados;
export const interruptor = pagina.dados.interruptor;
export default pagina.parts[0];
