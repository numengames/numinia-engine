// entorno — the file format `numinia-engine/entorno@1`: how a world or an adventure ships its environment (and the
// presets). Nested and readable (colours as "#rrggbb"); a file may say only what it changes over a base. Validation
// returns Result with error paths in the file's own terms ("sol.altura"), never throws. Pure: no engine, no DOM.
// The same file may carry `aparicion` (where people appear: a vertical world's floor), read by `leerAparicion` for the
// server; it is not part of the environment's shared state. `mapa.corte` (U14) is: every page's maps cut the world at
// that height (a floor plan inside a building), and the world's file says it again at each start (server.ts).
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { defineSchema, validate } from "../../packages/schema/src/index.ts";
import { CAMARA_INICIOS, CAMARA_MAX_MAX, CAMARA_MAX_MIN, CAMPOS, MOV_ANDAR_MAX, MOV_ANDAR_MIN, MOV_CORRER_MAX, MOV_CORRER_MIN, MOV_FOV_MAX, MOV_FOV_MIN, entorno } from "./feature.ts";

export const ESQUEMA = "numinia-engine/entorno@1";
export type Plano = Record<string, unknown>;
/** `aparicion` (optional, the server's, never on the wire): where people appear, the square of half-side `radio` centred
 * at (x, z), metres. A vertical world puts it on a floor instead of inside a wall. Absent = the house square (40 m
 * around the origin). `radio` 1–40; x and z within ±APARICION_XZ_MAX so the square stays inside the walkable world (sim BOUND, ±2000). */
export type Aparicion = { x: number; z: number; radio: number; giro?: number };
export const APARICION_GIRO_MAX = 180;
export const APARICION_RADIO_MIN = 1, APARICION_RADIO_MAX = 40, APARICION_XZ_MAX = 1960;

/** Flat field (wire) ↔ path in the file. Colours are marked: in the file they are "#rrggbb". */
export const RUTAS: [campo: string, ruta: string, color?: true][] = [
  ["preset", "preset"],
  ["cielo", "cielo.tipo"], ["cieloArriba", "cielo.arriba", true], ["cieloHorizonte", "cielo.horizonte", true],
  ["imagen", "cielo.imagen"], ["turbidez", "cielo.turbidez"], ["nubes", "cielo.nubes"],
  ["hdr", "luz.hdr"], ["ambiente", "luz.ambiente"], ["ambienteCielo", "luz.cielo", true], ["ambienteSuelo", "luz.suelo", true],
  ["hora", "hora.valor"], ["solHora", "hora.mueveElSol"], ["ciclo", "hora.cicloMinutos"],
  ["solReal", "sol.sigueAlReal"], ["solAltura", "sol.altura"], ["solRumbo", "sol.rumbo"], ["solIntensidad", "sol.intensidad"], ["solColor", "sol.color", true],
  ["nieblaCerca", "niebla.cerca"], ["nieblaLejos", "niebla.lejos"], ["nieblaColor", "niebla.color", true], ["nieblaAuto", "niebla.delCielo"],
  ["vientoRumbo", "viento.rumbo"], ["vientoFuerza", "viento.fuerza"],
  ["suelo", "suelo.tipo"], ["sueloColor", "suelo.color", true], ["sueloEscala", "suelo.escala"],
  ["tono", "tono.curva"], ["exposicion", "tono.exposicion"],
  ["hitos", "hitos"], ["rejilla", "rejilla"],
  ["mapaCorte", "mapa.corte"],
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
 * as information); wrong values are listed with their path in the file and how to fix them. `aparicion` is checked
 * here too (one check for the whole file) but never enters the flat state: `leerAparicion` gives it to the server.
 */
