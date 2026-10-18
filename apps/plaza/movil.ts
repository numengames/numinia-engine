// U24: the phone layout, drawn. While you play there are six controls: the joystick (left third), look (a drag on the
// rest), ONE big contextual action, «…», ⚙ + map (top right), the chat. This module only builds what the page does not
// already have (the big action, «…», the chat's three states, the map's «Misiones» tab, the long-press sheet, a ghost
// joystick) and tells the CSS (apps/plaza/movil.css, scoped to html[data-aparato^="movil"]) what state the screen is in
// through classes on <body>: con-panel, hablando, chat-abierto, pescando. Loaded only by a phone profile (main.ts);
// the rules (verbs, glyphs, chat states, long press) are pure and tested: packages/client/src/movil.ts.
import "./movil.css"; // U24: every rule is scoped to html[data-aparato^="movil"]
import { icono } from "./iconos.ts";
import { perfil } from "./perfil-aparato.ts";
import { anunciar } from "./paneles.ts";
import { PULSACION_LARGA_MS, PULSACION_LARGA_TOLERANCIA, ZONA_SEGURA_SIMULADA, elegirAccion, entradasDelMenu, esPulsacionLarga, siguienteChat, ultimaLinea } from "../../packages/client/src/movil.ts";
import type { Contexto, EstadoChat, Entrada } from "../../packages/client/src/movil.ts";

type Accion = { id: string; label: string; describe?: string; run(): void };
type Cerca = { feature: string; key: string; prompt: string } | null;
type Opciones = {
  interaccion: { actual(): Cerca; usar(): unknown; mirar(): void };
  acciones: readonly Accion[];
  saltar: () => void;
  cajaChat: { cerrar(): void };
  mapa: { abrir(): void; cerrar(): void; abierto(): boolean; botonFicha: HTMLElement };
  misiones: { dialogo(): unknown; alCambiar(fn: (q: string) => void): unknown };
  pesca: { estado: unknown };
  /** U22: «Nombres» lives in «…» on a phone (a tap shows every name for a few seconds). */
  nombres?: { unRato(): void };
  /** A phone profile forced on a desktop reports no notch or home bar: draw the zones a phone would have. */
  simulada: boolean;
  /** Report a chat line (who, what). Returns false when nothing receives it yet. */
  denunciar?: (l: { quien: string; texto: string }) => boolean;
};

const el = <T extends HTMLElement>(tag: string, o: { id?: string; clase?: string; texto?: string; html?: string; etiqueta?: string } = {}): T => {
  const e = document.createElement(tag) as T;
  if (o.id) e.id = o.id;
  if (o.clase) e.className = o.clase;
  if (o.texto) e.textContent = o.texto;
  if (o.html) e.innerHTML = o.html;
  if (o.etiqueta) e.setAttribute("aria-label", o.etiqueta);
  if (e instanceof HTMLButtonElement) e.type = "button";
  return e;
};
const porId = (id: string) => document.getElementById(id);
const vibrar = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* not everywhere */ } };

