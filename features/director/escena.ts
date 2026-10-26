// director — the scene file format (escena@1, N6). Pure: no engine, no DOM; never throws. An adventure ships its
// scenes as `aventura/escenas/<id>.json`; the id is the file's name. A scene is a look (one of the house presets and/or
// a partial entorno@1 over the world's own environment, never the ground) plus an optional line of narration.
//
//   { "schema": "numinia-engine/escena@1", "nombre": "La taberna", "preset": "atardecer",
//     "entorno": { "niebla": { "cerca": 8, "lejos": 60 } }, "narracion": "Huele a vino especiado.",
//     "ambiente": "ambiente-numinia", "ambiente_ganancia": 0.1 }
//
// Its map (the tabletop): `"mapa": { "obra": "<sha256>.png", "titulo": "La cripta", "hueco": "El mapa de la mesa" }` puts that picture (already
// uploaded to the server, png/jpg/webp) into a hole of the world (a picture a builder turned into a frame: objetos `hueco`) the moment the
// scene is put; `"obra": ""` empties the hole (its card comes back). `hueco` is the hole's id or exact name; without it, the zone's only hole.
// A scene without `mapa` leaves the map as it is. Nothing else is touched: the hole is the builder's piece, the scene only fills it.
//
// Its sound: `ambiente` is the id of a looping file of the sound catalogue that replaces the world's own bed while the scene
// is on (`""` = that scene is silent); a scene without it gives the world's own bed back. `ambiente_ganancia` is its volume (×0…4).
//
// The look is applied by features/entorno (event `aplicar`): world's entorno.json → preset → the scene's entorno, so
// changing from one scene to another never keeps leftovers of the first.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { validarEntorno } from "../entorno/esquema.ts";
import { PRESETS } from "../entorno/feature.ts";
import { AMBIENTE_MUNDO, AMBIENTE_SILENCIO, ESCENAS_MAX, GANANCIA_DEF, GANANCIA_MAX, ID_MAX, NARRACION_MAX, NOMBRE_MAX } from "./feature.ts";

export const ESQUEMA_ESCENA = "numinia-engine/escena@1";
/** The scene's environment travels to features/entorno as compact JSON in one 512-byte field. */
export const ENTORNO_JSON_MAX = 512;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ID_SONIDO = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const OBRA = /^([0-9a-f]{64})\.(png|jpg|webp)$/;
const HUECO_MAX = 64, TITULO_MAX = NOMBRE_MAX;

