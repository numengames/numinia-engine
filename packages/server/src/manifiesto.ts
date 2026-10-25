// manifiesto (M16): what a zone is made of, file by file, so the page knows — before it downloads anything — how many bytes
// the zone is, which files it needs to play (`arranque`), which can come right after (`fondo`) and which only when you get close
// (`perezoso`: the levels of detail of far models, lod.ts), and can check each file against its sha256.
//
//   GET /manifiesto.json  →  { schema: "numinia-engine/manifiesto@1", zona, generado, origenes, total, clases, ficheros: [
//       { ruta: "/a/<sha256>.glb", sha256, bytes, clase, tipo, copias, lods?: n } …
//       { ruta: "/a/<sha256>.lod1.glb", sha256, bytes, clase: "perezoso", tipo: "glb", de: "/a/<sha256>.glb", nivel: 1 } … ] }
//
// `sha256` is the hash of the bytes the server SENDS for that path (a .glb may have a lighter copy, optimizar.ts, so it is not
// always the hash in its name). Hashing a few hundred files is real work, so the hashes are kept: in memory and in
// <uploads>/hashes.json, each valid while the file keeps its size and modification time. A zone's second manifest hashes nothing.
//
// What a zone is here: the instance (one world = one zone until the engine has several, BACKLOG M16). Pure of http: server.ts
// asks for it. The page's side (apps/plaza/manifiesto.ts) reads it, fetches by class and checks the hash.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Activos } from "./activos.ts";

export const ESQUEMA = "numinia-engine/manifiesto@1";
/** A thing within this many metres of the zone's origin (the same LEJOS_M the page's loader uses) is needed to play. */
export const ARRANQUE_M = 80;
export type Clase = "arranque" | "fondo" | "perezoso";

export type FicheroManifiesto = { ruta: string; sha256: string; bytes: number; clase: Clase; tipo: string; copias?: number; lods?: number; de?: string; nivel?: number };
export type Manifiesto = {
  schema: typeof ESQUEMA; zona: string; generado: string; origenes: string[];
  total: { ficheros: number; bytes: number };
  clases: Record<Clase, { ficheros: number; bytes: number }>;
  ficheros: FicheroManifiesto[];
};

/** A thing of the world as the manifest needs it (the `objetos` feature's entry). */
export type Cosa = { modelo: string; tipo?: string; ext?: string; x?: number; z?: number; fijado?: boolean; oculto?: boolean };

type Entrada = { tam: number; mtime: number; sha256: string };

/** sha256 of files, remembered while a file keeps its size and mtime; persisted in `archivo` (best effort). */
export class CacheHashes {
  private readonly m = new Map<string, Entrada>();
  private sucio = false;
  private escribiendo: Promise<void> = Promise.resolve();
  /** How many files were actually read and hashed (a test counts them: a second manifest must add none). */
  calculados = 0;
  private readonly archivo: string | null;
  constructor(archivo: string | null) {
    this.archivo = archivo;
    if (!archivo || !existsSync(archivo)) return;
    try { for (const [k, v] of Object.entries(JSON.parse(readFileSync(archivo, "utf8")) as Record<string, Entrada>)) if (v && typeof v.sha256 === "string" && /^[0-9a-f]{64}$/.test(v.sha256)) this.m.set(k, v); } catch { /* a broken file is just an empty cache */ }
  }
  async de(ruta: string): Promise<{ sha256: string; bytes: number }> {
    const st = statSync(ruta), e = this.m.get(ruta);
    if (e && e.tam === st.size && e.mtime === st.mtimeMs) return { sha256: e.sha256, bytes: st.size };
    const h = createHash("sha256");
    await new Promise<void>((ok, mal) => createReadStream(ruta).on("data", (c) => h.update(c)).on("end", () => ok()).on("error", mal));
    this.calculados++;
    const sha256 = h.digest("hex");
    this.m.set(ruta, { tam: st.size, mtime: st.mtimeMs, sha256 }); this.sucio = true;
    return { sha256, bytes: st.size };
  }
  /** Writes the cache if something changed (atomically; never throws). */
  guardar(): Promise<void> {
    if (!this.archivo || !this.sucio) return this.escribiendo;
    this.sucio = false;
    const datos = JSON.stringify(Object.fromEntries(this.m)), tmp = `${this.archivo}.tmp`;
    this.escribiendo = this.escribiendo.then(() => writeFile(tmp, datos).then(() => rename(tmp, this.archivo!))).catch(() => {});
    return this.escribiendo;
  }
}

