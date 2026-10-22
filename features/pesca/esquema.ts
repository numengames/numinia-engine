// pesca — the `peces` list of a world's pesca.json (numinia-engine/pesca@1): a world brings its OWN fish table and it
// REPLACES the house one (features/pesca/peces.json) for that world. Pure: no engine, no DOM. Read by features/mundo.ts.
// A file WITH `peces` is read strictly (like naturaleza.json): an unknown key, a wrong value, more than PECES_MAX fish or a
// name that does not fit is an issue that says how to fix it (never thrown) and the whole pesca.json is NOT used (the world
// keeps the house pond and the house fish; mundo.ts logs why). A file WITHOUT `peces` is not read here: it behaves as always.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { RAREZAS } from "./feature.ts";
import type { Pez } from "./server.ts";
import tabla from "./peces.json" with { type: "json" };

export const ESQUEMA = "numinia-engine/pesca@1";
/** How many fish a world's table may hold, how long a name may be (characters; and 40 bytes on the wire), and the id charset. */
export const PECES_MAX = 40, NOMBRE_MAX = 32, NOMBRE_BYTES = 40;
const ID = /^[a-z0-9-]{1,32}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const CLAVES_ARCHIVO = ["schema", "sitios", "peces", "notas"]; // `notas`: a line for whoever edits the file (worlds already carry one); never read
const CLAVES_PEZ = ["id", "nombre", "rareza", "peso", "cm", "color", "fuerza", "heft", "aguante", "arrancadas"];
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** What a fish that does not say its fight numbers gets: those of the house fish of its rarity (Carpa, Trucha, Lucio). */
export const LUCHA_POR_RAREZA: Record<(typeof RAREZAS)[number], Pick<Pez, "fuerza" | "heft" | "aguante" | "arrancadas">> = Object.fromEntries(
  (tabla as { peces: Pez[] }).peces.map((p) => [p.rareza, { fuerza: p.fuerza, heft: p.heft, aguante: p.aguante, arrancadas: p.arrancadas }]),
) as never;

const rango = (v: unknown, min: number, max: number): v is number => num(v) && v >= min && v <= max;
const par = (v: unknown, min: number, max: number, estricto: boolean): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && rango(v[0], min, max) && rango(v[1], min, max) && (estricto ? v[0] < v[1] : v[0] <= v[1]);

