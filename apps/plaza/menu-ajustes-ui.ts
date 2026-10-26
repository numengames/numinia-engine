// t_45ef2f70: the settings window itself (the dialog, its tabs and search, the «Este aparato» facts). menu-ajustes.ts keeps
// the registry and everything a setting DOES (applied before the first frame: stored choices, the power policy, the
// accessibility classes); this file only draws the window and arrives after the first frame (or when someone presses the
// gear, whichever comes first).
import type { Ajustes, Grupo, Valor, Vista } from "../../packages/client/src/ajustes.ts";
import type { ClientSession } from "../../packages/client/src/index.ts";
import type { createView } from "../../packages/render/src/index.ts";
import { icono } from "./iconos.ts";
import { filasAparato, filasIdentidad, infoDom } from "./info-aparato.ts";
import { escribiendo } from "./escribiendo.ts";
import type { montarEdicion } from "./edicion.ts";
import { categoriaInicial, categoriaTrasPulsar, categoriaVisible, modoAjustes, pestanaSiguiente } from "./ajustes-pestanas.ts";

type View = Awaited<ReturnType<typeof createView>>;
/** Inside the menu, O closes it unless the key is text being typed. */
const escribeTexto = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "reset", "color"].includes((el as HTMLInputElement).type);
};

const TECLAS: Record<string, string> = { Escape: "Escape", Space: "Espacio", Enter: "Intro", Tab: "Tabulador", Delete: "Supr", Backspace: "Retroceso", ShiftLeft: "Mayús", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
const nombreTecla = (code: string): string => TECLAS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Teclado numérico ");
function textoValor(s: Vista): string {
  if (s.tipo === "bool") return s.valor ? "sí" : "no";
  if (s.tipo === "numero") return `${s.valor}${s.unidad ? ` ${s.unidad}` : ""}`;
  if (s.tipo === "eleccion") return s.opciones?.find((o) => o.valor === s.valor)?.nombre ?? String(s.valor);
  return nombreTecla(String(s.valor));
}

export type MenuAjustes = { abrir(): boolean; cerrar(): void; abierto(): boolean };
export type ContextoMenu = { view: View; session: ClientSession; a: Ajustes; edicion: ReturnType<typeof montarEdicion>; numinia: Record<string, unknown> };

export function montarMenuAjustes(c: ContextoMenu): MenuAjustes {
  const { view, session, a, edicion } = c, o = { numinia: c.numinia };
  const html = document.documentElement, $ = (id: string) => document.getElementById(id);
  const dlg = $("ajustes") as HTMLDialogElement | null, boton = $("ajustes-abrir") as HTMLButtonElement | null;
  const listaEl = $("ajustes-grupos"), estado = $("ajustes-estado"), titulo = $("ajustes-titulo");
  if (!dlg || !boton || !listaEl || !estado) { console.warn("[ajustes] faltan #ajustes, #ajustes-abrir, #ajustes-grupos o #ajustes-estado en la página"); return { abrir: () => false, cerrar() {}, abierto: () => false }; }
  const lista: HTMLElement = listaEl;

  let espera: ReturnType<typeof setTimeout> | undefined;
  const anunciar = (texto: string, ms = 0) => { clearTimeout(espera); espera = setTimeout(() => { estado.textContent = texto; }, ms); };
  const cid = (id: string) => `ajuste-${id}`;
  function elegir(id: string, v: Valor, ms = 0): void {
    const r = a.set(id, v);
    if (!r.ok) { anunciar(`No: ${r.issues[0].message}`); return; }
    const s = a.lista().find((x) => x.id === id);
    if (s) anunciar(`${s.nombre}: ${textoValor(s)}`, ms);
  }
  function fila(s: Vista): HTMLElement {
    const div = document.createElement("div"), id = cid(s.id);
    div.className = `ajuste ${s.tipo}`; div.dataset.id = s.id; div.hidden = !s.visible;
    const label = document.createElement("label"); label.htmlFor = id; label.textContent = s.nombre;
    const desc = document.createElement("p"); desc.id = `${id}-d`; desc.className = "describe"; desc.textContent = s.describe;
    let control: HTMLElement;
    if (s.tipo === "bool") {
      const i = document.createElement("input"); i.type = "checkbox"; i.checked = s.valor === true;
      i.addEventListener("change", () => elegir(s.id, i.checked));
      control = i; div.append(i, label);
    } else if (s.tipo === "numero") {
      const i = document.createElement("input"), out = document.createElement("output");
      i.type = "range"; i.min = String(s.min); i.max = String(s.max); i.step = String(s.paso); i.value = String(s.valor);
      i.setAttribute("aria-valuetext", textoValor(s));
      out.id = `${id}-v`; out.htmlFor.add(id); out.textContent = textoValor(s);
      i.addEventListener("input", () => elegir(s.id, Number(i.value), 400)); // a slider says its value itself; the status waits
      control = i; div.append(label, out, i);
    } else if (s.tipo === "eleccion") {
      const sel = document.createElement("select");
      for (const op of s.opciones ?? []) sel.add(new Option(op.nombre, op.valor));
      sel.value = String(s.valor);
      sel.addEventListener("change", () => elegir(s.id, sel.value));
      control = sel; div.append(label, sel);
    } else { // tecla: shown only (remapping comes later): «Abrir y cerrar los ajustes  O»
      const k = document.createElement("kbd"); k.textContent = nombreTecla(String(s.valor));
      const t = document.createElement("span"); t.className = "nombre"; t.textContent = s.nombre;
      control = k; div.append(t, k);
    }
    control.id = id;
    let describedBy = desc.id;
    div.append(desc);
    if (s.nota) { const n = document.createElement("p"); n.id = `${id}-n`; n.className = "nota"; n.textContent = s.nota; div.append(n); describedBy += ` ${n.id}`; }
    control.setAttribute("aria-describedby", describedBy);
    return div;
  }
  function grupoDom(g: Grupo): HTMLFieldSetElement {
    const fs = document.createElement("fieldset"), lg = document.createElement("legend");
    fs.dataset.grupo = g.id; lg.textContent = g.nombre; fs.append(lg);
    if (g.describe) { const p = document.createElement("p"); p.className = "describe"; p.textContent = g.describe; fs.append(p); }
    for (const s of g.ajustes) fs.append(fila(s));
    if (g.id === "controles") { // the features' keys, read-only (they come from the features' actions)
      const acts = session.features.actions().filter((x) => x.key);
      if (acts.length) {
        const ul = document.createElement("ul"); ul.className = "teclas"; ul.setAttribute("aria-label", "Teclas de las funciones");
        for (const x of acts) { const li = document.createElement("li"), k = document.createElement("kbd"); k.textContent = nombreTecla(x.key!); li.append(k, ` ${x.label}`); ul.append(li); }
        fs.append(ul);
      }
    }
    fs.hidden = !g.ajustes.some((s) => s.visible);
    return fs;
  }
  // ---- the window: categories on the left, a search, «Restablecer esta página» (MMO interface, M2) ----
  const CATEGORIAS: Array<{ id: string; nombre: string; icono: string }> = [
    { id: "juego", nombre: "Juego", icono: "game-controller" }, { id: "interfaz", nombre: "Interfaz", icono: "desktop" },
    { id: "controles", nombre: "Controles", icono: "hand-grabbing" }, { id: "graficos", nombre: "Gráficos", icono: "image-square" },
    { id: "sonido", nombre: "Sonido y voz", icono: "music-notes" }, { id: "accesibilidad", nombre: "Accesibilidad", icono: "eye" },
    { id: "cuenta", nombre: "Cuenta y privacidad", icono: "user" },
  ];
  /** Which category a registry group lives in: the engine's groups by id; features' and worlds' groups are «Juego». */
  const categoriaDe = (grupo: string): string => ({ graficos: "graficos", aparato: "graficos", sonido: "sonido", controles: "controles", accesibilidad: "accesibilidad", interfaz: "interfaz", privacidad: "cuenta", identidad: "cuenta" } as Record<string, string>)[grupo] ?? "juego";
  let categoria = "", busqueda = "";
  const cuerpo = document.createElement("div"); cuerpo.className = "ajustes-cuerpo";
  // MIS-239: ONE card. Wide screen: the categories are a strip of tabs (role=tablist; ↑ ↓ ← → Home End move between them).
  // Narrow screen / phone profile: no strip, each category is a heading that folds and unfolds its settings (accordion).
  const nav = document.createElement("nav"); nav.setAttribute("aria-label", "Categorías de ajustes");
  const tiras = document.createElement("div"); tiras.setAttribute("role", "tablist"); tiras.setAttribute("aria-orientation", "vertical"); tiras.setAttribute("aria-label", "Pestañas de ajustes");
  nav.append(tiras);
  lista.before(cuerpo); cuerpo.append(nav, lista);
  let modo = modoAjustes(innerWidth, html.dataset.aparato ?? "");
  const aplicarModo = (): boolean => {
    const nuevo = modoAjustes(innerWidth, html.dataset.aparato ?? "");
    const cambio = nuevo !== modo; modo = nuevo;
    dlg.classList.toggle("acordeon", modo === "acordeon");
    dlg.dataset.modo = modo;
    if (modo === "pestanas") { lista.setAttribute("role", "tabpanel"); lista.setAttribute("aria-labelledby", categoria ? `ajustes-tab-${categoria}` : "ajustes-titulo"); } else { lista.removeAttribute("role"); lista.removeAttribute("aria-labelledby"); }
    return cambio;
  };
  const buscar = document.createElement("input"); buscar.type = "search"; buscar.id = "ajustes-buscar"; buscar.placeholder = "Buscar un ajuste";
  const etqBuscar = document.createElement("label"); etqBuscar.htmlFor = "ajustes-buscar"; etqBuscar.className = "solo-lector"; etqBuscar.textContent = "Buscar un ajuste";
  const cab = dlg.querySelector(".cabecera"); cab?.insertBefore(etqBuscar, cab.lastElementChild); cab?.insertBefore(buscar, cab.lastElementChild);
  const pagina = document.createElement("button"); pagina.type = "button"; pagina.id = "ajustes-restablecer-pagina"; pagina.textContent = "Restablecer esta página";
  $("ajustes-restablecer")?.before(pagina);
  function mostrar(): void {
    const q = busqueda.trim().toLowerCase(), buscando = q !== "";
    const visibles = new Map(a.lista().map((x) => [x.id, x.visible])); // once per call: lista() rebuilds every view
    const coinciden = new Set<string>(); // categories with at least one setting shown by the search
    for (const fs of lista.querySelectorAll<HTMLFieldSetElement>("fieldset")) {
      const cat = categoriaDe(fs.dataset.grupo ?? "");
      let alguno = false;
      for (const f of fs.querySelectorAll<HTMLElement>(".ajuste")) {
        const visible = visibles.get(f.dataset.id!) !== false;
        const coincide = !q || (f.textContent ?? "").toLowerCase().includes(q);
        f.hidden = !visible || !coincide; if (!f.hidden) alguno = true;
      }
      if (alguno) coinciden.add(cat);
      fs.hidden = !alguno || !categoriaVisible(cat, categoria, buscando);
    }
    const con = (c: string) => [...lista.querySelectorAll<HTMLFieldSetElement>("fieldset")].some((fs) => categoriaDe(fs.dataset.grupo ?? "") === c && [...fs.querySelectorAll<HTMLElement>(".ajuste")].some((f) => visibles.get(f.dataset.id!) !== false));
    const hay = new Map(CATEGORIAS.map((c) => [c.id, con(c.id)]));
    const tabs = [...tiras.querySelectorAll<HTMLButtonElement>("button")];
    const sel = !buscando && categoria && hay.get(categoria) ? categoria : tabs.find((b) => !b.hidden && hay.get(b.dataset.cat!))?.dataset.cat;
    for (const b of tabs) {
      const c = b.dataset.cat!, hayC = hay.get(c) === true, esta = !buscando && c === categoria;
      b.hidden = !hayC; b.setAttribute("aria-selected", String(esta)); b.tabIndex = c === sel ? 0 : -1;
    }
    for (const sec of lista.querySelectorAll<HTMLElement>("section.cat")) { // folded sections: the heading shows its state
      const c = sec.dataset.cat!, abierta = categoriaVisible(c, categoria, buscando), cab = sec.querySelector<HTMLButtonElement>(".cat-cab")!;
      sec.hidden = buscando ? !coinciden.has(c) : hay.get(c) !== true;
      cab.setAttribute("aria-expanded", String(abierta)); sec.classList.toggle("abierta", abierta);
    }
    if (modo === "pestanas") lista.setAttribute("aria-labelledby", sel ? `ajustes-tab-${sel}` : "ajustes-titulo");
    pagina.hidden = !buscando && !categoria; // a folded accordion has no «page» to reset
    pagina.textContent = modo === "acordeon" ? "Restablecer esta sección" : "Restablecer esta página";
    if (!lista.querySelector("fieldset:not([hidden])") && (buscando || modo === "pestanas")) { const v = lista.querySelector(".vacio") ?? Object.assign(document.createElement("p"), { className: "vacio" }); v.textContent = q ? "Ningún ajuste coincide." : "Esta categoría no tiene ajustes."; lista.append(v); } else lista.querySelector(".vacio")?.remove();
    const editar = lista.querySelector<HTMLElement>("#ajustes-editar-interfaz"); if (editar) editar.hidden = !!q || categoria !== "interfaz" || !edicion.disponible;
  }
  // read-only facts: the device and this visit under Gráficos, who you are under Cuenta y privacidad (live while open)
  const fuente = { view, session, desde: () => Number((o.numinia.informe as { bienvenidaMs?: number } | undefined)?.bienvenidaMs) || 0, ahora: () => performance.now() };
  const infos = [
    infoDom("aparato", "Este aparato", "Lo que da tu aparato ahora y cómo va esta visita. Solo se lee: lo de arriba lo cambia.", () => filasAparato(fuente)),
    infoDom("identidad", "Tu identidad", "Cómo te conoce este mundo desde este navegador. Solo se lee.", () => filasIdentidad(fuente)),
  ];
  setInterval(() => { if (dlg.open) for (const x of infos) x.pintar(); }, 1000);
  const conAjustes = () => CATEGORIAS.filter((c) => [...lista.querySelectorAll<HTMLFieldSetElement>("fieldset")].some((fs) => categoriaDe(fs.dataset.grupo ?? "") === c.id && !fs.hidden)).map((c) => c.id);
  /** Pulsar una pestaña o un encabezado: the category it names opens (a folded heading pressed again folds it). */
  const pulsar = (c: string) => { categoria = categoriaTrasPulsar(modo, categoria, c); busqueda = ""; buscar.value = ""; mostrar(); };
  const construir = () => {
    const fss = [...a.grupos().map(grupoDom), ...infos.map((x) => x.fs)];
    // one section per category: its heading (a button, shown only as a folded section) and its groups
    const secciones = CATEGORIAS.map((c) => {
      const sec = document.createElement("section"), cab = document.createElement("button"), cu = document.createElement("div");
      sec.className = "cat"; sec.dataset.cat = c.id; cu.className = "cat-cuerpo"; cu.id = `ajustes-cat-${c.id}`;
      cab.type = "button"; cab.className = "cat-cab"; cab.id = `ajustes-cab-${c.id}`; cab.dataset.cat = c.id; cab.setAttribute("aria-controls", cu.id); cab.setAttribute("aria-expanded", "false");
      cab.innerHTML = `${icono(c.icono, 20)}<span>${c.nombre}</span>${icono("caret-down", 18)}`; /* constants only */
      cu.setAttribute("role", "region"); cu.setAttribute("aria-labelledby", cab.id);
      cab.addEventListener("click", () => pulsar(c.id));
      cu.append(...fss.filter((fs) => categoriaDe(fs.dataset.grupo ?? "") === c.id));
      sec.append(cab, cu);
      return sec;
    });
    lista.replaceChildren(...secciones);
    tiras.replaceChildren(...CATEGORIAS.map((c) => {
      const b = document.createElement("button"); b.type = "button"; b.dataset.cat = c.id; b.id = `ajustes-tab-${c.id}`;
      b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "ajustes-grupos"); b.setAttribute("aria-selected", "false"); b.tabIndex = -1;
      b.innerHTML = `${icono(c.icono, 18)}<span>${c.nombre}</span>`; /* constants only */
      b.addEventListener("click", () => pulsar(c.id));
      return b;
    }));
    const fsI = lista.querySelector<HTMLElement>('fieldset[data-grupo="interfaz"]');
    if (fsI) { const e = document.createElement("button"); e.type = "button"; e.id = "ajustes-editar-interfaz"; e.className = "grande"; e.textContent = "Editar interfaz"; e.hidden = true; e.dataset.listo = "1"; e.addEventListener("click", () => { cerrar(); edicion.abrir(); }); fsI.append(e); }
    // the fieldsets start hidden for categories without visible settings: decide with what is there, then show
    for (const fs of lista.querySelectorAll<HTMLFieldSetElement>("fieldset")) fs.hidden = !fs.querySelector(".ajuste:not([hidden])");
    categoria = categoriaInicial(modo, conAjustes(), categoria);
    aplicarModo();
    mostrar();
  };
  // roving focus on the strip: the arrow keys move between the tabs and open the one reached (a game's options menu)
  tiras.addEventListener("keydown", (e) => {
    const ids = [...tiras.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden).map((b) => b.dataset.cat!);
    const act = (document.activeElement as HTMLElement | null)?.dataset?.cat ?? categoria;
    const sig = pestanaSiguiente(ids, act, e.key);
    if (!sig) return;
    e.preventDefault(); categoria = sig; busqueda = ""; buscar.value = ""; mostrar();
    tiras.querySelector<HTMLButtonElement>(`button[data-cat="${sig}"]`)?.focus();
  });
  // turning the phone or resizing the window changes tabs <-> folded sections without losing the open category
  addEventListener("resize", () => { if (aplicarModo()) { categoria = categoriaInicial(modo, conAjustes(), categoria); mostrar(); } });
  buscar.addEventListener("input", () => { busqueda = buscar.value; mostrar(); });
  pagina.addEventListener("click", () => {
    for (const x of a.lista()) if (categoriaDe(x.grupo) === categoria) a.restablecer(x.id);
    anunciar(`Página restablecida: ${CATEGORIAS.find((c) => c.id === categoria)?.nombre}.`);
  });
  construir();
  // any change (the menu, an agent, the B key, a preset, a capability that arrived) updates the controls in place
  a.alCambiar((id) => {
    const s = a.lista().find((x) => x.id === id), fil = lista.querySelector<HTMLElement>(`.ajuste[data-id="${id}"]`);
    if (!s) return;
    if (!fil) { construir(); return; } // a setting declared later
    const c = $(cid(id));
    if (c instanceof HTMLInputElement && c.type === "checkbox") c.checked = s.valor === true;
    else if (c instanceof HTMLInputElement || c instanceof HTMLSelectElement) { if (c.value !== String(s.valor)) c.value = String(s.valor); }
    if (c instanceof HTMLInputElement && c.type === "range") { c.setAttribute("aria-valuetext", textoValor(s)); const out = $(`${cid(id)}-v`); if (out) out.textContent = textoValor(s); }
    mostrar();
  });

  const enXR = () => view.vr.active || view.ar.state !== "off";
  let volverA: HTMLElement | null = null;
  function abrir(): boolean {
    if (!dlg || dlg.open || enXR()) return !!dlg?.open;
    volverA = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    for (const x of infos) x.pintar();
    if (aplicarModo()) { categoria = categoriaInicial(modo, conAjustes(), categoria); mostrar(); }
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    boton!.setAttribute("aria-expanded", "true");
    titulo?.focus(); // a quiet start: the dialog's name is read, nothing changes by accident; Tab walks the settings
    return true;
  }
  function cerrar(): void { if (dlg?.open) dlg.close(); }
  dlg.addEventListener("close", () => {
    boton.setAttribute("aria-expanded", "false");
    const a2 = volverA && document.contains(volverA) && volverA !== document.body ? volverA : null;
    a2?.focus();
  });
  // keys typed in the menu never reach the world (W, B, Space…), like escribiendo() for the chat; O closes, Escape too (native)
  dlg.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "KeyO" && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !escribeTexto(e.target)) { e.preventDefault(); cerrar(); }
  });
  dlg.addEventListener("pointerdown", (e) => e.stopPropagation()); // touching the menu never starts the joystick
  dlg.addEventListener("click", (e) => { // a click on the dimmed page around the panel closes it
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar();
  });
  $("ajustes-cerrar")?.addEventListener("click", cerrar);
  $("ajustes-restablecer")?.addEventListener("click", () => { a.restablecer(); anunciar("Ajustes restablecidos: cada uno vuelve a lo que da tu aparato."); });
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  boton.addEventListener("click", () => { if (dlg.open) cerrar(); else abrir(); });
  // ux2-barra: O opens the bar's «Menú» (main.ts, menu-barra.ts), whose first entry is this; inside the dialog O still closes it
  // hidden in XR (a 3D settings panel inside VR comes later)
  setInterval(() => { const x = enXR(); if (x) cerrar(); if (boton.hidden !== x) boton.hidden = x; }, 250);
  return { abrir: () => abrir(), cerrar: () => cerrar(), abierto: () => dlg.open };
}
