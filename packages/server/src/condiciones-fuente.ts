// condiciones/w4 — the community's norms reach the world by themselves. The world says where its community layer comes from, in
// aventura/condiciones.json:   "comunidad": { "fuente": "https://numinia.com/api/community-terms?comunidad=<id>" }
// (or the option / MOTOR_CONDICIONES_FUENTE). The ENGINE pulls: when it starts and then every few minutes it downloads that JSON
// (community-terms-public@1: numinia.com's w3 route), checks the layer with C1's reader, and if it is valid
//   · writes it to aventura/condiciones-comunidad.json (a copy in the world's folder: file over app — the world works with
//     numinia.com down, and the copy is what a person can read, diff and keep), and
//   · puts it on top of the house layer (the gate offers it to whoever arrives from now on; whoever is inside stays inside).
// Failing network, bad JSON, a wrong community or an older publication: said in the log, and the copy (or, with none, the house
// layers + whatever the file wrote by hand) stays in force. Never throws, never blocks the world: the server waits at most a few
// seconds for the FIRST answer, and only when there is no copy yet. No dependencies (Node's fetch); https only (loopback may be http,
// for tests and local worlds); a time-out and a size cap on every answer.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONDICIONES, CONDICIONES_FICHERO, validarCondiciones } from "./condiciones.ts";
import type { Capa, Condiciones } from "./condiciones.ts";

export const COPIA_FORMATO = "condiciones-comunidad@1";
export const COPIA_FICHERO = "condiciones-comunidad.json";
export const RESPUESTA_FORMATO = "community-terms-public@1"; // numinia.com GET /api/community-terms?comunidad=<id> (w3)
/** numinia.com keeps the answer 5 minutes at the edge: asking more often only gets the same text. */
export const INTERVALO_MIN_MS = 5 * 60_000;
export const INTERVALO_POR_DEFECTO_MS = 15 * 60_000;
export const ESPERA_MS = 8_000;           // time-out of one download
export const ESPERA_ARRANQUE_MS = 5_000;  // how long starting the server waits for the first one, when there is no copy
export const RESPUESTA_MAX = 256 * 1024;  // bytes of one answer (20 points × 8000 characters fit)
/** MOTOR_CONDICIONES_FUENTE_MIN: minutes between downloads (never under 5: numinia.com's answer lives 5 minutes at the edge); unset or nonsense = 15. */
export function intervaloDeEntorno(v: string | undefined): number {
  const m = Number((v ?? "").trim());
  return Number.isFinite(m) && m > 0 ? Math.max(INTERVALO_MIN_MS, Math.round(m * 60_000)) : INTERVALO_POR_DEFECTO_MS;
}
const COPIA_MAX = 256 * 1024;

type Registro = (linea: string) => void;
export type Copia = { fuente: string; descargadoEn: string; publicadoEn: string | null; capa: Capa };

/** `true` for https, or for http on this machine (a local test world; numinia.com is https). */
export function fuenteValida(url: unknown): { ok: true; url: string } | { ok: false; motivo: string } {
  if (typeof url !== "string" || !url.trim()) return { ok: false, motivo: "vacía" };
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { ok: false, motivo: "no es una dirección web" }; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return { ok: false, motivo: "tiene que ser https (http solo en esta máquina)" };
  if (u.username || u.password) return { ok: false, motivo: "sin usuario ni contraseña dentro" };
  return { ok: true, url: u.toString() };
}

/** `comunidad.fuente` as written in the world's condiciones.json (the raw file: C1's reader keeps no unknown keys). undefined = none. */
export function fuenteDelFichero(dir: string | null): { fuente?: string; problema?: string } {
  if (!dir) return {};
  let o: { comunidad?: { fuente?: unknown } } | null;
  try { o = JSON.parse(readFileSync(join(dir, CONDICIONES_FICHERO), "utf8")); } catch { return {}; } // no file or broken: C1 already says so
  const c = o?.comunidad;
  if (c === undefined || c === null) return {};
  if (typeof c !== "object" || Array.isArray(c)) return { problema: "comunidad: debe ser { \"fuente\": \"https://…\" }" };
  return c.fuente === undefined ? {} : { fuente: typeof c.fuente === "string" ? c.fuente : "" };
}

