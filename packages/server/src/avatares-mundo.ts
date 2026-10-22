// avatares-mundo (E3): a world brings its OWN avatars in its zip and its people pick them in that world only.
//   entorno/avatares.json   { "schema": "numinia-engine/avatares-mundo@1", "avatares": [{ id, nombre, sha256, licencia, credito, miniatura? }] }
//   datos/activos/<sha256>.vrm (+ <sha256>.png|jpg|webp for the thumbnail)   the files, by content, exactly like any other upload (H9)
// Nothing new travels or is served: the zip already carries datos/activos/ and entorno/*.json (mundo-zip.ts), and /a/<sha256>.vrm
// serves them from THIS world's folder only. This file says which of those uploads are «the world's avatars» and under what licence.
// Licences (AGENTS.md rule 3): CC0, or CC BY with a non-empty `credito` the picker shows beside the avatar. The VRM's own licence
// metadata is read, never rewritten, and must say the same as the list (a CC BY file cannot be listed as CC0). The house catalogue
// (activos/avatares/catalogo.json) stays CC0-only: it travels to every world, these do not.
// Each wrong line is left out with its reason (the rest is used); a missing file = the world as always. At most AVATARES_MUNDO_MAX,
// each at most TRIANGULOS_MAX_VRM triangles and TOPES_MB.vrm. Validation returns Result-like values and never throws.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Issue } from "../../core/src/index.ts";
import { comprobarFichero, TOPES_MB } from "../../net/src/ficheros.ts";
import { infoVrm, revisarAvatarDelMundo, TRIANGULOS_MAX_VRM } from "./vrm.ts";
import type { LicenciaMundo } from "./vrm.ts";

export const ESQUEMA_AVATARES_MUNDO = "numinia-engine/avatares-mundo@1";
/** Most avatars one world carries: every one is a file a visitor may download and the cap on how many VRMs a page keeps. */
export const AVATARES_MUNDO_MAX = 8;
export const NOMBRE_MAX = 40, CREDITO_MAX = 240;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MINIATURA = /^([0-9a-f]{64})\.(png|jpg|webp)$/;
/** What a world may write as the licence: CC0, or CC BY (any version written as «CC-BY» or «CC-BY-4.0»; the deed is 4.0). */
const LICENCIAS: Record<string, LicenciaMundo> = { "CC0": "CC0", "CC-BY": "CC-BY", "CC-BY-4.0": "CC-BY" };

/** What /status tells the page about one world avatar (the page builds /a/<sha256>.vrm and /a/<miniatura> from these). */
export type AvatarMundo = { id: string; nombre: string; sha256: string; licencia: string; credito: string; triangulos: number; miniatura?: string };
export type LeidoAvataresMundo = { lista: AvatarMundo[]; problemas: Issue[] };
/** A file this server has under a hash: its size first (a file over the cap is never read), its bytes when asked. */
export type Archivo = { bytes: number; leer(): Uint8Array };

