// chat — client part (J3): bubbles and names through the view hooks, the conversation the page shows
// (apps/plaza/chat.ts) and an agent can read, and `decir`, which checks the text and the pace before sending so
// the person hears "too long" or "wait" at once (the server still decides: it has the same limits).
// Text from others is untrusted: it is only ever painted as text (canvas fillText, textContent).
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg, Rate } from "../../packages/feature/src/index.ts";
import { chat, BOCADILLO_MS, TEXTO_MAX, RITMO_CERCA, RITMO_ZONA } from "./feature.ts";
import { bytesDe, limpiar } from "./texto.ts";

export const LINEAS_MAX = 30; // lines the page keeps (and shows) in its list
export type Canal = "cerca" | "zona";
/** One line of the conversation: near, zone, from before you came (zone history) or an answer only for you. */
export type Linea = { tipo: "cerca" | "zona" | "antes" | "aviso"; quien: number; nombre: string; texto: string; tuyo: boolean };
type Res = { ok: true } | { ok: false; why: string };

/** The page's copy of a pace limit (milliseconds), so it can say "wait" before the server drops the message. */
function ritmo(r: Rate) {
  let tokens = r.burst, t = -1;
  return (now: number) => {
    if (t >= 0) tokens = Math.min(r.burst, tokens + ((now - t) / 1000) * r.perSecond);
    t = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/** One per page (tests make one per client). `chat` is what the chat box or an agent's helper calls. */
export function crearCliente(reloj: () => number = () => performance.now()) {
  let api: ClientApi | null = null;
  const lineas: Linea[] = [];
  const nombres = new Map<number, string>();   // entity -> name, as the server sent them (who the page draws near)
  const oyentes: ((l: Linea) => void)[] = [];
  const paso = { cerca: ritmo(RITMO_CERCA), zona: ritmo(RITMO_ZONA) };

  const chatApi = {
    lineas: lineas as readonly Linea[],
    nombres: nombres as ReadonlyMap<number, string>,
    /** Called with each new line (the chat box draws it). */
    alLlegar(fn: (l: Linea) => void): void { oyentes.push(fn); },
    /** Say something near (20 m) or to the whole zone; `/…` is an order. Refused, with the reason, when empty, longer
     * than 200 bytes or too fast. */
    decir(texto: string, canal: Canal = "cerca"): Res {
      const t = limpiar(texto, 4 * TEXTO_MAX);
      if (!t) return { ok: false, why: "No hay nada que decir." };
      const n = bytesDe(t);
      if (n > TEXTO_MAX) return { ok: false, why: `Demasiado largo: ${n} de ${TEXTO_MAX} bytes. Acórtalo.` };
      if (!paso[canal](reloj())) return { ok: false, why: canal === "zona" ? "Espera: a toda la zona, un mensaje cada 5 segundos." : "Vas muy deprisa: espera un segundo." };
      return api?.send(canal === "zona" ? "decirZona" : "decir", { texto: t }) ?? { ok: false, why: "la página aún no ha arrancado" };
    },
  };

  const part = clientPart(chat, (a) => {
    api = a;
    const poner = (tipo: Linea["tipo"], m: Msg) => {
      const quien = m.quien === undefined ? -1 : Number(m.quien);
      const l: Linea = { tipo, quien, nombre: String(m.nombre ?? ""), texto: String(m.texto ?? ""), tuyo: quien >= 0 && quien === a.self() };
      lineas.push(l);
      if (lineas.length > LINEAS_MAX) lineas.shift();
      for (const fn of oyentes) fn(l);
    };
    a.on("dicho", (m) => { a.view.bubble?.(Number(m.quien), String(m.texto), BOCADILLO_MS); poner("cerca", m); });
    a.on("zona", (m) => { a.view.bubble?.(Number(m.quien), String(m.texto), BOCADILLO_MS); poner("zona", m); });
    a.on("historial", (m) => poner("antes", m));
    a.on("aviso", (m) => poner("aviso", { texto: m.texto }));
    a.on("nombre", (m) => {
      const q = Number(m.quien), n = String(m.nombre ?? "");
      if (n) nombres.set(q, n); else nombres.delete(q);
      a.view.nameTag?.(q, n || null);
    });
  });
  return { part, chat: chatApi };
}

const pagina = crearCliente();
export const chatDePagina = pagina.chat;
export default pagina.part;
