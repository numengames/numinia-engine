// menu-barra (ux2-barra): a drop-down menu hung from a button of the top bar — «Cámara» (P: foto, grabar, compartir
// pantalla) and «Menú» (O: ajustes, pantalla completa, volver a la ciudad, teclas y ayuda). The entries are the real
// buttons each module already builds and keeps (foto.ts, graboso.ts, pantalla.ts, menu-ajustes…): this file only moves
// them into one list, so their ids, their own click handlers and their `hidden` rules stay where they were.
// WAI-ARIA menu button: aria-haspopup/expanded on the button, role=menu + menuitem, ↑ ↓ Home End move, Escape closes and
// gives focus back, Tab or a press outside closes. One menu open at a time. A menu with every entry hidden hides its
// button (the `hidden` attribute, never a CSS display), so the bar never shows a dead button.
import { escribiendo } from "./escribiendo.ts";
import { botonVisible, entradasVisibles, siguienteEntrada } from "./menu-logica.ts";

export type MenuBarra = {
  boton: HTMLButtonElement; menu: HTMLElement;
  abrir(porTeclado?: boolean): boolean; cerrar(foco?: boolean): void; alternar(porTeclado?: boolean): void;
  sincronizar(): void; readonly abierto: boolean;
};
const todos: MenuBarra[] = [];

export function montarMenuBarra(o: {
  id: string; barra: HTMLElement; boton: HTMLButtonElement; etiqueta: string; entradas: HTMLButtonElement[];
  tecla?: string;                          // e.g. "KeyP": opens and closes it (not while typing)
  puedeTecla?: (e: KeyboardEvent) => boolean; // the key waits when something else owns it (building, a dialog, a dartboard)
}): MenuBarra {
  const { boton, barra, entradas } = o;
  const menu = document.createElement("div");
  menu.id = o.id; menu.className = "menu-barra"; menu.hidden = true;
  menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", o.etiqueta);
  boton.setAttribute("aria-haspopup", "menu"); boton.setAttribute("aria-controls", o.id); boton.setAttribute("aria-expanded", "false");
  for (const b of entradas) {
    b.setAttribute("role", "menuitem"); b.tabIndex = -1; b.classList.add("entrada-menu"); b.classList.remove("solo-icono");
    menu.appendChild(b);
  }
  barra.appendChild(menu);
  let porTecladoAbierto = false;
  const ocultas = () => entradas.map((b) => !!b.hidden); // `hidden` may also be "until-found"
  const visibles = () => entradasVisibles(ocultas());

  const m: MenuBarra = {
    boton, menu,
    get abierto() { return !menu.hidden; },
    sincronizar() {
      const ver = botonVisible(ocultas());
      if (boton.hidden === ver) boton.hidden = !ver;
      if (!ver && !menu.hidden) m.cerrar(false);
    },
    abrir(porTeclado = false) {
      m.sincronizar();
      if (boton.hidden) return false;
      for (const x of todos) if (x !== m) x.cerrar(false);
      // hang it under its button, right edges together (offsets are the bar's own CSS pixels: the UI zoom does not matter)
      menu.style.right = `${Math.max(0, barra.clientWidth - (boton.offsetLeft + boton.offsetWidth))}px`;
      menu.hidden = false; boton.setAttribute("aria-expanded", "true"); porTecladoAbierto = porTeclado;
      if (porTeclado) entradas[visibles()[0]]?.focus({ preventScroll: true });
      return true;
    },
    cerrar(foco = false) {
      if (menu.hidden) return;
      const dentro = menu.contains(document.activeElement);
      menu.hidden = true; boton.setAttribute("aria-expanded", "false");
      if (foco) boton.focus({ preventScroll: true });
      else if (dentro) (document.activeElement as HTMLElement | null)?.blur?.();
    },
    alternar(porTeclado = false) { if (m.abierto) m.cerrar(porTeclado); else m.abrir(porTeclado); },
  };

  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  boton.addEventListener("click", (e) => { m.alternar(e.detail === 0); if (e.detail > 0) boton.blur(); });
  boton.addEventListener("keydown", (e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !m.abierto) { e.preventDefault(); m.abrir(true); } });
  for (const t of ["pointerdown", "wheel"]) menu.addEventListener(t, (e) => e.stopPropagation()); // the menu is not the world
  // an entry pressed: the menu folds first (capture, before the entry's own handler opens its thing); a keyboard user
  // keeps the focus on the bar's button, so whatever the entry opens gives it back there
  menu.addEventListener("click", (e) => {
    if (!(e.target as Element | null)?.closest?.('[role="menuitem"]')) return;
    const teclado = porTecladoAbierto || (e as MouseEvent).detail === 0;
    m.cerrar(teclado);
  }, { capture: true });
  menu.addEventListener("keydown", (e) => {
    const actual = entradas.indexOf(document.activeElement as HTMLButtonElement);
    const sig = siguienteEntrada(visibles(), actual, e.key);
    if (sig !== null) { e.preventDefault(); entradas[sig]?.focus({ preventScroll: true }); }
    else if (e.key === "Escape" || (o.tecla && e.code === o.tecla && !e.repeat)) { e.preventDefault(); m.cerrar(true); }
    else if (e.key === "Tab") m.cerrar(false);
    e.stopPropagation(); // keys typed in the menu never walk, jump or open something else
  });
  addEventListener("pointerdown", (e) => { // a press anywhere else folds it
    if (menu.hidden) return;
    const t = e.target as Node | null;
    if (t && (menu.contains(t) || boton.contains(t))) return;
    m.cerrar(false);
  }, { capture: true });
  if (o.tecla) addEventListener("keydown", (e) => {
    if (e.code !== o.tecla || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || escribiendo(e)) return;
    if (menu.contains(e.target as Node)) return; // handled above
    if (!m.abierto && o.puedeTecla && !o.puedeTecla(e)) return;
    e.preventDefault();
    m.alternar(true);
  });
  setInterval(() => m.sincronizar(), 500); // an entry that hides (XR, permissions) can hide the whole button
  m.sincronizar();
  todos.push(m);
  return m;
}
