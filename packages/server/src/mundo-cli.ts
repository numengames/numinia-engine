// mundo-cli (C6): the image's own tools for a world, so a machine never re-implements the engine's zip rules.
//   copia      the world in MOTOR_MUNDO (/mundo) as its mundo@2 zip, to stdout; works with the world running or stopped
//              (a read-only mount is enough: it writes nothing there). Running: the world as saved — the engine writes
//              what changed every second, and a journal line still being written is left out (consistent, ≤ 1 s behind)
//   comprobar  the zip on stdin: exit 0 = a world this engine reads; else exit 1 and ONE line saying why (stderr)
//   importar   the zip on stdin unpacked into MOTOR_MUNDO, which must be EMPTY; the same rules; nothing left on failure
//   docker run --rm --network none -v <datos/id>:/mundo:ro <imagen> copia      > mundo.zip
//   docker run --rm --network none -i <imagen> comprobar                      < mundo.zip
//   docker run --rm --network none -i -v <datos/id>:/mundo <imagen> importar   < mundo.zip
// Without a container: node packages/server/src/entrada.ts copia|comprobar|importar (MOTOR_MUNDO=<carpeta>).
import { createWriteStream, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { carpetaMundo, escribirManifiesto } from "./mundo-carpeta.ts";
import { exportarMundo, importarMundo, PARTES, TOPES } from "./mundo-zip.ts";
import { infoMotor } from "./version.ts";
import { ErrorZip } from "./zip.ts";

const MB = 1024 * 1024;
export type Salida = { out: Writable; err: (linea: string) => void };

/** stdin to a file, at most `max` bytes (more = ErrorZip «grande»). */
async function aFichero(entrada: Readable, ruta: string, max: number): Promise<number> {
  return new Promise((ok, ko) => {
    const out = createWriteStream(ruta, { flags: "wx", mode: 0o600 });
    let n = 0, fuera = false;
    entrada.on("data", (c: Buffer) => {
      n += c.length;
      if (n > max && !fuera) { fuera = true; entrada.unpipe(out); out.destroy(); ko(new ErrorZip("grande", `el zip pasa de ${Math.round(max / MB)} MB`)); }
    });
    entrada.on("error", ko);
    out.on("error", (e) => { if (!fuera) ko(e); });
    out.on("finish", () => { if (!fuera) ok(n); });
    entrada.pipe(out);
  });
}

const motivo = (e: unknown) => e instanceof ErrorZip ? `${e.message} (regla: ${e.regla})` : String((e as Error)?.message ?? e);
const unaLinea = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 400);

export async function copia(raiz: string, s: Salida): Promise<number> {
  const c = carpetaMundo(raiz);
  if (!existsSync(c.datos) && !existsSync(c.aventura) && !existsSync(c.manifiesto)) { s.err(`copia: en ${c.raiz} no hay un mundo (ni datos/ ni aventura/ ni mundo.json)`); return 1; }
  try {
    const r = await exportarMundo(s.out, { datos: c.datos, subidas: c.activos, aventura: existsSync(c.aventura) ? c.aventura : null, entorno: existsSync(c.entorno) ? c.entorno : null }, infoMotor());
    await new Promise<void>((ok) => (s.out === process.stdout ? ok() : s.out.end(ok)));
    s.err(`copia: ${r.ficheros} ficheros del mundo, ${(r.bytes / MB).toFixed(1)} MB (numinia-engine/mundo@2)`);
    return 0;
  } catch (e) { s.err(`copia: no pude hacerla: ${unaLinea(motivo(e))}`); return 1; }
}

export async function comprobar(entrada: Readable, s: Salida, topes = TOPES): Promise<number> {
  const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "comprobar-"));
  try {
    await aFichero(entrada, join(tmp, "mundo.zip"), topes.zip);
    const r = await importarMundo(join(tmp, "mundo.zip"), join(tmp, "mundo"), topes);
    s.out.write(`vale: ${r.esquema}, ${r.ficheros} ficheros, ${(r.bytes / MB).toFixed(1)} MB (${r.partes.join(", ") || "vacío"}); copia de ${r.motor || "?"} ${r.creado}\n`);
    return 0;
  } catch (e) { s.err(`no vale: ${unaLinea(motivo(e))}`); return 1; }
  finally { await rm(tmp, { recursive: true, force: true }); }
}

export async function importar(entrada: Readable, raiz: string, s: Salida, topes = TOPES): Promise<number> {
  const c = carpetaMundo(raiz);
  try { if (!statSync(c.raiz).isDirectory()) throw new Error(); } catch { s.err(`importar: no existe la carpeta ${c.raiz}`); return 1; }
  const hay = readdirSync(c.raiz);
  if (hay.length) { s.err(`importar: ${c.raiz} no está vacía (${hay.slice(0, 3).join(", ")}${hay.length > 3 ? "…" : ""}): solo importo en una carpeta vacía`); return 1; }
  const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "importar-"));
  const nuevo = join(c.raiz, `.importando-${process.pid}`);
  try {
    await aFichero(entrada, join(tmp, "mundo.zip"), topes.zip);
    const r = await importarMundo(join(tmp, "mundo.zip"), nuevo, topes);
    for (const p of PARTES) if (existsSync(join(nuevo, p))) await rename(join(nuevo, p), join(c.raiz, p));
    await rm(nuevo, { recursive: true, force: true });
    await mkdir(c.raiz, { recursive: true });
    escribirManifiesto(c, infoMotor());
    s.out.write(`importado: ${r.esquema}, ${r.ficheros} ficheros, ${(r.bytes / MB).toFixed(1)} MB en ${c.raiz} (${r.partes.join(", ")}${r.partes.includes("aventura") ? "" : "; la aventura de ejemplo se pone al arrancar"})\n`);
    return 0;
  } catch (e) {
    s.err(`importar: no vale: ${unaLinea(motivo(e))}`);
    await rm(nuevo, { recursive: true, force: true });
    for (const p of [...PARTES, "mundo.json"]) await rm(join(c.raiz, p), { recursive: true, force: true }); // back to empty
    return 1;
  } finally { await rm(tmp, { recursive: true, force: true }); }
}
