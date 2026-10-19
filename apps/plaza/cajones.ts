// ux2-dock («creativo limpio»): build mode is a row of icons (the dock) and, under it, at most ONE drawer (cajón) open
// at a time. Before, every control of the builder (the library twice, axes, steps, inspector, uploads, cable) and the
// environment's sliders were open at once in two tall panels that covered the world. Pure helpers here (tested in
// test/cajones.test.ts); the DOM lives in constructor.ts.

export type Cajon = "anadir" | "cable" | "entorno" | "precision" | "inspector" | "ayuda";

/** The dock's drawers, in order: id, icon (iconos.ts), title (the drawer's heading) and tooltip (the button's accessible
 * name). No drawer has a key of its own: B is the battery mode and N the minimap's (one thing, one place, one key). */
export const CAJONES: readonly (readonly [Cajon, string, string, string])[] = [
  ["anadir", "plus", "Añadir", "Añadir: biblioteca y subir ficheros"],
  ["cable", "lightning", "Cable", "Cable: disparadores del mundo"],
  ["entorno", "sun", "Entorno", "Entorno: luz, niebla, viento y elementos"],
  ["precision", "ruler", "Precisión", "Precisión: herramientas, ejes, pasos y giros"],
  ["inspector", "eye", "Inspector", "Inspector: todos los campos del objeto elegido"],
  ["ayuda", "question", "Ayuda", "Ayuda: teclas y ratón"],
];

/** The dock's other buttons, after the drawers (each with its key in the tooltip). */
export const ACCIONES_DOCK = {
  deshacer: ["arrow-counter-clockwise", "Deshacer (Ctrl+Z)"],
  rehacer: ["arrow-clockwise", "Rehacer (Ctrl+Y o Ctrl+Mayús+Z)"],
  salir: ["sign-out", "Salir de construir (C)"],
} as const;

/** Pressing a drawer's button: opens it, or closes it when it was the open one (one drawer at a time). */
export const alternarCajon = (abierto: Cajon | "", pedido: Cajon): Cajon | "" => (abierto === pedido ? "" : pedido);

/** What Escape undoes first, from the most transient to the least: the library piece following the pointer, the thing
 * in grab mode, the open drawer, the selection. "" = nothing to undo. */
export function queCierraEscape(s: { fantasma: boolean; agarre: boolean; cajon: Cajon | ""; seleccion: string }): "fantasma" | "agarre" | "cajon" | "seleccion" | "" {
  if (s.fantasma) return "fantasma";
  if (s.agarre) return "agarre";
  if (s.cajon) return "cajon";
  if (s.seleccion) return "seleccion";
  return "";
}

const llano = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** The library rows that match what is typed (name or id, no accents, no case); empty text = all of them. */
export function filtrarBiblioteca<T extends { id: string; nombre: string }>(lista: readonly T[], texto: string): T[] {
  const q = llano(texto);
  return q ? lista.filter((m) => llano(m.nombre).includes(q) || llano(m.id).includes(q)) : [...lista];
}

/** The icon a library piece shows in the «Añadir» grid (house icons only; anything unknown is a package). */
const ICONO_PIEZA: Record<string, string> = { bloque: "cube", farolillo: "lamp", robot: "robot", loma: "mountains" };
export const iconoDePieza = (id: string): string => ICONO_PIEZA[id] ?? "package";

/** A press on a library tile that travels further than this (px) is a drag into the world, not a click. */
export const ARRASTRE_PX = 6;
export const esArrastre = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > ARRASTRE_PX;

/** The card's line under the name: the real keys of the three handles (2/G move, 3/R turn, 4 scale). */
export const TECLAS_TARJETA = "G mover · R girar · 4 escala";

/** «Al tocarlo» on the card: what touching (clicking) the object does, from what the object and the wires carry.
 * The link opens after a confirmation (J4); the triggers that stand at it are the cable's. "" = nothing: no row. */
export function alTocarlo(o: Record<string, unknown>, salen: readonly string[]): string {
  const partes: string[] = [];
  const enlace = String(o.enlace ?? "").trim();
  if (enlace) {
    let sitio = enlace;
    try { sitio = new URL(enlace).host || enlace; } catch { /* not a full URL: say it as it is */ }
    partes.push(`Abre ${sitio}`);
  }
  if (salen.length) partes.push(salen.length === 1 ? "Dispara 1 cable" : `Dispara ${salen.length} cables`);
  return partes.join(" · ");
}

/** The card's «Tamaño»: one number when the three scales match, "" when they differ (the Inspector edits each one). */
export const tamanoUniforme = (sx: number, sy: number, sz: number): string => (sx === sy && sy === sz ? String(Math.round(sx * 100) / 100) : "");
