// disposicion (MMO interface, M6): where each person put the page's frames and which ones they hid. Pure and tested in Node;
// apps/plaza/edicion.ts reads and writes it (localStorage) and applies it with ONE stylesheet made here from the frames table.
// The offset is a CSS `translate` on top of the box the table gives (densidad.ts), so «Restablecer» is just an empty layout.
import type { MarcoDensidad } from "./densidad.ts";

export type Disposicion = { mov: Record<string, [number, number]>; oculto: string[] };
export const DISPOSICION_VACIA: Disposicion = { mov: {}, oculto: [] };
export const PASO_DISPOSICION = 10;      // drags snap to this many px
export const DESPLAZAMIENTO_MAX = 4000;  // a stored offset beyond this is garbage, not a layout

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= DESPLAZAMIENTO_MAX;

/** Read what was stored: anything that is not a known frame id or a sane offset is dropped (never throws). */
export function leerDisposicion(texto: string | null, ids: readonly string[]): Disposicion {
  if (!texto) return { mov: {}, oculto: [] };
  let raw: unknown;
  try { raw = JSON.parse(texto); } catch { return { mov: {}, oculto: [] }; }
  const o = (raw && typeof raw === "object" ? raw : {}) as { mov?: unknown; oculto?: unknown };
  const mov: Record<string, [number, number]> = {};
  if (o.mov && typeof o.mov === "object") for (const [id, v] of Object.entries(o.mov as Record<string, unknown>)) {
    if (ids.includes(id) && Array.isArray(v) && num(v[0]) && num(v[1]) && (v[0] !== 0 || v[1] !== 0)) mov[id] = [Math.round(v[0]), Math.round(v[1])];
  }
  const oculto = Array.isArray(o.oculto) ? [...new Set(o.oculto.filter((x): x is string => typeof x === "string" && ids.includes(x)))] : [];
  return { mov, oculto };
}

/** Frames a person may move or hide: the ones the table gives a box (the rest live inside another frame). */
export const marcosMovibles = (marcos: readonly MarcoDensidad[]): MarcoDensidad[] => marcos.filter((m) => m.caja);

/** Snap an offset to the grid. */
export const ajustarPaso = (n: number, paso = PASO_DISPOSICION): number => Math.round(n / paso) * paso;

/** Keep a dragged rectangle inside the screen: the offset change `d` is clamped so left/top ≥ 0 and right/bottom ≤ viewport. */
export function acotar(d: number, inicio: number, tam: number, vista: number): number {
  const min = -inicio, max = vista - tam - inicio;
  return max < min ? min : Math.min(max, Math.max(min, d));
}

/** The stylesheet of a layout. `html body SEL` is lower than the table's own rules, but `translate` is not in them, so it composes
 *  with whatever transform a frame has. Hidden frames disappear — except while editing, where they show faded so they can come back. */
export function cssDisposicion(d: Disposicion, marcos: readonly MarcoDensidad[]): string {
  const out: string[] = [];
  for (const m of marcosMovibles(marcos)) {
    const v = d.mov[m.id];
    if (v) out.push(`html body ${m.selector}{translate:${v[0]}px ${v[1]}px !important}`);
    if (d.oculto.includes(m.id)) out.push(`html:not(.editando-ui) body ${m.selector}{display:none !important}`, `html.editando-ui body ${m.selector}{opacity:.35 !important}`);
  }
  return out.join("\n");
}

export const disposicionVacia = (d: Disposicion): boolean => !Object.keys(d.mov).length && !d.oculto.length;
