// mundo-zip: the whole world in one zip — download it, upload it (Pablo: «la bajada del zip o subir un zip»), and run
// it yourself (16-10: «que esté todo contenido en el mismo mundo: me lo descargo y arranco el motor en local»).
// numinia-engine/mundo@2 (C5) — at the zip's root:
//   mundo.json   esquema, motor {build, commit, imagen}, creado (UTC), ficheros [{ruta, bytes, sha256}]
//   datos/**     what the features keep (objects placed, quests, roles… S4) + datos/activos/<sha256>.<ext> (H9)
//   aventura/**  the world's own adventure (misiones/ pnj/ cosas/ habitantes/ …) · entorno/** entorno.json, elementos.json
//   compose.yml, arrancar.sh, LEEME.txt   to run it yourself (mundo-extras.ts; not in `ficheros`, ignored on upload)
// Never inside: sesiones/ (who came in), datos/subidas.jsonl (who uploaded what), claves.env, any key, the engine.
// A copy of a RUNNING world is consistent: snapshots are written .tmp + rename (datos.ts) and re-read if they change
// while being copied; journals (.jsonl) are taken up to their last complete line.
// numinia-engine/mundo@1 zips (datos/ only) are still read: the world gets the example adventure, as a new one (C2).
//
//   GET  /mundo        a small page: code field, «Descargar el mundo», «Subir un zip» (with progress)
//   GET  /mundo/zip    the zip (Authorization: Bearer <code>)         — curl, scripts
//   POST /mundo/zip    the zip as a download (form field codigo=<code>) — the page's button
//   PUT  /mundo/zip    replace the world with the zip in the body (Bearer) — the page's upload, curl -T
//   GET  /mundo/estado what is in the world now (Bearer): files, MB, version, earlier copies kept
// The same rules run without a server in the image's own tools (mundo-cli.ts: copia, comprobar, importar; C6).
//
// Upload: the bytes go to a file next to the world (never memory), the zip is checked by rule (zip.ts) and against
// its own manifest, unpacked into a staging folder; only then the server stops the world, flushes, keeps the current
// datos/ aventura/ entorno/ as <name>.antes-<UTC> (the last COPIAS_ANTES), moves the new ones in and exits: systemd or
// the container's restart policy starts it again with the new world (a few seconds; everyone reconnects by themselves).
// A server without a world folder (MOTOR_MUNDO) swaps datos/ only. Who may: whoever has the administration code.
import { createHash, timingSafeEqual } from "node:crypto";
import { createWriteStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, rename, rm, statfs, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, join, resolve } from "node:path";
import type { Writable } from "node:stream";
import { comprobarFichero, motivo, SUBIDAS_TOTAL_MB, TIPOS } from "../../net/src/ficheros.ts";
import { AVENTURA_CARPETA, AVENTURA_FICHERO_MAX, AVENTURA_NOMBRE } from "./aventura.ts";
import { EXTRAS, extrasDelZip } from "./mundo-extras.ts";
import { ADMIN_MIN } from "./secret.ts";
import type { Motor } from "./version.ts";
import { ErrorZip, escribirZip, extraer, leerZip } from "./zip.ts";
import type { EntradaEscribir, TopesZip } from "./zip.ts";

const MB = 1024 * 1024;
export const ESQUEMA = "numinia-engine/mundo@2";
export const ESQUEMA_1 = "numinia-engine/mundo@1";
/** Caps of an uploaded world: every upload (1 GB) plus room for the features' files. */
export const TOPES: TopesZip & { zip: number } = { zip: (SUBIDAS_TOTAL_MB + 128) * MB, entradas: 20000, porFichero: 64 * MB, total: (SUBIDAS_TOTAL_MB + 256) * MB, ratio: 200 };
export const COPIAS_ANTES = 2;      // earlier worlds kept on the server after an upload
export const RESERVA = 256 * MB;    // disk always left free
export const FALLOS_MAX = 10;       // wrong codes in FALLOS_VENTANA_MS before the route answers 429
export const FALLOS_VENTANA_MS = 10 * 60_000;
export const ENTORNO_FICHERO_MAX = MB;
/** The parts of a world folder a zip carries and an upload swaps. */
export const PARTES = ["datos", "aventura", "entorno"] as const;
export { ADMIN_MIN };

const DATOS_FICHERO = /^[a-z0-9][a-z0-9_-]{0,40}\.(json|jsonl)$/;
const ACTIVO = /^([0-9a-f]{64})\.([a-z0-9]{1,8})$/;
const ENTORNO_FICHERO = /^[a-z0-9][a-z0-9_-]{0,40}\.json$/;

