// densidad (U20): the density dial — Mínimo · Normal · Completo — as data. Which panel of the page shows at which level,
// and when (`siempre` · `al_cambiar` · `bajo_demanda`), is ONE table here (the keys `densidad` and `cuando` that `marco@1`
// will carry, REDISENO-INTERFAZ-PC-MOVIL-VR.md §6). The page (apps/plaza/densidad.ts) stamps each panel with
// data-densidad / data-cuando and puts the chosen level on <html>; tema.css hides by those attributes. A frame built
// later (U3) declares the same two keys and needs no new CSS. Pure: no DOM, tested in Node (test/densidad.test.ts).

export type Densidad = "minimo" | "normal" | "completo";
/** From the quietest to the fullest: the order of the dial and of the key that cycles it. */
export const DENSIDADES: readonly Densidad[] = ["minimo", "normal", "completo"];
export const DENSIDAD_DEFECTO: Densidad = "normal";
export const NOMBRES_DENSIDAD: Record<Densidad, string> = { minimo: "Mínimo", normal: "Normal", completo: "Completo" };
/** siempre: always there · al_cambiar: appears with a change and fades after `segundos` («menos movimiento»: stays fixed) · bajo_demanda: a key or a button held. */
export type Cuando = "siempre" | "al_cambiar" | "bajo_demanda";
export const CUANDOS: readonly Cuando[] = ["siempre", "al_cambiar", "bajo_demanda"];
export const SEGUNDOS_AL_CAMBIAR = 6;   // the notices' time (REDISENO §6 regla 2: ≤ 3 visible, 6 s)

/** Where a frame is anchored (U3): a corner or the middle of the top / bottom edge. */
export type Ancla = "arriba-izquierda" | "arriba-centro" | "arriba-derecha" | "abajo-izquierda" | "abajo-centro" | "abajo-derecha";
export const ANCLAS: readonly Ancla[] = ["arriba-izquierda", "arriba-centro", "arriba-derecha", "abajo-izquierda", "abajo-centro", "abajo-derecha"];
/** The box of a frame: `dx` is the distance from the left/right edge (from the middle, for `-centro`), `dy` from the top/bottom edge; px at 100 % UI size.
 *  `ancho` is required for `-centro` (the CSS centres with it); `alto` and `ancho` may be left to the content. */
export type Caja = { ancla: Ancla; dx: number; dy: number; ancho?: number; alto?: number };
/** Below this width the page keeps its old, flowing layout (the frames are the desktop/tablet layout; phone and VR have their own stories). */
export const ANCHO_MIN_MARCOS = 900;
/** Below this width (and from ANCHO_MIN_MARCOS up) a frame may use its `cajaCompacta` instead (the notices drop under the «now» line). */
export const ANCHO_COMPACTO = 1600;

export type MarcoDensidad = {
  id: string;
  /** CSS selector of the page element (an element that does not exist yet is simply skipped). */
  selector: string;
  /** The lowest level at which it shows. */
  densidad: Densidad;
  cuando: Cuando;
  /** Shown only at these levels (for a frame that must NOT show above a level). */
  solo?: readonly Densidad[];
  /** `al_cambiar` only: seconds visible after a change (default 6). */
  segundos?: number;
  /** `al_cambiar` only: at these levels it stays fixed, as `siempre` (the full chat does not fade). */
  fijoEn?: readonly Densidad[];
  /** `bajo_demanda` only: the key that shows it (a KeyboardEvent.code). */
  tecla?: string;
  /** U3: where it sits (the wireframe's box). Without it the frame keeps the place the page gives it. */
  caja?: Caja;
  /** U3: a level may move or resize the box (the chat grows in Completo). */
  cajaEn?: Partial<Record<Densidad, Partial<Caja>>>;
  /** U3: the changes to the box on a screen narrower than ANCHO_COMPACTO (900–1599 px): two frames that fit side by side at 1600 would touch. */
  cajaCompacta?: Partial<Caja>;
  /** U3: «glass» — 55 % surface + this blur in px (8 chips, 12 big panels) + a little dimming of what is behind (brightness .75: white text must read over a bright sky) + a 1 px hairline. Off at the lowest quality (`sin cristal`). */
  cristal?: number;
  nombre: string;
};

