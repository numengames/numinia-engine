// npm run bienes -- <carpeta del mundo>                       los bienes dados en un mundo, comprobados, en CSV
// npm run bienes -- verificar <recibo-….json | nb1.…>          ¿es auténtico este recibo? (exit 0 sí, 1 no)
// npm run bienes -- metadatos <recibo-….json | nb1.…> [número] [uri]   su ficha ERC-721 y el vale EIP-712 sin firmar
// N10 (bienes digitales). The world's goods live in the bienes feature's store (`b:<id>` in datos/bienes.json + .jsonl,
// features/bienes/server.ts); each carries its receipt signed by the world (recibos.ts). The list re-checks every
// signature, so a record edited by hand shows «MAL». Read-only, works with the server running (as concesiones.ts).
// CSV columns: id,nombre,objeto,dueno,mision,mundo,instante,firma — oldest first; summary on stderr.
// Exit 0 = read, 1 = nothing there / receipt not valid, 2 = usage.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leerFoto, repetirDiario } from "./datos.ts";
import type { Plegado } from "./datos.ts";
import { leerFuncion } from "./mundo-zip.ts";
import { celda } from "./concesiones.ts";
import { leerRecibo } from "./recibos.ts";
import { metadatos, vale } from "./cadena.ts";

export const COLUMNAS_BIENES = ["id", "nombre", "objeto", "dueno", "mision", "mundo", "instante", "firma"] as const;
export type FilaBien = Record<(typeof COLUMNAS_BIENES)[number], string>;

/** <carpeta>/datos (a world folder) or <carpeta> itself (a DATOS_DIR) when it holds bienes.json(l); null = neither. */
function carpetaBienes(carpeta: string): string | null {
  const r = resolve(carpeta), hay = (d: string) => existsSync(join(d, "bienes.json")) || existsSync(join(d, "bienes.jsonl"));
  try { if (statSync(join(r, "datos")).isDirectory() && hay(join(r, "datos"))) return join(r, "datos"); } catch { /* not a world folder */ }
  return hay(r) ? r : null;
}

/** The goods recorded in a world, each with its signature re-checked; null = no goods there. */
export function leerBienes(carpeta: string): { donde: string; filas: FilaBien[]; malas: number } | null {
  const d = carpetaBienes(carpeta);
  if (!d) return null;
  const par = leerFuncion(join(d, "bienes.json"), join(d, "bienes.jsonl"));
  const m: Plegado = { version: 0, state: new Map(), store: new Map() };
  if (par.json) { try { leerFoto(par.json.toString("utf8"), m); } catch { /* the journal still counts */ } }
  if (par.jsonl) repetirDiario(par.jsonl.toString("utf8"), m);
  const filas: FilaBien[] = [];
  let malas = 0;
  for (const [k, v] of m.store) {
    const ajeno = k.startsWith("f:"); // N18: brought from a world this one trusts (signed there; the owner is a guest here)
    if (!(k.startsWith("b:") || ajeno) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>, l = leerRecibo(o.recibo);
    const coincide = l.ok && (ajeno ? l.huella.startsWith(k.slice(2)) : l.recibo.id === k.slice(2) && l.recibo.dueno === o.dueno) && l.recibo.objeto.id === o.objeto && l.recibo.objeto.nombre === o.nombre;
    if (!coincide) malas++;
    filas.push({ id: ajeno ? k : k.slice(2), nombre: String(o.nombre ?? ""), objeto: String(o.objeto ?? ""), dueno: String(o.dueno ?? ""), mision: String(o.mision ?? ""), mundo: String(o.mundo ?? ""), instante: String(o.instante ?? ""), firma: coincide ? "valida" : `MAL: ${l.ok ? "el registro no dice lo mismo que su recibo" : l.motivo}` });
  }
  filas.sort((a, b) => a.instante.localeCompare(b.instante) || a.id.localeCompare(b.id));
  return { donde: d, filas, malas };
}
export const bienesCsv = (filas: readonly FilaBien[]): string => [COLUMNAS_BIENES.join(","), ...filas.map((f) => COLUMNAS_BIENES.map((c) => celda(f[c])).join(","))].join("\n") + "\n";

/** The receipt inside a file (the downloaded recibo-….json or a bare token) or the argument itself. */
export function reciboDeArgumento(a: string): string {
  const t = a.trim();
  if (t.startsWith("nb1.")) return t;
  const txt = readFileSync(t, "utf8").trim();
  if (txt.startsWith("nb1.")) return txt;
  const o = JSON.parse(txt) as { recibo?: unknown };
  return typeof o.recibo === "string" ? o.recibo.trim() : "";
}

const esOrden = (): boolean => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };

if (esOrden()) {
  const [orden, ...resto] = process.argv.slice(2);
  const uso = () => { console.error("uso: npm run bienes -- <carpeta del mundo>  |  verificar <recibo>  |  metadatos <recibo> [número] [uri]"); process.exit(2); };
  if (orden === "verificar" || orden === "metadatos") {
    if (!resto[0]) uso();
    let token = "";
    try { token = reciboDeArgumento(resto[0]); } catch (e) { console.error(`no leo ${resto[0]}: ${String((e as Error)?.message ?? e).slice(0, 120)}`); process.exit(1); }
    const l = leerRecibo(token);
    if (!l.ok) { console.error(`NO VALE: ${l.motivo}`); process.exit(1); }
    if (orden === "verificar") {
      console.log(JSON.stringify({ valido: true, huella: l.huella, ...l.recibo }, null, 2));
      console.error(`auténtico: «${l.recibo.objeto.nombre}», de ${l.recibo.mundo}, firmado por ${l.recibo.emisor}`);
    } else {
      const numero = BigInt(resto[1] ?? "1"), uri = resto[2] ?? `https://${l.recibo.mundo}/bienes/${numero}.json`;
      console.log(JSON.stringify({ metadatos: metadatos(l.recibo), vale: vale(l.recibo, { numero, uri }) }, null, 2));
    }
  } else {
    const carpeta = orden ?? process.env.MOTOR_MUNDO;
    if (!carpeta || resto.length || carpeta.startsWith("-")) uso();
    const r = leerBienes(carpeta!);
    if (!r) { console.error(`en ${resolve(carpeta!)} no hay bienes (ni datos/bienes.json ni bienes.json)`); process.exit(1); }
    process.stdout.write(bienesCsv(r.filas));
    console.error(`${r.filas.length} ${r.filas.length === 1 ? "bien" : "bienes"} en ${r.donde}${r.malas ? ` · ${r.malas} con la firma MAL` : " · todas las firmas valen"}`);
  }
}
