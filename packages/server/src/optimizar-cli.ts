// optimizar-cli (N22): `npm run optimizar -- <world folder | uploads folder | file.glb> [--otra-vez]`
//   a world (or its datos/activos/): every uploaded .glb and .png gets its lighter copy in datos/activos/optimizados/ (the same
//     files the server makes by itself in the background, optimizar-cola.ts), then the world's download is measured
//     before/after against the budgets (download_until_playable in limits.json: 10 MB phone, 12 MB Quest)
//   a .glb or .png: writes <name>.optimizado.glb|.webp beside it (for a file before it is uploaded or put in a template)
// --otra-vez tries again files already in the report. Nothing original is ever changed.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { COMPRIMIBLES, OPTIMIZABLES } from "./activos.ts";
import { guardarCopia, nombreCopia, yaProbados } from "./optimizar-cola.ts";
import { optimizar } from "./optimizar.ts";

const TOPES = { "móvil (C)": 10, "Quest (B)": 12 }; // MB, limits.json download_until_playable
const SUBIDO = /^([0-9a-f]{64})\.([a-z0-9]{2,4})$/;
const mb = (n: number) => (n / 1e6).toFixed(2);

export async function optimizarCarpeta(dir: string, o: { otraVez?: boolean; log?: (l: string) => void } = {}): Promise<{ antes: number; despues: number; filas: string[][] }> {
  const log = o.log ?? console.log, opt = join(dir, "optimizados"), probados = o.otraVez ? new Set<string>() : yaProbados(opt);
  const filas: string[][] = [];
  let antes = 0, despues = 0;
  for (const f of readdirSync(dir).sort()) {
    const m = SUBIDO.exec(f);
    if (!m) continue;
    const ruta = join(dir, f), bytes = statSync(ruta).size, gz = COMPRIMIBLES.has(m[2]);
    const enCable = (b: Uint8Array | null, n: number) => (gz && b ? gzipSync(b, { level: 9 }).length : n); // what a page downloads (gzip for models)
    let ahora: number, nota = "";
    const copia = join(opt, nombreCopia(m[1], m[2], m[2] === "png" ? "webp" : undefined));
    if (OPTIMIZABLES.has(m[2]) && (!probados.has(f) || o.otraVez)) {
      const r = await optimizar(readFileSync(ruta), m[2]);
      const l = await guardarCopia(opt, m[1], m[2], r);
      ahora = r.bytes ? (l.gz ?? r.despues) : enCable(readFileSync(ruta), bytes);
      nota = r.bytes ? `${mb(r.antes)} → ${mb(r.despues)} MB${r.ext ? ` (${r.ext} sin pérdida)` : ""}${r.webp ? ` · ${r.webp} textura${r.webp === 1 ? "" : "s"} PNG → WebP` : ""}, ${r.ms} ms` : `se queda: ${r.motivo}`;
    } else if (existsSync(copia)) {
      ahora = existsSync(`${copia}.gz`) ? statSync(`${copia}.gz`).size : statSync(copia).size; nota = "ya tenía copia";
    } else { ahora = enCable(gz ? readFileSync(ruta) : null, bytes); nota = OPTIMIZABLES.has(m[2]) ? "ya probado: se queda" : ""; }
    antes += bytes; despues += ahora;
    filas.push([`${m[1].slice(0, 12)}….${m[2]}`, mb(bytes), mb(ahora), nota]);
  }
  log(filas.map((r) => `  ${r[0].padEnd(18)} ${r[1].padStart(7)} → ${r[2].padStart(7)} MB  ${r[3]}`).join("\n"));
  log(`\n${dir}\n  descarga de los ficheros del mundo: ${mb(antes)} MB tal cual → ${mb(despues)} MB (copias ligeras + gzip) = ${Math.round(100 * despues / Math.max(antes, 1))} %`);
  for (const [quien, tope] of Object.entries(TOPES)) if (despues > tope * 1e6) log(`  ⚠ pasa de ${tope} MB, el tope de ${quien}: aunque la carga sea progresiva, quita o aligera lo más pesado (vídeos, imágenes grandes)`);
  log("  (si un fichero no está a la vista, la página no lo baja hasta acercarse: esto es el peor caso, el mundo entero)");
  return { antes, despues, filas };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2), otraVez = args.includes("--otra-vez"), rutas = args.filter((a) => !a.startsWith("--"));
  if (!rutas.length) { console.error("uso: npm run optimizar -- <carpeta del mundo | datos/activos | fichero.glb> [--otra-vez]"); process.exit(2); }
  for (const r of rutas) {
    if (!existsSync(r)) { console.error(`no existe ${r}`); process.exitCode = 1; continue; }
    if (statSync(r).isFile()) {
      const tipo = r.split(".").pop()!.toLowerCase();
      const res = await optimizar(readFileSync(r), tipo);
      if (!res.bytes) { console.log(`${r}: se queda como está — ${res.motivo}`); continue; }
      const out = join(dirname(r), basename(r).replace(/\.[a-z0-9]+$/i, "") + `.optimizado.${res.ext ?? tipo}`);
      writeFileSync(out, res.bytes);
      console.log(`${r}: ${mb(res.antes)} → ${mb(res.despues)} MB${res.ext ? " (WebP sin pérdida)" : ` (${mb(gzipSync(res.bytes, { level: 9 }).length)} MB con gzip)`} en ${res.ms} ms → ${out}`);
      continue;
    }
    const dir = existsSync(join(r, "datos", "activos")) ? join(r, "datos", "activos") : r;
    await optimizarCarpeta(dir, { otraVez });
  }
}

if (import.meta.main) await main();
