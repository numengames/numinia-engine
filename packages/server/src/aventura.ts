// aventura (J5): the text files an adventure ships (quests, people, things…), read at startup from AVENTURA_DIR.
// Layout: <dir>/<carpeta>/*.json|*.md|*.txt. Each feature reads its own folders through api.aventura(carpeta) and
// checks them against its format (features/misiones reads misiones/, pnj/, cosas/ and secuencias/). The engine ships an EXAMPLE
// in aventuras/ejemplo/ (the default of `npm run server`); a real adventure lives in its own repository and the
// server is pointed at it. Files are read once per call and never served to pages.
// One file sits at the adventure's root: ficha.json (ficha@1, optional) — what the world is called, one paragraph about
// it and its cover, so the world folder itself says what it is (numinia-archive ADR-074). It travels in the zip like
// the rest of aventura/; the page title and GET /status read it. No ficha = the engine's defaults, as before.
// One folder is the engine's own, agentes/ (agente@1, numinia-archive ADR-080): the outside AIs this world lets in,
// one file per agent with its PUBLIC key (never a private one: the file travels in the zip). server/puerta.ts reads it.
import type { Issue } from "../../core/src/index.ts";
import { AGENTE_ID, MARCA_IA } from "../../instance/src/identidad.ts";
import { clavePublica } from "../../agent/src/llave.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import catalogoAvatares from "../../../activos/avatares/catalogo.json" with { type: "json" };

export const AVENTURA_FICHERO_MAX = 64 * 1024; // bytes per file
export const AVENTURA_FICHEROS_MAX = 500;      // files per folder
export const AVENTURA_CARPETA = /^[a-z0-9][a-z0-9-]{0,31}$/, AVENTURA_NOMBRE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.(json|md|txt)$/;
const CARPETA = AVENTURA_CARPETA, FICHERO = AVENTURA_NOMBRE;

/** A reader over one adventure folder; `null` = no adventure (every folder is empty). */
export function lectorAventura(dir: string | null, log: (l: string) => void = () => {}) {
  return (carpeta: string): { fichero: string; texto: string }[] => {
    if (!dir || !CARPETA.test(carpeta)) return [];
    let nombres: string[];
    try { nombres = readdirSync(join(dir, carpeta)); } catch { return []; } // no such folder: nothing of that kind
    const out: { fichero: string; texto: string }[] = [];
    for (const f of nombres.filter((n) => FICHERO.test(n)).sort().slice(0, AVENTURA_FICHEROS_MAX)) {
      const p = join(dir, carpeta, f);
      try {
        const st = statSync(p);
        if (!st.isFile()) continue;
        if (st.size > AVENTURA_FICHERO_MAX) { log(`[aventura] ${carpeta}/${f}: más de ${AVENTURA_FICHERO_MAX} bytes; no lo leo`); continue; }
        out.push({ fichero: `${carpeta}/${f}`, texto: readFileSync(p, "utf8") });
      } catch (e) { log(`[aventura] ${carpeta}/${f}: ${(e as Error).message}`); }
    }
    return out;
  };
}

export const FICHA = "ficha@1";
export const FICHA_FICHERO = "ficha.json";
export const FICHA_NOMBRE_MAX = 60;        // characters
export const FICHA_DESCRIPCION_MAX = 500;  // characters
/** The cover is a file already on the server by its content (the house library or an upload in datos/activos/, which
 * travels in the zip), named like every other picture of the world (entorno@1 `imagen`): «<sha256>.png|jpg|webp». */
export const FICHA_PORTADA = /^[0-9a-f]{64}\.(png|jpg|webp)$/;

/** H7: the most people a world may ask for in `aforo` (limits.json `world_people_cap`): the engine's own ceiling
 * (startServer maxPlayers, 1000 measured on the dev PC) still applies on top, so a world never raises it, only lowers it. */
export const AFORO_MAX = 1000;
/** H7: the house avatars a world may name as everyone's default (`avatar`): the ids of activos/avatares/catalogo.json. */
export const AVATARES_CASA: readonly string[] = catalogoAvatares.modelos.map((m) => m.id);

