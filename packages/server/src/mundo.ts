// mundo (H4): read a world's data files from its folder (MUNDO_DIR), for the composition root to hand to the features
// (features/mundo.ts). A missing file is not an error (the house default is used); a broken one is logged and skipped.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const leerMundo = (dir: string, log: (l: string) => void = console.log) => (fichero: string): unknown => {
  const ruta = join(dir, fichero);
  if (!existsSync(ruta)) return undefined;
  try { return JSON.parse(readFileSync(ruta, "utf8")); }
  catch (e) { log(`[mundo] ${ruta} no es JSON válido (${(e as Error).message}): uso el de la casa`); return undefined; }
};
