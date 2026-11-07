// franjas — the pure part (Y37): the four bands of the day, the hour each one starts, and the texts. Integers only: the
// world's clock (entorno `hora`) travels in steps of 0.05 h, so every hour here is counted in those steps (PASOS = 480
// a day); no Math.sin, no clock, no randomness. Kept apart from feature.ts so the page does not carry the reader.
// The data file is `franjas.json` next to this one (`numinia-engine/franjas@1`); a wrong file is not used and says why.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import casa from "./franjas.json" with { type: "json" };

export const ESQUEMA = "numinia-engine/franjas@1";
/** In day order: each band starts where the previous one ends, and `noche` wraps round to `amanecer`. */
export const FRANJAS = ["amanecer", "dia", "ocaso", "noche"] as const;
export type Franja = (typeof FRANJAS)[number];
export const IDIOMAS = ["en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];
/** The entorno clock moves in steps of 0.05 h: 20 per hour, 480 per day. */
export const PASOS_HORA = 20, PASOS_DIA = 480;
/** The hour (0 ≤ h < 24, a multiple of 0.05) at which each band starts. */
export type Desde = Record<Franja, number>;
export type TextosFranja = { nombre: string; anuncio: string; estado: string };
export type Textos = { siguiente: string; franjas: Record<Franja, TextosFranja> };

/** An hour as a whole number of 0.05 h steps, wrapped to the day (24 = 0). */
export const pasosDe = (hora: number): number => ((Math.round(hora * PASOS_HORA) % PASOS_DIA) + PASOS_DIA) % PASOS_DIA;

/** «HH:MM» of an hour in steps (0.05 h = 3 min): the text a card and an announcement show. */
export function horaEnTexto(hora: number): string {
  const minutos = pasosDe(hora) * 3;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** Check the start hours: each a multiple of 0.05 in [0, 24), and in day order around the clock with no ties (so the
 * four bands cover the 24 h with no gaps and no overlaps). Issues carry the path in the file. */
export function leerDesde(crudo: unknown, base: Desde = DESDE_CASA): Result<Desde> {
  const issues: Issue[] = [];
  if (crudo === undefined || crudo === null) return { ok: true, value: { ...base } };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { ok: false, issues: [{ path: "franjas.desde", message: 'an object with the hour each band starts: { "amanecer": 5, "dia": 7, "ocaso": 18, "noche": 20 }' }] };
  const o = crudo as Record<string, unknown>;
  const v: Desde = { ...base };
  for (const k of Object.keys(o)) if (!(FRANJAS as readonly string[]).includes(k)) issues.push({ path: `franjas.desde.${k}`, message: `no such band; the bands are ${FRANJAS.join(", ")}` });
  for (const f of FRANJAS) {
    if (o[f] === undefined) continue;
    const h = o[f];
    if (typeof h !== "number" || !Number.isFinite(h) || h < 0 || h >= 24 || Math.abs(h * PASOS_HORA - Math.round(h * PASOS_HORA)) > 1e-9) issues.push({ path: `franjas.desde.${f}`, message: "an hour from 0 up to (not including) 24, in steps of 0.05 (e.g. 7 or 18.5)" });
    else v[f] = h;
  }
  if (issues.length) return { ok: false, issues };
  // day order around the clock, counted from the start of the first band
  const rel = FRANJAS.map((f) => (pasosDe(v[f]) - pasosDe(v.amanecer) + PASOS_DIA) % PASOS_DIA);
  for (let i = 1; i < rel.length; i++) if (!(rel[i] > rel[i - 1])) return { ok: false, issues: [{ path: `franjas.desde.${FRANJAS[i]}`, message: `bands go ${FRANJAS.join(" → ")} around the clock, each starting later than the one before (no ties); «${FRANJAS[i]}» does not start after «${FRANJAS[i - 1]}»` }] };
  return { ok: true, value: v };
}

/** The band a given world hour belongs to. Pure and total: every hour belongs to exactly one band. */
export function franjaDeHora(hora: number, desde: Desde = DESDE_CASA): Franja {
  const p = pasosDe(hora);
  let mejor: Franja = FRANJAS[0], dist = PASOS_DIA;
  for (const f of FRANJAS) {
    const d = (p - pasosDe(desde[f]) + PASOS_DIA) % PASOS_DIA; // steps since this band started
    if (d < dist) { dist = d; mejor = f; }
  }
  return mejor;
}
/** The band after this one in the day (`noche` → `amanecer`). */
export const siguienteDe = (f: Franja): Franja => FRANJAS[(FRANJAS.indexOf(f) + 1) % FRANJAS.length];

/** Whole steps of 0.05 h from `hora` until the next band starts (1 … 480). Pure. */
export function pasosHastaSiguiente(hora: number, desde: Desde = DESDE_CASA): number {
  const f = franjaDeHora(hora, desde);
  const d = (pasosDe(desde[siguienteDe(f)]) - pasosDe(hora) + PASOS_DIA) % PASOS_DIA;
  return d === 0 ? PASOS_DIA : d;
}

export const DESDE_CASA: Desde = { amanecer: 5, dia: 7, ocaso: 18, noche: 20 };

/** The texts of a language, or the English block when the language is unknown. */
export function textosDe(idioma: string): Textos {
  const t = (casa.textos as Record<string, Textos>)[idioma];
  return t ?? (casa.textos as Record<string, Textos>).en;
}
export const idiomaDeCasa = (): Idioma => ((IDIOMAS as readonly string[]).includes(casa.idioma) ? casa.idioma : "en") as Idioma;

/** The sentence a card and the query give: where we are, and when the next band starts. */
export function frase(idioma: string, f: Franja, desde: Desde = DESDE_CASA): string {
  const t = textosDe(idioma), s = siguienteDe(f);
  return `${t.franjas[f].estado} ${t.siguiente.replace("{nombre}", t.franjas[s].nombre).replace("{hora}", horaEnTexto(desde[s]))}`;
}
