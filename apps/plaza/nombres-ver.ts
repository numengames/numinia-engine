// U22 on the page: «show everybody's name» while held. Alt on a keyboard, a «Nombres» button on a touch screen (hold it),
// the Back/Select button (8) of a gamepad. Without it a name only shows over whoever you look at and whoever speaks
// (packages/render/src/carteles.ts). Releasing, losing focus or hiding the page drops it, so it never stays on.
type Vista = { verNombres(todos: boolean): void };

export function montarVerNombres(view: Vista): { sostenido(): boolean } {
  let teclado = false, boton = false, mando = false;
  const aplicar = () => view.verNombres(teclado || boton || mando);

  addEventListener("keydown", (e) => {
    if (e.key !== "Alt" || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); // Alt alone would focus the browser's menu bar on Windows/Linux
    if (!teclado) { teclado = true; aplicar(); }
  });
  addEventListener("keyup", (e) => { if (e.key === "Alt") { e.preventDefault(); teclado = false; aplicar(); } });
  const soltar = () => { teclado = boton = mando = false; aplicar(); };
  addEventListener("blur", soltar);
  addEventListener("visibilitychange", () => { if (document.hidden) soltar(); });

  if (matchMedia("(pointer: coarse)").matches) {
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
  return { sostenido: () => teclado || boton || mando };
}
