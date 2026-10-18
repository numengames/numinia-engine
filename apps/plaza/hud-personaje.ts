// M4: the character HUD frame (#hud-personaje, density Normal, glass). Three things, each ONLY from what reaches the page:
//   · Estado — the 4-step ladder (Desestabilizado → Confundido → Colapsado → Aletargado; canon: the player has NO life bar);
//   · Carga — what you carry / can carry;   · Aliento del Velo — a percentage.
// None of the three is in the snapshot the server sends yet (BACKLOG L2: the player's states are a server effect not built), so
// today each says «Próximamente» and nothing is invented. The day a source exists it plugs into `globalThis.__numinia` with the
// SAME hook the sheet already reads for Estado (`estado.actual()`): `carga.actual() → {valor, max}` and `aliento.actual() → 0..100`.
// Only the name (session.who.nombre) is real today. Redraws once a second, touching the DOM only when something changed; no live region.
import { icono } from "./iconos.ts";
import { ESCALERA } from "./ficha.ts";

export type Paso = (typeof ESCALERA)[number];
export type Fuentes = {
  nombre?: string;
  estado?: { actual?(): string | undefined | null };
  carga?: { actual?(): { valor: number; max: number } | null | undefined };
  aliento?: { actual?(): number | null | undefined };
};
export type Vista = {
  nombre: string;
  /** Index in ESCALERA, -1 = stable; null = the page does not receive it («Próximamente»). */
  estado: number | null;
  carga: { valor: number; max: number; pct: number } | null;
  aliento: { pct: number } | null;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** What the page knows → what the frame draws (pure; tests use it). A missing source is `null`, never a made-up value. */
export function leerHud(f: Fuentes): Vista {
  let estado: number | null = null;
  if (f.estado?.actual) { const e = f.estado.actual(); estado = e ? ESCALERA.indexOf(e as Paso) : -1; }
  let carga: Vista["carga"] = null;
  const c = f.carga?.actual?.();
  if (c && num(c.valor) && num(c.max) && c.max > 0) carga = { valor: Math.max(0, Math.round(c.valor)), max: Math.round(c.max), pct: Math.min(100, Math.max(0, (c.valor / c.max) * 100)) };
  let aliento: Vista["aliento"] = null;
  const a = f.aliento?.actual?.();
  if (num(a)) aliento = { pct: Math.min(100, Math.max(0, Math.round(a))) };
  return { nombre: (f.nombre ?? "").trim() || "Tú", estado, carga, aliento };
}
/** Colour of an Estado step: unlit above the current one; amber for the first two steps, red for the last two. */
export const claseDePaso = (k: number, actual: number): string => (k > actual ? "" : k <= 1 ? "w" : "r");

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", texto = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto) e.textContent = texto; return e; };

export function montarHudPersonaje(): void {
  const raiz = document.getElementById("hud-personaje");
  if (!raiz) return;
  raiz.setAttribute("aria-label", "Tu personaje: estado, carga y aliento del Velo");
  raiz.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  let firma = "";
  const pintar = () => {
    const g = (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia ?? {};
    const sesion = g.session as { who?: { nombre?: string } } | undefined;
    const v = leerHud({ nombre: sesion?.who?.nombre, estado: g.estado as Fuentes["estado"], carga: g.carga as Fuentes["carga"], aliento: g.aliento as Fuentes["aliento"] });
    const f = JSON.stringify(v); if (f === firma) return; firma = f;

    const cab = el("div", "hp-cab"); cab.append(el("b", "", v.nombre));
    const ico = (n: string) => { const s = el("span", "hp-ico"); s.innerHTML = icono(n, 12); return s; };
    const pronto = () => el("span", "hp-pronto", "Próximamente");

    // Estado
    const est = el("div", "hp-estado"), tit = el("div", "hp-fila"), nom = el("span", "hp-etq", "Estado");
    tit.append(nom);
    const ol = el("ol", "hp-pasos"); ol.setAttribute("aria-label", "Escalera del estado");
    ESCALERA.forEach((n, k) => { const li = el("li", v.estado !== null ? claseDePaso(k, v.estado) : ""); li.title = n; li.setAttribute("aria-label", n); if (k === v.estado) li.setAttribute("aria-current", "step"); ol.appendChild(li); });
    if (v.estado === null) { tit.append(pronto()); est.dataset.pronto = ""; }
    else tit.append(el("span", v.estado < 0 ? "hp-val ok" : "hp-val aviso", v.estado < 0 ? "Estable" : ESCALERA[v.estado]));
    est.append(tit, ol);

    // Carga y Aliento: one row each
    const barra = (cls: string, etiqueta: string, icon: string, dato: { pct: number } | null, texto: string) => {
      const b = el("div", `hp-recurso ${cls}`), fila = el("div", "hp-fila"), n = el("span", "hp-etq"); n.append(ico(icon), document.createTextNode(` ${etiqueta}`));
      const tr = el("div", "hp-barra"); fila.append(n);
      if (dato) {
        fila.append(el("span", "hp-num", texto)); const r = el("i"); r.style.width = `${dato.pct}%`; tr.appendChild(r);
        tr.setAttribute("role", "meter"); tr.setAttribute("aria-label", etiqueta); tr.setAttribute("aria-valuemin", "0"); tr.setAttribute("aria-valuemax", "100"); tr.setAttribute("aria-valuenow", String(Math.round(dato.pct))); tr.setAttribute("aria-valuetext", texto);
      } else { fila.append(pronto()); b.dataset.pronto = ""; tr.setAttribute("aria-hidden", "true"); }
      b.append(fila, tr); return b;
    };
    raiz.replaceChildren(cab, est,
      barra("carga", "Carga", "lightning", v.carga, v.carga ? `${v.carga.valor} / ${v.carga.max}` : ""),
      barra("aliento", "Aliento del Velo", "moon-stars", v.aliento, v.aliento ? `${v.aliento.pct} %` : ""));
    raiz.hidden = false;
  };
  pintar();
  setInterval(pintar, 1000);
}
