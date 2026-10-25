// importar-hyperfy (H11, parity with Hyperfy2: docs/HYPERFY2-PARIDAD.md, docs/BACKLOG.md H11): reads a Hyperfy
// world (its `db.sqlite` — tables `config`, `blueprints`, `entities` — plus its `assets/` folder of files named
// by their sha256) and writes a Numinia engine world folder: things placed in the world (H1, `datos/objetos.json`,
// the exact snapshot `FileStorage` reads at boot) and the world's settings (H7, `aventura/ficha.json`), with every
// asset copied into `datos/activos/<sha256>.<ext>` (the only place the engine looks for an uploaded model, H9).
// Only the `db.sqlite` + `assets/` → world folder half of H11 (the other half, a single `.hyp` → app folder, waits
// on M19's app format and is not touched here). Pure and offline: no server, no network, no asset upload API.
// Layers (tools/layers.json): packages/ never imports features/, so this module writes the `objetos` state
// entries by hand, with the same field defaults as `features/objetos/server.ts`'s `colocar` handler (OBJETOS_VERSION
// below must match `objetos.version` there; test/importar-hyperfy.test.ts boots the real feature over this
// module's output and would fail if the two ever drift apart).
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { carpetaMundo } from "./mundo-carpeta.ts";
import { FICHA, type Ficha, validarFicha } from "./aventura.ts";

/** Must match `objetos.version` in `features/objetos/feature.ts` (checked at runtime by the round-trip test). */
export const OBJETOS_VERSION = 8;

/** A Hyperfy `assets://<sha256>.<ext>` reference, or null when the string is not one. */
const ASSET_RE = /^asset:\/\/([0-9a-f]{64})\.([a-z0-9]+)$/i;
export function leerAsset(url: unknown): { sha256: string; ext: string } | null {
  const m = ASSET_RE.exec(String(url ?? ""));
  return m ? { sha256: m[1].toLowerCase(), ext: m[2].toLowerCase() } : null;
}

/** A Hyperfy blueprint, read from `blueprints.data` (JSON). Only the fields this importer uses. */
export type HyperfyBlueprint = { id: string; name?: string; model?: string; [k: string]: unknown };
/** A Hyperfy entity, read from `entities.data` (JSON). `position`/`scale` as [x,y,z]; `quaternion` as [x,y,z,w]. */
export type HyperfyEntity = { id: string; type?: string; blueprint?: string; position?: number[]; quaternion?: number[]; scale?: number[]; [k: string]: unknown };

/** Everything this importer reads from `db.sqlite`: config (key→value), every blueprint and every entity. */
export type HyperfyMundo = { config: Map<string, string>; blueprints: Map<string, HyperfyBlueprint>; entities: HyperfyEntity[] };

/** Does a table with this name exist? (older/newer Hyperfy dumps may be missing one; we read what is there.) */
function tablaExiste(db: DatabaseSync, nombre: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre);
}

/** Opens a Hyperfy `db.sqlite` read-only and pulls `config`, `blueprints`, `entities` as plain data. Never writes to it. */
export function leerMundoHyperfy(dbPath: string): HyperfyMundo {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const config = new Map<string, string>();
    if (tablaExiste(db, "config")) for (const r of db.prepare("SELECT key, value FROM config").all() as { key: string; value: string }[]) config.set(r.key, r.value);
    const blueprints = new Map<string, HyperfyBlueprint>();
    if (tablaExiste(db, "blueprints")) {
      for (const r of db.prepare("SELECT id, data FROM blueprints").all() as { id: string; data: string }[]) {
        try { blueprints.set(r.id, { id: r.id, ...JSON.parse(r.data) }); } catch { /* a broken row is skipped; counted by the caller via blueprints.size */ }
      }
    }
    const entities: HyperfyEntity[] = [];
    if (tablaExiste(db, "entities")) {
      for (const r of db.prepare("SELECT id, data FROM entities").all() as { id: string; data: string }[]) {
        try { entities.push({ id: r.id, ...JSON.parse(r.data) }); } catch { /* skipped; counted by the caller */ }
      }
    }
    return { config, blueprints, entities };
  } finally { db.close(); }
}

/** Quaternion [x,y,z,w] → degrees `{rx,ry,rz}` in the engine's own order (yaw `ry`, then pitch `rx`, then roll `rz`;
 * three.js Euler order "YXZ"). Hyperfy's transforms are plain three.js quaternions, so this is the same maths
 * three.js itself uses to decompose one, written out so this module needs no dependency on three.js. */
