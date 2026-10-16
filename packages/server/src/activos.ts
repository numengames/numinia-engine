// activos (H1): the files things in the world are made of, served by their content: GET /a/<sha256>.<ext>.
// Two places, looked up in this order:
//   - the house library, `activos/` at the repo root (CC0 or own work, each with its licence next to it): any
//     name, indexed by sha256 when the server starts, so people and agents keep readable names;
//   - uploads (H9), one folder of files already named `<sha256>.<ext>` (ACTIVOS_DIR).
// A file never changes under its name, so it is cached for a year; any page may fetch it (models load cross-origin
// from the plaza's dev server).
import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { medidasImagen, TIPOS } from "../../net/src/ficheros.ts";
import type { Medidas } from "../../net/src/ficheros.ts";
export { TIPOS } from "../../net/src/ficheros.ts"; // the kinds of file (H9 shares them with the page)
/** What /a/ serves: every uploadable kind plus .vrma (J1: the house animations; nobody uploads those). */
export const SERVIR: Record<string, string> = { ...TIPOS, vrma: "model/gltf-binary" };

/** The house library. In the installer it sits next to the server code (app/activos). */
export const BIBLIOTECA = fileURLToPath(new URL("../../../activos", import.meta.url));

const RUTA = /^\/a\/([0-9a-f]{64})\.([a-z0-9]{2,4})$/;
/** U12: how much of a picture is read to measure it. */
export const MEDIR_BYTES = 1024 * 1024;

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export class Activos {
  /** sha256 -> file of the library */
  readonly indice = new Map<string, { ruta: string; ext: string; bytes: number }>();
  readonly biblioteca: string | null;
  readonly subidas: string | null;
  constructor(biblioteca: string | null, subidas: string | null, log: (l: string) => void = () => {}) {
    this.biblioteca = biblioteca; this.subidas = subidas;
    if (biblioteca && existsSync(biblioteca)) this.indexar(biblioteca);
    if (biblioteca) log(`[activos] biblioteca: ${this.indice.size} ficheros en ${biblioteca}${subidas ? ` · subidas en ${subidas}` : ""}`);
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

  /** Where the file behind a hash lives, or null. */
  buscar(hash: string, ext: string): string | null {
    const b = this.indice.get(hash);
    if (b && b.ext === ext) return b.ruta;
    if (this.subidas) { const r = join(this.subidas, `${hash}.${ext}`); if (existsSync(r)) return r; }
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
  servir(path: string, res: ServerResponse, head = false, range?: string): boolean {
    const m = RUTA.exec(path);
    if (!m || !SERVIR[m[2]]) return false;
    const ruta = this.buscar(m[1], m[2]);
    if (!ruta) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(head ? undefined : JSON.stringify({ error: `no hay ningún fichero ${m[1]}.${m[2]}` }));
      return true;
    }
    const total = statSync(ruta).size, comun = { "content-type": SERVIR[m[2]], "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*", "accept-ranges": "bytes" };
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
    res.writeHead(200, { ...comun, "content-length": String(total) });
    if (head) res.end(); else createReadStream(ruta).pipe(res);
    return true;
  }
}
