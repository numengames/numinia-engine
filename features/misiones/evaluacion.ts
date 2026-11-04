// misiones — the end-of-quest evaluation (P13): pure functions, whole numbers only, no clock of their own and no randomness.
// A mision@1 may carry `evaluacion` (formato.ts). When the quest is completed the server works out a `Resultado` from what it
// kept in the progress — when the quest was accepted and when each block closed (the SERVER's clock, ms, so it survives a
// reconnection and a restart) plus the counters of the quest (maquina.ts `cuenta`, any counter by name; a missing one is 0) — and
// saves it there. The rows of the card (`filas`) and the one-line summary agents and screen readers get (`resumen`) come from it.
//   puntos = base − Σ (counter × weight) − (whole minutes over the reference time × weight per minute), kept between `minimo` and `base`.
import { corta, CONTADORES_CONOCIDOS, ETIQUETA_TIEMPO } from "./formato.ts";
import type { Evaluacion, Mision } from "./formato.ts";

/** What is saved when a quest with `evaluacion` is completed. `ms` = time from accepting to finishing (absent when the accept time
 *  was not kept: a quest taken before the world had an `evaluacion`); `fases` = ms of each block, in order (empty when not known);
 *  `cont` = the counters the card shows (name → value); `puntos` = the score. */
export type Resultado = { ms?: number; fases: number[]; cont: Record<string, number>; puntos: number };
export const MS_MAX = 360_000_000; // 100 hours: more than that is a quest left open, not a time worth keeping
export const TOPE_CONTADOR = 9999;
/** One row of the card: `valor` = seconds (tiempo, fase) or the count; `texto` = the value as the card writes it («14 min 05 s», «2»);
 *  `resta` = the points that row took (0 for a phase). */
export type Fila = { tipo: "tiempo" | "fase" | "contador"; clave: string; etiqueta: string; valor: number; texto: string; resta: number };

/** The blocks of a quest: consecutive steps with the same `grupo` are one, any other step is a block of its own (the same rule as maquina.ts finBloque). */
export function bloques(m: Mision): { desde: number; hasta: number }[] {
  const out: { desde: number; hasta: number }[] = [];
  for (let i = 0; i < m.pasos.length;) {
    const g = m.pasos[i].grupo;
    let j = i + 1;
    if (g) while (j < m.pasos.length && m.pasos[j].grupo === g) j++;
    out.push({ desde: i, hasta: j });
    i = j;
  }
  return out;
}

const num = (o: Readonly<Record<string, number | undefined>>, k: string): number => (Object.hasOwn(o, k) && Number.isInteger(o[k]) ? Math.min(TOPE_CONTADOR, Math.max(0, o[k]!)) : 0);
const ms = (v: number): number => Math.min(MS_MAX, Math.max(0, Math.round(v)));

/** Points taken for the time: one `resta_por_minuto` for each whole minute past `referencia_min`. */
export function restaTiempo(ev: Evaluacion, tiempoMs: number): number {
  if (!ev.tiempo) return 0;
  const sobra = tiempoMs - ev.tiempo.referencia_min * 60_000;
  return sobra > 0 ? Math.floor(sobra / 60_000) * ev.tiempo.resta_por_minuto : 0;
}

/** The result for a completed quest. `t0` = when it was accepted, `tb` = when each block closed (one per block, the last one is the finish);
 *  `ahora` = the finish when `tb` is not complete (older progress). `cuenta` = the quest's counters. */
export function calcular(m: Mision, ev: Evaluacion, cuenta: Readonly<Record<string, number | undefined>>, t0: number | undefined, tb: readonly number[], ahora: number): Resultado {
  const cont: Record<string, number> = {};
  for (const k of ev.muestra) if (k !== "tiempo") cont[k] = num(cuenta, k);
  let total: number | undefined, fases: number[] = [];
  if (t0 !== undefined) {
    const completo = tb.length === bloques(m).length && tb.length > 0;
    total = ms((completo ? tb[tb.length - 1] : ahora) - t0);
    if (completo) fases = tb.map((t, k) => ms(t - (k ? tb[k - 1] : t0)));
  }
  let resta = total === undefined ? 0 : restaTiempo(ev, total);
  for (const [k, peso] of Object.entries(ev.resta)) resta += num(cuenta, k) * peso;
  return { ...(total !== undefined ? { ms: total } : {}), fases, cont, puntos: Math.max(ev.minimo, Math.min(ev.base, ev.base - resta)) };
}

const dos = (n: number): string => String(n).padStart(2, "0");
/** «45 s», «14 min 05 s», «1 h 02 min». */
export function duracion(tiempoMs: number): string {
  const s = Math.floor(tiempoMs / 1000), h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${dos(min)} min`;
  return min ? `${min} min ${dos(s % 60)} s` : `${s} s`;
}

/** The rows of the card, in the order the author's `muestra` says. The time row is followed by one row per block when there is more than one. */
export function filas(m: Mision, ev: Evaluacion, r: Resultado): Fila[] {
  const out: Fila[] = [];
  for (const k of ev.muestra) {
    if (k === "tiempo") {
      if (r.ms === undefined) continue; // the accept time was not kept: there is no time to tell
      out.push({ tipo: "tiempo", clave: "tiempo", etiqueta: Object.hasOwn(ev.etiquetas, "tiempo") ? ev.etiquetas.tiempo : ETIQUETA_TIEMPO, valor: Math.floor(r.ms / 1000), texto: duracion(r.ms), resta: restaTiempo(ev, r.ms) });
      const bs = bloques(m);
      if (r.fases.length > 1 && r.fases.length === bs.length) r.fases.forEach((t, i) => {
        const p = m.pasos[bs[i].desde];
        out.push({ tipo: "fase", clave: `fase-${i + 1}`, etiqueta: corta(`Fase ${i + 1}: ${p.grupo || p.texto}`, 72), valor: Math.floor(t / 1000), texto: duracion(t), resta: 0 });
      });
      continue;
    }
    const v = Object.hasOwn(r.cont, k) ? r.cont[k] : 0;
    out.push({ tipo: "contador", clave: k, etiqueta: Object.hasOwn(ev.etiquetas, k) ? ev.etiquetas[k] : Object.hasOwn(CONTADORES_CONOCIDOS, k) ? CONTADORES_CONOCIDOS[k] : k, valor: v, texto: String(v), resta: v * (Object.hasOwn(ev.resta, k) ? ev.resta[k] : 0) });
  }
  return out;
}

/** One line for agents and screen readers: every row but the phases («Tiempo de la misión: 14 min 05 s; Fotos no relevantes: 2»). */
export const resumen = (rs: readonly Fila[]): string => corta(rs.filter((f) => f.tipo !== "fase").map((f) => `${f.etiqueta}: ${f.texto}`).join("; "), 200);
