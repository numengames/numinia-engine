// t_45ef2f70: what the start bundle needs from the Inventario without its panel (inventario.ts, loaded after the first frame
// behind inventario-puerta.ts): the one-line summary the sheet and the VR menu print, and the pulse on the Bolsa button.
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
