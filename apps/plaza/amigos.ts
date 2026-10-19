// amigos (ux2-gente): your friends list, kept IN THIS BROWSER (localStorage `numinia.amigos`). Pablo, 17-10, camino A:
// presence of now, no account — a friends list saved on the server waits for the identity decision, so this one lives
// only here: another browser or a private window starts empty, and the panel says so in small print. A friend is keyed by
// the tag of their identity the server sends with «Gente» (features/teletransporte huellaDe: the same on every visit and
// in every world, the identity itself cannot be read from it); only when there is none (an older server), by name.
// The same small store keeps whom you muted (`numinia.silenciados`: their voice, only for you) and blocked
// (`numinia.bloqueados`: the server's /bloquear does the blocking; this only remembers the mark). Pure functions; the page
// reads and writes localStorage around them (apps/plaza/gente.ts).

export const CLAVE_AMIGOS = "numinia.amigos";
export const CLAVE_SILENCIADOS = "numinia.silenciados";
export const CLAVE_BLOQUEADOS = "numinia.bloqueados";
/** Friends one browser keeps (the oldest seen goes first beyond this). */
export const AMIGOS_MAX = 200;
const NOMBRE_MAX = 64;

/** Someone you know: their key, the name and avatar you last saw them with, since when they are your friend, last seen. */
export type Amigo = { clave: string; nombre: string; avatar: string | null; desde: number; visto: number };
/** Someone connected now, as the page knows them (the «Gente» list, the names over heads). */
export type Conectado = { quien: number; nombre: string; huella?: string; avatar?: string | null };

/** Names compared the way people type them: no accents, no case, spaces collapsed. */
export const normal = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** The key of a person: their identity's tag when the server gave one, else their name. */
export const claveDe = (p: { huella?: string; nombre: string }): string => (p.huella ? `h:${p.huella}` : `n:${normal(p.nombre)}`);

