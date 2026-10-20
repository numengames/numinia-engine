// Y1 on the page: the Inventario panel (key R, «Reserva», or the «Inventario» button next to «Misiones»): what you carry (one
// weapon, up to three relics) and your Reserva (the rest; tokens with «× n»), each line with a house icon and a real
// button «Llevar» / «Guardar» where it applies. No drag and drop (that is Y2). Plain accessible HTML, like the book:
// headings, lists, buttons. It is drawn only while open and only when the Reserva changes.
import { crearDialogo, anunciar } from "./paneles.ts";
import { icono } from "./iconos.ts";

type Objeto = { id: string; tipo: "arma" | "reliquia" | "token" | "captura"; clase: string; nombre: string; icono: string; color: string; valor: number; n: number; portado: boolean };
type Res = { ok: true } | { ok: false; why: string };
type Ctl = { lista(): Objeto[]; resumen(): { objetos: number; portados: number; prestigio: number }; equipar(id: string): Res; desequipar(id: string): Res; estado: { ultimoRechazo: string; ultimoRecibido: string }; alCambiar(fn: () => void): unknown };

/** The house icon of a type when the object brings none (the subset is STD-023's; new glyphs are the Oracle's call). */
export const ICONO_TIPO: Record<Objeto["tipo"], string> = { arma: "crosshair", reliquia: "eye", token: "globe-hemisphere-west", captura: "fish" };
/** A catch's rarity as the server writes it into the colour (features/pesca/otorga.ts: plateada común, azul rara, dorada legendaria). */
export const RAREZA_DE_COLOR: Record<string, string> = { plateada: "común", azul: "rara", dorada: "legendaria" };
/** The little line under a catch's name: «pez · rara». */
export const detalleDeCaptura = (o: Pick<Objeto, "color">): string => `pez · ${RAREZA_DE_COLOR[o.color] ?? "común"}`;

const CSS_AVISO = `
#inventario-abrir.recibe, #mas.recibe { animation: bolsa-pulso .7s ease-out 2; }
@keyframes bolsa-pulso { 0% { box-shadow: 0 0 0 0 rgba(255, 210, 122, .9); transform: scale(1); } 40% { transform: scale(1.18); } 100% { box-shadow: 0 0 0 14px rgba(255, 210, 122, 0); transform: scale(1); } }
.bolsa-mas { position: fixed; z-index: 30; pointer-events: none; padding: 1px 7px; border-radius: 999px; background: #ffd27a; color: #23303b; font: 700 13px/1.5 system-ui, sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.4); animation: bolsa-mas 1.6s ease-out forwards; }
@keyframes bolsa-mas { 0% { opacity: 0; transform: translateY(-8px) scale(.7); } 15% { opacity: 1; transform: translateY(0) scale(1.1); } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(12px); } }
@media (prefers-reduced-motion: reduce) { #inventario-abrir.recibe, #mas.recibe { animation: none; outline: 3px solid #ffd27a; } .bolsa-mas { animation: bolsa-mas-quieta 1.6s linear forwards; } @keyframes bolsa-mas-quieta { 0%, 85% { opacity: 1; } 100% { opacity: 0; } } }`;
/** Something just went into the Inventario (a fish landed): the Bolsa button pulses and a «+1» rises from it for a moment.
 * On a phone the button lives behind «…»: then that button pulses instead. Cheap: one class, one short-lived element. */
