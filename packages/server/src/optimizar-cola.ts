// optimizar-cola (N22): the lighter copies of a world's models, made by the server itself in the background — after an
// upload (subidas.ts) and, once at start, for every uploaded .glb that has none yet. One at a time, in a worker thread,
// so the 20 Hz loop never waits for it. MOTOR_OPTIMIZAR=no turns it off (the files are served as they are).
//   <uploads>/optimizados/<sha256>.glb      the copy (optimizar.ts says how it is made and checked)
//   <uploads>/optimizados/<sha256>.glb.gz   the same, gzipped once (activos.ts sends it to pages that take gzip)
//   <uploads>/optimizados/<sha256>.png.webp a PNG's lossless WebP (sent to browsers that say they take WebP)
//   <uploads>/optimizados/informe.jsonl     one line per file tried: bytes before/after or why it stays as it is
// The command line does the same by hand: `npm run optimizar -- <world folder>` (optimizar-cli.ts).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";
import { COMPRIMIBLES, OPTIMIZABLES } from "./activos.ts";
import type { Activos } from "./activos.ts";
import type { Resultado } from "./optimizar.ts";

/** H13: a level of detail in the report: its triangles and its bytes (raw and gzipped). */
export type LodInforme = { nivel: number; triangulos: number; bytes: number; gz?: number };
export type LineaInforme = { cuando: string; sha256: string; tipo: string; antes: number; despues: number; gz?: number; ms: number; motivo?: string; ext?: string; webp?: number;
  /** H13 (a .glb only): the model's triangles and the levels made — `[]` when it gets none (then `lodMotivo` says why). A line without `lods` predates H13: yaProbados does not count it, so the model is revisited. */
  triangulos?: number; lods?: LodInforme[]; lodMotivo?: string };
/** H13: the name of a level of detail beside the copy (served at /a/<sha256>.lod<n>.glb). */
export const nombreLod = (sha: string, nivel: number): string => `${sha}.lod${nivel}.glb`;
/** The copy's file name in optimizados/ (a PNG's is <sha>.png.webp). */
export const nombreCopia = (sha: string, tipo: string, ext?: string): string => `${sha}.${tipo}${ext && ext !== tipo ? `.${ext}` : ""}`;
const SUBIDO = /^([0-9a-f]{64})\.([a-z0-9]{2,4})$/;

/** Writes the copy (+ its gzip) and the report line; what the queue and the command line share. */
export async function guardarCopia(dir: string, sha: string, tipo: string, r: Resultado, gz?: Uint8Array, lodsGz: Uint8Array[] = []): Promise<LineaInforme> {
  await mkdir(dir, { recursive: true });
  const linea: LineaInforme = { cuando: new Date().toISOString(), sha256: sha, tipo, antes: r.antes, despues: r.despues, ms: r.ms, ...(r.motivo ? { motivo: r.motivo } : {}), ...(r.ext ? { ext: r.ext } : {}), ...(r.webp ? { webp: r.webp } : {}) };
  if (r.lods) { // H13: the levels first, so the report line (written last) never promises a file that is not there yet
    linea.triangulos = r.lods.triangulos; linea.lods = [];
    if (r.lods.motivo) linea.lodMotivo = r.lods.motivo;
    for (const [i, x] of r.lods.lods.entries()) {
      const nombre = nombreLod(sha, x.nivel), z = lodsGz[i] ?? gzipSync(x.bytes, { level: 9 });
      await writeFile(join(dir, `.${nombre}.gz.tmp`), z); await rename(join(dir, `.${nombre}.gz.tmp`), join(dir, `${nombre}.gz`));
      await writeFile(join(dir, `.${nombre}.tmp`), x.bytes); await rename(join(dir, `.${nombre}.tmp`), join(dir, nombre));
      linea.lods.push({ nivel: x.nivel, triangulos: x.triangulos, bytes: x.bytes.length, gz: z.length });
    }
  }
  if (r.bytes) {
    const nombre = nombreCopia(sha, tipo, r.ext);
    if (COMPRIMIBLES.has(tipo) && !r.ext) {
      const z = gz ?? gzipSync(r.bytes, { level: 9 });
      linea.gz = z.length;
      await writeFile(join(dir, `.${nombre}.gz.tmp`), z); await rename(join(dir, `.${nombre}.gz.tmp`), join(dir, `${nombre}.gz`));
    }
    await writeFile(join(dir, `.${nombre}.tmp`), r.bytes); await rename(join(dir, `.${nombre}.tmp`), join(dir, nombre)); // last: served only whole
  }
  await appendFile(join(dir, "informe.jsonl"), JSON.stringify(linea) + "\n");
  return linea;
}

