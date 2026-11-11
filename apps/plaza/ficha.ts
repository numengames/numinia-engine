// «Tú» — the player sheet (key I, the «Ficha» button, the HUD card's portrait). M3's window with tabs, rebuilt for production
// (rediseño v2, story B): Personaje · Reserva · Insignias. Personaje is two columns: your avatar — a real render of the VRM you
// wear (tu-logica.ts, tools/retratos.mjs), turnable front/back, with «Cambiar avatar» (the H10 chooser, avatar.ts) — and who
// you are: name, Estado chip, what you carry (the weapon and relics, MIS-257), the adventures under way, Carga when the page has
// it, your badges: the whole game side of you on ONE screen. The quest book (J) keeps the full list, people are in Gente (L), the device's and the visit's numbers in Ajustes › Gráficos (menu-ajustes.ts): one thing,
// one place. Nothing here is invented: a source the page does not receive is left out, never «Próximamente».
// Sections come from a registry: a feature or an adventure adds its own with `__numinia.ficha.seccion(id, {...})`.
// innerHTML below only ever receives icono()'s output (a fixed table of house SVGs); every text goes in with textContent.
import { crearDialogo } from "./paneles.ts";
import { teclas } from "./teclas.ts"; // keymap v1: the bag's key is read from the one table (Yours or Default)
import { resumenTexto } from "./inventario-resumen.ts";
import { icono } from "./iconos.ts";
import { retratoDe, insigniasDelLibro, lineaDeTu, equipoDeLaLista, aventurasEnCurso } from "./tu-logica.ts";
import { ICONO_TIPO, SILUETA, colorDe, nombreConCuenta } from "./bolsa-rejilla.ts";
import type { Objeto } from "./bolsa-rejilla.ts";
import type { Insignia } from "./tu-logica.ts";
import { tx, ligar } from "../../packages/feature/src/idioma.ts";

export type HostFicha = {
  session: { entity: number; who: { id: string; nombre: string } | null; stats: { rttMs: number; visible: number } };
  view: { backend: string; power: { mobile: boolean; battery: boolean; scale: number; targetFps(active: boolean): number }; vr: { active: boolean }; ar: { state: string } };
  /** performance.now() when the server welcomed this page (0 = not yet). */
  desde(): number;
  /** `globalThis.__numinia`, read at each use: the optional contracts of other branches (misiones, inventario, estado, carga). */
  otros(): Record<string, any>;
  /** The avatar you wear now (`id` = a house avatar's catalogue id; none = an upload), or null without avatars. */
  avatar?(): { id?: string; nombre: string } | null;
  /** Opens the avatar chooser (avatar.ts, H10); absent = no chooser on this page (no «Cambiar avatar»). */
  cambiarAvatar?(): void;
  /** The world's name (its ficha.json via /status); "" = unknown. */
  mundo?(): string;
};
/** A section of the sheet: `pintar` fills its box (called on opening and once a second while open if `vivo`).
 * `sinTitulo`: its heading is for screen readers only (the section draws its own). */
export type Seccion = { titulo: string | (() => string); orden: number; vivo?: boolean; pestana?: string; sinTitulo?: boolean; pintar(caja: HTMLElement): void };
/** The tabs, in order. A section with no (or an unknown) `pestana` goes to Personaje. */
export const PESTANAS = [
  { id: "personaje", titulo: "Personaje" }, // i18n-ok: data key of the tab; shown through tituloPestana()
  { id: "reserva", titulo: "Reserva" }, // i18n-ok: data key of the tab; shown through tituloPestana()
  { id: "insignias", titulo: "Insignias" }, // i18n-ok: data key of the tab; shown through tituloPestana()
] as const;
/** The tab's name in the active language. */
export const tituloPestana = (id: string): string => id === "personaje" ? tx("Character", "Personaje") : id === "reserva" ? tx("Backpack", "Reserva") : id === "insignias" ? tx("Badges", "Insignias") : id;
/** Where the built-in and the known sections live (a section can also say its own `pestana`). */
const PESTANA_DE: Record<string, string> = { insignias: "insignias", inventario: "reserva", reserva: "reserva" };
/** The ladder of states a person goes through (canon: hoja-de-personaje). The client shows it only when the server tells it. */
export const ESCALERA = ["Desestabilizado", "Confundido", "Colapsado", "Aletargado"] as const; // i18n-ok: the state ids the server speaks; shown through estadoVisible()
/** A state (or «Estable») in the active language. */
export const estadoVisible = (e: string): string => e === "Estable" ? tx("Stable", "Estable") : e === "Desestabilizado" ? tx("Destabilised", "Desestabilizado") : e === "Confundido" ? tx("Confused", "Confundido") : e === "Colapsado" ? tx("Collapsed", "Colapsado") : e === "Aletargado" ? tx("Lethargic", "Aletargado") : e;