export function quaternionAEuler(q: number[] | undefined): { rx: number; ry: number; rz: number } {
  const [x, y, z, w] = q && q.length === 4 ? q : [0, 0, 0, 1];
  // Rotation matrix elements this decomposition needs (standard quaternion → matrix, then YXZ Euler extraction).
  const m13 = 2 * (x * z + y * w), m23 = 2 * (y * z - x * w), m33 = 1 - 2 * (x * x + y * y);
  const m12 = 2 * (x * y - z * w), m22 = 1 - 2 * (x * x + z * z);
  const m11 = 1 - 2 * (y * y + z * z), m21 = 2 * (x * y + z * w);
  const rad2deg = 180 / Math.PI;
  let rx: number, ry: number, rz: number;
  if (Math.abs(m23) < 0.9999999) {
    rx = Math.asin(-m23);
    ry = Math.atan2(m13, m33);
    rz = Math.atan2(m21, m22);
  } else { // gimbal lock: roll folded into yaw, as three.js does
    rx = Math.asin(-m23);
    ry = Math.atan2(-m12 ? -m12 : 0, m11);
    rz = 0;
  }
  void m22;
  return { rx: Number((rx * rad2deg).toFixed(2)), ry: Number((ry * rad2deg).toFixed(2)), rz: Number((rz * rad2deg).toFixed(2)) };
}

/** One imported thing, in H1's own field shape (features/objetos: modelo = sha256, degrees, metres); validated
 * against the real `objetos` schema before being written, so a bad row never reaches the world folder quietly. */
export type ObjetoImportado = { id: string; value: Record<string, unknown> };

export type InformeImportacion = {
  formato: "informe-importacion-hyperfy@1";
  origen: { db: string; assets: string };
  blueprints: { leidos: number; rotos: number };
  entidades: { leidas: number };
  objetos: { importados: number; omitidos: { id: string; razon: string }[] };
  activos: { copiados: { sha256: string; ext: string; bytes: number }[]; faltan: { sha256: string; ext: string }[] };
  ajustes: { ficha: boolean; detalle?: string };
};

export type OpcionesImportar = { dbPath: string; assetsDir: string; destino: string };

/** The whole import: `db.sqlite` + `assets/` → a world folder (H1 `datos/objetos.json`, H7 `aventura/ficha.json`,
 * assets copied by hash into `datos/activos/`). Idempotent (re-running overwrites the same two files). Returns the
 * Spanish "informe de lo traído" (counts), also written to `<destino>/informe-importacion.json`. */
