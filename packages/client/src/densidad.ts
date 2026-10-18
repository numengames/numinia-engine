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
  nombre: string;
};

/** The panels the page has today. Mínimo = the «now» line, the folded chat, the contextual action and nothing else. */
export const MARCOS_PLAZA: readonly MarcoDensidad[] = [
  { id: "hud.ahora", selector: "#mision-seguida", densidad: "minimo", cuando: "siempre", nombre: "Línea de «ahora» (la misión seguida)" },
  { id: "hud.accion", selector: "#interactuar", densidad: "minimo", cuando: "siempre", nombre: "Acción contextual" },
  { id: "hud.chat.pastilla", selector: "#chat-boton", densidad: "minimo", cuando: "siempre", nombre: "Chat plegado (pastilla)" },
  { id: "hud.chat.lineas", selector: "#chat-lista", densidad: "normal", cuando: "al_cambiar", segundos: SEGUNDOS_AL_CAMBIAR, fijoEn: ["completo"], nombre: "Chat: últimas líneas" },
  { id: "hud.barra", selector: "#barra-arriba", densidad: "normal", cuando: "siempre", nombre: "Barra de botones" },
  { id: "hud.reloj", selector: "#reloj", densidad: "normal", cuando: "siempre", nombre: "Reloj" },
  { id: "hud.minimapa", selector: "#minimapa", densidad: "normal", cuando: "siempre", nombre: "Minimapa" },
  { id: "hud.misiones", selector: "#misiones", densidad: "normal", cuando: "bajo_demanda", tecla: "KeyJ", nombre: "Misiones (botón; J abre el libro)" },
  { id: "hud.acciones", selector: "#acciones", densidad: "normal", cuando: "siempre", nombre: "Barra de acciones" },
  { id: "hud.ayuda", selector: "#help", densidad: "completo", cuando: "siempre", nombre: "Ayuda de teclas" },
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
    if (!m.nombre || m.nombre.length > 60) out.push(`${m.id}: a name, up to 60 characters`);
  }
  return out;
}