const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && new TextEncoder().encode(v.trim()).length <= max ? v.trim() : null);
const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * Reads entorno/avatares.json. `crudo` = its parsed JSON (undefined = no file); `archivoDe(sha, ext)` = the file this server
 * has under that hash (the world's datos/activos/ or the house library), or null. Pure given those two: tests pass both.
 */
export function leerAvataresMundo(crudo: unknown, archivoDe: (sha256: string, ext: string) => Archivo | null): LeidoAvataresMundo {
  const problemas: Issue[] = [], lista: AvatarMundo[] = [];
  if (crudo === undefined) return { lista, problemas };
  const raiz = crudo as { schema?: unknown; avatares?: unknown } | null;
  if (!raiz || typeof raiz !== "object" || Array.isArray(raiz)) return { lista, problemas: [{ path: "avatares.json", message: "debe ser un objeto { schema, avatares: [...] }" }] };
  if (raiz.schema !== ESQUEMA_AVATARES_MUNDO) problemas.push({ path: "avatares.json.schema", message: `debe ser «${ESQUEMA_AVATARES_MUNDO}»` });
  if (!Array.isArray(raiz.avatares)) return { lista, problemas: [...problemas, { path: "avatares.json.avatares", message: "debe ser una lista de avatares" }] };
  const ids = new Set<string>(), vistos = new Set<string>();
  raiz.avatares.forEach((a: unknown, i) => {
    const en = `avatares[${i}]`, mal = (campo: string, m: string) => { problemas.push({ path: `${en}.${campo}`, message: `${m} (este avatar no se ofrece)` }); };
    if (!a || typeof a !== "object" || Array.isArray(a)) return mal("", "debe ser un objeto");
    const x = a as Record<string, unknown>;
    if (lista.length >= AVATARES_MUNDO_MAX) return mal("", `un mundo lleva como mucho ${AVATARES_MUNDO_MAX} avatares`);
    if (typeof x.id !== "string" || !ID.test(x.id)) return mal("id", "«a-z0-9-», hasta 32 caracteres, empieza por letra o cifra");
    if (ids.has(x.id)) return mal("id", `«${x.id}» está repetido`);
    const nombre = texto(x.nombre, NOMBRE_MAX);
    if (!nombre) return mal("nombre", `texto de 1 a ${NOMBRE_MAX} bytes`);
    if (typeof x.sha256 !== "string" || !SHA256.test(x.sha256)) return mal("sha256", "los 64 hexadecimales del .vrm (el nombre que tiene en datos/activos/)");
    if (vistos.has(x.sha256)) return mal("sha256", "ese fichero ya está en la lista con otro id");
    const licencia = typeof x.licencia === "string" ? LICENCIAS[x.licencia] : undefined;
    if (!licencia) return mal("licencia", "«CC0» o «CC-BY-4.0» (un mundo no lleva otras)");
    const credito = x.credito === undefined ? "" : texto(x.credito, CREDITO_MAX);
    if (credito === null) return mal("credito", `texto de hasta ${CREDITO_MAX} bytes`);
    if (licencia === "CC-BY" && !credito) return mal("credito", "CC BY exige el crédito: quién es el autor y qué se ha cambiado, tal como se verá junto al avatar");
    // the file: by its content, at most the engine's VRM cap, a VRM, ≤ 10,000 triangles, and its own licence says what the list says
    const fichero = archivoDe(x.sha256, "vrm");
    if (!fichero) return mal("sha256", `el servidor no tiene ${x.sha256}.vrm: ponlo en datos/activos/ del mundo (viaja en el zip)`);
    if (fichero.bytes > TOPES_MB.vrm * 1024 * 1024) return mal("sha256", `el .vrm pasa de ${TOPES_MB.vrm} MB`);
    const bytes = fichero.leer();
    if (sha256Hex(bytes) !== x.sha256) return mal("sha256", "el contenido del fichero no es el de su nombre (sha256)");
    const forma = comprobarFichero("vrm", bytes);
    if (!forma.ok) return mal("sha256", `el .vrm no vale: ${forma.issues[0]?.message ?? "fichero roto"}`);
    const info = infoVrm(bytes);
    if (!info.ok) return mal("sha256", `no es un VRM: ${info.issues[0]?.message ?? "fichero roto"}`);
    const revision = revisarAvatarDelMundo(info.value, licencia, TRIANGULOS_MAX_VRM);
    if (revision.length) return mal("sha256", revision[0].message);
    // the thumbnail is optional: a wrong or absent one costs the picture, never the avatar
    let miniatura: string | undefined;
    if (x.miniatura !== undefined) {
      const m = typeof x.miniatura === "string" ? MINIATURA.exec(x.miniatura) : null;
      if (!m) problemas.push({ path: `${en}.miniatura`, message: "«<sha256>.png|jpg|webp» de una imagen que ya está en el servidor (se ofrece sin miniatura)" });
      else {
        const imagen = archivoDe(m[1], m[2]);
        if (!imagen) problemas.push({ path: `${en}.miniatura`, message: `el servidor no tiene ${x.miniatura} (se ofrece sin miniatura)` });
        else if (imagen.bytes > TOPES_MB[m[2]] * 1024 * 1024 || sha256Hex(imagen.leer()) !== m[1]) problemas.push({ path: `${en}.miniatura`, message: "demasiado grande o no es el de su nombre (se ofrece sin miniatura)" });
        else miniatura = x.miniatura as string;
      }
    }
    ids.add(x.id); vistos.add(x.sha256);
    lista.push({ id: x.id, nombre, sha256: x.sha256, licencia: x.licencia as string, credito: credito ?? "", triangulos: info.value.triangulos, ...(miniatura ? { miniatura } : {}) });
  });
  return { lista, problemas };
}

/** The composition root's reader: `leer` = the world's entorno/ reader (mundo.ts leerMundo), `buscar` = Activos.buscar (a path or null).
 * Logs every problem and what is offered; returns what /status publishes (empty = nothing to publish, the world as always). */
export function avataresDelMundo(leer: (fichero: string) => unknown, buscar: (hash: string, ext: string) => string | null, log: (l: string) => void = () => {}): AvatarMundo[] {
  const archivoDe = (sha: string, ext: string): Archivo | null => {
    const ruta = buscar(sha, ext);
    if (!ruta) return null;
    try { return { bytes: statSync(ruta).size, leer: () => { try { return new Uint8Array(readFileSync(ruta)); } catch { return new Uint8Array(0); } } }; } catch { return null; }
  };
  const r = leerAvataresMundo(leer("avatares.json"), archivoDe);
  for (const p of r.problemas) log(`[avatares] avatares.json: ${p.path}: ${p.message}`);
  if (r.lista.length) log(`[avatares] el mundo ofrece ${r.lista.length} avatar${r.lista.length === 1 ? "" : "es"} propio${r.lista.length === 1 ? "" : "s"}: ${r.lista.map((a) => `${a.nombre} (${a.licencia})`).join(", ")}`);
  return r.lista;
}
