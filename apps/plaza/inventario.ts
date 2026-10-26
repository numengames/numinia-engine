// Y1 on the page: the Inventario panel (key R, «Reserva», or the «Inventario» button next to «Misiones»): what you carry (one
// weapon, up to three relics) and your Reserva (the rest; tokens with «× n»), each line with a house icon and a real
// button «Llevar» / «Guardar» where it applies. No drag and drop (that is Y2). Plain accessible HTML, like the book:
// headings, lists, buttons. It is drawn only while open and only when the Reserva changes.
// La Bolsa galáctica on the page (key R, or the «Bolsa» button): a classic game inventory — 42 square slots (7 x 6 on a PC, 6
// columns on a phone) with the item's house icon big and centred, rarity as the slot's border and glow, «× n» for a stack, empty
// sockets dim; above them the equipment slots (1 weapon, 3 relics, silhouettes when empty). Pick a slot (click, tap, arrows +
// Enter) for its card — name, type line, worth, «Llevar»/«Guardar» — or hover it on a PC for the tooltip. Weapons and relics
// can also be dragged between the bag and the equipment (pointer events: mouse and touch); the buttons stay the accessible
// path. The server decides the 42 (features/inventario/reglas.ts); the layout maths is bolsa-rejilla.ts. It is drawn only
// while open and only when the Inventario changes; the slot of what just arrived flashes.
import { crearDialogo, anunciar } from "./paneles.ts";
import { icono } from "./iconos.ts";
import { FORMAS_EQUIPO, ICONO_TIPO, SILUETA, accionDe, colorDe, cuentaTexto, destinoDeSoltar, etiquetaHueco, lineaTipo, lineaValor, mover, nombreConCuenta, novedades, plano } from "./bolsa-rejilla.ts";
import type { Objeto, Zona } from "./bolsa-rejilla.ts";
import { crearSoltar, preguntaSoltar } from "./bolsa-soltar.ts";
export { ICONO_TIPO, RAREZA_DE_COLOR, detalleDeCaptura } from "./bolsa-rejilla.ts";

type Res = { ok: true } | { ok: false; why: string };
type Ctl = { lista(): Objeto[]; resumen(): { objetos: number; portados: number; prestigio: number }; equipar(id: string): Res; desequipar(id: string): Res; soltar(id: string, n?: number): Res; estado: { ultimoRechazo: string; ultimoRecibido: string; huecos?: number }; alCambiar(fn: () => void): unknown };

import { resumenTexto } from "./inventario-resumen.ts";
export { resumenTexto, avisarRecibido } from "./inventario-resumen.ts"; // t_45ef2f70: they live apart so the façade can leave this panel out of the start bundle

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, texto = "", clase = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (texto) e.textContent = texto; if (clase) e.className = clase; return e;
};
/** The house icon as an element's content (safe: icono() only returns a house SVG from its fixed table, "" for an unknown name, never the object's text). */
const conIcono = (e: HTMLElement, nombre: string, px: number): void => { e.innerHTML = icono(nombre, px); };

