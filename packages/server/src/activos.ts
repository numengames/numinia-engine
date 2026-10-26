// activos (H1): the files things in the world are made of, served by their content: GET /a/<sha256>.<ext>.
// Two places, looked up in this order:
//   - the house library, `activos/` at the repo root (CC0 or own work, each with its licence next to it): any
//     name, indexed by sha256 when the server starts, so people and agents keep readable names;
//   - uploads (H9), one folder of files already named `<sha256>.<ext>` (ACTIVOS_DIR).
// A file never changes under its name, so it is cached for a year; any page may fetch it (models load cross-origin
// from the plaza's dev server).
// N22: an uploaded .glb may have a lighter copy that draws the same (optimizar.ts) in <uploads>/optimizados/<sha256>.glb:
// /a/<sha256>.glb serves that one; a .png its lossless WebP (<sha256>.png.webp) to a browser whose Accept says WebP. Models (glb, vrm, vrma, hdr) go gzipped to a page that accepts it (a whole file,
// never a byte range): the copy's .gz on disk when it has one, else made once in the background and kept in memory.
import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { medidasImagen, TIPOS } from "../../net/src/ficheros.ts";
import type { Medidas } from "../../net/src/ficheros.ts";
export { TIPOS } from "../../net/src/ficheros.ts"; // the kinds of file (H9 shares them with the page)
/** What /a/ serves: every uploadable kind plus .vrma (J1: the house animations) and .opus/.m4a (S6: the house
 * sounds) — nobody uploads those: they are not in TIPOS, so they stay out of what a page may send us. */
export const SERVIR: Record<string, string> = { ...TIPOS, vrma: "model/gltf-binary", opus: "audio/ogg", m4a: "audio/mp4" };

/** The house library. In the installer it sits next to the server code (app/activos). */
export const BIBLIOTECA = fileURLToPath(new URL("../../../activos", import.meta.url));

