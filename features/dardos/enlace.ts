// dardos enlazados (E1) — the SETTING, in one place. Entering AR in ANY Numinia world shows the darts board of the Alchemist
// Tower (a `remoto` board on that world's server), stitched to the people playing there: the page opens a second, light connection
// to that server for the darts only (apps/plaza/dardos-enlace.ts). This file is the data and the rules, with no DOM and no network:
//   · `ENLACE_DARDOS`: where the link goes by default (the engine's, one line); a world may change it or turn it off in its dardos.json
//     (`"enlace": { "servidor": "wss://…/ws", "diana": "torre" }`, or `"enlace": false`), see `leerEnlace`;
//   · `enlaceVigente`: what a page does with it — a world never links to itself, and a world with its own board that takes remote
//     duels (`duelo` + `remoto`: what the AR wall joins) uses that one, as always.
// Recipe: docs/EXTENDER.md «Dardos enlazados».

export type EnlaceDardos = { servidor: string; diana: string };

/** The house link: the Alchemist Tower's server and the id of its remote board (dardos.json of the Tower: `torre`, `remoto: true`). */
export const ENLACE_DARDOS: Readonly<EnlaceDardos> = Object.freeze({ servidor: "wss://alchemiststower.numinia.com/ws", diana: "torre" });

/** The board ids dardos.json accepts (the same rule as the server's `crearDardos`). */
const ID_DIANA = /^[a-z0-9-]{1,16}$/;
const URL_MAX = 200;

export type Problema = { path: string; message: string };
export type Lectura = { ok: true; value: EnlaceDardos | null; origen: "casa" | "mundo" | "apagado" } | { ok: false; issues: Problema[]; value: EnlaceDardos | null; origen: "casa" };

/** A server address a page may open: `ws://` or `wss://`, a host, optional port, a path; no credentials, no query, no fragment. null = it is not one. */
export function leerServidor(v: unknown): URL | null {
  if (typeof v !== "string" || v.length === 0 || v.length > URL_MAX) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "ws:" && u.protocol !== "wss:") return null;
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null;
  return u;
}

/**
 * The `enlace` of a world's dardos.json (the whole parsed file, or undefined without one) → what to use.
 *  · no file / no `enlace` key → the house link (`origen: "casa"`);
 *  · `"enlace": false` → off (`value: null`, `origen: "apagado"`); `true` / null → the house link;
 *  · `"enlace": { servidor?, diana? }` → each missing part is the house's; a wrong part is said (`issues`) and the house value stays.
 * Never throws; a wrong setting falls back to the house link so a typo cannot silently turn a feature off.
 */
export function leerEnlace(crudo: unknown): Lectura {
  const c = crudo && typeof crudo === "object" ? (crudo as { enlace?: unknown }) : null;
  if (!c || !("enlace" in c) || c.enlace === undefined || c.enlace === null || c.enlace === true) return { ok: true, value: { ...ENLACE_DARDOS }, origen: "casa" };
  if (c.enlace === false) return { ok: true, value: null, origen: "apagado" };
  const issues: Problema[] = [];
  const e = c.enlace;
  if (typeof e !== "object" || Array.isArray(e)) return { ok: false, issues: [{ path: "enlace", message: "debe ser false o un objeto { servidor, diana }" }], value: { ...ENLACE_DARDOS }, origen: "casa" };
  const o = e as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== "servidor" && k !== "diana") issues.push({ path: `enlace.${k}`, message: "campo desconocido (solo servidor y diana)" });
  let servidor = ENLACE_DARDOS.servidor, diana = ENLACE_DARDOS.diana;
  if ("servidor" in o) {
    const u = leerServidor(o.servidor);
    if (u) servidor = String(o.servidor); else issues.push({ path: "enlace.servidor", message: "debe ser una dirección ws:// o wss:// con la ruta del servidor (p. ej. wss://mundo.example/ws), sin usuario, parámetros ni #" });
  }
  if ("diana" in o) {
    if (typeof o.diana === "string" && ID_DIANA.test(o.diana)) diana = o.diana; else issues.push({ path: "enlace.diana", message: "debe ser el id de una diana: 1-16 caracteres a-z, 0-9 o guion" });
  }
  return issues.length ? { ok: false, issues, value: { servidor, diana }, origen: "casa" } : { ok: true, value: { servidor, diana }, origen: "mundo" };
}

/** Host (with port) of a server address, in lower case, to compare two: `ws://127.0.0.1:8913/ws` → `127.0.0.1:8913`. "" if it is not one. */
export const anfitrionDe = (servidor: string): string => leerServidor(servidor)?.host.toLowerCase() ?? "";

/** The part of a board the rules look at (the shared state of features/dardos). */
export type SitioEnlace = { duelo?: boolean; remoto?: boolean };

/** Does this world have a board of its own that an AR wall can join in a duel (what `elegirSitioAR` picks)? */
export const tieneDianaPropia = (sitios: readonly SitioEnlace[]): boolean => sitios.some((s) => s.duelo === true && s.remoto === true);

/**
 * What this page does with the world's link: the link to open, or null (+ why) — no link, the world IS the linked one, or it has its own
 * AR-capable board (the AR button then works as it always has).
 * `ajuste`: what the server says (/status `dardosEnlace`): undefined = an older server that said nothing → the house link; null = off.
 * `servidorActual`: the address of the server this page talks to (so a world never links to itself).
 */
export function enlaceVigente(o: { ajuste: EnlaceDardos | null | undefined; servidorActual: string; sitios: readonly SitioEnlace[] }): { enlace: EnlaceDardos | null; motivo: "ok" | "apagado" | "mismo-servidor" | "diana-propia" | "invalido" } {
  const ajuste = o.ajuste === undefined ? { ...ENLACE_DARDOS } : o.ajuste;
  if (!ajuste) return { enlace: null, motivo: "apagado" };
  const u = leerServidor(ajuste.servidor);
  if (!u || !ID_DIANA.test(String(ajuste.diana))) return { enlace: null, motivo: "invalido" };
  if (u.host.toLowerCase() === anfitrionDe(o.servidorActual)) return { enlace: null, motivo: "mismo-servidor" };
  if (tieneDianaPropia(o.sitios)) return { enlace: null, motivo: "diana-propia" };
  return { enlace: { servidor: ajuste.servidor, diana: ajuste.diana }, motivo: "ok" };
}

/** Read what /status said about the link (`dardosEnlace`): undefined (not there) stays undefined, false/null = off, a good object = it; anything else = off. */
export function ajusteDeEstado(v: unknown): EnlaceDardos | null | undefined {
  if (v === undefined) return undefined;
  if (v && typeof v === "object") { const o = v as Record<string, unknown>; if (leerServidor(o.servidor) && typeof o.diana === "string" && ID_DIANA.test(o.diana)) return { servidor: String(o.servidor), diana: o.diana }; }
  return null;
}

/** Where the guest token of a linked server is kept: one per server host, so the Tower knows you as the same guest between visits. */
export const claveInvitado = (servidor: string): string => `numinia.invitado@${anfitrionDe(servidor)}`;