export type Fichero = { ruta: string; bytes: number; sha256: string };
export type Manifiesto = { esquema: typeof ESQUEMA; motor: Motor; creado: string; ficheros: Fichero[] };
/** Where a world's parts are on disk (subidas/aventura/entorno: null = none). */
export type Origen = { datos: string; subidas: string | null; aventura: string | null; entorno: string | null };
type Inventariado = { ruta: string; disco: string; parte: "datos" | "activo" | "aventura" | "entorno" };

const regular = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };
const listar = (d: string | null) => { try { return d ? readdirSync(d).sort() : []; } catch { return []; } };
const leible = (p: string, max: number) => { try { const s = statSync(p); return s.isFile() && s.size <= max; } catch { return false; } };

/** What goes in the zip, from the world's folders. */
export function inventario(o: Origen): Inventariado[] {
  const out: Inventariado[] = [];
  for (const f of listar(o.datos)) if (DATOS_FICHERO.test(f) && regular(join(o.datos, f))) out.push({ ruta: `datos/${f}`, disco: join(o.datos, f), parte: "datos" });
  for (const f of listar(o.subidas)) {
    const m = ACTIVO.exec(f);
    if (m && TIPOS[m[2]] && regular(join(o.subidas!, f))) out.push({ ruta: `datos/activos/${f}`, disco: join(o.subidas!, f), parte: "activo" });
  }
  for (const f of listar(o.aventura)) { // what the engine reads: <aventura>/<file> and <aventura>/<folder>/<file>
    const p = join(o.aventura!, f);
    if (AVENTURA_NOMBRE.test(f) && leible(p, AVENTURA_FICHERO_MAX)) out.push({ ruta: `aventura/${f}`, disco: p, parte: "aventura" });
    else if (AVENTURA_CARPETA.test(f)) for (const g of listar(p)) if (AVENTURA_NOMBRE.test(g) && leible(join(p, g), AVENTURA_FICHERO_MAX)) out.push({ ruta: `aventura/${f}/${g}`, disco: join(p, g), parte: "aventura" });
  }
  for (const f of listar(o.entorno)) if (ENTORNO_FICHERO.test(f) && leible(join(o.entorno!, f), ENTORNO_FICHERO_MAX)) out.push({ ruta: `entorno/${f}`, disco: join(o.entorno!, f), parte: "entorno" });
  return out;
}

/** A journal (.jsonl) up to its last complete line (a line being appended now belongs to the next copy). */
export function hastaUltimaLinea(b: Buffer): Buffer {
  const fin = b.lastIndexOf(0x0a);
  return fin < 0 ? Buffer.alloc(0) : b.subarray(0, fin + 1);
}

/** One feature's snapshot and journal as they are at ONE moment (datos.ts writes the snapshot .tmp + rename, then
 * empties the journal): both are read, and read again while either changed in between (≤ 5 times). */
export function leerFuncion(json: string, jsonl: string): { json?: Buffer; jsonl?: Buffer } {
  const st = (p: string) => { try { const s = statSync(p); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return "-"; } };
  const leer = (p: string) => { try { return readFileSync(p); } catch { return undefined; } };
  for (let i = 0; ; i++) {
    const a = `${st(json)}|${st(jsonl)}`;
    const l = leer(jsonl), j = leer(json);
    if (a === `${st(json)}|${st(jsonl)}` || i >= 5) return { json: j, jsonl: l && hastaUltimaLinea(l) };
  }
}

/** Writes the world's zip (mundo@2) to `w`. Small files are read now and deflated; uploads are streamed. */
export async function exportarMundo(w: Writable, o: Origen, motor: Motor, cuando = new Date()): Promise<{ ficheros: number; bytes: number }> {
  const inv = inventario(o);
  const entradas: EntradaEscribir[] = [], ficheros: Fichero[] = [];
  const poner = (ruta: string, b: Buffer) => { ficheros.push({ ruta, bytes: b.length, sha256: createHash("sha256").update(b).digest("hex") }); entradas.push({ nombre: ruta, datos: b }); };
  // the features' files, one feature at a time (snapshot + journal of the same moment, even if one appears meanwhile)
  const funciones = [...new Set(inv.filter((f) => f.parte === "datos").map((f) => f.ruta.slice("datos/".length).replace(/\.jsonl?$/, "")))].sort();
  for (const base of funciones) {
    const par = leerFuncion(join(o.datos, `${base}.json`), join(o.datos, `${base}.jsonl`));
    if (par.json) poner(`datos/${base}.json`, par.json);
    if (par.jsonl) poner(`datos/${base}.jsonl`, par.jsonl);
  }
  for (const f of inv) {
    if (f.parte === "activo") {
      ficheros.push({ ruta: f.ruta, bytes: statSync(f.disco).size, sha256: basename(f.disco).slice(0, 64) }); // named by its sha256 (H9 checked it)
      entradas.push({ nombre: f.ruta, ruta: f.disco });
    } else if (f.parte !== "datos") poner(f.ruta, readFileSync(f.disco));
  }
  const m: Manifiesto = { esquema: ESQUEMA, motor, creado: cuando.toISOString(), ficheros };
  const extras: EntradaEscribir[] = extrasDelZip(motor).map((x) => ({ nombre: x.nombre, datos: Buffer.from(x.texto), modo: x.modo }));
  const bytes = await escribirZip(w, [{ nombre: "mundo.json", datos: Buffer.from(JSON.stringify(m, null, 1) + "\n") }, ...entradas, ...extras], cuando);
  return { ficheros: ficheros.length, bytes };
}

