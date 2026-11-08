// frases — the closed list of fixed phrases (Y29): data, its reader and the language rule. PURE: no DOM, no clock, no
// random, no I/O; it never throws. The list lives in frases.json (numinia-engine/frases@1): each phrase has a STABLE id
// (never renamed, never reused; a retired id goes to `retiradas` and stays reserved), a group, and its text per language
// (`en` and `es` at least). What travels on the wire is the id; every page translates when it paints.
import frasesCrudo from "./frases.json" with { type: "json" };

import { IDIOMAS, ID_BYTES, TEXTO_FRASE_MAX, idiomaDe } from "./feature.ts";

export { IDIOMAS, TEXTO_FRASE_MAX, idiomaDe };
export type { Idioma } from "./feature.ts";
export const FRASES_MAX = 24;         // the whole list stays short (cognitive load); ~20 today
export const ID_RE = new RegExp(`^[a-z][a-z0-9-]{0,${ID_BYTES - 1}}$`);

export type Frase = { id: string; grupo: string; orden: number; en: string; es: string };
export type Grupo = { id: string; en: string; es: string };
export type ListaFrases = { frases: Frase[]; grupos: Grupo[]; retiradas: string[] };
export type Problema = { path: string; message: string };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Read a list: each wrong line is left out WITH its reason (path + how to fix); the rest is kept. */
export function leerFrases(crudo: unknown): { valor: ListaFrases; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: ListaFrases = { frases: [], grupos: [], retiradas: [] };
  if (!esObjeto(crudo)) { problemas.push({ path: "frases", message: "the file is an object: { schema, grupos, frases, retiradas }" }); return { valor, problemas }; }
  if (crudo.schema !== "numinia-engine/frases@1") problemas.push({ path: "frases.schema", message: 'the schema is "numinia-engine/frases@1"' });
  const retiradas = Array.isArray(crudo.retiradas) ? crudo.retiradas : [];
  for (const r of retiradas) { if (typeof r === "string" && ID_RE.test(r)) valor.retiradas.push(r); else problemas.push({ path: "frases.retiradas", message: `«${String(r)}» is not a valid id (lowercase letters, digits and hyphens)` }); }
  const grupos = Array.isArray(crudo.grupos) ? crudo.grupos : [];
  grupos.forEach((g, i) => {
    const path = `frases.grupos[${i}]`;
    if (!esObjeto(g) || !ID_RE.test(texto(g.id)) || !texto(g.en) || !texto(g.es)) { problemas.push({ path, message: "a group has an id and its text in every language: { id, en, es }" }); return; }
    if (valor.grupos.some((x) => x.id === g.id)) { problemas.push({ path: `${path}.id`, message: `«${String(g.id)}» is repeated` }); return; }
    valor.grupos.push({ id: texto(g.id), en: texto(g.en), es: texto(g.es) });
  });
  const lista = Array.isArray(crudo.frases) ? crudo.frases : [];
  lista.forEach((f, i) => {
    const path = `frases.frases[${i}]`;
    if (!esObjeto(f)) { problemas.push({ path, message: "a phrase is an object: { id, grupo, en, es }" }); return; }
    const id = texto(f.id);
    if (!ID_RE.test(id)) { problemas.push({ path: `${path}.id`, message: "an id of 1-24 lowercase letters, digits or hyphens, starting with a letter" }); return; }
    if (valor.frases.some((x) => x.id === id)) { problemas.push({ path: `${path}.id`, message: `«${id}» is repeated` }); return; }
    if (valor.retiradas.includes(id)) { problemas.push({ path: `${path}.id`, message: `«${id}» was retired: its id stays reserved, pick another` }); return; }
    if (!valor.grupos.some((g) => g.id === f.grupo)) { problemas.push({ path: `${path}.grupo`, message: `a group of this file: ${valor.grupos.map((g) => g.id).join(", ")}` }); return; }
    const t = { en: texto(f.en), es: texto(f.es) };
    const falta = IDIOMAS.find((l) => !t[l] || t[l].length > TEXTO_FRASE_MAX);
    if (falta) { problemas.push({ path: `${path}.${falta}`, message: `the text in «${falta}»: 1-${TEXTO_FRASE_MAX} characters, every language needed` }); return; }
    if (valor.frases.length >= FRASES_MAX) { problemas.push({ path, message: `at most ${FRASES_MAX} phrases: the list stays short` }); return; }
    valor.frases.push({ id, grupo: String(f.grupo), orden: valor.frases.length, en: t.en, es: t.es });
  });
  return { valor, problemas };
}

/** The list the engine ships. */
export const LISTA: ListaFrases = leerFrases(frasesCrudo).valor;
/** The phrase in a language; null when the id is unknown. */
export const textoDe = (id: string, idioma: unknown, lista: ListaFrases = LISTA): string | null => {
  const f = lista.frases.find((x) => x.id === id);
  return f ? f[idiomaDe(idioma)] : null;
};
