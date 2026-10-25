// MIS-241: «Objetos del mundo» — the builder's list of everything placed in the world (name, kind, whether it carries a
// piece of the cable/locks/counters), a press on a row goes next to the object and leaves it selected, ready to move,
// edit or wire. Pure rules here (tested in test/objetos-mundo.test.ts); the DOM lives in constructor.ts.
import { datosFicha, logicaDeObjeto } from "./ficha-objeto.ts";
import type { PiezasMundo } from "./ficha-objeto.ts";

export type ObjetoMundo = Record<string, unknown> & { id: string };
export type FilaObjeto = {
  id: string;
  /** What the card calls it: its name, or «(decorado)» when it has none on purpose. */
  nombre: string;
  /** The kind in words («Modelo», «Imagen», «Zona de sonido»…). */
  tipo: string;
  /** Wires, locks or counters at it, or a link on click: the short words the row shows («1 cable», «enlace»…). */
  piezas: string[];
  fijado: boolean;
  /** Not seen while playing (a sphere of sound, a hidden object). */
  oculto: boolean;
  x: number; z: number;
};

/** The list shows this many rows at once (a template has 200+ things); the search narrows it, and a line says how many are left. */
export const LISTA_OBJETOS_MAX = 120;

const llano = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const n = (v: unknown, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

/** Short words for what an object carries: the cable's triggers standing at it, locks and counters beside it, the
 * triggers that show or hide it, and a link opened by a click. [] = a plain thing (no piece). */
export function piezasDe(o: ObjetoMundo, mundo?: PiezasMundo): string[] {
  const salida: string[] = [];
  if (mundo) {
    const l = logicaDeObjeto(o, mundo);
    const cables = l.salen.length, cerr = l.piezas.filter((p) => p.startsWith("Cerradura ")).length, cont = l.piezas.length - cerr;
    if (cables) salida.push(cables === 1 ? "1 cable" : `${cables} cables`);
    if (cerr) salida.push(cerr === 1 ? "cerradura" : `${cerr} cerraduras`);
    if (cont) salida.push(cont === 1 ? "contador" : `${cont} contadores`);
    if (l.entran.length) salida.push(l.entran.length === 1 ? "lo activa 1 cable" : `lo activan ${l.entran.length} cables`);
  }
  if (String(o.enlace ?? "").trim()) salida.push("enlace");
  return salida;
}

/** The rows of every object, named things first (A→Z, no accents), then the unnamed decor by kind and id. Pure. */
export function filasDeObjetos(objetos: readonly ObjetoMundo[], mundo?: PiezasMundo): FilaObjeto[] {
  const filas = objetos.map((o): FilaObjeto => {
    const d = datosFicha(o);
    return { id: o.id, nombre: d.titulo, tipo: d.tipo, piezas: piezasDe(o, mundo), fijado: o.fijado === true, oculto: o.oculto === true, x: n(o.x), z: n(o.z) };
  });
  const sinNombre = (f: FilaObjeto) => f.nombre === "(decorado)";
  return filas.sort((a, b) => Number(sinNombre(a)) - Number(sinNombre(b)) || llano(a.nombre).localeCompare(llano(b.nombre), "es") || llano(a.tipo).localeCompare(llano(b.tipo), "es") || a.id.localeCompare(b.id));
}

/** The rows that match what is typed (name, kind or id; no accents, no case). Empty text = all of them. «con pieza» keeps only
 * the ones that carry a piece. */
export function filtrarObjetos(filas: readonly FilaObjeto[], texto: string, soloConPieza = false): FilaObjeto[] {
  const q = llano(texto);
  return filas.filter((f) => (!soloConPieza || f.piezas.length > 0) && (!q || llano(f.nombre).includes(q) || llano(f.tipo).includes(q) || llano(f.id).includes(q)));
}

/** How many rows to draw and how many are left out. */
export const recortarLista = <T>(filas: readonly T[], max = LISTA_OBJETOS_MAX): { visibles: T[]; resto: number } => ({ visibles: filas.slice(0, max), resto: Math.max(0, filas.length - max) });

/** A line that stands for the list's state: changes only when what the list shows changes, so the page redraws only then. */
export const firmaDeLista = (filas: readonly FilaObjeto[], texto: string, soloConPieza: boolean): string =>
  `${texto}|${soloConPieza ? 1 : 0}|${filas.map((f) => `${f.id}:${f.nombre}:${f.tipo}:${f.piezas.join("+")}:${f.fijado ? 1 : 0}${f.oculto ? 1 : 0}`).join(";")}`;

/** The line over the list: how many things, and what the search left. */
export function resumenLista(total: number, mostradas: number, buscando: boolean): string {
  if (total === 0) return "Este mundo no tiene objetos todavía: ponlos desde «Añadir».";
  if (!buscando) return total === 1 ? "1 objeto en el mundo." : `${total} objetos en el mundo.`;
  return mostradas === 0 ? "Ningún objeto coincide." : `${mostradas} de ${total} objetos.`;
}

const JUNTO_MIN_M = 2.5;
/** A spot next to an object, on the side where you are (or to its south when you are not known): far enough not to stand
 * inside it (its half-width plus a metre and a half), at most 12 m from its centre. */
export function sitioJunto(o: ObjetoMundo, yo: { x: number; z: number } | null): { x: number; z: number } {
  const ox = n(o.x), oz = n(o.z);
  const radio = Math.min(10, Math.max(Math.abs(n(o.sx, 1)), Math.abs(n(o.sz, 1))) / 2);
  const d = Math.max(JUNTO_MIN_M, radio + 1.5);
  let dx = 0, dz = 1;
  if (yo) { const ax = yo.x - ox, az = yo.z - oz, l = Math.hypot(ax, az); if (l > 0.01) { dx = ax / l; dz = az / l; } }
  return { x: Math.round((ox + dx * d) * 10) / 10, z: Math.round((oz + dz * d) * 10) / 10 };
}

/** Already next to it (within the spot's distance and a few metres more): there is no trip to make, the camera shows it. */
export function yaJunto(o: ObjetoMundo, yo: { x: number; z: number } | null): boolean {
  if (!yo) return false;
  const radio = Math.min(10, Math.max(Math.abs(n(o.sx, 1)), Math.abs(n(o.sz, 1))) / 2);
  return Math.hypot(yo.x - n(o.x), yo.z - n(o.z)) <= Math.max(JUNTO_MIN_M, radio + 1.5) + 3;
}

/** What to say after pressing a row: where it went and what is left to do. */
export function frase(nombre: string, camino: "viaja" | "cerca" | "apagado" | "sin-viaje"): string {
  switch (camino) {
    case "viaja": return `${nombre}: te llevo junto a él; ya está seleccionado.`;
    case "cerca": return `${nombre}: ya estás junto a él; seleccionado y a la vista.`;
    case "apagado": return `${nombre}: seleccionado y a la vista. Ir de golpe está apagado en este mundo; la cámara te lo enseña.`;
    case "sin-viaje": return `${nombre}: seleccionado y a la vista.`;
  }
}

/** Where to point the camera so the whole object is in view: its middle and a radius that fits it. */
export function encuadreDe(o: ObjetoMundo): { centro: { x: number; y: number; z: number }; radio: number } {
  const sx = Math.abs(n(o.sx, 1)), sy = Math.abs(n(o.sy, 1)), sz = Math.abs(n(o.sz, 1));
  return { centro: { x: n(o.x), y: n(o.y) + sy / 2, z: n(o.z) }, radio: Math.max(1, sx, sy, sz) * 1.5 };
}
