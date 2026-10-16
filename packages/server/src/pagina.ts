// pagina: the engine serves its own page (the built www/: index.html + assets/), so a world is ONE program on ONE
// port — what a container needs (C1). A bare install keeps Caddy serving www/ (it sets no WWW_DIR).
//   GET|HEAD /, /index.html, /assets/…   files under WWW_DIR only: no «..», no dotfiles, no link leaving the folder
//   index.html and other pages: Cache-Control no-cache (always the newest engine) · /assets/* (vite's hashed
//   names): a year, immutable · ETag + Last-Modified → 304. Anything that is not a file there is not answered here
//   (the features' routes and the 404 come after).
import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, posix, sep } from "node:path";

export const TIPOS_PAGINA: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm",
};

export class Pagina {
  readonly dir: string;
  private readonly raiz: string;

  constructor(dir: string) { this.dir = dir; this.raiz = realpathSync(dir); }

  /** The file under the page's folder that `path` names, or null (outside it, hidden, not a file). */
  fichero(path: string): string | null {
    let p: string;
    try { p = decodeURIComponent(path); } catch { return null; }
    if (!p.startsWith("/") || p.includes("\0") || p.includes("\\")) return null;
    if (p.endsWith("/")) p += "index.html";
    const partes = p.split("/").slice(1);
    if (partes.some((x) => x === "" || x.startsWith("."))) return null; // «..», «.», dotfiles, «//»
    const rel = posix.normalize(partes.join("/"));
    let real: string;
    try { real = realpathSync(join(this.raiz, rel)); } catch { return null; }
    if (!real.startsWith(this.raiz + sep)) return null;      // a link that leaves the folder
    try { return statSync(real).isFile() ? real : null; } catch { return null; }
  }

  /** Answers GET/HEAD for a file of the page; false = not ours (someone else answers). */
  servir(method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean {
    if (method !== "GET" && method !== "HEAD") return false;
    const f = this.fichero(path);
    if (!f) return false;
    const st = statSync(f);
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const cabeceras: Record<string, string> = {
      "content-type": TIPOS_PAGINA[extname(f).toLowerCase()] ?? "application/octet-stream",
      "cache-control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      etag, "last-modified": st.mtime.toUTCString(), "x-content-type-options": "nosniff",
    };
    const inm = req.headers["if-none-match"], ims = req.headers["if-modified-since"];
    if ((inm && inm.split(",").some((t) => t.trim() === etag)) || (!inm && ims && Date.parse(ims) >= Math.floor(st.mtimeMs / 1000) * 1000)) {
      res.writeHead(304, cabeceras); res.end(); return true;
    }
    res.writeHead(200, { ...cabeceras, "content-length": String(st.size) });
    if (method === "HEAD") { res.end(); return true; }
    createReadStream(f).on("error", () => res.destroy()).pipe(res);
    return true;
  }
}
