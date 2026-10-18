// Panels of the page (J5: the big map and the player sheet): a dialog that opens and closes with its key and its
// button, one at a time, gives focus back where it was, and never takes a key typed in a text box.

/** Typing never moves you (J3's one rule for every key listener of the page). */
import { escribiendo } from "./escribiendo.ts";
import { perfil } from "./perfil-aparato.ts";
import { esMovil } from "../../packages/client/src/movil.ts"; // U24: a phone names no key
export { escribiendo };

/** Say something politely to screen readers (the page's aria-live region, as the features' announcements do). */
const oyentes: Array<(texto: string) => void> = [];
/** Whoever shows notices to eyes (U3: the stack at the top) hears what is said to ears. */
export function alAnunciar(fn: (texto: string) => void): void { oyentes.push(fn); }
export function anunciar(texto: string): void {
  for (const fn of oyentes) try { fn(texto); } catch { /* a sighted twin never breaks the announcement */ }
  const box = document.getElementById("avisos");
  if (!box) return;
  const p = document.createElement("p"); p.textContent = texto; box.appendChild(p);
  while (box.childElementCount > 3) box.firstElementChild!.remove();
}

export type Dialogo = { dialog: HTMLDialogElement; cuerpo: HTMLElement; abrir(): void; cerrar(): void; alternar(): void; readonly abierto: boolean };
const todos: Dialogo[] = [];

/** A modal dialog with a title and a close button; `tecla` (e.g. "KeyM") and `boton` open and close it. Escape closes
 * it (the browser does). Opening one closes the others. */
export function crearDialogo(o: { id: string; titulo: string; tecla: string; boton: HTMLButtonElement; alAbrir?: () => void; alCerrar?: () => void; noConstruyendo?: boolean }): Dialogo {
  const dialog = document.createElement("dialog");
  dialog.id = o.id; dialog.className = "panel-j5"; dialog.setAttribute("aria-labelledby", `${o.id}-titulo`);
  const cabeza = document.createElement("header");
  const h2 = document.createElement("h2"); h2.id = `${o.id}-titulo`; h2.textContent = o.titulo;
  const cerrarB = document.createElement("button"); cerrarB.type = "button"; cerrarB.className = "cerrar";
  const letra = o.tecla.replace(/^Key/, "");
  cerrarB.textContent = esMovil(perfil().clase) ? "Cerrar" : `Cerrar (${letra})`; cerrarB.setAttribute("aria-keyshortcuts", `${letra} Escape`);
  cabeza.append(h2, cerrarB);
  const cuerpo = document.createElement("div"); cuerpo.className = "cuerpo";
  dialog.append(cabeza, cuerpo);
  document.body.appendChild(dialog);
  o.boton.setAttribute("aria-haspopup", "dialog"); o.boton.setAttribute("aria-controls", o.id);
  o.boton.setAttribute("aria-expanded", "false"); o.boton.setAttribute("aria-keyshortcuts", letra);
  let volver: Element | null = null;
  const d: Dialogo = {
    dialog, cuerpo,
    get abierto() { return dialog.open; },
    abrir() {
      if (dialog.open) return;
      for (const x of todos) if (x !== d) x.cerrar();
      volver = document.activeElement === o.boton && !porTeclado ? null : document.activeElement; // a mouse-clicked button keeps no focus (Space jumps)
      dialog.showModal();
      o.boton.setAttribute("aria-expanded", "true");
      o.alAbrir?.();
    },
    cerrar() { if (dialog.open) dialog.close(); },
    alternar() { if (dialog.open) d.cerrar(); else d.abrir(); },
  };
  let porTeclado = true;
  dialog.addEventListener("close", () => {
    o.boton.setAttribute("aria-expanded", "false");
    o.alCerrar?.();
    if (volver instanceof HTMLElement && volver.isConnected) volver.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    volver = null;
  });
  // touches, drags and wheels inside a panel belong to it: never the walking joystick nor the camera
  for (const t of ["pointerdown", "wheel"]) dialog.addEventListener(t, (e) => e.stopPropagation());
  cerrarB.addEventListener("click", () => d.cerrar());
  o.boton.addEventListener("click", (e) => { porTeclado = e.detail === 0; d.alternar(); porTeclado = true; });
  addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || e.code !== o.tecla || (o.noConstruyendo && document.body.classList.contains("construyendo"))) return; // noConstruyendo: the builder owns that letter while building
    e.preventDefault();
    d.alternar();
  });
  todos.push(d);
  return d;
}
