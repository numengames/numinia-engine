// mapa-interes (Map v2): the map shows places that matter, not everything that exists. Pure (no DOM): tested in Node.
// A world DECLARES its points of interest in aventura/ficha.json (`mapa.puntos`: name, kind, position; never inferred from
// objects) and which characters are only decoration (`mapa.ocultar.pnj`). The server validates it (leerMapa), serves it in
// /status, and the page draws it. Every marker belongs to a LAYER; the big map's legend switches layers on and off (the
// choice is remembered in the browser), the minimap, the big map and the HTML list all follow the same filter.
import "./mapa-textos.ts"; // the map's words, added to the catalogues when this module loads
import type { Marcador } from "./mapa.ts";

// ---------- points of interest (world data) ----------
/** The kinds of point a world may declare; each has its own icon (shape AND colour) in TIPOS_BASE as `poi-<kind>`. */
export const PUNTO_TIPOS = ["zona", "portal", "pantalla", "info", "agenda"] as const;
export type PuntoTipo = (typeof PUNTO_TIPOS)[number];
export type Punto = { id: string; nombre: string; tipo: PuntoTipo; x: number; z: number; detalle?: string };
/** What a world says about its map: its points of interest and the characters that are only decoration (keys of pnj cards;
 * a trailing «*» matches a prefix, «publico-*»). */
export type MapaMundo = { puntos: Punto[]; ocultar: { pnj: string[] }; estilo?: Estilo };
/** Map v2.2: how the zone is drawn. «pintado» (default) = a painted old map on parchment; «pintado-noche» = the same on basalt;
 * «foto» = the top-down render as it comes (the v2.0 look). */
export const ESTILOS = ["pintado", "pintado-noche", "foto"] as const;
export type Estilo = (typeof ESTILOS)[number];

export const PUNTOS_MAX = 64, PUNTO_NOMBRE_MAX = 60, PUNTO_DETALLE_MAX = 140, OCULTAR_MAX = 64, COORD_MAX = 5000;
const ID_PUNTO = /^[a-z0-9][a-z0-9_.:-]{0,39}$/i, PATRON = /^[a-z0-9][a-z0-9_-]{0,39}\*?$/i, TEXTO_MALO = /[<>\u0000-\u001f]/;

/** The marker kind that draws a declared point. */
export const tipoDePunto = (t: PuntoTipo): string => `poi-${t}`;

/** A ficha's `mapa`, entry by entry: a bad point is left out and said (the rest still applies), unknown keys are ignored
 * (a newer engine may add some), nothing usable = null. Never throws. */