/** Fill a box with pairs (a definition list), touching the DOM only when something changed. */
export function pares(caja: HTMLElement, filas: [string, string][]): void {
  const firma = JSON.stringify(filas);
  if (caja.dataset.firma === firma) return;
  caja.dataset.firma = firma;
  const dl = document.createElement("dl");
  for (const [k, v] of filas) { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
  caja.replaceChildren(dl);
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", texto = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto) e.textContent = texto; return e; };
const conIcono = <E extends HTMLElement>(b: E, nombre: string, texto: string): E => { b.innerHTML = icono(nombre, 18); b.append(el("span", "", texto)); return b; };

/** One badge tile: earned = its medal in colour, still to earn = a lock; the name and the quest in the tooltip and the label. */
function ficheroInsignia(x: Insignia, grande = false): HTMLElement {
  const li = el("li", `insignia${x.conseguida ? " si" : " no"}`);
  const t = x.conseguida ? tx(`${x.nombre} (from "${x.mision}")`, `${x.nombre} (de «${x.mision}»)`) : tx(`${x.nombre}: still to earn, finish "${x.mision}"`, `${x.nombre}: por conseguir, termina «${x.mision}»`);
  li.title = t; li.setAttribute("aria-label", t);
  li.innerHTML = icono(x.conseguida ? "medal" : "lock-key", grande ? 26 : 24);
  if (grande) li.append(el("span", "nombre", x.nombre), el("span", "mision", x.conseguida ? tx(`From "${x.mision}"`, `De «${x.mision}»`) : tx(`Finish "${x.mision}"`, `Termina «${x.mision}»`)));
  return li;
}

export function montarFicha(h: HostFicha, boton: HTMLButtonElement) {
  const secciones = new Map<string, Seccion>();
  const cajas = new Map<string, HTMLElement>();
  const panel = crearDialogo({ id: "ficha", titulo: () => tx("You", "Tú"), tecla: "KeyC", accion: "ficha", boton, alAbrir: () => construir() });
  const h2 = panel.dialog.querySelector("h2"); if (h2) ligar(h2, "textContent", "You", "Tú");
  const tecla = el("kbd", "tecla", teclas.etiqueta("ficha")); tecla.setAttribute("aria-hidden", "true");
  panel.dialog.querySelector("h2")?.after(tecla);

  let activa = "personaje";
  const pestanaDe = (id: string, s: Seccion): string => { const p = s.pestana ?? PESTANA_DE[id]; return PESTANAS.some((x) => x.id === p) ? p! : "personaje"; };
  const libro = (): { titulo: string; estado: string; recompensa: string }[] => { try { const l = h.otros().misiones?.libro?.(); return Array.isArray(l) ? l : []; } catch { return []; } };
  function construir(): void {
    cajas.clear();
    const nav = el("div", "pestanas"); nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", tx("Parts of You", "Partes de Tú"));
    for (const t of PESTANAS) {
      const b = el("button", "", tituloPestana(t.id)); b.type = "button"; b.id = `ficha-pestana-${t.id}`; b.dataset.pestana = t.id;
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(t.id === activa)); b.setAttribute("aria-controls", "ficha-hoja"); b.tabIndex = t.id === activa ? 0 : -1;
      b.addEventListener("click", () => { activa = t.id; construir(); (document.getElementById(b.id) as HTMLElement | null)?.focus(); });
      nav.appendChild(b);
    }
    nav.addEventListener("keydown", (e) => {
      const i = PESTANAS.findIndex((t) => t.id === activa), d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault(); activa = PESTANAS[e.key === "Home" ? 0 : e.key === "End" ? PESTANAS.length - 1 : (i + d + PESTANAS.length) % PESTANAS.length].id;
      construir(); (document.getElementById(`ficha-pestana-${activa}`) as HTMLElement | null)?.focus();
    });
    const hoja = el("div", "hoja"); hoja.id = "ficha-hoja"; hoja.dataset.pestana = activa; hoja.setAttribute("role", "tabpanel"); hoja.setAttribute("aria-labelledby", `ficha-pestana-${activa}`);
    for (const [id, s] of [...secciones].sort((a, b) => a[1].orden - b[1].orden)) {
      if (pestanaDe(id, s) !== activa) continue;
      const sec = el("section"), t = el("h3", s.sinTitulo ? "solo-lector" : "", typeof s.titulo === "function" ? s.titulo() : s.titulo), caja = el("div");
      t.id = `ficha-${id}`; sec.setAttribute("aria-labelledby", t.id); sec.dataset.seccion = id;
      sec.append(t, caja); hoja.appendChild(sec); cajas.set(id, caja);
      try { s.pintar(caja); } catch (e) { caja.replaceChildren(el("p", "nota", tx(`(this part failed: ${String((e as Error)?.message ?? e).slice(0, 80)})`, `(esta parte falló: ${String((e as Error)?.message ?? e).slice(0, 80)})`))); }
    }
    panel.cuerpo.replaceChildren(nav, hoja);
  }
  setInterval(() => {
    if (!panel.abierto) return;
    for (const [id, s] of secciones) if (s.vivo) { const c = cajas.get(id); if (c) { try { s.pintar(c); } catch { /* shown on the next opening */ } } }
  }, 1000);

  const api = {
    /** Open the sheet, on a tab if given ("personaje" | "reserva" | "insignias"). */
    abrir: (pestana?: string) => { if (pestana && PESTANAS.some((t) => t.id === pestana) && pestana !== activa) { activa = pestana; if (panel.abierto) construir(); } panel.abrir(); },
    cerrar: () => panel.cerrar(), abierto: () => panel.abierto, pestana: () => activa,
    /** Add or replace a section (a feature's or an adventure's). Shown from the next opening (now, if open). */
    seccion(id: string, s: Seccion): void { secciones.set(id, s); if (panel.abierto) construir(); },
    quitarSeccion(id: string): void { secciones.delete(id); if (panel.abierto) construir(); },
    /** The sheet as plain text (for checks and agents): what a screen reader would read. */
    texto: (): string => panel.dialog.textContent ?? "",
  };

  // ---------- Personaje: your avatar on the left, who you are on the right ----------
  api.seccion("personaje", {
    titulo: () => tx("Character", "Personaje"), orden: 10, vivo: true, sinTitulo: true,
    pintar: (c) => {
      let r = c.firstElementChild as HTMLElement | null;
      if (!r || !r.classList.contains("tu-personaje")) { r = construirPersonaje(); c.replaceChildren(r); }
      refrescarPersonaje(r);
    },
  });
  let deEspalda = false;
  function construirPersonaje(): HTMLElement {
    const r = el("div", "tu-personaje");
    const fig = el("figure", "tu-figura"), marco = el("div", "tu-marco"), pie = el("div", "tu-acciones");
    fig.append(marco, pie);
    if (h.cambiarAvatar) {
      const b = conIcono(el("button", "tu-cambiar"), "user", ""); b.type = "button";
      ligar(b.lastElementChild as HTMLElement, "textContent", "Change avatar", "Cambiar avatar");
      ligar(b, "title", "Pick another house avatar or upload your .vrm", "Elegir otro avatar de la casa o subir tu .vrm");
      b.addEventListener("click", () => { panel.cerrar(); h.cambiarAvatar!(); });
      pie.append(b);
    }
    const girar = el("button", "tu-girar"); girar.type = "button"; girar.innerHTML = icono("arrow-clockwise", 18);
    girar.addEventListener("click", () => { deEspalda = !deEspalda; refrescarPersonaje(r); });
    pie.append(girar);
    const datos = el("div", "tu-datos");
    const cab = el("div", "tu-cabeza"); cab.append(el("p", "tu-nombre"), el("span", "chip tu-chip")); // i18n-ok: CSS class names / selectors, not text
    const est = el("div", "tu-bloque tu-estado"), ol = el("ol", "escalera"); ol.setAttribute("aria-label", tx("State ladder", "Escalera del estado")); // i18n-ok: CSS class names / selectors, not text
    for (const n of ["Estable", ...ESCALERA]) ol.appendChild(el("li", "chip", estadoVisible(n)));
    est.append(el("h4", "", tx("State", "Estado")), ol); ol.title = tx("If you get weakened, you go down this ladder.", "Si te debilitan, bajas por esta escalera.");
    const reserva = el("div", "tu-bloque tu-reserva"); reserva.append(el("h4", "", tx("You carry", "Llevas contigo")), el("div", "tu-equipo"), el("p", "nota tu-reserva-texto")); // i18n-ok: CSS class names / selectors, not text
    const aventuras = el("div", "tu-bloque tu-aventuras"); aventuras.append(el("h4", "", tx("Adventures under way", "Aventuras en curso")), el("ul", "tu-lista-aventuras"), el("p", "nota")); // i18n-ok: CSS class names / selectors, not text
    const carga = el("div", "tu-bloque tu-carga"), fila = el("div", "tu-barra-fila"), barra = el("div", "tu-barra"); // i18n-ok: CSS class names / selectors, not text
    barra.append(el("i")); barra.setAttribute("role", "meter"); barra.setAttribute("aria-label", tx("Load", "Carga")); barra.setAttribute("aria-valuemin", "0");
    fila.append(barra, el("span", "tu-num")); carga.append(el("h4", "", tx("Load", "Carga")), fila);
    const ins = el("div", "tu-bloque tu-insignias"); ins.append(el("h4"), el("ul", "insignias"), el("p", "nota")); // i18n-ok: CSS class names / selectors, not text
    datos.append(cab, el("p", "tu-linea"), reserva, aventuras, carga, est, ins);
    r.append(fig, datos);
    return r;
  }
  /** The four equipment slots (weapon + three relics): a house icon, rarity as the border, the name under it; empty = a silhouette. */
  function pintarEquipo(caja: HTMLElement, lista: unknown, nota: HTMLElement, rs: { objetos: number; portados: number; prestigio: number }): void {
    const { arma, reliquias } = equipoDeLaLista(lista), firma = JSON.stringify([arma, reliquias, rs]);
    if (caja.dataset.firma === firma) return; caja.dataset.firma = firma;
    const hueco = (o: Objeto | null, forma: "arma" | "reliquia"): HTMLElement => {
      const li = el("div", `tu-hueco${o ? "" : " vacio"}`); li.setAttribute("role", "group"); // i18n-ok: CSS class names / selectors, not text
      const ic = el("span", "ic"); ic.innerHTML = icono(o ? (o.icono || ICONO_TIPO[o.tipo]) : SILUETA[forma], 26);
      const t = o ? nombreConCuenta(o) : forma === "arma" ? tx("No weapon", "Sin arma") : tx("No relic", "Sin reliquia");
      li.setAttribute("aria-label", o ? `${forma === "arma" ? tx("Weapon", "Arma") : tx("Relic", "Reliquia")}: ${t}` : t);
      if (o) li.style.setProperty("--c", colorDe(o));
      li.append(ic, el("span", "nom", t)); li.title = li.getAttribute("aria-label")!;
      return li;
    };
    caja.setAttribute("role", "group"); caja.setAttribute("aria-label", tx("One weapon and up to three relics", "Un arma y hasta tres reliquias"));
    caja.replaceChildren(hueco(arma, "arma"), ...[0, 1, 2].map((i) => hueco(reliquias[i] ?? null, "reliquia")));
    nota.textContent = rs.objetos > rs.portados ? tx(`${resumenTexto(rs)} · the rest, in the Backpack (${teclas.etiqueta("bolsa")})`, `${resumenTexto(rs)} · el resto, en la Bolsa (${teclas.etiqueta("bolsa")})`) : resumenTexto(rs);
  }
  /** Up to three adventures under way: title, «paso 2 de 5», the step you are on; the one you follow first. */
  function pintarAventuras(r: HTMLElement, libro: unknown): void {
    const todas = aventurasEnCurso(libro), firma = JSON.stringify(todas);
    if (r.dataset.aventuras === firma) return; r.dataset.aventuras = firma;
    const caja = r.querySelector(".tu-aventuras") as HTMLElement, ul = caja.querySelector("ul") as HTMLElement, nota = caja.querySelector(".nota") as HTMLElement;
    ul.replaceChildren(...todas.slice(0, 3).map((a, i) => {
      const li = el("li", `tu-aventura${a.seguida ? " seguida" : ""}`), cab = el("div", "cab"); // i18n-ok: CSS class names / selectors, not text
      cab.append(el("span", "titulo", a.titulo), el("span", "paso", a.pasos ? tx(`step ${Math.min(a.pasos, a.paso + 1)} of ${a.pasos}`, `paso ${Math.min(a.pasos, a.paso + 1)} de ${a.pasos}`) : ""));
      const barra = el("div", "tu-barra"); barra.append(el("i")); (barra.firstElementChild as HTMLElement).style.width = a.pasos ? `${Math.min(100, (a.paso / a.pasos) * 100)}%` : "0%";
      li.append(cab, barra); if (a.siguiente && i === 0) li.append(el("p", "sig", a.siguiente));
      return li;
    }));
    nota.replaceChildren();
    if (!todas.length) nota.textContent = tx("No adventure under way. Talk to people in the plaza to start one.", "Ninguna aventura en curso. Habla con la gente de la plaza para empezar una.");
    else {
      if (todas.length > 3) nota.append(tx(`And ${todas.length - 3} more. `, `Y ${todas.length - 3} más. `));
      const b = el("button", "tu-libro", tx("Open the quest journal (J)", "Abrir el libro de misiones (J)")); b.type = "button"; b.setAttribute("aria-keyshortcuts", "J");
      b.addEventListener("click", () => { panel.cerrar(); const m = document.getElementById("misiones"); if (m && document.getElementById("libro")?.hidden) m.click(); });
      nota.append(b);
    }
  }
  function refrescarPersonaje(r: HTMLElement): void {
    const q = <T extends HTMLElement = HTMLElement>(s: string) => r.querySelector(s) as T;
    const set = (n: HTMLElement, t: string) => { if (n.textContent !== t) n.textContent = t; };
    const av = (() => { try { return h.avatar?.() ?? null; } catch { return null; } })();
    // the figure: the front or back render of the VRM you wear; an avatar without one gets the house silhouette
    if (!retratoDe(av?.id, "espalda")) deEspalda = false;
    const url = retratoDe(av?.id, deEspalda ? "espalda" : "cuerpo"), girar = q<HTMLButtonElement>(".tu-girar");
    girar.hidden = !retratoDe(av?.id, "espalda");
    const tGirar = deEspalda ? tx("Turn: see it from the front", "Girar: verlo de frente") : tx("Turn: see it from the back", "Girar: verlo de espalda"); girar.title = tGirar; girar.setAttribute("aria-label", tGirar);
    const ff = `${url}|${av?.nombre ?? ""}`;
    if (r.dataset.figura !== ff) {
      r.dataset.figura = ff;
      const marco = q(".tu-marco");
      const silueta = () => { const s = el("div", "tu-silueta"); s.innerHTML = icono("user", 160); s.setAttribute("role", "img"); s.setAttribute("aria-label", av ? tx(`${av.nombre}, no portrait`, `${av.nombre}, sin retrato`) : tx("No avatar", "Sin avatar")); return s; };
      if (url) {
        const img = el("img"); img.alt = `${av!.nombre}, ${deEspalda ? tx("back view", "de espalda") : tx("front view", "de frente")}`; img.decoding = "async";
        img.addEventListener("error", () => img.replaceWith(silueta()), { once: true });
        img.src = url; marco.replaceChildren(img);
      } else marco.replaceChildren(silueta());
    }
    // name, Estado chip, the line under the name
    const otros = h.otros();
    const e = otros.estado?.actual?.() as string | undefined, i = e ? ESCALERA.indexOf(e as (typeof ESCALERA)[number]) : -1;
    set(q(".tu-nombre"), h.session.who?.nombre ?? tx("Guest", "Invitado"));
    const chip = q(".tu-chip");
    set(chip, estadoVisible(i >= 0 ? ESCALERA[i] : "Estable")); chip.classList.toggle("ok", i < 0); chip.classList.toggle("aviso", i === 0 || i === 1); chip.classList.toggle("mal", i >= 2);
    const t0 = h.desde();
    set(q(".tu-linea"), lineaDeTu({ avatar: av?.nombre, mundo: h.mundo?.() ?? "", ms: t0 > 0 ? performance.now() - t0 : 0 }));
    q(".escalera").querySelectorAll("li").forEach((li, k) => {
      const actual = k === i + 1;
      li.classList.toggle("ok", actual && k === 0); li.classList.toggle("aviso", actual && (k === 1 || k === 2)); li.classList.toggle("mal", actual && k > 2);
      if (actual) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    // what you carry (the inventario contract: one weapon, up to three relics) and the adventures under way (the misiones
    // contract), then Carga (the lucha client, as on the HUD card): each only when the page has its source
    const inv = otros.inventario, rs = (() => { try { return typeof inv?.resumen === "function" ? inv.resumen() : null; } catch { return null; } })();
    q(".tu-reserva").hidden = !rs;
    if (rs) pintarEquipo(q(".tu-equipo"), (() => { try { return typeof inv?.lista === "function" ? inv.lista() : []; } catch { return []; } })(), q(".tu-reserva-texto"), rs);
    pintarAventuras(r, libro());
    const cg = (() => { try { return otros.carga?.actual?.() as { valor: number; max: number } | null | undefined; } catch { return null; } })();
    const hayCarga = !!cg && Number.isFinite(cg.valor) && Number.isFinite(cg.max) && cg.max > 0;
    q(".tu-carga").hidden = !hayCarga;
    if (hayCarga) {
      const m = Math.round(cg!.max), v = Math.min(m, Math.max(0, Math.round(cg!.valor))), b = q(".tu-carga .tu-barra"); // i18n-ok: CSS class names / selectors, not text
      (b.firstElementChild as HTMLElement).style.width = `${(v / m) * 100}%`; set(q(".tu-num"), `${v} / ${m}`);
      b.setAttribute("aria-valuemax", String(m)); b.setAttribute("aria-valuenow", String(v)); b.setAttribute("aria-valuetext", tx(`${v} of ${m}`, `${v} de ${m}`));
    }
    // badges: earned first, then the locked ones still to earn (six here; the Insignias tab has them all)
    const todas = insigniasDelLibro(libro()), fi = JSON.stringify(todas);
    if (r.dataset.insignias !== fi) {
      r.dataset.insignias = fi;
      const si = todas.filter((x) => x.conseguida).length;
      set(q(".tu-insignias h4"), todas.length ? tx(`Badges · ${si} of ${todas.length}`, `Insignias · ${si} de ${todas.length}`) : tx("Badges", "Insignias")); // i18n-ok: CSS class names / selectors, not text
      q(".tu-insignias ul").replaceChildren(...todas.slice(0, 6).map((x) => ficheroInsignia(x))); // i18n-ok: CSS class names / selectors, not text
      const v = q(".tu-insignias .nota"); // i18n-ok: CSS class names / selectors, not text
      v.textContent = !todas.length ? tx("You have no badges yet: you earn them by finishing quests (J).", "Aún no tienes insignias: se ganan terminando misiones (J).") : todas.length > 6 ? tx(`And ${todas.length - 6} more in the Badges tab.`, `Y ${todas.length - 6} más en la pestaña Insignias.`) : "";
      v.hidden = !v.textContent;
    }
  }

  // ---------- Insignias: every badge you have or are on the way to, with its quest ----------
  api.seccion("insignias", {
    titulo: () => tx("Badges", "Insignias"), orden: 50, vivo: true,
    pintar: (c) => {
      const todas = insigniasDelLibro(libro()), firma = JSON.stringify(todas);
      if (c.dataset.firma === firma) return; c.dataset.firma = firma;
      if (!todas.length) return void c.replaceChildren(el("p", "nota", tx("You have no badges yet. You earn them by finishing quests (J): those of the quests under way show here with a lock until you finish them.", "Aún no tienes insignias. Se ganan terminando misiones (J): las de las misiones que lleves en curso salen aquí con candado hasta que las termines.")));
      const si = todas.filter((x) => x.conseguida).length;
      const ul = el("ul", "insignias grandes"); ul.append(...todas.map((x) => ficheroInsignia(x, true)));
      c.replaceChildren(el("p", "tu-cuenta", tx(`${si} of ${todas.length} earned`, `${si} de ${todas.length} conseguidas`)), ul);
    },
  });
  // ---------- Reserva: the Y1 inventario contract; the whole Reserva (carry / keep) is the R panel, one click away ----------
  api.seccion("inventario", { titulo: () => tx("Inventory", "Inventario"), orden: 70, pintar: (c) => { c.replaceChildren(el("p", "nota", tx("This world has no goods feature: your items are not kept here.", "Este mundo no tiene la función bienes: aquí no se guardan objetos tuyos."))); } }); // N10: apps/plaza/bienes.ts replaces it
  api.seccion("reserva", {
    titulo: () => tx("Backpack", "Reserva"), orden: 71, vivo: true,
    pintar: (c) => {
      const i = h.otros().inventario, r = typeof i?.resumen === "function" ? i.resumen() : null;
      const firma = JSON.stringify([r, typeof i?.lista === "function" ? i.lista().map((o: { nombre: string; n: number; portado: boolean }) => [o.nombre, o.n, o.portado]) : null]);
      if (c.dataset.firma === firma) return; c.dataset.firma = firma;
      if (!r) return void c.replaceChildren(el("p", "nota", tx("This server has no inventory.", "Este servidor no lleva inventario.")));
      const ul = el("ul");
      for (const o of i.lista() as { nombre: string; n: number; portado: boolean }[]) ul.appendChild(el("li", "", `${o.n > 1 ? `${o.nombre} × ${o.n}` : o.nombre}${o.portado ? tx(" (with you)", " (contigo)") : ""}`));
      const k = teclas.etiqueta("bolsa"), b = el("button", "", tx(`Open the Backpack (${k})`, `Abrir la Reserva (${k})`)); b.type = "button"; b.setAttribute("aria-keyshortcuts", k);
      b.addEventListener("click", () => { panel.cerrar(); i.abrir(); });
      c.replaceChildren(el("p", "", resumenTexto(r)), ...(r.objetos ? [ul] : []), b);
    },
  });
  return api;
}