const RUTA = /^\/a\/([0-9a-f]{64})\.([a-z0-9]{2,5})$/;
/** H13: a model's level of detail, /a/<sha256>.lod1.glb, made at ingest (lod.ts) beside the lighter copy. Only there: no original to fall back on. */
const RUTA_LOD = /^\/a\/([0-9a-f]{64})\.lod([12])\.glb$/;
/** N22: kinds that shrink in gzip (pictures, sound and video are already compressed). */
export const COMPRIMIBLES = new Set(["glb", "vrm", "vrma", "hdr"]);
/** N22: kinds with a lighter copy (optimizar.ts): models, and PNG pictures (their lossless WebP). */
export const OPTIMIZABLES = new Set(["glb", "png"]);
/** N22: the gzipped files kept in memory, at most (a file bigger than this is sent as it is). */
export const GZ_MEMORIA_MB = 96;
/** U12: how much of a picture is read to measure it. */
export const MEDIR_BYTES = 1024 * 1024;

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export class Activos {
  /** sha256 -> file of the library */
  readonly indice = new Map<string, { ruta: string; ext: string; bytes: number }>();
  readonly biblioteca: string | null;
  readonly subidas: string | null;
  /** N22: where the lighter copies of uploads live (null = no uploads). */
  readonly optimizados: string | null;
  private readonly gz = new Map<string, Buffer | null>(); // file -> its gzip (null = being made)
  private gzBytes = 0;
  readonly stats = { gz: 0, optimizados: 0 };
  constructor(biblioteca: string | null, subidas: string | null, log: (l: string) => void = () => {}) {
    this.biblioteca = biblioteca; this.subidas = subidas; this.optimizados = subidas ? join(subidas, "optimizados") : null;
    if (biblioteca && existsSync(biblioteca)) this.indexar(biblioteca);
    if (biblioteca) log(`[activos] biblioteca: ${this.indice.size} ficheros en ${biblioteca}${subidas ? ` · subidas en ${subidas}` : ""}`);
    // N22: the house models' gzip made at start, in the background (the first visitor gets it too)
    setImmediate(() => { for (const b of this.indice.values()) if (COMPRIMIBLES.has(b.ext)) this.gzipDe(b.ruta, b.bytes); });
  }

  private indexar(dir: string): void {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) { this.indexar(ruta); continue; }
      const ext = e.name.split(".").pop()!.toLowerCase();
      if (!SERVIR[ext]) continue; // licences, READMEs
      const bytes = readFileSync(ruta);
      this.indice.set(sha256(bytes), { ruta, ext, bytes: bytes.length });
    }
  }

  /** M19: an app's `assets/` folder joins the library: its files (already hash-named and checked by apps.ts) are served at /a/<sha256>.<ext> like any other. */
  agregar(dir: string): number {
    const antes = this.indice.size;
    if (existsSync(dir)) this.indexar(dir);
    return this.indice.size - antes;
  }

  /** Where the file behind a hash lives, or null. */
  buscar(hash: string, ext: string): string | null {
    const b = this.indice.get(hash);
    if (b && b.ext === ext) return b.ruta;
    if (this.subidas) { const r = join(this.subidas, `${hash}.${ext}`); if (existsSync(r)) return r; }
    return null;
  }

  /** N22: the file /a/<hash>.<ext> sends: the lighter copy when there is one, else the file itself (buscar). */
  /** N22: a PNG's lossless WebP goes only to a browser that says it takes WebP (`accept`); a crawler gets the PNG. */
  aServir(hash: string, ext: string, accept = ""): { ruta: string; optimizado: boolean; tipo?: string } | null {
    if (this.optimizados && ext === "glb") { const r = join(this.optimizados, `${hash}.glb`); if (existsSync(r)) return { ruta: r, optimizado: true }; }
    if (this.optimizados && ext === "png" && /image\/webp/.test(accept)) { const r = join(this.optimizados, `${hash}.png.webp`); if (existsSync(r)) return { ruta: r, optimizado: true, tipo: "image/webp" }; }
    const ruta = this.buscar(hash, ext);
    return ruta ? { ruta, optimizado: false } : null;
  }

  /** H13: where the level of detail `nivel` (1 or 2) of a model lives, or null. */
  rutaLod(hash: string, nivel: number): string | null {
    if (!this.optimizados) return null;
    const r = join(this.optimizados, `${hash}.lod${nivel}.glb`);
    return existsSync(r) ? r : null;
  }

  /** N22: the gzip of `ruta` if it is ready (its .gz beside it, or made before); else starts making it and says null. */
  private gzipDe(ruta: string, bytes: number): Buffer | string | null {
    const g = this.gz.get(ruta);
    if (g) return g;
    if (g === null) return null;
    if (existsSync(`${ruta}.gz`)) return `${ruta}.gz`;
    if (this.gzBytes + bytes / 2 > GZ_MEMORIA_MB * 1024 * 1024) return null;
    this.gz.set(ruta, null);
    void readFile(ruta).then((b) => new Promise<Buffer>((ok, mal) => gzip(b, { level: 9 }, (e, z) => (e ? mal(e) : ok(z))))).then((z) => {
      if (z.length >= bytes * 0.95) { this.gz.set(ruta, null); return; } // not worth it: stays «never ready», sent as it is
      this.gz.set(ruta, z); this.gzBytes += z.length;
    }).catch(() => this.gz.delete(ruta));
    return null;
  }

  private readonly medidasVistas = new Map<string, Medidas | null>();
  /** U12: the size in pixels of a picture this server has (png, jpg, webp), from its first MEDIR_BYTES (a JPEG's
   * frame header comes after its EXIF and colour segments, 64 KB each at most). Once per file: it never changes under
   * its name. null = not here, not a picture, or its bytes do not say. */
  medidas(hash: string, ext: string): Medidas | null {
    const k = `${hash}.${ext}`;
    if (this.medidasVistas.has(k)) return this.medidasVistas.get(k)!;
    const ruta = this.buscar(hash, ext);
    if (!ruta) return null; // it may be uploaded later: ask again then
    let m: Medidas | null = null;
    try {
      const fd = openSync(ruta, "r"), b = new Uint8Array(Math.min(statSync(ruta).size, MEDIR_BYTES));
      try { readSync(fd, b, 0, b.length, 0); } finally { closeSync(fd); }
      m = medidasImagen(ext, b);
    } catch { m = null; }
    this.medidasVistas.set(k, m);
    return m;
  }

  /** Answer GET /a/<sha256>.<ext> (HEAD: the same headers, no body — H9: a page asks before uploading). Returns
   * false when the path is not an asset path at all. */
  servir(path: string, res: ServerResponse, head = false, range?: string, acepta?: string, accept?: string): boolean {
    const lod = RUTA_LOD.exec(path);
    const m = lod ? [path, lod[1], "glb"] : RUTA.exec(path);
    if (!m || !SERVIR[m[2]]) return false;
    const rl = lod ? this.rutaLod(m[1], Number(lod[2])) : null;
    const elegido = lod ? (rl ? { ruta: rl, optimizado: true } : null) : this.aServir(m[1], m[2], accept), ruta = elegido?.ruta;
    if (!ruta) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(head ? undefined : JSON.stringify({ error: `no hay ningún fichero ${m[1]}.${m[2]}` }));
      return true;
    }
    const total = statSync(ruta).size, comprimible = COMPRIMIBLES.has(m[2]);
    const vary = comprimible ? "accept-encoding" : m[2] === "png" && this.optimizados ? "accept" : null;
    const comun: Record<string, string> = { "content-type": elegido!.tipo ?? SERVIR[m[2]], "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*", "accept-ranges": "bytes", ...(vary ? { vary } : {}), ...(elegido!.optimizado ? { "x-optimizado": elegido!.tipo ? "webp-sin-perdida" : lod ? `lod${lod[2]}` : "meshopt" } : {}) };
    // U10: videos and sounds ask for byte ranges (a browser seeks a video, or will not loop it, without them)
    const r = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (r && (r[1] || r[2])) {
      let ini = r[1] ? Number(r[1]) : Math.max(0, total - Number(r[2])), fin = r[1] && r[2] ? Number(r[2]) : total - 1;
      fin = Math.min(fin, total - 1);
      if (ini > fin || ini >= total) { res.writeHead(416, { ...comun, "content-range": `bytes */${total}` }); res.end(); return true; }
      res.writeHead(206, { ...comun, "content-range": `bytes ${ini}-${fin}/${total}`, "content-length": String(fin - ini + 1) });
      if (head) res.end(); else createReadStream(ruta, { start: ini, end: fin }).pipe(res);
      return true;
    }
    // N22: a whole model, gzipped when the page takes gzip and the gzip is ready
    const z = comprimible && /\bgzip\b/.test(acepta ?? "") ? this.gzipDe(ruta, total) : null;
    if (z) {
      const largo = typeof z === "string" ? statSync(z).size : z.length;
      res.writeHead(200, { ...comun, "content-encoding": "gzip", "content-length": String(largo) });
      this.stats.gz++; if (elegido!.optimizado) this.stats.optimizados++;
      if (head) res.end(); else if (typeof z === "string") createReadStream(z).pipe(res); else res.end(z);
      return true;
    }
    if (elegido!.optimizado) this.stats.optimizados++;
    res.writeHead(200, { ...comun, "content-length": String(total) });
    if (head) res.end(); else createReadStream(ruta).pipe(res);
    return true;
  }
}