/** S6f: lo más que un mundo puede subir el colchón de ambiente (×4 = +12 dB sobre el fichero de −23 LUFS). Lo normal
 *  es NO poner nada: el valor por defecto (×0,042) es el volumen que quiso el autor del fichero. */
export const AMBIENTE_GANANCIA_MAX = 4;
/** S6f: lo más que un mundo puede encender de camas y capas sintetizadas a la vez. */
export const AMBIENTE_SINTETIZADO_MAX = 8;
const ID_SONIDO = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** ficha@1. Fields this engine does not know are kept (a newer one may add some); `notas` is for people.
 * H7 adds `avatar` (a house avatar id everyone wears until players choose their own, row H10) and `aforo` (how many may
 * be inside at once, 1…AFORO_MAX; the next one is refused at the door with a reason).
 * S6f añade `audio` (R-1: UNA línea enciende el sonido de ambiente de este mundo):
 *   - `audio.ambiente`: el id del catálogo de sonidos que suena como CAMA ÚNICA EN BUCLE por streaming (hoy
 *     «ambiente-numinia», el colchón CC0 que cedió un amigo de Numinia). Sin este campo NO suena ningún ambiente.
 *   - `audio.ambiente_ganancia`: su volumen (×). Por defecto ×0,042 (−27,6 dB), que es el nivel original que quiso su
 *     autor; el deslizador de «ambiente» del jugador manda por encima, y a cero el colchón no arranca.
 *   - `audio.ambiente_sintetizado`: las camas y capas SINTETIZADAS que este mundo enciende por nombre. De serie,
 *     ninguna: una receta del bus «ambiente» no suena hasta que un mundo la nombra aquí. */
export type Audio = { ambiente?: string; ambiente_ganancia?: number; ambiente_sintetizado?: string[] };
export type Ficha = { formato: typeof FICHA; nombre: string; descripcion?: string; portada?: string; avatar?: string; aforo?: number; audio?: Audio; [otro: string]: unknown };

const letras = (t: string): number => [...t].length;

