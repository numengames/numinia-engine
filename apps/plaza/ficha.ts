// The player sheet (key I, «Ficha» button): who you are (I1 guest), the device and the quality the page runs at, time
// connected, quests and badges (the misiones contract), the settings (the ajustes contract) and what is coming (avatar
// H10, inventory), clearly marked. Plain accessible HTML: headings, definition lists, real buttons.
// M3: a window with side tabs (Personaje, Reserva, Misiones, Insignias, Gente). Each tab shows the sections filed under it;
// the Reserva, the quests and the people are the existing panels' own data (R, J, L), never a second copy of their logic.
// Sections come from a registry: a feature or an adventure adds its own with `__numinia.ficha.seccion(id, {...})`.
import { duracion } from "../../packages/client/src/mapa.ts";
import { crearDialogo, anunciar } from "./paneles.ts";
import { resumenTexto } from "./inventario.ts";
import { icono } from "./iconos.ts";

export type HostFicha = {
  session: { entity: number; who: { id: string; nombre: string } | null; stats: { rttMs: number; visible: number } };
  view: { backend: string; power: { mobile: boolean; battery: boolean; scale: number; targetFps(active: boolean): number }; vr: { active: boolean }; ar: { state: string } };
  /** performance.now() when the server welcomed this page (0 = not yet). */
  desde(): number;
  /** `globalThis.__numinia`, read at each use: the optional contracts of other branches (misiones, ajustes). */
  otros(): Record<string, any>;
};
/** A section of the sheet: `pintar` fills its box (called on opening and once a second while open if `vivo`). */
export type Seccion = { titulo: string; orden: number; vivo?: boolean; pestana?: string; pintar(caja: HTMLElement): void };
/** The side tabs, in order; `icono` is a house glyph. A section with no (or an unknown) `pestana` goes to Personaje. */
export const PESTANAS = [
  { id: "personaje", titulo: "Personaje", icono: "user" },
  { id: "reserva", titulo: "Reserva", icono: "package" },
  { id: "misiones", titulo: "Misiones", icono: "scroll" },
  { id: "insignias", titulo: "Insignias", icono: "target" },
  { id: "gente", titulo: "Gente", icono: "users" },
] as const;
/** Where the built-in and the known sections live (a section can also say its own `pestana`). */
const PESTANA_DE: Record<string, string> = { misiones: "misiones", insignias: "insignias", inventario: "reserva", reserva: "reserva", gente: "gente" };
/** The ladder of states a person goes through (canon: hoja-de-personaje). The client shows it only when the server tells it. */
export const ESCALERA = ["Desestabilizado", "Confundido", "Colapsado", "Aletargado"] as const;

/** Fill a box with pairs (a definition list), touching the DOM only when something changed. */
export function pares(caja: HTMLElement, filas: [string, string][]): void {
  const firma = JSON.stringify(filas);
  if (caja.dataset.firma === firma) return;
  caja.dataset.firma = firma;
  const dl = document.createElement("dl");
  for (const [k, v] of filas) { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
  caja.replaceChildren(dl);
}
/** Plain text from whatever a contract returns (a string, a number, { nombre | name | titulo }). */
const texto = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  const o = v as Record<string, unknown>;
  const nombre = o.nombre ?? o.name ?? o.titulo ?? o.title;
  const extra = [o.paso ?? o.step, o.progreso ?? (o.hechos !== undefined && o.pasos !== undefined ? `${o.hechos}/${o.pasos}` : undefined)].filter((x) => x !== undefined && x !== "").map(String);
  return nombre !== undefined ? `${String(nombre)}${extra.length ? ` — ${extra.join(" · ")}` : ""}` : JSON.stringify(v).slice(0, 120);
};
const parrafo = (caja: HTMLElement, t: string) => { if (caja.dataset.firma === t) return; caja.dataset.firma = t; const p = document.createElement("p"); p.textContent = t; caja.replaceChildren(p); };
const listaDe = (caja: HTMLElement, items: unknown[], vacio: string, nota = "") => {
  const ts = items.map(texto).filter(Boolean), firma = JSON.stringify([ts, nota]);
  if (caja.dataset.firma === firma) return;
  caja.dataset.firma = firma;
  const p = document.createElement("p"); p.textContent = nota;
  if (!ts.length) { const v = document.createElement("p"); v.textContent = vacio; caja.replaceChildren(v, ...(nota ? [p] : [])); return; }
  const ul = document.createElement("ul");
  for (const t of ts) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }
  caja.replaceChildren(ul, ...(nota ? [p] : []));
};

