// dardos enlazados (E2) — the chooser the AR button opens in a world that has a link (apps/plaza/ar-elegir-logica.ts has the words and the
// decisions): two big buttons on the flat page, «Dardos de <the linked world> en tu pared» (first, with the focus) and «El mundo en tu mesa» (the miniature).
//   · The XR rule: `requestSession` must run inside the person's click, with nothing awaited before it. So everything slow happens BEFORE that
//     click, while the chooser is up: the link's chunk is loaded and the link connected (`enlace()` + `conectar()` the moment it opens), the Tower's
//     norms are read and accepted on THIS page (the same bubble the world uses, asked for the linked world's text), and only then the darts button
//     is a plain «go» whose click calls `jugarEnPared()` synchronously (which starts AR in that same call stack). In a headset there is no DOM in AR:
//     this is why it all happens before entering.
//   · The miniature button runs the page's own AR entry (`alMiniatura`) in its click, as ever. Choosing it, or closing the chooser, closes the link.
//   · Leaving AR (any way: the button, the headset's menu, the time limit) closes the link; losing the connection while in AR leaves AR.
import { vistaElegir, nombreDelEnlace, TITULO_ELEGIR, ROTULO_MESA, AYUDA_MESA, ROTULO_REINTENTAR, ROTULO_CANCELAR } from "./ar-elegir-logica.ts";
import type { EnlaceDardosPagina } from "./dardos-enlace.ts";
import type { montarCondiciones } from "./condiciones.ts";
import type { EnlaceDardos } from "../../features/dardos/enlace.ts";
import type { CondicionesMensaje } from "../../packages/net/src/index.ts";

export type OpcionesElegirAR = {
  /** the page's `__numinia.dardosEnlace` (vigente, enlace): the link object comes from `enlace()` (its chunk loads here, before any click that enters AR) */
  enlace: { vigente(): { enlace: EnlaceDardos | null }; enlace(): Promise<EnlaceDardosPagina | null> };
  /** the page's AR (to know whether it is on, and to leave it) */
  view: { ar: { state: string; jugando: boolean; exit(): Promise<void> } };
  /** the bubble of norms of the page (condiciones.ts), asked here for the linked world's text */
  condiciones: typeof montarCondiciones;
  /** the page's own AR entry for the miniature: it MUST start the session in the call (called inside the click) */
  alMiniatura: () => void;
  /** the sentence for people when starting the AR session failed (after `requestSession` said no) */
  falloAR: () => string;
  /** the page's report of a failed AR start (xr falla) */
  informarFallo?: (detalle: string) => void;
  /** a phone-class interface (the bubble draws its phone layout) */
  movil: () => boolean;
  /** a line for the page's notices (the live area) */
  decir: (t: string) => void;
};

