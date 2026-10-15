// activos (H1): the files things in the world are made of, served by their content: GET /a/<sha256>.<ext>.
// Two places, looked up in this order:
//   - the house library, `activos/` at the repo root (CC0 or own work, each with its licence next to it): any
//     name, indexed by sha256 when the server starts, so people and agents keep readable names;
//   - uploads (H9), one folder of files already named `<sha256>.<ext>` (ACTIVOS_DIR).
// A file never changes under its name, so it is cached for a year; any page may fetch it (models load cross-origin
// from the plaza's dev server).
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";

/** The house library. In the installer it sits next to the server code (app/activos). */
export const BIBLIOTECA = fileURLToPath(new URL("../../../activos", import.meta.url));

export const TIPOS: Record<string, string> = {
  glb: "model/gltf-binary", vrm: "model/gltf-binary", vrma: "model/gltf-binary",
  png: "image/png", jpg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2", hdr: "image/vnd.radiance",
  mp3: "audio/mpeg", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
};
const RUTA = /^\/a\/([0-9a-f]{64})\.([a-z0-9]{2,4})$/;

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
      if (!TIPOS[ext]) continue; // licences, READMEs
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

  /** Answer GET /a/<sha256>.<ext>. Returns false when the path is not an asset path at all. */
  servir(path: string, res: ServerResponse): boolean {
    const m = RUTA.exec(path);
    if (!m || !TIPOS[m[2]]) return false;
    const ruta = this.buscar(m[1], m[2]);
    if (!ruta) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: `no hay ningún fichero ${m[1]}.${m[2]}` }));
      return true;
    }
    res.writeHead(200, {
      "content-type": TIPOS[m[2]], "content-length": String(statSync(ruta).size),
      "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*",
    });
    createReadStream(ruta).pipe(res);
    return true;
  }
}
