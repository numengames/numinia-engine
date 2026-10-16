// aventura (J5): the text files an adventure ships (quests, people, things…), read at startup from AVENTURA_DIR.
// Layout: <dir>/<carpeta>/*.json|*.md|*.txt. Each feature reads its own folders through api.aventura(carpeta) and
// checks them against its format (features/misiones reads misiones/, pnj/ and cosas/). The engine ships an EXAMPLE
// in aventuras/ejemplo/ (the default of `npm run server`); a real adventure lives in its own repository and the
// server is pointed at it. Files are read once per call and never served to pages.
// One file sits at the adventure's root: ficha.json (ficha@1, optional) — what the world is called, one paragraph about
// it and its cover, so the world folder itself says what it is (numinia-archive ADR-074). It travels in the zip like
// the rest of aventura/; the page title and GET /status read it. No ficha = the engine's defaults, as before.
import type { Issue } from "../../core/src/index.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const AVENTURA_FICHERO_MAX = 64 * 1024; // bytes per file
export const AVENTURA_FICHEROS_MAX = 500;      // files per folder
export const AVENTURA_CARPETA = /^[a-z0-9][a-z0-9-]{0,31}$/, AVENTURA_NOMBRE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.(json|md|txt)$/;
const CARPETA = AVENTURA_CARPETA, FICHERO = AVENTURA_NOMBRE;

/** A reader over one adventure folder; `null` = no adventure (every folder is empty). */
export function lectorAventura(dir: string | null, log: (l: string) => void = () => {}) {
  return (carpeta: string): { fichero: string; texto: string }[] => {
    if (!dir || !CARPETA.test(carpeta)) return [];
    let nombres: string[];
    try { nombres = readdirSync(join(dir, carpeta)); } catch { return []; } // no such folder: nothing of that kind
    const out: { fichero: string; texto: string }[] = [];
    for (const f of nombres.filter((n) => FICHERO.test(n)).sort().slice(0, AVENTURA_FICHEROS_MAX)) {
      const p = join(dir, carpeta, f);
      try {
        const st = statSync(p);
        if (!st.isFile()) continue;
        if (st.size > AVENTURA_FICHERO_MAX) { log(`[aventura] ${carpeta}/${f}: más de ${AVENTURA_FICHERO_MAX} bytes; no lo leo`); continue; }
        out.push({ fichero: `${carpeta}/${f}`, texto: readFileSync(p, "utf8") });
      } catch (e) { log(`[aventura] ${carpeta}/${f}: ${(e as Error).message}`); }
    }
    return out;
  };
}

export const FICHA = "ficha@1";
export const FICHA_FICHERO = "ficha.json";
export const FICHA_NOMBRE_MAX = 60;        // characters
export const FICHA_DESCRIPCION_MAX = 500;  // characters
/** The cover is a file already on the server by its content (the house library or an upload in datos/activos/, which
 * travels in the zip), named like every other picture of the world (entorno@1 `imagen`): «<sha256>.png|jpg|webp». */
export const FICHA_PORTADA = /^[0-9a-f]{64}\.(png|jpg|webp)$/;

/** ficha@1. Fields this engine does not know are kept (a newer one may add some); `notas` is for people. */
export type Ficha = { formato: typeof FICHA; nombre: string; descripcion?: string; portada?: string; [otro: string]: unknown };

const letras = (t: string): number => [...t].length;

/** Check one ficha@1 object: issues with paths, never throws. */
export function validarFicha(o: unknown, donde = FICHA_FICHERO): { ok: true; value: Ficha } | { ok: false; issues: Issue[] } {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, issues: [{ path: donde, message: "un objeto JSON {formato, nombre, descripcion?, portada?}" }] };
  const f = o as Record<string, unknown>, issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path: `${donde}.${path}`, message });
  if (f.formato !== FICHA) bad("formato", `"${FICHA}"`);
  if (typeof f.nombre !== "string" || !f.nombre.trim() || letras(f.nombre) > FICHA_NOMBRE_MAX || /[<>\u0000-\u001f]/.test(f.nombre)) bad("nombre", `texto no vacío de hasta ${FICHA_NOMBRE_MAX} caracteres, sin < > ni saltos de línea`);
  if (f.descripcion !== undefined && (typeof f.descripcion !== "string" || letras(f.descripcion) > FICHA_DESCRIPCION_MAX)) bad("descripcion", `texto de hasta ${FICHA_DESCRIPCION_MAX} caracteres`);
  if (f.portada !== undefined && (typeof f.portada !== "string" || !FICHA_PORTADA.test(f.portada))) bad("portada", "«<sha256>.png|jpg|webp» de una imagen que ya está en el servidor (la biblioteca o datos/activos/, que viaja en el zip)");
  return issues.length ? { ok: false, issues } : { ok: true, value: { ...f, nombre: (f.nombre as string).trim() } as Ficha };
}

/** The adventure's ficha.json: null when there is none (today's behaviour), the problems when it does not load. */
export function leerFicha(dir: string | null): { ficha: Ficha | null; problemas: string[] } {
  if (!dir) return { ficha: null, problemas: [] };
  const p = join(dir, FICHA_FICHERO);
  let texto: string;
  try {
    const st = statSync(p);
    if (!st.isFile()) return { ficha: null, problemas: [`${FICHA_FICHERO}: no es un fichero`] };
    if (st.size > AVENTURA_FICHERO_MAX) return { ficha: null, problemas: [`${FICHA_FICHERO}: más de ${AVENTURA_FICHERO_MAX} bytes`] };
    texto = readFileSync(p, "utf8");
  } catch { return { ficha: null, problemas: [] }; } // no ficha: the world does not say its name
  let o: unknown;
  try { o = JSON.parse(texto); } catch (e) { return { ficha: null, problemas: [`${FICHA_FICHERO}: JSON roto (${(e as Error).message})`] }; }
  const r = validarFicha(o);
  return r.ok ? { ficha: r.value, problemas: [] } : { ficha: null, problemas: r.issues.map((i) => `${i.path}: ${i.message}`) };
}