const CSS = `
#ar-elegir { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgba(12,10,9,.62); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  font: 15px/1.45 "Geist", system-ui, sans-serif; color: var(--n-texto, #F9EBDC); touch-action: none; }
#ar-elegir[hidden] { display: none; }
#ar-elegir * { box-sizing: border-box; }
#ar-elegir .ae-panel { width: min(460px, 100%); max-height: 100%; overflow: auto; background: rgba(20,17,15,.96); border: 1px solid rgba(154,140,124,.28); border-radius: 14px; padding: 18px 18px 14px; box-shadow: 0 24px 60px rgba(0,0,0,.5); touch-action: pan-y; }
#ar-elegir h2 { margin: 0 0 12px; font: 650 20px/1.2 "Geist", system-ui, sans-serif; letter-spacing: -.01em; }
#ar-elegir .ae-btn { display: block; width: 100%; text-align: left; margin: 0 0 10px; padding: 14px 16px; border-radius: 10px; border: 1px solid #3A332D; background: #292420; color: inherit; font: inherit; cursor: pointer; }
#ar-elegir .ae-btn b { display: block; font: 650 17px/1.25 "Geist", system-ui, sans-serif; }
#ar-elegir .ae-btn small { display: block; margin-top: 3px; font-size: 13px; color: var(--n-texto2, #C4B5A6); }
#ar-elegir .ae-btn.dardos { background: #F3E6D6; border-color: #F3E6D6; color: #14110F; }
#ar-elegir .ae-btn.dardos small { color: #4a3f35; }
#ar-elegir .ae-btn[aria-disabled="true"] { opacity: .65; cursor: progress; }
#ar-elegir .ae-btn:focus-visible, #ar-elegir .ae-pie button:focus-visible { outline: 3px solid #ffd27a; outline-offset: 2px; }
#ar-elegir .ae-fallo { margin: 0 0 10px; padding: 9px 11px; border-radius: 8px; background: rgba(211,52,64,.14); border: 1px solid rgba(211,52,64,.45); font-size: 14px; }
#ar-elegir .ae-fallo[hidden] { display: none; }
#ar-elegir .ae-pie { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
#ar-elegir .ae-pie button { padding: 9px 14px; border-radius: 7px; border: 1px solid #3A332D; background: none; color: inherit; font: 600 14px "Geist", system-ui, sans-serif; cursor: pointer; }
#ar-elegir .ae-pie button[hidden] { display: none; }
#ar-elegir .ae-pie .reintentar { background: #ffd27a; border-color: #ffd27a; color: #23303b; }
@media (max-width: 640px) { #ar-elegir { align-items: end; padding: 10px; } #ar-elegir .ae-btn { padding: 16px; } #ar-elegir .ae-btn b { font-size: 18px; } #ar-elegir .ae-pie button { flex: 1 1 0; padding: 13px 10px; } }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, clase = "", texto = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto) e.textContent = texto; return e; };

export function crearElegirAR(o: OpcionesElegirAR) {
  let raiz: HTMLElement | null = null, estilo: HTMLStyleElement | null = null;
  let enlace: EnlaceDardosPagina | null = null, ajuste: EnlaceDardos | null = null;
  let quitarOyente: (() => void) | null = null, aceptadas = false, falloAR = "", panelNormas: ReturnType<typeof montarCondiciones> | null = null, devolver: Element | null = null;
  let bDardos: HTMLButtonElement, bMesa: HTMLButtonElement, bReintentar: HTMLButtonElement, bCancelar: HTMLButtonElement, textoFallo: HTMLElement, vivo: HTMLElement;
  const inertes: HTMLElement[] = [];
  let ultimoAnuncio = "";

  const abierto = (): boolean => !!raiz;

  function pintar(): void {
    if (!raiz || !ajuste) return;
    const e = enlace?.vista();
    const v = vistaElegir(e?.estado ?? "conectando", e?.motivo ?? "", ajuste, { aceptadas, falloAR, nombreServidor: e?.nombreServidor });
    bDardos.replaceChildren(el("b", "", v.dardos.texto), el("small", "", v.dardos.ayuda));
    bDardos.setAttribute("aria-disabled", String(v.dardos.apagado)); bDardos.dataset.accion = v.dardos.accion;
    textoFallo.hidden = !v.fallo; textoFallo.textContent = v.fallo;
    bReintentar.hidden = !v.reintentar;
    const anuncio = v.fallo || v.dardos.ayuda;
    if (anuncio !== ultimoAnuncio) { ultimoAnuncio = anuncio; vivo.textContent = anuncio; }
    raiz.dataset.estado = e?.estado ?? "conectando";
  }

  function montar(): void {
    if (!estilo) { estilo = el("style"); estilo.textContent = CSS; estilo.dataset.arElegir = "1"; }
    if (!estilo.isConnected) document.head.append(estilo);
    raiz = el("div"); raiz.id = "ar-elegir";
    const panel = el("section", "ae-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", "ar-elegir-titulo");
    const h = el("h2", "", TITULO_ELEGIR); h.id = "ar-elegir-titulo";
    bDardos = el("button", "ae-btn dardos"); bDardos.type = "button"; bDardos.id = "ar-elegir-dardos";
    bMesa = el("button", "ae-btn mesa"); bMesa.type = "button"; bMesa.id = "ar-elegir-mesa"; bMesa.append(el("b", "", ROTULO_MESA), el("small", "", AYUDA_MESA));
    textoFallo = el("p", "ae-fallo"); textoFallo.setAttribute("role", "alert"); textoFallo.hidden = true;
    const pie = el("div", "ae-pie");
    bReintentar = el("button", "reintentar", ROTULO_REINTENTAR); bReintentar.type = "button"; bReintentar.id = "ar-elegir-reintentar"; bReintentar.hidden = true;
    bCancelar = el("button", "", ROTULO_CANCELAR); bCancelar.type = "button"; bCancelar.id = "ar-elegir-cancelar";
    pie.append(bReintentar, bCancelar);
    vivo = el("p", "solo-lector"); vivo.setAttribute("role", "status"); vivo.setAttribute("aria-live", "polite");
    vivo.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    panel.append(h, bDardos, bMesa, textoFallo, pie, vivo);
    raiz.append(panel);
    // touches, drags and wheels belong to the chooser: never the walking stick nor the camera; keys never walk the avatar behind it
    for (const t of ["pointerdown", "wheel", "touchstart"]) raiz.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true });
    raiz.addEventListener("keydown", teclas);
    raiz.addEventListener("keyup", (ev) => ev.stopPropagation());
    raiz.addEventListener("contextmenu", (ev) => ev.preventDefault());
    raiz.addEventListener("click", (ev) => { if (ev.target === raiz) cerrar(); }); // outside the panel
    bDardos.addEventListener("click", alPulsarDardos);
    bMesa.addEventListener("click", alPulsarMesa);
    bReintentar.addEventListener("click", () => { void reintentar(); });
    bCancelar.addEventListener("click", () => cerrar());
    devolver = document.activeElement;
    for (const hijo of [...document.body.children] as HTMLElement[]) if (hijo.id !== "avisos" && !hijo.hasAttribute("inert")) { hijo.setAttribute("inert", ""); inertes.push(hijo); }
    document.body.append(raiz);
  }

  function teclas(ev: KeyboardEvent): void {
    ev.stopPropagation(); // not to the page's walking, jumping, chat…
    if (ev.key === "Escape") { ev.preventDefault(); cerrar(); return; }
    if (ev.key !== "Tab" || !raiz) return;
    const foco = [...raiz.querySelectorAll<HTMLElement>("button:not([hidden])")].filter((x) => x.offsetParent !== null);
    if (!foco.length) return;
    const primero = foco[0], ultimo = foco[foco.length - 1], ya = document.activeElement;
    if (ev.shiftKey && ya === primero) { ev.preventDefault(); ultimo.focus(); } else if (!ev.shiftKey && ya === ultimo) { ev.preventDefault(); primero.focus(); }
  }

  /** Open the chooser and, in the background, connect the link (so that the darts button is ready for the click that enters AR). */
  async function abrir(): Promise<void> {
    if (raiz) return;
    const v = o.enlace.vigente(); ajuste = v.enlace;
    if (!ajuste) { o.decir("Pulsa otra vez para entrar en AR."); return; } // the link went away while this loaded: the next press is the plain button
    aceptadas = false; falloAR = ""; ultimoAnuncio = "";
    montar(); pintar(); bDardos.focus({ preventScroll: true });
    const mio = raiz;
    const e = await o.enlace.enlace();
    if (raiz !== mio) return; // closed while the chunk was loading
    if (!e) { falloAR = ""; pintar(); return; }
    enlace = e;
    quitarOyente = e.alCambiar(() => { if (raiz && !panelNormas) pintar(); });
    pintar();
    const llegado = await e.conectar();
    if (raiz !== mio) return;
    pintar();
    if (llegado === "puerta" || llegado === "listo") bDardos.focus({ preventScroll: true });
  }

  function alPulsarDardos(): void {
    // NOTE: everything up to `jugarEnPared()` is synchronous: the call below starts the AR session inside THIS click
    const accion = bDardos.dataset.accion;
    if (!enlace || !ajuste) return;
    if (accion === "entrar") { void entrar(enlace); return; }
    if (accion === "normas") { verNormas(enlace); return; }
    if (accion === "reintentar") void reintentar();
  }

  async function entrar(e: EnlaceDardosPagina): Promise<void> {
    const r = await e.jugarEnPared(); // starts AR in this very call (the link is `listo`: nothing is awaited before `requestSession`)
    if (r.ok) { cerrarPanel(false); vigilar(e); return; }
    // AR did not start. If the link itself is fine it was the session (permission, device); otherwise the link says why
    const estado = e.estado();
    falloAR = estado === "listo" || estado === "jugando" ? (r.why === "No se pudo abrir la sesión de AR." ? o.falloAR() : r.why) : "";
    if (falloAR) o.informarFallo?.(r.why);
    pintar();
    bDardos.focus({ preventScroll: true });
  }

  /** The Tower's gate is shut: show its norms (the page's own bubble, asked for the linked world's text). The panel gives back to the chooser. */
  function verNormas(e: EnlaceDardosPagina): void {
    if (panelNormas || !raiz) return;
    const nombre = nombreDelEnlace(ajuste!, e.vista().nombreServidor);
    let quitarCond: (() => void) | null = null;
    // the bubble talks to a «session»: here it is the link (its norms, its acceptance), not the page's own connection
    const sesion = {
      get condiciones() { return e.condicionesMensaje(); },
      set onCondiciones(f: ((m: CondicionesMensaje) => void) | null) { quitarCond?.(); quitarCond = f ? e.alCondiciones(f) : null; },
      get onCondiciones() { return null; },
      entity: -1,
      aceptar: (versiones: Record<string, string>, datos?: string[]) => e.aceptar(versiones, datos ?? []),
      pedirCondiciones: () => e.pedirCondiciones(),
    };
    raiz.hidden = true; // the norms are a panel of their own on top of the page
    const volver = (acepto: boolean): void => {
      const p = panelNormas; panelNormas = null;
      aceptadas = acepto;
      queueMicrotask(() => { p?.soltar(); quitarCond?.(); quitarCond = null; });
      if (raiz) { raiz.hidden = false; pintar(); bDardos.focus({ preventScroll: true }); }
    };
    panelNormas = o.condiciones({
      session: sesion as never, mundo: () => nombre.largo, decir: (t) => o.decir(t), movil: o.movil,
      enlazada: { alSalir: () => volver(false), alAbrirse: () => volver(true) },
    });
    // if the server did not need us (the gate opened while we looked) there was no panel: back to the chooser
    if (panelNormas && !panelNormas.cerrada()) volver(e.estado() === "listo");
  }

  async function reintentar(): Promise<void> {
    if (!enlace) { const e = await o.enlace.enlace(); if (!e || !raiz) return; enlace = e; }
    falloAR = ""; aceptadas = false;
    const e = enlace;
    pintar();
    void e.conectar().then(() => { pintar(); if (raiz) bDardos.focus({ preventScroll: true }); });
    pintar();
  }

  function alPulsarMesa(): void {
    cerrarPanel(true); // the link closes (a dead socket helps nobody) and the miniature starts in THIS click
    o.alMiniatura();
  }

  /** Take the chooser away. `cerrarEnlace`: also close the link's connection (not when we are going into AR with it). */
  function cerrarPanel(cerrarEnlace: boolean): void {
    panelNormas?.soltar(); panelNormas = null;
    quitarOyente?.(); quitarOyente = null;
    const e = enlace; enlace = null;
    if (raiz) {
      for (const x of inertes) x.removeAttribute("inert");
      inertes.length = 0; raiz.remove(); raiz = null;
      if (devolver instanceof HTMLElement && devolver.isConnected) devolver.focus({ preventScroll: true });
      devolver = null;
    }
    if (cerrarEnlace && e) void e.cerrar();
  }
  function cerrar(): void { cerrarPanel(true); }

  /** Once the wall is hung: leaving AR (however) closes the link; losing the link while in AR leaves AR and says so. */
  function vigilar(e: EnlaceDardosPagina): void {
    const quitar = e.alCambiar(() => {
      const nombre = nombreDelEnlace(ajuste!, e.vista().nombreServidor);
      const st = e.estado();
      if (st === "jugando" || st === "conectando") return;
      quitar();
      if ((st === "error" || st === "cerrado") && o.view.ar.jugando) { void o.view.ar.exit(); o.decir(`Se ha perdido la conexión con ${nombre.corto}: sales de AR.`); }
      void e.cerrar(); // leaving AR (the session ended, the wall's game ended) = nothing of the link stays open
    });
  }

  return { abrir, cerrar, abierto, raiz: () => raiz };
}
export type ElegirAR = ReturnType<typeof crearElegirAR>;