export type Importado = { ficheros: number; bytes: number; esquema: string; motor: string; creado: string; partes: string[] };

/** Checks the zip at `zip` and unpacks it into `destino` (a NEW folder, world layout: datos/ (+activos/), aventura/,
 * entorno/). Throws ErrorZip (rule + Spanish message); on any failure `destino` is removed. */
export async function importarMundo(zip: string, destino: string, topes: TopesZip = TOPES): Promise<Importado> {
  try {
    const entradas = (await leerZip(zip, topes)).filter((e) => !e.nombre.startsWith("__MACOSX/") && !e.nombre.endsWith("/.DS_Store") && e.nombre !== ".DS_Store");
    const manifiestos = entradas.filter((e) => e.nombre === "mundo.json" || /^[^/]+\/mundo\.json$/.test(e.nombre));
    if (manifiestos.length !== 1) throw new ErrorZip("ruta", manifiestos.length ? "trae más de un mundo.json" : "no es la copia de un mundo: falta mundo.json (descárgalo con «Descargar el mundo» de otro servidor)");
    const raiz = manifiestos[0].nombre.slice(0, -"mundo.json".length);
    await mkdir(join(destino, "datos", "activos"), { recursive: true });
    const tmpManifiesto = join(destino, ".mundo.json");
    if (manifiestos[0].tamano > 8 * MB) throw new ErrorZip("grande", "mundo.json es demasiado grande");
    await extraer(zip, manifiestos[0], tmpManifiesto);
    let m: { schema?: unknown; esquema?: unknown; motor?: unknown; hecho?: unknown; creado?: unknown; ficheros?: unknown };
    try { m = JSON.parse(readFileSync(tmpManifiesto, "utf8")); } catch { throw new ErrorZip("ruta", "mundo.json no se puede leer"); }
    await unlink(tmpManifiesto);
    const esquema = m?.esquema === ESQUEMA ? ESQUEMA : m?.schema === ESQUEMA_1 ? ESQUEMA_1 : null;
    if (!esquema || !Array.isArray(m.ficheros)) throw new ErrorZip("ruta", `mundo.json no es ${ESQUEMA} (ni ${ESQUEMA_1})`);
    const lista = m.ficheros as Fichero[];
    if (!lista.every((f) => f && typeof f.ruta === "string" && Number.isInteger(f.bytes) && typeof f.sha256 === "string")) throw new ErrorZip("ruta", "mundo.json tiene ficheros sin ruta, bytes o sha256");
    const esperados = new Map(lista.map((f) => [f.ruta, f]));
    if (esperados.size !== lista.length) throw new ErrorZip("repetido", "mundo.json lista un fichero dos veces");
    let bytes = 0, n = 0;
    const partes = new Set<string>();
    for (const e of entradas) {
      if (e === manifiestos[0] || e.nombre.endsWith("/")) continue;
      if (!e.nombre.startsWith(raiz)) throw new ErrorZip("ruta", `«${e.nombre}» está fuera de la copia del mundo`);
      const rel = e.nombre.slice(raiz.length);
      if (esquema === ESQUEMA && (EXTRAS as readonly string[]).includes(rel)) continue; // run-it-yourself extras: not the world
      const f = esperados.get(rel);
      if (!f) throw new ErrorZip("ruta", `«${rel}» no está en mundo.json`);
      let disco: string, modo = 0o640, activo: RegExpExecArray | null = null;
      const trozos = rel.split("/");
      if (rel.startsWith("datos/activos/")) {
        activo = ACTIVO.exec(rel.slice("datos/activos/".length));
        if (!activo || !TIPOS[activo[2]]) throw new ErrorZip("ruta", `«${rel}» no es un fichero subido (<sha256>.<tipo>)`);
        disco = join(destino, "datos", "activos", activo[0]);
      } else if (trozos[0] === "datos") {
        if (trozos.length !== 2 || !DATOS_FICHERO.test(trozos[1])) throw new ErrorZip("ruta", `«${rel}» no es un fichero del mundo`);
        disco = join(destino, "datos", trozos[1]);
      } else if (trozos[0] === "aventura" && esquema === ESQUEMA) {
        const ok = (trozos.length === 2 && AVENTURA_NOMBRE.test(trozos[1])) || (trozos.length === 3 && AVENTURA_CARPETA.test(trozos[1]) && AVENTURA_NOMBRE.test(trozos[2]));
        if (!ok) throw new ErrorZip("ruta", `«${rel}» no es un fichero de aventura (aventura/<carpeta>/<nombre>.json|md|txt)`);
        if (e.tamano > AVENTURA_FICHERO_MAX) throw new ErrorZip("grande", `«${rel}» pasa de ${AVENTURA_FICHERO_MAX / 1024} kB`);
        await mkdir(join(destino, ...trozos.slice(0, -1)), { recursive: true });
        disco = join(destino, ...trozos); modo = 0o644; // the inhabitants' service (another user) reads it too
      } else if (trozos[0] === "entorno" && esquema === ESQUEMA) {
        if (trozos.length !== 2 || !ENTORNO_FICHERO.test(trozos[1])) throw new ErrorZip("ruta", `«${rel}» no es un fichero de entorno (entorno/<nombre>.json)`);
        if (e.tamano > ENTORNO_FICHERO_MAX) throw new ErrorZip("grande", `«${rel}» pasa de 1 MB`);
        await mkdir(join(destino, "entorno"), { recursive: true });
        disco = join(destino, "entorno", trozos[1]); modo = 0o644;
      } else throw new ErrorZip("ruta", `«${rel}» no es un fichero del mundo`);
      const h = createHash("sha256");
      await extraer(zip, e, disco, (t) => h.update(t), modo);
      const sha = h.digest("hex");
      if (e.tamano !== f.bytes || sha !== f.sha256) throw new ErrorZip("crc", `«${rel}» no es el que dice mundo.json (bytes o sha256)`);
      if (activo) {
        if (sha !== activo[1]) throw new ErrorZip("crc", `«${rel}»: su sha256 no es el de su nombre`);
        const ok = comprobarFichero(activo[2], readFileSync(disco));
        if (!ok.ok) throw new ErrorZip("ruta", `«${rel}» no vale: ${motivo(ok.issues)}`);
      } else if (trozos[0] === "datos" && rel.endsWith(".json")) { // what the engine wrote itself; a person's adventure or
        // environment may hold a broken file: the engine skips it with a line in its log, so it travels as it is
        try { JSON.parse(readFileSync(disco, "utf8")); } catch { throw new ErrorZip("ruta", `«${rel}» no es JSON válido`); }
      }
      partes.add(trozos[0]); esperados.delete(rel); bytes += e.tamano; n++;
    }
    if (esperados.size) throw new ErrorZip("cortado", `faltan ${esperados.size} fichero(s) de mundo.json, p. ej. «${[...esperados.keys()][0]}»`);
    const motor = typeof m.motor === "string" ? m.motor : String((m.motor as { build?: unknown } | undefined)?.build ?? "");
    return { ficheros: n, bytes, esquema, motor, creado: String(m.creado ?? m.hecho ?? ""), partes: [...partes].sort() };
  } catch (e) {
    await rm(destino, { recursive: true, force: true });
    throw e;
  }
}

