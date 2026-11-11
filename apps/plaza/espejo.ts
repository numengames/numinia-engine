// espejo on the page (mundo-hermes, v0): the card of a mirrored thing and the buttons to ask for its verbs. Loaded by main.ts the first time the server
// answers a `usar` (nothing of it is in the start bundle). Pure black and white, big real buttons (touch and keyboard), Spanish «usted».
//   E (or the prompt) on a thing → (Q or Escape closes it again) → the server answers me alone → this card: what it is, how it is, and ONE BUTTON PER VERB it offers.
//   A verb button asks twice («Pausar» → «¿Seguro? Confirmar»): what changes outside the world always needs a person's yes. Only the second press sends `pedir`.
//   The card then says «Esperando a Hermes…» and, when the answer arrives (or after 30 s, «Hermes no ha respondido»), what happened.
// Everything that comes from outside goes in with `textContent`, never as markup. The server decides who may ask; this only offers.
import type { espejo as Controlador } from "../../features/espejo/client.ts";
import { siguienteZona, zonaDe } from "../../features/espejo/guia.ts";
import { detalleDe, textoEstadoDe, textoFuncion, textoIrA, TEXTO_VERBO } from "../../features/espejo/client.ts";

import { escribiendo } from "./escribiendo.ts";
import { esMovil } from "../../packages/client/src/movil.ts";
import { perfil } from "./perfil-aparato.ts";

type Ctl = typeof Controlador;