export function leerMapa(v: unknown): { mapa: MapaMundo | null; problemas: string[] } {
  if (v === undefined) return { mapa: null, problemas: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return { mapa: null, problemas: ['mapa: an object { "puntos": [{ nombre, tipo, x, z }], "ocultar": { "pnj": ["publico-*"] } }'] };
  const o = v as Record<string, unknown>, problemas: string[] = [], puntos: Punto[] = [], vistos = new Set<string>(), ocultar: string[] = [];
  if (o.puntos !== undefined) {
    if (!Array.isArray(o.puntos)) problemas.push("mapa.puntos: a list of { nombre, tipo, x, z, detalle? }");
    else {
      if (o.puntos.length > PUNTOS_MAX) problemas.push(`mapa.puntos: at most ${PUNTOS_MAX} points; the rest are left out`);
      o.puntos.slice(0, PUNTOS_MAX).forEach((e, i) => {
        const p = `mapa.puntos[${i}]`;
        if (!e || typeof e !== "object" || Array.isArray(e)) { problemas.push(`${p}: an object { nombre, tipo, x, z }`); return; }
        const q = e as Record<string, unknown>;
        if (typeof q.nombre !== "string" || !q.nombre.trim() || [...q.nombre].length > PUNTO_NOMBRE_MAX || TEXTO_MALO.test(q.nombre)) { problemas.push(`${p}.nombre: text of 1 to ${PUNTO_NOMBRE_MAX} characters, no < > or line breaks`); return; }
        if (!(PUNTO_TIPOS as readonly unknown[]).includes(q.tipo)) { problemas.push(`${p}.tipo: one of ${PUNTO_TIPOS.join(", ")}`); return; }
        const x = q.x, z = q.z;
        if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > COORD_MAX || Math.abs(z) > COORD_MAX) { problemas.push(`${p}: x and z are numbers in metres (within ±${COORD_MAX})`); return; }
        if (q.id !== undefined && (typeof q.id !== "string" || !ID_PUNTO.test(q.id))) { problemas.push(`${p}.id: letters, digits, - _ . : (max 40)`); return; }
        if (q.detalle !== undefined && (typeof q.detalle !== "string" || [...q.detalle].length > PUNTO_DETALLE_MAX || TEXTO_MALO.test(q.detalle))) { problemas.push(`${p}.detalle: text of up to ${PUNTO_DETALLE_MAX} characters`); return; }
        const id = `poi:${typeof q.id === "string" ? q.id : `${q.tipo}-${i}`}`;
        if (vistos.has(id)) { problemas.push(`${p}.id: «${id.slice(4)}» is already used by another point`); return; }
        vistos.add(id);
        puntos.push({ id, nombre: q.nombre.trim(), tipo: q.tipo as PuntoTipo, x, z, ...(typeof q.detalle === "string" && q.detalle.trim() ? { detalle: q.detalle.trim() } : {}) });
      });
    }
  }
  if (o.ocultar !== undefined) {
    const oc = o.ocultar as Record<string, unknown> | null;
    if (!oc || typeof oc !== "object" || Array.isArray(oc)) problemas.push('mapa.ocultar: an object { "pnj": ["publico-*", "paseante-sol"] }');
    else if (oc.pnj !== undefined) {
      if (!Array.isArray(oc.pnj)) problemas.push("mapa.ocultar.pnj: a list of character ids («publico-*» matches a prefix)");
      else for (const k of oc.pnj.slice(0, OCULTAR_MAX)) { if (typeof k === "string" && PATRON.test(k)) ocultar.push(k); else problemas.push(`mapa.ocultar.pnj: «${typeof k === "string" ? k.slice(0, 40) : typeof k}» is not a character id`); }
    }
  }
  let estilo: Estilo | undefined;
  if (o.estilo !== undefined) {
    if ((ESTILOS as readonly unknown[]).includes(o.estilo)) estilo = o.estilo as Estilo;
    else problemas.push(`mapa.estilo: one of ${ESTILOS.join(", ")}`);
  }
  return { mapa: puntos.length || ocultar.length || estilo ? { puntos, ocultar: { pnj: ocultar }, ...(estilo ? { estilo } : {}) } : null, problemas };
}

/** Whether a character key is declared decoration by the world («publico-*» = any key starting with «publico-»). */
export const esDecorativo = (patrones: readonly string[] | undefined, clave: string): boolean =>
  !!patrones?.some((p) => (p.endsWith("*") ? clave.startsWith(p.slice(0, -1)) : clave === p));

/** The marker a declared point draws. */
export const marcadorDePunto = (p: Punto): Marcador => ({ id: p.id, tipo: tipoDePunto(p.tipo), nombre: p.nombre, x: p.x, z: p.z, ...(p.detalle ? { detalle: p.detalle } : {}) });

// ---------- layers: what the filter list switches ----------
export type Capa = { id: string; tipos: readonly string[]; defecto: boolean };
/** The layers = the groups of the filter list («Tracking» of an MMO), in its order: quests, places, portals, screens,
 * information, schedule, people, characters, AI, anything else a world registered, then the quiet ones (off by default:
 * background characters, objects, seats). A marker's own `capa` (seats, decorative characters) wins over its kind's layer.
 * «tu» (you) is never filtered. */