/** The community layer of an answer from numinia.com, checked by C1's validator on top of the house layer. `current: null` = nothing published yet. */
export function capaDeRespuesta(r: unknown, casa: Condiciones, fuente?: string): { ok: true; capa: Capa | null; publicadoEn: string | null } | { ok: false; motivo: string } {
  const o = r as { schema?: unknown; ok?: unknown; communityId?: unknown; current?: unknown } | null;
  if (!o || typeof o !== "object" || o.schema !== RESPUESTA_FORMATO || o.ok !== true) return { ok: false, motivo: `no es ${RESPUESTA_FORMATO}` };
  const pedida = fuente ? new URL(fuente).searchParams.get("comunidad") : null;
  if (pedida && o.communityId !== pedida) return { ok: false, motivo: `la respuesta es de otra comunidad (${String(o.communityId)}, no ${pedida})` };
  if (o.current === null) return { ok: true, capa: null, publicadoEn: null };
  const c = o.current as { capa?: unknown; publishedAt?: unknown; nombre?: unknown } & Record<string, unknown>;
  if (!c || typeof c !== "object" || c.capa !== "comunidad") return { ok: false, motivo: "current: no es una capa «comunidad»" };
  const { publishedAt, ...capaSola } = c;
  const v = validarCondiciones({ formato: CONDICIONES, capas: [casa.capas[0], capaSola] });
  if (!v.ok) return { ok: false, motivo: v.issues.map((i) => i.replace(/^capas\[1\]\./, "current.")).join("; ") };
  const hora = typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt)) ? publishedAt : null;
  return { ok: true, capa: v.value.capas[1], publicadoEn: hora };
}

/** The copy in the world's folder, if it is sound and comes from this same source (a copy of another community is not ours). */
export function leerCopia(dir: string | null, casa: Condiciones, fuente: string): { copia: Copia | null; problema?: string } {
  if (!dir) return { copia: null };
  const p = join(dir, COPIA_FICHERO);
  let texto: string;
  try {
    const st = statSync(p);
    if (!st.isFile() || st.size > COPIA_MAX) return { copia: null, problema: `${COPIA_FICHERO}: no es un fichero normal o pesa demasiado` };
    texto = readFileSync(p, "utf8");
  } catch { return { copia: null }; }
  try {
    const o = JSON.parse(texto) as Partial<Copia> & { formato?: unknown };
    if (o.formato !== COPIA_FORMATO) return { copia: null, problema: `${COPIA_FICHERO}: debe ser ${COPIA_FORMATO}` };
    if (o.fuente !== fuente) return { copia: null, problema: `${COPIA_FICHERO}: es de otra fuente (${String(o.fuente)}); no la uso` };
    const v = validarCondiciones({ formato: CONDICIONES, capas: [casa.capas[0], o.capa] });
    if (!v.ok) return { copia: null, problema: `${COPIA_FICHERO}: ${v.issues.join("; ")}` };
    return { copia: { fuente, descargadoEn: String(o.descargadoEn ?? ""), publicadoEn: typeof o.publicadoEn === "string" ? o.publicadoEn : null, capa: v.value.capas[1] } };
  } catch (e) { return { copia: null, problema: `${COPIA_FICHERO}: JSON roto (${(e as Error).message})` }; }
}

/** The house layer + this community layer, the world's own `puerta` kept. */
export const conCapaComunidad = (base: Condiciones, capa: Capa): Condiciones => ({ ...base, capas: [base.capas[0], capa] });

