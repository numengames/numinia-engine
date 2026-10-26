// pagina: the engine serves its own page (the built www/: index.html + assets/), so a world is ONE program on ONE
// port — what a container needs (C1). A bare install keeps Caddy serving www/ (it sets no WWW_DIR).
//   GET|HEAD /, /index.html, /assets/…   files under WWW_DIR only: no «..», no dotfiles, no link leaving the folder
//   index.html and other pages: Cache-Control no-cache (always the newest engine) · /assets/* (vite's hashed
//   names): a year, immutable · ETag + Last-Modified → 304. Anything that is not a file there is not answered here
//   (the features' routes and the 404 come after).
//   With the world's name (aventura/ficha.json, ADR-074) every page's <title> says it; without one, the file as it is.
//   MIS-265: with a cover (the ficha's `portada`, e.g. a photo taken inside the world) every page also carries og:title,
//   og:image and twitter:card, the image as an absolute URL on the address the visitor asked for (Host / X-Forwarded-*),
//   so a link preview — and numinia.com's worlds room, which reads og:image — shows the world itself.
//   N22: text and wasm go compressed to a browser that takes it (brotli, else gzip; Vary: Accept-Encoding) — the page's
//   1.6 MB of JS is ~0.5 MB on the wire, what a phone on 4G waits for before its first frame. Made once per file
//   (at start, in the background; the first request before that gets gzip made on the spot) and kept in memory.
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, posix, sep } from "node:path";
import { brotliCompress, constants as zc, gzipSync } from "node:zlib";

export const TIPOS_PAGINA: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm",
};

/** N22: what shrinks on the wire (pictures, sound, video and fonts already come compressed). */
export const COMPRIMIR = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".webmanifest", ".txt", ".svg", ".wasm", ".glb", ".md"]);
/** N22: smaller than this, a file goes as it is (the headers would cost more than they save). */
const MIN_COMPRIMIR = 1024;
type Comprimido = { etag: string; gz: Buffer; br?: Buffer };

export class Pagina {
  readonly dir: string;
  /** The world's name in every page's <title>; the owner may change it while the server runs (H7). */
  titulo: string | null;
  /** MIS-265: the world's cover as this server serves it (`/a/<sha256>.<ext>`), read on every page; null = none. */
  portada: () => string | null = () => null;
  private readonly raiz: string;
  private readonly comprimidos = new Map<string, Comprimido>(); // file -> its gzip/brotli, for one etag

  constructor(dir: string, o: { titulo?: string | null; precomprimir?: boolean } = {}) {
    this.dir = dir; this.raiz = realpathSync(dir); this.titulo = o.titulo || null;
    if (o.precomprimir !== false) setImmediate(() => this.precomprimir());
  }

  /** N22: every compressible file of the page, compressed in the background (zlib's thread pool, not the loop). */
  private precomprimir(): void {
    const ir = (d: string, n = 0): void => {
      if (n > 4) return;
      let es: string[]; try { es = readdirSync(d); } catch { return; }
      for (const e of es) {
        if (e.startsWith(".")) continue;
        const f = join(d, e);
        let st; try { st = statSync(f); } catch { continue; }
        if (st.isDirectory()) ir(f, n + 1);
        else if (COMPRIMIR.has(extname(f).toLowerCase()) && st.size >= MIN_COMPRIMIR && extname(f).toLowerCase() !== ".html") this.comprimido(f, this.etagDe(f, st, ""), readFileSync(f));
      }
    };
    ir(this.raiz);
  }

  private etagDe(f: string, st: { size: number; mtimeMs: number }, marca: string): string { return `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${marca}"`; }

