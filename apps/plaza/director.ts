// N6, corte 1 — the Game Director's page part: the «Dirigir» button and panel (only for who may direct: STD-052
// manage-rituals), the narrator's line every player sees, and the summons card («Ir / Ahora no»). It only asks the
// features (features/director, features/entorno): the server decides. In VR the HTML panel is not drawn: whoever
// directs from a headset uses the chat orders (/escenas, /escena, /narrar, /convocar) until the wrist menu (corte 4).
import type { Cambio, Convocatoria } from "../../features/director/client.ts";
import { anunciar, escribiendo } from "./paneles.ts";
import { icono } from "./iconos.ts";

type Director = {
  estado: { puede: boolean; escenas: { id: string; nombre: string; casa: boolean }[]; ultimoRechazo: string; narraciones: { texto: string; quien: string }[]; convocatorias: Convocatoria[]; respuestas: Map<number, { vienen: number; no: number }> };
  actual(): { id: string; nombre: string; quien: string } | null;
  escena(id: string): { ok: boolean; why?: string };
  narrar(t: string): { ok: boolean; why?: string };
  convocar(t?: string): { ok: boolean; why?: string };
  acudir(id: number, si: boolean): { ok: boolean; why?: string };
  alCambiar(f: (q: Cambio) => void): () => void;
};
type Ambiente = { valores(): Record<string, unknown> | undefined; ajustar(c: Record<string, unknown>): { ok: boolean; why?: string } };
type Vista = { beacon?(x: number, z: number, text: string, ms: number): void };

/** How long the narrator's line stays (ms): long enough to read 280 characters, short enough not to cover the game. */
export const NARRACION_MS = 9000;
/** How long the way to a summons stays lit after «Ir». */
export const BALIZA_MS = 60_000;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};

