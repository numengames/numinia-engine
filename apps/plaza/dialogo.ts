// J5 on the page: the conversation box. The person's name, what they say, the answers as real buttons (Tab, Enter,
// a tap, or the digits 1-4 while the box is open) and «Adiós» (Esc). Focus moves to the first answer so a keyboard or
// a screen reader lands in it; the line itself reaches screen readers once, through the engine's announcements (the
// polite #avisos region, V1), so the box does not repeat it. It only asks: features/misiones decides on the server.
import { escribiendo, construyendo } from "./interactuar.ts";

type Res = { ok: true } | { ok: false; why: string };
type Dialogo = { pnj: string; nombre: string; oficio?: string; texto: string; opciones: string[] };
type Ctl = { dialogo(): Dialogo | null; elegir(n: number): Res; adios(): Res; estado: { ultimoRechazo: string }; alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown };
type Vista = { renderer: { domElement: HTMLElement }; cam?: { modo?(): string } };

export function montarDialogo(c: Ctl, caja: HTMLElement, view: Vista): void {
  const nombre = document.createElement("h2"), texto = document.createElement("p"), opciones = document.createElement("div");
  const estado = document.createElement("p"), adios = document.createElement("button");
  nombre.id = "dialogo-nombre"; texto.className = "texto"; opciones.className = "opciones"; estado.className = "estado";
  adios.type = "button"; adios.className = "adios"; adios.textContent = "Adiós (Esc)";
  caja.setAttribute("role", "dialog"); caja.setAttribute("aria-labelledby", "dialogo-nombre");
  caja.append(nombre, texto, opciones, estado, adios);
  caja.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // a tap here is not a joystick touch
  adios.addEventListener("click", () => c.adios());

  let mostrado = "", rechazoVisto = "";
  const pintar = () => {
    const d = c.dialogo();
    if (!d) {
      if (!caja.hidden) { caja.hidden = true; if (caja.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); }
      mostrado = "";
      return;
    }
    if (c.estado.ultimoRechazo !== rechazoVisto) { rechazoVisto = c.estado.ultimoRechazo; estado.textContent = rechazoVisto; }
    const firma = JSON.stringify(d);
    if (firma === mostrado) return;
    mostrado = firma;
    estado.textContent = "";
    nombre.textContent = d.nombre;
    if (d.oficio) { // U14 (4): the person's trade next to the name, smaller (a screen reader hears «Cosimo, Carpintero»)
      const coma = document.createElement("span"), oficio = document.createElement("span");
      coma.className = "solo-lector"; coma.textContent = ", ";
      oficio.className = "oficio"; oficio.textContent = d.oficio;
      oficio.style.cssText = "font-size:.72em;font-weight:500;opacity:.8;margin-left:.6em;text-transform:none;letter-spacing:normal";
      nombre.append(coma, oficio);
    }
    texto.textContent = d.texto;
    opciones.replaceChildren(...d.opciones.map((t, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = `${i + 1}. ${t}`; b.dataset.n = String(i + 1);
      b.addEventListener("click", () => c.elegir(i + 1));
      return b;
    }));
    caja.hidden = false;
    ((opciones.firstElementChild as HTMLElement | null) ?? adios).focus({ preventScroll: true });
  };
  rechazoVisto = c.estado.ultimoRechazo;
  c.alCambiar((que) => { if (que === "dialogo") pintar(); });
  addEventListener("keydown", (e) => {
    if (caja.hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || construyendo(view)) return;
    if (e.code === "Escape") { e.preventDefault(); c.adios(); return; }
    const n = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (n) { e.preventDefault(); c.elegir(Number(n[1])); }
  });
}