/** Reads `peces` of a pesca.json. Pass the whole parsed file. `ok` carries the table in the engine's shape, ready for `crearPesca({ peces })`. */
export function leerPeces(json: unknown): Result<Pez[]> {
  if (!obj(json)) return { ok: false, issues: [{ path: "pesca", message: `un objeto JSON, p. ej. { "schema": "${ESQUEMA}", "peces": [{ "id": "carpa", "nombre": "Carpa", "rareza": "comun", "peso": 70, "cm": [22, 60] }] }` }] };
  const issues: Issue[] = [], lista: Pez[] = [];
  const falta = (path: string, message: string) => issues.push({ path, message });
  for (const k of Object.keys(json)) if (!CLAVES_ARCHIVO.includes(k)) falta(`pesca.${k}`, `clave desconocida: quítala o corrige el nombre (las claves son: ${CLAVES_ARCHIVO.filter((c) => c !== "schema").join(", ")})`);
  if (json.notas !== undefined && typeof json.notas !== "string") falta("pesca.notas", "un texto (una nota para quien edite el fichero) o quítala");
  if (json.schema !== undefined && json.schema !== ESQUEMA) falta("pesca.schema", `debe ser "${ESQUEMA}" (o no estar)`);
  const crudos = json.peces;
  if (!Array.isArray(crudos)) return { ok: false, issues: [...issues, { path: "pesca.peces", message: "una lista de peces: [{ id, nombre, rareza, peso, cm }, …]" }] };
  if (crudos.length === 0) falta("pesca.peces", "la lista está vacía: pon al menos un pez (o quita `peces` para usar los de la casa)");
  if (crudos.length > PECES_MAX) falta("pesca.peces", `como mucho ${PECES_MAX} peces (hay ${crudos.length})`);
  const vistos = new Set<string>();
  crudos.slice(0, PECES_MAX).forEach((c, i) => {
    const r = `pesca.peces[${i}]`;
    if (!obj(c)) return falta(r, "un objeto { id, nombre, rareza, peso, cm }");
    for (const k of Object.keys(c)) if (!CLAVES_PEZ.includes(k)) falta(`${r}.${k}`, `clave desconocida: quítala o corrige el nombre (las claves son: ${CLAVES_PEZ.join(", ")})`);
    const antes = issues.length;
    if (typeof c.id !== "string" || !ID.test(c.id)) falta(`${r}.id`, "de 1 a 32 caracteres: minúsculas sin tilde, cifras y guion (p. ej. \"pez-merlin\")");
    else if (vistos.has(c.id)) falta(`${r}.id`, `«${c.id}» está repetido: cada pez tiene su id`);
    else vistos.add(c.id);
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (!nombre) falta(`${r}.nombre`, "el nombre que ve quien lo pesca (texto no vacío)");
    else if ([...nombre].length > NOMBRE_MAX) falta(`${r}.nombre`, `como mucho ${NOMBRE_MAX} caracteres (tiene ${[...nombre].length})`);
    else if (new TextEncoder().encode(nombre).length > NOMBRE_BYTES) falta(`${r}.nombre`, `ocupa más de ${NOMBRE_BYTES} bytes (las tildes y los emojis pesan más): acórtalo`);
    if (!(RAREZAS as readonly unknown[]).includes(c.rareza)) falta(`${r}.rareza`, `una de: ${RAREZAS.join(", ")}`);
    if (!rango(c.peso, 0.01, 1000)) falta(`${r}.peso`, "un número entre 0,01 y 1000 (más = más común al echar a suertes)");
    if (!par(c.cm, 1, 500, true)) falta(`${r}.cm`, "[mínimo, máximo] en cm, entre 1 y 500, con el mínimo menor que el máximo");
    if (c.color !== undefined && !(typeof c.color === "string" && COLOR.test(c.color))) falta(`${r}.color`, 'un color en hexadecimal de seis cifras, p. ej. "#3758E9"');
    if (c.fuerza !== undefined && !rango(c.fuerza, 0.1, 2.5)) falta(`${r}.fuerza`, "un número entre 0,1 y 2,5 (cuánto tira)");
    if (c.heft !== undefined && !rango(c.heft, 0.2, 4)) falta(`${r}.heft`, "un número entre 0,2 y 4 (cuánto cuesta acercarlo)");
    if (c.aguante !== undefined && !rango(c.aguante, 3, 50)) falta(`${r}.aguante`, "segundos entre 3 y 50 hasta que se cansa");
    if (c.arrancadas !== undefined && !par(c.arrancadas, 0.5, 30, false)) falta(`${r}.arrancadas`, "[mínimo, máximo] en segundos entre arrancadas, entre 0,5 y 30");
    if (issues.length > antes) return;
    const lucha = LUCHA_POR_RAREZA[c.rareza as (typeof RAREZAS)[number]];
    lista.push({
      id: c.id as string, nombre, rareza: c.rareza as Pez["rareza"], peso: c.peso as number, cm: c.cm as [number, number],
      ...(c.color === undefined ? {} : { color: (c.color as string).toUpperCase() }),
      fuerza: (c.fuerza as number | undefined) ?? lucha.fuerza, heft: (c.heft as number | undefined) ?? lucha.heft,
      aguante: (c.aguante as number | undefined) ?? lucha.aguante, arrancadas: (c.arrancadas as [number, number] | undefined) ?? lucha.arrancadas,
    });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: lista };
}
