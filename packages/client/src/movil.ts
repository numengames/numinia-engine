// U24: the phone layout's rules, as plain functions (no DOM: Node tests run them; apps/plaza/movil.ts draws them).
// Budget: while you play, six controls — joystick (left third), look (a drag on the rest of the screen), ONE big
// contextual action, «…», ⚙ + map, chat. REDISENO-INTERFAZ-PC-MOVIL-VR §7 U24; the approved mock-up is work/ux/d2-movil.
import type { Clase } from "./aparato.ts";

// ---- sizes (CSS px ≈ pt): frequent controls ≥ 44, secondary ≥ 28 (Apple HIG 2026, OSRS 2023) ----
export const MIN_FRECUENTE = 44;
export const MIN_SECUNDARIO = 28;
export const tamanoOk = (ancho: number, alto: number, frecuente: boolean): boolean => Math.min(ancho, alto) >= (frecuente ? MIN_FRECUENTE : MIN_SECUNDARIO) - 0.5;

// ---- the joystick takes the left third, a drag anywhere else looks around ----
/** Fraction of the width (from the left) where a touch starts the walking joystick on a phone; a desktop/tablet layout keeps the old half. */
export const ZONA_ANDAR_MOVIL = 1 / 3;
export const ZONA_ANDAR_ANTES = 1 / 2;
export const enZonaAndar = (x: number, izquierda: number, ancho: number, fraccion: number): boolean => x < izquierda + ancho * fraccion;
export const esMovil = (clase: Clase | string | undefined): boolean => clase === "movil-vertical" || clase === "movil-horizontal";

// ---- which glyph each device names for an action: the touch classes name NONE (the button says the word) ----
export type Accion = "interactuar" | "cerrar" | "chat" | "mapa" | "ficha" | "misiones" | "saltar";
export const GLIFOS: Record<Clase, Record<Accion, string | null>> = {
  escritorio: { interactuar: "E", cerrar: "Esc", chat: "Intro", mapa: "M", ficha: "I", misiones: "J", saltar: "Espacio" },
  "movil-vertical": { interactuar: null, cerrar: null, chat: null, mapa: null, ficha: null, misiones: null, saltar: null },
  "movil-horizontal": { interactuar: null, cerrar: null, chat: null, mapa: null, ficha: null, misiones: null, saltar: null },
  vr: { interactuar: "gatillo", cerrar: "B", chat: null, mapa: null, ficha: null, misiones: null, saltar: "A" },
};
export const glifoDe = (clase: Clase, a: Accion): string | null => GLIFOS[clase]?.[a] ?? null;
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «E: hablar con Alma» on a keyboard, «Hablar con Alma» where nothing is pressed. */
export function ayudaDe(clase: Clase, a: Accion, texto: string): string {
  const g = glifoDe(clase, a);
  return g ? `${g}: ${texto}` : conMayuscula(texto);
}
/** «Cerrar (Esc)» → «Cerrar»: a label with its key only where there is a key. */
export const conGlifo = (clase: Clase, a: Accion, texto: string): string => { const g = glifoDe(clase, a); return g ? `${texto} (${g})` : texto; };
/** «…, acércate y pulsa E» on a keyboard; on touch the big button is named instead. */
export const cercaDeAlguien = (clase: Clase): string => {
  const g = glifoDe(clase, "interactuar");
  return g ? `acércate y pulsa ${g}` : "acércate y toca el botón grande de abajo";
};