/** The files already tried (made or left as they are), from the report. */
export function yaProbados(dir: string): Set<string> {
  const s = new Set<string>();
  try { for (const l of readFileSync(join(dir, "informe.jsonl"), "utf8").split("\n")) { if (!l) continue; try { const x = JSON.parse(l) as LineaInforme; if (x.tipo !== "glb" || x.lods) s.add(`${x.sha256}.${x.tipo}`); } catch { /* a torn line */ } } } catch { /* none yet */ }
  return s;
}

export class ColaOptimizar {
  readonly dir: string | null;
  readonly stats = { hechos: 0, dejados: 0, ahorrados: 0 };
  private readonly cola: string[] = [];
  private readonly vistos: Set<string>;
  private hilo: Worker | null = null;
  private corriendo: Promise<void> | null = null;
  private parado = false;
  private readonly activos: Activos;
  private readonly log: (l: string) => void;
  private readonly activa: boolean;

  constructor(activos: Activos, log: (l: string) => void = () => {}, activa = process.env.MOTOR_OPTIMIZAR !== "no") {
    this.activos = activos; this.log = log; this.activa = activa;
    this.dir = activos.optimizados;
    this.vistos = this.dir ? yaProbados(this.dir) : new Set();
  }

  /** A file to make lighter (glb and png uploads; one already tried is skipped). */
  pedir(sha: string, tipo: string): void {
    const k = `${sha}.${tipo}`;
    if (!this.activa || !this.dir || this.parado || !OPTIMIZABLES.has(tipo) || this.vistos.has(k) || !this.activos.subidas) return;
    if (!existsSync(join(this.activos.subidas, k))) return; // only uploads: the house library is tiny and lives in the app
    this.vistos.add(k); this.cola.push(k);
    this.corriendo ??= this.vaciar().finally(() => { this.corriendo = null; });
  }

  /** Every uploaded .glb without a copy yet (at start). */
  repasar(): number {
    if (!this.activa || !this.activos.subidas || !existsSync(this.activos.subidas)) return 0;
    let n = 0;
    for (const f of readdirSync(this.activos.subidas)) { const m = SUBIDO.exec(f); if (m && OPTIMIZABLES.has(m[2]) && !this.vistos.has(f)) { this.pedir(m[1], m[2]); n++; } }
    if (n) this.log(`[optimizar] ${n} modelo${n === 1 ? "" : "s"} subido${n === 1 ? "" : "s"} sin copia ligera: los preparo en segundo plano`);
    return n;
  }

  /** Resolves when the queue is empty (tests, the command line). */
  async esperar(): Promise<void> { while (this.corriendo) await this.corriendo; }

  async parar(): Promise<void> { this.parado = true; this.cola.length = 0; await this.esperar(); await this.hilo?.terminate(); this.hilo = null; }

  private enHilo(bytes: Uint8Array, tipo: string): Promise<Resultado & { gz?: Uint8Array; lodsGz?: Uint8Array[] }> {
    this.hilo ??= new Worker(new URL("./optimizar-hilo.ts", import.meta.url));
    this.hilo.unref();
    const h = this.hilo;
    return new Promise((ok, mal) => {
      const fuera = (e: Error) => { h.off("message", bien); this.hilo = null; mal(e); };
      const bien = (r: Resultado & { gz?: Uint8Array; lodsGz?: Uint8Array[] }) => { h.off("error", fuera); ok(r); };
      h.once("message", bien); h.once("error", fuera);
      h.postMessage({ bytes, tipo }, [bytes.buffer as ArrayBuffer]);
    });
  }

  private async vaciar(): Promise<void> {
    while (this.cola.length && !this.parado) {
      const k = this.cola.shift()!, [sha, tipo] = k.split(".");
      try {
        const b = await readFile(join(this.activos.subidas!, k));
        const r = await this.enHilo(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), tipo);
        if (this.parado) return;
        const l = await guardarCopia(this.dir!, sha, tipo, r, r.gz, r.lodsGz);
        if (l.lods?.length) this.log(`[optimizar] ${sha.slice(0, 12)}….${tipo}: ${l.lods.length} niveles de detalle (${l.triangulos} → ${l.lods.map((x) => x.triangulos).join(" → ")} triángulos)`);
        if (r.bytes) { this.stats.hechos++; this.stats.ahorrados += r.antes - r.despues; this.log(`[optimizar] ${sha.slice(0, 12)}….${tipo}: ${mb(r.antes)} → ${mb(r.despues)} MB${l.gz ? ` (${mb(l.gz)} MB con gzip)` : r.ext ? ` (${r.ext} sin pérdida)` : ""} en ${r.ms} ms`); }
        else { this.stats.dejados++; this.log(`[optimizar] ${sha.slice(0, 12)}….${tipo} se queda como está: ${r.motivo}`); }
      } catch (e) { this.stats.dejados++; this.log(`[optimizar] no pude con ${k}: ${String((e as Error)?.message ?? e).slice(0, 160)}`); }
    }
  }
}

const mb = (n: number) => (n / 1e6).toFixed(2);