  /** N22: the compressed bodies of `f` (gzip now if none yet; brotli joins when ready). */
  private comprimido(f: string, etag: string, cuerpo: Buffer): Comprimido {
    const c = this.comprimidos.get(f);
    if (c && c.etag === etag) return c;
    const nuevo: Comprimido = { etag, gz: gzipSync(cuerpo, { level: 9 }) };
    this.comprimidos.set(f, nuevo);
    brotliCompress(cuerpo, { params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: cuerpo.length } }, (e, b) => { if (!e && this.comprimidos.get(f) === nuevo) nuevo.br = b; });
    return nuevo;
  }

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
    // the world's name in <title> and its cover in og: tags (an HTML page only): the bytes change, so does the ETag
    const esHtml = extname(f).toLowerCase() === ".html", portada = esHtml ? this.portada() : null;
    const imagen = portada ? urlAbsoluta(req, portada) : null;
    const titulo = this.titulo;
    let html: string | null = null;
    if (esHtml && (titulo || imagen)) {
      const crudo = readFileSync(f, "utf8"), conNombre = titulo ? conTitulo(crudo, titulo) : crudo;
      html = imagen ? conCara(conNombre, { titulo, imagen }) : conNombre;
    }
    const marca = html ? `-${createHash("sha256").update(`${this.titulo ?? ""}\n${imagen ?? ""}`).digest("hex").slice(0, 8)}` : "";
    const etag = this.etagDe(f, st, marca), ext = extname(f).toLowerCase();
    const comprimible = COMPRIMIR.has(ext) && st.size >= MIN_COMPRIMIR;
    const cabeceras: Record<string, string> = {
      "content-type": TIPOS_PAGINA[ext] ?? "application/octet-stream",
      "cache-control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      etag, "last-modified": st.mtime.toUTCString(), "x-content-type-options": "nosniff",
      ...(comprimible ? { vary: "accept-encoding" } : {}),
    };
    const inm = req.headers["if-none-match"], ims = req.headers["if-modified-since"];
    if ((inm && inm.split(",").some((t) => t.trim() === etag)) || (!inm && ims && Date.parse(ims) >= Math.floor(st.mtimeMs / 1000) * 1000)) {
      res.writeHead(304, cabeceras); res.end(); return true;
    }
    const cuerpo = html === null ? null : Buffer.from(html);
    const acepta = String(req.headers["accept-encoding"] ?? "");
    if (comprimible && /\b(br|gzip)\b/.test(acepta)) { // N22
      const c = this.comprimido(f, etag, cuerpo ?? readFileSync(f));
      const br = c.br && /\bbr\b/.test(acepta), z = br ? c.br! : /\bgzip\b/.test(acepta) ? c.gz : null;
      if (z) {
        res.writeHead(200, { ...cabeceras, "content-encoding": br ? "br" : "gzip", "content-length": String(z.length) });
        res.end(method === "HEAD" ? undefined : z);
        return true;
      }
    }
    res.writeHead(200, { ...cabeceras, "content-length": String(cuerpo?.length ?? st.size) });
    if (method === "HEAD") { res.end(); return true; }
    if (cuerpo) { res.end(cuerpo); return true; }
    createReadStream(f).on("error", () => res.destroy()).pipe(res);
    return true;
  }
}

const escapar = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The page with `titulo` as its <title> (the first one; a page without one is left as it is). */
export function conTitulo(html: string, titulo: string): string {
  return html.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapar(titulo)}</title>`);
}

const primero = (v: string | string[] | undefined): string => String((Array.isArray(v) ? v[0] : v) ?? "").split(",")[0].trim().toLowerCase();

/** MIS-265: `ruta` (a path of this server) as an absolute URL on the address the visitor asked for; null when the request
 * names no believable host (an odd Host header never reaches the page). Behind Caddy, X-Forwarded-Proto says https. */
export function urlAbsoluta(req: { headers: IncomingMessage["headers"]; socket?: unknown }, ruta: string): string | null {
  const host = primero(req.headers["x-forwarded-host"]) || primero(req.headers.host);
  if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(host) || !ruta.startsWith("/")) return null;
  const pedido = primero(req.headers["x-forwarded-proto"]);
  const cifrado = typeof req.socket === "object" && req.socket !== null && (req.socket as { encrypted?: boolean }).encrypted === true;
  const proto = pedido === "https" || pedido === "http" ? pedido : cifrado ? "https" : "http";
  return `${proto}://${host}${ruta}`;
}

/** MIS-265: the page with og:title (when named), og:image and twitter:card before </head>; any of those it already had is
 * replaced (one of each). A page without </head> is left as it is. */
export function conCara(html: string, c: { titulo: string | null; imagen: string }): string {
  if (!/<\/head>/i.test(html)) return html;
  const limpio = html.replace(/[ \t]*<meta\s+(?:property|name)="(?:og:title|og:image|twitter:card)"[^>]*>\r?\n?/gi, "");
  const tags = [
    ...(c.titulo ? [`<meta property="og:title" content="${escapar(c.titulo)}" />`] : []),
    `<meta property="og:image" content="${escapar(c.imagen)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].map((t) => `  ${t}\n`).join("");
  return limpio.replace(/<\/head>/i, () => `${tags}</head>`);
}