export function montarInventario(c: Ctl, boton: HTMLButtonElement) {
  const panel = crearDialogo({ id: "inventario", titulo: "Bolsa galáctica", tecla: "KeyR", noConstruyendo: true, boton, alAbrir: () => { pintar(true); (rejilla.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus({ preventScroll: true }); } });
  const titulo = panel.dialog.querySelector("h2") as HTMLElement, cuenta = el("span", "", "cuenta");
  titulo.after(cuenta);
  const equipoEl = el("div", "", "equipo"), rejilla = el("div", "", "rejilla"), ficha = el("aside", "", "ficha-objeto"), tip = el("div", "", "bolsa-tip");
  equipoEl.setAttribute("role", "group"); equipoEl.setAttribute("aria-label", "Llevas contigo: un arma y hasta tres reliquias"); equipoEl.dataset.zona = "equipo";
  rejilla.setAttribute("role", "group"); rejilla.dataset.zona = "bolsa";
  ficha.setAttribute("aria-live", "polite"); tip.setAttribute("role", "tooltip"); tip.hidden = true;
  const izq = el("div", "", "bolsa-col"); izq.append(el("h3", "Llevas contigo", "rotulo"), equipoEl, el("h3", "Bolsa", "rotulo"), rejilla);
  const caja = el("div", "", "bolsa"); caja.append(izq, ficha);
  panel.cuerpo.append(caja); panel.dialog.appendChild(tip);

  let firma = "", sel: string | null = null, foco: { zona: Zona; i: number } = { zona: "bolsa", i: 0 }, parpadean = new Set<string>(), arrastrado = false;
  const antes = new Map<string, number>();
  // «Soltar» a weapon or a relic asks first (bolsa-soltar.ts); the question is an inline choice in the card, so it also reads in VR
  const soltar = crearSoltar((id, n) => c.soltar(id, n), anunciar, () => pintar(true));
  let hueco: { zona: Zona; i: number; o: Objeto | null }[] = [];
  const botonDe = (zona: Zona, i: number): HTMLButtonElement | null => (zona === "equipo" ? equipoEl : rejilla).children[i] as HTMLButtonElement | null ?? null;

  const casilla = (zona: Zona, i: number, o: Objeto | null): HTMLButtonElement => {
    const b = el("button", "", `hueco${o ? "" : " vacio"}${zona === "equipo" ? " eq" : ""}${o && parpadean.has(o.id) ? " nuevo" : ""}${o && o.id === sel ? " sel" : ""}`);
    b.type = "button"; b.dataset.zona = zona; b.dataset.i = String(i);
    b.setAttribute("aria-label", etiquetaHueco(o, i, zona)); b.tabIndex = foco.zona === zona && foco.i === i ? 0 : -1;
    if (o) {
      b.dataset.id = o.id; b.style.setProperty("--c", colorDe(o)); b.setAttribute("aria-pressed", String(o.id === sel));
      if (accionDe(o)) b.dataset.arrastrable = "1";
      const ic = el("span", "", "ic"); conIcono(ic, o.icono || ICONO_TIPO[o.tipo], 34); b.appendChild(ic);
      if (o.n > 1) { const n = el("span", `× ${o.n}`, "n"); n.setAttribute("aria-hidden", "true"); b.appendChild(n); }
    } else {
      b.setAttribute("aria-disabled", "true");
      if (zona === "equipo") { const s = el("span", "", "ic silueta"); conIcono(s, SILUETA[FORMAS_EQUIPO[i]], 30); const t = el("span", FORMAS_EQUIPO[i] === "arma" ? "Arma" : "Reliquia", "rot"); b.append(s, t); }
    }
    return b;
  };
  const tarjeta = (): void => {
    const o = hueco.find((h) => h.o?.id === sel)?.o ?? null, r = c.resumen();
    if (!o) {
      ficha.replaceChildren(el("h3", "Elige un objeto"), el("p", r.objetos ? "Pulsa un hueco (o muévete con las flechas y Enter) para verlo. En un ordenador, pasa el ratón por encima." : "Tu Bolsa galáctica está vacía. Lo que te den en la plaza (una Semilla del Conocimiento al terminar una misión, un pez que pesques) aparece aquí.", "vacio"), ...(r.prestigio ? [el("p", resumenTexto(r), "resumen")] : []));
      return;
    }
    const cab = el("div", "", "cab"), gi = el("span", "", "gran"); gi.style.setProperty("--c", colorDe(o)); conIcono(gi, o.icono || ICONO_TIPO[o.tipo], 44);
    const tx = el("div"); tx.append(el("h3", nombreConCuenta(o)), el("p", lineaTipo(o), "tipo")); cab.append(gi, tx);
    const partes: HTMLElement[] = [cab]; const v = lineaValor(o); if (v) partes.push(el("p", v, "valor"));
    const acc = accionDe(o);
    if (acc) {
      const b = el("button", acc, "accion"); b.type = "button"; b.setAttribute("aria-label", `${acc} ${o.nombre}`);
      b.addEventListener("click", () => { const res = o.portado ? c.desequipar(o.id) : c.equipar(o.id); if (!res.ok) anunciar(res.why); });
      partes.push(b);
      const pide = soltar.pendiente?.id === o.id;
      if (pide) {
        const q = el("p", preguntaSoltar(o), "pregunta"), si = el("button", "Sí, soltar", "accion soltar-si"), no = el("button", "Cancelar", "accion soltar-no");
        si.type = "button"; no.type = "button"; si.setAttribute("aria-label", `Sí, soltar ${o.nombre}`); no.setAttribute("aria-label", `Cancelar: conservar ${o.nombre}`);
        si.addEventListener("click", () => { soltar.confirmar(); botonDe(foco.zona, foco.i)?.focus({ preventScroll: true }); });
        no.addEventListener("click", () => { soltar.cancelar(); botonDe(foco.zona, foco.i)?.focus({ preventScroll: true }); });
        const g = el("div", "", "soltar-pregunta"); g.setAttribute("role", "group"); g.setAttribute("aria-label", `Confirmar soltar ${o.nombre}`); g.append(q, si, no);
        partes.push(g);
      } else {
        const bs = el("button", "Soltar", "accion soltar"); bs.type = "button"; bs.setAttribute("aria-label", `Soltar ${o.nombre}`);
        bs.addEventListener("click", () => { if (soltar.pedir(o) === "pregunta") ficha.querySelector<HTMLElement>(".soltar-no")?.focus({ preventScroll: true }); }); // the safe answer has the focus
        partes.push(bs);
      }
    }
    ficha.replaceChildren(...partes);
  };
  const pintar = (fuerza = false) => {
    if (!panel.abierto) return;
    const todos = c.lista(), f = JSON.stringify(todos) + String(sel);
    if (!fuerza && f === firma) return;
    firma = f;
    const p = plano(todos, c.estado.huecos || undefined);
    if (sel && !todos.some((o) => o.id === sel)) sel = null;
    if (soltar.pendiente && !todos.some((o) => o.id === soltar.pendiente!.id)) soltar.cancelar(true); // it is gone already: nothing left to ask about
    const tenia = panel.dialog.contains(document.activeElement) && (document.activeElement as HTMLElement).classList.contains("hueco");
    hueco = [...p.equipo.map((o, i) => ({ zona: "equipo" as Zona, i, o })), ...p.bolsa.map((o, i) => ({ zona: "bolsa" as Zona, i, o }))];
    equipoEl.replaceChildren(...p.equipo.map((o, i) => casilla("equipo", i, o)));
    rejilla.replaceChildren(...p.bolsa.map((o, i) => casilla("bolsa", i, o)));
    rejilla.setAttribute("aria-label", `Bolsa galáctica: ${p.ocupados} de ${p.huecos} huecos ocupados`);
    cuenta.textContent = cuentaTexto(p); cuenta.classList.toggle("llena", p.llena); cuenta.setAttribute("aria-label", `${p.ocupados} de ${p.huecos} huecos`);
    rejilla.style.setProperty("--huecos", String(p.huecos));
    tarjeta();
    parpadean = new Set();
    if (tenia) botonDe(foco.zona, foco.i)?.focus({ preventScroll: true });
  };

  // ── choose, move, hover ──
  const elegir = (zona: Zona, i: number) => {
    foco = { zona, i };
    const o = hueco.find((h) => h.zona === zona && h.i === i)?.o ?? null;
    sel = o ? o.id : null;
    if (soltar.pendiente && soltar.pendiente.id !== sel) soltar.cancelar(true); // another object chosen: the question lapses, nothing was sent
    pintar(true);
    botonDe(zona, i)?.focus({ preventScroll: true });
  };
  const columnas = () => Math.max(1, getComputedStyle(rejilla).gridTemplateColumns.split(" ").filter(Boolean).length);
  panel.cuerpo.addEventListener("click", (e) => {
    if (arrastrado) return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.hueco"); if (!b) return;
    elegir(b.dataset.zona as Zona, Number(b.dataset.i));
  });
  panel.cuerpo.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.hueco"); if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = mover(b.dataset.zona as Zona, Number(b.dataset.i), e.key, columnas(), c.estado.huecos || undefined);
    if (!a) return;
    e.preventDefault();
    const viejo = botonDe(foco.zona, foco.i); if (viejo) viejo.tabIndex = -1;
    foco = a; const nuevo = botonDe(a.zona, a.i); if (nuevo) { nuevo.tabIndex = 0; nuevo.focus({ preventScroll: false }); }
  });
  const mostrarTip = (b: HTMLElement) => {
    const h = hueco.find((x) => x.zona === b.dataset.zona && x.i === Number(b.dataset.i)); if (!h?.o) { tip.hidden = true; return; }
    tip.replaceChildren(el("strong", nombreConCuenta(h.o)), el("span", lineaTipo(h.o))); tip.style.setProperty("--c", colorDe(h.o)); tip.hidden = false;
    const r = b.getBoundingClientRect(), d = panel.dialog.getBoundingClientRect();
    tip.style.left = `${Math.round(Math.max(4, Math.min(d.width - tip.offsetWidth - 4, r.left - d.left + r.width / 2 - tip.offsetWidth / 2)))}px`;
    tip.style.top = `${Math.round(Math.max(4, r.top - d.top - tip.offsetHeight - 6))}px`;
  };
  panel.cuerpo.addEventListener("pointerover", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("button.hueco"); if (b && e.pointerType === "mouse" && !arrastrando) mostrarTip(b); else if (!b) tip.hidden = true; });
  panel.cuerpo.addEventListener("pointerleave", () => { tip.hidden = true; });
  panel.dialog.addEventListener("close", () => { tip.hidden = true; soltar.cancelar(true); });
  panel.dialog.addEventListener("cancel", (e) => { if (soltar.pendiente) { e.preventDefault(); soltar.cancelar(); botonDe(foco.zona, foco.i)?.focus({ preventScroll: true }); } }); // Esc answers «Cancelar» first, then closes the panel

  // ── drag and drop (small): weapons and relics between the bag and the equipment; mouse and touch (pointer events) ──
  let arrastrando: { o: Objeto; fantasma: HTMLElement; x0: number; y0: number; origen: HTMLElement; vivo: boolean } | null = null;
  const zonaEn = (x: number, y: number): Zona | null => (document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-zona]")?.dataset.zona as Zona | undefined) ?? null;
  panel.cuerpo.addEventListener("pointerdown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button.hueco[data-arrastrable]"); if (!b || (e.pointerType === "mouse" && e.button !== 0)) return;
    const o = hueco.find((h) => h.o?.id === b.dataset.id)?.o; if (!o) return;
    arrastrando = { o, fantasma: el("div", "", "bolsa-fantasma"), x0: e.clientX, y0: e.clientY, origen: b, vivo: false };
    arrastrando.fantasma.style.setProperty("--c", colorDe(o)); conIcono(arrastrando.fantasma, o.icono || ICONO_TIPO[o.tipo], 36);
    try { b.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
  });
  panel.cuerpo.addEventListener("pointermove", (e) => {
    const a = arrastrando; if (!a) return;
    if (!a.vivo) { if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 8) return; a.vivo = true; tip.hidden = true; a.origen.classList.add("arrastrando"); document.body.appendChild(a.fantasma); }
    a.fantasma.style.left = `${e.clientX}px`; a.fantasma.style.top = `${e.clientY}px`;
    const z = zonaEn(e.clientX, e.clientY), d = destinoDeSoltar(a.o, z);
    equipoEl.classList.toggle("destino", d === "equipar"); rejilla.classList.toggle("destino", d === "desequipar");
  });
  const soltarDrag = (e: PointerEvent, cancelado: boolean) => {
    const a = arrastrando; arrastrando = null; if (!a) return;
    a.fantasma.remove(); a.origen.classList.remove("arrastrando"); equipoEl.classList.remove("destino"); rejilla.classList.remove("destino");
    if (!a.vivo) return;
    arrastrado = true; setTimeout(() => { arrastrado = false; }, 0); // the click that follows a drag is not a choice
    const d = cancelado ? null : destinoDeSoltar(a.o, zonaEn(e.clientX, e.clientY));
    if (d) { const r = d === "equipar" ? c.equipar(a.o.id) : c.desequipar(a.o.id); if (!r.ok) anunciar(r.why); }
  };
  panel.cuerpo.addEventListener("pointerup", (e) => soltarDrag(e, false));
  panel.cuerpo.addEventListener("pointercancel", (e) => soltarDrag(e, true));

  c.alCambiar(() => {
    const nuevos = novedades(antes, c.lista());
    if (panel.abierto) parpadean = nuevos; // the slot of what just arrived flashes (not when the panel only opens)
    pintar();
    if (c.estado.ultimoRechazo) { anunciar(c.estado.ultimoRechazo); c.estado.ultimoRechazo = ""; }
  });
  novedades(antes, c.lista());
  return { abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), pintar };
}
