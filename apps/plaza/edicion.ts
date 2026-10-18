// M6 «Editar interfaz»: the person moves and hides the page's frames. The frames and their names are the table of densidad.ts;
// the layout (offsets + hidden ids, packages/client/src/disposicion.ts) is kept in this browser and applied with one <style>.
// Not modal: the world stays visible and the frames stay where they are, with a dashed outline, a label and a small panel.
// Drag with the pointer (snaps to 10 px, stays on screen); with a frame selected the arrow keys move it (Shift = 50 px).
import { MARCOS_PLAZA } from "../../packages/client/src/densidad.ts";
import { leerDisposicion, marcosMovibles, ajustarPaso, acotar, cssDisposicion, disposicionVacia, PASO_DISPOSICION } from "../../packages/client/src/disposicion.ts";
import type { Disposicion } from "../../packages/client/src/disposicion.ts";
import { ANCHO_MIN_MARCOS } from "../../packages/client/src/densidad.ts";
import { icono } from "./iconos.ts";

const CLAVE = "numinia.ui.disposicion";
const MARCOS = marcosMovibles(MARCOS_PLAZA);
const IDS = MARCOS.map((m) => m.id);

export function montarEdicion() {
  let d: Disposicion = leerDisposicion((() => { try { return localStorage.getItem(CLAVE); } catch { return null; } })(), IDS);
  const html = document.documentElement;
  const estilo = document.createElement("style"); estilo.id = "disposicion"; document.head.appendChild(estilo);
  // edit mode look: every movable frame gets a dashed amber outline and takes the pointer even if it normally ignores it
  const sel = MARCOS.map((m) => `html.editando-ui body ${m.selector}`).join(",");
  const modo = document.createElement("style"); modo.id = "edicion-modo";
  modo.textContent = `${sel}{outline:1.5px dashed var(--n-ambar,#EFA517);outline-offset:3px;cursor:move;pointer-events:auto !important;min-height:30px;touch-action:none;user-select:none}\n`
    + MARCOS.map((m) => `html.editando-ui body ${m.selector}[data-marco-sel="1"]`).join(",") + `{outline-style:solid;outline-width:2px}`;
  document.head.appendChild(modo);
  const guardar = () => { try { if (disposicionVacia(d)) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* private mode: it lasts this visit */ } };
  const aplicar = () => { estilo.textContent = cssDisposicion(d, MARCOS_PLAZA); };
  aplicar();

  const elDe = (id: string) => { const m = MARCOS.find((x) => x.id === id); return m ? document.querySelector<HTMLElement>(m.selector) : null; };
  const rect = (id: string) => elDe(id)?.getBoundingClientRect() ?? null;

  let abierto = false, elegido: string | null = null;
  const panel = document.createElement("section"); panel.id = "editar-ui"; panel.hidden = true; panel.setAttribute("aria-label", "Editar interfaz");
  const etiquetas = document.createElement("div"); etiquetas.id = "editar-etiquetas"; etiquetas.setAttribute("aria-hidden", "true"); etiquetas.hidden = true;
  document.body.append(etiquetas, panel);

  function pintaEtiquetas(): void {
    etiquetas.replaceChildren();
    for (const m of MARCOS) {
      const r = rect(m.id); if (!r || r.width < 4 || r.height < 4) continue;
      const s = document.createElement("span"); s.textContent = m.nombre.replace(/ \(.*/, ""); s.style.left = `${Math.max(0, r.left)}px`; s.style.top = `${Math.max(0, r.top - 20)}px`;
      etiquetas.appendChild(s);
    }
  }
  function pintaPanel(): void {
    panel.replaceChildren();
    const cab = document.createElement("header"); cab.innerHTML = `${icono("gear", 18)}<h2>Editar interfaz</h2>`; // constants only
    const ayuda = document.createElement("p"); ayuda.className = "nota";
    ayuda.textContent = "Arrastra un marco para moverlo. Con uno elegido, las flechas lo mueven (Mayús: más). Esc termina.";
    const ul = document.createElement("ul");
    for (const m of MARCOS) {
      const li = document.createElement("li"), id = `ed-${m.id}`;
      const c = document.createElement("input"); c.type = "checkbox"; c.id = id; c.checked = !d.oculto.includes(m.id);
      c.addEventListener("change", () => { d = { ...d, oculto: c.checked ? d.oculto.filter((x) => x !== m.id) : [...d.oculto, m.id] }; guardar(); aplicar(); });
      const l = document.createElement("label"); l.htmlFor = id; l.textContent = m.nombre.replace(/ \(.*/, "");
      li.append(c, l); ul.appendChild(li);
    }
    const pie = document.createElement("div"); pie.className = "pie";
    const rest = document.createElement("button"); rest.type = "button"; rest.id = "editar-restablecer"; rest.textContent = "Restablecer";
    rest.addEventListener("click", () => { d = { mov: {}, oculto: [] }; guardar(); aplicar(); pintaPanel(); requestAnimationFrame(pintaEtiquetas); });
    const hecho = document.createElement("button"); hecho.type = "button"; hecho.id = "editar-hecho"; hecho.className = "primario"; hecho.textContent = "Hecho";
    hecho.addEventListener("click", () => api.cerrar());
    pie.append(rest, hecho);
    panel.append(cab, ayuda, ul, pie);
  }
  function mover(id: string, dx: number, dy: number, base?: [number, number], r0?: DOMRect): void {
    const r = r0 ?? rect(id); if (!r) return;
    const [bx, by] = base ?? d.mov[id] ?? [0, 0];
    const nx = bx + acotar(dx, r.left, r.width, innerWidth), ny = by + acotar(dy, r.top, r.height, innerHeight);
    const mov = { ...d.mov }; const v: [number, number] = [ajustarPaso(nx), ajustarPaso(ny)];
    if (v[0] === 0 && v[1] === 0) delete mov[id]; else mov[id] = v;
    d = { ...d, mov }; aplicar();
  }
  const marcoEn = (t: EventTarget | null): string | null => {
    const el = t as HTMLElement | null; if (!el?.closest) return null;
    let mejor: { id: string; area: number } | null = null;
    for (const m of MARCOS) { const e = el.closest(m.selector) as HTMLElement | null; if (!e) continue; const r = e.getBoundingClientRect(), a = r.width * r.height; if (!mejor || a < mejor.area) mejor = { id: m.id, area: a }; }
    return mejor?.id ?? null;
  };
  function elegir(id: string | null): void {
    if (elegido) elDe(elegido)?.removeAttribute("data-marco-sel");
    elegido = id; if (id) elDe(id)?.setAttribute("data-marco-sel", "1");
  }
  let arrastre: { id: string; x: number; y: number; base: [number, number]; r0: DOMRect } | null = null;
  const alBajar = (e: PointerEvent) => {
    if (!abierto || panel.contains(e.target as Node)) return;
    const id = marcoEn(e.target); e.stopPropagation(); e.preventDefault(); // editing never moves the avatar or starts the joystick
    if (!id) { elegir(null); return; }
    const r0 = rect(id); if (!r0) return;
    elegir(id); arrastre = { id, x: e.clientX, y: e.clientY, base: d.mov[id] ?? [0, 0], r0 };
  };
  // a drag ends in a click on the frame (the minimap would open the big map, a button would act): while editing, frames only move
  const alClicar = (e: MouseEvent) => { if (abierto && !panel.contains(e.target as Node)) { e.stopPropagation(); e.preventDefault(); } };
  const alMover = (e: PointerEvent) => { if (arrastre) { mover(arrastre.id, e.clientX - arrastre.x, e.clientY - arrastre.y, arrastre.base, arrastre.r0); pintaEtiquetas(); } };
  const alSoltar = () => { if (arrastre) { arrastre = null; guardar(); pintaEtiquetas(); } };
  const alTeclear = (e: KeyboardEvent) => {
    if (!abierto) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); api.cerrar(); return; }
    const t = e.target as HTMLElement | null;
    const paso = e.shiftKey ? 5 * PASO_DISPOSICION : PASO_DISPOSICION;
    const v: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
    if (elegido && v[e.key] && !(t instanceof HTMLInputElement) && !(t instanceof HTMLButtonElement)) { e.preventDefault(); e.stopPropagation(); mover(elegido, v[e.key][0], v[e.key][1]); guardar(); pintaEtiquetas(); }
  };
  const alRedimensionar = () => { if (abierto) { if (innerWidth < ANCHO_MIN_MARCOS) api.cerrar(); else pintaEtiquetas(); } };

  const api = {
    /** The frames sit by the table only from ANCHO_MIN_MARCOS px up: on a phone there is nothing to move. */
    get disponible(): boolean { return innerWidth >= ANCHO_MIN_MARCOS; },
    get abierto(): boolean { return abierto; },
    layout: (): Disposicion => ({ mov: { ...d.mov }, oculto: [...d.oculto] }),
    abrir(): boolean {
      if (abierto || !api.disponible) return abierto;
      abierto = true; html.classList.add("editando-ui"); pintaPanel(); panel.hidden = false; etiquetas.hidden = false;
      document.addEventListener("pointerdown", alBajar, true); document.addEventListener("pointermove", alMover, true); document.addEventListener("pointerup", alSoltar, true);
      document.addEventListener("keydown", alTeclear, true); document.addEventListener("click", alClicar, true); addEventListener("resize", alRedimensionar);
      requestAnimationFrame(pintaEtiquetas);
      (panel.querySelector("#editar-hecho") as HTMLElement | null)?.focus();
      return true;
    },
    cerrar(): void {
      if (!abierto) return;
      abierto = false; elegir(null); html.classList.remove("editando-ui"); panel.hidden = true; etiquetas.hidden = true; guardar();
      document.removeEventListener("pointerdown", alBajar, true); document.removeEventListener("pointermove", alMover, true); document.removeEventListener("pointerup", alSoltar, true);
      document.removeEventListener("keydown", alTeclear, true); document.removeEventListener("click", alClicar, true); removeEventListener("resize", alRedimensionar);
    },
    restablecer(): void { d = { mov: {}, oculto: [] }; guardar(); aplicar(); if (abierto) { pintaPanel(); requestAnimationFrame(pintaEtiquetas); } },
  };
  return api;
}
