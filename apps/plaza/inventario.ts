// Y1 on the page: the Inventario panel (key R, «Reserva», or the «Inventario» button next to «Misiones»): what you carry (one
// weapon, up to three relics) and your Reserva (the rest; tokens with «× n»), each line with a house icon and a real
// button «Llevar» / «Guardar» where it applies. No drag and drop (that is Y2). Plain accessible HTML, like the book:
// headings, lists, buttons. It is drawn only while open and only when the Reserva changes.
import { crearDialogo, anunciar } from "./paneles.ts";
import { icono } from "./iconos.ts";

type Objeto = { id: string; tipo: "arma" | "reliquia" | "token"; clase: string; nombre: string; icono: string; color: string; valor: number; n: number; portado: boolean };
type Res = { ok: true } | { ok: false; why: string };
type Ctl = { lista(): Objeto[]; resumen(): { objetos: number; portados: number; prestigio: number }; equipar(id: string): Res; desequipar(id: string): Res; estado: { ultimoRechazo: string; ultimoRecibido: string }; alCambiar(fn: () => void): unknown };

/** The house icon of a type when the object brings none (the subset is STD-023's; new glyphs are the Oracle's call). */
export const ICONO_TIPO: Record<Objeto["tipo"], string> = { arma: "crosshair", reliquia: "eye", token: "globe-hemisphere-west" };
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
    const nombre = el("span", o.n > 1 ? `${o.nombre} × ${o.n}` : o.nombre, "nombre");
    const detalle = el("span", o.tipo === "token" ? (o.valor ? `${o.valor * o.n} ${o.valor * o.n === 1 ? "punto" : "puntos"} de Prestigio` : "token") : o.tipo, "detalle");
    li.append(ic, nombre, detalle);
    if (o.tipo !== "token") {
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
    partes.push(...lista("Reserva", todos.filter((o) => !o.portado), "Vacía. Lo que te den en la plaza (una Semilla del Conocimiento al terminar una misión) aparece aquí."));
    panel.cuerpo.replaceChildren(...partes);
  };
  c.alCambiar(() => {
    pintar();
    if (c.estado.ultimoRechazo) { anunciar(c.estado.ultimoRechazo); c.estado.ultimoRechazo = ""; }
  });
  return { abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), pintar };
}
