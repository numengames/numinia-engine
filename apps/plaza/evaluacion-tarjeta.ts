// P13: the page piece of the end evaluation card of a quest (mision@1 `evaluacion`): the score, then one row per time or counter, in the order the
// world's author chose. It is fetched with the first card that is shown (a quest completed that has `evaluacion`, or «Ver evaluación» in the book), not
// with the first frame: a world without `evaluacion` never downloads it (the start bundle has a cap). misiones.ts imports only the type of this file; what it needs
// from the page (`escribiendo`) comes in through `crearTarjeta`, so this chunk imports nothing that would split a shared chunk off the start bundle.
await import("./evaluacion-estilo.ts").catch(() => null); // the card's look (CSS) is in before this module is; where there is no CSS (the tests under node) it does not matter

type Fila = { tipo: string; etiqueta: string; texto: string; resta: number };
export type Evaluacion = { titulo: string; puntos: number; base: number; minimo: number; resumen: string; filas: Fila[] };
type Hecha = { id: string; titulo: string; evaluacion?: Evaluacion };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, texto = "", clase = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (texto) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
};

/** The line at the foot of the card: where to see it again. */
export const pieDeTarjeta = (tactil: boolean): string => `Puede volver a verla desde el libro de misiones${tactil ? "" : " (J)"}.`; // b: on a touch screen there is no key to name

/** The card in its box (`tarjeta`, a hidden section of the page): «Cerrar» or Escape close it; opened by hand the focus goes to its title, opened by itself it stays
 *  where it was. All text goes in through textContent (a world's words are never HTML). */
export function crearTarjeta(tarjeta: HTMLElement, o: { tactil: boolean; libro(): Hecha[]; escribiendo(e: KeyboardEvent): boolean }) {
  let de = "";
  const titulo = el("h2", "Evaluación"), cerrar = el("button", "Cerrar", "cerrar"), cuerpo = el("div", "", "cuerpo");
  const pintar = () => {
    if (tarjeta.hidden) return;
    const m = o.libro().find((x) => x.id === de), ev = m?.evaluacion;
    if (!m || !ev) { cuerpo.replaceChildren(el("p", "Esta misión no tiene evaluación.")); return; }
    titulo.textContent = ev.titulo;
    const puntos = el("p", "", "puntos"), barra = el("div", "", "barra"), marca = el("i"), dl = el("dl", "", "filas");
    puntos.append(el("span", "Puntuación: ", "solo-lector"), el("span", String(ev.puntos), "num"), el("span", ` de ${ev.base} puntos`, "de"));
    barra.setAttribute("aria-hidden", "true");
    marca.style.width = `${Math.max(0, Math.min(100, ev.base > 0 ? (ev.puntos / ev.base) * 100 : 0))}%`;
    barra.append(marca);
    for (const f of ev.filas) {
      if (!f) continue;
      const fila = el("div", "", `fila ${f.tipo}`), dd = el("dd", f.texto);
      if (f.resta > 0) dd.append(el("span", ` · quita ${f.resta} ${f.resta === 1 ? "punto" : "puntos"}`, "resta"));
      fila.append(el("dt", f.etiqueta), dd);
      dl.append(fila);
    }
    cuerpo.replaceChildren(el("p", m.titulo, "mision"), puntos, barra, dl, el("p", pieDeTarjeta(o.tactil), "pie"));
  };
  const cerrarTarjeta = () => {
    if (tarjeta.hidden) return;
    if (tarjeta.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    tarjeta.hidden = true;
  };
  /** `solo`: the card opens by itself (the quest was just completed): it says its score once to screen readers, in the live region only (#avisos) — the stack of
   *  notices for eyes would repeat the card behind the card. */
  const ver = (id: string, foco: boolean, solo = false) => {
    de = id; tarjeta.hidden = false; pintar();
    if (foco) titulo.focus({ preventScroll: true });
    const ev = o.libro().find((x) => x.id === id)?.evaluacion, caja = document.getElementById("avisos");
    if (solo && ev && caja) {
      const p = el("p", `${ev.titulo}: ${ev.puntos} puntos. ${ev.resumen} La tarjeta de evaluación está abierta${o.tactil ? "." : ": Escape la cierra."}`);
      caja.append(p);
      while (caja.childElementCount > 3) caja.firstElementChild!.remove();
    }
  };
  tarjeta.setAttribute("aria-label", "Evaluación de la misión"); // P13: the box in the page has only `id` and `hidden` (the start bundle has a cap)
  titulo.tabIndex = -1; tarjeta.tabIndex = 0; /* a scrolling box must be reachable by keyboard */ cerrar.type = "button"; cerrar.setAttribute("aria-keyshortcuts", "Escape");
  const cab = el("header", "", "cabeza"); cab.append(titulo, cerrar);
  tarjeta.replaceChildren(cab, cuerpo);
  cerrar.addEventListener("click", cerrarTarjeta);
  tarjeta.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // not a joystick touch
  addEventListener("keydown", (e) => { if (e.code === "Escape" && !tarjeta.hidden && !o.escribiendo(e)) cerrarTarjeta(); });
  return { ver, pintar, cerrar: cerrarTarjeta };
}
