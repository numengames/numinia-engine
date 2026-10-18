// The chat box (J3): Enter opens it, Enter sends, Escape closes; «/» opens it with the slash typed. The list
// (role=log, polite) shows the last 30 lines and is what screen readers hear; the zone's history arrives without being
// read line by line. A «Chat» button on touch screens. What people write goes in with textContent only, never HTML.
// main.ts passes the chat of features/chat/client.ts (only composition roots import features/).
import { escribiendo } from "./escribiendo.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page
import { anunciar } from "./paneles.ts"; // F1: an answer only for you («te han silenciado») also reaches the status region when the chat is closed

type Linea = { tipo: "cerca" | "zona" | "antes" | "aviso"; quien: number; nombre: string; texto: string; tuyo: boolean };
type Res = { ok: true } | { ok: false; why: string };
type Chat = { lineas: readonly Linea[]; alLlegar(fn: (l: Linea) => void): void; decir(texto: string, canal?: "cerca" | "zona"): Res };
export const LISTA_MAX = 30;
const CANAL = { cerca: { texto: "Cerca", titulo: "Te leen quienes están a menos de 20 m. Pulsa para hablar a toda la zona." }, zona: { texto: "Zona", titulo: "Te lee toda la zona (un mensaje cada 5 s). Pulsa para hablar solo a quien está cerca." } };

export function montarChat(chat: Chat, raiz: HTMLElement) {
  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector(sel) as T;
  const lista = $<HTMLOListElement>("#chat-lista"), form = $<HTMLFormElement>("#chat-form"), input = $<HTMLInputElement>("#chat-texto");
  const canalBtn = $<HTMLButtonElement>("#chat-canal"), estado = $<HTMLElement>("#chat-estado"), boton = $<HTMLButtonElement>("#chat-boton");
  const tactil = esTactil();
  let canal: "cerca" | "zona" = "cerca";
  let silencio: ReturnType<typeof setTimeout> | undefined;

  const pintarCanal = () => { canalBtn.textContent = CANAL[canal].texto; canalBtn.title = CANAL[canal].titulo; canalBtn.setAttribute("aria-label", `A quién le llega: ${CANAL[canal].texto}. ${CANAL[canal].titulo}`); };
  const pintar = (l: Linea) => {
    const li = document.createElement("li");
    li.className = l.tipo;
    if (l.tipo === "aviso") { li.textContent = l.texto; if (form.hidden) anunciar(l.texto); }
    else {
      const quien = document.createElement("b");
      quien.textContent = (l.tuyo ? "Tú" : l.nombre) + (l.tipo === "zona" ? " (a la zona)" : l.tipo === "antes" ? " (antes)" : "");
      li.append(quien, document.createTextNode(`: ${l.texto}`));
    }
    if (l.tipo === "antes") { // the zone's history: shown, not read aloud line by line
      lista.setAttribute("aria-live", "off");
      clearTimeout(silencio);
      silencio = setTimeout(() => lista.setAttribute("aria-live", "polite"), 400);
    }
    lista.append(li);
    while (lista.childElementCount > LISTA_MAX) lista.firstElementChild!.remove();
    lista.scrollTop = lista.scrollHeight;
  };
  const abrir = (con = "") => {
    form.hidden = false; boton.setAttribute("aria-expanded", "true");
    if (con) input.value = con;
    input.focus();
  };
  const cerrar = () => {
    form.hidden = true; boton.setAttribute("aria-expanded", "false");
    input.value = ""; estado.textContent = "";
    input.blur();
  };
  const enviar = () => {
    if (!input.value.trim()) { cerrar(); return; }
    const r = chat.decir(input.value, canal);
    if (!r.ok) { estado.textContent = r.why; return; } // the text stays, so it can be fixed
    input.value = ""; estado.textContent = "";
    if (!tactil) cerrar(); // on desktop, back to walking; on a phone the keyboard stays for the next line
  };

  for (const l of chat.lineas) pintar(l);
  chat.alLlegar(pintar);
  pintarCanal();
  canalBtn.addEventListener("click", () => { canal = canal === "cerca" ? "zona" : "cerca"; pintarCanal(); input.focus(); });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") { e.preventDefault(); enviar(); }
    else if (e.key === "Escape") { e.preventDefault(); cerrar(); }
  });
  input.addEventListener("input", () => { const n = new TextEncoder().encode(input.value).length; estado.textContent = n > 160 ? `${n} de 200 bytes` : ""; });
  // Enter (or «/») anywhere in the world opens the box; never while typing in another box or when a button has focus
  addEventListener("keydown", (e) => {
    if (escribiendo(e) || e.repeat || (e.key !== "Enter" && e.key !== "/")) return;
    const t = e.target as Element | null;
    if (t && t !== document.body && t.closest?.("button, a, summary, [role=button]")) return; // Enter presses that button
    if (document.querySelector("dialog[open]")) return; // a modal panel (map, sheet, settings) owns Enter
    e.preventDefault();
    abrir(e.key === "/" ? "/" : "");
  });
  if (tactil) { boton.hidden = false; input.placeholder = "Escribe aquí…"; } // U24: a phone says no «pulsa Enter»
  boton.addEventListener("click", () => (form.hidden ? abrir() : cerrar()));
  raiz.addEventListener("pointerdown", (e) => e.stopPropagation()); // a touch on the chat is not a joystick
  return { abrir, cerrar, get abierto() { return !form.hidden; } };
}