async function descargar(url: string, f: typeof fetch, espera: number): Promise<unknown> {
  const res = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(espera), redirect: "follow" });
  if (!fuenteValida(res.url || url).ok) throw new Error(`redirige a ${res.url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const largo = Number(res.headers.get("content-length"));
  if (Number.isFinite(largo) && largo > RESPUESTA_MAX) throw new Error(`pesa ${largo} bytes (tope ${RESPUESTA_MAX})`);
  const trozos: Uint8Array[] = []; let n = 0;
  if (!res.body) throw new Error("sin cuerpo");
  for await (const t of res.body as unknown as AsyncIterable<Uint8Array>) {
    n += t.byteLength;
    if (n > RESPUESTA_MAX) { await res.body.cancel().catch(() => {}); throw new Error(`pesa más de ${RESPUESTA_MAX} bytes`); }
    trozos.push(t);
  }
  return JSON.parse(Buffer.concat(trozos).toString("utf8"));
}

export type OpcionesFuente = {
  /** the world's aventura/ folder (null = none: nothing is copied, the text is only kept in memory) */
  dir: string | null;
  /** what condiciones.json (or the house example) says: the house layer, the world's own `puerta`… */
  base: Condiciones;
  /** where the community layer comes from; none = this does nothing */
  fuente?: string;
  /** the text in force changed: hand it to the gate */
  poner(c: Condiciones, motivo: "copia" | "nueva"): void;
  log?: Registro;
  /** ms between downloads; the server passes `intervaloDeEntorno(…)` (≥ 5 min), tests pass tiny ones */
  intervaloMs?: number;
  fetch?: typeof fetch;
  ahora?: () => number;
};
export type FuenteCondiciones = {
  activa: boolean;
  /** download now; resolves when done (tests, and the first one at start). Never rejects. */
  actualizar(espera?: number): Promise<"nueva" | "igual" | "fallo" | "vacia">;
  /** the copy was read at start (the world knew a community text before asking) */
  conCopia: boolean;
  parar(): void;
};

/** Read the copy (if any), hand it over, and keep asking `fuente` every `intervaloMs` (≥ 5 min) until `parar()`. */
export function iniciarFuente(o: OpcionesFuente): FuenteCondiciones {
  const log: Registro = o.log ?? (() => {});
  const nada: FuenteCondiciones = { activa: false, actualizar: async () => "fallo", conCopia: false, parar: () => {} };
  if (o.fuente === undefined) return nada;
  const v = fuenteValida(o.fuente);
  if (!v.ok) { log(`[condiciones] fuente de la comunidad no válida (${v.motivo}): no la uso, ${o.dir ? "y sigue la copia si la hay" : "solo la casa"}`); return nada; }
  const fuente = v.url, f = o.fetch ?? fetch, ahora = o.ahora ?? Date.now;
  const intervalo = o.intervaloMs ?? INTERVALO_POR_DEFECTO_MS;
  let en: Capa | null = null, publicadoEn: string | null = null, parado = false, ocupado: Promise<"nueva" | "igual" | "fallo" | "vacia"> | null = null;

  const c = leerCopia(o.dir, o.base, fuente);
  if (c.problema) log(`[condiciones] ${c.problema}`);
  if (c.copia) {
    en = c.copia.capa; publicadoEn = c.copia.publicadoEn;
    o.poner(conCapaComunidad(o.base, en), "copia");
    log(`[condiciones] comunidad ${en.version} de la copia del mundo (${COPIA_FICHERO}, bajada ${c.copia.descargadoEn || "?"})`);
  }

  const uno = async (espera: number): Promise<"nueva" | "igual" | "fallo" | "vacia"> => {
    try {
      const r = capaDeRespuesta(await descargar(fuente, f, espera), o.base, fuente);
      if (!r.ok) { log(`[condiciones] la fuente de la comunidad no vale (${r.motivo}); sigue ${en ? `la ${en.version} de la copia` : "la casa"}`); return "fallo"; }
      if (!r.capa) { log(`[condiciones] la comunidad aún no ha publicado normas (${fuente}); sigue ${en ? `la ${en.version}` : "la casa"}`); return "vacia"; }
      if (en && publicadoEn && r.publicadoEn && Date.parse(r.publicadoEn) < Date.parse(publicadoEn)) { log(`[condiciones] la fuente da una publicación más vieja (${r.publicadoEn}) que la que tengo (${publicadoEn}); la ignoro`); return "igual"; }
      if (en && JSON.stringify(en) === JSON.stringify(r.capa)) return "igual";
      const copia: Copia = { fuente, descargadoEn: new Date(ahora()).toISOString(), publicadoEn: r.publicadoEn, capa: r.capa };
      if (o.dir) {
        try {
          const p = join(o.dir, COPIA_FICHERO), tmp = `${p}.tmp-${process.pid}`;
          mkdirSync(o.dir, { recursive: true });
          writeFileSync(tmp, JSON.stringify({ formato: COPIA_FORMATO, ...copia }, null, 2) + "\n");
          renameSync(tmp, p);
        } catch (e) { log(`[condiciones] no he podido escribir ${COPIA_FICHERO} (${(e as Error).message}); uso las normas igualmente mientras el servidor siga encendido`); }
      }
      const antes = en?.version;
      en = r.capa; publicadoEn = r.publicadoEn;
      o.poner(conCapaComunidad(o.base, en), "nueva");
      log(`[condiciones] normas de la comunidad ${antes ? `${antes} → ` : ""}${en.version} (${en.puntos.length} puntos)${o.dir ? `, copia en ${COPIA_FICHERO}` : ""}`);
      return "nueva";
    } catch (e) {
      log(`[condiciones] no he podido leer la fuente de la comunidad (${(e as Error).message}); sigue ${en ? `la ${en.version} de la copia` : "la casa"}`);
      return "fallo";
    }
  };
  const actualizar = (espera = ESPERA_MS): Promise<"nueva" | "igual" | "fallo" | "vacia"> => (ocupado ??= uno(espera).finally(() => { ocupado = null; }));
  const reloj = setInterval(() => { if (!parado) void actualizar(); }, intervalo);
  reloj.unref();
  return { activa: true, actualizar, conCopia: !!c.copia, parar: () => { parado = true; clearInterval(reloj); } };
}

/** Which source this world uses: the server's option (MOTOR_CONDICIONES_FUENTE; «no» switches it off) wins over what the file says. undefined = none. */
export function elegirFuente(opcion: string | undefined, dir: string | null, log: Registro): string | undefined {
  const o = opcion?.trim();
  if (o !== undefined && o !== "") return ["no", "0", "false"].includes(o.toLowerCase()) ? undefined : o;
  const d = fuenteDelFichero(dir);
  if (d.problema) log(`[condiciones] ${CONDICIONES_FICHERO}: ${d.problema}`);
  return d.fuente;
}
