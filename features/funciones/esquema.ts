// funciones — the file format `numinia-engine/funciones@1` (f1): the world's feature switches. Pure: no engine, no DOM.
// { "schema": "numinia-engine/funciones@1", "normas": false, "dardos": true, "pesca": true, "nadar": false } — every key optional; a key that is not there
// says nothing (the world keeps what it does today). `normas` is the gate of the conditions of entry and, when it is there, it beats the
// `puerta` of aventura/condiciones.json (the environment's MOTOR_CONDICIONES_PUERTA and startServer's `condicionesPuerta` still beat it).
// An unknown key or a non-boolean value is an issue that says how to fix it (never thrown); a wrong file is not used.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { FUNCIONES } from "./feature.ts";
import type { Funcion } from "./feature.ts";

export const ESQUEMA = "numinia-engine/funciones@1";
export const FICHERO = "funciones.json";
/** What the file says, per function; a function not named is absent (= unchanged from today). */
export type FuncionesMundo = Partial<Record<Funcion, boolean>>;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function leerFunciones(json: unknown): Result<FuncionesMundo> {
  if (!obj(json)) return { ok: false, issues: [{ path: "funciones", message: `un objeto JSON, p. ej. { "schema": "${ESQUEMA}", "normas": false }` }] };
  const issues: Issue[] = [], v: FuncionesMundo = {};
  for (const k of Object.keys(json)) if (k !== "schema" && !(FUNCIONES as readonly string[]).includes(k)) issues.push({ path: `funciones.${k}`, message: `clave desconocida: quítala o corrige el nombre (las claves son: ${FUNCIONES.join(", ")})` });
  if (json.schema !== undefined && json.schema !== ESQUEMA) issues.push({ path: "funciones.schema", message: `debe ser "${ESQUEMA}" (o no estar)` });
  for (const f of FUNCIONES) {
    const x = json[f];
    if (x === undefined) continue;
    if (typeof x === "boolean") v[f] = x; else issues.push({ path: `funciones.${f}`, message: "true o false (true enciende la función, false la apaga)" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v };
}

/** The file after a switch: the world's own keys verbatim with ONE function changed; no file = the smallest one. null = not an object. Pure. */
export function conFuncion(crudo: unknown, funcion: Funcion, activa: boolean): Record<string, unknown> | null {
  if (crudo === undefined) return { schema: ESQUEMA, [funcion]: activa };
  if (!obj(crudo)) return null;
  return { ...crudo, [funcion]: activa };
}
