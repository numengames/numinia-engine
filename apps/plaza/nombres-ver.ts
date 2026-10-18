// U22 on the page: «show everybody's name» while held. Alt on a keyboard, a «Nombres» button on a touch screen (hold it),
// the Back/Select button (8) of a gamepad. Without it a name only shows over whoever you look at and whoever speaks
// (packages/render/src/carteles.ts). Releasing, losing focus or hiding the page drops it, so it never stays on.
import { esTactil, perfil } from "./perfil-aparato.ts";
import { esMovil } from "../../packages/client/src/movil.ts";
type Vista = { verNombres(todos: boolean): void };
const UN_RATO_MS = 6000;

// On a phone layout (U24) the floating button would be a seventh control on top of the joystick: there it is an entry of «…»
// (tap = every name for 6 s, `unRato`). Any other touch screen (a tablet) keeps the held button.
export function montarVerNombres(view: Vista): { sostenido(): boolean; unRato(ms?: number): void } {
  let teclado = false, boton = false, mando = false, rato = false, tRato = 0;
  const aplicar = () => view.verNombres(teclado || boton || mando || rato);
  const unRato = (ms = UN_RATO_MS) => { rato = true; aplicar(); clearTimeout(tRato); tRato = window.setTimeout(() => { rato = false; aplicar(); }, ms); };

  addEventListener("keydown", (e) => {
    if (e.key !== "Alt" || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); // Alt alone would focus the browser's menu bar on Windows/Linux
    if (!teclado) { teclado = true; aplicar(); }
  });
  addEventListener("keyup", (e) => { if (e.key === "Alt") { e.preventDefault(); teclado = false; aplicar(); } });
  const soltar = () => { teclado = boton = mando = rato = false; clearTimeout(tRato); aplicar(); };
  addEventListener("blur", soltar);
  addEventListener("visibilitychange", () => { if (document.hidden) soltar(); });

  if (esTactil() && !esMovil(perfil().clase)) { // U25: the profile decides touch (a forced one too), not the media query
    const b = document.createElement("button");
    b.id = "nombres-ver"; b.type = "button"; b.textContent = "Nombres"; b.setAttribute("aria-label", "Mantén pulsado para ver los nombres de todos");
    b.style.cssText = "position:fixed;left:12px;bottom:76px;padding:8px 12px;border:0;border-radius:8px;background:rgba(20,24,30,.82);color:#ffd27a;font:inherit;font-weight:600;touch-action:none;user-select:none;-webkit-user-select:none";
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); b.setPointerCapture(e.pointerId); boton = true; aplicar(); });
    const fuera = () => { boton = false; aplicar(); };
    b.addEventListener("pointerup", fuera); b.addEventListener("pointercancel", fuera); b.addEventListener("lostpointercapture", fuera);
    document.body.appendChild(b);
  }

  let sondeo = 0;
  const leerMando = () => {
    let p = false;
    for (const g of navigator.getGamepads?.() ?? []) if (g?.connected && g.buttons[8]?.pressed) p = true;
    if (p !== mando) { mando = p; aplicar(); }
  };
  addEventListener("gamepadconnected", () => { if (!sondeo) sondeo = window.setInterval(leerMando, 100); });
  addEventListener("gamepaddisconnected", () => { if (!navigator.getGamepads?.().some((g) => g?.connected)) { clearInterval(sondeo); sondeo = 0; mando = false; aplicar(); } });
  return { sostenido: () => teclado || boton || mando || rato, unRato };
}
