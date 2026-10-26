// importar-hyp (H11, the `.hyp` half): a Hyperfy app file → an app folder of the engine (apps.ts, M19).
// A `.hyp` is [u32 LE header size][header JSON {blueprint, assets[{type, url, size, mime}]}][asset bytes, in the header's order]
// (docs: mmo-browser-study/notes/16a-hyp-read-from-source.md; the writer is Hyperfy's src/core/extras/appTools.js). It has no magic,
// no version, no checksum and NO licence field — so the licence of the source is something the person importing says
// (`licencia`), and what it cannot vouch for is not brought in: a file whose licence is unknown or not admitted is listed in
// app.json as «omitido» with the reason (docs/SABER.md §3.3: the 351 `.hyp` of hyperfy-apps have none).
// What comes over: name, description, author, source; the model and every file the blueprint names, renamed by their real
// SHA-256 and checked as the engine checks an upload; the props as properties (type from the value; their labels and ranges live
// in the script's `app.configure`, so they go with the script). What does NOT: the script. It is written against Hyperfy's API
// (app, world, props…), which is not ours, so it is kept apart in por-portar/script.js and marked «por portar»; it is never run,
// never parsed. The report (IMPORTADO.md + the returned object) lists what came, what was left out and what remains to port.
// Read-only on the .hyp: it is opened for reading and nothing else touches it. Pure and offline. A VRM carries its own licence
// inside (licenciaDeVrm): that wins over what the person says (a file's licence is not rewritten).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Issue } from "../../core/src/index.ts";
import { comprobarFichero, TIPOS } from "../../net/src/ficheros.ts";
import { APP_ACTIVOS_MAX, APP_ACTIVOS_MB, APP_CLAVE, APP_ESQUEMA, APP_ID, LICENCIA_DESCONOCIDA, leerApp, licenciaAdmitida, motivoLicencia, validarApp } from "./apps.ts";
import type { ActivoApp, App, Portar, Propiedad } from "./apps.ts";
import { infoVrm, licenciaDeVrm, revisarAvatarDelMundo } from "./vrm.ts";

export const HYP_MAX_MB = 64;            // a .hyp bigger than this is refused (the engine's biggest upload is 32 MB)
export const HYP_CABECERA_MAX = 1024 * 1024;

export type ActivoHyp = { tipo: string; url: string; size: number; mime: string; bytes: Uint8Array; sha256: string; ext: string | null; hashDeLaUrl: string | null };
export type Hyp = { blueprint: Record<string, unknown>; activos: ActivoHyp[]; sha256: string; bytes: number; avisos: string[] };
const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const URL_ASSET = /^asset:\/\/([0-9a-f]{64})\.([a-z0-9]+)$/i;

/** The bytes of a .hyp → its blueprint and its files, or what is wrong with it. Never throws. */
export function leerHyp(b: Uint8Array): { ok: true; hyp: Hyp } | { ok: false; issues: Issue[] } {
  const mal = (path: string, message: string) => ({ ok: false as const, issues: [{ path, message }] });
  if (b.length < 4) return mal("hyp", `tiene ${b.length} bytes: un .hyp empieza por 4 bytes con el tamaño de la cabecera`);
  if (b.length > HYP_MAX_MB * 1024 * 1024) return mal("hyp", `pesa ${(b.length / 1048576).toFixed(1)} MB: el tope es ${HYP_MAX_MB} MB`);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint32(0, true);
  if (n < 2 || n > HYP_CABECERA_MAX || 4 + n > b.length) return mal("hyp.cabecera", `la cabecera dice ${n} bytes y el fichero tiene ${b.length}: no es un .hyp, o está cortado`);
  let h: unknown;
  try { h = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(4, 4 + n))); } catch (e) { return mal("hyp.cabecera", `la cabecera no es JSON válido: ${(e as Error).message}`); }
  const o = h as { blueprint?: unknown; assets?: unknown };
  if (typeof o !== "object" || o === null || typeof o.blueprint !== "object" || o.blueprint === null || Array.isArray(o.blueprint)) return mal("hyp.blueprint", "falta el blueprint: la cabecera es { blueprint, assets }");
  if (!Array.isArray(o.assets)) return mal("hyp.assets", "falta la lista de assets de la cabecera");
  const activos: ActivoHyp[] = [], avisos: string[] = [];
  let pos = 4 + n;
  for (const [i, a] of (o.assets as Record<string, unknown>[]).entries()) {
    const url = typeof a?.url === "string" ? a.url : "", size = a?.size;
    if (!url || typeof size !== "number" || !Number.isInteger(size) || size < 0) return mal(`hyp.assets[${i}]`, "cada asset lleva url y size (un entero)");
    if (pos + size > b.length) return mal(`hyp.assets[${i}]`, `dice ${size} bytes y solo quedan ${b.length - pos}: el .hyp está cortado`);
    const bytes = b.subarray(pos, pos + size); pos += size;
    const m = URL_ASSET.exec(url);
    const real = sha256(bytes), ext = m ? m[2].toLowerCase() : (/\.([a-z0-9]{1,8})$/i.exec(url)?.[1]?.toLowerCase() ?? null);
    if (m && m[1].toLowerCase() !== real) avisos.push(`${url}: sus bytes dan el SHA-256 ${real}, no el de su nombre; uso el real`);
    activos.push({ tipo: String(a.type ?? ""), url, size, mime: String(a.mime ?? ""), bytes, sha256: real, ext, hashDeLaUrl: m ? m[1].toLowerCase() : null });
  }
  if (pos !== b.length) avisos.push(`sobran ${b.length - pos} bytes al final del .hyp: no se usan`);
  return { ok: true, hyp: { blueprint: o.blueprint as Record<string, unknown>, activos, sha256: sha256(b), bytes: b.length, avisos } };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** «Agente IA» → «agente-ia»: a folder name the format accepts. */
