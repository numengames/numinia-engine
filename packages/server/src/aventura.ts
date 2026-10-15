// aventura (J5): the text files an adventure ships (quests, people, things…), read at startup from AVENTURA_DIR.
// Layout: <dir>/<carpeta>/*.json|*.md|*.txt. Each feature reads its own folders through api.aventura(carpeta) and
// checks them against its format (features/misiones reads misiones/, pnj/ and cosas/). The engine ships an EXAMPLE
// in aventuras/ejemplo/ (the default of `npm run server`); a real adventure lives in its own repository and the
// server is pointed at it. Files are read once per call and never served to pages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const AVENTURA_FICHERO_MAX = 64 * 1024; // bytes per file
export const AVENTURA_FICHEROS_MAX = 500;      // files per folder
const CARPETA = /^[a-z0-9][a-z0-9-]{0,31}$/, FICHERO = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.(json|md|txt)$/;

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
