// espejo on the page (mundo-hermes, v0): the card of a mirrored thing and the buttons to ask for its verbs. Loaded by main.ts the first time the server
// answers a `usar` (nothing of it is in the start bundle). Pure black and white, big real buttons (touch and keyboard), Spanish «usted».
//   E (or the prompt) on a thing → the server answers me alone → this card: what it is, how it is, and ONE BUTTON PER VERB it offers.
//   A verb button asks twice («Pausar» → «¿Seguro? Confirmar»): what changes outside the world always needs a person's yes. Only the second press sends `pedir`.
//   The card then says «Esperando a Hermes…» and, when the answer arrives (or after 30 s, «Hermes no ha respondido»), what happened.
// Everything that comes from outside goes in with `textContent`, never as markup. The server decides who may ask; this only offers.
import type { espejo as Controlador } from "../../features/espejo/client.ts";
import { TEXTO_ESTADO, TEXTO_VERBO } from "../../features/espejo/client.ts";

type Ctl = typeof Controlador;

const CSS = `
#espejo-ficha { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 6; width: min(94vw, 420px); padding: 12px 14px; background: #000; color: #fff; border: 2px solid #fff; font: 15px/1.45 "DejaVu Sans Mono", "Courier New", monospace; display: grid; gap: 8px; }
#espejo-ficha[hidden] { display: none; }
#espejo-ficha h2 { margin: 0; font-size: 16px; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; }
#espejo-ficha p { margin: 0; overflow-wrap: anywhere; }
#espejo-ficha .estado { font-weight: bold; }
#espejo-ficha .filas { display: flex; flex-wrap: wrap; gap: 8px; }
#espejo-ficha button { min-height: 48px; padding: 0 14px; background: #000; color: #fff; border: 2px solid #fff; font: bold 15px "DejaVu Sans Mono", "Courier New", monospace; cursor: pointer; }
#espejo-ficha button:hover, #espejo-ficha button:focus-visible { background: #fff; color: #000; outline: 3px solid #fff; outline-offset: 2px; }
#espejo-ficha button[data-seguro] { background: #fff; color: #000; }
#espejo-ficha .dicho { border-top: 2px dashed #fff; padding-top: 8px; font-weight: bold; }
#espejo-ficha .dicho[hidden] { display: none; }
`;

export function montarEspejo(o: { espejo: Ctl; doc?: Document }) {
  const d = o.doc ?? document;
  const estilo = d.createElement("style"); estilo.textContent = CSS; d.head.appendChild(estilo);
  const caja = d.createElement("section"); caja.id = "espejo-ficha"; caja.hidden = true; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-label", "Cosa del espejo");
  const titulo = d.createElement("h2"), estado = d.createElement("p"), detalle = d.createElement("p"), filas = d.createElement("div"), dicho = d.createElement("p");
  estado.className = "estado"; filas.className = "filas"; dicho.className = "dicho"; dicho.hidden = true; dicho.setAttribute("role", "status"); dicho.setAttribute("aria-live", "polite");
  const cerrar = d.createElement("button"); cerrar.type = "button"; cerrar.textContent = "Cerrar"; cerrar.addEventListener("click", () => ocultar());
  caja.append(titulo, estado, detalle, filas, dicho); d.body.appendChild(caja);

  let actual = "", seguro = "", esperando = false;
  const ocultar = () => { caja.hidden = true; actual = ""; seguro = ""; esperando = false; o.espejo.cerrarFicha(); };
  const decir = (t: string) => { dicho.textContent = t; dicho.hidden = !t; };

  function pintar(): void {
    const c = actual ? o.espejo.cosa(actual) : null;
    if (!c) { if (actual) ocultar(); return; }
    titulo.textContent = c.titulo;
    estado.textContent = `Estado: ${TEXTO_ESTADO[c.estado]}`;
    detalle.textContent = c.subtitulo; detalle.hidden = !c.subtitulo;
    filas.replaceChildren();
    for (const v of c.acciones) {
      const b = d.createElement("button"); b.type = "button"; b.dataset.verbo = v;
      const nombre = TEXTO_VERBO[v] ?? v;
      if (esperando) { b.disabled = true; b.textContent = nombre; }
      else if (seguro === v) { b.dataset.seguro = "1"; b.textContent = `¿Seguro? Confirmar: ${nombre.toLowerCase()}`; }
      else b.textContent = nombre;
      b.addEventListener("click", () => {
        if (esperando) return;
        if (seguro !== v) { seguro = v; pintar(); filas.querySelector<HTMLButtonElement>(`[data-verbo="${CSS_ESCAPE(v)}"]`)?.focus(); return; }
        seguro = ""; const r = o.espejo.pedir(actual, v);
        if (!r.ok) decir(r.why); else { esperando = true; decir("Pedido enviado."); }
        pintar();
      });
      filas.appendChild(b);
    }
    if (seguro) { const n = d.createElement("button"); n.type = "button"; n.textContent = "No, cancelar"; n.addEventListener("click", () => { seguro = ""; pintar(); }); filas.appendChild(n); }
    filas.appendChild(cerrar);
  }
  const CSS_ESCAPE = (s: string) => s.replace(/[^a-z0-9._-]/gi, "");

  const abrir = () => {
    const e = o.espejo.estado;
    if (!e.ficha) { if (!caja.hidden) caja.hidden = true; return; }
    actual = e.ficha.objeto; seguro = ""; esperando = false; decir(""); caja.hidden = false; pintar();
    (filas.querySelector("button") as HTMLButtonElement | null)?.focus();
  };
  const quitar = o.espejo.alCambiar((que, clave) => {
    const e = o.espejo.estado;
    if (que === "ficha") abrir();
    else if (que === "pedido") { decir(e.pedido?.texto ?? ""); }
    else if (que === "resultado" && e.resultado && e.resultado.objeto === actual) { esperando = false; decir((e.resultado.ok ? "Hecho. " : "No se hizo. ") + e.resultado.texto); pintar(); }
    else if (que === "rechazo" && !caja.hidden) { esperando = false; decir(e.rechazo); pintar(); }
    else if (que === "cosas" && clave === actual && !caja.hidden) pintar(); // the thing changed outside (paused, resumed…): the card follows
  });
  abrir(); // the answer that made main.ts load this file arrived before the card existed: show it now
  d.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !caja.hidden) ocultar(); });
  return { caja, ocultar, estaAbierta: () => !caja.hidden, quitar };
}