const sello = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** Moves `nuevo` into `datos`, keeping the current one as datos.antes-<UTC> (only the last COPIAS_ANTES). */
export async function cambiarDatos(datos: string, nuevo: string, cuando = new Date()): Promise<string | null> {
  const r = await cambiarPartes(dirname(resolve(datos)), [{ parte: basename(resolve(datos)), nuevo }], cuando);
  return r[0] ?? null;
}

/** Swaps several folders of one parent at once (a world: datos/, aventura/, entorno/). Each current one is kept as
 * <name>.antes-<UTC> (only the last COPIAS_ANTES of each); a part with no new folder is left out (an @1 zip has no
 * aventura/: the next start seeds one). Any failure puts back what was moved. Returns the folders kept. */
export async function cambiarPartes(padre: string, cambios: { parte: string; nuevo: string | null }[], cuando = new Date()): Promise<string[]> {
  const hechos: { actual: string; antes: string | null; puesto: boolean }[] = [], guardadas: string[] = [];
  try {
    for (const c of cambios) {
      const h = { actual: join(padre, c.parte), antes: null as string | null, puesto: false };
      hechos.push(h);
      if (existsSync(h.actual)) { h.antes = join(padre, `${c.parte}.antes-${sello(cuando)}`); await rename(h.actual, h.antes); guardadas.push(h.antes); }
      if (c.nuevo && existsSync(c.nuevo)) { await rename(c.nuevo, h.actual); h.puesto = true; }
    }
  } catch (e) {
    for (const h of hechos.reverse()) {
      if (h.puesto) await rename(h.actual, `${h.actual}.fallida-${sello(cuando)}`).catch(() => {});
      if (h.antes) await rename(h.antes, h.actual).catch(() => {});
    }
    throw e;
  }
  for (const c of cambios) {
    const viejas = (await readdir(padre)).filter((f) => f.startsWith(`${c.parte}.antes-`)).sort();
    for (const v of viejas.slice(0, Math.max(0, viejas.length - COPIAS_ANTES))) await rm(join(padre, v), { recursive: true, force: true });
  }
  return guardadas;
}

