// Conditions of entry (C1): a world's terms live in its own folder, aventura/condiciones.json (condiciones@1), like
// ficha.json (file over app). Layers run from the house (applies to everyone) to the community (the world's
// organisation, added on top); each layer has points, `obligatorio` (no entry without it) or optional (each its own
// consent, one purpose per point). Each point is a `norma` (the service's terms; a mandatory one closes the gate) or `datos` (an
// optional data permission: it can NEVER be mandatory, EDPB 05/2020 §39 / GDPR 7.4). `puerta` (optional) turns the server's gate on:
// see condiciones-puerta.ts (c2). No file = the house example below; a broken file = said in the log and the house
// layers are used, never a world without terms. Copies the ficha.json reader; transforms it to return layers.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AVENTURA_FICHERO_MAX } from "./aventura.ts";

export const CONDICIONES = "condiciones@1";
export const CONDICIONES_FICHERO = "condiciones.json";
export const CAPAS = ["casa", "comunidad"] as const;
/** c2: the server's gate is off by default. c3 (the bubble that lets people accept) turns it on by default. */
export const PUERTA_POR_DEFECTO = false;
/** c2: MOTOR_CONDICIONES_PUERTA — si|sí|1 = on, no|0 = off, anything else or unset = not said (the file, then the default decide). */
export function puertaDeEntorno(v: string | undefined): boolean | undefined {
  const t = (v ?? "").trim().toLowerCase();
  return ["si", "sí", "1", "true"].includes(t) ? true : ["no", "0", "false"].includes(t) ? false : undefined;
}
export type CapaId = (typeof CAPAS)[number];
export const TIPOS = ["norma", "datos"] as const;
export type TipoPunto = (typeof TIPOS)[number];
/** `tipo`: `norma` (default) can close the gate when mandatory; `datos` is a permission about data and never can. */
export interface Punto { id: string; titulo: string; texto: string; obligatorio: boolean; tipo: TipoPunto }
/** `nombre` (optional, 1–60): what the bubble calls this layer in its steps («Numen Games»); none = the page says «Las de la casa» / «Las de la comunidad». */
/** w5 `versionWeb` (optional, 1–80): the text of this layer IS what numinia.com shows at that version (e.g. «terms@1.0.1+privacy@2.1.0»). A signed
 * pass whose `acepto[capa]` says exactly that string counts this layer's NORMS as accepted (its data points are still asked). */
export interface Capa { capa: CapaId; nombre?: string; version: string; versionWeb?: string; puntos: Punto[] }
export const VERSION_WEB_MAX = 80;
/** `puerta`: the file asks for the gate (the server's own option, MOTOR_CONDICIONES_PUERTA, wins over it); none = the engine's default (off). */
export interface Condiciones { formato: typeof CONDICIONES; capas: Capa[]; puerta?: boolean }

/** The house example used when a world ships none: one mandatory point, one optional. */
export const CONDICIONES_CASA: Condiciones = {
  formato: CONDICIONES,
  capas: [{
    capa: "casa", version: "ejemplo-1",
    puntos: [
      { id: "uso", titulo: "Condiciones de uso", texto: "Texto de ejemplo: sustituir por las condiciones de la casa.", obligatorio: true, tipo: "norma" },
      { id: "informe", titulo: "Informe de la sesión", texto: "Enviar un informe anónimo de rendimiento de tu sesión.", obligatorio: false, tipo: "datos" },
    ],
  }],
};

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_PUNTOS = 20, MAX_TEXTO = 8000;