export function montarMovil(o: Opciones): void {
  const html = document.documentElement, body = document.body, clase = perfil().clase;
  if (clase !== "movil-vertical" && clase !== "movil-horizontal") return;
  html.classList.add("movil-hud");
  if (/[?&](depura|debug)\b/.test(location.search)) html.classList.add("depura"); // the debug corner is for whoever asks (?depura / ?debug)
  if (o.simulada) { const z = ZONA_SEGURA_SIMULADA[clase]; for (const [k, v] of Object.entries(z)) html.style.setProperty(`--zs-${k}`, `${v}px`); }

  // ---- U26 (for the HUD only): a visible and a short buzzing response to every press ----
  const pulsado = (e: Event, on: boolean) => { const t = (e.target as Element | null)?.closest?.(".tocable, #accion, #mas, #chat-pill, #ajustes-abrir, #minimapa canvas"); if (t) t.classList.toggle("pulsado", on); };
  addEventListener("pointerdown", (e) => { pulsado(e, true); const t = (e.target as Element | null)?.closest?.("#accion, #mas, #mas-menu button"); if (t) vibrar(); }, true);
  for (const t of ["pointerup", "pointercancel"]) addEventListener(t, () => document.querySelectorAll(".pulsado").forEach((x) => x.classList.remove("pulsado")), true);
  const noJoystick = (e: Element) => e.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // a tap on a control is not a joystick touch

  // ---- 1 · the ONE big action ----
  const accion = el<HTMLButtonElement>("button", { id: "accion", clase: "tocable" });
  const accionIc = el("span", { clase: "ic-accion" }), accionLbl = el("span", { clase: "lbl" });
  accion.append(accionIc, accionLbl);
  body.appendChild(accion); noJoystick(accion);
  let ctx: Contexto | null = null, firmaAccion = "";
  const pescando = () => { const e = typeof o.pesca.estado === "function" ? (o.pesca.estado as () => { fase?: string })() : (o.pesca.estado as { fase?: string }); return !!e && e.fase !== undefined && e.fase !== "nada"; };
  const refrescarAccion = () => {
    ctx = elegirAccion({ cerca: o.interaccion.actual(), pescando: pescando(), ocupado: !!o.misiones.dialogo() });
    const f = ctx ? `${ctx.verbo}|${ctx.icono}` : "";
    if (f === firmaAccion) return;
    firmaAccion = f;
    accion.hidden = !ctx;
    if (!ctx) return;
    accionIc.innerHTML = icono(ctx.icono, 32); accionLbl.textContent = ctx.verbo;
    accion.setAttribute("aria-label", ctx.tipo === "saltar" ? "Saltar" : `${ctx.verbo}: ${o.interaccion.actual()?.prompt ?? ""}`);
    accion.dataset.tipo = ctx.tipo;
  };
  accion.addEventListener("click", () => { if (!ctx) return; if (ctx.tipo === "saltar") o.saltar(); else o.interaccion.usar(); accion.blur(); });
  o.misiones.alCambiar(() => { o.interaccion.mirar(); refrescarAccion(); });
  setInterval(refrescarAccion, 150);
  refrescarAccion();

  // ---- 2 · «…» : Saltar, Saludar, Bailar and, behind «más», the rest of what the icon bar held ----
  const mas = el<HTMLButtonElement>("button", { id: "mas", clase: "tocable", html: icono("dots-three", 26), etiqueta: "Más acciones: saltar, saludar, bailar…" });
  mas.setAttribute("aria-expanded", "false"); mas.setAttribute("aria-haspopup", "menu");
  const menu = el("div", { id: "mas-menu" }); menu.setAttribute("role", "menu"); menu.hidden = true;
  body.append(mas, menu); noJoystick(mas); noJoystick(menu);
  let ampliado = false, tMenu = 0;
  const botonDe = (id: string): HTMLElement | null => { const e = porId(id); return e && !e.hidden && !e.hasAttribute("data-oculto") ? e : null; };
  const extras = (): (Entrada & { clic: () => void })[] => {
    const f: (Entrada & { clic: () => void })[] = [];
    for (const [id, etiqueta, ic] of [["microfono", "Micrófono", "microphone"], ["gente-abrir", "Gente", "users"], ["inventario-abrir", "Inventario", "copy"], ["foto-abrir", "Foto", "camera"], ["construir", "Construir", "crane-tower"], ["pantalla", "Pantalla completa", "desktop"], ["ar", "AR", "eye"], ["vr", "VR", "eye"]] as const) {
      const b = botonDe(id); if (b) f.push({ id, etiqueta, icono: ic, clic: () => b.click() });
    }
    f.push({ id: "ficha", etiqueta: "Ficha", icono: "user", clic: () => o.mapa.botonFicha.click() });
    if (o.nombres) f.push({ id: "nombres", etiqueta: "Nombres", icono: "users", clic: () => o.nombres!.unRato() });
    return f;
  };
  const cerrarMenu = () => { menu.hidden = true; ampliado = false; mas.setAttribute("aria-expanded", "false"); clearTimeout(tMenu); };
  const pintarMenu = () => {
    const ex = extras();
    const entradas = entradasDelMenu(o.acciones, ex);
    menu.classList.toggle("ampliado", ampliado);
    const botones = entradas.map((en) => {
      const b = el<HTMLButtonElement>("button", { clase: `tocable${en.masAlla ? " extra" : ""}`, html: icono(en.icono, 24) }); // the icon is a fixed house glyph; the label (a feature's text) goes in as text
      b.append(el("span", { texto: en.etiqueta }));
      b.setAttribute("role", "menuitem"); b.dataset.id = en.id;
      b.addEventListener("click", () => {
        cerrarMenu();
        if (en.id === "saltar") o.saltar();
        else { const a = o.acciones.find((x) => x.id === en.id); if (a) a.run(); else ex.find((x) => x.id === en.id)?.clic(); }
      });
      return b;
    });
    const masB = el<HTMLButtonElement>("button", { id: "mas-mas", clase: "tocable", html: `${icono("dots-three", 24)}<span>${ampliado ? "menos" : "más"}</span>` });
    masB.setAttribute("role", "menuitem");
    masB.addEventListener("click", () => { ampliado = !ampliado; pintarMenu(); reloj(); });
    const normales = botones.filter((b) => !b.classList.contains("extra"));
    menu.replaceChildren(...normales, masB, ...botones.filter((b) => b.classList.contains("extra")));
  };
  const reloj = () => { clearTimeout(tMenu); tMenu = window.setTimeout(cerrarMenu, 6000); };
  mas.addEventListener("click", () => { if (!menu.hidden) { cerrarMenu(); return; } pintarMenu(); menu.hidden = false; mas.setAttribute("aria-expanded", "true"); reloj(); });
  addEventListener("pointerdown", (e) => { if (!menu.hidden && !(e.target as Element).closest?.("#mas, #mas-menu")) cerrarMenu(); }, true);

  // ---- 3 · a ghost joystick where the thumb goes (the real one floats under the first touch) ----
  const fantasma = el("div", { id: "joy-fantasma", html: "<span>andar</span>" });
  body.appendChild(fantasma);
  const joy = porId("joy");
  if (joy) new MutationObserver(() => fantasma.classList.toggle("oculto", joy.style.display === "block")).observe(joy, { attributes: true, attributeFilter: ["style"] });

  // ---- 4 · the chat in three states: an icon · one line · the whole list with its box ----
  const chat = porId("chat")!, lista = porId("chat-lista") as HTMLElement, form = porId("chat-form") as HTMLFormElement, texto = porId("chat-texto") as HTMLInputElement;
  const pill = el<HTMLButtonElement>("button", { id: "chat-pill", clase: "tocable" });
  const cab = el("div", { id: "chat-cab" });
  const plegar = el<HTMLButtonElement>("button", { clase: "tocable", html: icono("caret-down", 22), etiqueta: "Plegar el chat a una línea" });
  const ocultar = el<HTMLButtonElement>("button", { clase: "tocable", html: icono("x", 22), etiqueta: "Ocultar el chat" });
  cab.append(el("h2", { texto: "Chat" }), plegar, ocultar);
  const enviar = el<HTMLButtonElement>("button", { id: "chat-enviar", clase: "tocable", html: icono("paper-plane-right", 22), etiqueta: "Enviar" });
  form.appendChild(enviar);
  chat.prepend(cab); chat.appendChild(pill);
  porId("chat-boton")?.setAttribute("hidden", ""); // the pill replaces the «Chat» button
  const ayudaChat = el("p", { id: "chat-ayuda", texto: "Mantén el dedo sobre un mensaje para denunciarlo." });
  lista.after(ayudaChat);
  let estado: EstadoChat = "linea", sinLeer = 0;
  const lineasDe = () => [...lista.children].map((li) => { const b = li.querySelector("b"), nombre = b?.textContent ?? "", cuerpo = (li.textContent ?? "").slice(nombre.length).replace(/^:\s*/, ""); return { nombre, texto: cuerpo, tuyo: nombre.startsWith("Tú"), tipo: li.className }; });
  const pintarChat = () => {
    chat.dataset.estado = estado;
    body.classList.toggle("chat-abierto", estado === "completo");
    form.hidden = estado !== "completo";
    if (estado !== "completo") o.cajaChat.cerrar();
    if (estado === "completo") { sinLeer = 0; lista.scrollTop = lista.scrollHeight; }
    const u = ultimaLinea(lineasDe());
    const burbuja = sinLeer > 0 ? `<span class="burbuja">${Math.min(sinLeer, 9)}${sinLeer > 9 ? "+" : ""}</span>` : "";
    pill.innerHTML = estado === "oculto"
      ? `${icono("chat-circle", 24)}${burbuja}`
      : `${icono("chat-circle", 22)}<span class="linea">${u ? `<b></b>` : ""}</span>${burbuja}`;
    if (estado !== "oculto") { const l = pill.querySelector(".linea"); if (l) { if (u) { l.querySelector("b")!.textContent = `${u.quien}: `; l.append(u.texto); } else l.textContent = "Chat"; } }
    pill.setAttribute("aria-label", estado === "oculto" ? `Chat${sinLeer ? `, ${sinLeer} sin leer` : ""}` : `Chat: ${u ? `${u.quien} dice ${u.texto}` : "sin mensajes"}. Toca para abrirlo entero`);
    pill.setAttribute("aria-expanded", String(estado === "completo"));
  };
  const irA = (e: EstadoChat) => { estado = e; pintarChat(); };
  pill.addEventListener("click", () => irA(siguienteChat(estado, "tocar")));
  plegar.addEventListener("click", () => irA(siguienteChat(estado, "plegar")));
  ocultar.addEventListener("click", () => irA(siguienteChat(estado, "ocultar")));
  enviar.addEventListener("click", () => { texto.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) { const c = (n as HTMLElement).className ?? ""; if (estado !== "completo" && c !== "antes" && c !== "aviso" && !(n.textContent ?? "").startsWith("Tú")) sinLeer++; }
    pintarChat();
  }).observe(lista, { childList: true });
  new MutationObserver(() => { if (form.hidden && estado === "completo") irA("linea"); }).observe(form, { attributes: true, attributeFilter: ["hidden"] }); // Escape inside the box
  pintarChat();

  // ---- 4b · a long press on a line: the sheet with «Denunciar» ----
  const hoja = el("section", { id: "hoja-msg" }); hoja.setAttribute("role", "menu"); hoja.hidden = true;
  const quien = el("div", { clase: "quien" });
  const bDen = el<HTMLButtonElement>("button", { id: "denunciar", clase: "tocable peligro", texto: "Denunciar este mensaje" });
  const bCan = el<HTMLButtonElement>("button", { id: "cancelar-msg", clase: "tocable", texto: "Cancelar" });
  hoja.append(quien, bDen, bCan); body.appendChild(hoja); noJoystick(hoja);
  let sel: { quien: string; texto: string } | null = null;
  const avisar = (t: string) => { const d = el("div", { clase: "aviso-movil", texto: t }); (porId("avisos-movil") ?? (() => { const c = el("div", { id: "avisos-movil" }); body.appendChild(c); return c; })()).appendChild(d); anunciar(t); setTimeout(() => d.remove(), 2500); while ((porId("avisos-movil")?.childElementCount ?? 0) > 3) porId("avisos-movil")!.firstElementChild!.remove(); };
  bCan.addEventListener("click", () => { hoja.hidden = true; });
  bDen.addEventListener("click", () => {
    hoja.hidden = true;
    if (!sel) return;
    avisar(o.denunciar?.(sel) ? "Denuncia enviada. Gracias." : "Denunciar todavía no llega a nadie del equipo: avisa a quien cuida el mundo.");
  });
  let largo: { id: number; x: number; y: number; t: number; li: HTMLElement; reloj: number } | null = null;
  const sueltaLargo = () => { if (largo) { clearTimeout(largo.reloj); largo.li.classList.remove("mantener"); largo = null; } };
  lista.addEventListener("pointerdown", (e) => {
    const li = (e.target as Element).closest("li") as HTMLElement | null;
    if (!li || li.classList.contains("aviso") || (li.querySelector("b")?.textContent ?? "").startsWith("Tú")) return;
    sueltaLargo();
    li.classList.add("mantener");
    largo = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), li, reloj: window.setTimeout(() => {
      if (!largo) return;
      const nombre = (largo.li.querySelector("b")?.textContent ?? "").replace(/\s*\(.*\)\s*$/, ""), t = (largo.li.textContent ?? "").slice((largo.li.querySelector("b")?.textContent ?? "").length).replace(/^:\s*/, "");
      sel = { quien: nombre, texto: t }; quien.textContent = `Mensaje de ${nombre}`; hoja.hidden = false; vibrar(20); sueltaLargo();
    }, PULSACION_LARGA_MS) };
  });
  lista.addEventListener("pointermove", (e) => { if (largo && e.pointerId === largo.id && !esPulsacionLarga({ ms: PULSACION_LARGA_MS, dx: e.clientX - largo.x, dy: e.clientY - largo.y }) && Math.hypot(e.clientX - largo.x, e.clientY - largo.y) > PULSACION_LARGA_TOLERANCIA) sueltaLargo(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) lista.addEventListener(t, sueltaLargo);
  lista.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- 5 · the big map holds the quests: a «Mapa | Misiones» strip in its header ----
  const caja = (): HTMLElement | null => porId("mapa-grande");
  const pestanas = () => {
    const c = caja(), cabeza = c?.querySelector("header");
    if (!c || !cabeza || cabeza.querySelector(".pestanas")) return;
    const p = el("div", { clase: "pestanas" }); p.setAttribute("role", "tablist");
    const tMapa = el<HTMLButtonElement>("button", { clase: "tocable", texto: "Mapa" }), tMis = el<HTMLButtonElement>("button", { clase: "tocable", texto: "Misiones" });
    tMapa.setAttribute("role", "tab"); tMapa.setAttribute("aria-selected", "true"); tMis.setAttribute("role", "tab"); tMis.setAttribute("aria-selected", "false");
    tMis.addEventListener("click", () => { o.mapa.cerrar(); porId("misiones")?.click(); });
    p.append(tMapa, tMis);
    cabeza.querySelector("h2")?.replaceWith(p);
  };
  new MutationObserver(pestanas).observe(body, { childList: true });
  pestanas();

  // ---- 6 · what the screen is doing, for the CSS ----
  const estadoPantalla = () => {
    const libro = porId("libro"), dialogo = porId("dialogo"), hud = porId("pesca-hud");
    const panel = !!document.querySelector("dialog[open]") || (!!libro && !libro.hidden);
    body.classList.toggle("con-panel", panel);
    body.classList.toggle("hablando", !!dialogo && !dialogo.hidden);
    body.classList.toggle("pescando", !!hud && !hud.hidden);
    if (panel && !menu.hidden) cerrarMenu();
    if (panel) hoja.hidden = true;
  };
  setInterval(estadoPantalla, 120);
  estadoPantalla();

  // ---- 7 · one-time hint: how to look around (it fades once; nothing loops) ----
  const CLAVE = "numinia.movil.pista";
  let visto = false; try { visto = localStorage.getItem(CLAVE) === "1"; } catch { /* private mode */ }
  if (!visto) {
    const pista = el("div", { id: "pista-mirar", texto: "Arrastra para mirar" }); pista.setAttribute("aria-hidden", "true");
    body.appendChild(pista);
    setTimeout(() => pista.classList.add("se-va"), 5000); setTimeout(() => pista.remove(), 5600);
    addEventListener("pointerdown", (e) => { if (!(e.target as Element).closest?.("button, dialog, section")) { pista.classList.add("se-va"); try { localStorage.setItem(CLAVE, "1"); } catch { /* */ } } }, { once: true });
  }
}