export function validarEntorno(json: unknown, base: Plano = porDefecto()): Result<Plano> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, issues: [{ path: "entorno", message: `un objeto JSON con "schema": "${ESQUEMA}"` }] };
  const issues: Issue[] = [];
  const s = (json as Record<string, unknown>).schema;
  if (s !== undefined && s !== ESQUEMA) issues.push({ path: "entorno.schema", message: `debe ser "${ESQUEMA}" (o no estar, en un preset)` });
  const ap = leerAparicion(json);
  if (!ap.ok) issues.push(...ap.issues);
  const af = leerAparicionFoto(json);
  if (!af.ok) issues.push(...af.issues);
  const ca = leerCamara(json);
  if (!ca.ok) issues.push(...ca.issues);
  const mo = leerMovimiento(json);
  if (!mo.ok) issues.push(...mo.issues);
  const su = leerSuelo(json);
  if (!su.ok) issues.push(...su.issues);
  const vu = leerVuelo(json);
  if (!vu.ok) issues.push(...vu.issues);
  const te = leerTema(json);
  if (!te.ok) issues.push(...te.issues);
  const plano: Plano = { ...base };
  for (const [campo, ruta, color] of RUTAS) {
    const v = leer(json, ruta);
    if (v === undefined) continue;
    if (color) {
      if (typeof v === "string" && COLOR.test(v)) plano[campo] = parseInt(v.slice(1), 16);
      else issues.push({ path: `entorno.${ruta}`, message: "un color \"#rrggbb\", p. ej. \"#87ceeb\"" });
    } else plano[campo] = v;
  }
  // P1: the world's camera and the heading of the arrival ride the flat state (the page turns its own camera), checked above
  if (ca.ok && ca.value) {
    if (ca.value.inicio !== undefined) plano.camaraInicio = ca.value.inicio;
    if (ca.value.distanciaMax !== undefined) plano.camaraMax = ca.value.distanciaMax;
  }
  // the world's pace rides the flat state too (the page's prediction and camera read it); the server's sim gets the same file through `movimientoDelMundo`
  if (mo.ok && mo.value) {
    if (mo.value.andar !== undefined) plano.movAndar = mo.value.andar;
    if (mo.value.correr !== undefined) plano.movCorrer = mo.value.correr;
    if (mo.value.fov !== undefined) plano.movFov = mo.value.fov;
  }
  if (ap.ok && ap.value?.giro !== undefined) { plano.llegadaGira = true; plano.llegadaGiro = ap.value.giro; }
  const v = validate(SCHEMA, plano);
  if (!v.ok) {
    for (const i of v.issues) {
      const campo = i.path.split(".").pop()!, ruta = RUTAS.find((r) => r[0] === campo)?.[1] ?? campo;
      issues.push({ path: `entorno.${ruta}`, message: i.message });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v.ok ? v.value : plano };
}

/**
 * The spawn area of an `entorno@1` file: `aparicion: { x, z, radio }` (metres). null when the file has none (the house
 * square); issues, with their path in the file, when it is there but wrong. Pure; the composition root hands the value
 * to the instance (`InstanceOptions.aparicion`), so it travels in the world folder and its zip, never on the wire.
 */
export function leerAparicion(json: unknown): Result<Aparicion | null> {
  const a = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>).aparicion : undefined;
  if (a === undefined || a === null) return { ok: true, value: null };
  if (typeof a !== "object" || Array.isArray(a)) return { ok: false, issues: [{ path: "entorno.aparicion", message: `un objeto { "x", "z", "radio" } en metros: el cuadrado de medio lado radio (${APARICION_RADIO_MIN}–${APARICION_RADIO_MAX}) centrado en x, z donde aparece la gente` }] };
  const o = a as Record<string, unknown>, issues: Issue[] = [];
  const num = (k: string, min: number, max: number) => {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) return v;
    issues.push({ path: `entorno.aparicion.${k}`, message: `un número entre ${min} y ${max} (metros)` });
    return 0;
  };
  const x = num("x", -APARICION_XZ_MAX, APARICION_XZ_MAX), z = num("z", -APARICION_XZ_MAX, APARICION_XZ_MAX), radio = num("radio", APARICION_RADIO_MIN, APARICION_RADIO_MAX);
  // P1: `giro` (optional, degrees, the `pnj@1.giro` convention): the heading faced on arrival. Without it the view looks along -z as always.
  let giro: number | undefined;
  if (o.giro !== undefined && o.giro !== null) {
    if (typeof o.giro === "number" && Number.isFinite(o.giro) && o.giro >= -APARICION_GIRO_MAX && o.giro <= APARICION_GIRO_MAX) giro = o.giro;
    else issues.push({ path: "entorno.aparicion.giro", message: `un número entre -${APARICION_GIRO_MAX} y ${APARICION_GIRO_MAX} (grados, como el giro de una persona): hacia dónde mira quien aparece; 0 mira hacia +z, 90 hacia +x, 180 hacia −z, −90 hacia −x. Sin la clave, mira hacia −z como siempre` });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: giro === undefined ? { x, z, radio } : { x, z, radio, giro } };
}

/** P1: the world's camera, `camara: { inicio?, distanciaMax? }` of an `entorno@1` file. `inicio`: «primera» (the person arrives with the
 * character's eyes) or «tercera» (seen from behind, as always); `distanciaMax` (metres, CAMARA_MAX_MIN–CAMARA_MAX_MAX): the farthest the
 * third-person camera goes (an interior: 2.5; the near limit of the third person, 1.5 m, still holds). null when the file has no `camara`:
 * nothing changes. The page reads it from the flat state (`camaraInicio`, `camaraMax`), so it travels with the world and its zip. */
