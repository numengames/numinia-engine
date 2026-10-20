// condiciones/c3 — the bubble of entry on a flat screen (PC and phone). When the server says «puerta: true, abierta: false»
// (condiciones-estado@1, condiciones/c2) the person is inside a bubble: the world stays behind, blurred and darkened (CSS
// backdrop-filter on one overlay: no GPU post-processing, cheap on a phone), and a panel asks, step by step, for what the
// world needs: one page per layer of norms (the house, then the community), then «Tus datos · entras igual digas sí o no».
//   · the norms close the door; the data permissions never do (EDPB 05/2020 §39): their boxes start EMPTY and the two buttons
//     that finish are the same size and colour (the decisions are in condiciones-logica.ts, tested);
//   · it cannot be closed: no Escape, no click outside, no key reaches the world while it is up; Tab stays inside the panel
//     (role=dialog, aria-modal, the rest of the page `inert`); «Salir» is the only way out besides accepting;
//   · accepting sends ACEPTAR; when the server answers `abierta: true` the bubble bursts (a short animation) and you walk.
// The gate itself is the server's (c2): this is only the face of it. With the gate off the server sends nothing by itself and
// this file does nothing at all (no element, no listener on keys). The text comes from the world's file (titles and all):
// no brand here. c4 (VR) and c5 (the bubble seen from outside) read `estado` and call the same methods.
import type { CondicionesCapa, CondicionesMensaje, CondicionesPunto } from "../../packages/net/src/index.ts";
import { aceptacion, marcasVacias, pideBurbuja, planificar, porcentajeLeido, puedeSeguir, ROTULO_TODO, rotuloSinOpcional, todoMarcado } from "./condiciones-logica.ts";
import type { Marcas, Paso } from "./condiciones-logica.ts";

type Sesion = {
  condiciones: CondicionesMensaje | null;
  onCondiciones: ((m: CondicionesMensaje) => void) | null;
  entity: number;
  aceptar(versiones: Record<string, string>, datos?: string[]): boolean;
  pedirCondiciones(): boolean;
};

export type OpcionesCondiciones = {
  session: Sesion;
  /** the world's name, for the eyebrow («Antes de entrar · …»); read when the panel draws */
  mundo(): string;
  /** a message for screen readers that must outlive the bubble (the page's live region) */
  decir?(t: string): void;
  /** the city's address when the world has one (mundo.ajustes.json `ciudadUrl`): «Salir» goes there */
  ciudadUrl?(): string | null;
  /** closes the connection when someone leaves through «Salir» */
  cerrarConexion?(): void;
  /** a phone-class interface (the page's profile); a narrow window counts as one too */
  movil?(): boolean;
  /** time budget, for tests */
  esperaMs?: number;
};

const ESPERA_RESPUESTA_MS = 5000;
const DURACION_ESTALLIDO_MS = 650;