/** Check one condiciones@1 object: issues with paths, never throws. */
export function validarCondiciones(o: unknown): { ok: true; value: Condiciones } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const r = o as { formato?: unknown; capas?: unknown; puerta?: unknown } | null;
  if (!r || typeof r !== "object" || r.formato !== CONDICIONES) return { ok: false, issues: [`formato: debe ser ${CONDICIONES}`] };
  if (!Array.isArray(r.capas) || r.capas.length < 1 || r.capas.length > CAPAS.length) return { ok: false, issues: [`capas: de 1 a ${CAPAS.length}`] };
  if (r.puerta !== undefined && typeof r.puerta !== "boolean") issues.push("puerta: verdadero o falso (o quita la clave: el servidor decide)");
  const capas: Capa[] = [];
  r.capas.forEach((c: Record<string, unknown>, i: number) => {
    const p = `capas[${i}]`;
    const idx = CAPAS.indexOf(c?.capa as CapaId);
    if (idx < 0) issues.push(`${p}.capa: una de ${CAPAS.join(", ")}`);
    else if (idx !== i) issues.push(`${p}.capa: el orden es ${CAPAS.join(" → ")}`);
    if (typeof c?.version !== "string" || !c.version || c.version.length > 40) issues.push(`${p}.version: texto de 1 a 40 caracteres`);
    if (c?.nombre !== undefined && (typeof c.nombre !== "string" || !c.nombre.trim() || c.nombre.length > 60)) issues.push(`${p}.nombre: texto de 1 a 60 caracteres (o quita la clave)`);
    if (c?.versionWeb !== undefined && (typeof c.versionWeb !== "string" || !c.versionWeb.trim() || c.versionWeb.length > VERSION_WEB_MAX)) issues.push(`${p}.versionWeb: la versión de las condiciones de numinia.com que este texto reproduce, de 1 a ${VERSION_WEB_MAX} caracteres (o quita la clave)`);
    const ps = c?.puntos;
    if (!Array.isArray(ps) || ps.length < 1 || ps.length > MAX_PUNTOS) { issues.push(`${p}.puntos: de 1 a ${MAX_PUNTOS}`); return; }
    const vistos = new Set<string>();
    const puntos: Punto[] = [];
    ps.forEach((x: Record<string, unknown>, j: number) => {
      const q = `${p}.puntos[${j}]`;
      if (typeof x?.id !== "string" || !ID.test(x.id)) issues.push(`${q}.id: minúsculas, números y guiones`);
      else if (vistos.has(x.id)) issues.push(`${q}.id: repetido`);
      else vistos.add(x.id);
      if (typeof x?.titulo !== "string" || !x.titulo || x.titulo.length > 120) issues.push(`${q}.titulo: de 1 a 120 caracteres`);
      if (typeof x?.texto !== "string" || !x.texto || x.texto.length > MAX_TEXTO) issues.push(`${q}.texto: de 1 a ${MAX_TEXTO} caracteres`);
      if (typeof x?.obligatorio !== "boolean") issues.push(`${q}.obligatorio: verdadero o falso`);
      if (x?.tipo !== undefined && !TIPOS.includes(x.tipo as TipoPunto)) issues.push(`${q}.tipo: "norma" (por defecto) o "datos"`);
      const tipo: TipoPunto = x?.tipo === "datos" ? "datos" : "norma";
      // EDPB 05/2020 §39 / GDPR 7.4: entering cannot depend on a data permission. The fix is one of the two edits named here.
      if (tipo === "datos" && x?.obligatorio === true) issues.push(`${q}.obligatorio: un punto de datos nunca puede ser obligatorio (rechazarlo no puede cerrar la puerta). Pon "obligatorio": false; o, si es una norma del servicio y no un permiso sobre datos, pon "tipo": "norma"`);
      puntos.push({ id: String(x?.id), titulo: String(x?.titulo), texto: String(x?.texto), obligatorio: x?.obligatorio === true, tipo });
    });
    capas.push({ capa: CAPAS[Math.max(idx, 0)], ...(typeof c?.nombre === "string" ? { nombre: c.nombre.trim() } : {}), version: String(c?.version), ...(typeof c?.versionWeb === "string" ? { versionWeb: c.versionWeb.trim() } : {}), puntos });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: { formato: CONDICIONES, capas, ...(typeof r.puerta === "boolean" ? { puerta: r.puerta } : {}) } };
}

/** The world's conditions: its file, or the house example. `problemas` says why a file was not used. */
export function leerCondiciones(dir: string | null): { condiciones: Condiciones; deFichero: boolean; problemas: string[] } {
  const casa = { condiciones: CONDICIONES_CASA, deFichero: false };
  if (!dir) return { ...casa, problemas: [] };
  const p = join(dir, CONDICIONES_FICHERO);
  let texto: string;
  try {
    const st = statSync(p);
    if (!st.isFile()) return { ...casa, problemas: [`${CONDICIONES_FICHERO}: no es un fichero`] };
    if (st.size > AVENTURA_FICHERO_MAX) return { ...casa, problemas: [`${CONDICIONES_FICHERO}: más de ${AVENTURA_FICHERO_MAX} bytes`] };
    texto = readFileSync(p, "utf8");
  } catch { return { ...casa, problemas: [] }; } // no file: the house example
  let o: unknown;
  try { o = JSON.parse(texto); } catch (e) { return { ...casa, problemas: [`${CONDICIONES_FICHERO}: JSON roto (${(e as Error).message})`] }; }
  const r = validarCondiciones(o);
  return r.ok ? { condiciones: r.value, deFichero: true, problemas: [] } : { ...casa, problemas: r.issues.map((i) => `${CONDICIONES_FICHERO}: ${i}`) };
}