export type CamaraFichero = { inicio?: (typeof CAMARA_INICIOS)[number]; distanciaMax?: number };
export function leerCamara(json: unknown): Result<CamaraFichero | null> {
  const c = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>).camara : undefined;
  if (c === undefined || c === null) return { ok: true, value: null };
  if (typeof c !== "object" || Array.isArray(c)) return { ok: false, issues: [{ path: "entorno.camara", message: `un objeto { "inicio": "primera" | "tercera", "distanciaMax": 2.5 }: la vista con la que entra la gente y hasta dónde se aleja la cámara en tercera persona (metros, ${CAMARA_MAX_MIN}–${CAMARA_MAX_MAX})` }] };
  const o = c as Record<string, unknown>, issues: Issue[] = [], out: CamaraFichero = {};
  if (o.inicio !== undefined) {
    if (typeof o.inicio === "string" && (CAMARA_INICIOS as readonly string[]).includes(o.inicio)) out.inicio = o.inicio as CamaraFichero["inicio"];
    else issues.push({ path: "entorno.camara.inicio", message: "«primera» (entra con los ojos del personaje) o «tercera» (entra viéndose desde atrás, como siempre)" });
  }
  if (o.distanciaMax !== undefined) {
    const d = o.distanciaMax;
    if (typeof d === "number" && Number.isFinite(d) && d >= CAMARA_MAX_MIN && d <= CAMARA_MAX_MAX) out.distanciaMax = d;
    else issues.push({ path: "entorno.camara.distanciaMax", message: `un número entre ${CAMARA_MAX_MIN} y ${CAMARA_MAX_MAX} (metros): lo más lejos que se pone la cámara detrás de ti en tercera persona; en una casa, 2.5. La tercera persona no baja de 1.5 m` });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: out };
}

/** The world's pace, `movimiento: { andar?, correr?, fov? }` of an `entorno@1` file: walking and running speed (m/s) and the camera's field of
 * view (degrees). Each is optional; one missing keeps the house's (1.5 m/s, 4 m/s, 60°). null when the file has no `movimiento`: nothing changes.
 * The server's sim reads it through `movimientoDelMundo`, the page from the flat state (`movAndar`, `movCorrer`, `movFov`). */
export type MovimientoFichero = { andar?: number; correr?: number; fov?: number };
export function leerMovimiento(json: unknown): Result<MovimientoFichero | null> {
  const c = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>).movimiento : undefined;
  if (c === undefined || c === null) return { ok: true, value: null };
  if (typeof c !== "object" || Array.isArray(c)) return { ok: false, issues: [{ path: "entorno.movimiento", message: `un objeto { "andar": 3, "correr": 6, "fov": 70 }: velocidad al andar y al correr (metros por segundo) y campo de visión de la cámara (grados)` }] };
  const o = c as Record<string, unknown>, issues: Issue[] = [], out: MovimientoFichero = {};
  const num = (k: "andar" | "correr" | "fov", min: number, max: number, unidad: string, casa: string) => {
    if (o[k] === undefined) return;
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) out[k] = v;
    else issues.push({ path: `entorno.movimiento.${k}`, message: `un número entre ${min} y ${max} (${unidad}); sin la clave, ${casa}` });
  };
  num("andar", MOV_ANDAR_MIN, MOV_ANDAR_MAX, "metros por segundo al andar", "1.5");
  num("correr", MOV_CORRER_MIN, MOV_CORRER_MAX, "metros por segundo al correr", "4");
  num("fov", MOV_FOV_MIN, MOV_FOV_MAX, "grados de campo de visión", "60");
  return issues.length ? { ok: false, issues } : { ok: true, value: out };
}

/** D-045: the world's void. `sueloMinimo` (metres, SUELO_MIN–SUELO_MAX): under it you have fallen and the server puts you
 * back on your last safe spot; optional `vuelta: { x, y, z, siempre? }` = a fixed point to come back to (`siempre` = always
 * there, else only until a safe spot is known). null when the file says nothing. The server's (instance + feature `suelo`),
 * never on the wire as environment. */