const CSS = `
#condiciones { position: fixed; inset: 0; z-index: 45; display: block; font: 15px/1.5 "Geist", system-ui, sans-serif; color: var(--n-texto, #F9EBDC);
  -webkit-backdrop-filter: blur(7px) saturate(.85) brightness(.75); backdrop-filter: blur(7px) saturate(.85) brightness(.75); touch-action: none; }
#condiciones.movil { -webkit-backdrop-filter: blur(5px) saturate(.85) brightness(.7); backdrop-filter: blur(5px) saturate(.85) brightness(.7); }
#condiciones * { box-sizing: border-box; }
#condiciones .cond-pompa { position: absolute; inset: 0; pointer-events: none; transform-origin: 50% 52%;
  background: radial-gradient(ellipse 62% 78% at 50% 52%, rgba(20,17,15,.10) 0%, rgba(20,17,15,.35) 62%, rgba(1,142,161,.20) 76%, rgba(166,218,213,.38) 80%, rgba(20,17,15,.82) 84%, rgba(12,10,9,.92) 100%); }
#condiciones .cond-pompa::before { content: ""; position: absolute; left: 50%; top: 52%; width: 124%; height: 156%; transform: translate(-50%, -50%); border-radius: 50%;
  border: 1.5px solid rgba(166,218,213,.35); box-shadow: 0 0 40px rgba(166,218,213,.20) inset, 0 0 80px rgba(1,142,161,.18); }
#condiciones .cond-brillo { position: absolute; left: 18%; top: 9%; width: 22%; height: 9%; border-radius: 50%; transform: rotate(-14deg); pointer-events: none;
  background: radial-gradient(ellipse, rgba(255,255,255,.18), transparent 70%); }
#condiciones.movil .cond-pompa { background: radial-gradient(ellipse 80% 70% at 50% 40%, rgba(20,17,15,.10) 0%, rgba(20,17,15,.35) 60%, rgba(1,142,161,.20) 76%, rgba(166,218,213,.34) 82%, rgba(20,17,15,.80) 88%, rgba(12,10,9,.92) 100%); }
#condiciones.movil .cond-pompa::before { width: 112%; height: 120%; top: 45%; }
#condiciones .cond-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(880px, calc(100vw - 32px)); height: min(560px, calc(100vh - 32px));
  display: flex; flex-direction: column; overflow: hidden; background: rgba(20,17,15,.93); border: 1px solid rgba(154,140,124,.28); border-radius: 10px; box-shadow: 0 24px 60px rgba(0,0,0,.5); touch-action: pan-y; }
#condiciones .cab { padding: 16px 22px 12px; border-bottom: 1px solid rgba(154,140,124,.18); flex: none; }
#condiciones .etq { font: 600 11px "Geist Mono", ui-monospace, monospace; letter-spacing: .15em; text-transform: uppercase; color: var(--n-verdemar, #A6DAD5); }
#condiciones h1 { margin: 4px 0 2px; font: 650 22px/1.2 "Geist", system-ui, sans-serif; letter-spacing: -.01em; color: var(--n-texto, #F9EBDC); }
#condiciones h1:focus { outline: none; }
#condiciones .sub { margin: 0; color: var(--n-texto2, #C4B5A6); font-size: 13px; }
#condiciones .pasos { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
#condiciones .paso { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; border: 1px solid #3A332D; color: var(--n-texto2, #C4B5A6); font-size: 13px; }
#condiciones .paso b { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font: 600 11px "Geist Mono", ui-monospace, monospace; background: #292420; color: var(--n-texto2, #C4B5A6); }
#condiciones .paso.activo { border-color: #018EA1; color: var(--n-texto, #F9EBDC); background: rgba(1,142,161,.12); }
#condiciones .paso.activo b { background: #018EA1; color: #fff; }
#condiciones .paso.hecho b { background: var(--n-verdemar, #A6DAD5); color: #14110F; }
#condiciones .cuerpo { flex: 1; min-height: 0; overflow: auto; padding: 14px 22px; display: flex; flex-direction: column; }
#condiciones .filas { display: flex; gap: 20px; flex: 1; }
#condiciones .col { flex: 1; min-width: 0; }
#condiciones .esencial { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
#condiciones .esencial li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
#condiciones .esencial li i { flex: none; width: 22px; height: 22px; border-radius: 6px; background: #292420; border: 1px solid #3A332D; display: grid; place-items: center; font: 600 11px "Geist Mono", ui-monospace, monospace; font-style: normal; color: var(--n-verdemar, #A6DAD5); }
#condiciones .texto { margin-top: 8px; border: 1px solid #3A332D; border-radius: 8px; background: rgba(30,26,23,.7); padding: 10px 12px; font-size: 12.5px; color: var(--n-texto2, #C4B5A6); height: 128px; overflow: auto; overscroll-behavior: contain; white-space: pre-line; }
#condiciones .texto:focus-visible, #condiciones button:focus-visible, #condiciones input:focus-visible + .caja-etq, #condiciones a:focus-visible { outline: 3px solid #ffd27a; outline-offset: 2px; }
#condiciones .texto h2 { margin: 10px 0 2px; font: 600 12.5px "Geist", system-ui, sans-serif; color: var(--n-texto, #F9EBDC); }
#condiciones .texto h2:first-child { margin-top: 0; }
#condiciones .texto p { margin: 0; }
#condiciones .lectura { height: 4px; border-radius: 2px; background: #3A332D; margin-top: 8px; overflow: hidden; }
#condiciones .lectura span { display: block; height: 100%; width: 0; background: var(--n-verdemar, #A6DAD5); transition: width .15s ease; }
#condiciones .lectura-pie { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #9A8C7C; margin-top: 4px; }
#condiciones .leer-mas { display: none; margin-top: 10px; background: none; border: 0; padding: 4px 0; color: var(--n-verdemar, #A6DAD5); font: inherit; font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
#condiciones .caja-etq { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 8px; font-size: 13.5px; cursor: pointer; }
#condiciones .oblig { margin-top: 12px; background: rgba(239,165,23,.10); border: 1px solid rgba(239,165,23,.35); }
#condiciones .oblig em { margin-left: auto; font: 600 11px "Geist Mono", ui-monospace, monospace; font-style: normal; color: var(--n-ambar, #EFA517); letter-spacing: .06em; }
#condiciones input[type="checkbox"] { flex: none; width: 18px; height: 18px; margin: 0; accent-color: #018EA1; cursor: pointer; }
#condiciones .ejemplo { color: var(--n-ambar, #EFA517); font: 11px "Geist Mono", ui-monospace, monospace; letter-spacing: .06em; }
#condiciones .permisos { display: flex; flex-direction: column; gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
#condiciones .permiso { border: 1px solid #3A332D; border-radius: 8px; background: rgba(30,26,23,.6); }
#condiciones .permiso .caja-etq { align-items: flex-start; padding: 9px 10px; }
#condiciones .permiso b { display: block; font-weight: 500; font-size: 14px; color: var(--n-texto, #F9EBDC); }
#condiciones .permiso small { display: block; color: #9A8C7C; font-size: 12px; white-space: pre-line; }
#condiciones .nota-datos { margin: 10px 0 0; color: #9A8C7C; font-size: 12px; }
#condiciones .aviso { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: rgba(211,52,64,.14); border: 1px solid rgba(211,52,64,.45); font-size: 13px; }
#condiciones .aviso:empty { display: none; }
#condiciones .pie { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 22px; border-top: 1px solid rgba(154,140,124,.18); background: rgba(30,26,23,.7); }
#condiciones .ver { color: #9A8C7C; font: 12px "Geist Mono", ui-monospace, monospace; display: flex; flex-wrap: wrap; gap: 2px 12px; }
#condiciones .ver .otra { opacity: .8; }
#condiciones .der { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
#condiciones .btn { border-radius: 7px; padding: 9px 16px; font: 600 14px "Geist", system-ui, sans-serif; border: 1px solid #3A332D; background: none; color: var(--n-texto, #F9EBDC); cursor: pointer; }
#condiciones .btn.prim { background: #F3E6D6; color: #14110F; border-color: #F3E6D6; }
#condiciones .btn:disabled { opacity: .4; cursor: not-allowed; }
#condiciones .btn:not(:disabled):hover { border-color: var(--n-texto2, #C4B5A6); }
#condiciones .decision { min-width: 190px; text-align: center; }
#condiciones .despedida { margin: auto; text-align: center; max-width: 420px; }
#condiciones .despedida h1 { font-size: 20px; }
#condiciones .solo-lector { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* phone, upright: the panel takes almost the whole screen (maqueta 4) */
#condiciones.movil .cond-panel { left: 10px; right: 10px; bottom: 10px; top: 56px; width: auto; height: auto; transform: none; border-radius: 18px; }
#condiciones.movil .cab { padding: 14px 16px 10px; }
#condiciones.movil h1 { font-size: 20px; }
#condiciones.movil .pasos { display: none; }
#condiciones.movil .cuerpo { padding: 12px 16px; }
#condiciones.movil .filas { flex-direction: column; gap: 10px; }
#condiciones.movil .esencial li { font-size: 13.5px; }
#condiciones.movil .leer-mas { display: inline-block; }
#condiciones.movil .texto { height: 200px; }
#condiciones.movil .pie { flex-wrap: wrap; padding: 12px 16px; }
#condiciones.movil .ver .otra { display: none; }
#condiciones.movil .ver { width: 100%; }
#condiciones.movil .der { width: 100%; margin: 0; justify-content: stretch; }
#condiciones.movil .der .btn { flex: 1 1 0; padding: 13px 10px; min-width: 0; }
#condiciones.movil .der .decision { flex: 1 1 100%; min-width: 0; }
#condiciones.movil .der .secundario { flex: 1 1 0; }
#condiciones.movil[data-paso="datos"] .ver .otra { display: inline; }
/* the burst: the bubble swells and goes, the world comes back sharp */
#condiciones.estallando { pointer-events: none; transition: backdrop-filter ${DURACION_ESTALLIDO_MS}ms ease, -webkit-backdrop-filter ${DURACION_ESTALLIDO_MS}ms ease; -webkit-backdrop-filter: blur(0) saturate(1) brightness(1); backdrop-filter: blur(0) saturate(1) brightness(1); }
#condiciones.estallando .cond-pompa { transition: transform ${DURACION_ESTALLIDO_MS}ms cubic-bezier(.2,.7,.3,1), opacity ${DURACION_ESTALLIDO_MS}ms ease; transform: scale(1.35); opacity: 0; }
#condiciones.estallando .cond-brillo { transition: opacity ${DURACION_ESTALLIDO_MS / 2}ms ease; opacity: 0; }
#condiciones.estallando .cond-panel { transition: opacity ${DURACION_ESTALLIDO_MS * 0.6}ms ease, transform ${DURACION_ESTALLIDO_MS}ms ease; opacity: 0; }
#condiciones:not(.movil).estallando .cond-panel { transform: translate(-50%, -54%) scale(.98); }
@media (prefers-reduced-motion: reduce) { #condiciones.estallando, #condiciones.estallando * { transition-duration: 1ms !important; } }
@media (prefers-reduced-transparency: reduce) { #condiciones { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(12,10,9,.7); } }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, clase = "", texto = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto) e.textContent = texto;
  return e;
};

export function montarCondiciones(o: OpcionesCondiciones) {
  const s = o.session;
  let estilo: HTMLStyleElement | null = null; // made with the bubble, never before: a world with the gate off touches the page not at all
  let raiz: HTMLElement | null = null;
  let filas: HTMLElement | null = null;
  let panel: HTMLElement | null = null, titulo: HTMLElement | null = null, cuerpo: HTMLElement | null = null, pie: HTMLElement | null = null, cab: HTMLElement | null = null;
  let aviso: HTMLElement | null = null, anuncio: HTMLElement | null = null;
  let pasos: Paso[] = [], capas: CondicionesCapa[] = [], firma = "";
  let marcas: Marcas = marcasVacias();
  let i = 0, enviando = false, saliendo = false, estallando = false, textoAbierto = true;
  let espera: ReturnType<typeof setTimeout> | null = null, fin: ReturnType<typeof setTimeout> | null = null;
  let devolver: Element | null = null;
  const inertes: HTMLElement[] = [];
  const cambios: Array<() => void> = [];
  const decir = (t: string, aLaPagina = false) => { if (anuncio) anuncio.textContent = t; if (aLaPagina) o.decir?.(t); }; // the panel's own live region; the page's one only for what is said as the bubble goes
  const movil = () => (o.movil?.() ?? false) || matchMedia("(max-width: 640px)").matches;

  const estado = {
    /** the bubble is up: the world is closed to this person (c4 reads it to show the panel in VR) */
    get activa(): boolean { return !!raiz && !estallando; },
    get paso(): number { return i; },
    get pasos(): Paso[] { return pasos; },
    get marcas(): Marcas { return marcas; },
    get enviando(): boolean { return enviando; },
  };
  const avisarCambio = () => { for (const f of cambios) try { f(); } catch { /* an observer never breaks the panel */ } };

  // ---------- the keyboard: nothing reaches the world while the bubble is up; Tab stays inside; Escape does nothing ----------
  const guardiaTeclas = (e: KeyboardEvent) => {
    if (!raiz) return;
    if (raiz.contains(e.target as Node)) return; // keys typed in the panel are handled by the panel
    e.preventDefault(); e.stopImmediatePropagation(); // W, Space, Enter (the chat), E… belong to nobody but the panel
    if (panel && !panel.contains(document.activeElement)) titulo?.focus({ preventScroll: true });
  };
  const teclasDelPanel = (e: KeyboardEvent) => {
    e.stopPropagation(); // not to the page's own key listeners (the chat opens with Enter)
    if (e.key === "Escape") { e.preventDefault(); return; } // the bubble does not close with Escape
    if (e.key !== "Tab" || !panel) return;
    const foco = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"], a[href]')].filter((x) => x.offsetParent !== null);
    if (!foco.length) { e.preventDefault(); titulo?.focus(); return; }
    const primero = foco[0], ultimo = foco[foco.length - 1], ya = document.activeElement;
    if (e.shiftKey && (ya === primero || ya === titulo)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && ya === ultimo) { e.preventDefault(); primero.focus(); }
  };
  const guardiaFoco = (e: FocusEvent) => { if (raiz && !raiz.contains(e.target as Node)) titulo?.focus({ preventScroll: true }); };

  // ---------- drawing ----------
  const hayDatos = () => pasos.some((p) => p.tipo === "datos");
  const ultimo = () => i >= pasos.length - 1;
  const textos = (a: Paso) => (a.tipo === "capa" ? a.normas : a.permisos.map((x) => x.punto));

  function cabecera(p: Paso): void {
    const mundo = o.mundo();
    cab!.replaceChildren();
    cab!.append(el("div", "etq", mundo ? `Antes de entrar · ${mundo}` : "Antes de entrar"));
    titulo = el("h1"); titulo.id = "condiciones-titulo"; titulo.tabIndex = -1;
    const sub = el("p", "sub"); sub.id = "condiciones-sub";
    if (p.tipo === "datos") { titulo.textContent = "Lo que tú eliges"; sub.textContent = "Esto es opcional: entras igual digas sí o no. Ninguna casilla sale marcada."; }
    else if (p.capa === "casa") { titulo.textContent = "Las normas de este sitio"; sub.textContent = "Mientras no aceptes estás en esta burbuja: ves el mundo, pero nadie te oye y no puedes tocar nada."; }
    else {
      const propio = capas.find((c) => c.capa === p.capa)?.nombre;
      titulo.textContent = propio ? `Las normas de ${propio}` : "Las normas de la comunidad";
      sub.textContent = `${propio ?? "La comunidad"} añade estas normas a las anteriores. No pueden quitar nada de ellas.`;
    }
    cab!.append(titulo, sub);
    const lista = el("ol", "pasos"); lista.setAttribute("aria-label", "Pasos");
    pasos.forEach((x, k) => {
      const li = el("li", `paso${k === i ? " activo" : ""}${k < i ? " hecho" : ""}`);
      if (k === i) li.setAttribute("aria-current", "step");
      const n = el("b", "", k < i ? "✓" : String(k + 1)); n.setAttribute("aria-hidden", "true");
      li.append(n, document.createTextNode(x.tipo === "capa" ? x.nombre : "Lo que tú eliges"));
      lista.append(li);
    });
    cab!.append(lista);
    panel!.setAttribute("aria-labelledby", "condiciones-titulo"); panel!.setAttribute("aria-describedby", "condiciones-sub");
  }

  function caja(texto: string, marcada: boolean, alCambiar: (v: boolean) => void, clase: string): { fila: HTMLLabelElement; input: HTMLInputElement; zona: HTMLSpanElement } {
    const fila = el("label", `caja-etq ${clase}`.trim());
    const input = el("input"); input.type = "checkbox"; input.checked = marcada;
    const zona = el("span"); zona.textContent = texto;
    input.addEventListener("change", () => alCambiar(input.checked));
    fila.append(input, zona);
    return { fila, input, zona };
  }

  function paginaDeCapa(p: Extract<Paso, { tipo: "capa" }>): void {
    const izq = el("div", "col"), der = el("div", "col");
    izq.append(el("div", "etq", "Lo esencial"));
    const ul = el("ul", "esencial");
    p.normas.forEach((n, k) => { const li = el("li"); const ic = el("i", "", String(k + 1)); ic.setAttribute("aria-hidden", "true"); li.append(ic, document.createTextNode(n.titulo)); ul.append(li); });
    izq.append(ul);
    der.append(el("div", "etq", "El texto entero"));
    const leer = el("button", "leer-mas"); leer.type = "button"; leer.setAttribute("aria-expanded", String(textoAbierto)); leer.setAttribute("aria-controls", "condiciones-texto");
    leer.textContent = textoAbierto ? "Ocultar el texto entero" : "Leer el texto entero";
    const texto = el("div", "texto"); texto.id = "condiciones-texto"; texto.tabIndex = 0; texto.setAttribute("role", "region"); texto.setAttribute("aria-label", `Texto entero · ${p.nombre} · versión ${p.version}`);
    for (const n of p.normas) { texto.append(el("h2", "", n.titulo), el("p", "", n.texto)); }
    texto.hidden = !textoAbierto;
    const barra = el("div", "lectura"); const llena = el("span"); barra.append(llena); barra.setAttribute("aria-hidden", "true");
    const pieLectura = el("div", "lectura-pie"); const leido = el("span"); const ayuda = el("span", "", "Rueda o arrastra para leer"); pieLectura.append(leido, ayuda);
    pieLectura.hidden = barra.hidden = !textoAbierto;
    const medir = () => { const n = porcentajeLeido(texto.scrollTop, texto.clientHeight, texto.scrollHeight); llena.style.width = `${n}%`; leido.textContent = `Has leído un ${n} %`; };
    texto.addEventListener("scroll", medir, { passive: true });
    leer.addEventListener("click", () => {
      textoAbierto = !textoAbierto; texto.hidden = barra.hidden = pieLectura.hidden = !textoAbierto;
      leer.setAttribute("aria-expanded", String(textoAbierto)); leer.textContent = textoAbierto ? "Ocultar el texto entero" : "Leer el texto entero"; medir();
    });
    der.append(leer, texto, barra, pieLectura);
    if (p.exige) {
      const c = caja(`He leído y acepto las normas${p.capa === "casa" ? "" : ` de ${capas.find((x) => x.capa === p.capa)?.nombre ?? "la comunidad"}`}`, marcas.normas[p.capa] === true, (v) => { marcas.normas[p.capa] = v; limpiarAviso(); pintarPie(); avisarCambio(); }, "oblig");
      c.input.id = `condiciones-ok-${p.capa}`;
      const obl = el("em", "", "Obligatorio"); c.fila.append(obl);
      der.append(c.fila);
    }
    filas!.append(izq, der);
    queueMicrotask(medir);
  }

  function paginaDeDatos(p: Extract<Paso, { tipo: "datos" }>): void {
    const col = el("div", "col");
    col.append(el("div", "etq", "Tus datos · entras igual digas sí o no"));
    const ul = el("ul", "permisos");
    for (const { punto } of p.permisos) {
      const li = el("li", "permiso");
      const c = caja(punto.titulo, marcas.datos.has(punto.id), (v) => { if (v) marcas.datos.add(punto.id); else marcas.datos.delete(punto.id); limpiarAviso(); pintarPie(); avisarCambio(); }, "");
      c.input.dataset.punto = punto.id; c.zona.textContent = "";
      const b = el("b", "", punto.titulo), pequena = el("small", "", punto.texto);
      c.zona.append(b, pequena);
      li.append(c.fila); ul.append(li);
    }
    col.append(ul, el("p", "nota-datos", "Ninguna sale marcada."));
    filas!.append(col);
  }

  function pintarPie(): void {
    const p = pasos[i]; if (!p || !pie) return;
    pie.replaceChildren();
    const ver = el("div", "ver");
    for (const x of pasos) if (x.tipo === "capa") ver.append(el("span", x === p ? "actual" : "otra", `${x.nombre} · v${x.version}`));
    const der = el("div", "der");
    const btn = (texto: string, clase: string, alPulsar: () => void, id: string, desactivado = false): HTMLButtonElement => {
      const b = el("button", `btn ${clase}`.trim(), texto); b.type = "button"; b.id = id; b.disabled = desactivado || enviando || saliendo; b.addEventListener("click", alPulsar); return b;
    };
    if (i > 0) der.append(btn("← Atrás", "secundario", () => ir(i - 1), "condiciones-atras"));
    der.append(btn("Salir", "secundario", salir, "condiciones-salir", false));
    if (!ultimo()) der.append(btn("Siguiente →", "prim", () => ir(i + 1), "condiciones-siguiente", !puedeSeguir(p, marcas)));
    else if (hayDatos() && p.tipo === "datos") {
      // the same size and the same colour (AEPD: refusing is as easy as accepting)
      der.append(btn(rotuloSinOpcional(marcas.datos.size), "prim decision", () => enviar("marcadas"), "condiciones-sin-opcional", !todoMarcado(pasos, marcas)));
      der.append(btn(ROTULO_TODO, "prim decision", () => enviar("todo"), "condiciones-todo", !todoMarcado(pasos, marcas)));
    } else der.append(btn("Aceptar y entrar", "prim", () => enviar("ninguna"), "condiciones-aceptar", !puedeSeguir(p, marcas)));
    pie.append(ver, der);
    if (p.tipo === "capa" && p.exige && !puedeSeguir(p, marcas)) { const ayuda = el("span", "solo-lector", "Marca la casilla de aceptar para seguir."); ayuda.id = "condiciones-ayuda"; pie.append(ayuda); }
  }

  function pintar(enfocar: boolean): void {
    const p = pasos[i]; if (!p || !panel || !cuerpo) return;
    raiz!.dataset.paso = p.tipo === "datos" ? "datos" : "capa";
    cabecera(p);
    aviso = el("p", "aviso"); aviso.setAttribute("role", "alert"); // empty = no room taken
    filas = el("div", "filas");
    cuerpo.replaceChildren(aviso, filas);
    if (p.tipo === "capa") paginaDeCapa(p); else paginaDeDatos(p);
    cuerpo.scrollTop = 0;
    pintarPie();
    if (enfocar) titulo?.focus({ preventScroll: true });
    avisarCambio();
  }

  const limpiarAviso = () => { if (aviso) aviso.textContent = ""; };

  function ir(k: number): void {
    if (enviando || saliendo || k < 0 || k >= pasos.length || (k > i && !puedeSeguir(pasos[i], marcas))) return;
    i = k; pintar(true);
    decir(`Paso ${i + 1} de ${pasos.length}: ${pasos[i].tipo === "datos" ? "Lo que tú eliges" : pasos[i].tipo === "capa" ? pasos[i].nombre : ""}.`);
  }

  // ---------- accepting ----------
  function enviar(modo: "marcadas" | "todo" | "ninguna"): void {
    if (enviando || saliendo || !todoMarcado(pasos, marcas)) return;
    if (modo === "todo") for (const p of pasos) if (p.tipo === "datos") for (const x of p.permisos) marcas.datos.add(x.punto.id);
    const a = aceptacion(pasos, marcas, modo);
    if (!s.aceptar(a.versiones, a.datos)) { fallo("No he podido enviar tu respuesta. Prueba otra vez."); return; }
    enviando = true; pintarPie(); panel?.setAttribute("aria-busy", "true"); decir("Enviando tu respuesta…");
    espera = setTimeout(() => { if (enviando) fallo("El servidor no contesta. Prueba otra vez."); }, o.esperaMs ?? ESPERA_RESPUESTA_MS);
  }
  function fallo(texto: string): void {
    enviando = false; if (espera) clearTimeout(espera); espera = null;
    panel?.removeAttribute("aria-busy");
    if (aviso) aviso.textContent = texto; decir(texto); pintarPie();
  }

  // ---------- leaving ----------
  function salir(): void {
    if (saliendo) return;
    saliendo = true;
    o.cerrarConexion?.(); // the server hears the goodbye: it never saw an acceptance
    const ciudad = o.ciudadUrl?.() ?? null;
    if (ciudad) { location.href = ciudad; return; }
    if (panel) {
      cab!.replaceChildren(el("div", "etq", "Has salido"));
      cuerpo!.replaceChildren();
      const d = el("div", "despedida");
      titulo = el("h1", "", "Has salido de este mundo"); titulo.tabIndex = -1; titulo.id = "condiciones-titulo";
      d.append(titulo, el("p", "sub", "No has aceptado las normas, así que no has entrado. Puedes cerrar esta pestaña, o volver a cargar la página si cambias de idea."));
      cuerpo.append(d);
      pie!.replaceChildren();
      const der = el("div", "der"); const otra = el("button", "btn prim", "Volver a empezar"); otra.type = "button"; otra.id = "condiciones-reiniciar"; otra.addEventListener("click", () => location.reload());
      der.append(otra); pie!.append(el("div", "ver"), der);
      titulo.focus(); decir("Has salido de este mundo.");
    }
    if (history.length > 1) setTimeout(() => { try { history.back(); } catch { /* stay on the farewell */ } }, 600); // back to where you came from, when there is a «where»
  }

  // ---------- showing and bursting ----------
  function mostrar(m: CondicionesMensaje): void {
    capas = m.capas ?? [];
    const plan = planificar(capas);
    if (!plan.length) { s.pedirCondiciones(); return; }
    pasos = plan; firma = JSON.stringify(capas.map((c) => [c.capa, c.version, c.puntos.map((p) => p.id)]));
    marcas = marcasVacias(); i = 0; enviando = saliendo = estallando = false; textoAbierto = !movil();
    if (!estilo) { estilo = el("style"); estilo.textContent = CSS; estilo.dataset.condiciones = "1"; }
    if (!estilo.isConnected) document.head.append(estilo);
    raiz = el("div"); raiz.id = "condiciones"; raiz.className = movil() ? "movil" : "";
    raiz.append(el("div", "cond-pompa"), el("div", "cond-brillo"));
    panel = el("section", "cond-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
    cab = el("header", "cab"); cuerpo = el("div", "cuerpo"); pie = el("footer", "pie");
    panel.append(cab, cuerpo, pie);
    anuncio = el("p", "solo-lector"); anuncio.setAttribute("role", "status"); anuncio.setAttribute("aria-live", "polite");
    raiz.append(panel, anuncio);
    // touches, drags and wheels belong to the bubble: never the walking stick nor the camera
    for (const t of ["pointerdown", "wheel", "touchstart"]) raiz.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    raiz.addEventListener("keydown", teclasDelPanel);
    raiz.addEventListener("contextmenu", (e) => e.preventDefault());
    devolver = document.activeElement;
    for (const hijo of [...document.body.children] as HTMLElement[]) if (hijo.id !== "avisos" && !hijo.hasAttribute("inert")) { hijo.setAttribute("inert", ""); inertes.push(hijo); }
    document.body.append(raiz);
    addEventListener("keydown", guardiaTeclas, true); addEventListener("keypress", guardiaTeclas, true);
    document.addEventListener("focusin", guardiaFoco);
    matchMedia("(max-width: 640px)").addEventListener?.("change", reajustar);
    pintar(true);
    decir(`Antes de entrar: ${pasos.length === 1 ? "una página" : `${pasos.length} pasos`}. Hasta que aceptes las normas estás en una burbuja: ves el mundo, pero no puedes moverte ni hablar.`);
  }
  function reajustar(): void { if (raiz) { raiz.classList.toggle("movil", movil()); } }

  function retirar(): void {
    if (!raiz) return;
    removeEventListener("keydown", guardiaTeclas, true); removeEventListener("keypress", guardiaTeclas, true);
    document.removeEventListener("focusin", guardiaFoco);
    matchMedia("(max-width: 640px)").removeEventListener?.("change", reajustar);
    for (const x of inertes) x.removeAttribute("inert");
    inertes.length = 0;
    raiz.remove(); raiz = panel = titulo = cuerpo = filas = pie = cab = aviso = anuncio = null;
    estallando = false;
    if (devolver instanceof HTMLElement && devolver.isConnected) devolver.focus({ preventScroll: true }); else (document.activeElement as HTMLElement | null)?.blur?.();
    devolver = null; avisarCambio();
  }

  /** The server let you through: the bubble bursts (a short animation) and the world is yours. */
  function estallar(): void {
    if (!raiz || estallando) return;
    if (espera) clearTimeout(espera); espera = null;
    estallando = true; enviando = false;
    const r = raiz; const quieta = matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel?.removeAttribute("aria-busy");
    decir("Has entrado. Ya puedes moverte.", true);
    for (const x of inertes) x.removeAttribute("inert"); // the world is already alive under the animation
    requestAnimationFrame(() => r.classList.add("estallando"));
    fin = setTimeout(() => { fin = null; if (raiz === r) retirar(); }, quieta ? 30 : DURACION_ESTALLIDO_MS + 60);
    avisarCambio();
  }

  // ---------- what the server says ----------
  function alMensaje(m: CondicionesMensaje | null): void {
    if (!m) return;
    if (!pideBurbuja(m)) { // gate off, or let through
      if (raiz && !estallando) { if (m.abierta) estallar(); else retirar(); }
      return;
    }
    if (saliendo) return;
    if (!m.capas) { if (!raiz) s.pedirCondiciones(); else if (enviando) fallo("El servidor no ha dado por buenas las normas. Vuelve a leerlas y acepta otra vez."), s.pedirCondiciones(); return; }
    const nueva = JSON.stringify(m.capas.map((c) => [c.capa, c.version, c.puntos.map((p) => p.id)]));
    if (!raiz) { mostrar(m); return; }
    if (nueva !== firma) { // the text changed under the person's feet: start again with the new one, and say so
      const dicho = enviando; mostrar_de_nuevo(m); if (dicho) fallo("Las normas han cambiado mientras leías. Vuelve a leerlas."); return;
    }
    if (enviando) { fallo("El servidor no ha dado por buenas las normas. Vuelve a leerlas y acepta otra vez."); s.pedirCondiciones(); }
  }
  function mostrar_de_nuevo(m: CondicionesMensaje): void {
    capas = m.capas ?? []; pasos = planificar(capas); firma = JSON.stringify(capas.map((c) => [c.capa, c.version, c.puntos.map((p) => p.id)]));
    marcas = marcasVacias(); i = 0; enviando = false; if (espera) clearTimeout(espera); espera = null; pintar(true);
  }

  s.onCondiciones = alMensaje;
  alMensaje(s.condiciones); // the offer may have arrived before this was mounted
  return {
    estado,
    /** the bubble is up and the world is closed to you (readAxes and the like ask this) */
    cerrada: (): boolean => !!raiz && !estallando,
    /** c4 and c5 subscribe: the panel changed (step, boxes, sending, bursting) */
    alCambiar: (f: () => void): void => { cambios.push(f); },
    ir, enviar, salir,
    marcarNorma: (capa: string, v: boolean): void => { marcas.normas[capa] = v; pintarPie(); avisarCambio(); },
    marcarDato: (id: string, v: boolean): void => { if (v) marcas.datos.add(id); else marcas.datos.delete(id); pintarPie(); avisarCambio(); },
    /** for tests of the page and for a future «change my mind» (c6): ask the server again and redraw */
    repetir: (): boolean => s.pedirCondiciones(),
  };
}

export type { CondicionesPunto };