/** The class of one placed thing: what is near the origin (or pinned) is needed to play; the rest comes after. */
export function claseDe(c: Cosa): Clase {
  if (c.fijado) return "arranque";
  return Math.hypot(c.x ?? 0, c.z ?? 0) <= ARRANQUE_M ? "arranque" : "fondo";
}
const ORDEN: Record<Clase, number> = { arranque: 0, fondo: 1, perezoso: 2 };

/**
 * The manifest of a zone: every file its things use (once each, in the nearest class any copy needs), plus the levels of
 * detail that exist for its models. A thing whose file is missing is left out (the page shows it failed, as before).
 */
export async function construirManifiesto(zona: string, cosas: Iterable<Cosa>, activos: Activos, hashes: CacheHashes, origenes: string[] = ["/"]): Promise<Manifiesto> {
  const por = new Map<string, { sha: string; ext: string; clase: Clase; copias: number }>();
  for (const c of cosas) {
    if (!c?.modelo || !/^[0-9a-f]{64}$/.test(c.modelo)) continue;
    const ext = (c.tipo ?? "modelo") === "modelo" ? "glb" : /^[a-z0-9]{2,4}$/.test(c.ext ?? "") ? c.ext! : "glb";
    const k = `${c.modelo}.${ext}`, clase = claseDe(c), v = por.get(k);
    if (!v) por.set(k, { sha: c.modelo, ext, clase, copias: 1 });
    else { v.copias++; if (ORDEN[clase] < ORDEN[v.clase]) v.clase = clase; }
  }
  const ficheros: FicheroManifiesto[] = [];
  for (const v of [...por.values()].sort((a, b) => ORDEN[a.clase] - ORDEN[b.clase] || (a.sha + a.ext < b.sha + b.ext ? -1 : 1))) {
    const elegido = activos.aServir(v.sha, v.ext, "");
    if (!elegido) continue;
    const { sha256, bytes } = await hashes.de(elegido.ruta), ruta = `/a/${v.sha}.${v.ext}`;
    const lods: FicheroManifiesto[] = [];
    if (v.ext === "glb") for (const nivel of [1, 2]) {
      const r = activos.rutaLod(v.sha, nivel);
      if (!r) continue;
      const h = await hashes.de(r);
      lods.push({ ruta: `/a/${v.sha}.lod${nivel}.glb`, sha256: h.sha256, bytes: h.bytes, clase: "perezoso", tipo: "glb", de: ruta, nivel });
    }
    ficheros.push({ ruta, sha256, bytes, clase: v.clase, tipo: v.ext, copias: v.copias, ...(lods.length ? { lods: lods.length } : {}) }, ...lods);
  }
  void hashes.guardar();
  const clases: Manifiesto["clases"] = { arranque: { ficheros: 0, bytes: 0 }, fondo: { ficheros: 0, bytes: 0 }, perezoso: { ficheros: 0, bytes: 0 } };
  for (const f of ficheros) { clases[f.clase].ficheros++; clases[f.clase].bytes += f.bytes; }
  const total = { ficheros: ficheros.length, bytes: ficheros.reduce((s, f) => s + (f.clase === "perezoso" ? 0 : f.bytes), 0) };
  return { schema: ESQUEMA, zona, generado: new Date().toISOString(), origenes, total, clases, ficheros };
}

/** Where the hashes live beside a server's uploads. */
export const archivoHashes = (subidas: string | null): string | null => (subidas ? join(subidas, "hashes.json") : null);
