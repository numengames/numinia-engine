// fauna (naturaleza F1): WHO is in the world — the pure part. Electronic butterflies by day, electronic fireflies by night (told
// apart by colour), biomechanical birds. This file holds the table's FORMAT + validation, the rarity maths and `habitantes`, the
// function that says which individuals live in one 32 m cell during one 120 s window. No three.js, no DOM, no Math.random, no
// clock: the server and every page call it with the same numbers and get the same animals, so nothing travels on the network.
// Drawing them is F2 (butterflies + fireflies) and F3 (birds); they only READ what this file returns.
//
// COPIED (technique only):
//  - the table style, the `rareza` vocabulary (comun/rara/legendaria) and the `peso` draw weight: features/pesca/peces.json
//    (the engine's own precedent; bridge-mind/tideline, MIT, behind it). Roulette over weights, as `elegirPez` does.
//  - integer-seeded streams: `crearAzar` (mulberry32, public domain) and `hash2` from ./semilla.ts.
//  - "a cell + a time slot decides who lives there" is the classic stateless-spawn trick (the idea behind chunk-seeded mob
//    spawning in voxel games); nothing is copied from any of them.
// CHANGED: pesca draws ONE fish per cast, so its 70/25/5 shares are huge; a visitor here meets hundreds of animals per half hour,
// so the same four words get shares of ~99.4 / 0.5 / 0.086 / 0.027 % (see `docs/NATURALEZA.md` F1: the target is stated, the
// maths is `pVerRareza`, a test pins it). `epica` is a fourth tier added HERE ONLY (pesca's enum travels on the wire; not touched).
// COMBINED: `Zona` and `hash2` from relieve/semilla (the terrain's own zones), the day clock of entorno (hours 0–24) and the
// per-device tiers A/B/C/D of calidad.ts (as plain letters: this package imports nothing).
import { crearAzar, hash2 } from "./semilla.ts";
import type { Zona } from "./relieve.ts";
import { ZONAS } from "./relieve.ts";

export const ESQUEMA_FAUNA = "numinia-engine/fauna@1";
export const GRUPOS = ["mariposa", "luciernaga", "pajaro"] as const;
export type Grupo = (typeof GRUPOS)[number];
/** pesca's three words plus `epica` (fauna only). Ordered from most to least common. */
export const RAREZAS_FAUNA = ["comun", "rara", "epica", "legendaria"] as const;
export type RarezaFauna = (typeof RAREZAS_FAUNA)[number];
export const HORAS_FAUNA = ["dia", "noche", "crepusculo"] as const;
export type HoraFauna = (typeof HORAS_FAUNA)[number];
/** How the little light of an animal pulses (F2/F3 turn each id into a function of time). */
export const LUCES_FAUNA = ["fijo", "latido", "parpadeo", "onda", "respiro", "estrobo", "morse", "prisma"] as const;
export type LuzFauna = (typeof LUCES_FAUNA)[number];
export type NivelFauna = "A" | "B" | "C" | "D";
export const NIVELES_FAUNA: readonly NivelFauna[] = ["A", "B", "C", "D"];

export type ColoresFauna = {
  /** The metal of the body (sRGB int). */
  cuerpo: number;
  /** Wing (butterflies, fireflies' wing cases) or plumage (birds). */
  ala: number;
  /** The glow: the LED / the firefly's colour. THE trait that tells fireflies apart. */
  luz: number;
  /** The glowing circuit lines drawn on wings or plumage. */
  circuito: number;
};
export type Especie = {
  id: string; nombre: string; grupo: Grupo; rareza: RarezaFauna;
  /** Draw weight inside its group (bigger = more common). Per group the weights sum to 100000 in the house table. */
  peso: number;
  colores: ColoresFauna;
  luz: LuzFauna;
  /** Zones it prefers (full weight there; elsewhere it still shows up at `AFINIDAD_FUERA` of its weight). */
  zonas: Zona[];
  hora: HoraFauna;
  /** Wing span (butterflies, birds) or body length (fireflies), in metres. */
  tamano: number;
  /** altura = metres above the ground [min, max]; velocidad m/s; radio = how far from its anchor it wanders (m). */
  vuelo: { altura: [number, number]; velocidad: number; radio: number };
  /** Group size [min, max]. [1, 1] for everything but some birds. */
  bandada: [number, number];
};
export type TablaFauna = { schema: string; especies: Especie[] };
export type Problema = { path: string; message: string };