export function montarFicha(h: HostFicha, boton: HTMLButtonElement) {
  const secciones = new Map<string, Seccion>();
  const cajas = new Map<string, HTMLElement>();
  const panel = crearDialogo({ id: "ficha", titulo: "Ficha", tecla: "KeyI", boton, alAbrir: () => construir() });
  const pie = document.createElement("div"); pie.className = "pie";
  const ajustes = document.createElement("button"); ajustes.type = "button"; ajustes.textContent = "Ajustes";
  ajustes.addEventListener("click", () => {
    const a = h.otros().ajustes;
    if (typeof a?.abrir === "function") { panel.cerrar(); a.abrir(); } else anunciar("Los ajustes llegan pronto (fila N2).");
  });
  pie.appendChild(ajustes);
  const resumen = () => { try { return h.otros().misiones?.resumen?.() ?? null; } catch { return null; } };

  let activa = "personaje";
  const pestanaDe = (id: string, s: Seccion): string => { const p = s.pestana ?? PESTANA_DE[id]; return PESTANAS.some((x) => x.id === p) ? p! : "personaje"; };
  function construir(): void {
    cajas.clear();
    const hayAjustes = typeof h.otros().ajustes?.abrir === "function";
    ajustes.textContent = hayAjustes ? "Ajustes" : "Ajustes (próximamente)";
    if (hayAjustes) ajustes.removeAttribute("aria-disabled"); else ajustes.setAttribute("aria-disabled", "true");
    const nav = document.createElement("div"); nav.className = "lateral pestanas"; nav.setAttribute("role", "tablist"); nav.setAttribute("aria-orientation", "vertical"); nav.setAttribute("aria-label", "Partes de la ficha");
    for (const t of PESTANAS) {
      const b = document.createElement("button"); b.type = "button"; b.id = `ficha-pestana-${t.id}`; b.dataset.pestana = t.id;
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(t.id === activa)); b.setAttribute("aria-controls", "ficha-hoja"); b.tabIndex = t.id === activa ? 0 : -1;
      b.innerHTML = `${icono(t.icono, 18)}<span>${t.titulo}</span>`; // house glyph + a constant title
      b.addEventListener("click", () => { activa = t.id; construir(); (document.getElementById(b.id) as HTMLElement | null)?.focus(); });
      nav.appendChild(b);
    }
    nav.addEventListener("keydown", (e) => {
      const i = PESTANAS.findIndex((t) => t.id === activa), d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault(); activa = PESTANAS[e.key === "Home" ? 0 : e.key === "End" ? PESTANAS.length - 1 : (i + d + PESTANAS.length) % PESTANAS.length].id;
      construir(); (document.getElementById(`ficha-pestana-${activa}`) as HTMLElement | null)?.focus();
    });
    const hoja = document.createElement("div"); hoja.id = "ficha-hoja"; hoja.className = "hoja"; hoja.setAttribute("role", "tabpanel"); hoja.setAttribute("aria-labelledby", `ficha-pestana-${activa}`);
    for (const [id, s] of [...secciones].sort((a, b) => a[1].orden - b[1].orden)) {
      if (pestanaDe(id, s) !== activa) continue;
      const sec = document.createElement("section"), t = document.createElement("h3"), caja = document.createElement("div");
      t.id = `ficha-${id}`; t.textContent = s.titulo; sec.setAttribute("aria-labelledby", t.id); sec.dataset.seccion = id;
      sec.append(t, caja); hoja.appendChild(sec); cajas.set(id, caja);
      try { s.pintar(caja); } catch (e) { parrafo(caja, `(esta parte falló: ${String((e as Error)?.message ?? e).slice(0, 80)})`); }
    }
    hoja.appendChild(pie);
    panel.cuerpo.replaceChildren(nav, hoja);
  }
  setInterval(() => {
    if (!panel.abierto) return;
    for (const [id, s] of secciones) if (s.vivo) { const c = cajas.get(id); if (c) { try { s.pintar(c); } catch { /* shown on the next opening */ } } }
  }, 1000);

  const api = {
    abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), abierto: () => panel.abierto,
    /** Add or replace a section (a feature's or an adventure's). Shown from the next opening (now, if open). */
    seccion(id: string, s: Seccion): void { secciones.set(id, s); if (panel.abierto) construir(); },
    quitarSeccion(id: string): void { secciones.delete(id); if (panel.abierto) construir(); },
    /** The sheet as plain text (for checks and agents): what a screen reader would read. */
    texto: (): string => panel.dialog.textContent ?? "",
  };

  // ---------- the built-in sections ----------
  api.seccion("tu", {
    titulo: "Datos", orden: 10, vivo: true,
    pintar: (c) => {
      const w = h.session.who;
      pares(c, [["Nombre", w?.nombre ?? "Invitado (esperando al servidor…)"], ["Identificador de invitado", w ? `${w.id.slice(0, 6)}… (el mismo en cada visita desde este navegador)` : "—"], ["Tu avatar en esta zona", h.session.entity >= 0 ? `número ${h.session.entity}` : "—"]]);
    },
  });
  // The page does not receive the player's state from the server yet (no field in the snapshot): «Estable», the ladder only as a legend.
  api.seccion("estado", {
    titulo: "Estado", orden: 15, vivo: true,
    pintar: (c) => {
      const e = h.otros().estado?.actual?.() as string | undefined, i = e ? ESCALERA.indexOf(e as (typeof ESCALERA)[number]) : -1;
      const ol = document.createElement("ol"); ol.className = "escalera";
      ESCALERA.forEach((n, k) => { const li = document.createElement("li"); li.textContent = n; if (k === i) li.setAttribute("aria-current", "step"); ol.appendChild(li); });
      const firma = `${i}`; if (c.dataset.firma === firma) return; c.dataset.firma = firma;
      const p = document.createElement("p"); p.className = "estado-actual"; p.textContent = i >= 0 ? ESCALERA[i] : "Estable";
      const n = document.createElement("p"); n.className = "nota"; n.textContent = i >= 0 ? "" : "Sin ningún estado que te afecte. Si te debilitan, subirás por esta escalera:";
      c.replaceChildren(p, ...(i >= 0 ? [] : [n]), ol);
    },
  });
  api.seccion("competencias", { titulo: "Atributos y competencias", orden: 25, pintar: (c) => parrafo(c, "Próximamente: por ahora lo que cuenta es tu Reserva.") });
  api.seccion("aparato", {
    titulo: "Este aparato", orden: 20, vivo: true,
    pintar: (c) => {
      const p = h.view.power, xr = h.view.vr.active ? "realidad virtual" : h.view.ar.state !== "off" ? "realidad aumentada" : "pantalla";
      pares(c, [
        ["Gráficos", h.view.backend],
        ["Clase", p.mobile ? "móvil (cuida el calor: menos cuadros y menos resolución)" : "escritorio"],
        ["Cuadros por segundo", `hasta ${p.targetFps(true)} moviéndote, ${p.targetFps(false)} en reposo`],
        ["Resolución", `${Math.round(p.scale * 100)} %${p.scale < 1 ? " (bajada para no calentar)" : ""}`],
        ["Modo batería", p.battery ? "sí (tecla B para quitarlo)" : "no (tecla B para ponerlo)"],
        ["Viendo en", xr],
      ]);
    },
  });
  api.seccion("sesion", {
    titulo: "Esta visita", orden: 30, vivo: true,
    pintar: (c) => {
      const t0 = h.desde(), s = h.session.stats;
      pares(c, [["Conectado", t0 > 0 ? duracion(performance.now() - t0) : "conectando…"], ["Ping", s.rttMs < 0 ? "—" : `${s.rttMs} ms`], ["Personas a la vista", String(s.visible)]]);
    },
  });
  api.seccion("misiones", {
    titulo: "Misiones", orden: 40, vivo: true,
    pintar: (c) => {
      const r = resumen();
      if (r == null) return parrafo(c, "Todavía no hay misiones en esta zona.");
      if (typeof r === "string") return parrafo(c, r);
      if (Array.isArray(r)) return listaDe(c, r, "No llevas ninguna misión.");
      const o = r as Record<string, unknown>, activas = o.activas ?? o.enCurso ?? o.misiones ?? [];
      const hechas = o.hechas ?? o.completadas;
      // the quests' resumen gives a count of active ones (a bare «• 0» was listed): a count says «N en curso», 0 says nothing
      const lista = typeof activas === "number" ? (activas > 0 ? [`${activas} en curso`] : []) : Array.isArray(activas) ? activas : [activas];
      listaDe(c, lista, "No llevas ninguna misión.", hechas === undefined ? "" : `Terminadas: ${Array.isArray(hechas) ? hechas.length : String(hechas)}`);
    },
  });
  api.seccion("insignias", {
    titulo: "Insignias", orden: 50, vivo: true,
    pintar: (c) => { const r = resumen(), i = r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>).insignias : null; listaDe(c, Array.isArray(i) ? i : [], "Aún no tienes insignias."); },
  });
  api.seccion("libro", { titulo: "Libro de misiones", orden: 45, pestana: "misiones", pintar: (c) => { if (c.firstChild) return; c.appendChild(boton2("Abrir el libro (J)", abrirOtro(() => (document.getElementById("misiones") as HTMLButtonElement | null)!.click(), "El libro de misiones no está disponible."))); } });
  api.seccion("avatar", { titulo: "Avatar", orden: 60, pintar: (c) => parrafo(c, "Próximamente (fila H10): ver y elegir aquí tu avatar, con su retrato.") });
  api.seccion("inventario", { titulo: "Inventario", orden: 70, pintar: (c) => parrafo(c, "Este mundo no tiene la función bienes: aquí no se guardan objetos tuyos.") }); // N10: apps/plaza/bienes.ts replaces it
  const boton2 = (txt: string, ir: () => void) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.addEventListener("click", ir); return b; };
  const abrirOtro = (f: () => unknown, aviso: string) => () => { try { panel.cerrar(); f(); } catch { anunciar(aviso); } };
  api.seccion("reserva", {
    titulo: "Reserva", orden: 71, vivo: true,
    pintar: (c) => { // Y1: the inventario contract; the whole Reserva (carry / keep) is the R panel, one click away
      const i = h.otros().inventario, r = typeof i?.resumen === "function" ? i.resumen() : null;
      const firma = JSON.stringify([r, typeof i?.lista === "function" ? i.lista().map((o: { nombre: string; n: number; portado: boolean }) => [o.nombre, o.n, o.portado]) : null]);
      if (c.dataset.firma === firma) return; c.dataset.firma = firma;
      if (!r) return void c.replaceChildren(Object.assign(document.createElement("p"), { textContent: "Este servidor no lleva inventario." }));
      const ul = document.createElement("ul");
      for (const o of i.lista() as { nombre: string; n: number; portado: boolean }[]) { const li = document.createElement("li"); li.textContent = `${o.n > 1 ? `${o.nombre} × ${o.n}` : o.nombre}${o.portado ? " (contigo)" : ""}`; ul.appendChild(li); }
      const p = document.createElement("p"); p.textContent = resumenTexto(r);
      c.replaceChildren(p, ...(r.objetos ? [ul] : []), boton2("Abrir la Reserva (R)", abrirOtro(() => i.abrir(), "La Reserva no está disponible.")));
    },
  });
  api.seccion("gente", {
    titulo: "Gente conectada", orden: 80, vivo: true,
    pintar: (c) => {
      const v = h.otros().viajar, g = h.otros().gente, lista = (v?.estado?.gente ?? []) as { nombre: string }[];
      const firma = JSON.stringify([lista.map((p) => p.nombre), v?.estado?.todos ?? 0, !!g]);
      if (c.dataset.firma === firma) return; c.dataset.firma = firma;
      const p = document.createElement("p");
      if (!g) { p.textContent = "Este mundo no enseña a la gente conectada."; return void c.replaceChildren(p); }
      p.textContent = lista.length ? `Cerca de ti: ${lista.length}.` : "Abre la lista para ver quién está ahora en este mundo.";
      const ul = document.createElement("ul");
      for (const x of lista) { const li = document.createElement("li"); li.textContent = x.nombre; ul.appendChild(li); }
      c.replaceChildren(p, ...(lista.length ? [ul] : []), boton2("Abrir la lista (L)", abrirOtro(() => g.abrir(), "La lista de gente no está disponible.")));
    },
  });
  return api;
}
