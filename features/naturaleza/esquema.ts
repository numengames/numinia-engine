// naturaleza — the file format `numinia-engine/naturaleza@1`: how a world turns the low-poly nature on. Pure: no engine, no DOM.
// Every key is optional (the file's presence is the switch: `activa` defaults to true); an unknown key or a wrong value is an
// issue that says how to fix it (never thrown). A wrong file is not used: the world keeps the flat ground (features/mundo.ts logs why).
import type { Issue, Result } from "../../packages/core/src/index.ts";

export const ESQUEMA = "numinia-engine/naturaleza@1";
export const PALETAS = ["verano", "otono", "primavera"] as const;
export type Paleta = (typeof PALETAS)[number];
/** The validated world, flat, as it travels (the state's fields). */
export type NaturalezaMundo = { activa: boolean; semilla: number; tamano: number; plaza: number; arboles: number; hierba: number; estanque: boolean; paleta: Paleta; fauna: boolean; faunaDensidad: number; faunaEspecies: string };
/** What a file that says nothing gets (kept equal to packages/render/src/naturaleza/naturaleza.ts `DEFECTOS_NATURALEZA`; a test compares). */
export const DEFECTOS: NaturalezaMundo = { activa: true, semilla: 1234, tamano: 200, plaza: 12, arboles: 1, hierba: 1, estanque: true, paleta: "verano", fauna: true, faunaDensidad: 1, faunaEspecies: "" };

const CLAVES = ["schema", "activa", "semilla", "tamano", "plaza", "densidad", "estanque", "paleta", "estacion", "fauna"];
/** F1: the `especies` list travels as one comma-separated text (empty = every species of the table); this is its room in bytes. */
export const FAUNA_ESPECIES_BYTES = 512;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `idsFauna` = the ids of the table the world uses (its own fauna.json or the house one); when given, `fauna.especies` must be among them. */
export function leerNaturaleza(json: unknown, idsFauna?: readonly string[]): Result<NaturalezaMundo> {
  if (!obj(json)) return { ok: false, issues: [{ path: "naturaleza", message: `un objeto JSON, p. ej. { "schema": "${ESQUEMA}", "activa": true, "semilla": 1234 }` }] };
  const issues: Issue[] = [], v: NaturalezaMundo = { ...DEFECTOS };
  for (const k of Object.keys(json)) if (!CLAVES.includes(k)) issues.push({ path: `naturaleza.${k}`, message: `clave desconocida: quítala o corrige el nombre (las claves son: ${CLAVES.filter((c) => c !== "schema").join(", ")})` });
  if (json.schema !== undefined && json.schema !== ESQUEMA) issues.push({ path: "naturaleza.schema", message: `debe ser "${ESQUEMA}" (o no estar)` });
  const bool = (k: "activa" | "estanque", raw: unknown, ruta: string, que: string) => {
    if (raw === undefined) return;
    if (typeof raw === "boolean") v[k] = raw; else issues.push({ path: ruta, message: `true o false (${que})` });
  };
  bool("activa", json.activa, "naturaleza.activa", "false apaga la naturaleza y deja el suelo plano");
  bool("estanque", json.estanque, "naturaleza.estanque", "true pone un estanque con agua; false lo quita");
  const ent = (k: "semilla" | "tamano" | "plaza", min: number, max: number, que: string) => {
    const raw = json[k];
    if (raw === undefined) return;
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= max) v[k] = raw;
    else issues.push({ path: `naturaleza.${k}`, message: `un número entero entre ${min} y ${max} (${que})` });
  };
  ent("semilla", 0, 2147483647, "mismo número = mismo paisaje; prueba con 1, 2, 3… hasta que te guste");
  ent("tamano", 100, 400, "metros de lado del mundo; 200 es lo normal");
  ent("plaza", 4, 40, "radio en metros del círculo llano donde aparece la gente; sin árboles");
  // R5.2: the season. `estacion` is its clear name; `paleta` (N4) still works and means the same; if both come, `estacion` wins.
  for (const k of ["paleta", "estacion"] as const) {
    if (json[k] === undefined) continue;
    if (typeof json[k] === "string" && (PALETAS as readonly string[]).includes(json[k])) v.paleta = json[k] as Paleta;
    else issues.push({ path: `naturaleza.${k}`, message: `una de: ${PALETAS.map((p) => `"${p}"`).join(", ")} (la estación: solo cambia el color de los prados y las hojas)` });
  }
  if (json.densidad !== undefined) {
    if (!obj(json.densidad)) issues.push({ path: "naturaleza.densidad", message: 'un objeto { "arboles": 0 a 1, "hierba": 0 a 1 }; 1 = lo máximo que aguanta el aparato, 0 = nada' });
    else {
      for (const k of Object.keys(json.densidad)) if (k !== "arboles" && k !== "hierba") issues.push({ path: `naturaleza.densidad.${k}`, message: 'clave desconocida: solo "arboles" y "hierba"' });
      for (const k of ["arboles", "hierba"] as const) {
        const raw = json.densidad[k];
        if (raw === undefined) continue;
        if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) v[k] = Math.round(raw * 100) / 100;
        else issues.push({ path: `naturaleza.densidad.${k}`, message: "un número entre 0 y 1 (0 = ninguno, 1 = lo máximo del aparato)" });
      }
    }
  }
  if (json.fauna !== undefined) leerFauna(json.fauna, v, issues, idsFauna);
  return issues.length ? { ok: false, issues } : { ok: true, value: v };
}

