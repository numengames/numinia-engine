// entorno — the file format `numinia-engine/entorno@1`: how a world or an adventure ships its environment (and the
// presets). Nested and readable (colours as "#rrggbb"); a file may say only what it changes over a base. Validation
// returns Result with error paths in the file's own terms ("sol.altura"), never throws. Pure: no engine, no DOM.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { defineSchema, validate } from "../../packages/schema/src/index.ts";
import { CAMPOS, entorno } from "./feature.ts";

export const ESQUEMA = "numinia-engine/entorno@1";
export type Plano = Record<string, unknown>;

/** Flat field (wire) ↔ path in the file. Colours are marked: in the file they are "#rrggbb". */
export const RUTAS: [campo: string, ruta: string, color?: true][] = [
  ["preset", "preset"],
  ["cielo", "cielo.tipo"], ["cieloArriba", "cielo.arriba", true], ["cieloHorizonte", "cielo.horizonte", true],
  ["imagen", "cielo.imagen"], ["turbidez", "cielo.turbidez"], ["nubes", "cielo.nubes"],
  ["hdr", "luz.hdr"], ["ambiente", "luz.ambiente"], ["ambienteCielo", "luz.cielo", true], ["ambienteSuelo", "luz.suelo", true],
  ["hora", "hora.valor"], ["solHora", "hora.mueveElSol"], ["ciclo", "hora.cicloMinutos"],
  ["solAltura", "sol.altura"], ["solRumbo", "sol.rumbo"], ["solIntensidad", "sol.intensidad"], ["solColor", "sol.color", true],
  ["nieblaCerca", "niebla.cerca"], ["nieblaLejos", "niebla.lejos"], ["nieblaColor", "niebla.color", true], ["nieblaAuto", "niebla.delCielo"],
  ["vientoRumbo", "viento.rumbo"], ["vientoFuerza", "viento.fuerza"],
  ["suelo", "suelo.tipo"], ["sueloColor", "suelo.color", true], ["sueloEscala", "suelo.escala"],
  ["tono", "tono.curva"], ["exposicion", "tono.exposicion"],
  ["hitos", "hitos"], ["rejilla", "rejilla"],
];

const SCHEMA = defineSchema("entorno", entorno.version, CAMPOS);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const leer = (o: unknown, ruta: string): unknown => ruta.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, "0")}`;

/** The field defaults: what a world gets when it says nothing. */
export function porDefecto(): Plano {
  const out: Plano = {};
  for (const [k, f] of Object.entries(CAMPOS)) out[k] = (f as { default?: unknown }).default ?? (f.kind === "bool" ? false : f.kind === "enum" ? f.values[0] : f.kind === "text" ? "" : 0);
  return out;
}

/**
 * Read an `entorno@1` file (or a preset) over `base` (flat). Unknown keys are ignored (a newer writer's keys survive
 * as information); wrong values are listed with their path in the file and how to fix them.
 */
export function validarEntorno(json: unknown, base: Plano = porDefecto()): Result<Plano> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, issues: [{ path: "entorno", message: `un objeto JSON con "schema": "${ESQUEMA}"` }] };
  const issues: Issue[] = [];
  const s = (json as Record<string, unknown>).schema;
  if (s !== undefined && s !== ESQUEMA) issues.push({ path: "entorno.schema", message: `debe ser "${ESQUEMA}" (o no estar, en un preset)` });
  const plano: Plano = { ...base };
  for (const [campo, ruta, color] of RUTAS) {
    const v = leer(json, ruta);
    if (v === undefined) continue;
    if (color) {
      if (typeof v === "string" && COLOR.test(v)) plano[campo] = parseInt(v.slice(1), 16);
      else issues.push({ path: `entorno.${ruta}`, message: "un color \"#rrggbb\", p. ej. \"#87ceeb\"" });
    } else plano[campo] = v;
  }
  const v = validate(SCHEMA, plano);
  if (!v.ok) {
    for (const i of v.issues) {
      const campo = i.path.split(".").pop()!, ruta = RUTAS.find((r) => r[0] === campo)?.[1] ?? campo;
      issues.push({ path: `entorno.${ruta}`, message: i.message });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v.ok ? v.value : plano };
}

/** Flat → the readable file (the inverse of validarEntorno; what `restaurar` and tools write). */
export function aFichero(p: Plano): Record<string, unknown> {
  const out: Record<string, unknown> = { schema: ESQUEMA };
  for (const [campo, ruta, color] of RUTAS) {
    const partes = ruta.split("."), ultima = partes.pop()!;
    let o = out;
    for (const k of partes) o = (o[k] ??= {}) as Record<string, unknown>;
    o[ultima] = color ? hex(Number(p[campo])) : p[campo];
  }
  return out;
}

/**
 * The sun from the time of day (when `hora.mueveElSol`): rises in the east at 6, highest (65°) towards the south at
 * 12, sets in the west at 18; below the horizon at night. Degrees, rounded to the wire's 0.1.
 */
export function solDeHora(hora: number): { altura: number; rumbo: number } {
  const h = ((hora % 24) + 24) % 24;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const altura = 65 * Math.sin((Math.PI * (h - 6)) / 12);
  const rumbo = ((((90 + 180 * ((h - 6) / 12)) + 180) % 360) + 360) % 360 - 180;
  return { altura: r1(altura), rumbo: r1(rumbo) };
}