export function avisarRecibido(texto = "+1"): void {
  if (!document.getElementById("inventario-aviso-css")) { const s = document.createElement("style"); s.id = "inventario-aviso-css"; s.textContent = CSS_AVISO; document.head.appendChild(s); }
  const visible = (e: HTMLElement | null): e is HTMLElement => !!e && !e.hidden && e.getBoundingClientRect().width > 0;
  const b = document.getElementById("inventario-abrir"), m = document.getElementById("mas");
  const objetivo = visible(b) ? b : visible(m) ? m : null;
  if (!objetivo) return;
  objetivo.classList.remove("recibe"); void objetivo.offsetWidth; objetivo.classList.add("recibe");
  setTimeout(() => objetivo.classList.remove("recibe"), 1500);
  const r = objetivo.getBoundingClientRect(), chip = el("span", texto, "bolsa-mas");
  chip.setAttribute("aria-hidden", "true"); chip.style.left = `${Math.round(r.right - 26)}px`; chip.style.top = `${Math.round(r.bottom - 6)}px`; // under the button: the top bar sits at the very top of the screen
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), 1700);
}
/** What the sheet says: «3 objetos (1 contigo) · Semillas: 4 puntos de Prestigio». */
export function resumenTexto(r: { objetos: number; portados: number; prestigio: number }): string {
  if (!r.objetos) return "No llevas nada todavía.";
  return `${r.objetos} ${r.objetos === 1 ? "objeto" : "objetos"}${r.portados ? ` (${r.portados} contigo)` : ""}${r.prestigio ? ` · Semillas: ${r.prestigio} ${r.prestigio === 1 ? "punto" : "puntos"} de Prestigio` : ""}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, texto = "", clase = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (texto) e.textContent = texto; if (clase) e.className = clase; return e;
};

export function montarInventario(c: Ctl, boton: HTMLButtonElement) {
  const panel = crearDialogo({ id: "inventario", titulo: "Bolsa", tecla: "KeyR", noConstruyendo: true, boton, alAbrir: () => pintar(true) });
  let firma = "";
  const fila = (o: Objeto): HTMLElement => {
    const li = el("li", "", `objeto ${o.tipo}`);
    const ic = el("span", "", "icono-objeto"); ic.innerHTML = icono(o.icono || ICONO_TIPO[o.tipo], 20); // safe: icono() only returns a house SVG from its fixed table ("" for an unknown name), never the object's text
    const nombre = el("span", o.n > 1 || o.tipo === "captura" ? `${o.nombre} × ${o.n}` : o.nombre, "nombre"); // a fish always shows its count
    const detalle = el("span", o.tipo === "captura" ? detalleDeCaptura(o) : o.tipo === "token" ? (o.valor ? `${o.valor * o.n} ${o.valor * o.n === 1 ? "punto" : "puntos"} de Prestigio` : "token") : o.tipo, "detalle");
    if (o.tipo === "captura") ic.dataset.rareza = RAREZA_DE_COLOR[o.color] ?? "común";
    li.append(ic, nombre, detalle);
    if (o.tipo === "arma" || o.tipo === "reliquia") {
      const b = el("button", o.portado ? "Guardar" : "Llevar"); b.type = "button";
      b.setAttribute("aria-label", `${o.portado ? "Guardar" : "Llevar"} ${o.nombre}`);
      b.addEventListener("click", () => { const r = o.portado ? c.desequipar(o.id) : c.equipar(o.id); if (!r.ok) anunciar(r.why); });
      li.appendChild(b);
    }
    return li;
  };
  const lista = (titulo: string, objetos: Objeto[], vacio: string): HTMLElement[] => {
    const h = el("h3", titulo);
    if (!objetos.length) return [h, el("p", vacio, "vacio")];
    const ul = el("ul", "", "objetos"); for (const o of objetos) ul.appendChild(fila(o));
    return [h, ul];
  };
  const pintar = (fuerza = false) => {
    if (!panel.abierto) return;
    const todos = c.lista(), f = JSON.stringify(todos);
    if (!fuerza && f === firma) return;
    firma = f;
    const r = c.resumen();
    const partes: HTMLElement[] = [el("p", resumenTexto(r), "resumen")];
    partes.push(...lista("Llevas contigo", todos.filter((o) => o.portado), "Nada: un arma y hasta tres reliquias de tu Reserva pueden ir contigo."));
    const peces = todos.filter((o) => o.tipo === "captura");
    partes.push(...lista("Reserva", todos.filter((o) => !o.portado && o.tipo !== "captura"), peces.length ? "Nada más." : "Vacía. Lo que te den en la plaza (una Semilla del Conocimiento al terminar una misión, un pez que pesques) aparece aquí."));
    if (peces.length) partes.push(...lista("Pescado", peces, ""));
    panel.cuerpo.replaceChildren(...partes);
  };
  c.alCambiar(() => {
    pintar();
    if (c.estado.ultimoRechazo) { anunciar(c.estado.ultimoRechazo); c.estado.ultimoRechazo = ""; }
  });
  return { abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), pintar };
}