/** The panels the page has today. Mínimo = the «now» line, the folded chat, the contextual action and nothing else. */
export const MARCOS_PLAZA: readonly MarcoDensidad[] = [
  { id: "hud.ahora", selector: "#mision-seguida", densidad: "minimo", cuando: "siempre", caja: { ancla: "arriba-izquierda", dx: 16, dy: 14, ancho: 480, alto: 38 }, cristal: 8, nombre: "Línea de «ahora» (la misión seguida)" },
  { id: "hud.avisos", selector: "#avisos-pila", densidad: "minimo", cuando: "al_cambiar", segundos: SEGUNDOS_AL_CAMBIAR, caja: { ancla: "arriba-centro", dx: 0, dy: 14, ancho: 440 }, cajaCompacta: { dy: 60 }, cristal: 8, nombre: "Pila de avisos (≤ 3, 6 s)" },
  { id: "hud.accion", selector: "#interactuar", densidad: "minimo", cuando: "siempre", caja: { ancla: "abajo-centro", dx: 0, dy: 112, ancho: 360, alto: 54 }, cristal: 8, nombre: "Acción contextual" },
  { id: "hud.chat", selector: "#chat", densidad: "minimo", cuando: "siempre", caja: { ancla: "abajo-izquierda", dx: 16, dy: 16, ancho: 440 }, nombre: "Chat (el contenedor: lista, línea de escribir y pastilla)" },
  { id: "hud.chat.pastilla", selector: "#chat-boton", densidad: "minimo", cuando: "siempre", nombre: "Chat plegado (pastilla)" },
  { id: "hud.chat.lineas", selector: "#chat-lista", densidad: "normal", cuando: "al_cambiar", segundos: SEGUNDOS_AL_CAMBIAR, fijoEn: ["completo"], cristal: 12, nombre: "Chat: últimas líneas" },
  { id: "hud.barra", selector: "#barra-arriba", densidad: "normal", cuando: "siempre", caja: { ancla: "arriba-derecha", dx: 16, dy: 14 }, nombre: "Barra de botones" },
  { id: "hud.reloj", selector: "#reloj", densidad: "normal", cuando: "siempre", caja: { ancla: "arriba-derecha", dx: 16, dy: 62, alto: 28 }, cristal: 8, nombre: "Reloj" },
  { id: "hud.minimapa", selector: "#minimapa", densidad: "normal", cuando: "siempre", caja: { ancla: "arriba-derecha", dx: 16, dy: 94 }, nombre: "Minimapa" },
  { id: "hud.misiones", selector: "#misiones", densidad: "normal", cuando: "bajo_demanda", tecla: "KeyJ", caja: { ancla: "arriba-derecha", dx: 16, dy: 292, ancho: 292, alto: 40 }, cristal: 12, nombre: "Misiones (botón; J abre el libro)" },
  { id: "hud.acciones", selector: "#acciones", densidad: "normal", cuando: "siempre", caja: { ancla: "abajo-centro", dx: 0, dy: 16, ancho: 360, alto: 80 }, cristal: 12, nombre: "Barra de acciones" },
  { id: "hud.ayuda", selector: "#help", densidad: "completo", cuando: "siempre", caja: { ancla: "abajo-derecha", dx: 16, dy: 16, ancho: 410 }, cristal: 12, nombre: "Ayuda de teclas" },
];
/** Not governed by the dial, on purpose: events and what you asked for (mission banner, narrator, dice, summons, the open
 *  book, the settings), the statistics (their own setting, `graficos.estadisticas`) and the screen-reader notices. */
export const FUERA_DEL_DIAL: readonly string[] = ["#mision-completada", "#narrador", "#mision-nota", "#convocatorias", "#dados-carta", "#dialogo", "#libro", "#hud", "#avisos", "#avisos-urgentes"];

export const esDensidad = (v: unknown): v is Densidad => typeof v === "string" && (DENSIDADES as readonly string[]).includes(v);
/** Any stored or typed value → a level (anything unknown is the default). */
export const nivelDensidad = (v: unknown): Densidad => (esDensidad(v) ? v : DENSIDAD_DEFECTO);
/** The key that cycles the dial: Mínimo → Normal → Completo → Mínimo. */
export const siguienteDensidad = (d: Densidad): Densidad => DENSIDADES[(DENSIDADES.indexOf(d) + 1) % DENSIDADES.length];

