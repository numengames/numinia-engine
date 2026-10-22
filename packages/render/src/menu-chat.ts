// v7 (el chat en VR): the «Chat» section of the VR menu as pure numbers and words (no three.js, no DOM; tested in
// test/vr-chat.test.ts). The page gives the lines of the chat it already has (features/chat/client.ts: `chat.lineas`);
// this file turns the last ones into what the panel writes, says where the six quick phrases sit, and keeps the least
// size of the letters. Sending goes the same way as the computer's chat box: `chat.decir(texto, "cerca")`, so the
// client's pace and the server's rules (silence, the entry bubble's conditions…) apply unchanged; this file never sends.
// There is NO virtual keyboard: typing in VR is out of reach for now (see docs/RUNLOG.md, v7).

import { CONTENIDO, FILA, BOTON_MIN, PX_POR_M, anguloGrados, type Rect } from "./menu-vr.ts";

/** The quick phrases, in the order the grid reads (left to right, two rows of three). */
export const FRASES = ["¡Hola!", "Sí", "No", "Gracias", "Ven aquí", "Un momento"] as const;
/** How many of the last lines the panel keeps in view (the computer's list keeps 30). */
export const MENSAJES_MAX = 6;
/** A message longer than this many lines is cut with «…» (the 200-byte limit would take four). */
export const LINEAS_POR_MENSAJE = 2;

/** Letter sizes in canvas px (1440 px per metre): messages and phrases ≥ 1.2° at 1.2 m, the footnote smaller. */
export const TEXTO = { mensaje: 38, linea: 46, frase: 38, nota: 26 } as const;
/** Visual angle (degrees) of a letter of `px` canvas px seen from the menu's distance. */
export const gradosDePx = (px: number): number => anguloGrados(px / PX_POR_M);

/** The line of the chat the page keeps (features/chat/client.ts `Linea`), as far as this file reads it. */
export type LineaChat = { tipo: "cerca" | "zona" | "antes" | "aviso"; nombre: string; texto: string; tuyo: boolean };
/** What the panel writes: who (empty for a notice), what, and how to colour it. */
export type MensajeVR = { quien: string; texto: string; clase: "yo" | "otro" | "aviso" };

/** The last `n` lines as the computer's list writes them: «Tú», «Ana (a la zona)», «Luis (antes)»; notices without a name. */
export function ultimosMensajes(lineas: readonly LineaChat[], n: number = MENSAJES_MAX): MensajeVR[] {
  const out: MensajeVR[] = [];
  for (const l of lineas.slice(-Math.max(1, n))) {
    const texto = String(l.texto ?? "").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    if (l.tipo === "aviso") { out.push({ quien: "", texto, clase: "aviso" }); continue; }
    const base = l.tuyo ? "Tú" : (l.nombre || "Alguien");
    out.push({ quien: base + (l.tipo === "zona" ? " (a la zona)" : l.tipo === "antes" ? " (antes)" : ""), texto, clase: l.tuyo ? "yo" : "otro" });
  }
  return out;
}
/** «Ana: hola» — the text that gets wrapped (a notice is just its words). */
export const textoDeMensaje = (m: MensajeVR): string => (m.quien ? `${m.quien}: ${m.texto}` : m.texto);

/** The newest messages that fit `max` lines, oldest first. `lineas[i]` = the wrapped lines of message i. A message is cut
 * to LINEAS_POR_MENSAJE lines by the caller; the newest one is always kept (cut to its first `max` lines if it needs it). */
export function elegirLineas<T>(lineas: readonly (readonly T[])[], max: number): (readonly T[])[] {
  const out: (readonly T[])[] = []; let usadas = 0;
  for (let i = lineas.length - 1; i >= 0; i--) {
    const m = lineas[i];
    if (!out.length && m.length > max) { out.unshift(m.slice(0, max)); break; }
    if (usadas + m.length > max) break;
    out.unshift(m); usadas += m.length;
  }
  return out;
}

/** Where everything sits in the content area (canvas px): title, the box of messages, the 2×3 phrase buttons, the footnote. */
export type Disposicion = { titulo: Rect; mensajes: Rect; frases: Rect[]; nota: Rect; lineasCaben: number };
export function disposicion(): Disposicion {
  const { x, y, w, h } = CONTENIDO, TITULO = 64, NOTA = 44, HUECO = 12, ENTRE = 16, PAD = 16;
  const nota: Rect = { x, y: y + h - NOTA, w, h: NOTA };
  const filasAlto = 2 * FILA.h + HUECO;
  const frasesY = nota.y - 8 - filasAlto;
  const bw = Math.floor((w - 2 * HUECO) / 3);
  const frases: Rect[] = FRASES.map((_, i) => ({ x: x + (i % 3) * (bw + HUECO), y: frasesY + Math.floor(i / 3) * (FILA.h + HUECO), w: bw, h: FILA.h }));
  const mensajes: Rect = { x, y: y + TITULO, w, h: frasesY - ENTRE - (y + TITULO) };
  return { titulo: { x, y, w, h: TITULO }, mensajes, frases, nota, lineasCaben: Math.max(1, Math.floor((mensajes.h - 2 * PAD) / TEXTO.linea)) };
}

/** The least size of anything pressable or read in the panel: for the test (letters ≥ 1.2°, buttons ≥ BOTON_MIN). */
export function medidasChat(): { minLetraGrados: number; minBotonPx: number } {
  const d = disposicion();
  return {
    minLetraGrados: Math.min(gradosDePx(TEXTO.mensaje), gradosDePx(TEXTO.frase)),
    minBotonPx: Math.min(BOTON_MIN, ...d.frases.map((r) => Math.min(r.w, r.h))),
  };
}
