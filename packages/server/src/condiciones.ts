// Conditions of entry (C1): a world's terms live in its own folder, aventura/condiciones.json (condiciones@1), like
// ficha.json (file over app). Layers run from the house (applies to everyone) to the community (the world's
// organisation, added on top); each layer has points, `obligatorio` (no entry without it) or optional (each its own
// consent, one purpose per point). No file = the house example below; a broken file = said in the log and the house
// layers are used, never a world without terms. Copies the ficha.json reader; transforms it to return layers.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AVENTURA_FICHERO_MAX } from "./aventura.ts";

export const CONDICIONES = "condiciones@1";
export const CONDICIONES_FICHERO = "condiciones.json";
export const CAPAS = ["casa", "comunidad"] as const;
export type CapaId = (typeof CAPAS)[number];
export interface Punto { id: string; titulo: string; texto: string; obligatorio: boolean }
export interface Capa { capa: CapaId; version: string; puntos: Punto[] }
export interface Condiciones { formato: typeof CONDICIONES; capas: Capa[] }

/** The house example used when a world ships none: one mandatory point, one optional. */
export const CONDICIONES_CASA: Condiciones = {
  formato: CONDICIONES,
  capas: [{
    capa: "casa", version: "ejemplo-1",
    puntos: [
      { id: "uso", titulo: "Condiciones de uso", texto: "Texto de ejemplo: sustituir por las condiciones de la casa.", obligatorio: true },
      { id: "informe", titulo: "Informe de la sesión", texto: "Enviar un informe anónimo de rendimiento de tu sesión.", obligatorio: false },
    ],
  }],
};

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_PUNTOS = 20, MAX_TEXTO = 8000;

/** Check one condiciones@1 object: issues with paths, never throws. */
export function validarCondiciones(o: unknown): { ok: true; value: Condiciones } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const r = o as { formato?: unknown; capas?: unknown } | null;
  if (!r || typeof r !== "object" || r.formato !== CONDICIONES) return { ok: false, issues: [`formato: debe ser ${CONDICIONES}`] };
  if (!Array.isArray(r.capas) || r.capas.length < 1 || r.capas.length > CAPAS.length) return { ok: false, issues: [`capas: de 1 a ${CAPAS.length}`] };
  const capas: Capa[] = [];
  r.capas.forEach((c: Record<string, unknown>, i: number) => {
    const p = `capas[${i}]`;
    const idx = CAPAS.indexOf(c?.capa as CapaId);
    if (idx < 0) issues.push(`${p}.capa: una de ${CAPAS.join(", ")}`);
    else if (idx !== i) issues.push(`${p}.capa: el orden es ${CAPAS.join(" → ")}`);
    if (typeof c?.version !== "string" || !c.version || c.version.length > 40) issues.push(`${p}.version: texto de 1 a 40 caracteres`);
    const ps = c?.puntos;
    if (!Array.isArray(ps) || ps.length < 1 || ps.length > MAX_PUNTOS) { issues.push(`${p}.puntos: de 1 a ${MAX_PUNTOS}`); return; }
    const vistos = new Set<string>();
    const puntos: Punto[] = [];
    ps.forEach((x: Record<string, unknown>, j: number) => {
      const q = `${p}.puntos[${j}]`;
      if (typeof x?.id !== "string" || !ID.test(x.id)) issues.push(`${q}.id: minúsculas, números y guiones`);
      else if (vistos.has(x.id)) issues.push(`${q}.id: repetido`);
      else vistos.add(x.id);
      if (typeof x?.titulo !== "string" || !x.titulo || x.titulo.length > 120) issues.push(`${q}.titulo: de 1 a 120 caracteres`);
      if (typeof x?.texto !== "string" || !x.texto || x.texto.length > MAX_TEXTO) issues.push(`${q}.texto: de 1 a ${MAX_TEXTO} caracteres`);
      if (typeof x?.obligatorio !== "boolean") issues.push(`${q}.obligatorio: verdadero o falso`);
      puntos.push({ id: String(x?.id), titulo: String(x?.titulo), texto: String(x?.texto), obligatorio: x?.obligatorio === true });
    });
    capas.push({ capa: CAPAS[Math.max(idx, 0)], version: String(c?.version), puntos });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: { formato: CONDICIONES, capas } };
}

/** The world's conditions: its file, or the house example. `problemas` says why a file was not used. */
export function leerCondiciones(dir: string | null): { condiciones: Condiciones; deFichero: boolean; problemas: string[] } {
  const casa = { condiciones: CONDICIONES_CASA, deFichero: false };
  if (!dir) return { ...casa, problemas: [] };
  const p = join(dir, CONDICIONES_FICHERO);
  let texto: string;
  try {
    const st = statSync(p);
    if (!st.isFile()) return { ...casa, problemas: [`${CONDICIONES_FICHERO}: no es un fichero`] };
    if (st.size > AVENTURA_FICHERO_MAX) return { ...casa, problemas: [`${CONDICIONES_FICHERO}: más de ${AVENTURA_FICHERO_MAX} bytes`] };
    texto = readFileSync(p, "utf8");
  } catch { return { ...casa, problemas: [] }; } // no file: the house example
  let o: unknown;
  try { o = JSON.parse(texto); } catch (e) { return { ...casa, problemas: [`${CONDICIONES_FICHERO}: JSON roto (${(e as Error).message})`] }; }
  const r = validarCondiciones(o);
  return r.ok ? { condiciones: r.value, deFichero: true, problemas: [] } : { ...casa, problemas: r.issues.map((i) => `${CONDICIONES_FICHERO}: ${i}`) };
}
