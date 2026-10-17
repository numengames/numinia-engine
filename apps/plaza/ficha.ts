// The player sheet (key I, «Ficha» button): who you are (I1 guest), the device and the quality the page runs at, time
// connected, quests and badges (the misiones contract), the settings (the ajustes contract) and what is coming (avatar
// H10, inventory), clearly marked. Plain accessible HTML: headings, definition lists, real buttons.
// Sections come from a registry: a feature or an adventure adds its own with `__numinia.ficha.seccion(id, {...})`.
import { duracion } from "../../packages/client/src/mapa.ts";
import { crearDialogo, anunciar } from "./paneles.ts";

export type HostFicha = {
  session: { entity: number; who: { id: string; nombre: string } | null; stats: { rttMs: number; visible: number } };
  view: { backend: string; power: { mobile: boolean; battery: boolean; scale: number; targetFps(active: boolean): number }; vr: { active: boolean }; ar: { state: string } };
  /** performance.now() when the server welcomed this page (0 = not yet). */
  desde(): number;
  /** `globalThis.__numinia`, read at each use: the optional contracts of other branches (misiones, ajustes). */
  otros(): Record<string, any>;
};
/** A section of the sheet: `pintar` fills its box (called on opening and once a second while open if `vivo`). */
export type Seccion = { titulo: string; orden: number; vivo?: boolean; pintar(caja: HTMLElement): void };

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
  const panel = crearDialogo({ id: "ficha", titulo: "Tu ficha", tecla: "KeyI", boton, alAbrir: () => construir() });
  const pie = document.createElement("div"); pie.className = "pie";
  const ajustes = document.createElement("button"); ajustes.type = "button"; ajustes.textContent = "Ajustes";
  ajustes.addEventListener("click", () => {
    const a = h.otros().ajustes;
    if (typeof a?.abrir === "function") { panel.cerrar(); a.abrir(); } else anunciar("Los ajustes llegan pronto (fila N2).");
  });
  pie.appendChild(ajustes);
  const resumen = () => { try { return h.otros().misiones?.resumen?.() ?? null; } catch { return null; } };

  function construir(): void {
    panel.cuerpo.replaceChildren(); cajas.clear();
    const hayAjustes = typeof h.otros().ajustes?.abrir === "function";
    ajustes.textContent = hayAjustes ? "Ajustes" : "Ajustes (próximamente)";
    if (hayAjustes) ajustes.removeAttribute("aria-disabled"); else ajustes.setAttribute("aria-disabled", "true");
    for (const [id, s] of [...secciones].sort((a, b) => a[1].orden - b[1].orden)) {
      const sec = document.createElement("section"), t = document.createElement("h3"), caja = document.createElement("div");
      t.id = `ficha-${id}`; t.textContent = s.titulo; sec.setAttribute("aria-labelledby", t.id); sec.dataset.seccion = id;
      sec.append(t, caja); panel.cuerpo.appendChild(sec); cajas.set(id, caja);
      try { s.pintar(caja); } catch (e) { parrafo(caja, `(esta parte falló: ${String((e as Error)?.message ?? e).slice(0, 80)})`); }
    }
    panel.cuerpo.appendChild(pie);
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
    titulo: "Quién eres", orden: 10, vivo: true,
    pintar: (c) => {
      const w = h.session.who;
      pares(c, [["Nombre", w?.nombre ?? "Invitado (esperando al servidor…)"], ["Identificador de invitado", w ? `${w.id.slice(0, 6)}… (el mismo en cada visita desde este navegador)` : "—"], ["Tu avatar en esta zona", h.session.entity >= 0 ? `número ${h.session.entity}` : "—"]]);
    },
  });
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
  api.seccion("avatar", { titulo: "Avatar", orden: 60, pintar: (c) => parrafo(c, "Próximamente (fila H10): ver y elegir aquí tu avatar, con su retrato.") });
  api.seccion("inventario", { titulo: "Inventario", orden: 70, pintar: (c) => parrafo(c, "Próximamente: lo que llevas encima, guardado en el servidor.") });
  return api;
}