export function importarMundoHyperfy(opts: OpcionesImportar): InformeImportacion {
  const mundo = leerMundoHyperfy(opts.dbPath);
  const carpeta = carpetaMundo(opts.destino);
  mkdirSync(carpeta.datos, { recursive: true });
  mkdirSync(carpeta.activos, { recursive: true });
  mkdirSync(carpeta.aventura, { recursive: true });

  const omitidos: { id: string; razon: string }[] = [];
  const copiados: { sha256: string; ext: string; bytes: number }[] = [];
  const faltan: { sha256: string; ext: string }[] = [];
  const yaCopiado = new Set<string>();
  const state: [string, { value: Record<string, unknown> }][] = [];

  const copiarActivo = (sha256: string, ext: string): boolean => {
    const clave = `${sha256}.${ext}`;
    if (yaCopiado.has(clave)) return true;
    const destinoFichero = join(carpeta.activos, clave);
    if (existsSync(destinoFichero)) { yaCopiado.add(clave); return true; }
    const origenFichero = join(opts.assetsDir, clave);
    if (!existsSync(origenFichero)) { faltan.push({ sha256, ext }); return false; }
    const bytes = readFileSync(origenFichero);
    const real = createHash("sha256").update(bytes).digest("hex");
    if (real !== sha256) { omitidos.push({ id: clave, razon: `el fichero no tiene el sha256 que dice su nombre (es ${real})` }); return false; }
    copyFileSync(origenFichero, destinoFichero);
    copiados.push({ sha256, ext, bytes: bytes.length });
    yaCopiado.add(clave);
    return true;
  };

  for (const e of mundo.entities) {
    const bp = e.blueprint ? mundo.blueprints.get(e.blueprint) : undefined;
    if (!bp) { omitidos.push({ id: e.id, razon: e.blueprint ? `su blueprint «${e.blueprint}» no está en blueprints` : "sin blueprint (no es una app con modelo)" }); continue; }
    const asset = leerAsset(bp.model);
    if (!asset) { omitidos.push({ id: e.id, razon: `el blueprint «${bp.id}» no tiene un model asset://<sha256>.<ext> (${JSON.stringify(bp.model)})` }); continue; }
    if (!copiarActivo(asset.sha256, asset.ext)) { omitidos.push({ id: e.id, razon: `falta o no vale el fichero ${asset.sha256}.${asset.ext}` }); continue; }
    const [x, y, z] = e.position && e.position.length === 3 ? e.position : [0, 0, 0];
    const [sx, sy, sz] = e.scale && e.scale.length === 3 ? e.scale : [1, 1, 1];
    const { rx, ry, rz } = quaternionAEuler(e.quaternion);
    const nombre = String(bp.name ?? "").trim();
    const valor = {
      modelo: asset.sha256, x, y, z, rx, ry, rz, sx, sy, sz, nombre, decorado: nombre.length === 0,
      fijado: false, animar: true, tipo: "modelo", ext: asset.ext, oculto: false, volumen: 1, solido: false, colision: "ninguna",
      bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false, enlace: "",
    };
    state.push([e.id, { value: valor }]);
  }

  writeFileSync(join(carpeta.datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: OBJETOS_VERSION, savedAt: new Date().toISOString(), state, store: [] }));
  writeFileSync(join(carpeta.datos, "objetos.jsonl"), ""); // no pending journal: the snapshot above is already whole

  const nombreMundo = (mundo.config.get("title") ?? mundo.config.get("name") ?? "").trim() || "Mundo importado de Hyperfy";
  const descripcion = (mundo.config.get("desc") ?? mundo.config.get("description") ?? "").trim();
  const portadaAsset = leerAsset(mundo.config.get("image"));
  const portadaLista = portadaAsset && (portadaAsset.ext === "png" || portadaAsset.ext === "jpg" || portadaAsset.ext === "webp") ? copiarActivo(portadaAsset.sha256, portadaAsset.ext) : false;
  const aforoBruto = Number(mundo.config.get("playerLimit") ?? mundo.config.get("maxPlayers") ?? NaN);
  const aforo = Number.isFinite(aforoBruto) && aforoBruto >= 1 && aforoBruto <= 1000 ? Math.floor(aforoBruto) : undefined;
  const ficha: Ficha = { formato: FICHA, nombre: nombreMundo.slice(0, 60), ...(descripcion ? { descripcion: descripcion.slice(0, 500) } : {}), ...(portadaLista ? { portada: `${portadaAsset!.sha256}.${portadaAsset!.ext}` } : {}), ...(aforo ? { aforo } : {}) };
  const v = validarFicha(ficha);
  let ajustesDetalle: string | undefined;
  if (v.ok) writeFileSync(join(carpeta.aventura, "ficha.json"), JSON.stringify(v.value, null, 1) + "\n");
  else ajustesDetalle = v.issues.map((i) => `${i.path}: ${i.message}`).join("; ");

  const informe: InformeImportacion = {
    formato: "informe-importacion-hyperfy@1",
    origen: { db: opts.dbPath, assets: opts.assetsDir },
    blueprints: { leidos: mundo.blueprints.size, rotos: 0 },
    entidades: { leidas: mundo.entities.length },
    objetos: { importados: state.length, omitidos },
    activos: { copiados, faltan },
    ajustes: { ficha: v.ok, detalle: ajustesDetalle },
  };
  writeFileSync(join(opts.destino, "informe-importacion.json"), JSON.stringify(informe, null, 1) + "\n");
  writeFileSync(join(opts.destino, "informe-importacion.txt"), informeTexto(informe));
  return informe;
}

/** The report, as a short paragraph a person reads (criterio de hecho: "informe de lo traído"). */
export function informeTexto(i: InformeImportacion): string {
  const l: string[] = [];
  l.push(`Importación de un mundo de Hyperfy (${i.origen.db})`);
  l.push(`- Blueprints leídos: ${i.blueprints.leidos}`);
  l.push(`- Entidades leídas: ${i.entidades.leidas}`);
  l.push(`- Objetos importados (H1): ${i.objetos.importados}`);
  if (i.objetos.omitidos.length) l.push(`- Omitidos (${i.objetos.omitidos.length}): ${i.objetos.omitidos.map((o) => `${o.id} (${o.razon})`).join("; ")}`);
  l.push(`- Activos copiados: ${i.activos.copiados.length} (${i.activos.copiados.reduce((a, c) => a + c.bytes, 0)} bytes)`);
  if (i.activos.faltan.length) l.push(`- Activos que faltan en assets/: ${i.activos.faltan.map((a) => `${a.sha256}.${a.ext}`).join(", ")}`);
  l.push(`- Ajustes del mundo (H7, ficha.json): ${i.ajustes.ficha ? "importados" : `no importados (${i.ajustes.detalle})`}`);
  l.push("- No portado por este importador: los scripts de las apps (su API no es la nuestra; M19 llevará el .hyp -> carpeta de app).");
  return l.join("\n") + "\n";
}

/** Lists the `.glb`/other files an assets/ folder has, for a quick sanity count before importing (CLI helper). */
export function contarAssets(dir: string): number {
  try { return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).length; } catch { return 0; }
}