const texto = (v: unknown, max = NOMBRE_MAX): string => (typeof v === "string" ? v.slice(0, max) : "");
/** The list as stored (any junk, an old shape or nothing → what can be kept of it; never throws). */
export function leerAmigos(guardado: string | null): Amigo[] {
  let v: unknown;
  try { v = JSON.parse(guardado ?? "[]"); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>(), out: Amigo[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const clave = texto(x?.clave, 80), nombre = texto(x?.nombre);
    if (!/^[hn]:./.test(clave) || !nombre || vistos.has(clave)) continue;
    vistos.add(clave);
    const desde = Number(x.desde), visto = Number(x.visto);
    out.push({ clave, nombre, avatar: texto(x.avatar, 40) || null, desde: Number.isFinite(desde) ? desde : 0, visto: Number.isFinite(visto) ? visto : 0 });
  }
  return out.slice(0, AMIGOS_MAX);
}
export const escribirAmigos = (lista: readonly Amigo[]): string => JSON.stringify(lista);

export const esAmigo = (lista: readonly Amigo[], p: { huella?: string; nombre: string }): boolean => !!buscar(lista, p);
/** The friend this person is: by their tag, or (a friend saved by name before the server sent tags) by name. */
export function buscar(lista: readonly Amigo[], p: { huella?: string; nombre: string }): Amigo | undefined {
  const k = claveDe(p);
  return lista.find((a) => a.clave === k) ?? lista.find((a) => a.clave === `n:${normal(p.nombre)}`);
}

/** Add someone (once). Beyond AMIGOS_MAX the one seen longest ago leaves. */
export function anadir(lista: readonly Amigo[], p: Conectado, ahora: number): Amigo[] {
  if (esAmigo(lista, p)) return [...lista];
  const nueva = [...lista, { clave: claveDe(p), nombre: p.nombre.slice(0, NOMBRE_MAX), avatar: p.avatar ?? null, desde: ahora, visto: ahora }];
  while (nueva.length > AMIGOS_MAX) nueva.splice(nueva.reduce((m, a, i) => (a.visto < nueva[m].visto ? i : m), 0), 1);
  return nueva;
}
export const quitar = (lista: readonly Amigo[], clave: string): Amigo[] => lista.filter((a) => a.clave !== clave);

export type Fusion = {
  /** Friends connected now, with who they are now, by name. */
  conectados: { amigo: Amigo; persona: Conectado }[];
  /** Friends not here, the most recently seen first. */
  desconectados: Amigo[];
  /** The list with «last seen», name and avatar brought up to date (and a friend saved by name moved to their tag). */
  lista: Amigo[];
  /** Whether `lista` differs from what came in (the page writes it back only then). */
  cambio: boolean;
};
/** Your friends against who is connected now. */
export function fusionar(lista: readonly Amigo[], conectados: readonly Conectado[], ahora: number): Fusion {
  let cambio = false;
  const ahoraAqui: Fusion["conectados"] = [], usados = new Set<string>();
  const nueva = lista.map((a) => {
    const p = conectados.find((c) => c.huella && a.clave === `h:${c.huella}`) ?? conectados.find((c) => a.clave === `n:${normal(c.nombre)}`);
    if (!p || usados.has(String(p.quien))) return a;
    usados.add(String(p.quien));
    const b: Amigo = { ...a, clave: p.huella ? `h:${p.huella}` : a.clave, nombre: p.nombre.slice(0, NOMBRE_MAX), avatar: p.avatar ?? a.avatar, visto: ahora };
    if (b.clave !== a.clave || b.nombre !== a.nombre || b.avatar !== a.avatar || ahora - a.visto > 60_000) cambio = true;
    else b.visto = a.visto; // «visto» is written at most once a minute: no storage write every refresh
    ahoraAqui.push({ amigo: b, persona: p });
    return b;
  });
  const enLinea = new Set(ahoraAqui.map((x) => x.amigo.clave));
  return {
    conectados: ahoraAqui.sort((x, y) => x.amigo.nombre.localeCompare(y.amigo.nombre, "es")),
    desconectados: nueva.filter((a) => !enLinea.has(a.clave)).sort((x, y) => y.visto - x.visto || x.nombre.localeCompare(y.nombre, "es")),
    lista: nueva, cambio,
  };
}

/** Who matches what you type in the search box (no accents, no case; empty = everybody). */
export const filtrar = <T extends { nombre: string }>(xs: readonly T[], q: string): T[] => {
  const k = normal(q);
  return k ? xs.filter((x) => normal(x.nombre).includes(k)) : [...xs];
};

/** «hace un momento», «hace 5 min», «hace 3 h», «hace 2 días», «hace 3 meses» (never a date nobody reads). */
export function haceTexto(desde: number, ahora: number): string {
  const s = Math.max(0, (ahora - desde) / 1000);
  if (!desde || s < 60) return desde ? "hace un momento" : "sin ver todavía";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 60) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  return `hace ${Math.floor(d / 30)} meses`;
}
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «3 de octubre» (and the year when it is not this one). Local time. */
export function fechaTexto(ms: number, ahora: number): string {
  const f = new Date(ms), h = new Date(ahora);
  return `${f.getDate()} de ${MESES[f.getMonth()]}${f.getFullYear() !== h.getFullYear() ? ` de ${f.getFullYear()}` : ""}`;
}
/** «a 12 m» from metres (rounded; under 2 m, «a tu lado»). */
export const distanciaTexto = (m: number): string => (m < 2 ? "a tu lado" : `a ${Math.round(m)} m`);

/** A set of keys as stored (muted, blocked): key -> the name it had, never throws. */
export function leerMarcas(guardado: string | null): Map<string, string> {
  try {
    const v = JSON.parse(guardado ?? "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return new Map();
    return new Map(Object.entries(v as Record<string, unknown>).filter(([k, n]) => /^[hn]:./.test(k) && typeof n === "string").slice(0, AMIGOS_MAX) as [string, string][]);
  } catch { return new Map(); }
}
export const escribirMarcas = (m: ReadonlyMap<string, string>): string => JSON.stringify(Object.fromEntries(m));
