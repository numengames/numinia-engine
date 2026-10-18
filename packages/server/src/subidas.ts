// subidas (H9): files that whoever may build puts into the world — PUT /a/<sha256>.<ext>, the bytes as the body.
// Hyperfy2 has the same idea (/api/upload, name = hash, never stored twice) but lets anyone upload anything; here:
//   - the page proves who it is with its guest token (I1) in `Authorization: Bearer <token>` (401 without a valid one)
//     and the server asks the same `construir` permission as every building intent (403; H3 makes it roles);
//   - only the kinds in ficheros.ts TIPOS (415), each with its cap (413), all uploads together under a cap (507);
//   - the server computes the sha256 itself (422 if it is not the one in the path) and checks the bytes: a .glb is
//     read whole (header, chunks, JSON), the rest by their first bytes (422);
//   - the file is named only by that sha256 and the allowed extension (no path from the client ever reaches the
//     disk), written to a temporary name and renamed (never half a file); a file already there is not written again;
//   - who uploaded what (guest id, name, when, the original file name, bytes) goes to <dir>/subidas.jsonl, which is
//     never served (only <64 hex>.<kind> names are) and never sent to pages.
// GET and HEAD /a/<sha256>.<ext> are activos.ts (the page asks HEAD first and skips the upload when it is there).
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { appendFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { comprobarFichero, motivo, SUBIDAS_TOTAL_MB, TIPOS, TOPES_MB } from "../../net/src/ficheros.ts";
import type { Activos } from "./activos.ts";

/** Uploads being received at the same time (memory: each one is held whole until checked). */
export const SUBIDAS_A_LA_VEZ = 4;
export const NOMBRE_FICHERO_MAX = 120;
const MB = 1024 * 1024;
const RUTA = /^\/a\/([^/]*)$/, NOMBRE = /^([0-9a-f]{64})\.([a-z0-9]{1,8})$/, YA_SUBIDO = /^[0-9a-f]{64}\.[a-z0-9]{2,4}$/;
const CORS = {
  "access-control-allow-origin": "*", // the token travels in a header, never in a cookie: another site cannot use it
  "access-control-allow-methods": "GET, HEAD, PUT",
  "access-control-allow-headers": "authorization, content-type, x-nombre-fichero",
  "access-control-max-age": "600",
};

export type Quien = { id: string; nombre: string };
export type OpcionesSubidas = {
  dir: string | null;                                   // ACTIVOS_DIR; null = this server takes no uploads (405)
  activos: Activos;                                     // what is already there (house library + uploads)
  quien(token: string): { who: Quien; entity: number } | null; // I1: the guest behind a token (entity -1 when not connected)
  puede(who: Quien, entity: number): boolean;           // H1: may this guest build here?
  topesMB?: Partial<Record<string, number>>;            // tests: smaller caps
  totalMB?: number;                                     // tests: a smaller total
  log?: (line: string) => void;
  guardado?: (hash: string, tipo: string) => void;      // N22: a new file is on disk (the server makes its lighter copy)
};

export class Subidas {
  readonly dir: string | null;
  readonly stats = { guardadas: 0, repetidas: 0, rechazadas: 0, bytes: 0 };
  private readonly o: OpcionesSubidas;
  private readonly log: (l: string) => void;
  private enCurso = 0;
  private total = 0; // bytes already uploaded (the house library does not count)

  constructor(o: OpcionesSubidas) {
    this.o = o; this.dir = o.dir; this.log = o.log ?? (() => {});
    if (!o.dir) return;
    try {
      mkdirSync(o.dir, { recursive: true });
      for (const f of readdirSync(o.dir)) if (YA_SUBIDO.test(f)) this.total += statSync(join(o.dir, f)).size;
    } catch (e) { this.log(`[subidas] no puedo usar ${o.dir}: ${String((e as Error)?.message ?? e)}`); }
  }

  tope(tipo: string): number { return (this.o.topesMB?.[tipo] ?? TOPES_MB[tipo] ?? 0) * MB; }
  private get totalMax(): number { return (this.o.totalMB ?? SUBIDAS_TOTAL_MB) * MB; }

  /** PUT or OPTIONS on /a/…: always answers. */
  atender(method: string, path: string, req: IncomingMessage, res: ServerResponse): void {
    const responder = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) => {
      if (status >= 400) this.stats.rechazadas++;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra });
      res.end(JSON.stringify(body));
    };
    const cortar = (status: number, error: string) => { // answer without reading the rest of the body, then close
      this.stats.rechazadas++;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", connection: "close", ...CORS });
      res.end(JSON.stringify({ error }), () => req.destroy());
    };
    if (method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    const m = NOMBRE.exec(RUTA.exec(path)?.[1] ?? "");
    if (!m) return responder(400, { error: "La ruta para subir es /a/<sha256 en hexadecimal, minúsculas>.<tipo>." });
    const [, hash, tipo] = m;
    if (!this.dir) return responder(405, { error: "Este servidor no guarda subidas (no tiene ACTIVOS_DIR)." }, { allow: "GET, HEAD" });
    const token = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
    const q = token ? this.o.quien(token) : null;
    if (!q) return responder(401, { error: "Falta tu billete de invitado: entra en el mundo antes de subir." }, { "www-authenticate": "Bearer" });
    if (!this.o.puede(q.who, q.entity)) return responder(403, { error: "No puedes construir aquí: el mundo está cerrado a construir (lo abre quien lo administra)." });
    if (!TIPOS[tipo]) return responder(415, { error: `No se pueden subir ficheros .${tipo}. Se admiten: ${Object.keys(TIPOS).join(", ")}.` });
    const tope = this.tope(tipo), dicho = Number(req.headers["content-length"] ?? NaN);
    if (dicho > tope) return cortar(413, `Pasa de ${tope / MB} MB, el tope para .${tipo}.`);
    if (this.enCurso >= SUBIDAS_A_LA_VEZ) return responder(503, { error: "Hay otras subidas en marcha; prueba en unos segundos." }, { "retry-after": "5" });
    let fichero = "";
    try { fichero = decodeURIComponent(String(req.headers["x-nombre-fichero"] ?? "")); } catch { fichero = ""; }
    fichero = fichero.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, NOMBRE_FICHERO_MAX);

    this.enCurso++;
    let libre = false, cortado = false, n = 0;
    res.on("close", () => { if (!libre) { libre = true; this.enCurso--; } }); // answered, or the page went away
    const trozos: Buffer[] = [], h = createHash("sha256");
    req.on("data", (c: Buffer) => {
      if (cortado) return;
      n += c.length;
      if (n > tope) { cortado = true; trozos.length = 0; return cortar(413, `Pasa de ${tope / MB} MB, el tope para .${tipo}.`); }
      trozos.push(c); h.update(c); // hashed as it arrives: no long pause for the 20 Hz loop
    });
    req.on("error", () => { cortado = true; }); // the page went away mid-upload: nothing is kept
    req.on("end", () => {
      if (cortado) return;
      void this.guardar(hash, tipo, Buffer.concat(trozos, n), h.digest("hex"), q.who, fichero).then(([status, body]) => responder(status, body));
    });
  }

  private readonly escribiendo = new Set<string>();
  private async guardar(hash: string, tipo: string, bytes: Buffer, real: string, who: Quien, fichero: string): Promise<[number, Record<string, unknown>]> {
    if (real !== hash) return [422, { error: `Los bytes no son los de ${hash.slice(0, 12)}…: su sha256 es ${real.slice(0, 12)}… (¿se cortó la subida?).` }];
    const ok = comprobarFichero(tipo, bytes);
    if (!ok.ok) return [422, { error: `El fichero no vale: ${motivo(ok.issues)}.`, issues: ok.issues }];
    const nombre = `${hash}.${tipo}`, hecho = { sha256: hash, tipo, bytes: bytes.length, url: `/a/${nombre}` };
    if (this.o.activos.buscar(hash, tipo) || this.escribiendo.has(nombre)) { this.stats.repetidas++; return [200, { ...hecho, nuevo: false }]; }
    if (this.total + bytes.length > this.totalMax) return [507, { error: `El servidor ya no tiene sitio para más subidas (tope de ${this.totalMax / MB} MB entre todas).` }];
    const dir = this.dir!, tmp = join(dir, `.subiendo-${randomBytes(6).toString("hex")}`);
    this.total += bytes.length; this.escribiendo.add(nombre); // reserved before writing: two at once never pass the total
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, join(dir, nombre));
    } catch (e) {
      this.total -= bytes.length;
      await unlink(tmp).catch(() => {});
      this.log(`[subidas] no puedo guardar ${nombre} en ${dir}: ${String((e as Error)?.message ?? e)}`);
      return [500, { error: "El servidor no pudo guardar el fichero; avisa a quien lo administra." }];
    } finally { this.escribiendo.delete(nombre); }
    this.stats.guardadas++; this.stats.bytes += bytes.length;
    const linea = { cuando: new Date().toISOString(), sha256: hash, tipo, bytes: bytes.length, quien: who.id, nombre: who.nombre, fichero };
    await appendFile(join(dir, "subidas.jsonl"), JSON.stringify(linea) + "\n").catch((e) => this.log(`[subidas] no puedo apuntar quién subió ${hash}.${tipo}: ${String((e as Error)?.message ?? e)}`));
    this.log(`[subidas] ${who.nombre} subió ${hash.slice(0, 12)}….${tipo} (${bytes.length} bytes)`);
    this.o.guardado?.(hash, tipo);
    return [201, { ...hecho, nuevo: true }];
  }
}