export function idDeNombre(nombre: string, respaldo: string): string {
  const s = sinTildes(nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
  return APP_ID.test(s) ? s : respaldo;
}
/** «wander_radius» → «wanderRadius»; null when no camelCase name can be made from it. */
export function claveDePropiedad(k: string): string | null {
  if (APP_CLAVE.test(k)) return k;
  if (!/^[A-Za-z][A-Za-z0-9_ -]*$/.test(k)) return null;
  const partes = k.split(/[_ -]+/).filter(Boolean);
  const c = partes.map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join("");
  return APP_CLAVE.test(c) ? c : null;
}
const humanizar = (k: string) => { const s = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase(); return (s[0].toUpperCase() + s.slice(1)).slice(0, 60); };
const cortar = (s: unknown, max: number): string | undefined => { const t = typeof s === "string" ? s.trim() : ""; return t ? t.slice(0, max) : undefined; };

export type OpcionesHyp = {
  /** the .hyp to read (read-only) */ hyp: string;
  /** the world's apps/ folder: the app lands in <destino>/<id>/ */ destino: string;
  /** SPDX id of the SOURCE's licence as the person importing knows it; none = «desconocida» (then nothing is copied) */ licencia?: string;
  /** credit for CC BY files when the .hyp's own author field is empty */ autor?: string;
  /** folder name; default from the app's name */ id?: string;
  /** overwrite an app folder that already exists (default: refuse) */ reemplazar?: boolean;
};
export type InformeHyp = {
  formato: "informe-importacion-hyp@1";
  origen: { archivo: string; sha256: string; bytes: number };
  app: { id: string; nombre: string; licencia: string };
  traidos: { archivo: string; tipo: string; bytes: number; licencia: string }[];
  omitidos: { archivo: string; tipo: string; motivo: string }[];
  propiedades: { traidas: string[]; omitidas: { id: string; motivo: string }[] };
  porPortar: { estado: "por-portar" | "omitido" | "sin-script"; origen: "hyperfy"; bytes?: number; sha256?: string; motivo: string };
  avisos: string[];
};

/** The whole import. Throws an Error (Spanish message saying what to fix) only for a .hyp that cannot be read, a bad option or an
 * app folder that exists; everything the licence or the checks leave out is in the report, not an error. */
export function importarHyp(o: OpcionesHyp): InformeHyp {
  const lic = o.licencia ?? LICENCIA_DESCONOCIDA;
  if (!/^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/.test(lic)) throw new Error(`licencia «${lic}»: un id SPDX como «CC0-1.0» o «AGPL-3.0-only» (o no la pongas: «${LICENCIA_DESCONOCIDA}»)`);
  if (o.id !== undefined && !APP_ID.test(o.id)) throw new Error(`id «${o.id}»: minúsculas, cifras y guiones, 1–32 caracteres`);
  let st; try { st = statSync(o.hyp); } catch (e) { throw new Error(`no puedo leer ${o.hyp}: ${(e as Error).message}`); }
  if (!st.isFile()) throw new Error(`${o.hyp} no es un fichero`);
  if (st.size > HYP_MAX_MB * 1024 * 1024) throw new Error(`${o.hyp} pesa ${(st.size / 1048576).toFixed(1)} MB: el tope es ${HYP_MAX_MB} MB`);
  const r = leerHyp(readFileSync(o.hyp)); // the only thing done to the .hyp: read it
  if (!r.ok) throw new Error(`${o.hyp}: ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const { blueprint: bp, activos, avisos } = r.hyp;
  const archivo = basename(o.hyp);

  const nombre = cortar(bp.name, 60) ?? basename(o.hyp).replace(/\.hyp$/i, "").slice(0, 60);
  const id = o.id ?? idDeNombre(nombre, `hyp-${r.hyp.sha256.slice(0, 8)}`);
  const destinoApp = join(o.destino, id);
  if (existsSync(destinoApp) && !o.reemplazar) throw new Error(`ya hay una app «${id}» en ${o.destino}: elige otro --id o usa --reemplazar`);
  const autor = cortar(bp.author, 120) ?? cortar(o.autor, 120);
  const fuente = typeof bp.url === "string" && /^https?:\/\/\S+$/.test(bp.url) && bp.url.length <= 300 ? bp.url : undefined;

  // the files: each one by its real hash, with the licence it can be brought in under
  const listado: ActivoApp[] = [], cuerpos = new Map<string, Uint8Array>();
  const traidos: InformeHyp["traidos"] = [], omitidos: InformeHyp["omitidos"] = [];
  const porUrl = new Map<string, string>(); // asset url → app file name (when brought in)
  let script: ActivoHyp | null = null, total = 0;
  const omitir = (a: ActivoHyp, motivo: string) => {
    const f = a.ext ? `${a.sha256}.${a.ext}` : a.sha256;
    omitidos.push({ archivo: f, tipo: a.tipo, motivo });
    if (a.ext && /^[a-z0-9]{1,8}$/.test(a.ext) && !listado.some((x) => x.archivo === f)) listado.push({ archivo: f, licencia: lic, estado: "omitido", motivo });
  };
  for (const a of activos) {
    if (a.tipo === "script" || a.ext === "js") { script ??= a; continue; }
    const f = a.ext ? `${a.sha256}.${a.ext}` : "";
    if (!a.ext || !TIPOS[a.ext]) { omitir(a, `.${a.ext ?? "?"} no es un tipo que el motor admita (${Object.keys(TIPOS).join(", ")})`); continue; }
    if (cuerpos.has(f)) { porUrl.set(a.url, f); continue; } // the same bytes under two urls: one file
    let licA = lic, creditoA = autor;
    if (a.ext === "vrm") { // a VRM says its own licence: that one, never ours
      const v = infoVrm(a.bytes);
      if (!v.ok) { omitir(a, `no se lee como VRM: ${v.issues[0].message}`); continue; }
      const propia = licenciaDeVrm(v.value);
      if (!propia) { omitir(a, `la licencia que dice el propio VRM («${v.value.licencia.nombre || v.value.licencia.url || "ninguna"}») no es CC0 ni CC BY`); continue; }
      const q = revisarAvatarDelMundo(v.value, propia);
      if (q.length) { omitir(a, q.map((i) => i.message).join("; ")); continue; }
      licA = propia === "CC0" ? "CC0-1.0" : "CC-BY-4.0"; creditoA = cortar(v.value.licencia.autor, 120) ?? autor;
    } else if (!licenciaAdmitida(lic)) { omitir(a, motivoLicencia(lic)); continue; }
    if (licA.startsWith("CC-BY") && !creditoA) { omitir(a, `${licA} exige el crédito y el .hyp no dice el autor: pásalo con --autor`); continue; }
    const c = comprobarFichero(a.ext, a.bytes);
    if (!c.ok) { omitir(a, c.issues.map((i) => `${i.path}: ${i.message}`).join("; ")); continue; }
    if (traidos.length >= APP_ACTIVOS_MAX) { omitir(a, `la app ya tiene ${APP_ACTIVOS_MAX} ficheros, el tope`); continue; }
    if (total + a.bytes.length > APP_ACTIVOS_MB * 1024 * 1024) { omitir(a, `pasaría de ${APP_ACTIVOS_MB} MB por app`); continue; }
    total += a.bytes.length;
    cuerpos.set(f, a.bytes); porUrl.set(a.url, f);
    listado.push({ archivo: f, licencia: licA, ...(licA.startsWith("CC-BY") && creditoA ? { autor: creditoA } : {}), ...(fuente ? { fuente } : {}), estado: "incluido" });
    traidos.push({ archivo: f, tipo: a.tipo, bytes: a.bytes.length, licencia: licA });
  }
  const modeloUrl = typeof bp.model === "string" ? bp.model : null;
  const modelo = modeloUrl ? porUrl.get(modeloUrl) : undefined;
  if (modeloUrl && !modelo) avisos.push(`el modelo ${modeloUrl} no se trajo: la app queda sin modelo (mira «omitidos»)`);
  else if (modelo && !/\.(glb|vrm)$/.test(modelo)) avisos.push(`el modelo ${modeloUrl} no es un .glb ni un .vrm: no se pone como «modelo»`);

  // the props → properties (type from the value; labels and ranges are in the script's app.configure)
  const propiedades: Propiedad[] = [], omitidasP: { id: string; motivo: string }[] = [];
  const props = (typeof bp.props === "object" && bp.props !== null && !Array.isArray(bp.props) ? bp.props : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(props)) {
    if (propiedades.length >= 32) { omitidasP.push({ id: k, motivo: "ya hay 32 propiedades, el tope" }); continue; }
    const c = claveDePropiedad(k);
    if (!c) { omitidasP.push({ id: k, motivo: "su nombre no se puede escribir en camelCase (letras y cifras)" }); continue; }
    if (propiedades.some((p) => p.id === c)) { omitidasP.push({ id: k, motivo: `queda como «${c}» y ya hay una así` }); continue; }
    const base = { id: c, etiqueta: humanizar(c), hablado: humanizar(c).toLowerCase() };
    if (typeof v === "boolean") propiedades.push({ ...base, tipo: "interruptor", porDefecto: v });
    else if (typeof v === "number" && Number.isFinite(v)) propiedades.push({ ...base, tipo: "numero", porDefecto: v });
    else if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) propiedades.push({ ...base, tipo: "color", porDefecto: v });
    else if (typeof v === "string" && v.length <= 200) propiedades.push({ ...base, tipo: "texto", porDefecto: v });
    else if (typeof v === "string") omitidasP.push({ id: k, motivo: "texto de más de 200 caracteres" });
    else if (typeof v === "object" && v !== null && typeof (v as { url?: unknown }).url === "string") {
      const f = porUrl.get((v as { url: string }).url);
      if (f) propiedades.push({ ...base, tipo: "fichero", porDefecto: f });
      else omitidasP.push({ id: k, motivo: `el fichero ${(v as { url: string }).url} no se trajo (mira «omitidos»)` });
    } else omitidasP.push({ id: k, motivo: "su valor no es texto, número, interruptor ni fichero" });
  }

  // the script: kept apart, marked «por portar»; only copied when its source's licence is one we take
  let portar: Portar | undefined, porPortar: InformeHyp["porPortar"];
  const motivoPortar = "escrito contra la API de Hyperfy (app, world, props, app.configure…), que no es la del motor: hay que portarlo a main.ts";
  if (!script) porPortar = { estado: "sin-script", origen: "hyperfy", motivo: "el .hyp no trae script" };
  else if (licenciaAdmitida(lic)) {
    portar = { estado: "por-portar", origen: "hyperfy", fichero: "por-portar/script.js", sha256: script.sha256, bytes: script.bytes.length, motivo: motivoPortar };
    porPortar = { estado: "por-portar", origen: "hyperfy", bytes: script.bytes.length, sha256: script.sha256, motivo: motivoPortar };
  } else {
    const motivo = `${motivoLicencia(lic)}; sigue en el .hyp (${script.bytes.length} bytes, SHA-256 ${script.sha256})`;
    portar = { estado: "omitido", origen: "hyperfy", sha256: script.sha256, bytes: script.bytes.length, motivo };
    porPortar = { estado: "omitido", origen: "hyperfy", bytes: script.bytes.length, sha256: script.sha256, motivo };
  }

  const descripcion = cortar(bp.desc, 500);
  const app: App = {
    schema: APP_ESQUEMA, id, nombre, version: "1.0.0", ...(descripcion ? { descripcion } : {}), ...(autor ? { autor } : {}), ...(fuente ? { fuente } : {}),
    licencia: lic, ...(modelo && /\.(glb|vrm)$/.test(modelo) ? { modelo } : {}), activos: listado, propiedades, eventos: [],
    ficha: { hablado: nombre.slice(0, 80), describe: (descripcion ?? `App importada de Hyperfy («${nombre}»).`).slice(0, 300) },
    ...(portar ? { portar } : {}), origen: { formato: "hyp", archivo, sha256: r.hyp.sha256, ...(typeof bp.id === "string" ? { id: bp.id.slice(0, 40) } : {}) },
  };
  const v = validarApp(app, id);
  if (!v.ok) throw new Error(`error mío: la app que salía no pasa el formato (${v.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}); no escribo nada`);

  const informe: InformeHyp = {
    formato: "informe-importacion-hyp@1", origen: { archivo, sha256: r.hyp.sha256, bytes: r.hyp.bytes }, app: { id, nombre, licencia: lic },
    traidos, omitidos, propiedades: { traidas: propiedades.map((p) => p.id), omitidas: omitidasP }, porPortar, avisos,
  };

  // written whole or not at all: a temporary folder, read back with the engine's own reader, then moved into place
  mkdirSync(o.destino, { recursive: true });
  const tmp = join(o.destino, `.${id}-nueva-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  try {
    mkdirSync(join(tmp, "assets"), { recursive: true });
    writeFileSync(join(tmp, "app.json"), JSON.stringify(app, null, 2) + "\n");
    for (const [f, b] of cuerpos) writeFileSync(join(tmp, "assets", f), b);
    if (script && portar?.estado === "por-portar") { mkdirSync(join(tmp, "por-portar")); writeFileSync(join(tmp, "por-portar", "script.js"), script.bytes); }
    writeFileSync(join(tmp, "IMPORTADO.md"), informeTexto(informe));
    const comprobada = leerApp(tmp, id);
    if (!comprobada.ok) throw new Error(`error mío: la carpeta escrita no se lee con el lector del motor (${comprobada.issues.map((i) => `${i.path}: ${i.message}`).join("; ")})`);
    if (existsSync(destinoApp)) rmSync(destinoApp, { recursive: true });
    renameSync(tmp, destinoApp);
  } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
  return informe;
}

/** The report as a short text a person reads (also written to IMPORTADO.md in the app folder). */
export function informeTexto(i: InformeHyp): string {
  const l: string[] = [`# Importado de ${i.origen.archivo}`, "", `App «${i.app.nombre}» (${i.app.id}), licencia de la fuente: ${i.app.licencia}. .hyp de ${i.origen.bytes} bytes, SHA-256 ${i.origen.sha256}; el .hyp no se ha tocado.`, ""];
  l.push(`## Traído (${i.traidos.length} fichero${i.traidos.length === 1 ? "" : "s"})`);
  for (const t of i.traidos) l.push(`- ${t.archivo} · ${t.tipo || "?"} · ${t.bytes} bytes · ${t.licencia}`);
  if (!i.traidos.length) l.push("- ninguno");
  l.push("", `## Propiedades traídas (${i.propiedades.traidas.length})`, i.propiedades.traidas.length ? i.propiedades.traidas.map((p) => `- ${p}`).join("\n") : "- ninguna");
  l.push("", "## Por portar / dejado fuera");
  if (i.porPortar.estado === "por-portar") l.push(`- **Script por portar** (${i.porPortar.bytes} bytes) en por-portar/script.js: ${i.porPortar.motivo}. Las etiquetas, rangos y tipos exactos de las propiedades viven en su app.configure: se portan con él.`);
  else if (i.porPortar.estado === "omitido") l.push(`- **Script no copiado**, por portar cuando se sepa la licencia: ${i.porPortar.motivo}`);
  else l.push("- Sin script: nada que portar.");
  for (const o of i.omitidos) l.push(`- Fichero omitido ${o.archivo} (${o.tipo || "?"}): ${o.motivo}`);
  for (const p of i.propiedades.omitidas) l.push(`- Propiedad omitida «${p.id}»: ${p.motivo}`);
  for (const a of i.avisos) l.push(`- Aviso: ${a}`);
  return l.join("\n") + "\n";
}