// ---- the ONE contextual action ----
export type Cerca = { feature: string; key: string; prompt: string } | null;
export type Contexto = { verbo: string; icono: string; tipo: "hablar" | "recoger" | "poner" | "pescar" | "tirar" | "usar" | "saltar" };
const REGLAS: { re: RegExp; c: Contexto }[] = [
  { re: /^(hablar|habla|charlar|conversar)\b/i, c: { verbo: "Hablar", icono: "chat-circle-dots", tipo: "hablar" } },
  { re: /^(recoger|coger|coge|recoge|tomar|toma|agarrar)\b/i, c: { verbo: "Recoger", icono: "hand-grabbing", tipo: "recoger" } },
  { re: /^(poner|pon|cambiar la obra|colocar)\b/i, c: { verbo: "Poner tu obra", icono: "image-square", tipo: "poner" } },
  { re: /^(pescar|lanzar)\b/i, c: { verbo: "Pescar", icono: "fish", tipo: "pescar" } },
  { re: /^(tirar|lanza)\b/i, c: { verbo: "Tirar", icono: "hand-pointing", tipo: "tirar" } },
];
/** The word and icon of the big button for something near («hablar con Alma» → Hablar). Unknown verbs keep their first word. */
export function contextoDe(prompt: string): Contexto {
  const p = prompt.trim();
  for (const r of REGLAS) if (r.re.test(p)) return r.c;
  const primera = p.split(/\s+/)[0] ?? "";
  return { verbo: primera ? conMayuscula(primera) : "Usar", icono: "hand-pointing", tipo: "usar" };
}
export const SALTAR: Contexto = { verbo: "Saltar", icono: "arrow-up", tipo: "saltar" };
/** What the big button does now: something near wins; fishing keeps its own HUD (its «Recoger» reels); else it jumps. */
export function elegirAccion(o: { cerca: Cerca; pescando?: boolean; ocupado?: boolean }): Contexto | null {
  if (o.pescando || o.ocupado) return null; // the fishing HUD or the conversation owns that corner
  return o.cerca ? contextoDe(o.cerca.prompt) : SALTAR;
}

// ---- chat in three states: hidden (an icon) · one line · full (list + box) ----
export type EstadoChat = "oculto" | "linea" | "completo";
export type EventoChat = "tocar" | "plegar" | "ocultar";
/** A tap on the chat button/pill: hidden → one line → full. ▾ folds to one line; ✕ hides. */
export function siguienteChat(e: EstadoChat, ev: EventoChat): EstadoChat {
  if (ev === "plegar") return "linea";
  if (ev === "ocultar") return "oculto";
  return e === "oculto" ? "linea" : "completo";
}

// ---- a long press on a chat line (to report it) ----
export const PULSACION_LARGA_MS = 550;
export const PULSACION_LARGA_TOLERANCIA = 10;
/** True when a finger stayed on one line long enough and did not wander (a scroll is not a long press). */
export const esPulsacionLarga = (o: { ms: number; dx: number; dy: number }): boolean => o.ms >= PULSACION_LARGA_MS && Math.hypot(o.dx, o.dy) <= PULSACION_LARGA_TOLERANCIA;

// ---- the text of a chat line for the one-line pill ----
export const ultimaLinea = (lineas: readonly { nombre: string; texto: string; tuyo: boolean; tipo: string }[]): { quien: string; texto: string } | null => {
  for (let i = lineas.length - 1; i >= 0; i--) { const l = lineas[i]; if (l.tipo !== "aviso") return { quien: l.tuyo ? "Tú" : l.nombre, texto: l.texto }; }
  return null;
};

// ---- what the «…» menu offers ----
export type Entrada = { id: string; etiqueta: string; icono: string; masAlla?: boolean };
/** Saltar, then the features' actions (Saludar, Bailar…), then whatever is behind «más». Duplicates by id are dropped. */
export function entradasDelMenu(acciones: readonly { id: string; label: string }[], extra: readonly Entrada[]): Entrada[] {
  const ICONO: Record<string, string> = { saludar: "hand-waving", bailar: "music-notes", recoger: "hand-grabbing" };
  const base: Entrada[] = [{ id: "saltar", etiqueta: "Saltar", icono: "arrow-up" }];
  for (const a of acciones) if (a.id !== "recoger") base.push({ id: a.id, etiqueta: a.label, icono: ICONO[a.id] ?? "hand-pointing" });
  const vistos = new Set<string>();
  return [...base, ...extra.map((e) => ({ ...e, masAlla: true }))].filter((e) => !vistos.has(e.id) && !!vistos.add(e.id));
}
/** Simulated safe zones (px) for a phone profile forced on a desktop, where the browser reports none (notch/island, home bar). */
export const ZONA_SEGURA_SIMULADA: Record<"movil-vertical" | "movil-horizontal", { t: number; b: number; l: number; r: number }> = {
  "movil-vertical": { t: 47, b: 21, l: 0, r: 0 },
  "movil-horizontal": { t: 0, b: 21, l: 47, r: 47 },
};