export const SUELO_MIN = -500, SUELO_MAX = 500;
export type SueloMundo = { minimo: number; vuelta?: { x: number; y: number; z: number; siempre?: boolean } | null };
export function leerSuelo(json: unknown): Result<SueloMundo | null> {
  const o = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const m = o.sueloMinimo, v = o.vuelta;
  if (m === undefined && v === undefined) return { ok: true, value: null };
  const issues: Issue[] = [];
  if (typeof m !== "number" || !Number.isFinite(m) || m < SUELO_MIN || m > SUELO_MAX) issues.push({ path: "entorno.sueloMinimo", message: `un número entre ${SUELO_MIN} y ${SUELO_MAX} (metros): bajo esa altura se cae al vacío y se vuelve a la última posición segura` });
  let vuelta: SueloMundo["vuelta"] = null;
  if (v !== undefined && v !== null) {
    if (typeof v !== "object" || Array.isArray(v)) issues.push({ path: "entorno.vuelta", message: "un objeto { \"x\", \"y\", \"z\" } en metros (y opcional \"siempre\": true): el punto fijo al que se vuelve tras caer" });
    else {
      const p = v as Record<string, unknown>;
      for (const [k, min, max] of [["x", -2000, 2000], ["y", SUELO_MIN, SUELO_MAX], ["z", -2000, 2000]] as const) {
        const n = p[k];
        if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) issues.push({ path: `entorno.vuelta.${k}`, message: `un número entre ${min} y ${max} (metros)` });
      }
      if (p.siempre !== undefined && typeof p.siempre !== "boolean") issues.push({ path: "entorno.vuelta.siempre", message: "true o false" });
      if (!issues.length) vuelta = { x: p.x as number, y: p.y as number, z: p.z as number, siempre: p.siempre === true };
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: { minimo: m as number, vuelta } };
}

/** H2: who may fly in this world — entorno.json `vuelo`: "nadie" (the default, and what a missing key means), "constructores"
 * (whoever may build here: STD-052's build-in-worlds) or "todos". null when the file says nothing. The server's (the
 * instance decides every `volar` order with it), never on the wire as environment. */
export const VUELOS = ["nadie", "constructores", "todos"] as const;
export type VueloMundo = (typeof VUELOS)[number];
export function leerVuelo(json: unknown): Result<VueloMundo | null> {
  const o = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  if (o.vuelo === undefined) return { ok: true, value: null };
  if (typeof o.vuelo === "string" && (VUELOS as readonly string[]).includes(o.vuelo)) return { ok: true, value: o.vuelo as VueloMundo };
  return { ok: false, issues: [{ path: "entorno.vuelo", message: `uno de ${VUELOS.map((v) => `«${v}»`).join(", ")}: quién puede volar en este mundo (sin la clave, nadie)` }] };
}

/** mundo-hermes: `tema: "black-and-white"` makes the PAGE's HUD (panels, buttons, minimap) pure black and white. Absent = the house look. Any other value is an issue, said once. */
export const TEMAS = ["black-and-white"] as const;
export type TemaMundo = (typeof TEMAS)[number];
export function leerTema(json: unknown): Result<TemaMundo | null> {
  const o = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  if (o.tema === undefined) return { ok: true, value: null };
  if (typeof o.tema === "string" && (TEMAS as readonly string[]).includes(o.tema)) return { ok: true, value: o.tema as TemaMundo };
  return { ok: false, issues: [{ path: "entorno.tema", message: `${TEMAS.map((t) => `«${t}»`).join(", ")}: el aspecto de los paneles de la página (sin la clave, el de siempre)` }] };
}

/**
 * N16: `aparicionFoto: true` lets whoever opens a photo's link (N13 `#foto=`) appear at the place it names instead of
 * the spawn area (the server checks a free spot there; features/teletransporte). Off when absent: a world opts in.
 * Like `aparicion`, the server's, never on the wire as environment (the feature says it in its own state).
 */
export function leerAparicionFoto(json: unknown): Result<boolean> {
  const a = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>).aparicionFoto : undefined;
  if (a === undefined || a === null) return { ok: true, value: false };
  if (typeof a !== "boolean") return { ok: false, issues: [{ path: "entorno.aparicionFoto", message: "true (quien abre el enlace de una foto aparece en su sitio) o false (aparece en el sitio de siempre y la luz le guía)" }] };
  return { ok: true, value: a };
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
  // P1: the world's camera goes back to its place in the file only when the world has one (a file without `camara` stays without)
  const max = Number(p.camaraMax ?? 0), inicio = p.camaraInicio ?? "tercera";
  if (inicio !== "tercera" || max > 0) out.camara = { inicio, ...(max > 0 ? { distanciaMax: max } : {}) };
  const [ma, mc, mf] = [Number(p.movAndar ?? 0), Number(p.movCorrer ?? 0), Number(p.movFov ?? 0)];
  if (ma > 0 || mc > 0 || mf > 0) out.movimiento = { ...(ma > 0 ? { andar: ma } : {}), ...(mc > 0 ? { correr: mc } : {}), ...(mf > 0 ? { fov: mf } : {}) };
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