/** Does this frame show at this level? */
export function visibleEn(m: Pick<MarcoDensidad, "densidad" | "solo">, nivel: Densidad): boolean {
  if (m.solo) return m.solo.includes(nivel);
  return DENSIDADES.indexOf(nivel) >= DENSIDADES.indexOf(m.densidad);
}
/** Is it fading (`al_cambiar`) at this level, with «menos movimiento» on or off? Never when reduced motion is on: it stays fixed. */
export function seFunde(m: Pick<MarcoDensidad, "cuando" | "fijoEn">, nivel: Densidad, menosMovimiento: boolean): boolean {
  return m.cuando === "al_cambiar" && !menosMovimiento && !(m.fijoEn ?? []).includes(nivel);
}
/** The ids that show at a level (the table of the wireframe's «Qué se ve en cada nivel»). */
export const marcosVisibles = (nivel: Densidad, marcos: readonly MarcoDensidad[] = MARCOS_PLAZA): string[] => marcos.filter((m) => visibleEn(m, nivel)).map((m) => m.id);

/** Is the table well formed? (Used by the tests and by whoever adds a frame.) */
export function validarMarcos(marcos: readonly MarcoDensidad[]): string[] {
  const out: string[] = [], vistos = new Set<string>();
  for (const m of marcos) {
    if (!/^[a-z][a-z0-9.]*$/.test(m.id) || vistos.has(m.id)) out.push(`${m.id}: id repeated or malformed`);
    vistos.add(m.id);
    if (!m.selector) out.push(`${m.id}: needs a selector`);
    if (!esDensidad(m.densidad)) out.push(`${m.id}: densidad is minimo, normal or completo`);
    if (!CUANDOS.includes(m.cuando)) out.push(`${m.id}: cuando is siempre, al_cambiar or bajo_demanda`);
    if (m.cuando !== "al_cambiar" && (m.segundos !== undefined || m.fijoEn !== undefined)) out.push(`${m.id}: segundos and fijoEn belong to al_cambiar`);
    if (m.cuando === "bajo_demanda" && !m.tecla) out.push(`${m.id}: bajo_demanda needs its key (tecla)`);
    if (m.segundos !== undefined && !(m.segundos >= 1 && m.segundos <= 30)) out.push(`${m.id}: segundos from 1 to 30`);
    if (m.caja) {
      if (!ANCLAS.includes(m.caja.ancla)) out.push(`${m.id}: ancla is one of ${ANCLAS.join(", ")}`);
      if (m.caja.ancla.endsWith("centro") && !m.caja.ancho) out.push(`${m.id}: a centred box needs ancho`);
      if (!Number.isFinite(m.caja.dx) || !Number.isFinite(m.caja.dy) || m.caja.dy < 0 || (!m.caja.ancla.endsWith("centro") && m.caja.dx < 0)) out.push(`${m.id}: dx and dy are distances (≥ 0)`);
    }
    if (m.cristal !== undefined && !(m.cristal >= 8 && m.cristal <= 14)) out.push(`${m.id}: cristal is a blur from 8 to 14 px`);
    if (!m.nombre || m.nombre.length > 60) out.push(`${m.id}: a name, up to 60 characters`);
  }
  return out;
}

// ---------- U3: frames as data (anchor + density + when) → the CSS that places them, and the notices' stack ----------

/** Tope of the visible notices per level (REDISENO §6 regla 2: ≤ 3 visible; the wireframe shows one in Mínimo and Normal, the stack of three in Completo). */
export const TOPE_AVISOS: Record<Densidad, number> = { minimo: 1, normal: 1, completo: 3 };
export const AVISOS_MAX = 3;
export type Aviso = { texto: string; hasta: number };
/** A new notice joins the stack: the expired go, a repeat of the newest only renews it, and only the last AVISOS_MAX stay. Pure; `ahora` in ms. */
export function apilarAviso(pila: readonly Aviso[], texto: string, ahora: number, segundos = SEGUNDOS_AL_CAMBIAR): Aviso[] {
  const vivos = pila.filter((a) => a.hasta > ahora), t = texto.trim();
  if (!t) return vivos;
  if (vivos.length && vivos[vivos.length - 1].texto === t) { vivos[vivos.length - 1] = { texto: t, hasta: ahora + segundos * 1000 }; return vivos; }
  return [...vivos, { texto: t, hasta: ahora + segundos * 1000 }].slice(-AVISOS_MAX);
}
/** What shows at a level: the live notices, the newest `TOPE_AVISOS[nivel]` (the page hides the older ones by CSS). */
export const avisosVisibles = (pila: readonly Aviso[], ahora: number, nivel: Densidad): Aviso[] => pila.filter((a) => a.hasta > ahora).slice(-TOPE_AVISOS[nivel]);

