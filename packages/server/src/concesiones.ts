// npm run concesiones -- <carpeta del mundo> [misión]   (default: MOTOR_MUNDO; also a DATOS_DIR such as .run/datos)
// The rewards granted in a world (U14 (6), the TRG26 spec §9), for its organizers: one CSV line per grant —
//   jugador,nombre,mision,recompensas,instante,estado
// oldest first; [misión] keeps only that quest's. A grant is what a quest with `recompensas` wrote, once, in the world's
// misiones store when someone with identity completed it (features/misiones/concesion.ts: keys `c:<misión>:<jugador>`
// in datos/misiones.json + .jsonl). Read-only: it never writes in the folder, and it works with the server running —
// it reads the snapshot and the journal of one moment, as the world's copy does (mundo-zip.ts leerFuncion) and folds
// them as the server does (datos.ts); a journal line still being written is left out (the server appends every second:
// run it again and that grant is there). The CSV goes to stdout (> concesiones.csv), a summary to stderr.
// It ships with the engine (installer and image: `docker exec <contenedor> /opt/numinia-engine/node/bin/node
// packages/server/src/concesiones.ts /mundo`). Exit 0 = read (even with no grants), 1 = no world there, 2 = usage.
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leerFoto, repetirDiario } from "./datos.ts";
import type { Plegado } from "./datos.ts";
import { leerFuncion } from "./mundo-zip.ts";

/** The misiones feature's store prefix for grants and the CSV columns (the record's fields, in this order). */
export const PREFIJO = "c:";
export const COLUMNAS = ["jugador", "nombre", "mision", "recompensas", "instante", "estado"] as const;
export type Concesion = { jugador: string; nombre: string; mision: string; recompensas: string[]; instante: string; estado: string };
export type Leidas = { donde: string; filas: Concesion[]; raras: number; rotas: number; avisos: string[] };

const esTexto = (v: unknown): v is string => typeof v === "string";
/** One stored value as a grant, or null when it is not one (written by something else, or damaged). */
export function leerConcesion(v: unknown): Concesion | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (![o.jugador, o.nombre, o.mision, o.instante, o.estado].every(esTexto) || !Array.isArray(o.recompensas) || !o.recompensas.every(esTexto)) return null;
  return { jugador: o.jugador as string, nombre: o.nombre as string, mision: o.mision as string, recompensas: o.recompensas as string[], instante: o.instante as string, estado: o.estado as string };
}

/** Where the features' files are: <carpeta>/datos (a world folder) or <carpeta> itself (a DATOS_DIR); null = neither. */
export function carpetaDatos(carpeta: string): string | null {
  const r = resolve(carpeta), dentro = join(r, "datos");
  const hay = (d: string) => existsSync(join(d, "misiones.json")) || existsSync(join(d, "misiones.jsonl"));
  try { if (statSync(dentro).isDirectory()) return dentro; } catch { /* not a world folder */ }
  return hay(r) ? r : null;
}

/** The grants recorded in a world folder (or a DATOS_DIR), oldest first; `mision` keeps only that quest's. */
export function leerConcesiones(carpeta: string, mision?: string): Leidas | null {
  const d = carpetaDatos(carpeta);
  if (!d) return null;
  const par = leerFuncion(join(d, "misiones.json"), join(d, "misiones.jsonl"));
  const m: Plegado = { version: 0, state: new Map(), store: new Map() }, avisos: string[] = [];
  if (par.json) { try { leerFoto(par.json.toString("utf8"), m); } catch (e) { avisos.push(`la foto misiones.json no se lee (${String((e as Error)?.message ?? e).slice(0, 80)}); sigo con el diario`); } }
  const r = par.jsonl ? repetirDiario(par.jsonl.toString("utf8"), m) : { lineas: 0, rotas: 0 };
  const filas: Concesion[] = [];
  let raras = 0;
  for (const [k, v] of m.store) {
    if (!k.startsWith(PREFIJO)) continue;
    const c = leerConcesion(v);
    if (!c) { raras++; continue; }
    if (!mision || c.mision === mision) filas.push(c);
  }
  filas.sort((a, b) => a.instante.localeCompare(b.instante) || a.jugador.localeCompare(b.jugador) || a.mision.localeCompare(b.mision));
  return { donde: d, filas, raras, rotas: r.rotas, avisos };
}

/** One CSV cell (RFC 4180: quoted when it holds a comma, a quote or a line break). A cell that would start with = + - @
 * gets an apostrophe in front, so a spreadsheet never takes a player's name for a formula. */
export function celda(s: string): string {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(t) ? `"${t.replaceAll("\"", "\"\"")}"` : t;
}
/** The CSV: a header line, then one line per grant; several rewards in one cell, separated by «;». */
export const enCsv = (filas: readonly Concesion[]): string =>
  [COLUMNAS.join(","), ...filas.map((c) => [c.jugador, c.nombre, c.mision, c.recompensas.join(";"), c.instante, c.estado].map(celda).join(","))].join("\n") + "\n";

/** Run as a command (not imported): argv[1] is this file, also through a symlinked folder (/home → /var/home). */
const esOrden = (): boolean => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };

if (esOrden()) {
  const args = process.argv.slice(2);
  const carpeta = args[0] ?? process.env.MOTOR_MUNDO, mision = args[1];
  if (!carpeta || args.length > 2 || carpeta.startsWith("-")) {
    console.error("uso: npm run concesiones -- <carpeta del mundo> [misión]   (o MOTOR_MUNDO=<carpeta>): las recompensas concedidas, en CSV");
    process.exit(2);
  }
  const l = leerConcesiones(carpeta, mision);
  if (!l) { console.error(`en ${resolve(carpeta)} no hay datos de un mundo (ni datos/ ni misiones.json): ¿es la carpeta del mundo (MOTOR_MUNDO)?`); process.exit(1); }
  process.stdout.write(enCsv(l.filas));
  for (const a of l.avisos) console.error(`aviso: ${a}`);
  const extra = [l.raras ? `${l.raras} registro(s) c:… que no son concesiones` : "", l.rotas ? `${l.rotas} línea(s) rota(s) en el diario` : ""].filter(Boolean).join(" · ");
  console.error(`${l.filas.length} ${l.filas.length === 1 ? "concesión" : "concesiones"}${mision ? ` de «${mision}»` : ""} en ${l.donde}${extra ? ` (${extra})` : ""}`);
}