export type OpcionesCopia = {
  datos: string | null;          // DATOS_DIR (null: nothing to copy, the route answers 404)
  subidas: string | null;        // ACTIVOS_DIR (an upload needs it to be datos/activos)
  aventura?: string | null;      // the adventure the world runs (copied; swapped only inside a world folder)
  entorno?: string | null;       // the world's entorno/ (entorno.json, elementos.json)
  mundo?: string | null;         // MOTOR_MUNDO: the world folder; an upload swaps datos/ aventura/ entorno/ in it
  admin?: string;                // the administration code; under ADMIN_MIN characters = no administration (403)
  dondeCodigo?: string;          // where the code can be read (shown on the page; never the code)
  version: string;
  motor?: Motor;                 // what the zip says made it (and pins in compose.yml); default {build: version}
  vaciar(): Promise<void>;       // write what the features have pending (before a download)
  apagar(): Promise<void>;       // stop the world: no tick, nobody connected, everything flushed (before the swap)
  reiniciar(): void;             // after the swap: the server exits and systemd (or the container) starts it again
  topes?: TopesZip & { zip: number };
  log?: (l: string) => void;
  ahora?: () => number;
};

export class CopiaMundo {
  readonly stats = { descargas: 0, subidas: 0, rechazadas: 0, codigosMal: 0 };
  private readonly o: OpcionesCopia;
  private readonly log: (l: string) => void;
  private readonly clave: Buffer | null;
  private fallos: number[] = [];
  private ocupada = false;

  constructor(o: OpcionesCopia) {
    this.o = o; this.log = o.log ?? (() => {});
    this.clave = o.admin && o.admin.length >= ADMIN_MIN ? createHash("sha256").update(o.admin).digest() : null;
  }

  get activa(): boolean { return !!this.clave && !!this.o.datos; }
  private get motor(): Motor { return this.o.motor ?? { build: this.o.version, commit: null, imagen: null }; }
  private get origen(): Origen { return { datos: this.o.datos!, subidas: this.o.subidas, aventura: this.o.aventura ?? null, entorno: this.o.entorno ?? null }; }