export const CAPAS: readonly Capa[] = [
  { id: "misiones", tipos: ["objetivo", "para-ti", "hecho", "destino"], defecto: true },
  { id: "zonas", tipos: [tipoDePunto("zona")], defecto: true },
  { id: "portales", tipos: [tipoDePunto("portal"), "portal"], defecto: true },
  { id: "pantallas", tipos: [tipoDePunto("pantalla")], defecto: true },
  { id: "info", tipos: [tipoDePunto("info")], defecto: true },
  { id: "agenda", tipos: [tipoDePunto("agenda")], defecto: true },
  { id: "gente", tipos: ["persona"], defecto: true },
  { id: "personajes", tipos: ["npc"], defecto: true },
  { id: "agentes", tipos: ["agente", "agente-dormida"], defecto: true },
  { id: "otros", tipos: [], defecto: true },
  { id: "decorativos", tipos: [], defecto: false },
  { id: "objetos", tipos: ["objeto", "otro", "lugar", "elemento"], defecto: false },
  { id: "asientos", tipos: [], defecto: false },
];
const CAPA_DE_TIPO: ReadonlyMap<string, string> = new Map(CAPAS.flatMap((c) => c.tipos.map((t) => [t, c.id] as const)));
/** The layer of a marker; a kind an adventure registered itself (unknown here) rides with «otros» (on): never hidden by surprise. */
export const capaDe = (m: Pick<Marcador, "tipo" | "capa">): string => m.capa ?? CAPA_DE_TIPO.get(m.tipo) ?? "otros";

export type Capas = Readonly<Record<string, boolean>>;
/** Every layer's switch: the saved choice where there is one, the layer's default otherwise. */
export const capasActivas = (guardado?: Record<string, unknown> | null): Capas => Object.fromEntries(CAPAS.map((c) => [c.id, typeof guardado?.[c.id] === "boolean" ? guardado[c.id] as boolean : c.defecto]));
/** What the map shows: you always, the rest by layer. Returns a new array. */
export const filtrar = (ms: readonly Marcador[], capas: Capas): Marcador[] => ms.filter((m) => m.tipo === "tu" || capas[capaDe(m)] !== false);

/** The filter list: every layer that has something, in the list's order, with its switch, its count and its markers (by
 * name, then id: stable). `ms` is everything the sources gave (shown or not). You are not in the list. A layer with nothing in
 * it is left out (no empty headings). */
export type Grupo = { id: string; activa: boolean; total: number; items: Marcador[] };
export function agrupar(ms: readonly Marcador[], capas: Capas): Grupo[] {
  const por = new Map<string, Marcador[]>();
  for (const m of ms) { if (m.tipo === "tu") continue; const id = capaDe(m); const l = por.get(id); if (l) l.push(m); else por.set(id, [m]); }
  const orden = (a: Marcador, b: Marcador): number => a.nombre.localeCompare(b.nombre, "en") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return CAPAS.filter((c) => por.has(c.id)).map((c) => { const items = por.get(c.id)!.slice().sort(orden); return { id: c.id, activa: (capas[c.id] ?? c.defecto) !== false, total: items.length, items }; });
}

/** Where the choice lives in the browser. */
export const CLAVE_CAPAS = "numinia.mapa.capas";
export const leerCapas = (texto: string | null | undefined): Capas => { try { const v = texto ? JSON.parse(texto) : null; return capasActivas(v && typeof v === "object" && !Array.isArray(v) ? v : null); } catch { return capasActivas(null); } };
/** Only what differs from the defaults is saved (a new default later reaches people who never changed it). */
export const textoCapas = (capas: Capas): string => JSON.stringify(Object.fromEntries(CAPAS.filter((c) => (capas[c.id] ?? c.defecto) !== c.defecto).map((c) => [c.id, capas[c.id]])));

// ---------- the big map opens on the places, not on your feet ----------
/** A view (centre in m, px per metre) that holds you and every point in a w × h canvas with `margen` px around; null when
 * there is nothing to fit. `min`/`max`: px per metre limits (the labels stay readable, the zone stays whole). */
export function encuadre(pts: readonly { x: number; z: number }[], ancho: number, alto: number, margen = 40, min = 0.8, max = 6): { cx: number; cz: number; escala: number } | null {
  if (!pts.length || !(ancho > 2 * margen) || !(alto > 2 * margen)) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const e = Math.min((ancho - 2 * margen) / Math.max(1, x1 - x0), (alto - 2 * margen) / Math.max(1, z1 - z0));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, escala: Math.max(min, Math.min(max, e)) };
}