// F1: `fauna: { activa?, densidad?, especies? }` — the electronic butterflies, fireflies and birds (packages/relieve/src/fauna.ts). Every key optional.
function leerFauna(f: unknown, v: NaturalezaMundo, issues: Issue[], ids?: readonly string[]): void {
  if (!obj(f)) { issues.push({ path: "naturaleza.fauna", message: 'un objeto { "activa": true o false, "densidad": 0 a 1, "especies": ["luciernaga-ambar", …] } (todo opcional)' }); return; }
  for (const k of Object.keys(f)) if (!["activa", "densidad", "especies"].includes(k)) issues.push({ path: `naturaleza.fauna.${k}`, message: "clave desconocida: quítala o corrige el nombre (las claves son: activa, densidad, especies)" });
  if (f.activa !== undefined) { if (typeof f.activa === "boolean") v.fauna = f.activa; else issues.push({ path: "naturaleza.fauna.activa", message: "true o false (false deja el mundo sin mariposas, luciérnagas ni pájaros)" }); }
  if (f.densidad !== undefined) {
    if (typeof f.densidad === "number" && Number.isFinite(f.densidad) && f.densidad >= 0 && f.densidad <= 1) v.faunaDensidad = Math.round(f.densidad * 100) / 100;
    else issues.push({ path: "naturaleza.fauna.densidad", message: "un número entre 0 y 1 (0 = ningún bicho, 1 = lo máximo que aguanta el aparato)" });
  }
  if (f.especies !== undefined) {
    const e = f.especies;
    if (!Array.isArray(e) || e.length === 0 || e.length > 64 || e.some((x) => typeof x !== "string")) { issues.push({ path: "naturaleza.fauna.especies", message: 'una lista de 1 a 64 ids de especie, p. ej. ["luciernaga-ambar", "mariposa-rele"]; para todas, quita la clave' }); return; }
    const lista = e as string[], malos = ids ? lista.filter((x) => !ids.includes(x)) : lista.filter((x) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x));
    if (malos.length) issues.push({ path: "naturaleza.fauna.especies", message: `no existe(n) en la tabla: ${malos.map((x) => `"${x}"`).join(", ")}${ids ? `; los ids son: ${ids.join(", ")}` : ""}` });
    else if (new Set(lista).size !== lista.length) issues.push({ path: "naturaleza.fauna.especies", message: "hay ids repetidos: deja cada uno una sola vez" });
    else if (new TextEncoder().encode(lista.join(",")).length > FAUNA_ESPECIES_BYTES) issues.push({ path: "naturaleza.fauna.especies", message: `la lista es demasiado larga (máx. ${FAUNA_ESPECIES_BYTES} bytes): pon menos especies o quita la clave para usar todas` });
    else v.faunaEspecies = lista.join(",");
  }
}