/** The box of a frame at a level (the base, with the level's changes on top). */
export const cajaDe = (m: Pick<MarcoDensidad, "caja" | "cajaEn" | "cajaCompacta">, nivel: Densidad, compacta = false): Caja | undefined => (m.caja ? { ...m.caja, ...(m.cajaEn?.[nivel] ?? {}), ...(compacta ? m.cajaCompacta ?? {} : {}) } : undefined);
/** The rectangle a box takes in a viewport (needs `alto` for the bottom anchors; the tests use it to check nothing overlaps). */
export function rectDe(c: Caja, ancho: number, alto: number): { x: number; y: number; w: number; h: number } {
  const w = c.ancho ?? 0, h = c.alto ?? 0;
  const x = c.ancla.endsWith("izquierda") ? c.dx : c.ancla.endsWith("derecha") ? ancho - c.dx - w : ancho / 2 - w / 2 + c.dx;
  const y = c.ancla.startsWith("arriba") ? c.dy : alto - c.dy - h;
  return { x, y, w, h };
}
const px = (n: number) => `${n}px`;
function reglasCaja(c: Caja): string {
  const h = c.ancla.endsWith("izquierda") ? `left:${px(c.dx)} !important;right:auto !important;` : c.ancla.endsWith("derecha") ? `right:${px(c.dx)} !important;left:auto !important;` : `left:calc(50% - ${px((c.ancho ?? 0) / 2)} + ${px(c.dx)}) !important;right:auto !important;`;
  const v = c.ancla.startsWith("arriba") ? `top:${px(c.dy)} !important;bottom:auto !important;` : `bottom:${px(c.dy)} !important;top:auto !important;`;
  return `position:fixed !important;${h}${v}margin:0 !important;transform:none !important;box-sizing:border-box !important;`
    + (c.ancho ? `width:${px(c.ancho)} !important;max-width:calc(100vw - 32px) !important;` : "") + (c.alto ? `height:${px(c.alto)} !important;` : "");
}
/** The one stylesheet that places and dresses the frames, made from the table (so the table is the only place a position lives).
 *  `html[data-densidad-nivel]` in front makes each rule beat the older id rules of the page without reordering anything. */
export function cssMarcos(marcos: readonly MarcoDensidad[] = MARCOS_PLAZA): string {
  const base = "html[data-densidad-nivel] body ", out: string[] = [];
  for (const m of marcos) {
    const c = cajaDe(m, "normal");
    if (c) out.push(`${base}${m.selector}{${reglasCaja(c)}}`);
    for (const n of DENSIDADES) { // a level that changes the box
      const e = m.cajaEn?.[n]; if (e && c) out.push(`html[data-densidad-nivel="${n}"] body ${m.selector}{${reglasCaja(cajaDe(m, n)!)}}`);
    }
  }
  const caja = out.join("\n");
  const compacta = marcos.filter((m) => m.caja && m.cajaCompacta).map((m) => `${base}${m.selector}{${reglasCaja(cajaDe(m, "normal", true)!)}}`).join("\n");
  const vidrio = marcos.filter((m) => m.cristal).map((m) => {
    const s = `${base}${m.selector}:not(:empty)`;
    return `${s}{background:rgba(30,26,23,.55) !important;-webkit-backdrop-filter:blur(${px(m.cristal!)}) brightness(.75);backdrop-filter:blur(${px(m.cristal!)}) brightness(.75);border:1px solid rgba(249,235,220,.2) !important;border-radius:8px !important;color:var(--n-texto) !important;}\n`
      + `html[data-sin-cristal][data-densidad-nivel] body ${m.selector}:not(:empty){-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--n-sup) !important;}\n`
      + `html.alto-contraste[data-densidad-nivel] body ${m.selector}:not(:empty){-webkit-backdrop-filter:none;backdrop-filter:none;background:#000 !important;color:#fff !important;border-color:#fff !important;}`;
  }).join("\n");
  return `@media (min-width:${ANCHO_MIN_MARCOS}px){\n${caja}\n}\n` + (compacta ? `@media (min-width:${ANCHO_MIN_MARCOS}px) and (max-width:${ANCHO_COMPACTO - 1}px){\n${compacta}\n}\n` : "") + `${vidrio}\n`;
}