// ------------------------------------------------------------------------------------------------------------------ format
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const CLAVES_ESPECIE = ["id", "nombre", "grupo", "rareza", "peso", "colores", "luz", "zonas", "hora", "tamano", "vuelo", "bandada"];
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = (xs: readonly string[]) => xs.map((x) => `"${x}"`).join(", ");

/** Check a fauna table (the parsed JSON of `fauna.json`). Returns every problem at once, each with its path and how to fix it. */
export function validarTabla(json: unknown): { ok: true; value: TablaFauna } | { ok: false; issues: Problema[] } {
  if (!obj(json)) return { ok: false, issues: [{ path: "fauna", message: `un objeto JSON { "schema": "${ESQUEMA_FAUNA}", "especies": [ … ] }` }] };
  const issues: Problema[] = [], out: Especie[] = [];
  for (const k of Object.keys(json)) if (!["schema", "_doc", "especies"].includes(k)) issues.push({ path: `fauna.${k}`, message: 'clave desconocida: quítala (las claves son: schema, _doc, especies)' });
  if (json.schema !== undefined && json.schema !== ESQUEMA_FAUNA) issues.push({ path: "fauna.schema", message: `debe ser "${ESQUEMA_FAUNA}" (o no estar)` });
  if (!Array.isArray(json.especies) || json.especies.length === 0) { issues.push({ path: "fauna.especies", message: "una lista con al menos una especie: [{ id, nombre, grupo, rareza, peso, colores, luz, zonas, hora, tamano, vuelo }]" }); return { ok: false, issues }; }
  if (json.especies.length > 64) issues.push({ path: "fauna.especies", message: `como mucho 64 especies (hay ${json.especies.length}): quita las que sobran` });
  const vistos = new Set<string>();
  json.especies.slice(0, 64).forEach((raw, i) => {
    const p = `fauna.especies[${i}]`, e = (campo: string) => `${p}.${campo}`;
    if (!obj(raw)) { issues.push({ path: p, message: "un objeto { id, nombre, grupo, rareza, peso, colores, luz, zonas, hora, tamano, vuelo }" }); return; }
    const antes = issues.length;
    for (const k of Object.keys(raw)) if (!CLAVES_ESPECIE.includes(k)) issues.push({ path: e(k), message: `clave desconocida: quítala o corrige el nombre (las claves son: ${CLAVES_ESPECIE.join(", ")})` });
    const id = raw.id;
    if (typeof id !== "string" || !SLUG.test(id) || id.length > 32) issues.push({ path: e("id"), message: 'un texto corto en minúsculas sin tildes ni espacios, p. ej. "luciernaga-ambar" (letras, números y guiones; máx. 32)' });
    else if (vistos.has(id)) issues.push({ path: e("id"), message: `"${id}" está repetido: cada especie lleva un id distinto` }); else vistos.add(id);
    if (typeof raw.nombre !== "string" || raw.nombre.trim() === "" || raw.nombre.length > 40) issues.push({ path: e("nombre"), message: "un texto de 1 a 40 letras, p. ej. \"Luciérnaga ámbar\"" });
    if (!(GRUPOS as readonly unknown[]).includes(raw.grupo)) issues.push({ path: e("grupo"), message: `uno de: ${lista(GRUPOS)}` });
    if (!(RAREZAS_FAUNA as readonly unknown[]).includes(raw.rareza)) issues.push({ path: e("rareza"), message: `una de: ${lista(RAREZAS_FAUNA)}` });
    if (typeof raw.peso !== "number" || !Number.isFinite(raw.peso) || raw.peso <= 0 || raw.peso > 1e6) issues.push({ path: e("peso"), message: "un número mayor que 0 y hasta 1000000 (más = más común; en la tabla de la casa cada grupo suma 100000)" });
    const col: Partial<ColoresFauna> = {};
    if (!obj(raw.colores)) issues.push({ path: e("colores"), message: 'un objeto { "cuerpo": "#rrggbb", "ala": "#rrggbb", "luz": "#rrggbb", "circuito": "#rrggbb" }' });
    else {
      for (const k of Object.keys(raw.colores)) if (!["cuerpo", "ala", "luz", "circuito"].includes(k)) issues.push({ path: e(`colores.${k}`), message: "clave desconocida: solo cuerpo, ala, luz y circuito" });
      for (const k of ["cuerpo", "ala", "luz", "circuito"] as const) {
        const v = raw.colores[k];
        if (typeof v === "string" && HEX.test(v)) col[k] = parseInt(v.slice(1), 16);
        else issues.push({ path: e(`colores.${k}`), message: 'un color en hexadecimal con almohadilla, p. ej. "#ffb326"' });
      }
    }
    if (!(LUCES_FAUNA as readonly unknown[]).includes(raw.luz)) issues.push({ path: e("luz"), message: `una de: ${lista(LUCES_FAUNA)} (cómo late su lucecita)` });
    let zonas: Zona[] = [];
    if (!Array.isArray(raw.zonas) || raw.zonas.length === 0 || new Set(raw.zonas).size !== raw.zonas.length || raw.zonas.some((z) => !(ZONAS as readonly unknown[]).includes(z))) issues.push({ path: e("zonas"), message: `una lista sin repetir con al menos una de: ${lista(ZONAS)}` });
    else zonas = raw.zonas as Zona[];
    if (!(HORAS_FAUNA as readonly unknown[]).includes(raw.hora)) issues.push({ path: e("hora"), message: `una de: ${lista(HORAS_FAUNA)}` });
    if (typeof raw.tamano !== "number" || !(raw.tamano >= 0.01 && raw.tamano <= 3)) issues.push({ path: e("tamano"), message: "metros, un número entre 0.01 y 3" });
    const par = (v: unknown, a: number, b: number): v is [number, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" && v[0] >= a && v[1] <= b && v[0] <= v[1];
    let vuelo: Especie["vuelo"] | null = null;
    if (!obj(raw.vuelo)) issues.push({ path: e("vuelo"), message: "un objeto { altura: [mín, máx], velocidad, radio }" });
    else {
      for (const k of Object.keys(raw.vuelo)) if (!["altura", "velocidad", "radio"].includes(k)) issues.push({ path: e(`vuelo.${k}`), message: "clave desconocida: solo altura, velocidad y radio" });
      const ok1 = par(raw.vuelo.altura, 0, 60), v = raw.vuelo.velocidad, r = raw.vuelo.radio;
      if (!ok1) issues.push({ path: e("vuelo.altura"), message: "[mín, máx] metros sobre el suelo, entre 0 y 60, con mín ≤ máx" });
      if (typeof v !== "number" || !(v > 0 && v <= 30)) issues.push({ path: e("vuelo.velocidad"), message: "metros por segundo, mayor que 0 y hasta 30" });
      if (typeof r !== "number" || !(r > 0 && r <= 60)) issues.push({ path: e("vuelo.radio"), message: "metros que se aleja de su punto, mayor que 0 y hasta 60" });
      if (ok1 && typeof v === "number" && typeof r === "number") vuelo = { altura: [...(raw.vuelo.altura as [number, number])], velocidad: v, radio: r };
    }
    let bandada: [number, number] = [1, 1];
    if (raw.bandada !== undefined) {
      if (!par(raw.bandada, 1, 12) || !Number.isInteger(raw.bandada[0]) || !Number.isInteger(raw.bandada[1])) issues.push({ path: e("bandada"), message: "[mín, máx] animales juntos, números enteros entre 1 y 12" });
      else if (raw.grupo !== "pajaro" && (raw.bandada[1] !== 1)) issues.push({ path: e("bandada"), message: 'solo los pájaros van en bandada: quita "bandada" o ponla en [1, 1]' });
      else bandada = [raw.bandada[0], raw.bandada[1]];
    }
    if (issues.length === antes && vuelo) out.push({ id: id as string, nombre: (raw.nombre as string).trim(), grupo: raw.grupo as Grupo, rareza: raw.rareza as RarezaFauna, peso: raw.peso as number, colores: col as ColoresFauna, luz: raw.luz as LuzFauna, zonas, hora: raw.hora as HoraFauna, tamano: raw.tamano as number, vuelo, bandada });
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: { schema: ESQUEMA_FAUNA, especies: out } };
}

/** The species of a table, in table order; with `grupo`, only that group. `ids` keeps only those (a world's `especies` list; empty/absent = all). */
export function especiesDe(tabla: TablaFauna, grupo?: Grupo, ids?: readonly string[]): Especie[] {
  const ok = ids && ids.length ? new Set(ids) : null;
  return tabla.especies.filter((e) => (!grupo || e.grupo === grupo) && (!ok || ok.has(e.id)));
}

// --------------------------------------------------------------------------------------------------------- numbers of the model
export const CELDA_M = 32;
/** One window of the world clock: everyone computes the same animals for the same 120 s. */
export const VENTANA_S = 120;
/** Of the slots a cell offers, this share is filled at density 1, full activity and full zone affinity. */
export const OCUPACION = 0.8;
/** An animal outside the zones it prefers still weighs this much of its `peso`. */
export const AFINIDAD_FUERA = 0.25;
/** Per tier: the radius (m) of the view the nature piece fills, the most animals it ever shows at once in that view (`enVista`) and the
 *  most it ever puts in ONE cell (`celda`: a bigger tier never has a smaller cap than a smaller one; since N6 it is no longer derived from `enVista` — a test pins that it never holds LESS than the view needs). Birds count flocks as ONE entry
 *  (each entry carries `n` birds). The tier only cuts the list short: tier D's animals are the first ones of tier A's. */
export const FAUNA_POR_NIVEL: Record<NivelFauna, { radio: number; enVista: Record<Grupo, number>; celda: Record<Grupo, number> }> = {
  // N6: `enVista` (what is DRAWN: the nearest N of the view) fell to fit the nature triangle budget; `celda` (how many animals the world holds in a cell, what the
  // rarity maths depends on) did not move, so the odds of meeting a rare animal near you stay as published. The nearest animals are always the ones drawn.
  A: { radio: 48, enVista: { mariposa: 24, luciernaga: 60, pajaro: 6 }, celda: { mariposa: 10, luciernaga: 14, pajaro: 3 } },
  B: { radio: 36, enVista: { mariposa: 16, luciernaga: 40, pajaro: 4 }, celda: { mariposa: 10, luciernaga: 14, pajaro: 3 } },
  C: { radio: 30, enVista: { mariposa: 10, luciernaga: 24, pajaro: 3 }, celda: { mariposa: 9, luciernaga: 14, pajaro: 3 } },
  D: { radio: 24, enVista: { mariposa: 6, luciernaga: 12, pajaro: 2 }, celda: { mariposa: 6, luciernaga: 10, pajaro: 2 } },
};
/** How many 32 m cells fit in the view disc of a tier (area ratio). */
export const celdasEnVista = (nivel: NivelFauna) => Math.PI * FAUNA_POR_NIVEL[nivel].radio ** 2 / (CELDA_M * CELDA_M);

/** The window number of a time in seconds of the world clock. */
export const ventanaDe = (segundos: number) => Math.floor(segundos / VENTANA_S);
/** 0…1: how visible an animal is `t` seconds into its window (it fades in and out so the change of window never pops). */
export function fundido(t: number): number { return Math.max(0, Math.min(1, t / 4, (VENTANA_S - t) / 4)); }

/** Part of the day for an hour 0–24: crepusculo 5.5–7.5 and 18–20.5, dia 7.5–18, noche the rest. */
export function faseDelDia(hora: number): HoraFauna {
  const h = ((hora % 24) + 24) % 24;
  if (h >= 7.5 && h < 18) return "dia";
  if ((h >= 5.5 && h < 7.5) || (h >= 18 && h < 20.5)) return "crepusculo";
  return "noche";
}
/** How active a species is (0…1) at a part of the day: its own hour = 1; the neighbour hour at the twilight 0.4; a dusk species also flies a bit by day/night. */
const ACTIVIDAD: Record<HoraFauna, Record<HoraFauna, number>> = {
  dia: { dia: 1, crepusculo: 0.4, noche: 0 },
  noche: { dia: 0, crepusculo: 0.4, noche: 1 },
  crepusculo: { dia: 0.3, crepusculo: 1, noche: 0.15 },
};
export const actividad = (e: Pick<Especie, "hora">, fase: HoraFauna) => ACTIVIDAD[e.hora][fase];
export const afinidad = (e: Pick<Especie, "zonas">, zona: Zona) => (e.zonas.includes(zona) ? 1 : AFINIDAD_FUERA);

// ------------------------------------------------------------------------------------------------------------- who is alive
export type CtxHabitantes = {
  zonaEn: (x: number, z: number) => Zona;
  alturaEn: (x: number, z: number) => number;
  /** Hour of the world's day, 0–24 (entorno's clock). */
  hora: number;
  /** 0…1, the world's `fauna.densidad`. */
  densidad: number;
  nivel: NivelFauna;
  /** The world's `fauna.especies` allow-list (ids); absent/empty = every species of the table. */
  especies?: readonly string[];
};
export type Habitante = {
  /** Unique in the world for this window: group letter, cell, window, slot. */
  id: string;
  /** The `id` of its species in the table. */
  especie: string;
  /** Anchor point (m, world) the animal moves around (see `trayectoria`). */
  x: number; y: number; z: number;
  /** 0…1, a fixed offset for its wing beat / pulse so a swarm is not in step. */
  fase: number;
  /** An integer for anything else the drawing needs to vary per animal (tint, size jitter, path). */
  semillaPropia: number;
  /** How many animals travel together (birds: the flock; everything else 1). */
  n: number;
};

const letra: Record<Grupo, string> = { mariposa: "m", luciernaga: "l", pajaro: "p" };
const u32 = (x: number) => Math.floor(x * 4294967296) >>> 0;
/** The stream of one (cell, window, group): fixed number of draws per slot, so a smaller tier is a prefix of a bigger one. */
function flujo(semilla: number, cx: number, cz: number, ventana: number, gi: number) {
  const a = u32(hash2(semilla ^ 0x5bd1e995, cx, cz));
  return crearAzar(u32(hash2(a | 0, ventana | 0, 7700 + gi)));
}

/** Every animal alive in cell (cx, cz) (32 m squares: cx = floor(x / 32)) during `ventana`, in a stable order. Pure. */
export function habitantes(semilla: number, celda: { cx: number; cz: number }, ventana: number, tabla: TablaFauna, ctx: CtxHabitantes): Habitante[] {
  const fase = faseDelDia(ctx.hora), dens = Math.max(0, Math.min(1, ctx.densidad)), salida: Habitante[] = [];
  if (dens <= 0) return salida;
  const nivel = FAUNA_POR_NIVEL[ctx.nivel] ?? FAUNA_POR_NIVEL.D;
  GRUPOS.forEach((g, gi) => {
    const esp = especiesDe(tabla, g, ctx.especies);
    if (!esp.length) return;
    let ref = 0;
    for (const e of esp) ref += e.peso;
    const azar = flujo(semilla, celda.cx, celda.cz, ventana, gi), pesos = new Array<number>(esp.length);
    for (let i = 0; i < nivel.celda[g]; i++) {
      const ua = azar(), ux = azar(), uz = azar(), us = azar(), uy = azar(), uf = azar(), ue = azar(), ub = azar();
      const x = (celda.cx + ux) * CELDA_M, z = (celda.cz + uz) * CELDA_M, zona = ctx.zonaEn(x, z);
      let total = 0;
      for (let k = 0; k < esp.length; k++) total += (pesos[k] = esp[k].peso * actividad(esp[k], fase) * afinidad(esp[k], zona));
      if (total <= 0 || ua >= OCUPACION * dens * Math.min(1, total / ref)) continue;
      let r = us * total, k = 0;
      for (; k < esp.length - 1; k++) { r -= pesos[k]; if (r < 0) break; }
      const e = esp[k];
      salida.push({
        id: `${letra[g]}${celda.cx}_${celda.cz}_${ventana}_${i}`, especie: e.id,
        x, y: ctx.alturaEn(x, z) + e.vuelo.altura[0] + uy * (e.vuelo.altura[1] - e.vuelo.altura[0]), z,
        fase: uf, semillaPropia: Math.floor(ue * 2147483647), n: e.bandada[0] + Math.min(e.bandada[1] - e.bandada[0], Math.floor(ub * (e.bandada[1] - e.bandada[0] + 1))),
      });
    }
  });
  return salida;
}

/** Where an animal is `t` seconds into its window: a slow Lissajous loop around its anchor (radius and speed from the species). Pure; the
 *  render may use its own motion — this one exists so tests, the server and a journal agree on a position. Writes into `fuera` if given. */
export function trayectoria(h: Habitante, e: Pick<Especie, "vuelo">, t: number, fuera: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
  const r = e.vuelo.radio, w = e.vuelo.velocidad / Math.max(0.5, r), p = h.fase * 6.2831853, q = (h.semillaPropia % 1000) / 1000 * 6.2831853;
  fuera.x = h.x + r * 0.7 * Math.sin(w * t + p);
  fuera.z = h.z + r * 0.7 * Math.sin(w * 1.31 * t + q);
  fuera.y = h.y + 0.15 * (e.vuelo.altura[1] - e.vuelo.altura[0]) * Math.sin(w * 2.3 * t + p + q);
  return fuera;
}

// ------------------------------------------------------------------------------------------------------ the probability table
/** The share of the world's ground each zone has (measured on the house seed 1234, 200 m: see docs/NATURALEZA.md F1). Used when no zone is given. */
export const MEZCLA_TIPICA: Record<Zona, number> = { prado: 0.65, bosque: 0.16, arena: 0.03, roca: 0.12, orilla: 0.04 };

export type CtxProbabilidad = {
  /** Hour 0–24. */
  hora: number;
  densidad?: number;
  nivel?: NivelFauna;
  /** One zone, or null/absent = the whole world with `mezcla`. */
  zona?: Zona | null;
  mezcla?: Record<Zona, number>;
  especies?: readonly string[];
};
export type Visita = { minutos?: number; velocidad?: number; aviso?: number };
export type FilaProbabilidad = {
  id: string; nombre: string; grupo: Grupo; rareza: RarezaFauna;
  /** Share among the animals alive of its group (0…1). */
  pGrupo: number;
  /** Share among all the animals alive. */
  pTodos: number;
  /** Mean animals (entries) of it alive in one 32 m cell. */
  enCelda: number;
  /** Mean animals (entries) of it alive in the tier's whole view. */
  enVista: number;
  /** Mean different animals of it within `aviso` m of a visitor who walks `minutos` at `velocidad` m/s. */
  vistos: number;
  /** P(at least one seen) = 1 − e^−vistos. */
  pVer: number;
};
export const VISITA_TIPICA = { minutos: 30, velocidad: 1.2, aviso: 12 };

/** The per-species chance table for a context (the maths behind `habitantes`, not a simulation). */
export function probabilidad(tabla: TablaFauna, ctx: CtxProbabilidad, visita: Visita = {}): FilaProbabilidad[] {
  const v = { ...VISITA_TIPICA, ...visita }, fase = faseDelDia(ctx.hora), dens = Math.max(0, Math.min(1, ctx.densidad ?? 1)), niv = ctx.nivel ?? "B";
  const mezcla: Record<Zona, number> = ctx.zona ? { prado: 0, bosque: 0, arena: 0, roca: 0, orilla: 0, [ctx.zona]: 1 } : (ctx.mezcla ?? MEZCLA_TIPICA);
  const barrido = Math.PI * v.aviso ** 2 + 2 * v.aviso * v.velocidad * VENTANA_S, ventanas = v.minutos * 60 / VENTANA_S;
  const filas: FilaProbabilidad[] = [], porGrupo: Record<Grupo, number> = { mariposa: 0, luciernaga: 0, pajaro: 0 };
  for (const g of GRUPOS) {
    const esp = especiesDe(tabla, g, ctx.especies);
    let ref = 0;
    for (const e of esp) ref += e.peso;
    for (const e of esp) {
      let m = 0;
      for (const z of ZONAS) m += mezcla[z] * afinidad(e, z);
      const enCelda = ref > 0 ? FAUNA_POR_NIVEL[niv].celda[g] * OCUPACION * dens * e.peso * actividad(e, fase) * m / ref : 0, vistos = enCelda / (CELDA_M * CELDA_M) * barrido * ventanas;
      porGrupo[g] += enCelda;
      filas.push({ id: e.id, nombre: e.nombre, grupo: g, rareza: e.rareza, pGrupo: 0, pTodos: 0, enCelda, enVista: enCelda * celdasEnVista(niv), vistos, pVer: 1 - Math.exp(-vistos) });
    }
  }
  const todo = porGrupo.mariposa + porGrupo.luciernaga + porGrupo.pajaro;
  for (const f of filas) { f.pGrupo = porGrupo[f.grupo] > 0 ? f.enCelda / porGrupo[f.grupo] : 0; f.pTodos = todo > 0 ? f.enCelda / todo : 0; }
  return filas;
}

/** P(a visitor sees at least one animal of each rarity) in the visit (default: 30 min walking, noticing what is within 12 m). */
export function pVerRareza(tabla: TablaFauna, ctx: CtxProbabilidad, visita: Visita = {}): Record<RarezaFauna, number> {
  const suma: Record<RarezaFauna, number> = { comun: 0, rara: 0, epica: 0, legendaria: 0 };
  for (const f of probabilidad(tabla, ctx, visita)) suma[f.rareza] += f.vistos;
  return { comun: 1 - Math.exp(-suma.comun), rara: 1 - Math.exp(-suma.rara), epica: 1 - Math.exp(-suma.epica), legendaria: 1 - Math.exp(-suma.legendaria) };
}