/** A scene's map: the work to put in a hole (`modelo`/`ext` empty = empty the hole). `hueco` empty = the zone's only hole. */
export type MapaEscena = { hueco: string; modelo: string; ext: string; titulo: string };
export type Escena = { id: string; nombre: string; preset: string; entorno: string; narracion: string; casa: boolean; ambiente: string; ganancia: number; mapa?: MapaEscena };
/* `ambiente`: "" = the world's own bed, "-" = silence, else a catalogue id; `ganancia`: -1 = the default volume (see feature.ts). */

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The id a file gives its scene: «taberna.json» → «taberna». null when the name is not a valid id. */
export function idDeFichero(fichero: string): string | null {
  const id = fichero.replace(/^.*\//, "").replace(/\.json$/i, "").toLowerCase();
  return ID.test(id) && id.length <= ID_MAX ? id : null;
}

/** Check one scene file. Errors come with their path in the file («escena.entorno.niebla.lejos») and how to fix it. */
export function leerEscena(fichero: string, texto: string): Result<Escena> {
  const issues: Issue[] = [];
  const id = idDeFichero(fichero);
  if (!id) issues.push({ path: fichero, message: `el nombre del fichero es el id de la escena: 1-${ID_MAX} letras minúsculas sin acentos, cifras o guiones, p. ej. «taberna.json»` });
  let json: unknown;
  try { json = JSON.parse(texto); } catch (e) { return { ok: false, issues: [...issues, { path: fichero, message: `no es JSON válido: ${(e as Error).message}` }] }; }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, issues: [...issues, { path: "escena", message: `un objeto JSON con "schema": "${ESQUEMA_ESCENA}"` }] };
  const j = json as Record<string, unknown>;
  if (j.schema !== ESQUEMA_ESCENA) issues.push({ path: "escena.schema", message: `debe ser "${ESQUEMA_ESCENA}"` });
  const nombre = typeof j.nombre === "string" ? j.nombre.trim() : "";
  if (!nombre || bytes(nombre) > NOMBRE_MAX) issues.push({ path: "escena.nombre", message: `el nombre que ve quien dirige, 1-${NOMBRE_MAX} bytes, p. ej. "La taberna"` });
  const preset = j.preset === undefined ? "" : j.preset;
  if (typeof preset !== "string" || (preset !== "" && !(PRESETS as readonly string[]).includes(preset))) issues.push({ path: "escena.preset", message: `uno de los entornos de la casa: ${PRESETS.join(", ")} (o quítalo)` });
  let entorno = "";
  if (j.entorno !== undefined) {
    const e = j.entorno;
    if (typeof e !== "object" || e === null || Array.isArray(e)) issues.push({ path: "escena.entorno", message: "un entorno@1 parcial: { \"niebla\": { … }, \"sol\": { … }, … }" });
    else {
      if ("suelo" in e) issues.push({ path: "escena.entorno.suelo", message: "una escena no cambia el suelo (es del mundo): quítalo" });
      if ("aparicion" in e) issues.push({ path: "escena.entorno.aparicion", message: "una escena no cambia dónde aparece la gente: quítalo" });
      if ("mapa" in e) issues.push({ path: "escena.entorno.mapa", message: "una escena no corta el mapa (es del mundo): quítalo" });
      const { schema: _s, ...resto } = e as Record<string, unknown>;
      const r = validarEntorno(resto);
      if (!r.ok) for (const i of r.issues) issues.push({ path: `escena.${i.path}`, message: i.message });
      entorno = JSON.stringify(resto);
      if (bytes(entorno) > ENTORNO_JSON_MAX) issues.push({ path: "escena.entorno", message: `demasiado largo (${bytes(entorno)} bytes en JSON compacto; caben ${ENTORNO_JSON_MAX}): deja solo lo que la escena cambia, o pon un preset` });
    }
  }
  let ambiente: string = AMBIENTE_MUNDO, ganancia = GANANCIA_DEF;
  if (j.ambiente !== undefined) {
    if (typeof j.ambiente !== "string" || (j.ambiente !== "" && !ID_SONIDO.test(j.ambiente))) issues.push({ path: "escena.ambiente", message: 'el id de un sonido en bucle del catálogo (minúsculas, cifras, guiones; p. ej. "ambiente-numinia") o "" para que esta escena no tenga ambiente' });
    else ambiente = j.ambiente === "" ? AMBIENTE_SILENCIO : j.ambiente;
  }
  if (j.ambiente_ganancia !== undefined) {
    const g = j.ambiente_ganancia;
    if (typeof g !== "number" || !Number.isFinite(g) || g < 0 || g > GANANCIA_MAX) issues.push({ path: "escena.ambiente_ganancia", message: `un volumen entre 0 y ${GANANCIA_MAX} (×; 1 = el del fichero)` });
    else if (j.ambiente === undefined) issues.push({ path: "escena.ambiente_ganancia", message: 'solo vale junto a "ambiente" (el id del sonido al que sube o baja)' });
    else ganancia = Math.round(g * 1000) / 1000;
  }
  let mapa: MapaEscena | undefined;
  if (j.mapa !== undefined) {
    const m = j.mapa;
    if (typeof m !== "object" || m === null || Array.isArray(m)) issues.push({ path: "escena.mapa", message: 'un objeto: { "obra": "<sha256>.png", "titulo": "La cripta" } ("obra": "" vacía el hueco)' });
    else {
      const o = m as Record<string, unknown>;
      for (const k of Object.keys(o)) if (!["obra", "titulo", "hueco"].includes(k)) issues.push({ path: `escena.mapa.${k}`, message: 'campo desconocido (hay: obra, titulo, hueco)' });
      const obra = o.obra;
      const ok = typeof obra === "string" && (obra === "" || OBRA.test(obra));
      if (!ok) issues.push({ path: "escena.mapa.obra", message: 'la imagen del mapa, ya subida al servidor: "<64 hex del sha256>.png" (o .jpg, .webp); "" para vaciar el hueco' });
      const titulo = o.titulo === undefined ? "" : o.titulo;
      if (typeof titulo !== "string" || bytes(titulo.trim()) > TITULO_MAX) issues.push({ path: "escena.mapa.titulo", message: `el título de la obra, hasta ${TITULO_MAX} bytes (o quítalo)` });
      const hueco = o.hueco === undefined ? "" : o.hueco;
      if (typeof hueco !== "string" || bytes(hueco.trim()) > HUECO_MAX) issues.push({ path: "escena.mapa.hueco", message: `el id o el nombre exacto del hueco, hasta ${HUECO_MAX} bytes (o quítalo: vale el único hueco de la zona)` });
      if (ok && typeof titulo === "string" && typeof hueco === "string") {
        const mm = typeof obra === "string" ? OBRA.exec(obra) : null;
        mapa = { hueco: hueco.trim(), modelo: mm ? mm[1] : "", ext: mm ? mm[2] : "", titulo: titulo.trim() };
      }
    }
  }
  if (preset === "" && entorno === "" && !mapa) issues.push({ path: "escena", message: "una escena necesita un \"preset\" o un \"entorno\" (o los dos; o solo un \"mapa\")" });
  const narracion = j.narracion === undefined ? "" : j.narracion;
  if (typeof narracion !== "string" || bytes(narracion.trim()) > NARRACION_MAX) issues.push({ path: "escena.narracion", message: `una línea de hasta ${NARRACION_MAX} bytes (o quítala)` });
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { id: id!, nombre, preset: String(preset), entorno, narracion: String(narracion).trim(), casa: false, ambiente, ganancia, ...(mapa ? { mapa } : {}) } };
}