/** E opens a thing, Q closes it (the same pair as talking to a person). Pure: does this key press close the open card? */
export const cierraConQ = (e: { code: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, abierta: boolean): boolean =>
  abierta && e.code === "KeyQ" && !e.ctrlKey && !e.metaKey && !e.altKey;

/** Q closes the card while it is open. It listens in the CAPTURE phase and swallows the key, so the microphone toggle on Q (voz.ts) never
 *  sees it: closing a card must never open the microphone (privacy, QA ronda 6). With the card closed the key goes on untouched. */
export function cerrarConQ(d: Pick<Document, "addEventListener">, abierta: () => boolean, cerrar: () => void, escribe: (e: KeyboardEvent) => boolean = escribiendo): void {
  d.addEventListener("keydown", (ev) => {
    const e = ev as KeyboardEvent;
    if (!cierraConQ(e, abierta()) || escribe(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) cerrar();
  }, true);
}

const CSS = `
#espejo-ficha { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 6; box-sizing: border-box; width: min(94vw, 420px); max-height: calc(100vh - 84px - 64px); max-height: calc(100dvh - 84px - 64px); display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; background: #000; color: #fff; border: 2px solid #fff; font: 14px/1.4 "DejaVu Sans Mono", "Courier New", monospace; }
#espejo-ficha[hidden] { display: none; }
#espejo-ficha h2 { margin: 0; font-size: 15px; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; flex: none; }
#espejo-ficha p { margin: 0; overflow-wrap: anywhere; }
#espejo-ficha .estado { font-weight: bold; flex: none; }
#espejo-ficha .detalle { flex: none; max-height: 5.6em; overflow-y: auto; }
#espejo-ficha .cuerpo { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: grid; gap: 6px; align-content: start; overscroll-behavior: contain; }
#espejo-ficha .grupo { display: grid; gap: 4px; }
#espejo-ficha .grupo > b { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; border-bottom: 1px solid #fff; }
#espejo-ficha .grupo > div { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
#espejo-ficha .pie { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
#espejo-ficha button { box-sizing: border-box; min-height: 44px; padding: 2px 6px; background: #000; color: #fff; border: 2px solid #fff; border-radius: 0; font: bold 13px/1.2 "DejaVu Sans Mono", "Courier New", monospace; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
#espejo-ficha button:hover, #espejo-ficha button:focus-visible { background: #fff; color: #000; outline: 3px solid #fff; outline-offset: 2px; }
#espejo-ficha button[data-seguro] { background: #fff; color: #000; grid-column: 1 / -1; }
#espejo-ficha .pie button { text-align: center; }
#espejo-ficha .pie button:only-child { grid-column: 1 / -1; }
#espejo-ficha .dicho { flex: none; border-top: 2px dashed #fff; padding-top: 6px; font-weight: bold; max-height: 4.4em; overflow-y: auto; }
#espejo-ficha .dicho[hidden] { display: none; }
`;

export function montarEspejo(o: { espejo: Ctl; doc?: Document; /** the teleport piece (R-1): `irAPunto` + whether this world allows it */ yo?: () => { x: number; z: number } | null; viaje?: { activo(): boolean; irAPunto(x: number, z: number, nombre: string): { ok: true } | { ok: false; why: string } } }) {
  const d = o.doc ?? document;
  const estilo = d.createElement("style"); estilo.textContent = CSS; d.head.appendChild(estilo);
  const caja = d.createElement("section"); caja.id = "espejo-ficha"; caja.hidden = true; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-label", "Cosa del espejo");
  const titulo = d.createElement("h2"), estado = d.createElement("p"), detalle = d.createElement("p"), cuerpo = d.createElement("div"), pie = d.createElement("div"), dicho = d.createElement("p");
  estado.className = "estado"; detalle.className = "detalle"; cuerpo.className = "cuerpo"; pie.className = "pie"; dicho.className = "dicho"; dicho.hidden = true; dicho.setAttribute("role", "status"); dicho.setAttribute("aria-live", "polite");
  const cerrar = d.createElement("button"); cerrar.type = "button"; cerrar.textContent = esMovil(perfil().clase) ? "Cerrar" : "Cerrar (Q)"; cerrar.setAttribute("aria-keyshortcuts", "Q Escape"); cerrar.dataset.verbo = "cerrar"; cerrar.addEventListener("click", () => ocultar());
  caja.append(titulo, estado, detalle, cuerpo, dicho, pie); d.body.appendChild(caja);

  /** Sit the card just above the page's action bar (`#acciones`, when it is shown) and never taller than the room left under the top bar: it scrolls inside, it never covers the bar nor leaves the screen. */
  const ajustar = (): void => {
    const w = d.defaultView, a = d.getElementById("acciones");
    if (!w) return;
    const r = a && w.getComputedStyle(a).display !== "none" ? a.getBoundingClientRect() : null;
    const abajo = r && r.height > 0 && r.top < w.innerHeight ? Math.max(8, w.innerHeight - r.top + 8) : 84;
    caja.style.bottom = `${abajo}px`; caja.style.maxHeight = `${Math.max(160, w.innerHeight - abajo - 64)}px`;
  };
  d.defaultView?.addEventListener("resize", ajustar);

  let actual = "", seguro = "", esperando = false, visor: { cerrar(): void; estaAbierto(): boolean } | null = null;
  /** Show or hide the card; while it is open the page root carries `ficha-espejo` (the black-and-white theme hides the house action bar and prompt then: the card is the only thing to press). */
  const mostrar = (v: boolean): void => { caja.hidden = !v; d.documentElement.classList.toggle("ficha-espejo", v); };
  const ocultar = () => { mostrar(false); actual = ""; seguro = ""; esperando = false; o.espejo.cerrarFicha(); };
  const decir = (t: string) => { dicho.textContent = t; dicho.hidden = !t; };

  function pintar(): void {
    const c = actual ? o.espejo.cosa(actual) : null;
    if (!c) { if (actual) ocultar(); return; }
    titulo.textContent = c.titulo;
    estado.textContent = `Estado: ${textoEstadoDe(c.tipo, c.estado)}`;
    const lineas = detalleDe(c); detalle.replaceChildren(...lineas.map((t, i) => { const l = d.createElement("span"); l.textContent = t; l.style.display = "block"; if (i > 0) l.style.marginTop = "2px"; return l; })); detalle.hidden = !lineas.length;
    const arriba = cuerpo.scrollTop; // a press repaints the card: keep the place the person had scrolled to
    cuerpo.replaceChildren(); pie.replaceChildren();
    /** A titled group of buttons in two compact columns (created on its first button, so an empty group leaves no heading). */
    const grupos = new Map<string, HTMLElement>();
    const grupo = (nombre: string): HTMLElement => {
      let g = grupos.get(nombre);
      if (!g) { const caja2 = d.createElement("div"), t = d.createElement("b"), filas = d.createElement("div"); caja2.className = "grupo"; t.textContent = nombre; caja2.append(t, filas); cuerpo.appendChild(caja2); g = filas; grupos.set(nombre, g); }
      return g;
    };
    /** One button; the first press asks «¿Seguro?», only the second one does it (what changes the world or outside needs a person's yes). */
    const boton = (en: HTMLElement, id: string, nombre: string, ir: () => { ok: true } | { ok: false; why: string }): void => {
      const b = d.createElement("button"); b.type = "button"; b.dataset.verbo = id;
      if (esperando) { b.disabled = true; b.textContent = nombre; }
      else if (seguro === id) { b.dataset.seguro = "1"; b.textContent = `¿Seguro? Confirmar: ${nombre.toLowerCase()}`; }
      else b.textContent = nombre;
      b.addEventListener("click", () => {
        if (esperando) return;
        if (seguro !== id) { seguro = id; pintar(); cuerpo.querySelector<HTMLButtonElement>(`[data-verbo="${CSS_ESCAPE(id)}"]`)?.focus(); return; }
        seguro = ""; const r = ir();
        if (!r.ok) decir(r.why); else { esperando = true; decir("Pedido enviado."); }
        pintar();
      });
      en.appendChild(b);
    };
    // a document opens HERE (nothing changes outside the world, so there is no request and no «¿Seguro?»): the viewer is its own chunk, fetched on the first press
    if (c.tipo === "documento") {
      const b = d.createElement("button"); b.type = "button"; b.dataset.verbo = "documento.abrir"; b.textContent = "Abrir";
      b.addEventListener("click", () => {
        const origenes = o.espejo.vista()?.documentos?.origenes ?? [];
        void import("./documento.ts").then((m) => {
          const r = m.abrirVisor({ url: c.url, titulo: c.titulo, origenes, doc: d });
          if ("error" in r) { decir(`No se puede abrir: ${r.error}.`); return; }
          ocultar(); visor = r;
        }).catch(() => decir("No se pudo cargar el visor de documentos."));
      });
      grupo("Acciones").appendChild(b);
    }
    for (const v of c.acciones) if (!(c.tipo === "documento" && v === "documento.abrir")) boton(grupo("Acciones"), v, TEXTO_VERBO[v] ?? v, () => o.espejo.pedir(actual, v));
    // the switch panel: one button per function, shown only to who may (the server checks it again and refuses anyone else)
    if (c.tipo === "salud" && o.espejo.interruptor.estado.puede) for (const f of Object.keys(o.espejo.vista()?.funciones ?? {})) {
      const on = o.espejo.interruptor.activa(f);
      boton(grupo("Funciones"), `funcion:${f}`, `${on ? "Apagar" : "Encender"} ${textoFuncion(f)}`, () => o.espejo.interruptor.poner(!on, f));
    }
    // zone teleport: on the threshold's panel, one button per zone (going somewhere changes nothing outside the world: one press, no «¿Seguro?»)
    if (c.tipo === "salud" && o.viaje?.activo()) for (const z of o.espejo.destinos()) {
      const b = d.createElement("button"); b.type = "button"; b.dataset.verbo = `ir:${z.id}`; b.textContent = textoIrA(z.nombre);
      b.addEventListener("click", () => { const r = o.viaje!.irAPunto(z.x, z.z, z.nombre); if (r.ok) ocultar(); else { decir(r.why); pintar(); } });
      grupo("Ir a una zona").appendChild(b);
    }
    // the guide's tour: one button takes the visitor to the next zone of the tour order (she goes along: she follows the visitor)
    if (c.tipo === "salud" && o.viaje?.activo() && o.espejo.interruptor.activa("guia") && o.espejo.vista()?.guia) {
      const v = o.espejo.vista()!, yo = o.yo?.() ?? null, sig = siguienteZona(v.guia!.recorrido, yo ? zonaDe(yo.x, yo.z, v.zonas) : null), z = v.zonas.find((q) => q.id === sig);
      if (z) {
        const b = d.createElement("button"); b.type = "button"; b.dataset.verbo = "ir-con-la-guia"; b.textContent = "Ir con la guía";
        b.addEventListener("click", () => { const r = o.viaje!.irAPunto(z.x, z.z, z.nombre); if (r.ok) ocultar(); else { decir(r.why); pintar(); } });
        grupo("Guía").appendChild(b);
      }
    }
    if (seguro) { const n = d.createElement("button"); n.type = "button"; n.dataset.verbo = "cancelar"; n.textContent = "No, cancelar"; n.addEventListener("click", () => { seguro = ""; pintar(); }); pie.appendChild(n); }
    pie.appendChild(cerrar);
    cuerpo.scrollTop = arriba; ajustar();
  }
  const CSS_ESCAPE = (s: string) => s.replace(/[^a-z0-9._-]/gi, "");

  const abrir = () => {
    const e = o.espejo.estado;
    if (!e.ficha) { if (!caja.hidden) mostrar(false); return; }
    actual = e.ficha.objeto; seguro = ""; esperando = false; decir(""); mostrar(true); pintar();
    (cuerpo.querySelector("button") as HTMLButtonElement | null ?? cerrar).focus();
  };
  const quitar = o.espejo.alCambiar((que, clave) => {
    const e = o.espejo.estado;
    if (que === "ficha") abrir();
    else if (que === "pedido") { decir(e.pedido?.texto ?? ""); }
    else if (que === "resultado" && e.resultado && e.resultado.objeto === actual) { esperando = false; decir((e.resultado.ok ? "Hecho. " : "No se hizo. ") + e.resultado.texto); pintar(); }
    else if (que === "funcion" && !caja.hidden) { esperando = false; decir(e.funcion?.texto ?? ""); pintar(); }
    else if (que === "rechazo" && !caja.hidden) { esperando = false; decir(e.rechazo); pintar(); }
    else if (que === "cosas" && clave === actual && !caja.hidden) pintar(); // the thing changed outside (paused, resumed…): the card follows
  });
  abrir(); // the answer that made main.ts load this file arrived before the card existed: show it now
  d.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !caja.hidden) ocultar(); });
  cerrarConQ(d, () => !caja.hidden, ocultar);
  return { caja, ocultar, estaAbierta: () => !caja.hidden, quitar, visorAbierto: () => !!visor?.estaAbierto() };
}
