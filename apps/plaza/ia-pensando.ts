// ia-pensando (t_466efdb8): the small «thinking» orb in the chat line. While an AI near you was called and has not answered, a line under the chat
// list says «Ada está pensando…» with a tiny dotted orb (CSS only: no canvas, no draw call; it stands still with «menos movimiento»). The server
// decides who thinks (features/ia: `pensando`); this only reads it. The big orb over the avatar is the render's (packages/render/src/orbe-ia.ts).
import type { IAPublica } from "../../features/ia/feature.ts";
import { sinMarca, textos } from "./gente-ia.ts";

/** An AI this far away is not part of your conversation (the near chat reaches 20 m). */
export const PENSANDO_CERCA_M = 20;

/** Pure: the line for the AIs thinking near you, `""` when none. One or two are named; more are counted. */
export function textoPensando(nombres: readonly string[], idioma?: string): string {
  const t = textos(idioma), n = nombres.map((x) => sinMarca(x).trim()).filter(Boolean);
  if (n.length === 0) return "";
  if (n.length === 1) return `${n[0]} ${t.pensando}`;
  if (n.length === 2) return `${n[0]} ${t.pensandoY} ${n[1]} ${t.pensandoVarias}`;
  return `${n.length} ${t.pensandoIAs} ${t.pensandoVarias}`;
}

export const CSS_PENSANDO = `
#chat-pensando { margin: 0; padding: 2px 10px; font-size: 12px; color: #cfe8ff; display: flex; align-items: center; gap: 6px; }
#chat-pensando[hidden] { display: none; }
#chat-pensando .orbe-mini { width: 14px; height: 14px; flex: none; border-radius: 50%; background: radial-gradient(circle, #eaf6ff 0 1.3px, transparent 1.8px) 0 0 / 4px 4px; box-shadow: 0 0 6px rgba(150, 205, 255, .55); animation: orbe-mini-gira 1.6s linear infinite; }
@keyframes orbe-mini-gira { to { transform: rotate(-360deg) scale(1.08); } }
@media (prefers-reduced-motion: reduce) { #chat-pensando .orbe-mini { animation: none; } }
html.menos-movimiento #chat-pensando .orbe-mini { animation: none; }
`;

type Fuente = { lista(): { quien: number; ia: IAPublica }[]; alCambiar(fn: (quien: number, ficha: IAPublica | null) => void): () => void };

/** Mount the line right under the chat list. Nothing is drawn while nobody thinks. */
export function montarPensando(o: { ia: Fuente; nombre: (quien: number) => string | null; distancia: (quien: number) => number | null; idioma: () => string; raiz: HTMLElement }) {
  const lista = o.raiz.querySelector("#chat-lista");
  const p = document.createElement("p");
  p.id = "chat-pensando"; p.hidden = true; p.setAttribute("role", "status"); p.setAttribute("aria-live", "polite");
  const orbe = document.createElement("span"); orbe.className = "orbe-mini"; orbe.setAttribute("aria-hidden", "true");
  const texto = document.createElement("span");
  p.append(orbe, texto);
  if (lista?.nextSibling) lista.parentNode!.insertBefore(p, lista.nextSibling); else o.raiz.append(p);
  const estilo = document.createElement("style"); estilo.textContent = CSS_PENSANDO; document.head.append(estilo);
  let reloj: ReturnType<typeof setInterval> | undefined;
  const pintar = () => {
    const cerca = o.ia.lista().filter((x) => x.ia.pensando === true).filter((x) => { const d = o.distancia(x.quien); return d !== null && d <= PENSANDO_CERCA_M; });
    const t = textoPensando(cerca.map((x) => o.nombre(x.quien) ?? "una IA"), o.idioma());
    if (texto.textContent !== t) texto.textContent = t;
    p.hidden = t === "";
    if (o.ia.lista().some((x) => x.ia.pensando === true)) reloj ??= setInterval(pintar, 1000); // you walk: who is near changes without any state change
    else if (reloj) { clearInterval(reloj); reloj = undefined; }
  };
  o.ia.alCambiar(pintar);
  return { pintar, el: p };
}