/** The house presets as scenes anyone directing can put in any world (`/escena noche`). */
export const ESCENAS_CASA: readonly Escena[] = PRESETS.map((p) => ({ id: p, nombre: p[0].toUpperCase() + p.slice(1), preset: p, entorno: "", narracion: "", casa: true, ambiente: AMBIENTE_MUNDO, ganancia: GANANCIA_DEF }));

/** An adventure's scenes: every file checked; a wrong one is left out and logged with its path. Sorted by file name;
 * at most ESCENAS_MAX. */
export function cargarEscenas(ficheros: readonly { fichero: string; texto: string }[], log: (l: string) => void = () => {}): Escena[] {
  const out: Escena[] = [];
  for (const f of [...ficheros].sort((a, b) => a.fichero.localeCompare(b.fichero))) {
    if (!/\.json$/i.test(f.fichero)) continue;
    const r = leerEscena(f.fichero, f.texto);
    if (!r.ok) { log(`[director] escenas/${f.fichero.replace(/^.*\//, "")} no se usa: ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); continue; }
    if (out.length >= ESCENAS_MAX) { log(`[director] más de ${ESCENAS_MAX} escenas: ${f.fichero} y las siguientes no se usan`); break; }
    out.push(r.value);
  }
  return out;
}

/** Find a scene by what a person types: its id, its name (any case, accents too), or its number in the list (1…). */
export function buscarEscena(escenas: readonly Escena[], texto: string): Escena | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= escenas.length) return escenas[n - 1];
  const sin = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return escenas.find((e) => e.id === t) ?? escenas.find((e) => sin(e.id) === sin(t)) ?? escenas.find((e) => sin(e.nombre) === sin(t)) ?? null;
}
