// mundo (H4): read a world's data files from its folder (MUNDO_DIR), for the composition root to hand to the features
// (features/mundo.ts). A missing file is not an error (the house default is used); a broken one is logged and skipped.
import { existsSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const leerMundo = (dir: string, log: (l: string) => void = console.log) => (fichero: string): unknown => {
  const ruta = join(dir, fichero);
  if (!existsSync(ruta)) return undefined;
  try { return JSON.parse(readFileSync(ruta, "utf8")); }
  catch (e) { log(`[mundo] ${ruta} no es JSON válido (${(e as Error).message}): uso el de la casa`); return undefined; }
};

/** D-041 historias 5-6: reescribe un fichero del mundo mientras la instancia corre (editar_receptores del cable).
 * Escribe en un fichero temporal y lo renombra encima (rename es atómico en el mismo disco): nunca deja el fichero
 * a medias si el proceso muere a mitad. Quien llama decide cuándo (un cambio aceptado) y registra si falla. */
export const escribirMundo = (dir: string, log: (l: string) => void = console.log) => (fichero: string, datos: unknown, o: { nuevo?: boolean } = {}): void => {
  const ruta = join(dir, fichero), tmp = `${ruta}.tmp${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(datos, null, 2) + "\n");
    // Interruptor «Naturaleza»: `nuevo` = the caller saw no file. link() fails if one appeared (or was there but broken, so
    // `leerMundo` said undefined): a world's hand-written file is never overwritten by a fresh one. Still atomic.
    if (o.nuevo) { try { linkSync(tmp, ruta); } finally { unlinkSync(tmp); } }
    else renameSync(tmp, ruta);
  } catch (e) { log(`[mundo] no pude escribir ${ruta}: ${(e as Error).message}`); throw e; }
};
