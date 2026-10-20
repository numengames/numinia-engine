// espacio-base — the file format `numinia-engine/espacio-base@1`: how a world turns the «espacio base» on (H2). Pure: no engine, no DOM.
// The espacio base is the place every character is born in: an EMPTY world (no grass, trees or fauna) whose ground is a luminous line mesh over
// near-black, a night with stars and moon by default (day and night are the ENGINE's: entorno's clock, not a key here). Every key is optional (the file's presence is the switch: `activa` defaults to true);
// an unknown key or a wrong value is an issue that says how to fix it (never thrown). A wrong file is not used (features/mundo.ts logs why).
import type { Issue, Result } from "../../packages/core/src/index.ts";

export const ESQUEMA = "numinia-engine/espacio-base@1";
/** The validated world, flat, as it travels (the state's fields). */
export type EspacioBaseMundo = { activa: boolean; semilla: number; objeto: string | null };
/** H5: the model the espacio base is born with (a house-library id, features/objetos/biblioteca.json): the Logo Khepri. `objeto: null` = none. */
export const OBJETO_DEFECTO = "logo-khepri";
/** What a file that says nothing gets (kept equal to packages/render/src/espacio-base/espacio-base.ts `DEFECTOS_ESPACIO_BASE`; a test compares). */
export const DEFECTOS: EspacioBaseMundo = { activa: true, semilla: 1234, objeto: OBJETO_DEFECTO };
const CLAVES = ["schema", "activa", "semilla", "objeto"];
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function leerEspacioBase(json: unknown): Result<EspacioBaseMundo> {
  if (!obj(json)) return { ok: false, issues: [{ path: "espacio-base", message: `un objeto JSON, p. ej. { "schema": "${ESQUEMA}", "activa": true, "semilla": 1234 }` }] };
  const issues: Issue[] = [], v: EspacioBaseMundo = { ...DEFECTOS };
  for (const k of Object.keys(json)) if (!CLAVES.includes(k)) issues.push({ path: `espacio-base.${k}`, message: `clave desconocida: quítala o corrige el nombre (las claves son: ${CLAVES.filter((c) => c !== "schema").join(", ")})` });
  if (json.schema !== undefined && json.schema !== ESQUEMA) issues.push({ path: "espacio-base.schema", message: `debe ser "${ESQUEMA}" (o no estar)` });
  if (json.activa !== undefined) { if (typeof json.activa === "boolean") v.activa = json.activa; else issues.push({ path: "espacio-base.activa", message: "true o false (false apaga el espacio base y deja el suelo plano)" }); }
  if (json.semilla !== undefined) {
    const s = json.semilla;
    if (typeof s === "number" && Number.isInteger(s) && s >= 0 && s <= 2147483647) v.semilla = s;
    else issues.push({ path: "espacio-base.semilla", message: "un número entero entre 0 y 2147483647 (mismo número = mismo relieve; la meseta del centro es llana para todos)" });
  }
  if (json.objeto !== undefined) {
    if (json.objeto === null) v.objeto = null;
    else if (typeof json.objeto === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(json.objeto)) v.objeto = json.objeto;
    else issues.push({ path: "espacio-base.objeto", message: "el id de un modelo de la biblioteca de la casa (p. ej. \"logo-khepri\"), o null para no poner ninguno" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v };
}