/** Check one ficha@1 object: issues with paths, never throws. */
export function validarFicha(o: unknown, donde = FICHA_FICHERO): { ok: true; value: Ficha } | { ok: false; issues: Issue[] } {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, issues: [{ path: donde, message: "un objeto JSON {formato, nombre, descripcion?, portada?}" }] };
  const f = o as Record<string, unknown>, issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path: `${donde}.${path}`, message });
  if (f.formato !== FICHA) bad("formato", `"${FICHA}"`);
  if (typeof f.nombre !== "string" || !f.nombre.trim() || letras(f.nombre) > FICHA_NOMBRE_MAX || /[<>\u0000-\u001f]/.test(f.nombre)) bad("nombre", `texto no vacío de hasta ${FICHA_NOMBRE_MAX} caracteres, sin < > ni saltos de línea`);
  if (f.descripcion !== undefined && (typeof f.descripcion !== "string" || letras(f.descripcion) > FICHA_DESCRIPCION_MAX)) bad("descripcion", `texto de hasta ${FICHA_DESCRIPCION_MAX} caracteres`);
  if (f.portada !== undefined && (typeof f.portada !== "string" || !FICHA_PORTADA.test(f.portada))) bad("portada", "«<sha256>.png|jpg|webp» de una imagen que ya está en el servidor (la biblioteca o datos/activos/, que viaja en el zip)");
  if (f.avatar !== undefined && (typeof f.avatar !== "string" || !AVATARES_CASA.includes(f.avatar))) bad("avatar", `uno de los avatares de la casa: ${AVATARES_CASA.join(", ")}`);
  if (f.aforo !== undefined && (typeof f.aforo !== "number" || !Number.isInteger(f.aforo) || f.aforo < 1 || f.aforo > AFORO_MAX)) bad("aforo", `un número entero de 1 a ${AFORO_MAX} (personas a la vez; limits.json world_people_cap)`);
  // S6f: `audio` — lo que este mundo pide del sonido. Todo opcional; lo que no se dice, no suena.
  if (f.audio !== undefined) {
    if (!f.audio || typeof f.audio !== "object" || Array.isArray(f.audio)) bad("audio", "un objeto {ambiente?, ambiente_ganancia?, ambiente_sintetizado?}");
    else {
      const a = f.audio as Record<string, unknown>;
      if (a.ambiente !== undefined && (typeof a.ambiente !== "string" || !ID_SONIDO.test(a.ambiente))) bad("audio.ambiente", "el id de un sonido del catálogo en bucle (minúsculas, cifras, guiones; p. ej. «ambiente-numinia»)");
      if (a.ambiente_ganancia !== undefined && (typeof a.ambiente_ganancia !== "number" || !Number.isFinite(a.ambiente_ganancia) || a.ambiente_ganancia < 0 || a.ambiente_ganancia > AMBIENTE_GANANCIA_MAX)) bad("audio.ambiente_ganancia", `un número de 0 a ${AMBIENTE_GANANCIA_MAX} (×; sin decir nada, 0.042 = el nivel que quiso el autor del fichero)`);
      if (a.ambiente_sintetizado !== undefined) {
        const xs = a.ambiente_sintetizado;
        if (!Array.isArray(xs) || xs.length > AMBIENTE_SINTETIZADO_MAX || !xs.every((x) => typeof x === "string" && ID_SONIDO.test(x))) bad("audio.ambiente_sintetizado", `hasta ${AMBIENTE_SINTETIZADO_MAX} ids de receta que este mundo enciende (las camas y capas sintetizadas están apagadas de serie)`);
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: { ...f, nombre: (f.nombre as string).trim() } as Ficha };
}

/** The adventure's ficha.json: null when there is none (today's behaviour), the problems when it does not load. */
export function leerFicha(dir: string | null): { ficha: Ficha | null; problemas: string[] } {
  if (!dir) return { ficha: null, problemas: [] };
  const p = join(dir, FICHA_FICHERO);
  let texto: string;
  try {
    const st = statSync(p);
    if (!st.isFile()) return { ficha: null, problemas: [`${FICHA_FICHERO}: no es un fichero`] };
    if (st.size > AVENTURA_FICHERO_MAX) return { ficha: null, problemas: [`${FICHA_FICHERO}: más de ${AVENTURA_FICHERO_MAX} bytes`] };
    texto = readFileSync(p, "utf8");
  } catch { return { ficha: null, problemas: [] }; } // no ficha: the world does not say its name
  let o: unknown;
  try { o = JSON.parse(texto); } catch (e) { return { ficha: null, problemas: [`${FICHA_FICHERO}: JSON roto (${(e as Error).message})`] }; }
  const r = validarFicha(o);
  return r.ok ? { ficha: r.value, problemas: [] } : { ficha: null, problemas: r.issues.map((i) => `${i.path}: ${i.message}`) };
}

// ---------- ficha@1 `tema`: how the world's page looks (an event brings its own colours and title face) ----------
/** The panels' colours a world may set, each «#rrggbb» (apps/plaza/tema-mundo.ts maps them onto the page). */
export const TEMA_COLORES = ["fondo", "superficie", "elevado", "texto", "texto2", "linea", "foco", "accion", "enfasis", "etiqueta"] as const;
/** Title faces the engine ships (apps/plaza/public/fuentes, all SIL OFL 1.1): a world picks one by name, never a file. */
export const TEMA_LETRAS = ["geist", "geist-mono", "bebas-neue"] as const;
/** Buttons with the house's 6 px corners or round ends. */
export const TEMA_FORMAS = ["recta", "pildora"] as const;
export type Tema = { [k in (typeof TEMA_COLORES)[number]]?: string } & {
  titulos?: (typeof TEMA_LETRAS)[number]; sombra?: string; mayusculas?: boolean; forma?: (typeof TEMA_FORMAS)[number];
};
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A ficha's `tema`, value by value: a bad value is left out and said (the rest still applies), unknown keys are
 * ignored (a newer engine may add some), no tema = null (the house look). Never throws. */
export function leerTema(v: unknown): { tema: Tema | null; problemas: string[] } {
  if (v === undefined) return { tema: null, problemas: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return { tema: null, problemas: ["tema: un objeto { fondo, texto, accion…, titulos, sombra, mayusculas, forma }"] };
  const o = v as Record<string, unknown>, tema: Tema = {}, problemas: string[] = [];
  for (const k of TEMA_COLORES) {
    if (o[k] === undefined) continue;
    if (typeof o[k] === "string" && HEX.test(o[k] as string)) tema[k] = (o[k] as string).toLowerCase();
    else problemas.push(`tema.${k}: un color «#rrggbb» (p. ej. «#ff8ebe»)`);
  }
  if (o.titulos !== undefined) {
    if (TEMA_LETRAS.includes(o.titulos as Tema["titulos"] & string)) tema.titulos = o.titulos as Tema["titulos"];
    else problemas.push(`tema.titulos: una de ${TEMA_LETRAS.join(", ")}`);
  }
  if (o.sombra !== undefined) { if (typeof o.sombra === "string" && HEX.test(o.sombra)) tema.sombra = o.sombra.toLowerCase(); else problemas.push("tema.sombra: un color «#rrggbb» (la sombra desplazada de los títulos)"); }
  if (o.mayusculas !== undefined) { if (typeof o.mayusculas === "boolean") tema.mayusculas = o.mayusculas; else problemas.push("tema.mayusculas: true o false"); }
  if (o.forma !== undefined) {
    if (TEMA_FORMAS.includes(o.forma as Tema["forma"] & string)) tema.forma = o.forma as Tema["forma"];
    else problemas.push(`tema.forma: una de ${TEMA_FORMAS.join(", ")}`);
  }
  return { tema: Object.keys(tema).length ? tema : null, problemas };
}

// ---------- agente@1 (ADR-080): an outside AI this world lets in, by its public key ----------
export const AGENTE = "agente@1";
export const AGENTES_CARPETA = "agentes";
export const AGENTE_NOMBRE_MAX = 32;      // bytes: + « · IA» must fit the chat's 48 (like habitante@1)
export const AGENTE_RESPONSABLE_MAX = 80; // bytes
export const AGENTE_NOTAS_MAX = 1000;     // bytes
export const PRESENCIAS = ["a-demanda", "siempre"] as const; // stored now; only informative in this slice
export const ROL_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;          // roles.ts ids

/** agente@1. `clave` = "ed25519:" + base64url of the 32 raw bytes of its PUBLIC key (agent/llave.ts). `rol` = a role id of
 * this world (absent = @todos); whatever the role, an AI only enters and builds (server/roles-mundo.ts). Unknown fields kept. */
export type AgenteExterno = {
  formato: typeof AGENTE; id: string; nombre: string; responsable: string; clave: string;
  rol?: string; presencia?: (typeof PRESENCIAS)[number]; notas?: string; [otro: string]: unknown;
};

const octetos = (t: string): number => new TextEncoder().encode(t).length;
/** Text that looks like a PRIVATE key (PEM, the PKCS#8 bytes of an Ed25519 one, a 64-byte seed + public key) or a
 * provider key: it never goes in a world file, which travels in the zip. */
export function pareceClavePrivada(t: string): boolean {
  if (/PRIVATE/i.test(t) || /-----BEGIN/.test(t) || /\bsk-[A-Za-z0-9]/.test(t) || /MC4CAQAwBQYDK2Vw/.test(t)) return true;
  for (const m of t.matchAll(/[A-Za-z0-9+/_-]{60,}={0,2}/g)) {
    const b = Buffer.from(m[0].replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"), "base64url");
    if (b.length === 64 || b.length === 48) return true; // seed+public (64) or a PKCS#8 Ed25519 key (48)
  }
  return false;
}

/** Check one agente@1 object: issues with paths, never throws. */
export function validarAgente(o: unknown, donde = "agente"): { ok: true; value: AgenteExterno } | { ok: false; issues: Issue[] } {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, issues: [{ path: donde, message: "un objeto JSON {formato, id, nombre, responsable, clave, rol?, presencia?, notas?}" }] };
  const a = o as Record<string, unknown>, issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path: `${donde}.${path}`, message });
  const texto = (k: string, max: number) => typeof a[k] === "string" && (a[k] as string).trim() !== "" && octetos(a[k] as string) <= max && !/[\u0000-\u001f]/.test(a[k] as string);
  if (a.formato !== AGENTE) bad("formato", `"${AGENTE}"`);
  if (typeof a.id !== "string" || !AGENTE_ID.test(a.id)) bad("id", "2–24 caracteres: a-z, 0-9 y guion, empieza por letra");
  if (!texto("nombre", AGENTE_NOMBRE_MAX)) bad("nombre", `texto no vacío de hasta ${AGENTE_NOMBRE_MAX} bytes, sin saltos de línea`);
  else if ((a.nombre as string).trim().endsWith(MARCA_IA.trim()) || /\bIA\b|[<>{}]/.test(a.nombre as string)) bad("nombre", `sin «IA» (el servidor añade «${MARCA_IA.trim()}») ni < > { }`);
  if (!texto("responsable", AGENTE_RESPONSABLE_MAX)) bad("responsable", `quién responde de esta IA (ORG-011): texto no vacío de hasta ${AGENTE_RESPONSABLE_MAX} bytes`);
  if (typeof a.clave === "string" && pareceClavePrivada(a.clave)) bad("clave", "esto parece una clave PRIVADA: aquí va solo la pública (la privada no sale nunca de donde vive el agente)");
  else if (!clavePublica(a.clave)) bad("clave", "la clave PÚBLICA Ed25519 como «ed25519:<43 caracteres base64url>» (node tools/agente.ts nuevo <id> la hace)");
  if (a.rol !== undefined && (typeof a.rol !== "string" || !ROL_ID.test(a.rol))) bad("rol", "el id de un rol de este mundo (minúsculas, cifras y guiones); sin rol = @todos");
  if (a.presencia !== undefined && !PRESENCIAS.includes(a.presencia as never)) bad("presencia", `${PRESENCIAS.map((p) => `"${p}"`).join(" o ")}`);
  if (a.notas !== undefined && (typeof a.notas !== "string" || octetos(a.notas) > AGENTE_NOTAS_MAX)) bad("notas", `texto de hasta ${AGENTE_NOTAS_MAX} bytes`);
  // a private key pasted anywhere else (notas, a field of a newer engine) is refused too
  const textos = (v: unknown, ruta: string): void => {
    if (typeof v === "string") { if (ruta !== "clave" && pareceClavePrivada(v)) bad(ruta, "parece una clave privada o secreta: nunca en el mundo (viaja en el zip)"); }
    else if (Array.isArray(v)) v.forEach((x, i) => textos(x, `${ruta}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) textos(x, ruta ? `${ruta}.${k}` : k);
  };
  textos(a, "");
  return issues.length ? { ok: false, issues } : { ok: true, value: { ...a, nombre: (a.nombre as string).trim(), responsable: (a.responsable as string).trim() } as AgenteExterno };
}

/** Every outside agent of an adventure (its agentes/ files, named <id>.json), the valid ones and what was wrong with the
 * rest. An id that is also an inhabitant (habitantes/) is refused: one id, one kind of AI. */
export function leerAgentes(ficheros: readonly { fichero: string; texto: string }[], habitantes: ReadonlySet<string> = new Set()): { agentes: AgenteExterno[]; problemas: string[] } {
  const agentes: AgenteExterno[] = [], problemas: string[] = [], vistos = new Set<string>();
  for (const f of ficheros) {
    if (!f.fichero.endsWith(".json")) continue;
    let o: unknown;
    try { o = JSON.parse(f.texto); } catch (e) { problemas.push(`${f.fichero}: JSON roto (${(e as Error).message})`); continue; }
    const r = validarAgente(o, f.fichero);
    if (!r.ok) { problemas.push(...r.issues.map((i) => `${i.path}: ${i.message}`)); continue; }
    const id = r.value.id;
    if (f.fichero !== `${AGENTES_CARPETA}/${id}.json`) { problemas.push(`${f.fichero}: el fichero de «${id}» se llama ${AGENTES_CARPETA}/${id}.json`); continue; }
    if (habitantes.has(id)) { problemas.push(`${f.fichero}: «${id}» ya es un habitante (habitantes/${id}.json): un id no puede ser las dos cosas`); continue; }
    if (vistos.has(id)) { problemas.push(`${f.fichero}: id «${id}» repetido`); continue; }
    vistos.add(id); agentes.push(r.value);
  }
  return { agentes, problemas };
}