export function montarDirector(o: { dj: Director; ambiente: Ambiente; view: Vista }): { abrir(): void; cerrar(): void } {
  const { dj, ambiente, view } = o;

  // ---- the narrator's line (everyone): a live region at the top centre, like «Misión completada» ----
  const cartel = el("div", { id: "narrador" });
  cartel.setAttribute("role", "status"); cartel.setAttribute("aria-live", "polite"); cartel.setAttribute("aria-atomic", "true");
  document.body.appendChild(cartel);
  let quitar = 0;
  const narrar = (n: { texto: string; quien: string }) => {
    cartel.replaceChildren(el("p", { className: "texto", textContent: n.texto }), el("p", { className: "quien", textContent: `— ${n.quien}` }));
    cartel.classList.add("visible");
    clearTimeout(quitar);
    quitar = window.setTimeout(() => { cartel.classList.remove("visible"); window.setTimeout(() => { if (!cartel.classList.contains("visible")) cartel.replaceChildren(); }, 400); }, NARRACION_MS);
  };

  // ---- the summons card (everyone but the caller): «Ir» lights the way, «Ahora no» does nothing; nobody is moved ----
  const tarjetas = el("div", { id: "convocatorias" });
  tarjetas.setAttribute("aria-label", "Convocatorias");
  tarjetas.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  document.body.appendChild(tarjetas);
  const pintarConvocatorias = () => {
    tarjetas.replaceChildren(...dj.estado.convocatorias.slice(-2).map((c) => {
      const ir = el("button", { type: "button", className: "si", textContent: "Ir" });
      const no = el("button", { type: "button", textContent: "Ahora no" });
      ir.addEventListener("click", () => { dj.acudir(c.id, true); view.beacon?.(c.x, c.z, `${c.de} te espera aquí`, BALIZA_MS); anunciar(`Vas a la convocatoria de ${c.de}: sigue la luz.`); pintarConvocatorias(); });
      no.addEventListener("click", () => { dj.acudir(c.id, false); pintarConvocatorias(); });
      const t = el("section", { className: "convocatoria" }, el("p", { className: "de", textContent: `${c.de} te convoca` }), el("p", { textContent: c.texto }), el("div", { className: "botones" }, ir, no));
      t.setAttribute("aria-label", `${c.de} te convoca: ${c.texto}`);
      return t;
    }));
  };

  // ---- the «Dirigir» button (top bar) and panel (left; non-modal: the world stays playable behind it) ----
  const boton = el("button", { type: "button", id: "dirigir", title: "Dirigir (K)" });
  boton.innerHTML = `${icono("game-controller", 18)}<span>Dirigir</span>`; // a constant: the house icon and a fixed word, nothing from the wire
  boton.hidden = true; boton.setAttribute("aria-expanded", "false"); boton.setAttribute("aria-controls", "panel-director"); boton.setAttribute("aria-keyshortcuts", "K");
  const barra = document.getElementById("barra-arriba");
  const construir = document.getElementById("construir");
  if (barra && construir?.parentElement === barra) construir.after(boton); else (barra ?? document.body).appendChild(boton);

  const panel = el("section", { id: "panel-director", hidden: true });
  panel.setAttribute("aria-labelledby", "panel-director-titulo");
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("wheel", (e) => e.stopPropagation());
  const titulo = el("h2", { id: "panel-director-titulo", textContent: "Dirigir" });
  const cerrarB = el("button", { type: "button", className: "cerrar", textContent: "Cerrar (K)" });
  const actualP = el("p", { className: "actual" });
  const escenasPropias = el("div", { className: "escenas" });
  const escenasCasa = el("div", { className: "escenas casa" });
  const luz = el("input", { type: "range", min: "0.2", max: "2.5", step: "0.05", id: "dj-luz" });
  const niebla = el("input", { type: "range", min: "10", max: "600", step: "5", id: "dj-niebla" });
  const texto = el("input", { type: "text", maxLength: 280, id: "dj-texto", placeholder: "Una línea para todos, o el texto de la convocatoria" });
  const narrarB = el("button", { type: "button", textContent: "Narrar" });
  const convocarB = el("button", { type: "button", textContent: "Convocar aquí" });
  const respuestasP = el("p", { className: "respuestas" });
  respuestasP.setAttribute("aria-live", "polite");
  const etiqueta = (para: string, t: string) => { const l = el("label", { textContent: t }); l.htmlFor = para; return l; };
  panel.append(
    el("header", {}, titulo, cerrarB),
    actualP,
    el("h3", { textContent: "Escenas de la aventura" }), escenasPropias,
    el("h3", { textContent: "Entornos de la casa" }), escenasCasa,
    el("h3", { textContent: "En directo" }),
    el("div", { className: "dial" }, etiqueta("dj-luz", "Luz"), luz),
    el("div", { className: "dial" }, etiqueta("dj-niebla", "Niebla (lejos, m)"), niebla),
    el("h3", { textContent: "Voz del mundo" }), etiqueta("dj-texto", "Texto"), texto,
    el("div", { className: "botones" }, narrarB, convocarB), respuestasP,
  );
  document.body.appendChild(panel);

  let volver: Element | null = null;
  const abrir = () => {
    if (!dj.estado.puede || !panel.hidden) return;
    volver = document.activeElement;
    panel.hidden = false; boton.setAttribute("aria-expanded", "true"); boton.setAttribute("aria-pressed", "true");
    pintarDiales(); titulo.tabIndex = -1; titulo.focus({ preventScroll: true });
  };
  const cerrar = () => {
    if (panel.hidden) return;
    panel.hidden = true; boton.setAttribute("aria-expanded", "false"); boton.setAttribute("aria-pressed", "false");
    if (volver instanceof HTMLElement && volver.isConnected) volver.focus({ preventScroll: true }); volver = null;
  };
  boton.addEventListener("click", () => (panel.hidden ? abrir() : cerrar()));
  cerrarB.addEventListener("click", cerrar);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } });
  addEventListener("keydown", (e) => { if (e.code === "KeyK" && !escribiendo(e) && dj.estado.puede) { e.preventDefault(); if (panel.hidden) abrir(); else cerrar(); } });

  const decirFallo = (r: { ok: boolean; why?: string }) => { if (!r.ok) anunciar(r.why ?? "No se pudo."); };
  const pintarEscenas = () => {
    const actual = dj.actual()?.id;
    const ficha = (s: { id: string; nombre: string }) => {
      const b = el("button", { type: "button", textContent: s.nombre });
      b.setAttribute("aria-pressed", String(s.id === actual));
      b.addEventListener("click", () => decirFallo(dj.escena(s.id)));
      return b;
    };
    const propias = dj.estado.escenas.filter((s) => !s.casa), casa = dj.estado.escenas.filter((s) => s.casa);
    escenasPropias.replaceChildren(...(propias.length ? propias.map(ficha) : [el("p", { className: "nota", textContent: "Esta aventura no trae escenas (aventura/escenas/*.json)." })]));
    escenasCasa.replaceChildren(...casa.map(ficha));
    const a = dj.actual();
    actualP.textContent = a ? `Escena: ${a.nombre} (la puso ${a.quien})` : "Aún no hay escena puesta.";
  };
  const pintarDiales = () => {
    const v = ambiente.valores();
    if (!v) return;
    luz.value = String(v.exposicion ?? 1); niebla.value = String(v.nieblaLejos ?? 380);
  };
  let pendiente = 0;
  const ajustar = (c: Record<string, unknown>) => { clearTimeout(pendiente); pendiente = window.setTimeout(() => decirFallo(ambiente.ajustar(c)), 120); }; // a dial sends at most ~8 a second
  luz.addEventListener("input", () => ajustar({ exposicion: Number(luz.value) }));
  niebla.addEventListener("input", () => ajustar({ nieblaLejos: Number(niebla.value), nieblaAuto: false }));
  narrarB.addEventListener("click", () => { const t = texto.value.trim(); if (!t) { anunciar("Escribe la línea que quieres narrar."); texto.focus(); return; } const r = dj.narrar(t); decirFallo(r); if (r.ok) texto.value = ""; });
  convocarB.addEventListener("click", () => { const r = dj.convocar(texto.value.trim()); decirFallo(r); if (r.ok) { texto.value = ""; respuestasP.textContent = "Convocatoria enviada."; } });
  texto.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); narrarB.click(); } });

  let ultimaNarracion = dj.estado.narraciones.length;
  dj.alCambiar((q) => {
    if (q === "permiso") { boton.hidden = !dj.estado.puede; if (!dj.estado.puede) cerrar(); }
    if (q === "escenas" || q === "actual" || q === "permiso") pintarEscenas();
    if (q === "actual") pintarDiales();
    if (q === "narracion" && dj.estado.narraciones.length !== ultimaNarracion) { ultimaNarracion = dj.estado.narraciones.length; const n = dj.estado.narraciones.at(-1); if (n) narrar(n); }
    if (q === "convocatoria") pintarConvocatorias();
    if (q === "respuestas") { const ultima = [...dj.estado.respuestas.entries()].at(-1); if (ultima) respuestasP.textContent = `Vienen ${ultima[1].vienen} · ahora no ${ultima[1].no}`; }
    if (q === "rechazado") anunciar(dj.estado.ultimoRechazo);
  });
  pintarEscenas();
  return { abrir, cerrar };
}
