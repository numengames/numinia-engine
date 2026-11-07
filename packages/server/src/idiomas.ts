// idiomas (R-1, first slice): the words of a world — quests, people, the note for AIs, the sheet — are written in ENGLISH, the
// default language of the whole system, in the world's own files. A translation is one more file (file over app), never code:
//
//   aventura/idiomas/<lang>.<carpeta>.<fichero>   e.g. idiomas/es.misiones.01-abre-el-taller.json, idiomas/es.pnj.lumen.json
//   aventura/idiomas/<lang>.<fichero>             e.g. idiomas/es.ficha.json, idiomas/es.LEEME-IA.md
//
// A translation is the WHOLE translated file (same format, same ids, same steps): the loader reads it instead of the English one
// when the world's language is <lang>. The world's language is `idioma` in aventura/ficha.json ("en" if absent). A file without a
// translation falls back to the English one, so a half-translated world still loads. `paridad` is what `node tools/aventura.ts`
// uses to tell a translator that only the words may differ. Layout is flat on purpose: the world zip carries aventura/<folder>/<file>.
// This slice is the WORLD's language; one language per player (a page that says which one it reads) is the next slice. The page's
// own buttons (Construir, Añadir…) are not part of it.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const IDIOMA_DEFECTO = "en";
export const IDIOMAS_CARPETA = "idiomas";
/** A language code as ficha.json writes it: «en», «es», «pt-br». */
export const IDIOMA_CODIGO = /^[a-z]{2,3}(-[a-z]{2,4})?$/;
/** The keys whose string is a WORD of the world (the rest — ids, actions, kinds — must be the same in every language). */
export const CLAVES_DE_TEXTO: ReadonlySet<string> = new Set(["titulo", "descripcion", "texto", "nombre", "aceptada", "completada", "notas", "aviso", "frase", "oficio"]);

/** Where the translation of `ruta` («misiones/x.json», «ficha.json») lives, relative to the adventure folder. */
export const rutaTraducida = (idioma: string, ruta: string): string => `${IDIOMAS_CARPETA}/${idioma}.${ruta.replace("/", ".")}`;

/** The world's language: `idioma` of its ficha.json when it is a valid code, else English. Never throws. */
export function idiomaDelMundo(dir: string | null, max = 64 * 1024): string {
  if (!dir) return IDIOMA_DEFECTO;
  try {
    const p = join(dir, "ficha.json");
    if (statSync(p).size > max) return IDIOMA_DEFECTO;
    const o: unknown = JSON.parse(readFileSync(p, "utf8"));
    const l = o && typeof o === "object" ? (o as Record<string, unknown>).idioma : undefined;
    return typeof l === "string" && IDIOMA_CODIGO.test(l) ? l : IDIOMA_DEFECTO;
  } catch { return IDIOMA_DEFECTO; }
}

/** The text of the translation of `ruta` into `idioma`, or null (English, no translation, too big, not a file). */
export function leerTraduccion(dir: string | null, idioma: string, ruta: string, max = 64 * 1024): string | null {
  if (!dir || idioma === IDIOMA_DEFECTO || !IDIOMA_CODIGO.test(idioma)) return null;
  try {
    const p = join(dir, rutaTraducida(idioma, ruta)), st = statSync(p);
    return st.isFile() && st.size <= max ? readFileSync(p, "utf8") : null;
  } catch { return null; }
}

/** What differs between a file and its translation besides words: paths, never throws. Empty = the translation is faithful. */
export function paridad(base: unknown, traduccion: unknown, camino = "", clave = ""): string[] {
  if (typeof base === "string" && typeof traduccion === "string") return base === traduccion || CLAVES_DE_TEXTO.has(clave) ? [] : [`${camino || "/"}: only words may change here (${clave || "root"}), «${traduccion.slice(0, 40)}» is not «${base.slice(0, 40)}»`];
  if (Array.isArray(base) || Array.isArray(traduccion)) {
    if (!Array.isArray(base) || !Array.isArray(traduccion)) return [`${camino || "/"}: one is a list and the other is not`];
    if (base.length !== traduccion.length) return [`${camino || "/"}: ${traduccion.length} items, the English file has ${base.length}`];
    return base.flatMap((b, i) => paridad(b, traduccion[i], `${camino}/${i}`, clave));
  }
  if (base && traduccion && typeof base === "object" && typeof traduccion === "object") {
    const a = base as Record<string, unknown>, b = traduccion as Record<string, unknown>, out: string[] = [];
    for (const k of Object.keys(a)) if (!(k in b)) out.push(`${camino}/${k}: missing in the translation`);
    for (const k of Object.keys(b)) if (!(k in a)) out.push(`${camino}/${k}: not in the English file`);
    for (const k of Object.keys(a)) if (k in b) out.push(...paridad(a[k], b[k], `${camino}/${k}`, k));
    return out;
  }
  return Object.is(base, traduccion) ? [] : [`${camino || "/"}: must be the same value in every language`];
}