  /** Answers every /mundo route; returns false for any other path. */
  atender(method: string, path: string, req: IncomingMessage, res: ServerResponse): boolean {
    if (path !== "/mundo" && path !== "/mundo/" && !path.startsWith("/mundo/")) return false;
    const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) => {
      if (status >= 400) this.stats.rechazadas++;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
      res.end(JSON.stringify(body));
    };
    const cortar = (status: number, error: string) => {
      this.stats.rechazadas++;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", connection: "close" });
      res.end(JSON.stringify({ error }), () => req.destroy());
    };
    if ((path === "/mundo" || path === "/mundo/") && method === "GET") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'" });
      res.end(PAGINA(this.o.version, this.activa, this.o.dondeCodigo ?? "en un servidor instalado con instalar-motor.sh: sudo cat /opt/numinia-engine/admin.env"));
      return true;
    }
    if (path !== "/mundo/zip" && path !== "/mundo/estado") { json(404, { error: `no existe ${path}`, hay: ["/mundo", "/mundo/zip", "/mundo/estado"] }); return true; }
    if (!this.o.datos) { json(404, { error: "Este servidor no guarda el mundo en disco (sin DATOS_DIR ni MOTOR_MUNDO)." }); return true; }
    if (!this.clave) { method === "PUT" ? cortar(403, SIN_CODIGO) : json(403, { error: SIN_CODIGO }); return true; }
    const ahora = (this.o.ahora ?? Date.now)();
    this.fallos = this.fallos.filter((t) => ahora - t < FALLOS_VENTANA_MS);
    if (this.fallos.length >= FALLOS_MAX) { method === "PUT" ? cortar(429, DEMASIADOS) : json(429, { error: DEMASIADOS }, { "retry-after": "600" }); return true; }
    const bueno = (codigo: string) => {
      const ok = timingSafeEqual(createHash("sha256").update(codigo).digest(), this.clave!);
      if (!ok) { this.fallos.push(ahora); this.stats.codigosMal++; this.log("[mundo] código de administración equivocado"); }
      return ok;
    };
    const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";

    if (method === "POST" && path === "/mundo/zip") { // the page's button: a form, so the browser downloads it itself
      let body = "", size = 0;
      req.setEncoding("utf8");
      req.on("data", (c: string) => { size += c.length; if (size <= 4096) body += c; else req.destroy(); });
      req.on("end", () => {
        const codigo = new URLSearchParams(body).get("codigo") ?? "";
        if (!bueno(codigo)) { // the page's form: answer a page, not JSON
          this.stats.rechazadas++;
          res.writeHead(401, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return void res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Código equivocado</title><p style="font:16px system-ui;margin:2rem">${MAL_CODIGO} <a href="/mundo">Volver</a></p>`);
        }
        void this.descargar(res);
      });
      return true;
    }
    if (!bueno(bearer)) { method === "PUT" ? cortar(401, MAL_CODIGO) : json(401, { error: MAL_CODIGO }, { "www-authenticate": "Bearer" }); return true; }
    if (method === "GET" && path === "/mundo/zip") { void this.descargar(res); return true; }
    if (method === "GET" && path === "/mundo/estado") { json(200, this.estado()); return true; }
    if (method === "PUT" && path === "/mundo/zip") { void this.subir(req, res, cortar, json); return true; }
    json(405, { error: "en /mundo/zip: GET o POST para descargar, PUT para subir" }, { allow: "GET, POST, PUT" });
    return true;
  }

  estado(): Record<string, unknown> {
    const inv = inventario(this.origen);
    const bytes = inv.reduce((s, f) => s + statSync(f.disco).size, 0);
    const padre = this.o.mundo ? resolve(this.o.mundo) : dirname(resolve(this.o.datos!));
    const antes = existsSync(padre) ? readdirSync(padre).filter((f) => /^(datos|aventura|entorno)\.antes-/.test(f)).sort() : [];
    return { schema: "numinia-engine/mundo-estado@2", motor: this.o.version, carpetaDeMundo: !!this.o.mundo, ficheros: inv.length, subidos: inv.filter((f) => f.parte === "activo").length, aventura: inv.filter((f) => f.parte === "aventura").length, entorno: inv.filter((f) => f.parte === "entorno").length, bytes, copiasAnteriores: antes, subir: this.puedeSubir() ?? "sí" };
  }

  /** Why this server cannot take an uploaded world (null = it can). */
  private puedeSubir(): string | null {
    const datos = resolve(this.o.datos!);
    if (this.o.subidas && resolve(this.o.subidas) !== join(datos, "activos")) return "este servidor guarda las subidas fuera de datos/ (ACTIVOS_DIR): no se puede cambiar el mundo de una vez";
    if (this.o.mundo && datos !== join(resolve(this.o.mundo), "datos")) return "los datos de este servidor (DATOS_DIR) no están en su carpeta de mundo (MOTOR_MUNDO)";
    return null;
  }

  private async descargar(res: ServerResponse): Promise<void> {
    await this.o.vaciar();
    const nombre = `mundo-${sello()}.zip`;
    res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "no-store" });
    try {
      const r = await exportarMundo(res, this.origen, this.motor);
      res.end();
      this.stats.descargas++;
      this.log(`[mundo] descargado: ${r.ficheros} ficheros, ${(r.bytes / MB).toFixed(1)} MB`);
    } catch (e) {
      this.log(`[mundo] la descarga se cortó: ${String((e as Error)?.message ?? e)}`);
      res.destroy();
    }
  }

  private async subir(req: IncomingMessage, res: ServerResponse, cortar: (s: number, e: string) => void, json: (s: number, b: Record<string, unknown>) => void): Promise<void> {
    const topes = this.o.topes ?? TOPES;
    const no = this.puedeSubir();
    if (no) return cortar(409, `No se puede: ${no}.`);
    const largo = Number(req.headers["content-length"] ?? NaN);
    if (!Number.isFinite(largo)) return cortar(411, "Falta Content-Length: sube el zip entero de una vez.");
    if (largo > topes.zip) return cortar(413, `El zip pasa de ${Math.round(topes.zip / MB)} MB.`);
    if (this.ocupada) return cortar(409, "Ya se está subiendo otro mundo: espera a que termine.");
    const datos = resolve(this.o.datos!), padre = this.o.mundo ? resolve(this.o.mundo) : dirname(datos);
    try {
      await mkdir(padre, { recursive: true });
      const libre = await statfs(padre).then((s) => s.bavail * s.bsize);
      if (libre < largo * 2 + RESERVA) return cortar(507, `No hay sitio en el disco del servidor: hacen falta ${Math.ceil((largo * 2 + RESERVA) / MB)} MB libres y hay ${Math.floor(libre / MB)}.`);
    } catch (e) { return cortar(500, `El servidor no puede usar ${padre}: ${(e as Error).message}`); }
    this.ocupada = true;
    const marca = `${process.pid}-${Date.now().toString(36)}`;
    const zip = join(padre, `.mundo-subida-${marca}.zip`), nuevo = join(padre, `.mundo-nuevo-${marca}`);
    const limpiar = () => Promise.all([rm(zip, { force: true }), rm(nuevo, { recursive: true, force: true })]);
    let cambiando = false;
    try {
      const recibido = await new Promise<number>((ok, ko) => {
        const out = createWriteStream(zip, { flags: "wx", mode: 0o640 });
        let n = 0;
        req.on("data", (c: Buffer) => { n += c.length; if (n > largo) { req.destroy(); ko(new ErrorZip("grande", "llegaron más bytes de los que dijo Content-Length")); } });
        req.on("aborted", () => ko(new ErrorZip("cortado", "la subida se cortó")));
        req.on("error", () => ko(new ErrorZip("cortado", "la subida se cortó")));
        out.on("error", ko);
        out.on("finish", () => ok(n));
        req.pipe(out);
      });
      if (recibido !== largo) throw new ErrorZip("cortado", `llegaron ${recibido} bytes de ${largo}: vuelve a subirlo`);
      const r = await importarMundo(zip, nuevo, topes);
      await rm(zip, { force: true });
      this.stats.subidas++;
      const soloDatos = !this.o.mundo && r.partes.some((p) => p !== "datos");
      this.log(`[mundo] subido y comprobado: ${r.ficheros} ficheros, ${(r.bytes / MB).toFixed(1)} MB (${r.esquema}, copia de ${r.motor || "?"}, ${r.creado || "?"}); cambio el mundo y reinicio${soloDatos ? " (sin carpeta de mundo: solo datos/; su aventura y su entorno no se usan)" : ""}`);
      cambiando = true;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", connection: "close" });
      res.end(JSON.stringify({ ok: true, ficheros: r.ficheros, bytes: r.bytes, esquema: r.esquema, copiaDe: r.motor, hecho: r.creado, mensaje: "Mundo comprobado. El servidor se reinicia con él en unos segundos." }), () => void this.cambiar(nuevo, datos, padre));
    } catch (e) {
      await limpiar();
      this.ocupada = false;
      if (e instanceof ErrorZip) { this.log(`[mundo] zip rechazado (${e.regla})`); return json(422, { error: `Ese zip no vale: ${e.message}.`, regla: e.regla }); }
      this.log(`[mundo] no pude recibir el zip: ${String((e as Error)?.message ?? e)}`);
      if (!res.headersSent) json(500, { error: "El servidor no pudo guardar el zip; avisa a quien lo administra." });
    } finally { if (!cambiando) this.ocupada = false; }
  }

  private async cambiar(nuevo: string, datos: string, padre: string): Promise<void> {
    try {
      await this.o.apagar();
      const guardadas = this.o.mundo
        ? await cambiarPartes(padre, PARTES.map((p) => ({ parte: p, nuevo: join(nuevo, p) })))
        : [await cambiarDatos(datos, join(nuevo, "datos"))].filter((x): x is string => !!x);
      this.log(`[mundo] mundo nuevo en ${this.o.mundo ? padre : datos}${guardadas.length ? `; el anterior queda en ${guardadas.map((g) => basename(g)).join(", ")}` : ""}`);
    } catch (e) {
      this.log(`[mundo] no pude cambiar el mundo (sigue el de antes): ${String((e as Error)?.message ?? e)}`);
    }
    await rm(nuevo, { recursive: true, force: true }).catch(() => {});
    this.o.reiniciar();
  }
}

const SIN_CODIGO = "Este servidor no tiene código de administración: no se puede bajar ni subir el mundo.";
const MAL_CODIGO = "Ese no es el código de administración.";
const DEMASIADOS = "Demasiados códigos equivocados: espera 10 minutos.";
const escapar = (s: string) => s.replace(/[<&"]/g, "");

const PAGINA = (version: string, activa: boolean, donde: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>El mundo · copia</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem;color:#1d1d1f;background:#fafafa}
h1{font-size:1.4rem;margin:0 0 .25rem}p.sub{margin:0 0 1.5rem;color:#666;font-size:.9rem}
section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:1rem;margin:0 0 1rem}
label{display:block;font-weight:600;margin:0 0 .25rem}input[type=password]{width:100%;box-sizing:border-box;padding:.5rem;font:inherit;border:1px solid #bbb;border-radius:6px}
button{font:inherit;padding:.5rem 1rem;border-radius:6px;border:1px solid #333;background:#333;color:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}
.barra{height:4px;background:#eee;border-radius:2px;margin:.75rem 0 .25rem;overflow:hidden}.barra i{display:block;height:100%;width:0;background:#333}
.msg{min-height:1.5em;font-size:.95rem}.mal{color:#b3261e}.bien{color:#1e6b34}small{color:#666}
</style></head><body>
<h1>El mundo de este servidor</h1><p class="sub">Motor ${escapar(version)}</p>
${activa ? "" : `<section class="mal">${SIN_CODIGO}</section>`}
<section><label for="codigo">Código de administración</label>
<input id="codigo" type="password" autocomplete="off" spellcheck="false">
<small>Dónde está: ${escapar(donde)}</small></section>
<section><label>Descargar el mundo</label><p>Un zip con todo: lo construido, lo que guardan las funciones, los modelos subidos, la aventura y el entorno, y cómo arrancarlo en tu PC (docker compose up o bash arrancar.sh).</p>
<form id="bajar" method="post" action="/mundo/zip"><input type="hidden" name="codigo"><button>Descargar el mundo (.zip)</button></form></section>
<section><label for="zip">Subir un mundo</label><p>Sustituye el mundo de ahora por el del zip. El de ahora se guarda en el servidor por si hay que volver.</p>
<input id="zip" type="file" accept=".zip,application/zip"> <button id="subir" disabled>Subir y cambiar</button>
<div class="barra"><i id="barra"></i></div><div id="msg" class="msg"></div></section>
<script>
const $=(i)=>document.getElementById(i),codigo=$("codigo"),msg=$("msg"),barra=$("barra"),zip=$("zip"),subir=$("subir");
const decir=(t,c)=>{msg.textContent=t;msg.className="msg "+(c||"")};
$("bajar").addEventListener("submit",(e)=>{if(!codigo.value){e.preventDefault();decir("Escribe el código.","mal");return}e.target.codigo.value=codigo.value;decir("La descarga empieza en un momento…")});
zip.addEventListener("change",()=>{subir.disabled=!zip.files.length});
subir.addEventListener("click",()=>{
 const f=zip.files[0];if(!f)return;if(!codigo.value){decir("Escribe el código.","mal");return}
 if(!confirm("¿Cambiar el mundo de este servidor por «"+f.name+"»? Quien esté dentro se reconecta en unos segundos."))return;
 const x=new XMLHttpRequest();x.open("PUT","/mundo/zip");x.setRequestHeader("authorization","Bearer "+codigo.value);
 subir.disabled=true;decir("Subiendo…");
 x.upload.onprogress=(e)=>{if(e.lengthComputable){const p=Math.round(100*e.loaded/e.total);barra.style.width=p+"%";decir("Subiendo… "+p+" % ("+(e.loaded/1048576).toFixed(1)+" de "+(e.total/1048576).toFixed(1)+" MB)")}};
 x.upload.onload=()=>decir("Comprobando el zip…");
 x.onerror=()=>{subir.disabled=false;decir("Se cortó la conexión. Vuelve a subirlo.","mal")};
 x.onload=()=>{let r={};try{r=JSON.parse(x.responseText)}catch{}
  if(x.status!==200){subir.disabled=false;barra.style.width="0";decir(r.error||("Error "+x.status),"mal");return}
  decir(r.mensaje||"Mundo comprobado.","bien");esperar(Date.now(),false)};
 x.send(f);
});
// the server stops (health fails) and comes back with the new world; after 10 s of answering, take it as back
function esperar(t0,cayo){setTimeout(()=>fetch("/health",{cache:"no-store"}).then((r)=>r.ok?r.json():null).catch(()=>null).then((h)=>{
 const vivo=!!(h&&h.ok);if(vivo&&(cayo||Date.now()-t0>10000)){decir("Listo: el mundo nuevo está en marcha. Ya puedes entrar.","bien");subir.disabled=false}else esperar(t0,cayo||!vivo)}),1000)}
</script></body></html>
`;
